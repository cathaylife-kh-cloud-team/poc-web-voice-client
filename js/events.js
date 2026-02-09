/**
 * Event Handler for DataChannel Events
 * 對應 iOS 的 WebRTCObservable.processEvent()
 */

class EventHandler {
    constructor(options = {}) {
        this.onAIMessage = options.onAIMessage || (() => { });
        this.onUserTranscript = options.onUserTranscript || (() => { });
        this.onStateChange = options.onStateChange || (() => { });
        this.onRepairForm = options.onRepairForm || (() => { });
        this.onDeviceList = options.onDeviceList || (() => { });
        this.onRepairComplete = options.onRepairComplete || (() => { });  // 新增: MCP 建單完成
        this.onUserInfo = options.onUserInfo || (() => { });  // 新增: 使用者資訊卡片
        this.onMCPCall = options.onMCPCall || (() => { });
        this.onMusicControl = options.onMusicControl || { play: () => { }, stop: () => { } };  // 新增: 音樂控制

        // 內部狀態
        this.currentAIMessage = '';
        this.aiIsTyping = false;
        this.mcpInProgress = false;  // 新增: MCP 進行中 flag

        // STT 競態條件處理
        this.pendingUserItemIds = new Map(); // itemId -> timeout handle
        this.pendingAIMessages = [];

        // Debug
        this.debug = options.debug || false;
    }

    log(...args) {
        if (this.debug) {
            console.log('[Events]', ...args);
        }
    }

    /**
     * 處理 DataChannel 事件
     * @param {object} event - 解析後的 JSON 事件
     */
    processEvent(event) {
        const type = event.type;
        if (!type) return;

        // Log 重要事件（排除 delta 避免洗版）
        if (!type.includes('.delta')) {
            this.log('Event:', type);
        }

        switch (type) {
            // ============================================
            // AI 語音轉錄事件
            // ============================================
            case 'response.output_audio_transcript.delta':
                // AI 語音轉錄增量
                if (event.delta) {
                    this.currentAIMessage += event.delta;
                    this.aiIsTyping = true;
                    this.onAIMessage({
                        type: 'update',
                        text: this.currentAIMessage,
                        isTyping: true
                    });
                }
                break;

            case 'response.output_audio_transcript.done':
                // AI 語音轉錄完成
                if (event.transcript) {
                    console.log('📝 [AI_TRANSCRIPT_DONE]', event.transcript);
                    this.currentAIMessage = event.transcript;
                    this.onAIMessage({
                        type: 'complete',
                        text: event.transcript,
                        isTyping: false
                    });
                }
                break;

            case 'response.output_audio.done':
                // AI 語音播放完成
                this.currentAIMessage = '';
                this.aiIsTyping = false;
                this.onStateChange('listening');
                break;

            // ============================================
            // 使用者語音輸入事件
            // ============================================
            case 'input_audio_buffer.speech_started':
                // 使用者開始說話
                if (event.item_id) {
                    console.log('🎙️ [SPEECH_STARTED]', event.item_id);

                    // ★ Audio Ducking: 停止等候音樂
                    this.onMusicControl.stop();
                    this.onStateChange('listening');

                    // 建立佔位訊息
                    this.onUserTranscript({
                        type: 'placeholder',
                        itemId: event.item_id,
                        text: '...'
                    });

                    // 設定 5 秒超時
                    const timeout = setTimeout(() => {
                        console.warn('⚠️ [TIMEOUT]', event.item_id);
                        this.pendingUserItemIds.delete(event.item_id);
                        this.onUserTranscript({
                            type: 'timeout',
                            itemId: event.item_id,
                            text: '[語音未識別]'
                        });
                        this.processPendingAIMessages();
                    }, 5000);

                    this.pendingUserItemIds.set(event.item_id, timeout);
                }
                break;

            case 'conversation.item.input_audio_transcription.completed':
                // 使用者語音轉錄完成
                if (event.transcript) {
                    const itemId = event.item_id;
                    console.log('🎤 [STT_DONE]', `"${event.transcript}"`, itemId);

                    // 清除超時計時器
                    if (itemId && this.pendingUserItemIds.has(itemId)) {
                        clearTimeout(this.pendingUserItemIds.get(itemId));
                        this.pendingUserItemIds.delete(itemId);
                    }

                    // 更新佔位訊息
                    this.onUserTranscript({
                        type: 'complete',
                        itemId: itemId,
                        text: event.transcript
                    });

                    // 處理待處理的 AI 訊息
                    this.processPendingAIMessages();
                }
                break;

            // ============================================
            // MCP 工具調用事件
            // ============================================
            case 'response.mcp_call.in_progress':
                console.log('🔔 [MCP] In progress');
                this.mcpInProgress = true;  // 啟用 flag
                this.onMCPCall({ type: 'start' });
                this.onStateChange('processing');
                break;

            case 'response.mcp_call.completed':
                console.log('✅ [MCP] Completed');
                this.mcpInProgress = false;
                this.onMusicControl.stop();
                this.onMCPCall({ type: 'complete' });
                break;

            case 'output_audio_buffer.stopped':
                // 音訊緩衝停止 - MCP 進行中才播放等候音樂
                if (this.mcpInProgress) {
                    this.onMusicControl.play();
                }
                this.onStateChange('waiting');
                break;

            // ============================================
            // Function Call 事件（報修表單）
            // ============================================
            case 'response.function_call_arguments.done':
                this.handleFunctionCall(event);
                break;

            case 'response.done':
                // 回應完成，停止音樂並檢查是否有 function call
                this.onMusicControl.stop();
                if (event.response && event.response.output) {
                    event.response.output.forEach(item => {
                        if (item.type === 'function_call') {
                            this.handleFunctionCall(item);
                        }
                    });
                }
                break;

            // ============================================
            // MCP Tool 結果 (conversation.item.done)
            // ============================================
            case 'conversation.item.done':
                this.handleMCPResult(event);
                break;

            default:
                // 其他事件可視需要處理
                break;
        }
    }

