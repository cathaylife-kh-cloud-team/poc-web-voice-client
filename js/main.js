/**
 * Main Application Entry Point
 * Web Voice Client 主程式
 */

// ============================================
// 環境配置
// ============================================
const ENVIRONMENTS = {
    prod: {
        name: 'GCP (Prod)',
        apiBaseUrl: 'https://api.ai.hotline.dasl.cloud'
    },
    local: {
        name: 'Local',
        apiBaseUrl: 'http://localhost:8080'
    }
};

// 從 localStorage 或 URL 參數讀取環境設定
function getInitialEnv() {
    // 優先使用 URL 參數 ?env=local 或 ?env=prod
    const urlParams = new URLSearchParams(window.location.search);
    const envParam = urlParams.get('env');
    if (envParam && ENVIRONMENTS[envParam]) {
        return envParam;
    }
    // 其次使用 localStorage
    const savedEnv = localStorage.getItem('voiceClientEnv');
    if (savedEnv && ENVIRONMENTS[savedEnv]) {
        return savedEnv;
    }
    // 預設使用 prod
    return 'prod';
}

const currentEnv = getInitialEnv();

// ============================================
// 配置
// ============================================
const CONFIG = {
    API_BASE_URL: ENVIRONMENTS[currentEnv].apiBaseUrl,
    MOCK_MODE: false,
    DEBUG: true,
    ENV: currentEnv
};

// ============================================
// 全域狀態
// ============================================
let webrtcManager = null;
let eventHandler = null;
let callTimerInterval = null;
let callSeconds = 0;

// Conversation state
let currentConversation = null;
let isReadOnlyMode = false;

// ============================================
// 應用程式狀態
// ============================================
const AppState = {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    LISTENING: 'listening',
    RESPONDING: 'responding',
    WAITING: 'waiting',
    DISCONNECTED: 'disconnected'
};

let currentState = AppState.IDLE;

function setState(newState) {
    const wasInCall = isInCall();
    currentState = newState;
    ui.updateStatus(newState);

    // 更新按鈕狀態
    const isConnected = [AppState.CONNECTED, AppState.LISTENING, AppState.RESPONDING, AppState.WAITING].includes(newState);
    const isConnecting = newState === AppState.CONNECTING;
    ui.updateCallButtons(isConnected, isConnecting);

    // 更新波形狀態
    if (newState === AppState.LISTENING) {
        ui.setWaveformState('listening');
    } else if (newState === AppState.RESPONDING) {
        ui.setWaveformState('responding');
    } else if (isConnected) {
        ui.setWaveformState('listening');
    } else {
        ui.setWaveformState('hidden');
    }

    // 通話狀態變更時，更新歷史面板的清除按鈕狀態
    const nowInCall = isInCall();
    if (wasInCall !== nowInCall && !ui.elements.historyPanel?.classList.contains('hidden')) {
        refreshHistoryList();
    }
}

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Web Voice Client initializing...');

    // 初始化 UI
    if (!ui.init()) {
        console.error('Failed to initialize UI');
        return;
    }

    // 初始化 API Service
    apiService.baseUrl = CONFIG.API_BASE_URL;

    // 檢查登入狀態
    if (apiService.isLoggedIn()) {
        ui.updateUserInfo(apiService.getUserInfo());
        ui.showChatView();
        setState(AppState.IDLE);
    } else {
        ui.showLoginView();
    }

    // 綁定事件
    bindEvents();

    // 頁面關閉保護
    setupPageCloseProtection();

    console.log('✅ Web Voice Client initialized');
});

