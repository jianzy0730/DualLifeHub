    return Math.max(min, Math.min(max, n));
  }

  function hash32(text) {
    let h = 2166136261 >>> 0;
    const s = String(text || "");
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  function unitRandom(seed) { return hash32(seed) / 4294967296; }
  function nowIso() { return new Date().toISOString(); }
  function safeJson(text) { try { return JSON.parse(String(text || "")); } catch (_error) { return null; } }
  function statusFolder(status) { return FOLDERS[status] || FOLDERS.active; }
  function normalizeStatus(status, fallback) { const value = String(status || fallback || "active").toLowerCase(); return VALID_STATUS.includes(value) ? value : (fallback || "active"); }
  function storedTitle(title) { const raw = String(title || "").trim(); return raw.startsWith("[DMM]") ? raw : `[DMM] ${raw}`; }
  function newId(title) { return `mem_${Date.now().toString(36)}_${hash32(`${title}|${Date.now()}|${Math.random()}`).toString(36)}`; }
  function stateTitle(cardId) { return `[DMM-STATE] ${hash32(cardId || "default").toString(16)}`; }
  function logTitle(type, id, at) { return `[DMM-LOG] ${type} ${new Date(at).toISOString()} ${String(id).slice(0, 18)}`; }
  function revisionTitle(id, at) { return `[DMM-REV] ${new Date(at).toISOString()} ${String(id).slice(0, 18)}`; }

  function response(success, message, data) { return { success, message, data }; }

  async function readByTitle(title, cardId) {
    const candidates = [String(title || "").trim(), storedTitle(title)].filter((v, i, a) => v && a.indexOf(v) === i);
    let lastError = null;
    for (const candidate of candidates) {
      try {
        const content = await Tools.Memory.getByTitle({ title: candidate, callerCardId: cardId });
        return { title: candidate, content, payload: safeJson(content) };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error("记忆不存在");
  }

  async function queryFolder(folder, query, limit, cardId) {
    const result = await Tools.Memory.query({ query: query || "*", folderPath: folder, limit: limit || 20, threshold: 0, callerCardId: cardId });
    return result && Array.isArray(result.memories) ? result.memories : [];
  }

  function payloadFromItem(item) {
    const parsed = safeJson(item && item.content);
    if (parsed && parsed.memory_id) return parsed;
    return { schema_version: 1, memory_id: `legacy_${hash32(item.title)}`, title: item.title, summary: String(item.content || ""), details: String(item.content || ""), status: "active", importance: 0.5, confidence: 0.5, created_at: Date.now(), last_recalled_at: Date.now(), recall_count: 0, half_life_days: 90, observation_days: 7, revisions: [] };
  }

  function forgetProbability(payload, now) {
    if (!payload || payload.status === "permanent" || payload.forget_protected === true) return 0;
    const importance = clamp(payload.importance, 0, 1, 0.5);
    const halfLifeDays = Math.max(1, Number(payload.half_life_days || 90));
    const lastTouched = Number(payload.last_recalled_at || payload.updated_at || payload.created_at || now);
    const ageDays = Math.max(0, (now - lastTouched) / DAY_MS);
    const ageFactor = 1 - Math.exp(-Math.LN2 * ageDays / halfLifeDays);
    const recallFactor = 1 / (1 + Math.log2(Math.max(0, Number(payload.recall_count || 0)) + 1));
    const statusFactor = payload.status === "settled" ? 1.35 : payload.status === "uncertain" ? 0.8 : 1;
    const relationFactor = payload.has_strong_links ? 0.65 : 1;
    return clamp(ageFactor * (1 - importance) * recallFactor * statusFactor * relationFactor, 0, 0.95, 0);
  }

  async function createLog(cardId, log) {
    const title = logTitle(log.event_type, log.memory_id, log.occurred_at || Date.now());
    await Tools.Memory.create({ title, content: JSON.stringify(log), contentType: "application/json", source: "dual_mind_memory_forget_log", folderPath: FOLDERS.logs, tags: `dual-mind-memory,forget-log,event:${log.event_type}`, callerCardId: cardId });
    await Tools.Memory.update({ oldTitle: title, importance: 1, credibility: 1, callerCardId: cardId });
  }

  async function readState(cardId) {
    const title = stateTitle(cardId);
    try { return safeJson(await Tools.Memory.getByTitle({ title, callerCardId: cardId })) || { schema_version: 1 }; }
    catch (_error) { return { schema_version: 1 }; }
  }

  async function writeState(cardId, state) {
    const title = stateTitle(cardId);
    try { await Tools.Memory.update({ oldTitle: title, content: JSON.stringify(state), folderPath: FOLDERS.state, importance: 1, credibility: 1, tags: "dual-mind-memory,internal,state", callerCardId: cardId }); }
    catch (_error) {
      await Tools.Memory.create({ title, content: JSON.stringify(state), contentType: "application/json", source: "dual_mind_memory_system", folderPath: FOLDERS.state, tags: "dual-mind-memory,internal,state", callerCardId: cardId });
      await Tools.Memory.update({ oldTitle: title, importance: 1, credibility: 1, callerCardId: cardId });
    }
  }

  async function rememberImpl(params) {
    const cardId = callerCardId();
    const title = storedTitle(params.title);
    const status = normalizeStatus(params.status, "active");
    const now = Date.now();
    const payload = {
      schema_version: 1, memory_id: newId(title), title: String(params.title || "").trim(),
      summary: String(params.summary || "").trim(), details: String(params.details || params.summary || "").trim(),
      status, importance: clamp(params.importance, 0, 1, 0.6), confidence: clamp(params.confidence, 0, 1, status === "uncertain" ? 0.4 : 0.8),
      source_type: "conversation", created_at: now, updated_at: now, last_recalled_at: now, recall_count: 0,
      half_life_days: Math.max(1, Number(params.half_life_days || 90)), observation_days: Math.max(1, Number(params.observation_days || 7)),
      revisions: [], notes: [], forget_protected: status === "permanent",
    };
    const tags = ["dual-mind-memory", `status:${status}`, String(params.tags || "")].filter(Boolean).join(",");
    await Tools.Memory.create({ title, content: JSON.stringify(payload), contentType: "application/json", source: "dual_mind_memory", folderPath: statusFolder(status), tags, callerCardId: cardId });
    await Tools.Memory.update({ oldTitle: title, importance: payload.importance, credibility: payload.confidence, callerCardId: cardId });
