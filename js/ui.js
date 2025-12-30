/**
 * UI Manager for Web Voice Client
 * 負責所有 DOM 操作和 UI 渲染
 */

class UIManager {
    constructor() {
        // DOM 元素快取
        this.elements = {
            loginView: document.getElementById('login-view'),
            chatView: document.getElementById('chat-view'),
            loginForm: document.getElementById('login-form'),
            usernameInput: document.getElementById('username'),
            passwordInput: document.getElementById('password'),
            loginBtn: document.getElementById('login-btn'),
            loginError: document.getElementById('login-error'),
            messages: document.getElementById('messages'),
            statusBar: document.getElementById('status-bar'),
            statusText: document.getElementById('status-text'),
            callTimer: document.getElementById('call-timer'),
            callBtn: document.getElementById('call-btn'),
            hangupBtn: document.getElementById('hangup-btn'),
            userInfo: document.getElementById('user-info')
        };

        // 訊息緩存 (用於更新佔位訊息)
        this.messageElements = new Map();

        // 當前 AI 訊息元素
        this.currentAIMessageEl = null;
    }

    /**
     * 初始化 UI
     */
    init() {
        // 確保所有元素存在
        if (!this.elements.loginView || !this.elements.chatView) {
            console.error('Required DOM elements not found');
            return false;
        }
        return true;
    }

    /**
     * 顯示登入視圖
     */
    showLoginView() {
        this.elements.loginView?.classList.remove('hidden');
        this.elements.chatView?.classList.add('hidden');
    }

    /**
     * 顯示通話視圖
     */
    showChatView() {
        this.elements.loginView?.classList.add('hidden');
        this.elements.chatView?.classList.remove('hidden');
    }

    /**
     * 顯示登入錯誤
     */
    showLoginError(message) {
        if (this.elements.loginError) {
            this.elements.loginError.textContent = message;
            this.elements.loginError.classList.remove('hidden');
        }
    }

    /**
     * 隱藏登入錯誤
     */
    hideLoginError() {
        if (this.elements.loginError) {
            this.elements.loginError.classList.add('hidden');
        }
    }

    /**
     * 更新使用者資訊顯示
     */
    updateUserInfo(userInfo) {
        if (this.elements.userInfo && userInfo) {
            this.elements.userInfo.textContent = userInfo.name || userInfo.sub || '使用者';
        }
    }

    /**
     * 更新狀態列
     */
    updateStatus(state) {
        const statusMap = {
            'idle': { text: '待機中', class: 'status-idle' },
            'connecting': { text: '連接中...', class: 'status-connecting' },
            'connected': { text: '已連接', class: 'status-connected' },
            'listening': { text: '聆聽中...', class: 'status-listening' },
            'responding': { text: 'AI 回應中...', class: 'status-responding' },
            'waiting': { text: '請稍候...', class: 'status-waiting' },
            'processing': { text: '處理中...', class: 'status-processing' },
            'disconnected': { text: '已斷線', class: 'status-disconnected' },
            'failed': { text: '連線失敗', class: 'status-failed' }
        };

        const info = statusMap[state] || { text: state, class: '' };

        if (this.elements.statusText) {
            this.elements.statusText.textContent = info.text;
        }

        if (this.elements.statusBar) {
            this.elements.statusBar.className = `status-bar ${info.class}`;
        }
    }

    /**
     * 更新通話按鈕狀態
     */
    updateCallButtons(isConnected) {
        if (this.elements.callBtn) {
            this.elements.callBtn.disabled = isConnected;
            this.elements.callBtn.classList.toggle('hidden', isConnected);
        }
        if (this.elements.hangupBtn) {
            this.elements.hangupBtn.disabled = !isConnected;
            this.elements.hangupBtn.classList.toggle('hidden', !isConnected);
        }
    }

    /**
     * 更新通話計時器
     */
    updateCallTimer(seconds) {
        if (this.elements.callTimer) {
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            this.elements.callTimer.textContent = `${mins}:${secs}`;
        }
    }

    /**
     * 新增訊息到對話區
     */
    addMessage(text, isUser, itemId = null) {
        const msgEl = document.createElement('div');
        msgEl.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
        msgEl.textContent = text;

        if (itemId) {
            msgEl.dataset.itemId = itemId;
            this.messageElements.set(itemId, msgEl);
        }

        this.elements.messages?.appendChild(msgEl);
        this.scrollToBottom();

        // 如果是 AI 訊息，保存引用以供更新
        if (!isUser) {
            this.currentAIMessageEl = msgEl;
        }

        return msgEl;
    }

    /**
     * 更新訊息內容 (用於 STT 佔位和 AI 串流)
     */
    updateMessage(itemId, text) {
        const msgEl = this.messageElements.get(itemId);
        if (msgEl) {
            msgEl.textContent = text;
            this.scrollToBottom();
        }
    }

    /**
     * 更新當前 AI 訊息 (串流更新)
     */
    updateCurrentAIMessage(text) {
        if (this.currentAIMessageEl) {
            this.currentAIMessageEl.textContent = text;
            this.scrollToBottom();
        } else {
            this.addMessage(text, false);
        }
    }

    /**
     * 完成當前 AI 訊息 (準備下一條)
     */
    finalizeAIMessage() {
        this.currentAIMessageEl = null;
    }

    /**
     * 清除所有訊息
     */
    clearMessages() {
        if (this.elements.messages) {
            this.elements.messages.innerHTML = '';
        }
        this.messageElements.clear();
        this.currentAIMessageEl = null;
    }

    /**
     * 滾動到底部
     */
    scrollToBottom() {
        if (this.elements.messages) {
            this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
        }
    }

    /**
     * 顯示 Toast 訊息
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 顯示報修確認卡片
     */
    showRepairConfirmCard(data) {
        const card = document.createElement('div');
        card.className = 'message ai-message repair-card';
        card.innerHTML = `
            <div class="repair-card-title">📋 報修確認</div>
            <div class="repair-card-field">
                <span class="label">設備：</span>
                <span class="value">${data.EQMT_NM || data.device || '未指定'}</span>
            </div>
            <div class="repair-card-field">
                <span class="label">問題：</span>
                <span class="value">${data.EQMT_FAIL_CNTNT || data.problem || '未描述'}</span>
            </div>
            <div class="repair-card-field">
                <span class="label">申請人：</span>
                <span class="value">${data.EQMT_APLEMP_NM || '未指定'}</span>
            </div>
        `;

        this.elements.messages?.appendChild(card);
        this.scrollToBottom();
    }
}

// 全域實例
const ui = new UIManager();

// 匯出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UIManager, ui };
}
