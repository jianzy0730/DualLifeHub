// DualMind Memory ToolPkg entry for Operit.
// Registers automatic recall, memory policy guidance, and once-per-day maintenance.

const LM_ENV_ENABLED = "OPERIT_DUAL_MIND_MEMORY_ENABLED";
const LM_TOGGLE_ID = "dual_mind_memory_enabled";
const LM_ROOT = "dual_mind_memory";
const LM_FOLDERS = {
  active: `${LM_ROOT}/active`,
  permanent: `${LM_ROOT}/permanent`,
  settled: `${LM_ROOT}/settled`,
  uncertain: `${LM_ROOT}/uncertain`,
  forgotten: `${LM_ROOT}/forgotten`,
  logs: `${LM_ROOT}/system/forget_logs`,
  state: `${LM_ROOT}/system/state`,
};
const LM_DAY_MS = 24 * 60 * 60 * 1000;
const LM_DEFAULT_OBSERVATION_DAYS = 7;

function lmIsEnabled() {
  if (typeof getEnv !== "function") return true;
  const raw = String(getEnv(LM_ENV_ENABLED) || "").trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "no", "off"].includes(raw);
}

async function lmSetEnabled(enabled) {
  await Tools.SoftwareSettings.writeEnvironmentVariable(LM_ENV_ENABLED, enabled ? "true" : "false");
}

function lmCallerCardId(event) {
  try {
    if (typeof getCallerCardId === "function") {
      const id = String(getCallerCardId() || "").trim();
      if (id) return id;
    }
  } catch (_error) {}
  const active = event && event.eventPayload && event.eventPayload.metadata && event.eventPayload.metadata.activePrompt;
  return active && active.id ? String(active.id) : undefined;
}

function lmSafeJson(text) {
  try { return JSON.parse(String(text || "")); } catch (_error) { return null; }
}

function lmClamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function lmHash32(text) {
  let h = 2166136261 >>> 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function lmUnitRandom(seed) {
  return lmHash32(seed) / 4294967296;
}

function lmStatusFolder(status) {
  return LM_FOLDERS[status] || LM_FOLDERS.active;
}

function lmStateTitle(cardId) {
  return `[DMM-STATE] ${lmHash32(cardId || "default").toString(16)}`;
}

async function lmReadState(callerCardId) {
  const title = lmStateTitle(callerCardId);
  try {
    const text = await Tools.Memory.getByTitle({ title, callerCardId });
    return lmSafeJson(text) || { schema_version: 1 };
  } catch (_error) {
    return { schema_version: 1 };
  }
}

async function lmWriteState(callerCardId, state) {
  const title = lmStateTitle(callerCardId);
  const content = JSON.stringify(state);
  try {
    await Tools.Memory.update({ oldTitle: title, content, folderPath: LM_FOLDERS.state, importance: 1, credibility: 1, tags: "dual-mind-memory,internal,state", callerCardId });
  } catch (_error) {
    try {
      await Tools.Memory.create({ title, content, contentType: "application/json", source: "dual_mind_memory_system", folderPath: LM_FOLDERS.state, tags: "dual-mind-memory,internal,state", callerCardId });
      await Tools.Memory.update({ oldTitle: title, importance: 1, credibility: 1, callerCardId });
    } catch (_ignored) {}
  }
}

async function lmQueryFolder(folderPath, query, limit, callerCardId) {
  try {
    const result = await Tools.Memory.query({ query: query || "*", folderPath, limit: limit || 20, threshold: 0, callerCardId });
    return result && Array.isArray(result.memories) ? result.memories : [];
  } catch (_error) {
    return [];
  }
}

function lmPayloadFromItem(item) {
  const parsed = lmSafeJson(item && item.content);
  if (parsed && parsed.schema_version && parsed.memory_id) return parsed;
  return {
    schema_version: 1,
    memory_id: `legacy_${lmHash32((item && item.title) || "")}`,
    title: (item && item.title) || "未命名记忆",
    summary: String((item && item.content) || ""),
    details: String((item && item.content) || ""),
    status: "active",
    importance: 0.5,
    confidence: 0.5,
    created_at: Date.now(),
    last_recalled_at: Date.now(),
    recall_count: 0,
    half_life_days: 90,
  };
}

function lmForgetProbability(payload, now) {
  if (!payload || payload.status === "permanent") return 0;
  const importance = lmClamp(payload.importance == null ? 0.5 : payload.importance, 0, 1);
  const halfLifeDays = Math.max(1, Number(payload.half_life_days || 90));
  const lastTouched = Number(payload.last_recalled_at || payload.updated_at || payload.created_at || now);
  const ageDays = Math.max(0, (now - lastTouched) / LM_DAY_MS);
  const ageFactor = 1 - Math.exp(-Math.LN2 * ageDays / halfLifeDays);
  const recallCount = Math.max(0, Number(payload.recall_count || 0));
  const recallFactor = 1 / (1 + Math.log2(recallCount + 1));
  const statusFactor = payload.status === "settled" ? 1.35 : payload.status === "uncertain" ? 0.8 : 1;
  const relationFactor = payload.has_strong_links ? 0.65 : 1;
  return lmClamp(ageFactor * (1 - importance) * recallFactor * statusFactor * relationFactor, 0, 0.95);
}

function lmLogTitle(eventType, memoryId, now) {
  return `[DMM-LOG] ${eventType} ${new Date(now).toISOString()} ${String(memoryId || "unknown").slice(0, 18)}`;
}

async function lmCreateLog(callerCardId, log) {
  const title = lmLogTitle(log.event_type, log.memory_id, log.occurred_at || Date.now());
  try {
    await Tools.Memory.create({
      title,
      content: JSON.stringify(log),
      contentType: "application/json",
      source: "dual_mind_memory_forget_log",
      folderPath: LM_FOLDERS.logs,
      tags: `dual-mind-memory,forget-log,event:${log.event_type}`,
      callerCardId,
    });
    await Tools.Memory.update({ oldTitle: title, importance: 1, credibility: 1, callerCardId });
  } catch (_error) {}
}

async function lmForgetItem(item, payload, probability, draw, callerCardId, now) {
  const observationDays = Math.max(1, Number(payload.observation_days || LM_DEFAULT_OBSERVATION_DAYS));
  const updated = Object.assign({}, payload, {
    status: "forgotten",
    previous_status: payload.status || "active",
    forgotten_at: now,
    purge_after: now + observationDays * LM_DAY_MS,
    forget_probability: probability,
    forget_draw: draw,
    updated_at: now,
  });
  await lmCreateLog(callerCardId, {
    schema_version: 1,
    event_type: "forgotten",
    event_id: `evt_${now}_${lmHash32(item.title)}`,
    memory_id: updated.memory_id,
    memory_title: item.title,
    occurred_at: now,
    previous_status: updated.previous_status,
    new_status: "forgotten",
    reasons: ["记忆衰减命中", "长时间未被召回", "重要性与重复使用不足以抵消衰减"],
    forget_probability: probability,
    random_draw: draw,
    observation_days: observationDays,
    purge_after: updated.purge_after,
    summary: updated.summary || updated.title || item.title,
    content_hash: lmHash32(updated.details || updated.summary || "").toString(16),
    recoverable: true,
  });
  await Tools.Memory.update({
    oldTitle: item.title,
    content: JSON.stringify(updated),
    folderPath: LM_FOLDERS.forgotten,
    tags: "dual-mind-memory,status:forgotten,observation",
    importance: lmClamp(updated.importance || 0.5, 0, 1),
    credibility: lmClamp(updated.confidence || 0.5, 0, 1),
    callerCardId,
  });
}

async function lmPurgeExpired(callerCardId, now) {
  const items = await lmQueryFolder(LM_FOLDERS.forgotten, "*", 200, callerCardId);
  let purged = 0;
  for (const item of items) {
    const payload = lmPayloadFromItem(item);
    if (!payload.purge_after || Number(payload.purge_after) > now) continue;
    await lmCreateLog(callerCardId, {
      schema_version: 1,
      event_type: "purged",
      event_id: `evt_${now}_${lmHash32(item.title)}`,
      memory_id: payload.memory_id,
      memory_title: item.title,
      occurred_at: now,
      previous_status: "forgotten",
      new_status: "purged",
      reasons: ["观察期结束", "正文已自动清除"],
      summary: payload.summary || payload.title || item.title,
      content_hash: lmHash32(payload.details || payload.summary || "").toString(16),
      recoverable: false,
    });
    try {
      await Tools.Memory.deleteMemory({ title: item.title, callerCardId });
      purged += 1;
    } catch (_error) {}
  }
  return purged;
}

async function lmRunMaintenance(callerCardId, force) {
  const now = Date.now();
  const state = await lmReadState(callerCardId);
  if (!force && state.last_sweep_at && now - Number(state.last_sweep_at) < LM_DAY_MS) {
    return { skipped: true, evaluated: 0, forgotten: 0, purged: 0 };
  }
  const folders = [LM_FOLDERS.active, LM_FOLDERS.settled, LM_FOLDERS.uncertain];
  let evaluated = 0;
  let forgotten = 0;
  for (const folder of folders) {
    const items = await lmQueryFolder(folder, "*", 200, callerCardId);
    for (const item of items) {
      const payload = lmPayloadFromItem(item);
      if (payload.status === "permanent" || payload.forget_protected === true) continue;
      evaluated += 1;
      const probability = lmForgetProbability(payload, now);
      const sweepCount = Number(state.sweep_count || 0);
      const dayKey = new Date(now).toISOString().slice(0, 10);
      const draw = lmUnitRandom(`${payload.memory_id}|${dayKey}|${sweepCount}`);
      if (probability > 0 && draw < probability) {
        try {
          await lmForgetItem(item, payload, probability, draw, callerCardId, now);
          forgotten += 1;
        } catch (_error) {}
      }
    }
  }
  const purged = await lmPurgeExpired(callerCardId, now);
  state.last_sweep_at = now;
  state.sweep_count = Number(state.sweep_count || 0) + 1;
  state.last_result = { evaluated, forgotten, purged };
  await lmWriteState(callerCardId, state);
  return { skipped: false, evaluated, forgotten, purged };
}

function lmLatestUserText(payload) {
  const direct = String((payload && (payload.processedInput || payload.rawInput)) || "").trim();
  if (direct) return direct;
  const history = (payload && (payload.preparedHistory || payload.chatHistory)) || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i] && history[i].kind === "USER") return String(history[i].content || "").trim();
  }
  return "";
}

