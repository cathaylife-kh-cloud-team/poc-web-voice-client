# Web Voice Client 技術文件

## 1. 專案概述

**Web Voice Client** 是一個基於 Web 技術的即時語音對話客戶端，旨在提供與 iOS App (`poc-azure-iftlib-voiceit-ios`) 同等的語音助理體驗。本專案利用 WebRTC 技術實現低延遲語音通訊，並透過 DataChannel 進行雙向即時事件交換，支援即時語音識別 (STT)、語音合成 (TTS) 以及功能呼叫 (Function Calling)。

## 2. 系統架構

系統採用純前端 JavaScript 架構，不依賴複雜的建置工具，確保輕量化與易於整合。

### 2.1 核心流程

```mermaid
sequenceDiagram
    participant User
    participant WebClient
    participant APIServer
    participant OpenAI

    User->>WebClient: 點擊「開始通話」
    WebClient->>User: 請求麥克風權限
    WebClient->>WebClient: prepareAudio() (解鎖 AudioContext)
    User-->>WebClient: 允許權限
    WebClient->>WebClient: 建立 WebRTC Offer (SDP)
    WebClient->>APIServer: POST /realtime/v1/calls (SDP)
    Note over APIServer: 驗證並封裝 Session Config
    APIServer->>OpenAI: 建立 Realtime Session
    OpenAI-->>APIServer: SDP Answer
    APIServer-->>WebClient: SDP Answer
    WebClient->>WebClient: 建立 P2P 連線
    
    par Audio Stream
        User->>WebClient: 語音輸入
        WebClient->>OpenAI: RTP Audio Stream
        OpenAI->>WebClient: RTP Audio Stream
        WebClient->>User: 播放音訊 (hidden audio element)
    and Data Control
        OpenAI->>WebClient: DataChannel Events
        WebClient->>WebClient: 更新 UI / 執行邏輯
    end
```

### 2.2 模組化設計

專案採用模組化設計，各職責分離：

| 檔案 | 職責 | 關鍵類別/功能 |
|------|------|---------------|
| `main.js` | 應用程式入口與狀態管理 | `AppStateManager`, `handleStateChange` |
| `webrtc.js` | WebRTC 連線與音訊串流管理 | `WebRTCManager` |
| `events.js` | DataChannel 事件處理邏輯 | `EventHandler` |
| `ui.js` | DOM 操作與 UI 更新 | `UIManager` |
| `storage.js` | 對話歷史儲存與管理 | `ConversationStorage` |
| `api.js` | REST API 呼叫 (Auth/Refresh) | `ApiService` |

## 3. 功能特性

### 3.1 WebRTC 音訊串流
- **自動播放策略**: 
    - HTML 中包含一個隱藏的 `<audio id="remote-audio" autoplay playsinline hidden>` 元素。
    - 在使用者點擊「開始通話」時，呼叫 `prepareAudio()` 預先觸發 `.play()` 方法以解鎖 AudioContext (針對 Safari/iOS)。
    - 當 `ontrack` 事件觸發時，將 Stream 指派給該 DOM 元素。
- **回音消除 (AEC)**: `getUserMedia` 配置強制開啟 `echoCancellation` 與 `noiseSuppression`。

### 3.2 雙向 DataChannel 通訊
- 使用 `oai-events` 作為 DataChannel label。
- 支援完整的 OpenAI Realtime API 事件映射，包括：
    - `response.output_audio_transcript.delta`: 只顯示文字不播放（因為音訊走 WebRTC）。
    - `input_audio_buffer.speech_started`: 偵測使用者說話 (VAD)。
    - `response.function_call_arguments.done`: 接收後端 function call 結果。

### 3.3 Audio Ducking & Barge-in (打斷機制)
為了提供自然的對話體驗，實作了 **Barge-in** 機制，並依賴 Server-side VAD 處理回音：
1. **Server-side Truncation**: OpenAI 伺服器端偵測到使用者說話時，會自動停止傳送音訊，因此**前端不執行本地靜音 (Mute)**，避免誤判導致聲音切斷。
2. **UI 回饋**: 當收到 `input_audio_buffer.speech_started` 時：
   - App 狀態切換為 `listening`。
   - UI 停止播放等候音樂（若有）。
   - 對話框顯示 `...` 作為使用者正在說話的視覺回饋。

