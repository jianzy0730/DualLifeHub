"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerToolPkg = registerToolPkg;
exports.onSystemPromptCompose = onSystemPromptCompose;

var pageModule = require("./ui/life_hub/index.ui.js");
var page = pageModule.default || pageModule;
var configModule = require("./ui/life_hub/config.ui.js");
var configPage = configModule.default || configModule;
var ROUTE = "toolpkg:com.community.dual_life_hub:ui:life_hub";
var PROTOCOL_HOOK_ID = "dual_life_hub_package_proxy_protocol_v1";

var TOOL_PROTOCOL_ZH = [
  "双人生活簿工具调用协议：",
  "- 需要调用 life_hub_core 工具时，必须真正发起工具调用，不要输出伪调用文本。",
  "- package_proxy 顶层参数只能有 tool_name 和 params。",
  "- tool_name 使用完整名称，例如 life_hub_core:add_memo。",
  "- params 必须是目标工具参数的 JSON 对象。"
].join("\n");
var TOOL_PROTOCOL_EN = [
  "Dual Life Hub tool-call protocol:",
  "- Issue real life_hub_core tool calls; never print pseudo calls.",
  "- package_proxy takes only tool_name and params.",
  "- Use fully qualified tool names such as life_hub_core:add_memo."
].join("\n");

function onSystemPromptCompose(event) {
  var name = String(event && (event.eventName || event.event) || "");
  if (name !== "after_compose_system_prompt") return null;
  var payload = event && event.eventPayload || {};
  var current = String(payload.systemPrompt || "");
  if (current.indexOf("双人生活簿工具调用协议") >= 0 || current.indexOf("Dual Life Hub tool-call protocol") >= 0) return null;
  return { systemPrompt: current + "\n\n" + (payload.useEnglish ? TOOL_PROTOCOL_EN : TOOL_PROTOCOL_ZH) };
}

function registerToolPkg() {
  ToolPkg.registerUiRoute({
    id: "life_hub",
    route: ROUTE,
    runtime: "compose_dsl",
    screen: page,
    params: {},
    title: { zh: "生活簿", en: "Life Hub" }
  });
  ToolPkg.registerNavigationEntry({
    id: "life_hub_sidebar",
    route: ROUTE,
    surface: "main_sidebar_plugins",
    title: { zh: "生活簿", en: "Life Hub" },
    icon: Icons.Book,
    order: 110
  });
  ToolPkg.registerToolboxUiModule({
    id: "life_hub_settings",
    runtime: "compose_dsl",
    screen: configPage,
    params: {},
    title: { zh: "生活簿配置", en: "Life Hub Settings" }
  });
  ToolPkg.registerSystemPromptComposeHook({ id: PROTOCOL_HOOK_ID, function: onSystemPromptCompose });
  return true;
}