function lmFormatRecall(items, label) {
  const lines = [];
  for (const item of items) {
    const payload = lmPayloadFromItem(item);
    const summary = String(payload.summary || payload.details || item.content || "").trim();
    if (!summary) continue;
    const note = payload.status === "uncertain" ? "（待确认，不得当作确定事实）" : "";
    lines.push(`- [${label}] ${summary}${note}`);
  }
  return lines;
}

async function lmTouch(items, callerCardId) {
  const now = Date.now();
  const tasks = items.slice(0, 8).map(async (item) => {
    const payload = lmPayloadFromItem(item);
    if (!payload.memory_id) return;
    payload.last_recalled_at = now;
    payload.recall_count = Number(payload.recall_count || 0) + 1;
    payload.updated_at = now;
    try {
      await Tools.Memory.update({ oldTitle: item.title, content: JSON.stringify(payload), callerCardId });
    } catch (_error) {}
  });
  await Promise.all(tasks);
}

async function lmOnPromptFinalize(event) {
  if (!lmIsEnabled()) return null;
  const stage = String((event && (event.eventName || event.event)) || "");
  if (stage !== "before_send_to_model") return null;
  const payload = (event && event.eventPayload) || {};
  const query = lmLatestUserText(payload);
  if (!query || query.length < 2) return null;
  const callerCardId = lmCallerCardId(event);
  try { await lmRunMaintenance(callerCardId, false); } catch (_error) {}
  const [permanent, active, uncertain] = await Promise.all([
    lmQueryFolder(LM_FOLDERS.permanent, query, 4, callerCardId),
    lmQueryFolder(LM_FOLDERS.active, query, 6, callerCardId),
    lmQueryFolder(LM_FOLDERS.uncertain, query, 2, callerCardId),
  ]);
  const selected = permanent.concat(active).concat(uncertain).slice(0, 10);
  if (!selected.length) return null;
  await lmTouch(selected, callerCardId);
  const lines = []
    .concat(lmFormatRecall(permanent, "永久"))
    .concat(lmFormatRecall(active, "普通"))
    .concat(lmFormatRecall(uncertain, "不确定"));
  if (!lines.length) return null;
  let block = `\n\n[双生记忆自动召回]\n以下是与本轮相关的角色私有记忆。只在相关时使用；不确定记忆必须明确保留不确定性。\n${lines.join("\n")}`;
  if (block.length > 6000) block = block.slice(0, 6000);
  const baseHistory = Array.isArray(payload.preparedHistory) ? payload.preparedHistory : (Array.isArray(payload.chatHistory) ? payload.chatHistory : []);
  const history = baseHistory.slice();
  history.unshift({ kind: "SYSTEM", content: block, metadata: { source: "dual_mind_memory" } });
  return { preparedHistory: history };
}

