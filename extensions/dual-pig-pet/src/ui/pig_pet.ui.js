"use strict";

var WEB_ORIGIN = "https://dual-pig.local";
var WEB_URL = WEB_ORIGIN + "/";
var HOST_INTERFACE = "DualPigHost";
var webResourcePath = "";

var CONFIG_DIR = ToolPkg.getConfigDir();
var STATE_PATH = CONFIG_DIR + "/pet_state.json";
var MAX_PENDING_EVENTS = 80;
var ALLOWED_ACTIONS = ["blink", "ear_twitch", "tail_wag", "head_tilt", "bounce", "lean_forward", "nuzzle", "shake", "recoil", "sit", "sleep", "tail_snap"];

function clamp(value, min, max, fallback) {
  var n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

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

function unwrapBridgeValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function localDecision(eventType) {
  var map = {
    tap_head: { reply: "？", emotion: "surprised", actions: ["blink", "head_tilt"], affection: 1, energy: 0 },
    tap_body: { reply: "嗯", emotion: "neutral", actions: ["bounce", "blink"], affection: 0, energy: -1 },
    long_press: { reply: "……", emotion: "shy", actions: ["lean_forward", "tail_wag"], affection: 2, energy: -1 },
    pet_head: { reply: "♪", emotion: "happy", actions: ["nuzzle", "tail_wag", "blink"], affection: 2, energy: 0 },
    pet_back: { reply: "♪", emotion: "happy", actions: ["tail_wag", "sit"], affection: 2, energy: -1 },
    drag: { reply: "！", emotion: "surprised", actions: ["shake", "recoil"], affection: -1, energy: -1 },
    tail_pull: { reply: "！！", emotion: "annoyed", actions: ["tail_snap", "recoil", "shake"], affection: -2, energy: -2 }
  };
  return map[eventType] || map.tap_body;
}

function currentContext() {
  var chatId = "";
  var roleId = "";
  try { if (typeof getChatId === "function") chatId = String(getChatId() || ""); } catch (_e1) {}
  try { if (typeof getCallerCardId === "function") roleId = String(getCallerCardId() || ""); } catch (_e2) {}
  return { chat_id: chatId, role_id: roleId };
}

async function interact(value) {
  var event = asObject(unwrapBridgeValue(value));
  var type = String(event.type || "tap_body");
  var decision = localDecision(type);
  var state = await readState();
  var now = Date.now();
  var context = currentContext();
  var record = {
    id: "pet_evt_" + now + "_" + Math.floor(Math.random() * 100000),
    type: type,
    at: now,
    duration_ms: Math.max(0, Number(event.duration_ms || 0)),
    distance: Math.max(0, Number(event.distance || 0)),
    repeats: Math.max(1, Number(event.repeats || 1)),
    role_id: context.role_id,
    chat_id: context.chat_id
  };
  state.affection = clamp(Number(state.affection || 50) + decision.affection, 0, 100, 50);
  state.energy = clamp(Number(state.energy || 80) + decision.energy, 0, 100, 80);
  state.mood = decision.emotion;
  state.last_action = decision.actions[decision.actions.length - 1] || "idle";
  state.interaction_count = Number(state.interaction_count || 0) + 1;
  state.last_interaction = record;
  state.pending_events = (state.pending_events || []).concat([record]).slice(-MAX_PENDING_EVENTS);
  state.updated_at = now;
  await writeState(state);
  return {
    success: true,
    data: {
      decision: { reply: decision.reply, emotion: decision.emotion, actions: decision.actions, state_update: { affection: decision.affection, energy: decision.energy } },
      state: state,
      source: "local",
      queued: state.pending_events.length
    }
  };
}

async function getState() {
  return { success: true, data: await readState() };
}

async function consumePending() {
  var state = await readState();
  var pending = state.pending || null;
  if (pending) {
    state.pending = null;
    await writeState(state);
  }
  return { success: true, data: pending };
}

async function resetState() {
  var state = defaultState();
  await writeState(state);
  return { success: true, data: state };
}

async function getWebResource() {
  if (webResourcePath) return webResourcePath;
  var resource = await ToolPkg.readResource("dual_pig_pet_web", "dual_pig_pet_v020.html");
  if (!resource) throw new Error("双生猪猪页面资源缺失");
  webResourcePath = String(resource);
  return webResourcePath;
}

function Screen(ctx) {
  var UI = ctx.UI;
  var colors = ctx.MaterialTheme.colorScheme;
  var controller = ctx.createWebViewController("dual_pig_pet_v020_webview");
  var readyState = ctx.useState("ready", false);
  var ready = readyState[0];
  var setReady = readyState[1];
  var pathState = ctx.useState("htmlPath", "");
  var htmlPath = pathState[0];
  var setHtmlPath = pathState[1];
  var errorState = ctx.useState("error", "");
  var error = errorState[0];
  var setError = errorState[1];

  function registerHost() {
    controller.removeJavascriptInterface(HOST_INTERFACE);
    controller.addJavascriptInterface(HOST_INTERFACE, {
      interact: async function () {
        try { return await interact(unwrapBridgeValue(arguments[0])); }
        catch (e) { return { success: false, message: e && e.message ? e.message : String(e) }; }
      },
      getState: getState,
      consumePending: consumePending,
      resetState: resetState
    });
  }

  async function boot() {
    setReady(false);
    setError("");
    try {
      var path = await getWebResource();
      registerHost();
      setHtmlPath(path);
      setReady(true);
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    }
  }

  function interceptResource(request) {
    var url = String(request && request.url || "");
    if (url === WEB_URL || url === WEB_ORIGIN || url === WEB_ORIGIN + "/index.html") {
      return { action: "respond", response: { mimeType: "text/html", encoding: "UTF-8", statusCode: 200, reasonPhrase: "OK", headers: { "Cache-Control": "no-store" }, filePath: htmlPath } };
    }
    if (url.indexOf(WEB_ORIGIN + "/") === 0) return { action: "block" };
    return { action: "allow" };
  }

  var loading = UI.Box({ fillMaxSize: true, contentAlignment: "center", background: colors.surface },
    UI.Column({ width: 300, spacing: 14, horizontalAlignment: "center" }, [
      UI.Icon({ name: error ? "error" : "sync", size: 32, tint: error ? colors.error : colors.primary, spin: !error }),
      UI.Text({ text: error || "正在叫醒小猪……", style: "bodyMedium", color: error ? colors.error : colors.onSurfaceVariant, maxLines: 8 }),
      error ? UI.Button({ text: "重新加载", onClick: boot }) : UI.Spacer({ height: 0 })
    ])
  );

  return UI.Box({ fillMaxSize: true, onLoad: boot }, ready && htmlPath ? UI.WebView({
    fillMaxSize: true,
    controller: controller,
    key: "dual_pig_pet_v020_webview",
    url: WEB_URL,
    nestedScrollInterop: true,
    javaScriptEnabled: true,
    domStorageEnabled: true,
    supportZoom: false,
    useWideViewPort: false,
    loadWithOverviewMode: false,
    onInterceptRequest: interceptResource,
    onReceivedError: function (event) { setError("页面加载失败：" + String(event && event.description || "未知错误")); }
  }) : loading);
}

exports.default = Screen;
exports.interact = interact;
exports.getState = getState;
exports.localDecision = localDecision;
