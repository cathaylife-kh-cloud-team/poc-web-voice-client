/**
 * Main Application Entry Point
 * Web Voice Client 主程式
 */

// ============================================
// 配置
// ============================================
const CONFIG = {
    API_BASE_URL: 'http://localhost:8080',
    MOCK_MODE: false,    // false = 使用真實 WebRTC
    GUEST_MODE: true,    // true = 跳過登入
    DEBUG: true
};

// ============================================
// 全域狀態
// ============================================
let webrtcManager = null;
let eventHandler = null;
let callTimerInterval = null;
let callSeconds = 0;

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
    currentState = newState;
    ui.updateStatus(newState);

    // 更新按鈕狀態
    const isConnected = [AppState.CONNECTED, AppState.LISTENING, AppState.RESPONDING, AppState.WAITING].includes(newState);
    ui.updateCallButtons(isConnected);
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

    // 檢查登入狀態（Guest Mode 跳過登入）
    if (CONFIG.GUEST_MODE || apiService.isLoggedIn()) {
        const userInfo = CONFIG.GUEST_MODE
            ? { name: '訪客' }
            : apiService.getUserInfo();
        ui.updateUserInfo(userInfo);
        ui.showChatView();
        setState(AppState.IDLE);
    } else {
        ui.showLoginView();
    }

    // 綁定事件
    bindEvents();

    console.log('✅ Web Voice Client initialized');
});

// ============================================
// 事件綁定
// ============================================
function bindEvents() {
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
            onMCPCall: handleMCPCall
        });

        // 初始化 WebRTC 管理器
        webrtcManager = new WebRTCManager({
            apiBaseUrl: CONFIG.API_BASE_URL,
            debug: CONFIG.DEBUG,
            onEvent: (event) => eventHandler.processEvent(event),
            onStateChange: handleWebRTCState,
            onError: handleWebRTCError
        });

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
    handleHangup();
    apiService.logout();
    ui.clearMessages();
    ui.showLoginView();
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
    }
}

function handleUserTranscript(data) {
    if (data.type === 'placeholder') {
        ui.addMessage(data.text, true, data.itemId);
    } else if (data.type === 'complete') {
        ui.updateMessage(data.itemId, data.text);
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
        ui.showRepairConfirmCard(data.data);
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