function lmOnSystemPrompt(event) {
  if (!lmIsEnabled()) return null;
  const stage = String((event && (event.eventName || event.event)) || "");
  if (stage !== "after_compose_system_prompt") return null;
  const current = String((event && event.eventPayload && event.eventPayload.systemPrompt) || "");
  const policy = `\n\n双生记忆规则：\n- 只保存跨对话仍有价值的事实、偏好、承诺、重要经历和反复出现的模式；不要保存随口闲聊。\n- 情绪强烈但事实未确认的判断应标为 uncertain。已经解决、无需经常主动提起的内容应标为 settled。用户或角色明确要求永不忘记时标为 permanent。\n- 新信息与旧记忆冲突时使用 revise_memory 保留修订轨迹，不要静默覆盖。\n- 遗忘由观察期和遗忘日志自动管理，不需要逐条向用户请求确认。`;
  return { systemPrompt: current + policy };
}

async function lmOnToggle(event) {
  const payload = (event && event.eventPayload) || {};
  if (payload.action === "create") {
    return { toggles: [{ id: LM_TOGGLE_ID, title: "双生记忆", description: "自动召回相关记忆，并每天执行一次衰减维护", isChecked: lmIsEnabled(), slot: "memory" }] };
  }
  if (payload.action === "toggle" && payload.toggleId === LM_TOGGLE_ID) {
    await lmSetEnabled(!lmIsEnabled());
  }
  return null;
}

function registerToolPkg() {
  ToolPkg.registerInputMenuTogglePlugin({ id: "dual_mind_memory_toggle", function: lmOnToggle });
  ToolPkg.registerSystemPromptComposeHook({ id: "dual_mind_memory_policy", function: lmOnSystemPrompt });
  ToolPkg.registerPromptFinalizeHook({ id: "dual_mind_memory_recall", function: lmOnPromptFinalize });
  return true;
}

if (typeof exports !== "undefined") {
  exports.registerToolPkg = registerToolPkg;
  exports.onToggle = lmOnToggle;
  exports.onSystemPrompt = lmOnSystemPrompt;
  exports.onPromptFinalize = lmOnPromptFinalize;
}
