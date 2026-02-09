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
            userInfo: document.getElementById('user-info'),
            // History panel elements
            newChatBtn: document.getElementById('new-chat-btn'),
            historyBtn: document.getElementById('history-btn'),
            historyPanel: document.getElementById('history-panel'),
            historyOverlay: document.getElementById('history-overlay'),
            historyList: document.getElementById('history-list'),
            historyCloseBtn: document.getElementById('history-close-btn'),
            clearHistoryBtn: document.getElementById('clear-history-btn'),
            readOnlyBanner: document.getElementById('read-only-banner'),
            // UI Enhancements
            waveform: document.getElementById('waveform'),
            waveformContainer: document.getElementById('waveform-container'),
            holdMusic: document.getElementById('hold-music')
        };

        // 訊息緩存 (用於更新佔位訊息)
        this.messageElements = new Map();

        // 當前 AI 訊息元素
        this.currentAIMessageEl = null;

        // 波形動畫控制
        this.waveformInterval = null;
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
    updateCallButtons(isConnected, isConnecting = false) {
        if (this.elements.callBtn) {
            this.elements.callBtn.disabled = isConnected || isConnecting;
            this.elements.callBtn.classList.toggle('hidden', isConnected);
            this.elements.callBtn.classList.toggle('connecting', isConnecting);
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

    showUserTypingIndicator(itemId) {
        const msgEl = document.createElement('div');
        msgEl.className = 'message user-message';
        msgEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        
        if (itemId) {
            msgEl.dataset.itemId = itemId;
            this.messageElements.set(itemId, msgEl);
        }
        
        this.elements.messages?.appendChild(msgEl);
        this.scrollToBottom();
        return msgEl;
    }

    showAITypingIndicator() {
        const existing = document.querySelector('.ai-typing-indicator');
        if (existing) return existing;
        
        const msgEl = document.createElement('div');
        msgEl.className = 'message ai-message ai-typing-indicator';
        msgEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        
        this.elements.messages?.appendChild(msgEl);
        this.scrollToBottom();
        return msgEl;
    }

    hideAITypingIndicator() {
        const existing = document.querySelector('.ai-typing-indicator');
        if (existing) {
            existing.remove();
        }
    }

    replaceTypingIndicator(itemId, text) {
        const msgEl = this.messageElements.get(itemId);
        if (msgEl) {
            msgEl.textContent = text;
            this.scrollToBottom();
        }
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
    /**
     * 顯示報修確認卡片
     */
    showRepairConfirmCard(data, onConfirm = null) {
        const card = document.createElement('div');
        card.className = 'message ai-message repair-card';
        card.innerHTML = `
            <div class="repair-card-title">📋 報修確認</div>
            <div class="repair-card-field">
                <span class="label">設備：</span>
                <span class="value">${data.EQMT_KIND_NM || data.device_type || '未指定'}</span>
            </div>
            <div class="repair-card-field">
                <span class="label">問題：</span>
                <span class="value">${data.EQMT_PRB_DESC || data.problem_desc || '未描述'}</span>
            </div>
            <div class="repair-card-field">
                <span class="label">申請人：</span>
                <span class="value">${data.EQMT_APLEMP_NM || data.reporter_name || '未指定'}</span>
            </div>
            <div class="repair-card-actions">
                <button class="action-btn confirm-btn">確認送出報修</button>
            </div>
        `;

        if (onConfirm) {
            const btn = card.querySelector('.confirm-btn');
            if (btn) {
                btn.onclick = () => {
                    btn.disabled = true;
                    btn.textContent = '已送出';
                    onConfirm();
                };
            }
        } else {
            // 唯讀模式 (歷史紀錄回放)
            const btn = card.querySelector('.confirm-btn');
            if (btn) btn.remove();
        }

        this.elements.messages?.appendChild(card);
        this.scrollToBottom();
    }

    /**
     * 顯示設備清單卡片
     * @param {Array} devices 
     * @param {Function} onSelect 
     */
    showDeviceListCard(devices, onSelect) {
        const card = document.createElement('div');
        card.className = 'message ai-message device-list-card';

        const listHtml = devices.map(d => `
            <div class="device-item" data-id="${d.id}" data-index="${d.index}">
                <div class="device-header">
                    <span class="device-name">${d.name}</span>
                    <span class="device-status ${d.status === '正常' ? 'status-ok' : 'status-warn'}">${d.status}</span>
                </div>
                <div class="device-details">
                    <div>財產編號：${d.id}</div>
                    <div>機型：${d.model}</div>
                    <div>機號：${d.serial}</div>
                    <div>廠商：${d.vendor || '-'}</div>
                    <div>單位：${d.unit || '-'}</div>
                    <div class="device-custodian">保管人：${d.custodian || '-'}</div>
                    <div class="device-warranty">保固：${d.warranty || '-'}</div>
                </div>
                <button class="device-select-btn">選擇此設備</button>
            </div>
        `).join('');

        card.innerHTML = `
            <div class="device-list-title">📱 請選擇報修設備</div>
            <div class="device-list-content">${listHtml}</div>
        `;

        // 綁定事件
        if (onSelect) {
            card.querySelectorAll('.device-select-btn').forEach((btn, i) => {
                btn.onclick = () => {
                    // 禁用所有按鈕
                    card.querySelectorAll('button').forEach(b => b.disabled = true);
                    btn.textContent = '已選擇';
                    btn.classList.add('selected');
                    onSelect(devices[i], i);
                };
            });
        }

        this.elements.messages?.appendChild(card);
        this.scrollToBottom();
    }

    /**
     * 顯示報修成功訊息
     */
    showRepairSuccess(orderNo, message) {
        const msgEl = document.createElement('div');
        msgEl.className = 'message ai-message repair-success';
        msgEl.innerHTML = `
            <div class="success-icon">✅</div>
            <div class="success-title">報修完成</div>
            <div class="success-order">单号：${orderNo}</div>
            <div class="success-message">${message}</div>
        `;
        this.elements.messages?.appendChild(msgEl);
        this.scrollToBottom();
    }

    /**
     * 顯示使用者資訊卡片（STEP 2 確認）
     * @param {Object} userInfo - MCP query_user_info 回傳的 userInfo 物件
     */
    showUserInfoCard(userInfo) {
        const fields = [
            { label: '申報人ID', key: 'EQMT_APLEMP_ID' },
            { label: '姓名', key: 'EQMT_APLEMP_NM' },
            { label: '單位地址', key: 'DIV_ADRS' },
            { label: '單位電話', key: 'EQMT_APLDIV_TLNO' },
            { label: '手機', key: 'EQMT_APLEMP_MOBNO' }
        ];

        const fieldsHtml = fields.map(f => `
            <div class="user-info-field">
                <span class="label">${f.label}：</span>
                <span class="value">${this._escapeHtml(userInfo[f.key] || '-')}</span>
            </div>
        `).join('');

        const card = document.createElement('div');
        card.className = 'message ai-message user-info-card';
        card.innerHTML = `
            <div class="user-info-card-title">申報人資訊</div>
            ${fieldsHtml}
        `;

        this.elements.messages?.appendChild(card);
        this.scrollToBottom();
    }

    /**
     * 設定波形動畫狀態
     * @param {string} state - 'listening' | 'responding' | 'hidden'
     */
    setWaveformState(state) {
        const container = this.elements.waveformContainer;
        const el = this.elements.waveform;
        if (!el) return;

        el.classList.remove('waveform-listening', 'waveform-responding', 'waveform-active');

        if (state === 'hidden') {
            this.stopWaveformAnimation();
            if (container) container.classList.add('hidden');
        } else {
            if (container) container.classList.remove('hidden');
            el.classList.add('waveform-active');
            
            if (state === 'listening') {
                el.classList.add('waveform-listening');
            } else if (state === 'responding') {
                el.classList.add('waveform-responding');
            }
            this.startWaveformAnimation();
        }
    }

    startWaveformAnimation() {
        if (this.waveformInterval) return;
        
        const bars = this.elements.waveform?.querySelectorAll('span');
        if (!bars || bars.length === 0) return;

        this.waveformInterval = setInterval(() => {
            bars.forEach(bar => {
                const height = Math.random() * 32 + 4;
                bar.style.height = `${height}px`;
            });
        }, 150);
    }

    stopWaveformAnimation() {
        if (this.waveformInterval) {
            clearInterval(this.waveformInterval);
            this.waveformInterval = null;
        }
        
        const bars = this.elements.waveform?.querySelectorAll('span');
        if (bars) {
            bars.forEach(bar => {
                bar.style.height = '4px';
            });
        }
    }

    // ============================================
    // History Panel Methods
    // ============================================

    /**
     * Toggle history panel visibility
     * @param {boolean} show 
     */
    toggleHistoryPanel(show) {
        if (this.elements.historyPanel) {
            this.elements.historyPanel.classList.toggle('hidden', !show);
        }
        if (this.elements.historyOverlay) {
            this.elements.historyOverlay.classList.toggle('hidden', !show);
        }
    }

    /**
     * Render history list
     * @param {Array} conversations 
     * @param {Object} options - { isInCall: boolean }
     */
    renderHistoryList(conversations, options = {}) {
        if (!this.elements.historyList) return;

        if (!conversations || conversations.length === 0) {
            this.showEmptyHistoryState();
            // 仍需更新清除按鈕狀態
            if (this.elements.clearHistoryBtn) {
                this.elements.clearHistoryBtn.disabled = options.isInCall || false;
            }
            return;
        }

        this.elements.historyList.innerHTML = conversations.map(conv => `
            <div class="history-item" data-id="${conv.id}">
                <div class="history-item-content">
                    <div class="history-item-title">${this._escapeHtml(conv.title || '無標題')}</div>
                    <div class="history-item-time">${this._formatDateTime(conv.updatedAt)}</div>
                </div>
                <button class="history-item-delete" data-id="${conv.id}" title="刪除">🗑️</button>
            </div>
        `).join('');

        // Disable clear button if in call
        if (this.elements.clearHistoryBtn) {
            this.elements.clearHistoryBtn.disabled = options.isInCall || false;
        }
    }

    /**
     * Show empty history state
     */
    showEmptyHistoryState() {
        if (this.elements.historyList) {
            this.elements.historyList.innerHTML = `
                <div class="history-empty">
                    <p>📭 尚無對話歷史</p>
                    <p>開始通話後會自動記錄</p>
                </div>
            `;
        }
    }

    /**
     * Set read-only mode
     * @param {boolean} isReadOnly 
     */
    setReadOnlyMode(isReadOnly) {
        if (isReadOnly) {
            // 唯讀模式：隱藏所有通話按鈕
            if (this.elements.callBtn) {
                this.elements.callBtn.classList.add('hidden');
            }
            if (this.elements.hangupBtn) {
                this.elements.hangupBtn.classList.add('hidden');
            }
        }
        // 非唯讀模式：不在此處處理按鈕狀態，由 main.js 的 updateCallButtons 控制

        // Show/hide read-only banner
        if (this.elements.readOnlyBanner) {
            this.elements.readOnlyBanner.classList.toggle('hidden', !isReadOnly);
        }
    }

    /**
     * Render a single message based on its type
     * @param {Object} msg 
     */
    renderMessage(msg) {
        if (msg.role === 'user') {
            this.addMessage(msg.text, true);
        } else if (msg.role === 'ai') {
            this.addMessage(msg.text, false);
        } else if (msg.role === 'card') {
            if (msg.cardType === 'userInfo') {
                this.showUserInfoCard(msg.data);
            } else {
                this.showRepairConfirmCard(msg.data);
            }
        } else {
            // Fallback for unknown types
            console.warn('Unknown message type:', msg);
            this.addMessage(`[未知訊息] ${JSON.stringify(msg)}`, false);
        }
    }

    /**
     * Render entire conversation (caller should call clearMessages first)
     * @param {Object} conversation 
     */
    renderConversation(conversation) {
        if (!conversation || !conversation.messages) return;

        conversation.messages.forEach(msg => {
            this.renderMessage(msg);
        });
    }

    /**
     * Format timestamp to readable date/time
     * @param {number} timestamp 
     * @returns {string}
     */
    _formatDateTime(timestamp) {
        const date = new Date(timestamp);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${month}/${day} ${hours}:${minutes}`;
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text 
     * @returns {string}
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 全域實例
const ui = new UIManager();

// 匯出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UIManager, ui };
}
