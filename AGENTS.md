# AGENTS.md

This file provides guidance to AI when working with code in this repository.

## Project Overview

Web Voice Client - 基於原生 HTML/CSS/JS 的即時語音客戶端，透過 WebRTC 連接後端 API Server，再經由 OpenAI Realtime API 實現語音對話，用於設備報修 (IT Helpdesk) 場景。

此為原生版本（國泰綠色系 UI），Vue 3 重構版請見 `prod-1399-frontend`。

## Running Locally

```bash
# 方法一：Python
python3 -m http.server 3002

# 方法二：Node.js
npx serve . -l 3002
```

後端服務需在主倉 (`1399-realtime-assistant-repos/`) 透過 `docker compose up -d` 啟動。

測試帳號：`user` / `password`

## Deployment

```bash
gcloud run deploy web-voice-client \
  --source . \
  --region asia-east1 \
  --platform managed \
  --allow-unauthenticated
```

部署為 Nginx 靜態網站（見 `Dockerfile` + `nginx.conf`），Cloud Run 監聽 port 8080。

## Architecture

純前端靜態網站，無建置工具、無打包、無框架。所有 JS 透過 `<script>` 標籤按順序載入（有依賴關係）。

### Script Loading Order (index.html)

```
storage.js → api.js → webrtc.js → events.js → ui.js → main.js
```

後載入的模組依賴先載入的全域物件，順序不可變動。

### Module Responsibilities

| Module | Global Instance | Role |
|--------|----------------|------|
| `storage.js` | `conversationStorage` | LocalStorage 持久化，Debounce 寫入，LRU 淘汰 |
| `api.js` | `apiService` | JWT Auth（login/refresh/logout），Token 管理 |
| `webrtc.js` | (per-call instance) | WebRTC PeerConnection + DataChannel + SDP 交換 |
| `events.js` | (per-call instance) | DataChannel 事件解析，MCP/Function Call 路由 |
| `ui.js` | `ui` (UIManager) | 所有 DOM 操作，訊息渲染，卡片元件 |
| `main.js` | — | 應用程式入口，狀態機，事件綁定，回調整合 |

### State Machine (main.js)

```
IDLE → CONNECTING → LISTENING ⇄ RESPONDING
                        ↓
                     WAITING (MCP Tool Call 執行中)
                        ↓
                   DISCONNECTED
```

- `LISTENING`: WebRTC 連線已建立，等待使用者語音
- `RESPONDING`: AI 正在回應（語音 + 文字串流）
- `WAITING`: MCP Tool Call 正在執行（顯示等候音樂）
- `events.js` 發出的 `processing` 狀態會被 `main.js` 映射為 `WAITING`

### Data Flow

1. **語音通話**: User → Microphone → WebRTC → API Server → OpenAI Realtime API
2. **AI 回應**: OpenAI → RTP Audio Stream → `<audio>` 播放；DataChannel → 文字/事件
3. **MCP Tool Call**: OpenAI → DataChannel event → `events.js` 路由 → UI 卡片渲染
4. **使用者確認操作**: UI 按鈕 → `webrtcManager.sendTextToAI()` → DataChannel → OpenAI

### Key DataChannel Events (events.js)

| Event Type | Handling |
|------------|----------|
| `response.output_audio_transcript.delta/done` | AI 語音轉文字串流 → UI 即時更新 |
| `input_audio_buffer.speech_started` | VAD 偵測使用者說話 → 建立佔位訊息 + 5秒超時 |
| `conversation.item.input_audio_transcription.completed` | STT 完成 → 更新佔位訊息 |
| `response.mcp_call.in_progress/completed` | MCP 呼叫狀態 → 設定/清除 `mcpInProgress` flag |
| `output_audio_buffer.stopped` | 若 `mcpInProgress === true` 則播放等候音樂 |
| `response.function_call_arguments.done` | Function Call 結果 → 報修卡片/設備清單 |
| `conversation.item.done` (mcp_call) | MCP Tool 結果 → 解析並渲染對應 UI |

### MCP Tool → UI Mapping

| MCP Tool Name | UI Behavior |
|---------------|-------------|
| `query_user_equipments` | `showDeviceListCard()` - 設備選擇清單 |
| `query_user_info` | `showUserInfoCard()` - 申報人資訊 |
| `create_equipment_repair_form` | `showRepairSuccess()` 或錯誤 Toast |
| `repair_ticket` (Function Call) | `showRepairConfirmCard()` - 報修確認 + 送出按鈕 |

## Environment Configuration

`main.js` 中的 `CONFIG` 控制運行模式：

```javascript
const ENVIRONMENTS = {
    prod: { apiBaseUrl: 'https://api.ai.hotline.dasl.cloud' },
    local: { apiBaseUrl: 'http://localhost:8080' }
};

const CONFIG = {
    MOCK_MODE: false,  // true: 純前端模擬，不連後端
    DEBUG: true        // true: 開啟 console log
};
```

環境切換優先順序：URL `?env=local` → localStorage → 預設 `prod`。

## Code Conventions

- **No build tools**: 不使用 npm/webpack/vite，直接原生 JS
- **Class-based modules**: 每個模組為一個 class，透過全域 instance 溝通
- **CommonJS export guard**: 每個模組底部有 `if (typeof module !== 'undefined')` 用於測試環境
- **CSS Variables**: 國泰綠色系定義在 `:root`，主色 `--primary-color: #26A862`
- **XSS Prevention**: UI 渲染使用 `_escapeHtml()` 處理使用者輸入
- **Safari/iOS Compatibility**: `prepareAudio()` 預熱所有 `<audio>` 元素解鎖 autoplay

## Known Gotchas

1. **Script order matters**: `index.html` 中的 `<script>` 順序即依賴順序
2. **Ghost audio**: `disconnect()` 時必須將 `<audio>.srcObject = null` 並 `pause()`
3. **STT race condition**: `speech_started` 和 `transcription.completed` 可能亂序，使用 `pendingUserItemIds` Map + 5 秒 timeout 處理
4. **Hold music timing**: 只在 `mcpInProgress === true` 且 `output_audio_buffer.stopped` 時播放等候音樂
5. **getUserMedia**: 只在 `localhost` 或 `https` 環境下工作
6. **ConversationStorage flush**: 頁面關閉時 (`beforeunload`, `pagehide`, `visibilitychange`) 需強制 flush，debounce 可能來不及寫入
