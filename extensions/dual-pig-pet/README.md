# 双生猪猪 / DualPig Companion v0.1.0

面向 Operit 的角色身体扩展。页面中的小猪没有独立人设；每次触摸会调用当前 Operit 角色卡，让该角色决定回复、情绪和动作。

## 功能

- 分层 SVG 小猪，清晰缩放，不依赖模糊位图。
- 点击头部或身体。
- 长按。
- 沿头部抚摸。
- 拖动身体。
- 独立卷尾巴命中区域与“揪尾巴”事件。
- 当前角色卡 LLM 输出结构化行为，前端动作队列负责播放。
- 亲密度、精力和最近情绪保存在 ToolPkg 配置目录。
- 普通聊天中的角色可以调用 `dual_pig_pet_core:pet_act` 主动控制小猪。

## LLM 行为协议

工具包向当前角色卡发送隐藏且不持久化的交互请求。模型只需返回：

```json
{
  "reply": "符合当前角色人设的短回复",
  "emotion": "happy",
  "actions": [{ "name": "tail_wag" }, { "name": "blink" }],
  "state_update": { "affection": 2, "energy": -1 }
}
```

角色卡本身决定语气和关系；工具包只限制可执行动作与数值范围。

## 可执行动作

`blink`、`ear_twitch`、`tail_wag`、`head_tilt`、`bounce`、`lean_forward`、`nuzzle`、`shake`、`recoil`、`sit`、`sleep`、`tail_snap`。

## 构建

```bash
python scripts/build.py
```

输出：`release/DualPigCompanion_v0.1.0.toolpkg`

## 说明

调用使用当前 `getChatId()` 与 `getCallerCardId()`，并设置 `persist_turn: false`、`hide_user_message: true`，因此触摸决策不会作为普通用户消息显示或写入聊天历史。真实行为仍取决于 Operit 当前版本和所用模型对严格 JSON 的遵从程度；解析失败时会使用本地备用动作。