    /**
     * 處理 Function Call（報修表單資料）
     */
    handleFunctionCall(event) {
        const name = event.name;
        let args = event.arguments;

        // 解析 arguments JSON
        if (typeof args === 'string') {
            try {
                args = JSON.parse(args);
            } catch (e) {
                console.error('Failed to parse function arguments:', e);
                return;
            }
        }

        console.log('🔧 [FUNCTION_CALL]', name, args);

        if (name === 'repair_ticket') {
            // 報修單資料
            this.onRepairForm({
                type: 'update',
                data: args
            });
        } else if (name === 'query_user_equipments') {
            // 設備列表查詢結果
            if (args.items) {
                this.onDeviceList({
                    type: 'list',
                    devices: args.items
                });
            }
        }
    }

    /**
     * 處理待處理的 AI 訊息
     */
    processPendingAIMessages() {
        if (this.pendingAIMessages.length > 0) {
            this.pendingAIMessages.forEach(msg => {
                this.onAIMessage({
                    type: 'complete',
                    text: msg,
                    isTyping: false
                });
            });
            this.pendingAIMessages = [];
        }
    }

    /**
     * 處理 MCP Tool 結果 (conversation.item.done)
     */
    handleMCPResult(event) {
        const item = event.item;
        if (!item || item.type !== 'mcp_call') return;

        let output = {};
        try {
            output = typeof item.output === 'string'
                ? JSON.parse(item.output)
                : (item.output || {});
        } catch (e) {
            console.warn('Failed to parse MCP output:', e);
            return;
        }

        const name = item.name;
        console.log('🛠️ [MCP_RESULT]', name, output);

        if (name === 'query_user_equipments') {
            // 設備清單 - 做 mapping
            const devices = (output.items || []).map((d, i) => ({
                index: i,
                id: d.ASST_SER_NO,
                name: d.EQMT_KIND_NM,
                model: d.MCHN_MDL,
                serial: d.MCHN_SRLNO,
                status: d.EQMT_STATUS_NM,
                warranty: d.HW_QNTE_ENDDT,
                vendor: d.MATN_DIV_NM,
                unit: d.MATN_DIV,
                custodian: d.CTDN_NM
            }));
            this.onDeviceList({ type: 'list', devices });
        }
        else if (name === 'query_user_info') {
            // 使用者資訊 - 顯示結構化卡片
            if (output.found && output.userInfo) {
                this.onUserInfo({ type: 'info', data: output.userInfo });
            }
        }
        else if (name === 'create_equipment_repair_form') {
            // 建單完成 - 檢查成功/失敗
            const isSuccess = output.orderNo && !output.apiStatus?.includes('ERROR');
            this.onRepairComplete({
                success: isSuccess,
                orderNo: output.orderNo,
                status: output.apiStatus,
                message: output.apiMessage
            });
        }
    }
}

// 匯出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventHandler;
}
