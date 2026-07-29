      await createLog(cardId, { schema_version: 1, event_type: "purged", event_id: `evt_${now}_${hash32(item.title)}`, memory_id: payload.memory_id, memory_title: item.title, occurred_at: now, previous_status: "forgotten", new_status: "purged", reasons: ["观察期结束", "正文已自动清除"], summary: payload.summary || payload.title || item.title, content_hash: hash32(payload.details || payload.summary || "").toString(16), recoverable: false });
      await Tools.Memory.deleteMemory({ title: item.title, callerCardId: cardId });
      purged += 1;
    }
    return purged;
  }

  async function runCycleImpl(params) {
    const cardId = callerCardId();
    const force = params.force !== false;
    const now = Date.now();
    const state = await readState(cardId);
    if (!force && state.last_sweep_at && now - Number(state.last_sweep_at) < DAY_MS) return response(true, "今日已维护，未重复执行", { skipped: true, last_sweep_at: state.last_sweep_at });
    let evaluated = 0, forgotten = 0;
    const decisions = [];
    for (const folder of [FOLDERS.active, FOLDERS.settled, FOLDERS.uncertain]) {
      const items = await queryFolder(folder, "*", 200, cardId);
      for (const item of items) {
        const payload = payloadFromItem(item);
        if (payload.status === "permanent" || payload.forget_protected === true) continue;
        evaluated += 1;
        const probability = forgetProbability(payload, now);
        const draw = unitRandom(`${payload.memory_id}|${new Date(now).toISOString().slice(0, 10)}|${Number(state.sweep_count || 0)}`);
        const hit = probability > 0 && draw < probability;
        decisions.push({ title: item.title, probability, draw, decision: hit ? "forgotten" : "kept" });
        if (hit) { await forgetOne(item, payload, probability, draw, cardId, now); forgotten += 1; }
      }
    }
    const purged = await purgeExpired(cardId, now);
    state.last_sweep_at = now; state.sweep_count = Number(state.sweep_count || 0) + 1; state.last_result = { evaluated, forgotten, purged };
    await writeState(cardId, state);
    return response(true, "遗忘维护完成", { skipped: false, evaluated, forgotten, purged, observation_days_default: 7, decisions });
  }

  async function inspectLogImpl(params) {
    const cardId = callerCardId();
    const items = await queryFolder(FOLDERS.logs, params.query || "*", Math.max(1, Math.min(100, Number(params.limit || 20))), cardId);
    const logs = items.map((item) => safeJson(item.content)).filter(Boolean).sort((a, b) => Number(b.occurred_at || 0) - Number(a.occurred_at || 0));
    return response(true, `找到 ${logs.length} 条遗忘日志`, { logs });
  }

  async function restoreImpl(params) {
    const cardId = callerCardId();
    const found = await readByTitle(params.title, cardId);
    const payload = found.payload;
    if (!payload || payload.status !== "forgotten") return response(false, "该记忆当前不在观察期，无法按恢复流程处理", { title: found.title });
    const now = Date.now();
    if (payload.purge_after && now >= Number(payload.purge_after)) return response(false, "观察期已结束；正文将在维护时清除或已无法恢复", { title: found.title, purge_after: payload.purge_after });
    const status = normalizeStatus(params.status, normalizeStatus(payload.previous_status, "active"));
    payload.status = status; payload.restored_at = now; payload.updated_at = now; payload.last_recalled_at = now; delete payload.purge_after; delete payload.forgotten_at;
    await Tools.Memory.update({ oldTitle: found.title, content: JSON.stringify(payload), folderPath: statusFolder(status), tags: `dual-mind-memory,status:${status}`, callerCardId: cardId });
    await createLog(cardId, { schema_version: 1, event_type: "restored", event_id: `evt_${now}_${hash32(found.title)}`, memory_id: payload.memory_id, memory_title: found.title, occurred_at: now, previous_status: "forgotten", new_status: status, reasons: [String(params.reason || "观察期内重新确认需要保留")], summary: payload.summary, recoverable: true });
    return response(true, "记忆已从观察期恢复", { title: found.title, status });
  }

  async function explainImpl(params) {
    const cardId = callerCardId();
    let found;
    try { found = await readByTitle(params.title, cardId); }
    catch (_error) {
      const logs = await queryFolder(FOLDERS.logs, params.title, 20, cardId);
      const parsed = logs.map((x) => safeJson(x.content)).filter((x) => x && (x.memory_title === params.title || String(x.memory_title || "").includes(params.title)));
      if (parsed.length) return response(true, "正文不存在，但找到了遗忘记录", { status: "purged_or_missing", logs: parsed });
      return response(false, "未找到该记忆或其遗忘日志");
    }
    const payload = found.payload || payloadFromItem({ title: found.title, content: found.content });
    const probability = forgetProbability(payload, Date.now());
    const reasons = [];
    if (payload.status === "permanent") reasons.push("被标记为永久记忆，遗忘概率固定为 0");
    if (payload.status === "settled") reasons.push("已处理完成，主动召回优先级较低，衰减略快");
    if (payload.status === "uncertain") reasons.push("事实尚未确认，使用时必须保留不确定性");
    if (payload.status === "forgotten") reasons.push("已进入观察期，观察期结束后将自动清除正文");
    if (!reasons.length) reasons.push("普通活跃记忆，按重要性、时间和召回次数衰减");
    return response(true, "记忆状态解释完成", { title: found.title, status: payload.status, summary: payload.summary, importance: payload.importance, confidence: payload.confidence, recall_count: payload.recall_count, last_recalled_at: payload.last_recalled_at, half_life_days: payload.half_life_days, current_forget_probability: probability, purge_after: payload.purge_after, reasons });
  }

  async function wrap(fn, params) {
    try { complete(await fn(params || {})); }
    catch (error) { complete(response(false, `工具执行失败: ${error && error.message ? error.message : String(error)}`)); }
  }

  async function main() { complete(response(true, "双生记忆工具已加载", { version: "0.1.0", tools: ["remember", "recall", "mark_memory", "revise_memory", "run_forgetting_cycle", "inspect_forgetting_log", "restore_memory", "explain_memory"] })); }

  return {
    remember: (p) => wrap(rememberImpl, p), recall: (p) => wrap(recallImpl, p), mark_memory: (p) => wrap(markImpl, p), revise_memory: (p) => wrap(reviseImpl, p),
    run_forgetting_cycle: (p) => wrap(runCycleImpl, p), inspect_forgetting_log: (p) => wrap(inspectLogImpl, p), restore_memory: (p) => wrap(restoreImpl, p), explain_memory: (p) => wrap(explainImpl, p), main,
  };
})();

exports.remember = LivingMemory.remember;
exports.recall = LivingMemory.recall;
exports.mark_memory = LivingMemory.mark_memory;
exports.revise_memory = LivingMemory.revise_memory;
exports.run_forgetting_cycle = LivingMemory.run_forgetting_cycle;
exports.inspect_forgetting_log = LivingMemory.inspect_forgetting_log;
exports.restore_memory = LivingMemory.restore_memory;
exports.explain_memory = LivingMemory.explain_memory;
exports.main = LivingMemory.main;
