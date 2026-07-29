/* METADATA
{
  "name": "dual_pig_pet_core",
  "display_name": { "zh": "双生猪猪核心", "en": "DualPig Core" },
  "description": {
    "zh": "读取宠物状态，或从聊天中给可视化小猪发送动作。",
    "en": "Read pet state or send actions to the visual pig from chat."
  },
  "category": "Life",
  "enabledByDefault": true,
  "tools": [
    {
      "name": "get_pet_status",
      "description": { "zh": "读取双生猪猪当前的情绪、亲密度、精力和最近动作。", "en": "Read the current pet state." },
      "parameters": []
    },
    {
      "name": "pet_act",
      "description": { "zh": "让双生猪猪执行动作，可用于角色在普通对话中主动控制可视化身体。", "en": "Make the pig perform an action from normal chat." },
      "parameters": [
        { "name": "action", "description": { "zh": "blink/ear_twitch/tail_wag/head_tilt/bounce/lean_forward/nuzzle/shake/recoil/sit/sleep/tail_snap", "en": "Allowed action name" }, "type": "string", "required": true },
        { "name": "emotion", "description": { "zh": "neutral/happy/shy/annoyed/sleepy/surprised", "en": "Optional emotion" }, "type": "string", "required": false },
        { "name": "reply", "description": { "zh": "可选气泡文字", "en": "Optional speech bubble" }, "type": "string", "required": false }
      ]
    }
  ]
} */

const PetCore = (function () {
  const CONFIG_DIR = ToolPkg.getConfigDir();
  const STATE_PATH = `${CONFIG_DIR}/pet_state.json`;
  const ALLOWED_ACTIONS = ["blink", "ear_twitch", "tail_wag", "head_tilt", "bounce", "lean_forward", "nuzzle", "shake", "recoil", "sit", "sleep", "tail_snap"];
  const ALLOWED_EMOTIONS = ["neutral", "happy", "shy", "annoyed", "sleepy", "surprised"];

  function defaultState() {
    return { schema_version: 2, affection: 50, energy: 80, mood: "neutral", last_action: "idle", interaction_count: 0, pending_events: [], recent_events: [], pending: null, updated_at: Date.now() };
  }

  async function readState() {
    try {
      const result = await Tools.Files.read(STATE_PATH);
      const parsed = JSON.parse(String(result && result.content || ""));
      const state = Object.assign(defaultState(), parsed || {});
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

  async function get_pet_status() {
    const state = await readState();
    return { success: true, message: "宠物状态读取完成", data: state };
  }

  async function pet_act(params) {
    const action = ALLOWED_ACTIONS.includes(String(params.action || "")) ? String(params.action) : "blink";
    const emotion = ALLOWED_EMOTIONS.includes(String(params.emotion || "")) ? String(params.emotion) : undefined;
    const state = await readState();
    state.last_action = action;
    if (emotion) state.mood = emotion;
    state.pending = { id: `pending_${Date.now()}`, action, emotion: emotion || state.mood, reply: String(params.reply || "").slice(0, 100), created_at: Date.now() };
    state.updated_at = Date.now();
    await writeState(state);
    return { success: true, message: "动作已发送给双生猪猪", data: state.pending };
  }

  async function wrap(fn, params) {
    try { complete(await fn(params || {})); }
    catch (error) { complete({ success: false, message: `工具执行失败: ${error && error.message ? error.message : String(error)}` }); }
  }

  async function main() {
    complete({ success: true, message: "双生猪猪核心已加载", data: { version: "0.2.0" } });
  }

  return {
    get_pet_status: (p) => wrap(get_pet_status, p),
    pet_act: (p) => wrap(pet_act, p),
    main
  };
})();

exports.get_pet_status = PetCore.get_pet_status;
exports.pet_act = PetCore.pet_act;
exports.main = PetCore.main;
