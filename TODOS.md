# Web Voice Client - 待處理問題

> 這些問題在 Conversation History 功能開發過程中被發現，屬於現有功能缺陷，需另行處理。

## 高優先級

### 1. 設備清單事件未接到 UI
- **位置**: `events.js#L8`, `main.js#L158`
- **問題**: `handleStartCall` 未傳入 `onDeviceList` callback，查詢成功也只會 no-op
- **修復**: 在 EventHandler 初始化時加入 `onDeviceList` 處理

### 2. MCP Tool 結果解析路徑缺失
- **位置**: `events.js#L167`
- **問題**: `query_user_equipments` 的 MCP tool 結果在 `conversation.item.done` 的 `mcp_call output`，目前沒有解析路徑
- **參考**: iOS 實作 `WebRTCObservable.swift#L840`
- **修復**: 新增 MCP tool output 解析邏輯

### 3. 報修確認送出機制缺失
- **位置**: `ui.js#L237`
- **問題**: 卡片只有顯示，沒有「確認送出」按鈕；後端 `RepairTicketFunction` 要求 `check_agree=true` 才會建單
- **修復**: 新增確認按鈕 + 呼叫 backend API

### 4. 報修卡片欄位映射不一致
- **位置**: `ui.js#L237`
- **問題**: UI 使用 `EQMT_*` 欄位，但 function schema 使用 `device_type/problem_desc/reporter_name`
- **修復**: 對齊欄位映射或 backend 回傳格式

## 中優先級

### 5. 等候音樂觸發條件過寬
- **位置**: `events.js#L144`
- **問題**: `output_audio_buffer.stopped` 在非 MCP 情境也可能出現，可能誤觸等候音樂
- **修復**: 加入更多判斷條件 + `response.done` 保險停止

### 6. Autoplay 解鎖不足
- **位置**: `webrtc.js#L42`, `main.js#L144`
- **問題**: `prepareAudio()` 只暖 `remote-audio`，新的 `hold-music` 若未在使用者點擊時先 play() 可能被擋
- **修復**: 在 `prepareAudio()` 中一併預暖 hold-music

---

## 已完成 ✅

- [x] Conversation History 功能
- [x] storage.js (Debounce/Flush/LRU/容量限制)
- [x] 歷史面板 UI
- [x] 唯讀模式
- [x] 頁面關閉保護
