"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var runtime = require("../../shared/runtime.js");
var db = require("../../shared/db.js");

var WEB_ORIGIN = "https://life-hub.local";
var WEB_URL = WEB_ORIGIN + "/?mode=config";
var HOST_INTERFACE = "LifeHubHost";

function unwrapBridgeValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function parseBody(value) {
  if (!value) return {};
  if (typeof value === "object") return asObject(value);
  try { return asObject(JSON.parse(String(value))); }
  catch (_error) { return {}; }
}

function parseQuery(text) {
  var out = {};
  String(text || "").split("&").forEach(function (part) {
    if (!part) return;
    var pos = part.indexOf("=");
    var key = pos >= 0 ? part.slice(0, pos) : part;
    var value = pos >= 0 ? part.slice(pos + 1) : "";
    try { key = decodeURIComponent(key.replace(/\+/g, " ")); } catch (_e1) {}
    try { value = decodeURIComponent(value.replace(/\+/g, " ")); } catch (_e2) {}
    out[key] = value;
  });
  return out;
}

function parseRequest(value) {
  var input = asObject(unwrapBridgeValue(value));
  var raw = String(input.path || "/api/dashboard");
  if (raw.indexOf(WEB_ORIGIN) === 0) raw = raw.slice(WEB_ORIGIN.length);
  var qpos = raw.indexOf("?");
  return {
    method: String(input.method || "GET").toUpperCase(),
    path: qpos >= 0 ? raw.slice(0, qpos) : raw,
    query: parseQuery(qpos >= 0 ? raw.slice(qpos + 1) : ""),
    body: parseBody(input.body)
  };
}

async function dispatchRequest(value) {
  var req = parseRequest(value);
  var path = req.path;
  var method = req.method;
  var body = req.body;
  var query = req.query;

  if (method === "GET" && path === "/api/health") return { ok: true, version: runtime.VERSION };
  if (method === "GET" && path === "/api/dashboard") return db.dashboard();
  if (method === "GET" && path === "/api/settings") return db.getSettings();
  if ((method === "POST" || method === "PATCH") && path === "/api/settings") return db.updateSettings(body);
  if (method === "GET" && path === "/api/statistics") return db.statistics({ month: query.month || "" });
  if (method === "GET" && path === "/api/wallet") return db.walletOverview({ month: query.month || "" });
  if (method === "GET" && path === "/api/wallet/transactions") return db.queryAiWalletTransactions({ month: query.month || "", query: query.query || "", kind: query.kind || "all", limit: Number(query.limit || 100), offset: Number(query.offset || 0) });
  if (method === "POST" && path === "/api/wallet/fund") return db.fundAiWallet(body);
  if (method === "POST" && path === "/api/wallet/treat") return db.aiTreatUser(body);
  if (method === "POST" && path === "/api/wallet/spend") return db.recordAiExpense(body);
  if (method === "POST" && path === "/api/wallet/transfer") return db.aiTransferToUser(body);
  if (method === "POST" && path === "/api/wallet/balance") return db.setAiWalletBalance(body);
  if (method === "DELETE" && path.indexOf("/api/wallet/events/") === 0) return db.deleteWalletEvent(decodeURIComponent(path.slice("/api/wallet/events/".length)));
  if (method === "GET" && path === "/api/transactions") {
    return db.queryTransactions({
      month: query.month || "",
      query: query.query || "",
      type: query.type || "all",
      category: query.category || "",
      limit: Number(query.limit || 100),
      offset: Number(query.offset || 0)
    });
  }
  if (method === "GET" && path === "/api/categories") return db.listCategories();
  if (method === "POST" && path === "/api/categories") return db.addCategory(body);
  if (method === "DELETE" && path.indexOf("/api/categories/") === 0) {
    return db.deleteCategory(decodeURIComponent(path.slice("/api/categories/".length)));
  }
  if (method === "GET" && path === "/api/memos") {
    return db.listMemos({
      query: query.query || "",
      status: query.status || "all",
      owner: query.owner || "all",
      limit: Number(query.limit || 100)
    });
  }
  if (method === "GET" && path === "/api/periods") return { status: await db.periodStatus({ history_limit: 6 }), items: await db.listPeriodRecords({ owner: query.owner || "all", limit: Number(query.limit || 100) }) };
  if (method === "POST" && path === "/api/periods/start") return db.startPeriod(body);
  if (method === "POST" && path === "/api/periods/end") return db.endPeriod(body);
  if (method === "POST" && path === "/api/periods") return db.addPeriodRecord(body);
  if (path.indexOf("/api/periods/") === 0) {
    var periodId = decodeURIComponent(path.slice("/api/periods/".length));
    if (method === "PATCH") { body.id = periodId; return db.updatePeriodRecord(body); }
    if (method === "DELETE") return db.deletePeriodRecord(periodId);
  }
  if (method === "POST" && path === "/api/transactions") return db.addTransaction(body);
  if (path.indexOf("/api/transactions/") === 0) {
    var txId = decodeURIComponent(path.slice("/api/transactions/".length));
    if (method === "PATCH") { body.id = txId; return db.updateTransaction(body); }
    if (method === "DELETE") return db.deleteTransaction(txId);
  }
  if (method === "POST" && path.indexOf("/api/restore/transaction/") === 0) {
    return db.restoreTransaction(decodeURIComponent(path.slice("/api/restore/transaction/".length)));
  }
  if (method === "POST" && path === "/api/memos") return db.addMemo(body);
  if (path.indexOf("/api/memos/") === 0) {
    var memoId = decodeURIComponent(path.slice("/api/memos/".length));
    if (method === "PATCH") { body.id = memoId; return db.updateMemo(body); }
    if (method === "DELETE") return db.deleteMemo(memoId);
  }
  if (method === "POST" && path.indexOf("/api/restore/memo/") === 0) {
    return db.restoreMemo(decodeURIComponent(path.slice("/api/restore/memo/".length)));
  }
  throw new Error("不支持该操作：" + method + " " + path);
}

