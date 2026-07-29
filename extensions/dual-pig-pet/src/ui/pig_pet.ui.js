"use strict";

var WEB_ORIGIN = "https://dual-pig.local";
var WEB_URL = WEB_ORIGIN + "/";
var HOST_INTERFACE = "DualPigHost";
var webResourcePath = "";

var CONFIG_DIR = ToolPkg.getConfigDir();
var STATE_PATH = CONFIG_DIR + "/pet_state.json";
var ALLOWED_ACTIONS = ["blink", "ear_twitch", "tail_wag", "head_tilt", "bounce", "lean_forward", "nuzzle", "shake", "recoil", "sit", "sleep", "tail_snap"];
var ALLOWED_EMOTIONS = ["neutral", "happy", "shy", "annoyed", "sleepy", "surprised"];

function clamp(value, min, max, fallback) {
  var n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function defaultState() {
  return {
    schema_version: 1,
    affection: 50,
    energy: 80,
    mood: "neutral",
    last_action: "idle",
    interaction_count: 0,
    pending: null,
    updated_at: Date.now()
  };
}

async function readState() {
  try {
    var result = await Tools.Files.read(STATE_PATH);
    var parsed = JSON.parse(String(result && result.content || ""));
    return Object.assign(defaultState(), parsed || {});
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

function parseJsonObject(text) {
  var raw = String(text || "").trim();
  if (!raw) return null;
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(raw); } catch (_error) {}
  var start = raw.indexOf("{");
  if (start < 0) return null;
  var depth = 0;
  var inString = false;
  var escaped = false;
  for (var i = start; i < raw.length; i += 1) {
    var ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(raw.slice(start, i + 1)); } catch (_ignored) { return null; }
      }
    }
  }
  return null;
}

function eventLabel(type) {
  var labels = {
    tap_head: "用户轻点了你的头",
    tap_body: "用户轻点了你的身体",
    long_press: "用户长按着你没有松手",
    pet_head: "用户顺着你的头顶温柔抚摸",
    pet_back: "用户顺着你的背反复抚摸",
    drag: "用户把你拖动了一小段距离",
    tail_pull: "用户捏住并揪了一下你的卷尾巴"
  };
  return labels[type] || "用户碰了碰你";
}

function fallbackDecision(eventType) {
  var map = {
    tap_head: { reply: "嗯？怎么突然点我。", emotion: "surprised", actions: ["blink", "head_tilt"], state_update: { affection: 1, energy: 0 } },
    tap_body: { reply: "我知道你碰我了。", emotion: "neutral", actions: ["bounce", "blink"], state_update: { affection: 1, energy: -1 } },
    long_press: { reply: "按这么久，是舍不得松手吗。", emotion: "shy", actions: ["lean_forward", "tail_wag"], state_update: { affection: 2, energy: -1 } },
    pet_head: { reply: "……再摸两下也不是不行。", emotion: "happy", actions: ["nuzzle", "tail_wag", "blink"], state_update: { affection: 3, energy: 0 } },
    pet_back: { reply: "手法还算及格。", emotion: "happy", actions: ["tail_wag", "sit"], state_update: { affection: 2, energy: -1 } },
    drag: { reply: "别把我随便搬来搬去。", emotion: "annoyed", actions: ["shake", "recoil"], state_update: { affection: -1, energy: -1 } },
    tail_pull: { reply: "喂！尾巴不能乱揪！", emotion: "annoyed", actions: ["tail_snap", "recoil", "shake"], state_update: { affection: -2, energy: -2 } }
  };
  return map[eventType] || map.tap_body;
}

function sanitizeDecision(raw, eventType) {
  var fallback = fallbackDecision(eventType);
  var input = asObject(raw);
  var emotion = ALLOWED_EMOTIONS.indexOf(String(input.emotion || "")) >= 0 ? String(input.emotion) : fallback.emotion;
  var actionsRaw = Array.isArray(input.actions) ? input.actions : [];
  var actions = [];
  actionsRaw.forEach(function (item) {
    var name = typeof item === "string" ? item : item && item.name;
    if (ALLOWED_ACTIONS.indexOf(String(name || "")) >= 0 && actions.indexOf(String(name)) < 0) actions.push(String(name));
  });
  if (!actions.length) actions = fallback.actions.slice();
  actions = actions.slice(0, 3);
  var update = asObject(input.state_update);
  return {
    reply: String(input.reply || fallback.reply).trim().slice(0, 120),
    emotion: emotion,
    actions: actions,
    state_update: {
      affection: clamp(update.affection, -4, 4, fallback.state_update.affection),
      energy: clamp(update.energy, -4, 4, fallback.state_update.energy)
    }
  };
}

