/**
 * API Service for Web Voice Client
 * 封裝所有 REST API 呼叫
 */

class ApiService {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:13901';
        this.tokenKey = options.tokenKey || 'voiceClientToken';
        this.refreshTokenKey = options.refreshTokenKey || 'voiceClientRefreshToken';
    }

    /**
     * 取得儲存的 token
     */
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    /**
     * 取得 refresh token
     */
    getRefreshToken() {
        return localStorage.getItem(this.refreshTokenKey);
    }

    /**
     * 儲存 tokens
     */
    saveTokens(token, refreshToken) {
        localStorage.setItem(this.tokenKey, token);
        localStorage.setItem(this.refreshTokenKey, refreshToken);
    }

    /**
     * 清除 tokens
     */
    clearTokens() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.refreshTokenKey);
    }

    /**
     * 登入
     * @param {string} username - 員工編號
     * @param {string} password - 密碼
     * @returns {Promise<{token, refreshToken, expiresInSeconds}>}
     */
    async login(username, password) {
        const response = await fetch(`${this.baseUrl}/auth/v1/dasl/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `登入失敗 (${response.status})`);
        }

        const body = await response.json();
        const data = body.data ?? body;
        this.saveTokens(data.token, data.refreshToken);
        return data;
    }

    /**
     * 刷新 token
     * @returns {Promise<boolean>} 是否刷新成功
     */
    async refreshAccessToken() {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) return false;

        try {
            const response = await fetch(`${this.baseUrl}/auth/v1/dasl/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });

            if (!response.ok) return false;

            const body = await response.json();
            const data = body.data ?? body;
            this.saveTokens(data.token, data.refreshToken);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 登出
     */
    logout() {
        this.clearTokens();
    }

    /**
     * 檢查是否已登入
     */
    isLoggedIn() {
        return !!this.getToken();
    }

    /**
     * 解析 JWT 取得使用者資訊
     */
    getUserInfo() {
        const token = this.getToken();
        if (!token) return null;

        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const payload = JSON.parse(
                decodeURIComponent(
                    atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
                )
            );
            return payload;
        } catch {
            return null;
        }
    }
}

// 全域實例
const apiService = new ApiService();

// 匯出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ApiService, apiService };
}