function Screen(ctx) {
  var UI = ctx.UI;
  var colors = ctx.MaterialTheme.colorScheme;
  var controller = ctx.createWebViewController("dual_life_hub_v1_config_webview");
  var initializedState = ctx.useState("initialized", false);
  var initialized = initializedState[0];
  var setInitialized = initializedState[1];
  var readyState = ctx.useState("ready", false);
  var ready = readyState[0];
  var setReady = readyState[1];
  var htmlPathState = ctx.useState("htmlPath", "");
  var htmlPath = htmlPathState[0];
  var setHtmlPath = htmlPathState[1];
  var errorState = ctx.useState("error", "");
  var error = errorState[0];
  var setError = errorState[1];
  var statusState = ctx.useState("status", "正在装载");
  var status = statusState[0];
  var setStatus = statusState[1];

  function registerHostInterface() {
    controller.removeJavascriptInterface(HOST_INTERFACE);
    controller.addJavascriptInterface(HOST_INTERFACE, {
      request: async function () {
        var args = Array.prototype.slice.call(arguments);
        try {
          var data = await dispatchRequest(unwrapBridgeValue(args[0]));
          return { success: true, data: data };
        } catch (e) {
          return { success: false, message: e && e.message ? e.message : String(e) };
        }
      },
      ping: async function () {
        try { return { success: true, data: await db.ping() }; }
        catch (e) { return { success: false, message: e && e.message ? e.message : String(e) }; }
      }
    });
  }

  async function boot(force) {
    if (initialized && !force) return;
    setInitialized(true);
    setReady(false);
    setError("");
    try {
      setStatus("正在部署数据库程序");
      await runtime.ensureWorker();
      setStatus("正在检查数据库");
      await db.ping();
      setStatus("正在读取页面资源");
      var path = await runtime.getWebResource();
      registerHostInterface();
      setHtmlPath(path);
      setReady(true);
      setStatus("已就绪");
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    }
  }

  function interceptResource(request) {
    var url = String(request && request.url || "");
    if (url === WEB_URL || url === WEB_ORIGIN || url === WEB_ORIGIN + "/index.html") {
      return {
        action: "respond",
        response: {
          mimeType: "text/html",
          encoding: "UTF-8",
          statusCode: 200,
          reasonPhrase: "OK",
          headers: { "Cache-Control": "no-store" },
          filePath: htmlPath
        }
      };
    }
    if (url.indexOf(WEB_ORIGIN + "/") === 0) {
      return { action: "block" };
    }
    return { action: "allow" };
  }

  var loadingView = UI.Box(
    { fillMaxSize: true, contentAlignment: "center", background: colors.surface },
    UI.Column({ width: 310, spacing: 14, horizontalAlignment: "center" }, [
      UI.Icon({ name: error ? "error" : "sync", size: 32, tint: error ? colors.error : colors.primary, spin: !error }),
      UI.Text({ text: error || status, style: "bodyMedium", color: error ? colors.error : colors.onSurfaceVariant, maxLines: 10 }),
      error ? UI.Button({ text: "重新加载", onClick: function () { return boot(true); } }) : UI.Spacer({ height: 0 })
    ])
  );

  return UI.Box(
    { fillMaxSize: true, onLoad: function () { return boot(false); } },
    ready && htmlPath ? UI.WebView({
      fillMaxSize: true,
      controller: controller,
      key: "dual_life_hub_v1_config_webview",
      url: WEB_URL,
      nestedScrollInterop: true,
      javaScriptEnabled: true,
      domStorageEnabled: true,
      supportZoom: false,
      useWideViewPort: false,
      loadWithOverviewMode: false,
      onInterceptRequest: interceptResource,
      onReceivedError: function (event) {
        var detail = event && event.description ? String(event.description) : "未知错误";
        setError("页面加载失败：" + detail);
      }
    }) : loadingView
  );
}
exports.default = Screen;
