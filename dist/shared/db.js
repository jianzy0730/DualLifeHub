"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var runtime = require("./runtime.js");

var MARKER = "__LIFE_HUB_JSON__";
var queue = Promise.resolve();

function parseCliOutput(result) {
  var output = String(result && result.output || "");
  var pos = output.lastIndexOf(MARKER);
  if (pos < 0) {
    throw new Error("生活簿数据库没有返回有效结果。\n" + output.slice(-1000));
  }
  var line = output.slice(pos + MARKER.length).split(/\r?\n/)[0].trim();
  var parsed;
  try { parsed = JSON.parse(line); }
  catch (_error) { throw new Error("生活簿结果无法解析。\n" + line.slice(0, 1000)); }
  if (!parsed || parsed.success !== true) {
    throw new Error(parsed && parsed.message ? parsed.message : "生活簿数据库操作失败。");
  }
  return parsed.data;
}

async function execWorker(command) {
  var terminal = Tools.System && Tools.System.terminal;
  if (!terminal) throw new Error("当前 Operite 未提供终端执行能力。");

  if (typeof terminal.hiddenExec === "function") {
    return runtime.withTimeout(
      terminal.hiddenExec(command, { executorKey: "dual_life_hub_v1", timeoutMs: 18000 }),
      20000,
      "生活簿数据库操作超时。"
    );
  }

  // 兼容较旧的 Operite：短命终端按次创建并在 finally 中关闭，不运行常驻进程。
  var session = await runtime.withTimeout(
    terminal.create("dual_life_hub_v1_once"),
    8000,
    "创建生活簿终端会话超时。"
  );
  if (!session || !session.sessionId) throw new Error("无法创建生活簿终端会话。");
  try {
    return await runtime.withTimeout(
      terminal.exec(session.sessionId, command, 18000),
      20000,
      "生活簿数据库操作超时。"
    );
  } finally {
    try { await terminal.close(session.sessionId); } catch (_closeError) {}
  }
}

async function runOnce(action, payload) {
  var worker = await runtime.ensureWorker();
  var payloadPath = runtime.LINUX_DIR + "/payload_" + Date.now() + "_" + Math.floor(Math.random() * 1000000) + ".json";
  await runtime.withTimeout(
    Tools.Files.write(payloadPath, JSON.stringify(payload || {}), false, "linux"),
    8000,
    "写入生活簿操作参数超时。"
  );
  try {
    var oldPidPath = runtime.LINUX_DIR + "/server.pid";
    var oldServerPath = runtime.LINUX_DIR + "/server.py";
    var script = [
      "unset PYTHONHOME PYTHONPATH",
      "export PYTHONUTF8=1 LC_ALL=C LANG=C",
      "if [ -f " + runtime.shellQuote(oldPidPath) + " ]; then old_pid=\"$(cat " + runtime.shellQuote(oldPidPath) + " 2>/dev/null || true)\"; if [ -n \"$old_pid\" ] && [ -r \"/proc/$old_pid/cmdline\" ]; then old_cmd=\"$(tr '\\000' ' ' < \"/proc/$old_pid/cmdline\" 2>/dev/null || true)\"; case \"$old_cmd\" in *" + runtime.shellQuote(oldServerPath).slice(1, -1) + "*--serve*39424*) kill \"$old_pid\" 2>/dev/null || true ;; esac; fi; rm -f " + runtime.shellQuote(oldPidPath) + "; fi",
      "python_bin=\"$(command -v python3 2>/dev/null || true)\"",
      "[ -n \"$python_bin\" ] || { echo 'python3 not found'; exit 127; }",
      "\"$python_bin\" " + runtime.shellQuote(worker) + " --cli " + runtime.shellQuote(String(action)) + " " + runtime.shellQuote(payloadPath)
    ].join("; ");
    var result = await execWorker("bash -lc " + runtime.shellQuote(script));
    return parseCliOutput(result);
  } finally {
    try { await Tools.Files.deleteFile(payloadPath, false, "linux"); } catch (_deleteError) {}
  }
}

function run(action, payload) {
  var task = function () { return runOnce(action, payload || {}); };
  var current = queue.then(task, task);
  queue = current.catch(function () {});
  return current;
}

exports.run = run;
exports.ping = function () { return run("ping", {}); };
exports.dashboard = function () { return run("dashboard", {}); };
exports.lifeBrief = function () { return run("life_brief", {}); };
exports.addTransaction = function (p) { return run("add_transaction", p || {}); };
exports.updateTransaction = function (p) { return run("update_transaction", p || {}); };
exports.deleteTransaction = function (id) { return run("delete_transaction", { id: id }); };
exports.restoreTransaction = function (id) { return run("restore_transaction", { id: id }); };
exports.recentTransactions = function (p) { return run("recent_transactions", p || {}); };
exports.summary = function (p) { return run("summary", p || {}); };
exports.addMemo = function (p) { return run("add_memo", p || {}); };
exports.updateMemo = function (p) { return run("update_memo", p || {}); };
exports.deleteMemo = function (id) { return run("delete_memo", { id: id }); };
exports.restoreMemo = function (id) { return run("restore_memo", { id: id }); };
exports.listMemos = function (p) { return run("list_memos", p || {}); };
exports.dueMemos = function (p) { return run("due_memos", p || {}); };
exports.queryTransactions = function (p) { return run("query_transactions", p || {}); };
exports.statistics = function (p) { return run("statistics", p || {}); };
exports.listCategories = function () { return run("list_categories", {}); };
exports.addCategory = function (p) { return run("add_category", p || {}); };
exports.deleteCategory = function (name) { return run("delete_category", { name: name }); };

exports.walletOverview = function (p) { return run("wallet_overview", p || {}); };
exports.fundAiWallet = function (p) { return run("fund_ai_wallet", p || {}); };
exports.aiTreatUser = function (p) { return run("ai_treat_user", p || {}); };
exports.recordAiExpense = function (p) { return run("record_ai_expense", p || {}); };
exports.aiTransferToUser = function (p) { return run("ai_transfer_to_user", p || {}); };
exports.setAiWalletBalance = function (p) { return run("set_ai_wallet_balance", p || {}); };
exports.queryAiWalletTransactions = function (p) { return run("query_ai_wallet_transactions", p || {}); };
exports.deleteWalletEvent = function (eventId) { return run("delete_wallet_event", { event_id: eventId }); };

exports.periodStatus = function (p) { return run("period_status", p || {}); };
exports.listPeriodRecords = function (p) { return run("list_period_records", p || {}); };
exports.startPeriod = function (p) { return run("start_period", p || {}); };
exports.endPeriod = function (p) { return run("end_period", p || {}); };
exports.addPeriodRecord = function (p) { return run("add_period_record", p || {}); };
exports.updatePeriodRecord = function (p) { return run("update_period_record", p || {}); };
exports.deletePeriodRecord = function (id) { return run("delete_period_record", { id: id }); };

exports.getSettings = function () { return run("get_settings", {}); };
exports.updateSettings = function (p) { return run("update_settings", p || {}); };