function buildPrompt(event, state) {
  var payload = asObject(event);
  var type = String(payload.type || "tap_body");
  return [
    "你正在通过一个可视化小猪身体与用户互动。",
    "必须保持当前 Operit 角色卡原本的人设、关系、说话方式和对用户的态度，不要采用工具包预设人格。",
    "本次身体事件：" + eventLabel(type) + "。",
    "事件数据：" + JSON.stringify({ duration_ms: payload.duration_ms || 0, distance: payload.distance || 0, repeats: payload.repeats || 1 }),
    "当前宠物状态：" + JSON.stringify({ affection: state.affection, energy: state.energy, mood: state.mood, interaction_count: state.interaction_count }),
    "只输出一个 JSON 对象，不要 Markdown，不要解释。格式：",
    '{"reply":"一句符合角色人设的短回复","emotion":"neutral|happy|shy|annoyed|sleepy|surprised","actions":[{"name":"动作名"}],"state_update":{"affection":0,"energy":0}}',
    "动作名只能从 blink, ear_twitch, tail_wag, head_tilt, bounce, lean_forward, nuzzle, shake, recoil, sit, sleep, tail_snap 中选择，最多三个。",
    "reply 最多 45 个汉字；affection 和 energy 每次只能在 -4 到 4 之间变化。",
    type === "tail_pull" ? "用户揪了尾巴，应有明显身体反应，但回复强度仍由角色本人性格决定。" : "动作需要与触摸事件自然对应。"
  ].join("\n");
}

async function callCharacter(event, state) {
  var chatId;
  var roleCardId;
  var senderName;
  try { chatId = typeof getChatId === "function" ? getChatId() : undefined; } catch (_e1) {}
  try { roleCardId = typeof getCallerCardId === "function" ? getCallerCardId() : undefined; } catch (_e2) {}
  try { senderName = typeof getCallerName === "function" ? getCallerName() : undefined; } catch (_e3) {}
  var result = await Tools.Chat.sendMessage(buildPrompt(event, state), chatId, roleCardId, senderName, {
    runtime: "main",
    persist_turn: false,
    notify_reply: false,
    hide_user_message: true,
    disable_warning: true,
    timeout_ms: 60000
  });
  return parseJsonObject(result && result.aiResponse);
}

async function interact(value) {
  var event = asObject(unwrapBridgeValue(value));
  var state = await readState();
  var decision;
  var source = "llm";
  try {
    decision = sanitizeDecision(await callCharacter(event, state), String(event.type || ""));
  } catch (error) {
    source = "fallback";
    decision = sanitizeDecision(null, String(event.type || ""));
    decision.error = error && error.message ? String(error.message) : String(error);
  }
  state.affection = clamp(Number(state.affection || 50) + Number(decision.state_update.affection || 0), 0, 100, 50);
  state.energy = clamp(Number(state.energy || 80) + Number(decision.state_update.energy || 0), 0, 100, 80);
  state.mood = decision.emotion;
  state.last_action = decision.actions[decision.actions.length - 1] || "idle";
  state.interaction_count = Number(state.interaction_count || 0) + 1;
  state.last_interaction = { type: String(event.type || "unknown"), at: Date.now(), source: source };
  state.updated_at = Date.now();
  await writeState(state);
  return { success: true, data: { decision: decision, state: state, source: source } };
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
  var resource = await ToolPkg.readResource("dual_pig_pet_web", "dual_pig_pet_v010.html");
  if (!resource) throw new Error("双生猪猪页面资源缺失");
  webResourcePath = String(resource);
  return webResourcePath;
}

function Screen(ctx) {
  var UI = ctx.UI;
  var colors = ctx.MaterialTheme.colorScheme;
  var controller = ctx.createWebViewController("dual_pig_pet_v010_webview");
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
    key: "dual_pig_pet_v010_webview",
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
