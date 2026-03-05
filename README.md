# 智能客服語音助理 - Web Client (原生版)

這是一個 Web 版的語音客戶端，取代 iOS App 進行設備報修的語音對話。

> **Note**: 此為原生 HTML/CSS/JS 版本。Vue 3 重構版請見 [prod-1399-frontend](../prod-1399-frontend/)。

## 線上版本

**https://web-voice-client-155530028267.asia-east1.run.app**

部署於 Google Cloud Run (asia-east1)，任何人皆可存取。

## 快速開始

### 1. 啟動後端服務

```bash
# 在主倉根目錄
docker compose up -d
```

### 2. 啟動 Web Client

**方法一：Python HTTP Server**
```bash
cd poc-web-voice-client
python3 -m http.server 3002
```

**方法二：Node.js serve**
```bash
npx serve ./poc-web-voice-client -l 3002
```

### 3. 開啟瀏覽器

前往 `http://localhost:13905`

## 專案結構

```
poc-web-voice-client/
├── index.html      # 主頁面
├── css/style.css   # 樣式
├── js/
│   ├── api.js      # API 呼叫封裝
│   ├── webrtc.js   # WebRTC 連線管理
│   ├── events.js   # DataChannel 事件處理
│   ├── ui.js       # UI 管理器
│   └── main.js     # 主程式
└── README.md
```

## 功能

- 登入/登出
- WebRTC 語音通話
- AI 對話顯示
- 設備報修表單

## 開發模式

在 `js/main.js` 中設定：

```javascript
const CONFIG = {
    MOCK_MODE: true,  // 無需後端測試 UI
    DEBUG: true       // 開啟 console 日誌
};
```

## 瀏覽器支援

- Chrome 90+
- Safari 15+
- Edge 90+

## 部署到 Cloud Run

```bash
gcloud run deploy web-voice-client \
  --source . \
  --region asia-east1 \
  --platform managed \
  --allow-unauthenticated
```

需要 `Dockerfile` 和 `nginx.conf`（已包含在專案中）。
