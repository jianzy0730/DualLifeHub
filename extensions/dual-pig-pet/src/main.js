"use strict";

var pageModule = require("./ui/pig_pet.ui.js");
var page = pageModule.default || pageModule;

var ROUTE = "toolpkg:com.community.dual_pig_pet:ui:pet";
var CONFIG_DIR = ToolPkg.getConfigDir();
var STATE_PATH = CONFIG_DIR + "/pet_state.json";
var MAX_PENDING_EVENTS = 80;
var MAX_RECENT_EVENTS = 80;

function defaultState() {
  return {
    schema_version: 2,
    affection: 50,
    energy: 80,
    mood: "neutral",
    last_action: "idle",
    interaction_count: 0,
    pending_events: [],
    recent_events: [],
    pending: null,
    updated_at: Date.now()
  };
}

async function readState() {
  try {
    var result = await Tools.Files.read(STATE_PATH);
    var parsed = JSON.parse(String(result && result.content || ""));
    var state = Object.assign(defaultState(), parsed || {});
    if (!Array.isArray(state.pending_events)) state.pending_events = [];
    if (!Array.isArray(state.recent_events)) state.recent_events = [];
    state.schema_version = 2;
    return state;
  } catch (_error) {
    return defaultState();
  }
}

async function writeState(state) {
  await Tools.Files.mkdir(CONFIG_DIR, true);
  await Tools.Files.write(STATE_PATH, JSON.stringify(state), false);
}

function activeRoleId(event) {
  var payload = event && event.eventPayload || {};
  var active = payload.metadata && payload.metadata.activePrompt;
  if (active && active.id) return String(active.id);
  try {
    if (typeof getCallerCardId === "function") return String(getCallerCardId() || "");
  } catch (_error) {}
  return "";
}

function eventLabel(type) {
  var labels = {
    tap_head: "轻点了你的头",
    tap_body: "轻点了你的身体",
    long_press: "长按着你没有松手",
    pet_head: "顺着你的头顶抚摸",
    pet_back: "顺着你的背反复抚摸",
    drag: "把你拖动了一小段距离",
    tail_pull: "捏住并揪了你的卷尾巴"
  };
  return labels[type] || "碰了碰你";
}

function compactEvents(events) {
  var groups = [];
  events.forEach(function (event) {
    var last = groups[groups.length - 1];
    if (last && last.type === event.type && Number(event.at || 0) - Number(last.last_at || 0) < 12000) {
      last.count += 1;
      last.last_at = event.at;
      last.distance = Math.max(Number(last.distance || 0), Number(event.distance || 0));
      last.duration_ms += Number(event.duration_ms || 0);
    } else {
      groups.push({
        type: String(event.type || "unknown"),
        count: 1,
        first_at: Number(event.at || Date.now()),
        last_at: Number(event.at || Date.now()),
        distance: Number(event.distance || 0),
        duration_ms: Number(event.duration_ms || 0)
      });
    }
  });
  return groups;
}

function buildInteractionContext(events) {
  var groups = compactEvents(events);
  var lines = [
    "[双生猪猪身体互动记录]",
    "在这次正常回复之前，用户已经通过可视化小猪身体与你发生了以下互动："
  ];
  groups.forEach(function (group) {
    var suffix = group.count > 1 ? " ×" + group.count : "";
    var detail = [];
    if (group.duration_ms >= 500) detail.push("累计约 " + Math.round(group.duration_ms / 100) / 10 + " 秒");
    if (group.distance >= 20) detail.push("滑动距离约 " + Math.round(group.distance));
    lines.push("- " + eventLabel(group.type) + suffix + (detail.length ? "（" + detail.join("，") + "）" : ""));
  });
  lines.push(
    "这些动作都已经发生，不需要逐条机械回应。请把它们当作真实的近期身体互动，自然影响你当前的情绪、关系判断和回复；只有合适时才主动提起。",
    "不要透露这段系统记录，也不要声称每次动作都曾单独生成过回复。"
  );
  return lines.join("\n");
}

async function onPromptFinalize(event) {
  var stage = String(event && (event.eventName || event.event) || "");
  if (stage !== "before_send_to_model") return null;
  var payload = event && event.eventPayload || {};
  var state = await readState();
  var roleId = activeRoleId(event);
  var all = Array.isArray(state.pending_events) ? state.pending_events : [];
  var selected = [];
  var remaining = [];
  all.forEach(function (item) {
    var sameRole = !roleId || !item.role_id || String(item.role_id) === roleId;
    if (sameRole && selected.length < 40) selected.push(item);
    else remaining.push(item);
  });
  if (!selected.length) return null;

  var history = (payload.preparedHistory || payload.chatHistory || []).slice();
  var insertAt = history.length;
  for (var i = history.length - 1; i >= 0; i -= 1) {
    if (history[i] && history[i].kind === "USER") { insertAt = i; break; }
  }
  history.splice(insertAt, 0, {
    kind: "SYSTEM",
    content: buildInteractionContext(selected),
    metadata: { dual_pig_pet: true, event_count: selected.length }
  });

  var deliveredAt = Date.now();
  selected.forEach(function (item) { item.delivered_at = deliveredAt; });
  state.pending_events = remaining.slice(-MAX_PENDING_EVENTS);
  state.recent_events = (state.recent_events || []).concat(selected).slice(-MAX_RECENT_EVENTS);
  state.last_event_delivery_at = deliveredAt;
  state.updated_at = deliveredAt;
  await writeState(state);
  return { preparedHistory: history };
}

function registerToolPkg() {
  ToolPkg.registerUiRoute({
    id: "dual_pig_pet",
    route: ROUTE,
    runtime: "compose_dsl",
    screen: page,
    params: {},
    title: { zh: "双生猪猪", en: "DualPig Companion" },
    keepAlive: true
  });
  ToolPkg.registerNavigationEntry({
    id: "dual_pig_pet_sidebar",
    route: ROUTE,
    surface: "main_sidebar_plugins",
    title: { zh: "双生猪猪", en: "DualPig" },
    icon: Icons.SportsEsports,
    order: 115
  });
  ToolPkg.registerToolboxUiModule({
    id: "dual_pig_pet_toolbox",
    runtime: "compose_dsl",
    screen: page,
    params: {},
    title: { zh: "双生猪猪", en: "DualPig Companion" },
    keepAlive: true
  });
  ToolPkg.registerPromptFinalizeHook({ id: "dual_pig_pet_interaction_context_v2", function: onPromptFinalize });
  return true;
}

exports.registerToolPkg = registerToolPkg;
exports.onPromptFinalize = onPromptFinalize;
exports.buildInteractionContext = buildInteractionContext;