### 3.4 狀態機管理

應用程式狀態定義如下：

- **IDLE**: 閒置 / 初始狀態。
- **CONNECTING**: 正在建立 WebRTC 連線。
- **LISTENING**: 連線建立，等待使用者說話。
- **RESPONDING**: AI 正在生成回應或播放語音。
- **WAITING**: 等待外部系統回應 (MCP Tool Call 執行中)。
- **DISCONNECTED**: 連線中斷。

*註：`events.js` 可能會發出邏輯上的 `processing` 狀態（例如 Function Call 期間），這在 `main.js` 中會被映射並顯示為 `WAITING` 狀態。*

### 3.5 對話歷史管理 (Conversation History)

系統具備本地對話歷史紀錄功能，支援離線檢視與管理。

- **儲存機制**: 
    - 使用瀏覽器 `localStorage` 進行持久化。
    - 採用 `Debounce` (500ms) 機制優化寫入效能，避免頻繁 IO。
- **容量限制**:
    - **最大對話數**: 50 筆 (採用 LRU 演算法，自動淘汰最舊紀錄)。
    - **單一對話訊息上限**: 200 則。
    - **訊息長度上限**: 500 字元 (超長文本自動截斷)。
- **唯讀模式 (Read-Only)**: 
    - 點擊歷史紀錄載入對話後，系統進入唯讀狀態。
    - 隱藏通話控制按鈕 (Start/Hangup)，僅顯示 "New Chat" 與 "History" 操作。
    - 明確的 UI 橫幅提示當前狀態。
- **資料安全性**:
    - 登出 (Logout) 時自動清除所有本地歷史紀錄，確保公用設備隱私。
    - 頁面關閉/重新整理時觸發 `flush` 強制寫入，防止資料遺失。

## 4. API 整合規格

### 4.1 Realtime Call

- **URL**: `/realtime/v1/calls`
- **Method**: `POST`
- **Content-Type**: `application/sdp`
- **Body**: 純文字 SDP Offer
- **Response**: 純文字 SDP Answer
- **Authetication**: 目前配置為 `permitAll()`，可透過 `SecurityWhitelist` 設定。

### 4.2 Function Calling 映射

支援以下後端定義的 Function Call：

| Function Name | 用途 | UI 行為 |
|---------------|------|---------|
| `repair_ticket` | 建立報修單 | 彈出報修確認卡片 (`showRepairConfirmCard`) |
| `query_user_equipments` | 查詢設備 | 顯示設備清單供選擇 (`showDeviceSelection`) |

## 5. 配置與模式

`js/main.js` 中的 `CONFIG` 物件控制運行模式：

```javascript
const CONFIG = {
    API_BASE_URL: 'http://localhost:8080',
    MOCK_MODE: false,    // true: 純前端模擬，不連後端
    GUEST_MODE: true,    // true: 跳過登入畫面，直接進入通話介面
    DEBUG: true          // true: 開啟詳細 Console Log
};
```

## 6. 已知限制與注意事項

1. **瀏覽器安全性**: 
   - `getUserMedia` 僅在 `localhost` 或 `https` 環境下工作。
   - 建議使用 Chrome 或 Safari 進行測試。
2. **Audio Context**:
   - 必須由使用者手勢（點擊按鈕）觸發 `prepareAudio()`，否則 Autoplay 會被部分瀏覽器（如 Safari）阻擋。
3. **Ghost Audio**:
   - 確保在 `disconnect()` 時將 `<audio>` 元素的 `srcObject` 設為 `null` 並 `pause()`，防止斷線後仍有殘留聲音。

## 7. 部署說明

本專案為靜態網站，可部署至任何靜態網頁伺服器 (Nginx, Apache, S3, GitHub Pages)。

1. 確保 `CONFIG.API_BASE_URL` 指向正確的後端位址 (需為 HTTPS)。
2. 確認後端 CORS 設定允許該 Domain。