// ============================================
// 事件綁定
// ============================================
function bindEvents() {
    // 環境選擇器
    const envSelector = document.getElementById('env-selector');
    if (envSelector) {
        envSelector.value = CONFIG.ENV;
        envSelector.addEventListener('change', (e) => {
            localStorage.setItem('voiceClientEnv', e.target.value);
            window.location.reload();
        });
    }

    // 登入表單
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // 開始通話按鈕
    const callBtn = document.getElementById('call-btn');
    if (callBtn) {
        callBtn.addEventListener('click', handleStartCall);
    }

    // 掛斷按鈕
    const hangupBtn = document.getElementById('hangup-btn');
    if (hangupBtn) {
        hangupBtn.addEventListener('click', handleHangup);
    }

    // 登出按鈕
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // ========== History Panel Events ==========

    // 新對話按鈕
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', handleNewChat);
    }

    // 歷史按鈕
    const historyBtn = document.getElementById('history-btn');
    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            ui.toggleHistoryPanel(true);
            refreshHistoryList();
        });
    }

    // 關閉歷史面板
    const historyCloseBtn = document.getElementById('history-close-btn');
    if (historyCloseBtn) {
        historyCloseBtn.addEventListener('click', () => ui.toggleHistoryPanel(false));
    }

    // 歷史面板 Overlay
    const historyOverlay = document.getElementById('history-overlay');
    if (historyOverlay) {
        historyOverlay.addEventListener('click', () => ui.toggleHistoryPanel(false));
    }

    // 清除全部按鈕
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', handleClearHistory);
    }

    // 歷史列表點擊事件 (事件代理)
    const historyList = document.getElementById('history-list');
    if (historyList) {
        historyList.addEventListener('click', (e) => {
            // 刪除按鈕
            if (e.target.classList.contains('history-item-delete')) {
                e.stopPropagation();
                const id = e.target.dataset.id;
                handleDeleteConversation(id);
                return;
            }

            // 點擊歷史項目
            const historyItem = e.target.closest('.history-item');
            if (historyItem) {
                const id = historyItem.dataset.id;
                handleLoadConversation(id);
            }
        });
    }
}

// ============================================
// 登入處理
// ============================================
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username')?.value;
    const password = document.getElementById('password')?.value;

    if (!username || !password) {
        ui.showLoginError('請輸入帳號和密碼');
        return;
    }

    ui.hideLoginError();
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.disabled = true;

    try {
        await apiService.login(username, password);
        const userInfo = apiService.getUserInfo();
        ui.updateUserInfo(userInfo);
        ui.showChatView();
        setState(AppState.IDLE);
    } catch (error) {
        ui.showLoginError(error.message);
    } finally {
        if (loginBtn) loginBtn.disabled = false;
    }
}

