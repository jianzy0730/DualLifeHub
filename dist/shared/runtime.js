"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

var VERSION = "1.0.3";
var LINUX_DIR = "/root/dual_life_hub_v1";
var WORKER_PATH = LINUX_DIR + "/life_hub_worker.py";
var deployed = false;
var webResourcePath = "";

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function withTimeout(promise, ms, message) {
  var timer;
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error(message || "操作超时。")); }, ms);
    })
  ]).finally(function () { clearTimeout(timer); });
}

async function ensureWorker() {
  if (deployed) return WORKER_PATH;
  await withTimeout(Tools.Files.mkdir(LINUX_DIR, true, "linux"), 8000, "创建生活簿运行目录超时。");
  var resource = await withTimeout(
    ToolPkg.readResource("life_hub_server_py", "life_hub_worker_public_v101.py"),
    10000,
    "读取生活簿数据库程序超时。"
  );
  if (!resource) throw new Error("生活簿数据库程序资源缺失。");
  await withTimeout(
    Tools.Files.copy(String(resource), WORKER_PATH, false, "android", "linux"),
    10000,
    "部署生活簿数据库程序超时。"
  );
  deployed = true;
  return WORKER_PATH;
}

async function getWebResource() {
  if (webResourcePath) return webResourcePath;
  var resource = await withTimeout(
    ToolPkg.readResource("life_hub_web_index", "life_hub_index_public_v101.html"),
    10000,
    "读取生活簿页面资源超时。"
  );
  if (!resource) throw new Error("生活簿页面资源缺失。");
  webResourcePath = String(resource);
  return webResourcePath;
}

exports.VERSION = VERSION;
exports.LINUX_DIR = LINUX_DIR;
exports.WORKER_PATH = WORKER_PATH;
exports.shellQuote = shellQuote;
exports.withTimeout = withTimeout;
exports.ensureWorker = ensureWorker;
exports.getWebResource = getWebResource;
