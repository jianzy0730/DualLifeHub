    return response(true, "记忆已保存", { title, memory_id: payload.memory_id, status, importance: payload.importance, confidence: payload.confidence });
  }

  async function recallImpl(params) {
    const cardId = callerCardId();
    const limit = Math.max(1, Math.min(50, Number(params.limit || 10)));
    const jobs = [queryFolder(FOLDERS.permanent, params.query, limit, cardId), queryFolder(FOLDERS.active, params.query, limit, cardId)];
    if (params.include_settled !== false) jobs.push(queryFolder(FOLDERS.settled, params.query, limit, cardId));
    if (params.include_uncertain !== false) jobs.push(queryFolder(FOLDERS.uncertain, params.query, limit, cardId));
    const groups = await Promise.all(jobs);
    const flat = [];
    const seen = new Set();
    for (const group of groups) for (const item of group) if (!seen.has(item.title)) { seen.add(item.title); flat.push(item); }
    const selected = flat.slice(0, limit);
    const now = Date.now();
    const memories = [];
    for (const item of selected) {
      const payload = payloadFromItem(item);
      payload.last_recalled_at = now; payload.recall_count = Number(payload.recall_count || 0) + 1; payload.updated_at = now;
      try { await Tools.Memory.update({ oldTitle: item.title, content: JSON.stringify(payload), callerCardId: cardId }); } catch (_error) {}
      memories.push({ title: item.title, memory_id: payload.memory_id, summary: payload.summary, details: payload.details, status: payload.status, importance: payload.importance, confidence: payload.confidence, uncertainty_notice: payload.status === "uncertain" ? "待确认，不应视为确定事实" : undefined });
    }
    return response(true, `召回 ${memories.length} 条记忆`, { memories });
  }

  async function markImpl(params) {
    const cardId = callerCardId();
    const found = await readByTitle(params.title, cardId);
    const payload = found.payload || payloadFromItem({ title: found.title, content: found.content });
    const oldStatus = payload.status || "active";
    const status = normalizeStatus(params.status, oldStatus);
    payload.status = status; payload.forget_protected = status === "permanent"; payload.updated_at = Date.now();
    payload.notes = Array.isArray(payload.notes) ? payload.notes : [];
    payload.notes.push({ type: "status_change", from: oldStatus, to: status, reason: String(params.reason || ""), at: payload.updated_at });
    await Tools.Memory.update({ oldTitle: found.title, content: JSON.stringify(payload), folderPath: statusFolder(status), tags: `dual-mind-memory,status:${status}`, importance: status === "permanent" ? 1 : clamp(payload.importance, 0, 1, 0.5), credibility: clamp(payload.confidence, 0, 1, 0.5), callerCardId: cardId });
    return response(true, `记忆已标为 ${status}`, { title: found.title, old_status: oldStatus, status });
  }

  async function reviseImpl(params) {
    const cardId = callerCardId();
    const found = await readByTitle(params.title, cardId);
    const payload = found.payload || payloadFromItem({ title: found.title, content: found.content });
    const now = Date.now();
    const revision = { at: now, old_summary: payload.summary, old_details_hash: hash32(payload.details || "").toString(16), new_summary: String(params.new_summary || "").trim(), reason: String(params.reason || "").trim() };
    const revTitle = revisionTitle(payload.memory_id, now);
    await Tools.Memory.create({ title: revTitle, content: JSON.stringify(Object.assign({ schema_version: 1, memory_id: payload.memory_id, memory_title: found.title }, revision)), contentType: "application/json", source: "dual_mind_memory_revision", folderPath: FOLDERS.revisions, tags: "dual-mind-memory,revision", callerCardId: cardId });
    await Tools.Memory.update({ oldTitle: revTitle, importance: 1, credibility: 1, callerCardId: cardId });
    payload.revisions = Array.isArray(payload.revisions) ? payload.revisions : [];
    payload.revisions.push({ at: now, revision_title: revTitle, reason: revision.reason });
    payload.summary = revision.new_summary; payload.details = String(params.new_details || params.new_summary || "").trim(); payload.updated_at = now;
    if (params.confidence !== undefined) payload.confidence = clamp(params.confidence, 0, 1, payload.confidence || 0.5);
    await Tools.Memory.update({ oldTitle: found.title, content: JSON.stringify(payload), credibility: clamp(payload.confidence, 0, 1, 0.5), callerCardId: cardId });
    try { await Tools.Memory.link({ sourceTitle: found.title, targetTitle: revTitle, linkType: "has_revision", weight: 1, description: revision.reason, callerCardId: cardId }); } catch (_error) {}
    return response(true, "记忆已修订，旧版本摘要已保留", { title: found.title, revision_title: revTitle, revision_count: payload.revisions.length });
  }

  async function forgetOne(item, payload, probability, draw, cardId, now) {
    const observationDays = Math.max(1, Number(payload.observation_days || 7));
    const previous = payload.status || "active";
    payload.previous_status = previous; payload.status = "forgotten"; payload.forgotten_at = now; payload.purge_after = now + observationDays * DAY_MS; payload.forget_probability = probability; payload.forget_draw = draw; payload.updated_at = now;
    await createLog(cardId, { schema_version: 1, event_type: "forgotten", event_id: `evt_${now}_${hash32(item.title)}`, memory_id: payload.memory_id, memory_title: item.title, occurred_at: now, previous_status: previous, new_status: "forgotten", reasons: ["记忆衰减命中", "长时间未被召回", "重要性与使用频率不足以抵消衰减"], forget_probability: probability, random_draw: draw, observation_days: observationDays, purge_after: payload.purge_after, summary: payload.summary || payload.title || item.title, content_hash: hash32(payload.details || payload.summary || "").toString(16), recoverable: true });
    await Tools.Memory.update({ oldTitle: item.title, content: JSON.stringify(payload), folderPath: FOLDERS.forgotten, tags: "dual-mind-memory,status:forgotten,observation", callerCardId: cardId });
  }

  async function purgeExpired(cardId, now) {
    const items = await queryFolder(FOLDERS.forgotten, "*", 200, cardId);
    let purged = 0;
    for (const item of items) {
      const payload = payloadFromItem(item);
      if (!payload.purge_after || Number(payload.purge_after) > now) continue;
