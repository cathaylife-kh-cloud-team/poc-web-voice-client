# Web Voice Client - 待處理問題

> 這些問題在 Conversation History 功能開發過程中被發現，屬於現有功能缺陷，需另行處理。

## 高優先級

(目前無)

## 中優先級

(目前無)

---

## 已完成 ✅

### 2026-01-04 修復
- [x] **設備清單事件未接到 UI**: `EventHandler` 已加入 `onDeviceList` 處理
- [x] **MCP Tool 結果解析路徑缺失**: `handleMCPResult` 已新增 `query_user_equipments` 解析邏輯
- [x] **報修確認送出機制缺失**: UI 已新增確認按鈕與 `repair_ticket` callback
- [x] **報修卡片欄位映射不一致**: 已在 `handleFunctionCall` 與 UI 層對齊欄位
- [x] **等候音樂觸發條件過寬**: 已加入 `mcpInProgress` flag 控制音樂播放
- [x] **Autoplay 解鎖不足**: 已在 `prepareAudio()` 中加入 `hold-music` 預熱

### 歷史功能 (v1.1)
- [x] Conversation History 功能
- [x] storage.js (Debounce/Flush/LRU/容量限制)
- [x] 歷史面板 UI
- [x] 唯讀模式
- [x] 頁面關閉保護