// ============================================
// 開始通話
// ============================================
async function handleStartCall() {
    if (currentState !== AppState.IDLE && currentState !== AppState.DISCONNECTED) {
        console.warn('Already in call or connecting');
        return;
    }

    // 離開唯讀模式
    if (isReadOnlyMode) {
        _startNewChat();
    }

    // 建立新對話
    currentConversation = {
        id: generateConversationId(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title: '',
        messages: []
    };

    setState(AppState.CONNECTING);

    // Mock Mode
    if (CONFIG.MOCK_MODE) {
        handleMockCall();
        return;
    }

    try {
        // 初始化事件處理器
        eventHandler = new EventHandler({
            debug: CONFIG.DEBUG,
            onAIMessage: handleAIMessage,
            onUserTranscript: handleUserTranscript,
            onStateChange: handleStateChange,
            onRepairForm: handleRepairForm,
            onDeviceList: handleDeviceList,
            onRepairComplete: handleRepairComplete,
            onMCPCall: handleMCPCall,
            onMusicControl: {
                play: () => playHoldMusic(),
                stop: () => stopHoldMusic()
            }
        });

        // 初始化 WebRTC 管理器
        webrtcManager = new WebRTCManager({
            apiBaseUrl: CONFIG.API_BASE_URL,
            debug: CONFIG.DEBUG,
            onEvent: (event) => eventHandler.processEvent(event),
            onStateChange: handleWebRTCState,
            onError: handleWebRTCError
        });

        // Safari Fix: 在使用者點擊事件中預先啟動 Audio Context
        webrtcManager.prepareAudio();

        // 取得 token (雖然目前 permitAll，但保持架構一致)
        const token = apiService.getToken() || '';

        // 開始連線
        await webrtcManager.connect(token);

    } catch (error) {
        console.error('Failed to start call:', error);
        // Toast 由 handleWebRTCError 處理，避免重複
        setState(AppState.IDLE);
    }
}

// ============================================
// 掛斷通話
// ============================================
function handleHangup() {
    // 強制儲存當前對話
    conversationStorage.flush();

    if (webrtcManager) {
        webrtcManager.disconnect();
    }
    stopCallTimer();
    setState(AppState.DISCONNECTED);
    ui.showToast('通話已結束', 'info');
}

// ============================================
// 登出
// ============================================
function handleLogout() {
    confirmIfInCall(() => {
        conversationStorage.flush();
        handleHangup();
        conversationStorage.clear();  // 清除所有歷史
        apiService.logout();
        ui.clearMessages();
        ui.showLoginView();
    });
}

// ============================================
// WebRTC 狀態處理
// ============================================
function handleWebRTCState(state) {
    console.log('WebRTC state:', state);

    switch (state) {
        case 'connected':
        case 'completed':
            setState(AppState.LISTENING);
            startCallTimer();
            break;
        case 'disconnected':
        case 'failed':
        case 'closed':
            stopHoldMusic();
            ui.setWaveformState('hidden');
            setState(AppState.DISCONNECTED);
            stopCallTimer();
            ui.showToast('連線已中斷', 'error');
            break;
        case 'connecting':
            setState(AppState.CONNECTING);
            break;
    }
}

function handleWebRTCError(error) {
    console.error('WebRTC error:', error);

    if (error.name === 'NotAllowedError') {
        ui.showToast('無法存取麥克風，請檢查權限設定', 'error');
    } else if (error.name === 'NotFoundError') {
        ui.showToast('找不到麥克風裝置', 'error');
    } else {
        ui.showToast(`連線錯誤: ${error.message}`, 'error');
    }

    setState(AppState.IDLE);
}

// ============================================
// 事件處理器回調
// ============================================
function handleAIMessage(data) {
    if (data.type === 'update') {
        ui.updateCurrentAIMessage(data.text);
        setState(AppState.RESPONDING);
    } else if (data.type === 'complete') {
        ui.updateCurrentAIMessage(data.text);
        ui.finalizeAIMessage();

        // 儲存 complete 訊息到對話
        if (currentConversation) {
            currentConversation.messages.push({
                role: 'ai',
                text: data.text,
                timestamp: Date.now()
            });
            currentConversation.updatedAt = Date.now();
            conversationStorage.save(currentConversation);
        }
    }
}

function handleUserTranscript(data) {
    if (data.type === 'placeholder') {
        ui.addMessage(data.text, true, data.itemId);
    } else if (data.type === 'complete') {
        ui.updateMessage(data.itemId, data.text);

        // 儲存 complete 訊息到對話 + 設定標題
        if (currentConversation) {
            currentConversation.messages.push({
                role: 'user',
                text: data.text,
                timestamp: Date.now()
            });

            // 標題生成：第一句 complete user transcript
            if (!currentConversation.title) {
                currentConversation.title = data.text.slice(0, 30);
            }

            currentConversation.updatedAt = Date.now();
            conversationStorage.save(currentConversation);
        }
    } else if (data.type === 'timeout') {
        ui.updateMessage(data.itemId, data.text);
    }
}

function handleStateChange(state) {
    if (state === 'listening') {
        setState(AppState.LISTENING);
    } else if (state === 'waiting' || state === 'processing') {
        setState(AppState.WAITING);
    } else if (state === 'responding') {
        setState(AppState.RESPONDING);
    }
}

function handleRepairForm(data) {
    if (data.type === 'update') {
        ui.showRepairConfirmCard(data.data, () => {
            // 確認送出報修
            webrtcManager.sendTextToAI('確認送出報修');
        });

        // 儲存卡片到對話 (upsert by cardId)
        if (currentConversation) {
            const cardId = currentConversation.id + '_repair';
            const existingIndex = currentConversation.messages.findIndex(
                m => m.role === 'card' && m.cardId === cardId
            );

            const cardMessage = {
                role: 'card',
                cardId: cardId,
                data: data.data,
                timestamp: Date.now()
            };

            if (existingIndex >= 0) {
                currentConversation.messages[existingIndex] = cardMessage;
            } else {
                currentConversation.messages.push(cardMessage);
            }

            currentConversation.updatedAt = Date.now();
            conversationStorage.save(currentConversation);
        }
    }
}

function handleDeviceList(data) {
    if (data.type === 'list') {
        ui.showDeviceListCard(data.devices, (device) => {
            const displayIndex = device.index + 1;
            webrtcManager.sendTextToAI(
                `我選擇第 ${displayIndex} 台，財產編號 ${device.id}`
            );
        });
    }
}

function handleRepairComplete(data) {
    stopHoldMusic();
    if (data.success) {
        ui.showRepairSuccess(data.orderNo, data.message);
    } else {
        ui.showToast(data.message || '建單失敗', 'error');
    }
}

function handleMCPCall(data) {
    if (data.type === 'start') {
        setState(AppState.WAITING);
    } else if (data.type === 'complete') {
        // 等待 AI 繼續回應
    }
}

// ============================================
// 等候音樂控制
// ============================================
let holdMusicElement = null;

function playHoldMusic() {
    if (!holdMusicElement) {
        holdMusicElement = document.getElementById('hold-music');
    }
    if (holdMusicElement) {
        holdMusicElement.currentTime = 0;
        holdMusicElement.play().catch(e => console.warn('Hold music play failed:', e));
    }
}

function stopHoldMusic() {
    if (holdMusicElement) {
        holdMusicElement.pause();
        holdMusicElement.currentTime = 0;
    }
}

// ============================================
// 通話計時器
// ============================================
function startCallTimer() {
    callSeconds = 0;
    ui.updateCallTimer(0);

    callTimerInterval = setInterval(() => {
        callSeconds++;
        ui.updateCallTimer(callSeconds);
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
}

// ============================================
// Mock Mode (無需後端測試)
// ============================================
function handleMockCall() {
    console.log('🎭 Mock mode enabled');

    setTimeout(() => {
        setState(AppState.LISTENING);
        startCallTimer();

        // 模擬 AI 歡迎語
        setTimeout(() => {
            setState(AppState.RESPONDING);
            ui.addMessage('您好，我是 AI 客服助理。請問有什麼可以幫您的嗎？', false);

            setTimeout(() => {
                setState(AppState.LISTENING);
            }, 1000);
        }, 1500);
    }, 1000);
}

// ============================================
// 對話管理
// ============================================

/**
 * 生成唯一對話 ID
 */
function generateConversationId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 檢查是否在通話中
 */
function isInCall() {
    return [AppState.CONNECTED, AppState.LISTENING, AppState.RESPONDING, AppState.WAITING].includes(currentState);
}

/**
 * 通話中確認提示
 * @param {Function} action - 確認後執行的動作
 */
function confirmIfInCall(action) {
    if (isInCall()) {
        if (confirm('通話進行中，確定要離開嗎？')) {
            action();
        }
    } else {
        action();
    }
}

/**
 * 內部開新對話 (不經 confirm)
 */
function _startNewChat() {
    ui.clearMessages();
    currentConversation = null;
    isReadOnlyMode = false;
    ui.setReadOnlyMode(false);
    setState(AppState.IDLE);
}

/**
 * 開新對話 (使用者觸發，需 confirm)
 */
function handleNewChat() {
    confirmIfInCall(() => {
        if (isInCall()) {
            handleHangup();
        }
        conversationStorage.flush();
        _startNewChat();
        ui.toggleHistoryPanel(false);
    });
}

/**
 * 載入歷史對話
 */
function handleLoadConversation(id) {
    confirmIfInCall(() => {
        if (isInCall()) {
            handleHangup();
        }
        conversationStorage.flush();

        const conversation = conversationStorage.getById(id);
        if (!conversation) {
            ui.showToast('對話不存在', 'error');
            _startNewChat();
            return;
        }

        currentConversation = conversation;
        isReadOnlyMode = true;

        ui.clearMessages();
        ui.renderConversation(conversation);
        ui.setReadOnlyMode(true);
        ui.toggleHistoryPanel(false);
    });
}

/**
 * 刪除對話
 */
function handleDeleteConversation(id) {
    const isCurrentConversation = currentConversation && currentConversation.id === id;

    if (isCurrentConversation && isInCall()) {
        // 通話中刪除當前對話
        confirmIfInCall(() => {
            handleHangup();
            conversationStorage.delete(id);
            _startNewChat();
            refreshHistoryList();
        });
    } else {
        // 唯讀模式刪除當前檢視 或 刪除其他
        conversationStorage.delete(id);

        if (isCurrentConversation) {
            _startNewChat();
        }

        refreshHistoryList();
    }
}

/**
 * 清除全部歷史
 */
function handleClearHistory() {
    // 通話中再次檢查
    if (isInCall()) {
        ui.showToast('通話中無法清除歷史', 'error');
        return;
    }

    if (confirm('確定要清除所有對話歷史嗎？')) {
        conversationStorage.clear();
        refreshHistoryList();

        // 如果正在檢視歷史，回到新對話狀態
        if (isReadOnlyMode) {
            _startNewChat();
        }
    }
}

/**
 * 重新整理歷史列表
 */
function refreshHistoryList() {
    const conversations = conversationStorage.getAll();
    ui.renderHistoryList(conversations, { isInCall: isInCall() });
}

/**
 * 設定頁面關閉保護
 */
function setupPageCloseProtection() {
    window.addEventListener('beforeunload', () => {
        webrtcManager?.disconnect();
        conversationStorage.flush();
    });

    window.addEventListener('pagehide', () => {
        webrtcManager?.disconnect();
        conversationStorage.flush();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            conversationStorage.flush();
        }
    });
}
