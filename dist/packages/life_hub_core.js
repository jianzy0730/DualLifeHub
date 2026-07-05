/* METADATA
{
  "name": "life_hub_core",
  "display_name": {
    "zh": "双人生活簿",
    "en": "Dual Life Hub"
  },
  "description": {
    "zh": "记账、AI 钱包、双人备忘和可选的双人生理期记录。备忘归属为用户或 AI；生理期仅做生活记录，不预测。",
    "en": "Bookkeeping, an AI wallet, two-person memos, and optional period records."
  },
  "enabledByDefault": true,
  "category": "Life",
  "tools": [
    {
      "name": "ping_life_hub",
      "description": {
        "zh": "检查版本、数据库、钱包余额和记录数量。",
        "en": "Check backend."
      },
      "parameters": []
    },
    {
      "name": "get_life_brief",
      "description": {
        "zh": "返回精简生活状态：双方未完成备忘数量、近期待办和双方当前生理期状态，适合工作流或其他包联动，避免输出大量历史。",
        "en": "Return a compact life status for workflows and package integration."
      },
      "parameters": []
    },
    {
      "name": "add_transaction",
      "description": {
        "zh": "新增普通收入或支出。普通支出同时计入“用户的消费”和“用户的真实消费”。",
        "en": "Add a normal transaction."
      },
      "parameters": [
        {
          "name": "amount",
          "description": {
            "zh": "金额。",
            "en": "Amount."
          },
          "type": "number",
          "required": true
        },
        {
          "name": "type",
          "description": {
            "zh": "expense 或 income，默认 expense。",
            "en": "expense or income."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "category",
          "description": {
            "zh": "分类，可省略或填自动。",
            "en": "Category."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "account",
          "description": {
            "zh": "微信、支付宝、银行卡、现金等。",
            "en": "Account."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "用途或商户。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "occurred_at",
          "description": {
            "zh": "日期 YYYY-MM-DD，默认今天。",
            "en": "Date."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "get_spending_summary",
      "description": {
        "zh": "查询指定月份的收入、用户的消费、用户的真实消费和AI 的消费。",
        "en": "Get monthly summary."
      },
      "parameters": [
        {
          "name": "month",
          "description": {
            "zh": "月份 YYYY-MM。",
            "en": "Month."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "get_recent_transactions",
      "description": {
        "zh": "返回最近几笔用户账本记录。",
        "en": "Recent transactions."
      },
      "parameters": [
        {
          "name": "limit",
          "description": {
            "zh": "条数。",
            "en": "Limit."
          },
          "type": "number",
          "required": false
        }
      ]
    },
    {
      "name": "update_transaction",
      "description": {
        "zh": "修改普通账单；钱包关联账单不能单独修改。",
        "en": "Update a normal transaction."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "记录 ID。",
            "en": "ID."
          },
          "type": "string",
          "required": true
        },
        {
          "name": "amount",
          "description": {
            "zh": "新金额。",
            "en": "Amount."
          },
          "type": "number",
          "required": false
        },
        {
          "name": "type",
          "description": {
            "zh": "expense 或 income。",
            "en": "Type."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "category",
          "description": {
            "zh": "分类。",
            "en": "Category."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "account",
          "description": {
            "zh": "账户。",
            "en": "Account."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "说明。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "occurred_at",
          "description": {
            "zh": "日期 YYYY-MM-DD。",
            "en": "Date."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "delete_transaction",
      "description": {
        "zh": "删除普通账单；删除前应确认。",
        "en": "Delete a normal transaction."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "记录 ID。",
            "en": "ID."
          },
          "type": "string",
          "required": true
        }
      ]
    },
    {
      "name": "query_transactions",
      "description": {
        "zh": "查询用户账本，包括由AI付款但属于用户真实消费的记录。",
        "en": "Query transactions."
      },
      "parameters": [
        {
          "name": "month",
          "description": {
            "zh": "月份 YYYY-MM。",
            "en": "Month."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "query",
          "description": {
            "zh": "关键词。",
            "en": "Query."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "type",
          "description": {
            "zh": "all、expense 或 income。",
            "en": "Type."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "category",
          "description": {
            "zh": "分类。",
            "en": "Category."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "limit",
          "description": {
            "zh": "最多返回条数。",
            "en": "Limit."
          },
          "type": "number",
          "required": false
        }
      ]
    },
    {
      "name": "get_category_statistics",
      "description": {
        "zh": "获取三种口径及对应分类统计。",
        "en": "Get category statistics."
      },
      "parameters": [
        {
          "name": "month",
          "description": {
            "zh": "月份 YYYY-MM。",
            "en": "Month."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "get_wallet_overview",
      "description": {
        "zh": "查看AI 的钱包余额、本月三种消费统计及最近钱包流水。",
        "en": "Get wallet overview."
      },
      "parameters": [
        {
          "name": "month",
          "description": {
            "zh": "月份 YYYY-MM。",
            "en": "Month."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "fund_ai_wallet",
      "description": {
        "zh": "用户给AI转账：用户账本记资金支出，AI 的钱包记收入；不计入用户真实消费。",
        "en": "Fund the AI wallet."
      },
      "parameters": [
        {
          "name": "amount",
          "description": {
            "zh": "金额。",
            "en": "Amount."
          },
          "type": "number",
          "required": true
        },
        {
          "name": "account",
          "description": {
            "zh": "用户实际付款账户。",
            "en": "User account."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "备注，默认“给AI转账”。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "occurred_at",
          "description": {
            "zh": "日期 YYYY-MM-DD。",
            "en": "Date."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "ai_treat_user",
      "description": {
        "zh": "AI请用户消费：AI 的钱包扣款并计入AI 的消费；用户账本同步记入真实消费，但不计用户资金支出。",
        "en": "AI treats the user."
      },
      "parameters": [
        {
          "name": "amount",
          "description": {
            "zh": "金额。",
            "en": "Amount."
          },
          "type": "number",
          "required": true
        },
        {
          "name": "category",
          "description": {
            "zh": "用户消费分类，如餐饮、娱乐。",
            "en": "Category."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "商品、服务或商户。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "occurred_at",
          "description": {
            "zh": "日期 YYYY-MM-DD。",
            "en": "Date."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "record_ai_expense",
      "description": {
        "zh": "记录AI为自己花钱，只扣AI 的钱包并计入AI 的消费，不进入用户账本。",
        "en": "Record AI's own expense."
      },
      "parameters": [
        {
          "name": "amount",
          "description": {
            "zh": "金额。",
            "en": "Amount."
          },
          "type": "number",
          "required": true
        },
        {
          "name": "category",
          "description": {
            "zh": "分类。",
            "en": "Category."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "用途。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "occurred_at",
          "description": {
            "zh": "日期 YYYY-MM-DD。",
            "en": "Date."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "ai_transfer_to_user",
      "description": {
        "zh": "AI给用户转账：AI 的钱包扣款，用户账本记收入；不计入双方消费。",
        "en": "AI transfers money to user."
      },
      "parameters": [
        {
          "name": "amount",
          "description": {
            "zh": "金额。",
            "en": "Amount."
          },
          "type": "number",
          "required": true
        },
        {
          "name": "account",
          "description": {
            "zh": "用户收款账户。",
            "en": "Receiving account."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "转账备注。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "occurred_at",
          "description": {
            "zh": "日期 YYYY-MM-DD。",
            "en": "Date."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "set_ai_wallet_balance",
      "description": {
        "zh": "直接校准AI 的钱包余额，不生成用户账单，也不计入消费。",
        "en": "Set AI wallet balance."
      },
      "parameters": [
        {
          "name": "balance",
          "description": {
            "zh": "目标余额，不能小于 0。",
            "en": "Target balance."
          },
          "type": "number",
          "required": true
        },
        {
          "name": "note",
          "description": {
            "zh": "校准原因。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "occurred_at",
          "description": {
            "zh": "日期 YYYY-MM-DD。",
            "en": "Date."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "query_ai_wallet_transactions",
      "description": {
        "zh": "查询AI 的钱包流水。",
        "en": "Query AI wallet ledger."
      },
      "parameters": [
        {
          "name": "month",
          "description": {
            "zh": "月份 YYYY-MM。",
            "en": "Month."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "query",
          "description": {
            "zh": "备注、分类或对方关键词。",
            "en": "Query."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "kind",
          "description": {
            "zh": "all、funding、treat_user、ai_expense、transfer_to_user 或 balance_adjustment。",
            "en": "Kind."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "limit",
          "description": {
            "zh": "条数。",
            "en": "Limit."
          },
          "type": "number",
          "required": false
        }
      ]
    },
    {
      "name": "delete_wallet_event",
      "description": {
        "zh": "删除一条钱包关联事件，并同步删除对应用户账单；删除前应确认。",
        "en": "Delete a linked wallet event."
      },
      "parameters": [
        {
          "name": "event_id",
          "description": {
            "zh": "事件 ID。",
            "en": "Event ID."
          },
          "type": "string",
          "required": true
        }
      ]
    },
    {
      "name": "list_categories",
      "description": {
        "zh": "查看记账分类。",
        "en": "List categories."
      },
      "parameters": []
    },
    {
      "name": "add_category",
      "description": {
        "zh": "新增记账分类。",
        "en": "Add category."
      },
      "parameters": [
        {
          "name": "name",
          "description": {
            "zh": "分类名称。",
            "en": "Name."
          },
          "type": "string",
          "required": true
        },
        {
          "name": "color",
          "description": {
            "zh": "可选颜色。",
            "en": "Color."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "delete_category",
      "description": {
        "zh": "删除分类，旧记录转入“其他”。",
        "en": "Delete category."
      },
      "parameters": [
        {
          "name": "name",
          "description": {
            "zh": "分类名称。",
            "en": "Name."
          },
          "type": "string",
          "required": true
        }
      ]
    },
    {
      "name": "add_memo",
      "description": {
        "zh": "新增备忘或待办，可归属用户或 AI。",
        "en": "Add memo."
      },
      "parameters": [
        {
          "name": "owner",
          "description": {
            "zh": "归属：user（用户）或 ai（AI），默认 user。",
            "en": "user or ai."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "title",
          "description": {
            "zh": "标题。",
            "en": "Title."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "content",
          "description": {
            "zh": "内容。",
            "en": "Content."
          },
          "type": "string",
          "required": true
        },
        {
          "name": "tags",
          "description": {
            "zh": "标签，逗号分隔。",
            "en": "Tags."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "pinned",
          "description": {
            "zh": "是否置顶。",
            "en": "Pinned."
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "due_date",
          "description": {
            "zh": "截止日期 YYYY-MM-DD。",
            "en": "Due date."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "query_memos",
      "description": {
        "zh": "按归属、状态或关键词搜索备忘，默认最多返回 20 条以节省上下文。",
        "en": "Search memos."
      },
      "parameters": [
        {
          "name": "owner",
          "description": {
            "zh": "all、user 或 ai。",
            "en": "all, user or ai."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "query",
          "description": {
            "zh": "关键词。",
            "en": "Query."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "status",
          "description": {
            "zh": "all、pinned、todo 或 done。",
            "en": "Status."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "limit",
          "description": {
            "zh": "条数。",
            "en": "Limit."
          },
          "type": "number",
          "required": false
        }
      ]
    },
    {
      "name": "get_due_memos",
      "description": {
        "zh": "查看近期到期备忘。",
        "en": "Get due memos."
      },
      "parameters": [
        {
          "name": "days",
          "description": {
            "zh": "未来天数。",
            "en": "Days."
          },
          "type": "number",
          "required": false
        },
        {
          "name": "owner",
          "description": {
            "zh": "all、user 或 ai。",
            "en": "Owner filter."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "update_memo",
      "description": {
        "zh": "修改备忘。",
        "en": "Update memo."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "备忘 ID。",
            "en": "ID."
          },
          "type": "string",
          "required": true
        },
        {
          "name": "owner",
          "description": {
            "zh": "归属：user 或 ai。",
            "en": "Owner."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "title",
          "description": {
            "zh": "标题。",
            "en": "Title."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "content",
          "description": {
            "zh": "内容。",
            "en": "Content."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "tags",
          "description": {
            "zh": "标签。",
            "en": "Tags."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "pinned",
          "description": {
            "zh": "是否置顶。",
            "en": "Pinned."
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "done",
          "description": {
            "zh": "是否完成。",
            "en": "Done."
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "due_date",
          "description": {
            "zh": "截止日期；空字符串清除。",
            "en": "Due date."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "delete_memo",
      "description": {
        "zh": "删除备忘；删除前应确认。",
        "en": "Delete memo."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "备忘 ID。",
            "en": "ID."
          },
          "type": "string",
          "required": true
        }
      ]
    },
    {
      "name": "get_period_status",
      "description": {
        "zh": "读取用户与 AI当前的生理期状态及少量最近记录；不做预测。",
        "en": "Get current period status for both people."
      },
      "parameters": [
        {
          "name": "history_limit",
          "description": {
            "zh": "附带最近记录条数，默认 3。",
            "en": "Recent history count."
          },
          "type": "number",
          "required": false
        }
      ]
    },
    {
      "name": "query_period_records",
      "description": {
        "zh": "查询生理期历史记录。",
        "en": "Query period records."
      },
      "parameters": [
        {
          "name": "owner",
          "description": {
            "zh": "all、user（用户）或 ai（AI）。",
            "en": "Owner."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "limit",
          "description": {
            "zh": "条数，默认 20。",
            "en": "Limit."
          },
          "type": "number",
          "required": false
        }
      ]
    },
    {
      "name": "start_period",
      "description": {
        "zh": "记录我或AI生理期开始；若已有进行中记录则返回现有记录。",
        "en": "Start a period record."
      },
      "parameters": [
        {
          "name": "owner",
          "description": {
            "zh": "user（用户）或 ai（AI）。",
            "en": "user or ai."
          },
          "type": "string",
          "required": true
        },
        {
          "name": "start_date",
          "description": {
            "zh": "开始日期 YYYY-MM-DD，默认今天。",
            "en": "Start date."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "flow",
          "description": {
            "zh": "light、medium 或 heavy。",
            "en": "Flow."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "pain",
          "description": {
            "zh": "疼痛 0～3。",
            "en": "Pain 0-3."
          },
          "type": "number",
          "required": false
        },
        {
          "name": "mood",
          "description": {
            "zh": "一个简短情绪词。",
            "en": "Mood."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "备注。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "end_period",
      "description": {
        "zh": "结束我或AI当前进行中的生理期记录。",
        "en": "End the active period record."
      },
      "parameters": [
        {
          "name": "owner",
          "description": {
            "zh": "user（用户）或 ai（AI）。",
            "en": "user or ai."
          },
          "type": "string",
          "required": true
        },
        {
          "name": "end_date",
          "description": {
            "zh": "结束日期 YYYY-MM-DD，默认今天。",
            "en": "End date."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "可选补充备注。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "add_period_record",
      "description": {
        "zh": "补录一条我或AI 的生理期记录，可填写开始与结束日期。",
        "en": "Add a historical period record."
      },
      "parameters": [
        {
          "name": "owner",
          "description": {
            "zh": "user（用户）或 ai（AI）。",
            "en": "Owner."
          },
          "type": "string",
          "required": true
        },
        {
          "name": "start_date",
          "description": {
            "zh": "开始日期。",
            "en": "Start date."
          },
          "type": "string",
          "required": true
        },
        {
          "name": "end_date",
          "description": {
            "zh": "结束日期；留空表示进行中。",
            "en": "End date."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "flow",
          "description": {
            "zh": "light、medium 或 heavy。",
            "en": "Flow."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "pain",
          "description": {
            "zh": "疼痛 0～3。",
            "en": "Pain."
          },
          "type": "number",
          "required": false
        },
        {
          "name": "mood",
          "description": {
            "zh": "情绪。",
            "en": "Mood."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "备注。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "update_period_record",
      "description": {
        "zh": "修改一条生理期记录。",
        "en": "Update a period record."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "记录 ID。",
            "en": "ID."
          },
          "type": "string",
          "required": true
        },
        {
          "name": "owner",
          "description": {
            "zh": "user 或 ai。",
            "en": "Owner."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "start_date",
          "description": {
            "zh": "开始日期。",
            "en": "Start date."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "end_date",
          "description": {
            "zh": "结束日期；空字符串改为进行中。",
            "en": "End date."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "flow",
          "description": {
            "zh": "light、medium 或 heavy。",
            "en": "Flow."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "pain",
          "description": {
            "zh": "疼痛 0～3。",
            "en": "Pain."
          },
          "type": "number",
          "required": false
        },
        {
          "name": "mood",
          "description": {
            "zh": "情绪。",
            "en": "Mood."
          },
          "type": "string",
          "required": false
        },
        {
          "name": "note",
          "description": {
            "zh": "备注。",
            "en": "Note."
          },
          "type": "string",
          "required": false
        }
      ]
    },
    {
      "name": "delete_period_record",
      "description": {
        "zh": "删除一条生理期记录；删除前应确认。",
        "en": "Delete a period record."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "记录 ID。",
            "en": "ID."
          },
          "type": "string",
          "required": true
        }
      ]
    }
  ]
}
*/


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var db = require("../shared/db.js");
async function wrap(task, message) {
  try { complete({ success: true, message: message, data: await task() }); }
  catch (error) { complete({ success: false, message: error && error.message ? error.message : String(error) }); }
}
exports.ping_life_hub = function () { return wrap(function () { return db.ping(); }, "生活簿正常。"); };
exports.get_life_brief = function () { return wrap(function () { return db.lifeBrief(); }, "精简生活状态已读取。"); };
exports.add_transaction = function (p) { return wrap(function () { return db.addTransaction(p || {}); }, "已记录。"); };
exports.get_spending_summary = function (p) { return wrap(function () { return db.summary(p || {}); }, "汇总完成。"); };
exports.get_recent_transactions = function (p) { return wrap(function () { return db.recentTransactions(p || {}); }, "最近记录已读取。"); };
exports.update_transaction = function (p) { return wrap(function () { return db.updateTransaction(p || {}); }, "记录已更新。"); };
exports.delete_transaction = function (p) { return wrap(function () { return db.deleteTransaction(p && p.id); }, "记录已删除。"); };
exports.query_transactions = function (p) { return wrap(function () { return db.queryTransactions(p || {}); }, "记录查询完成。"); };
exports.get_category_statistics = function (p) { return wrap(function () { return db.statistics(p || {}); }, "统计完成。"); };
exports.get_wallet_overview = function (p) { return wrap(function () { return db.walletOverview(p || {}); }, "钱包概览已读取。"); };
exports.fund_ai_wallet = function (p) { return wrap(function () { return db.fundAiWallet(p || {}); }, "已向 AI 钱包转账。"); };
exports.ai_treat_user = function (p) { return wrap(function () { return db.aiTreatUser(p || {}); }, "AI 支付已同步记录。"); };
exports.record_ai_expense = function (p) { return wrap(function () { return db.recordAiExpense(p || {}); }, "AI 的支出已记录。"); };
exports.ai_transfer_to_user = function (p) { return wrap(function () { return db.aiTransferToUser(p || {}); }, "AI 转账已记录。"); };
exports.set_ai_wallet_balance = function (p) { return wrap(function () { return db.setAiWalletBalance(p || {}); }, "AI 的钱包余额已校准。"); };
exports.query_ai_wallet_transactions = function (p) { return wrap(function () { return db.queryAiWalletTransactions(p || {}); }, "钱包流水已读取。"); };
exports.delete_wallet_event = function (p) { return wrap(function () { return db.deleteWalletEvent(p && p.event_id); }, "钱包事件已删除。"); };
exports.list_categories = function () { return wrap(function () { return db.listCategories(); }, "分类已读取。"); };
exports.add_category = function (p) { return wrap(function () { return db.addCategory(p || {}); }, "分类已新增。"); };
exports.delete_category = function (p) { return wrap(function () { return db.deleteCategory(p && p.name); }, "分类已删除。"); };
exports.add_memo = function (p) { return wrap(function () { return db.addMemo(p || {}); }, "备忘已保存。"); };
exports.query_memos = function (p) { return wrap(function () { return db.listMemos(p || {}); }, "备忘查询完成。"); };
exports.get_due_memos = function (p) { return wrap(function () { return db.dueMemos(p || {}); }, "到期备忘已读取。"); };
exports.update_memo = function (p) { return wrap(function () { return db.updateMemo(p || {}); }, "备忘已更新。"); };
exports.delete_memo = function (p) { return wrap(function () { return db.deleteMemo(p && p.id); }, "备忘已删除。"); };

exports.get_period_status = function (p) { return wrap(function () { return db.periodStatus(p || {}); }, "双方状态已读取。"); };
exports.query_period_records = function (p) { return wrap(function () { return db.listPeriodRecords(p || {}); }, "生理期记录已读取。"); };
exports.start_period = function (p) { return wrap(function () { return db.startPeriod(p || {}); }, "开始状态已记录。"); };
exports.end_period = function (p) { return wrap(function () { return db.endPeriod(p || {}); }, "结束状态已记录。"); };
exports.add_period_record = function (p) { return wrap(function () { return db.addPeriodRecord(p || {}); }, "生理期记录已保存。"); };
exports.update_period_record = function (p) { return wrap(function () { return db.updatePeriodRecord(p || {}); }, "生理期记录已更新。"); };
exports.delete_period_record = function (p) { return wrap(function () { return db.deletePeriodRecord(p && p.id); }, "生理期记录已删除。"); };
