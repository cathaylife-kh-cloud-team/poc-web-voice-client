/**
 * WebRTC Manager for Voice Client
 * 負責 WebRTC 連線、SDP 交換、DataChannel 管理
 */

class WebRTCManager {
    constructor(options = {}) {
        this.onEvent = options.onEvent || (() => { });
        this.onStateChange = options.onStateChange || (() => { });
        this.onError = options.onError || console.error;

        this.peerConnection = null;
        this.dataChannel = null;
        this.localStream = null;
        this.remoteAudioTrack = null;
        this.remoteAudio = document.getElementById('remote-audio');  // 取得 DOM 中的 audio 元素

        // 若找不到元素（例如舊版 HTML），退回到 new Audio()，但這在 Safari 可能有問題
        if (!this.remoteAudio) {
            this.remoteAudio = new Audio();
            this.remoteAudio.playsInline = true;
            this.remoteAudio.autoplay = true;
        }

        // API 端點設定
        this.apiBaseUrl = options.apiBaseUrl || 'http://localhost:8080';

        // Debug 模式
        this.debug = options.debug || false;
    }

    log(...args) {
        if (this.debug) {
            console.log('[WebRTC]', ...args);
        }
    }

    /**
     * 準備音訊播放 (必須在使用者點擊事件中呼叫)
     * 解鎖 Safari/Mobile 的 AudioContext
     */
    prepareAudio() {
        if (this.remoteAudio) {
            this.remoteAudio.play().catch(e => {
                // 預期會失敗（因為沒有 src），但這足以解鎖 autoplay
                this.log('Audio warm-up (expected):', e);
            });
        }

        // 預熱等候音樂 (for Safari/iOS)
        const holdMusic = document.getElementById('hold-music');
        if (holdMusic) {
            holdMusic.play().then(() => {
                holdMusic.pause();
                holdMusic.currentTime = 0;
            }).catch(e => {
                this.log('Hold music warm-up (expected):', e);
            });
        }
    }

    /**
     * 開始 WebRTC 連線
     * @param {string} apiToken - API 認證 Token
     */
    async connect(apiToken) {
        try {
            this.onStateChange('connecting');

            // 1. 取得麥克風權限
            this.log('Requesting microphone access...');
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            this.log('Microphone access granted');

            // 2. 建立 PeerConnection
            this.peerConnection = new RTCPeerConnection({
                iceServers: [] // OpenAI 不需要 STUN/TURN
            });

            // 監聽 ICE 連線狀態
            this.peerConnection.oniceconnectionstatechange = () => {
                const state = this.peerConnection.iceConnectionState;
                this.log('ICE connection state:', state);
                this.onStateChange(state);
            };

            // 監聽遠端音訊軌
            this.peerConnection.ontrack = (event) => {
                console.log('[WebRTC] Received remote track:', event.track.kind, event.track);
                if (event.track.kind === 'audio') {
                    this.remoteAudioTrack = event.track;
                    
                    event.track.onunmute = () => {
                        console.log('[WebRTC] Track unmuted - audio data flowing');
                        console.log('[WebRTC] Audio element state:', {
                            srcObject: this.remoteAudio?.srcObject,
                            paused: this.remoteAudio?.paused,
                            volume: this.remoteAudio?.volume,
                            muted: this.remoteAudio?.muted,
                            readyState: this.remoteAudio?.readyState
                        });
                    };
                    event.track.onmute = () => {
                        console.log('[WebRTC] Track muted');
                    };
                    event.track.onended = () => {
                        console.log('[WebRTC] Track ended');
                    };
                    
                    console.log('[WebRTC] Remote audio element:', this.remoteAudio);
                    console.log('[WebRTC] Track muted state:', event.track.muted);
                    if (this.remoteAudio) {
                        const stream = new MediaStream([event.track]);
                        this.remoteAudio.srcObject = stream;
                        this.remoteAudio.volume = 1.0;
                        this.remoteAudio.muted = false;
                        console.log('[WebRTC] Set srcObject, stream tracks:', stream.getTracks());
                        console.log('[WebRTC] Attempting play...');
                        this.remoteAudio.play()
                            .then(() => {
                                console.log('[WebRTC] Audio playback started!');
                                console.log('[WebRTC] After play - paused:', this.remoteAudio.paused, 'currentTime:', this.remoteAudio.currentTime);
                            })
                            .catch(e => console.error('[WebRTC] Audio play failed:', e));
                    }
                }
            };

            // 3. 加入本地音訊軌
            this.localStream.getAudioTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // 4. 建立 DataChannel
            this.dataChannel = this.peerConnection.createDataChannel('oai-events', {
                ordered: true
            });

            this.dataChannel.onopen = () => {
                this.log('DataChannel opened');
            };

            this.dataChannel.onclose = () => {
                this.log('DataChannel closed');
            };

            this.dataChannel.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.onEvent(data);
                } catch (e) {
                    this.log('Failed to parse DataChannel message:', e);
                }
            };

            // 5. 建立 Offer
            this.log('Creating offer...');
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true
            });

            // 6. 設定 Local Description
            await this.peerConnection.setLocalDescription(offer);
            this.log('Local description set');

            // 7. 發送 SDP 到後端
            this.log('Sending SDP to server...');
            const response = await fetch(`${this.apiBaseUrl}/realtime/v1/calls`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/sdp',
                    'Authorization': `Bearer ${apiToken}`
                },
                body: offer.sdp
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${await response.text()}`);
            }

            const responseBody = await response.json();
            const answerSdp = responseBody.data ?? responseBody;
            this.log('Received answer SDP');

            // 8. 設定 Remote Description
            await this.peerConnection.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp
            });
            this.log('Remote description set');

        } catch (error) {
            this.onError(error);
            this.onStateChange('failed');
            throw error;
        }
    }

    /**
     * 中斷連線
     */
    disconnect() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // 清理遠端音訊
        if (this.remoteAudio) {
            this.remoteAudio.pause();
            this.remoteAudio.srcObject = null;
            this.remoteAudio = null;
        }
        this.remoteAudioTrack = null;

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.onStateChange('disconnected');
    }

    /**
     * 透過 DataChannel 發送事件
     * @param {object|string} event - 要發送的事件
     */
    sendEvent(event) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.warn('DataChannel is not open, cannot send event');
            return false;
        }

        const message = typeof event === 'string' ? event : JSON.stringify(event);
        this.dataChannel.send(message);
        return true;
    }

    /**
     * 發送文字訊息給 AI
     * @param {string} text - 要發送的文字
     */
    sendTextToAI(text) {
        const event = {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{
                    type: 'input_text',
                    text: text
                }]
            }
        };

        this.sendEvent(event);

        // 觸發 AI 回應
        this.sendEvent({ type: 'response.create' });
    }

    /**
     * 控制遠端音訊（靜音/取消靜音）
     * @param {boolean} enabled - true 為啟用，false 為靜音
     */
    setRemoteAudioEnabled(enabled) {
        if (this.remoteAudio) {
            this.remoteAudio.muted = !enabled;
        }
    }
}

// 匯出供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebRTCManager;
}
