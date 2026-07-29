/* METADATA
{
  "name": "dual_mind_memory",
  "display_name": { "zh": "双生记忆核心", "en": "DualMind Memory Core" },
  "description": {
    "zh": "基于 Operit 原生记忆库的角色私有记忆工具：创建、召回、标记、修订、自动遗忘、恢复和解释。",
    "en": "Role-scoped memory tools built on Operit's native memory library."
  },
  "category": "Memory",
  "enabledByDefault": true,
  "tools": [
    {
      "name": "remember",
      "description": { "zh": "保存一条长期记忆。只应用于跨对话仍有价值的信息。", "en": "Store a durable memory." },
      "parameters": [
        { "name": "title", "description": { "zh": "简短且可检索的标题", "en": "Short searchable title" }, "type": "string", "required": true },
        { "name": "summary", "description": { "zh": "一句话摘要", "en": "One-sentence summary" }, "type": "string", "required": true },
        { "name": "details", "description": { "zh": "完整上下文", "en": "Full context" }, "type": "string", "required": false },
        { "name": "status", "description": { "zh": "active/permanent/settled/uncertain，默认 active", "en": "active/permanent/settled/uncertain" }, "type": "string", "required": false },
        { "name": "importance", "description": { "zh": "重要性 0-1，默认 0.6", "en": "Importance 0-1" }, "type": "number", "required": false },
        { "name": "confidence", "description": { "zh": "可信度 0-1，默认 0.8", "en": "Confidence 0-1" }, "type": "number", "required": false },
        { "name": "half_life_days", "description": { "zh": "遗忘半衰期天数，默认 90；permanent 忽略", "en": "Decay half-life in days" }, "type": "number", "required": false },
        { "name": "observation_days", "description": { "zh": "进入遗忘状态后的观察期，默认 7 天", "en": "Quarantine days before purge" }, "type": "number", "required": false },
        { "name": "tags", "description": { "zh": "额外标签，逗号分隔", "en": "Extra comma-separated tags" }, "type": "string", "required": false }
      ]
    },
    {
      "name": "recall",
      "description": { "zh": "检索相关双生记忆，并更新召回次数。默认不返回已遗忘正文。", "en": "Recall related live memories." },
      "parameters": [
        { "name": "query", "description": { "zh": "自然语言检索问题", "en": "Natural-language query" }, "type": "string", "required": true },
        { "name": "include_settled", "description": { "zh": "是否包含已处理记忆，默认 true", "en": "Include settled memories" }, "type": "boolean", "required": false },
        { "name": "include_uncertain", "description": { "zh": "是否包含待确认记忆，默认 true", "en": "Include uncertain memories" }, "type": "boolean", "required": false },
        { "name": "limit", "description": { "zh": "返回上限，默认 10", "en": "Result limit" }, "type": "number", "required": false }
      ]
    },
    {
      "name": "mark_memory",
      "description": { "zh": "把记忆标为 active、permanent、settled 或 uncertain。", "en": "Mark a memory state." },
      "parameters": [
        { "name": "title", "description": { "zh": "记忆标题，可省略 [DMM] 前缀", "en": "Memory title" }, "type": "string", "required": true },
        { "name": "status", "description": { "zh": "active/permanent/settled/uncertain", "en": "New status" }, "type": "string", "required": true },
        { "name": "reason", "description": { "zh": "标记原因", "en": "Reason" }, "type": "string", "required": false }
      ]
    },
    {
      "name": "revise_memory",
      "description": { "zh": "修订记忆并保留旧版本摘要及原因，不静默覆盖。", "en": "Revise a memory with audit history." },
      "parameters": [
        { "name": "title", "description": { "zh": "现有记忆标题", "en": "Existing memory title" }, "type": "string", "required": true },
        { "name": "new_summary", "description": { "zh": "新摘要", "en": "New summary" }, "type": "string", "required": true },
        { "name": "new_details", "description": { "zh": "新完整内容", "en": "New details" }, "type": "string", "required": false },
        { "name": "reason", "description": { "zh": "修订原因", "en": "Revision reason" }, "type": "string", "required": true },
        { "name": "confidence", "description": { "zh": "新的可信度 0-1", "en": "New confidence" }, "type": "number", "required": false }
      ]
    },
    {
      "name": "run_forgetting_cycle",
      "description": { "zh": "立即运行一次遗忘维护：概率衰减、进入观察期、清除过期正文并写日志。", "en": "Run a forgetting maintenance cycle now." },
      "parameters": [
        { "name": "force", "description": { "zh": "忽略每日一次限制，默认 true", "en": "Ignore daily limit" }, "type": "boolean", "required": false }
      ]
    },
    {
      "name": "inspect_forgetting_log",
      "description": { "zh": "查看遗忘和清除日志。日志永久保留标题、摘要、原因、概率和影响状态，但清除后不保留正文。", "en": "Inspect forgetting and purge logs." },
      "parameters": [
        { "name": "query", "description": { "zh": "按标题、摘要或原因检索，默认全部", "en": "Optional log query" }, "type": "string", "required": false },
        { "name": "limit", "description": { "zh": "返回上限，默认 20", "en": "Result limit" }, "type": "number", "required": false }
      ]
    },
    {
      "name": "restore_memory",
      "description": { "zh": "在观察期内恢复遗忘记忆。观察期结束、正文被清除后无法恢复。", "en": "Restore a quarantined memory before purge." },
      "parameters": [
        { "name": "title", "description": { "zh": "遗忘记忆标题", "en": "Forgotten memory title" }, "type": "string", "required": true },
        { "name": "status", "description": { "zh": "恢复后的状态，默认原状态或 active", "en": "Restored status" }, "type": "string", "required": false },
        { "name": "reason", "description": { "zh": "恢复原因", "en": "Restore reason" }, "type": "string", "required": false }
      ]
    },
    {
      "name": "explain_memory",
      "description": { "zh": "解释某条记忆当前为何保留、沉底、待确认或处于观察期，并计算当前遗忘概率。", "en": "Explain a memory's current state and decay." },
      "parameters": [
        { "name": "title", "description": { "zh": "记忆标题", "en": "Memory title" }, "type": "string", "required": true }
      ]
    }
  ]
} */

const LivingMemory = (function () {
  const ROOT = "dual_mind_memory";
  const FOLDERS = {
    active: `${ROOT}/active`, permanent: `${ROOT}/permanent`, settled: `${ROOT}/settled`,
    uncertain: `${ROOT}/uncertain`, forgotten: `${ROOT}/forgotten`, logs: `${ROOT}/system/forget_logs`, state: `${ROOT}/system/state`, revisions: `${ROOT}/system/revisions`,
  };
  const DAY_MS = 86400000;
  const VALID_STATUS = ["active", "permanent", "settled", "uncertain"];

  function callerCardId() {
    try {
      if (typeof getCallerCardId === "function") {
        const id = String(getCallerCardId() || "").trim();
        return id || undefined;
      }
    } catch (_error) {}
    return undefined;
  }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
