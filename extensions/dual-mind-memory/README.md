# 双生记忆 / DualMind Memory v0.1.0

面向 Operit 的角色隔离记忆扩展，基于原生 `Tools.Memory` 构建。它提供自动召回、状态标记、概率衰减、观察期、修订轨迹和可审计遗忘。

该扩展属于 DualLife 系列，但仍是一个**独立安装的 ToolPkg**，不会修改 Dual Life Hub 主包的数据目录或版本号。

## 安装

运行构建脚本：

```bash
python scripts/build.py
```

然后在 Operit 的“包管理 / 插件”中导入：

```text
release/DualMindMemory_v0.1.0.toolpkg
```

启用子包“**双生记忆核心**”。

## 行为

- 自动召回：每轮发送模型前，从 `permanent / active / uncertain` 检索相关记忆并注入上下文。
- 自动维护：有对话时每日最多运行一次遗忘维护。
- 观察期：命中衰减后进入 `dual_mind_memory/forgotten`，默认保留正文 7 天，可用 `restore_memory` 恢复。
- 自动清除：观察期结束后的下一次维护会删除正文，无需逐条请求用户确认。
- 遗忘日志：永久保留标题、摘要、原因、概率、随机抽样、正文哈希和是否可恢复；正文清除后日志不保存完整正文。
- 输入菜单中的“双生记忆”开关可同时关闭自动召回和自动维护，不影响显式工具调用。

## 工具

1. `remember`
2. `recall`
3. `mark_memory`
4. `revise_memory`
5. `run_forgetting_cycle`
6. `inspect_forgetting_log`
7. `restore_memory`
8. `explain_memory`

## 状态

- `active`：普通活跃记忆。
- `permanent`：不参与遗忘，重要性会提升到 1。
- `settled`：事情已处理，可沉底，衰减略快。
- `uncertain`：可能受情绪或信息不足影响，召回时必须标注不确定。
- `forgotten`：观察期中的内部状态，不由 `remember` 直接创建。

## 原生记忆目录

```text
dual_mind_memory/
├── active/
├── permanent/
├── settled/
├── uncertain/
├── forgotten/
└── system/
    ├── forget_logs/
    ├── revisions/
    └── state/
```

## 开发与验证

```bash
node --check src/main.js
node --check src/dual_mind_memory.js
node tests/mock_runtime_test.js
```

`src/` 是唯一维护源码；构建脚本会生成被 Git 忽略的根入口与 `packages/` 运行文件，并打包 `.toolpkg`。

## 隐私边界

记忆以 `application/json` 存入 Operit 原生记忆库，并始终传入当前角色卡的 `callerCardId`。角色之间使用各自绑定的 Memory Profile，但设备所有者仍可通过 Operit 的本地数据管理能力查看内容，因此这不是密码学保密空间。
