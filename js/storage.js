/**
 * Conversation Storage Module
 * Manages conversation history in LocalStorage with debounce, capacity limits, and error handling.
 */

class ConversationStorage {
    STORAGE_KEY = 'voice_client_conversations';
    MAX_CONVERSATIONS = 50;
    MAX_MESSAGES = 200;
    MAX_TEXT_LENGTH = 500;
    MAX_RETRY = 3;

    constructor() {
        this._pendingConversation = null;
        this._debounceTimer = null;
        this._lastToastTime = 0;
    }

    /**
     * Debounced save - waits 500ms before writing
     * @param {Object} conversation - The conversation to save
     */
    save(conversation) {
        this._pendingConversation = conversation;

        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }

        this._debounceTimer = setTimeout(() => {
            this._flush();
        }, 500);
    }

    /**
     * Force immediate write - clears pending debounce and writes immediately
     */
    flush() {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }

        if (this._pendingConversation) {
            this._flush();
        }
    }

    /**
     * Internal flush implementation with capacity management and error handling
     */
    _flush() {
        if (!this._pendingConversation) return;

        const conversation = this._prepareConversation(this._pendingConversation);
        this._pendingConversation = null;

        let conversations = this.getAll();
        const index = conversations.findIndex(c => c.id === conversation.id);

        if (index >= 0) {
            conversations[index] = conversation;
        } else {
            conversations.unshift(conversation);
        }

        // LRU: Keep only MAX_CONVERSATIONS (most recently updated)
        conversations.sort((a, b) => b.updatedAt - a.updatedAt);
        conversations = conversations.slice(0, this.MAX_CONVERSATIONS);

        this._saveWithRetry(conversations, 0);
    }

    /**
     * Prepare conversation for storage - apply capacity limits
     * @param {Object} conversation 
     * @returns {Object} Prepared conversation
     */
    _prepareConversation(conversation) {
        const prepared = { ...conversation };

        // Truncate messages to MAX_MESSAGES (keep newest)
        if (prepared.messages && prepared.messages.length > this.MAX_MESSAGES) {
            prepared.messages = prepared.messages.slice(-this.MAX_MESSAGES);
        }

        // Truncate text in each message
        if (prepared.messages) {
            prepared.messages = prepared.messages.map(msg => {
                if (msg.text && msg.text.length > this.MAX_TEXT_LENGTH) {
                    return { ...msg, text: msg.text.slice(0, this.MAX_TEXT_LENGTH) };
                }
                return msg;
            });
        }

        // Title fallback
        if (!prepared.title) {
            prepared.title = `新對話 ${this._formatTime(prepared.createdAt)}`;
        }

        return prepared;
    }

    /**
     * Format timestamp to HH:mm
     * @param {number} timestamp 
     * @returns {string}
     */
    _formatTime(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * Save with retry on QuotaExceededError
     * @param {Array} conversations 
     * @param {number} retryCount 
     */
    _saveWithRetry(conversations, retryCount) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(conversations));
        } catch (error) {
            if (error.name === 'QuotaExceededError' && retryCount < this.MAX_RETRY) {
                // Remove oldest conversation and retry
                if (conversations.length > 1) {
                    conversations.pop();
                    this._saveWithRetry(conversations, retryCount + 1);
                } else {
                    this._showErrorToast();
                }
            } else {
                console.error('Failed to save conversations:', error);
                this._showErrorToast();
            }
        }
    }

    /**
     * Show error toast with 5-second throttling
     */
    _showErrorToast() {
        const now = Date.now();
        if (now - this._lastToastTime > 5000) {
            this._lastToastTime = now;
            // Use optional chaining to avoid errors if UI not initialized
            if (typeof ui !== 'undefined' && ui?.showToast) {
                ui.showToast('儲存失敗', 'error');
            }
        }
    }

    /**
     * Get all conversations sorted by updatedAt (newest first)
     * @returns {Array} Conversations array
     */
    getAll() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            if (!data) return [];

            const conversations = JSON.parse(data);
            return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
        } catch (error) {
            console.error('Failed to parse conversations, clearing corrupted data:', error);
            localStorage.removeItem(this.STORAGE_KEY);
            return [];
        }
    }

    /**
     * Get a conversation by ID
     * @param {string} id 
     * @returns {Object|null}
     */
    getById(id) {
        const conversations = this.getAll();
        return conversations.find(c => c.id === id) || null;
    }

    /**
     * Delete a conversation by ID
     * @param {string} id 
     */
    delete(id) {
        // 取消 pending debounce，防止刪除後被舊資料覆寫
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }

        // 若 pending 的對話就是要刪除的，清除它
        if (this._pendingConversation && this._pendingConversation.id === id) {
            this._pendingConversation = null;
        }

        let conversations = this.getAll();
        conversations = conversations.filter(c => c.id !== id);

        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(conversations));
        } catch (error) {
            console.error('Failed to delete conversation:', error);
        }
    }

    /**
     * Clear all conversations
     */
    clear() {
        // 取消 pending debounce，防止清除後被舊資料覆寫
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
        this._pendingConversation = null;

        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear conversations:', error);
        }
    }
}

// Create global instance
const conversationStorage = new ConversationStorage();
