#!/usr/bin/env python3
import argparse
import os
import signal
import subprocess
import time
import json
import re
import shutil
import sqlite3
import sys
import uuid
from datetime import datetime, date, timedelta, timezone
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse, unquote

TZ = timezone(timedelta(hours=8))
BASE_DIR = Path(os.environ.get('LIFE_HUB_DATA_DIR', '/root/dual_life_hub_data'))
DB_PATH = BASE_DIR / 'life_hub.db'
WEB_DIR = Path(os.environ.get('LIFE_HUB_WEB_DIR', '/root/dual_life_hub_v1/public'))
OLD_DB_PATHS = []
OLD_JSON_PATHS = []
MARKER = '__LIFE_HUB_JSON__'
VERSION = '1.0.3'
RUNTIME_DIR = Path(__file__).resolve().parent
PID_PATH = RUNTIME_DIR / 'server.pid'
LOG_PATH = RUNTIME_DIR / 'server.log'
_SCHEMA_READY = False

CATEGORY_RULES = [
    ('餐饮', ['饭', '餐', '食堂', '外卖', '咖啡', '奶茶', '瑞幸', '星巴克', '麦当劳', '肯德基', '火锅', '烧烤', '早餐', '午饭', '晚饭']),
    ('交通', ['滴滴', '打车', '出租', '地铁', '公交', '高铁', '火车', '机票', '航空', '加油', '停车', '共享单车']),
    ('购物', ['淘宝', '京东', '拼多多', '购物', '衣服', '鞋', '化妆品', '日用品', '超市', '便利店']),
    ('学习', ['书', '课程', '学费', '考试', '打印', '文具', '论文', '会员', '云服务器']),
    ('医疗', ['医院', '药', '挂号', '体检', '牙医', '诊所']),
    ('居住', ['房租', '水费', '电费', '燃气', '物业', '宽带']),
    ('娱乐', ['电影', '游戏', '演唱会', '门票', 'KTV', '视频会员', '音乐会员']),
    ('工资', ['工资', '薪资', '奖金', '奖学金', '报销', '补贴']),
]

DEFAULT_CATEGORIES = [
    ('餐饮', '#D97757'), ('交通', '#5E7AA2'), ('购物', '#A66B8A'), ('学习', '#6F8C69'),
    ('医疗', '#B85F68'), ('居住', '#8A7259'), ('娱乐', '#7B6EA8'), ('工资', '#4E8B72'), ('其他', '#7B827E')
]
CATEGORY_COLORS = dict(DEFAULT_CATEGORIES)
CATEGORY_PALETTE = ['#557A65','#B4775A','#6682A3','#98739A','#8B8060','#5F8A88','#A76470','#777F91']


def now_dt():
    return datetime.now(TZ)


def now_iso():
    return now_dt().isoformat(timespec='seconds')


def today_str():
    return now_dt().date().isoformat()


def month_str():
    return today_str()[:7]


def money(value):
    return round(float(value or 0), 2)


def bool_value(value, default=False):
    if isinstance(value, bool):
        return value
    if value in (1, '1', 'true', 'True', 'yes', 'on'):
        return True
    if value in (0, '0', 'false', 'False', 'no', 'off'):
        return False
    return default


def normalize_date(value):
    text = str(value or '').strip()
    if not text:
        return today_str()
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except Exception:
        raise ValueError('日期格式应为 YYYY-MM-DD。')


def normalize_type(value):
    return 'income' if str(value or '').strip().lower() == 'income' else 'expense'


def normalize_owner(value, allow_shared=False):
    text = str(value or 'user').strip().lower()
    aliases = {
        'user': 'user', 'me': 'user', 'mine': 'user', '我': 'user', '我的': 'user',
        'ai': 'ai', 'assistant': 'ai', 'ta': 'ai', 'AI': 'ai', 'ai的': 'ai',
    }
    owner = aliases.get(text, text)
    if owner not in {'user', 'ai'}:
        raise ValueError('归属应为 user（用户）或 ai（AI）。')
    return owner


def clean_tags(value):
    if isinstance(value, list):
        raw = value
    else:
        raw = re.split(r'[,，]', str(value or ''))
    result = []
    for item in raw:
        tag = str(item or '').strip()
        if tag and tag not in result:
            result.append(tag)
    return result[:12]


def new_id(prefix):
    return f'{prefix}_{uuid.uuid4().hex[:14]}'


def _database_record_score(path):
    try:
        if not path.is_file():
            return -1
        conn = sqlite3.connect(f'file:{path}?mode=ro', uri=True, timeout=2.0)
        try:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            score = 0
            if 'transactions' in tables:
                score += int(conn.execute('SELECT COUNT(*) FROM transactions').fetchone()[0])
            if 'memos' in tables:
                score += int(conn.execute('SELECT COUNT(*) FROM memos').fetchone()[0])
            return score
        finally:
            conn.close()
    except Exception:
        return -1


def _backup_database(source, destination):
    temp = destination.with_suffix('.importing.db')
    try:
        if temp.exists():
            temp.unlink()
        src = sqlite3.connect(f'file:{source}?mode=ro', uri=True, timeout=5.0)
        dst = sqlite3.connect(temp, timeout=5.0)
        try:
            src.backup(dst)
            dst.commit()
        finally:
            dst.close()
            src.close()
        os.replace(temp, destination)
    finally:
        if temp.exists():
            temp.unlink()


def migrate_storage_if_needed():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    # Isolated test/custom data directories must not import the phone's legacy database.
    if os.environ.get('LIFE_HUB_DATA_DIR'):
        return

    active_score = _database_record_score(DB_PATH)
    best_path = None
    best_score = active_score
    for old in OLD_DB_PATHS:
        try:
            if old.resolve() == DB_PATH.resolve():
                continue
        except Exception:
            pass
        score = _database_record_score(old)
        if score > best_score:
            best_path, best_score = old, score

    # Recover only when another known database contains strictly more records.
    # This avoids replacing a legitimate empty/new database with another empty file.
    if best_path is not None and best_score > max(active_score, 0):
        if DB_PATH.exists():
            backup = BASE_DIR / f'life_hub_before_recovery_{int(time.time())}.db'
            try:
                shutil.copy2(DB_PATH, backup)
            except Exception:
                pass
        _backup_database(best_path, DB_PATH)


def connect():
    global _SCHEMA_READY
    migrate_storage_if_needed()
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA busy_timeout=10000')
    conn.execute('PRAGMA synchronous=NORMAL')
    conn.execute('PRAGMA foreign_keys=ON')
    # The server initializes once before accepting requests; CLI invocations
    # are single-shot processes. This avoids repeated DDL/WAL setup per request.
    if not _SCHEMA_READY:
        conn.execute('PRAGMA journal_mode=WAL')
        ensure_schema(conn)
        migrate_json(conn)
        _SCHEMA_READY = True
    return conn


def ensure_schema(conn):
    conn.executescript('''
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('expense','income')),
      amount REAL NOT NULL CHECK(amount > 0),
      category TEXT NOT NULL DEFAULT '其他',
      account TEXT NOT NULL DEFAULT '未指定',
      note TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      event_id TEXT,
      event_kind TEXT NOT NULL DEFAULT 'normal',
      payer TEXT NOT NULL DEFAULT 'user',
      counts_user_outflow INTEGER NOT NULL DEFAULT 1,
      counts_user_consumption INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_active ON transactions(deleted_at, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS memos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      owner TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memos_active ON memos(deleted_at, pinned DESC, updated_at DESC);

    CREATE TABLE IF NOT EXISTS period_records (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL CHECK(owner IN ('user','ai')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      flow TEXT NOT NULL DEFAULT '',
      pain INTEGER NOT NULL DEFAULT 0,
      mood TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_period_records_owner_date ON period_records(deleted_at, owner, start_date DESC);

    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_wallet_transactions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      balance_delta REAL NOT NULL,
      category TEXT NOT NULL DEFAULT '其他',
      note TEXT NOT NULL DEFAULT '',
      counterparty TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL,
      linked_user_tx_id TEXT,
      counts_ai_consumption INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY(linked_user_tx_id) REFERENCES transactions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ai_wallet_date ON ai_wallet_transactions(deleted_at, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_wallet_event ON ai_wallet_transactions(event_id);

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    ''')
    # Older builds may miss newer memo columns.
    memo_cols = {row['name'] for row in conn.execute('PRAGMA table_info(memos)')}
    if 'due_date' not in memo_cols:
        conn.execute('ALTER TABLE memos ADD COLUMN due_date TEXT')
    if 'owner' not in memo_cols:
        conn.execute("ALTER TABLE memos ADD COLUMN owner TEXT NOT NULL DEFAULT 'user'")
    conn.execute('CREATE INDEX IF NOT EXISTS idx_memos_owner_active ON memos(deleted_at, owner, pinned DESC, updated_at DESC)')
    conn.execute("UPDATE memos SET owner='user' WHERE owner IS NULL OR trim(owner)='' OR owner NOT IN ('user','ai')")
    tx_cols = {row['name'] for row in conn.execute('PRAGMA table_info(transactions)')}
    tx_migrations = [
        ('event_id', 'ALTER TABLE transactions ADD COLUMN event_id TEXT'),
        ('event_kind', "ALTER TABLE transactions ADD COLUMN event_kind TEXT NOT NULL DEFAULT 'normal'"),
        ('payer', "ALTER TABLE transactions ADD COLUMN payer TEXT NOT NULL DEFAULT 'user'"),
        ('counts_user_outflow', 'ALTER TABLE transactions ADD COLUMN counts_user_outflow INTEGER NOT NULL DEFAULT 1'),
        ('counts_user_consumption', 'ALTER TABLE transactions ADD COLUMN counts_user_consumption INTEGER NOT NULL DEFAULT 1'),
    ]
    for column, statement in tx_migrations:
        if column not in tx_cols:
            conn.execute(statement)
    conn.execute("INSERT OR IGNORE INTO categories(name,color,sort_order,created_at) VALUES('AI钱包','#B2738A',90,?)", (now_iso(),))
    conn.execute("INSERT OR IGNORE INTO categories(name,color,sort_order,created_at) VALUES('AI转账','#7B73A8',91,?)", (now_iso(),))
    seed_categories(conn)
    conn.commit()


def seed_categories(conn):
    if meta_get(conn, 'categories_seeded') != '1':
        for index, (name, color) in enumerate(DEFAULT_CATEGORIES):
            conn.execute('INSERT OR IGNORE INTO categories(name,color,sort_order,created_at) VALUES(?,?,?,?)',
                         (name, color, index, now_iso()))
        meta_set(conn, 'categories_seeded', '1')
    existing = conn.execute("SELECT DISTINCT category FROM transactions WHERE category<>''").fetchall()
    for row in existing:
        name = str(row['category'] or '').strip()
        if name:
            conn.execute('INSERT OR IGNORE INTO categories(name,color,sort_order,created_at) VALUES(?,?,?,?)',
                         (name, CATEGORY_COLORS.get(name, CATEGORY_PALETTE[len(name) % len(CATEGORY_PALETTE)]), 100, now_iso()))


def list_categories(conn):
    rows = conn.execute('''SELECT c.name,c.color,c.sort_order,
        (SELECT COUNT(*) FROM transactions t WHERE t.deleted_at IS NULL AND t.category=c.name) AS usage_count
        FROM categories c ORDER BY c.sort_order ASC, c.created_at ASC, c.name ASC''').fetchall()
    return [dict(row) for row in rows]


def category_color(conn, name):
    row = conn.execute('SELECT color FROM categories WHERE name=?', (str(name or '其他'),)).fetchone()
    return row['color'] if row else CATEGORY_COLORS.get(str(name or ''), CATEGORY_COLORS['其他'])


def add_category(conn, payload):
    name = str(payload.get('name') or '').strip()
    if not name:
        raise ValueError('分类名称不能为空。')
    if len(name) > 12:
        raise ValueError('分类名称最多 12 个字。')
    if name.lower() in ('自动', 'auto'):
        raise ValueError('“自动”是保留名称。')
    color = str(payload.get('color') or '').strip()
    if not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
        count = conn.execute('SELECT COUNT(*) AS n FROM categories').fetchone()['n']
        color = CATEGORY_PALETTE[int(count) % len(CATEGORY_PALETTE)]
    max_order = conn.execute('SELECT COALESCE(MAX(sort_order),0) AS n FROM categories').fetchone()['n']
    try:
        conn.execute('INSERT INTO categories(name,color,sort_order,created_at) VALUES(?,?,?,?)',
                     (name, color.upper(), int(max_order)+1, now_iso()))
    except sqlite3.IntegrityError:
        raise ValueError('这个分类已经存在。')
    conn.commit()
    return next(item for item in list_categories(conn) if item['name'] == name)


def delete_category(conn, name):
    name = str(name or '').strip()
    if not name:
        raise ValueError('缺少分类名称。')
    if name == '其他':
        raise ValueError('“其他”分类不能删除。')
    row = conn.execute('SELECT name FROM categories WHERE name=?', (name,)).fetchone()
    if not row:
        raise ValueError('找不到这个分类。')
    conn.execute("UPDATE transactions SET category='其他',updated_at=? WHERE category=?", (now_iso(), name))
    conn.execute('DELETE FROM categories WHERE name=?', (name,))
    conn.commit()
    return {'name': name, 'deleted': True, 'reassigned_to': '其他'}


def meta_get(conn, key):
    row = conn.execute('SELECT value FROM app_meta WHERE key=?', (key,)).fetchone()
    return row['value'] if row else None


def meta_set(conn, key, value):
    conn.execute('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, str(value)))




SETTINGS_DEFAULTS = {
    'initialized': False,
    'user_name': '你',
    'ai_name': 'TA',
    'period_mode': 'both',
    'user_theme_color': '#557A65',
    'ai_theme_color': '#93677F',
}


def get_settings(conn):
    result = dict(SETTINGS_DEFAULTS)
    raw = meta_get(conn, 'preferences')
    if raw:
        try:
            value = json.loads(raw)
            if isinstance(value, dict):
                result.update(value)
        except Exception:
            pass
    result['initialized'] = bool_value(result.get('initialized'), False)
    result['user_name'] = str(result.get('user_name') or '你').strip()[:24] or '你'
    result['ai_name'] = str(result.get('ai_name') or 'TA').strip()[:24] or 'TA'
    result['period_mode'] = str(result.get('period_mode') or 'both').strip().lower()
    if result['period_mode'] not in {'off', 'user', 'ai', 'both'}:
        result['period_mode'] = 'both'
    # Compatibility: old public builds stored one theme_color for the user side.
    legacy_color = str(result.get('theme_color') or '').strip()
    user_color = str(result.get('user_theme_color') or legacy_color or '#557A65').strip()
    ai_color = str(result.get('ai_theme_color') or '#93677F').strip()
    result['user_theme_color'] = user_color.upper() if re.fullmatch(r'#[0-9A-Fa-f]{6}', user_color) else '#557A65'
    result['ai_theme_color'] = ai_color.upper() if re.fullmatch(r'#[0-9A-Fa-f]{6}', ai_color) else '#93677F'
    result.pop('theme_color', None)
    return result


def update_settings(conn, payload):
    current = get_settings(conn)
    value = dict(current)
    if 'user_name' in payload:
        value['user_name'] = str(payload.get('user_name') or '').strip()[:24] or '你'
    if 'ai_name' in payload:
        value['ai_name'] = str(payload.get('ai_name') or '').strip()[:24] or 'TA'
    if 'period_mode' in payload:
        mode = str(payload.get('period_mode') or '').strip().lower()
        if mode not in {'off', 'user', 'ai', 'both'}:
            raise ValueError('生理期记录模式应为 off、user、ai 或 both。')
        value['period_mode'] = mode
    # theme_color is accepted as a legacy alias for the user's color.
    if 'theme_color' in payload and 'user_theme_color' not in payload:
        payload = dict(payload)
        payload['user_theme_color'] = payload.get('theme_color')
    for key, label in (('user_theme_color', '用户主题色'), ('ai_theme_color', 'AI 主题色')):
        if key in payload:
            color = str(payload.get(key) or '').strip()
            if not re.fullmatch(r'#[0-9A-Fa-f]{6}', color):
                raise ValueError(label + '应为 #RRGGBB。')
            value[key] = color.upper()
    value.pop('theme_color', None)
    if 'initialized' in payload:
        value['initialized'] = bool_value(payload.get('initialized'), current.get('initialized', False))
    meta_set(conn, 'preferences', json.dumps(value, ensure_ascii=False, separators=(',', ':')))
    conn.commit()
    return get_settings(conn)


def allowed_period_owners(conn):
    mode = get_settings(conn)['period_mode']
    if mode == 'both':
        return {'user', 'ai'}
    if mode == 'user':
        return {'user'}
    if mode == 'ai':
        return {'ai'}
    return set()


def ensure_period_owner_allowed(conn, owner):
    if owner not in allowed_period_owners(conn):
        raise ValueError('当前配置未启用该归属的生理期记录。')


def migrate_json(conn):
    if meta_get(conn, 'json_migrated') == '1':
        return
    imported = 0
    for path in OLD_JSON_PATHS:
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            continue
        if isinstance(data, list):
            data = {'transactions': data, 'memos': []}
        if not isinstance(data, dict):
            continue
        for raw in data.get('transactions', []):
            try:
                tx = normalize_tx_input(raw, allow_id=True)
                conn.execute('''INSERT OR IGNORE INTO transactions
                    (id,type,amount,category,account,note,occurred_at,created_at,updated_at,deleted_at)
                    VALUES(?,?,?,?,?,?,?,?,?,NULL)''', (
                    tx['id'], tx['type'], tx['amount'], tx['category'], tx['account'], tx['note'],
                    tx['occurred_at'], tx['created_at'], tx['updated_at']))
                imported += 1
            except Exception:
                pass
        for raw in data.get('memos', []):
            try:
                memo = normalize_memo_input(raw, allow_id=True)
                conn.execute('''INSERT OR IGNORE INTO memos
                    (id,title,content,tags_json,pinned,done,due_date,created_at,updated_at,deleted_at)
                    VALUES(?,?,?,?,?,?,?,?,?,NULL)''', (
                    memo['id'], memo['title'], memo['content'], json.dumps(memo['tags'], ensure_ascii=False),
                    int(memo['pinned']), int(memo['done']), memo['due_date'], memo['created_at'], memo['updated_at']))
                imported += 1
            except Exception:
                pass
    meta_set(conn, 'json_migrated', '1')
    meta_set(conn, 'json_imported_count', imported)
    conn.commit()


def infer_category(conn, text, tx_type='expense'):
    normalized = str(text or '').strip().lower()
    existing = {row['name'] for row in conn.execute('SELECT name FROM categories').fetchall()} if conn else set(CATEGORY_COLORS)
    if tx_type == 'income':
        for category, words in CATEGORY_RULES:
            if category == '工资' and category in existing and any(word.lower() in normalized for word in words):
                return category
        return '其他'
    for category, words in CATEGORY_RULES:
        if category == '工资' or category not in existing:
            continue
        if any(word.lower() in normalized for word in words):
            return category
    return '其他'


def historical_account(conn, category, note):
    note = str(note or '').strip()
    row = None
    if note:
        row = conn.execute('''SELECT account, COUNT(*) AS n FROM transactions
            WHERE deleted_at IS NULL AND note<>'' AND lower(note)=lower(?)
            GROUP BY account ORDER BY n DESC, MAX(occurred_at) DESC LIMIT 1''', (note,)).fetchone()
    if not row and category:
        row = conn.execute('''SELECT account, COUNT(*) AS n FROM transactions
            WHERE deleted_at IS NULL AND category=? AND account<>'未指定'
            GROUP BY account ORDER BY n DESC, MAX(occurred_at) DESC LIMIT 1''', (category,)).fetchone()
    return row['account'] if row else '未指定'


def normalize_tx_input(payload, conn=None, allow_id=False):
    amount = money(payload.get('amount'))
    if amount <= 0:
        raise ValueError('金额必须大于 0。')
    tx_type = normalize_type(payload.get('type'))
    note = str(payload.get('note') or '').strip()
    category = str(payload.get('category') or '').strip()
    if not category or category in ('自动', 'auto'):
        category = infer_category(conn, note, tx_type)
    account = str(payload.get('account') or '').strip()
    if not account or account in ('自动', 'auto'):
        account = historical_account(conn, category, note) if conn is not None else '未指定'
    stamp = now_iso()
    return {
        'id': str(payload.get('id') or new_id('tx')) if allow_id else new_id('tx'),
        'type': tx_type,
        'amount': amount,
        'category': category or '其他',
        'account': account or '未指定',
        'note': note,
        'occurred_at': normalize_date(payload.get('occurred_at')),
        'created_at': str(payload.get('created_at') or stamp),
        'updated_at': str(payload.get('updated_at') or stamp),
        'event_id': str(payload.get('event_id') or '').strip() or None,
        'event_kind': str(payload.get('event_kind') or 'normal').strip() or 'normal',
        'payer': str(payload.get('payer') or 'user').strip() or 'user',
        'counts_user_outflow': bool_value(payload.get('counts_user_outflow'), True),
        'counts_user_consumption': bool_value(payload.get('counts_user_consumption'), True),
    }


def normalize_memo_input(payload, allow_id=False):
    title = str(payload.get('title') or '').strip()
    content = str(payload.get('content') or '').strip()
    if not title and not content:
        raise ValueError('标题和内容不能同时为空。')
    if not title:
        title = content[:30]
    due_text = str(payload.get('due_date') or '').strip()
    stamp = now_iso()
    return {
        'id': str(payload.get('id') or new_id('memo')) if allow_id else new_id('memo'),
        'title': title,
        'content': content,
        'tags': clean_tags(payload.get('tags')),
        'pinned': bool_value(payload.get('pinned'), False),
        'done': bool_value(payload.get('done'), False),
        'due_date': normalize_date(due_text) if due_text else None,
        'owner': normalize_owner(payload.get('owner', 'user'), allow_shared=False),
        'created_at': str(payload.get('created_at') or stamp),
        'updated_at': str(payload.get('updated_at') or stamp),
    }


def tx_dict(row, conn=None):
    if not row:
        return None
    item = dict(row)
    item['amount'] = money(item['amount'])
    item['counts_user_outflow'] = bool(item.get('counts_user_outflow', 1))
    item['counts_user_consumption'] = bool(item.get('counts_user_consumption', 1))
    item['category_color'] = category_color(conn, item['category']) if conn else CATEGORY_COLORS.get(item['category'], CATEGORY_COLORS['其他'])
    return item


def memo_dict(row):
    if not row:
        return None
    item = dict(row)
    try:
        item['tags'] = json.loads(item.pop('tags_json') or '[]')
    except Exception:
        item['tags'] = []
    item['pinned'] = bool(item['pinned'])
    item['done'] = bool(item['done'])
    item['owner'] = str(item.get('owner') or 'user')
    if item['owner'] not in ('user', 'ai'):
        item['owner'] = 'user'
    status = None
    if item.get('due_date') and not item['done']:
        due = date.fromisoformat(item['due_date'])
        today = now_dt().date()
        if due < today:
            status = 'overdue'
        elif due == today:
            status = 'today'
        elif due <= today + timedelta(days=7):
            status = 'upcoming'
        else:
            status = 'future'
    item['due_status'] = status
    return item



def period_record_dict(row):
    if not row:
        return None
    item = dict(row)
    item['pain'] = max(0, min(int(item.get('pain') or 0), 3))
    start = date.fromisoformat(item['start_date'])
    end = date.fromisoformat(item['end_date']) if item.get('end_date') else None
    item['active'] = end is None
    item['day_number'] = ((now_dt().date() - start).days + 1) if end is None else None
    item['duration_days'] = ((end - start).days + 1) if end else None
    return item


def _normalize_period_payload(payload, current=None):
    current = current or {}
    owner = normalize_owner(payload.get('owner', current.get('owner', 'user')), allow_shared=False)
    start_date = normalize_date(payload.get('start_date', current.get('start_date')))
    end_raw = payload.get('end_date', current.get('end_date'))
    end_text = str(end_raw or '').strip()
    end_date = normalize_date(end_text) if end_text else None
    if end_date and end_date < start_date:
        raise ValueError('结束日期不能早于开始日期。')
    flow = str(payload.get('flow', current.get('flow', '')) or '').strip().lower()
    flow_alias = {'少':'light','中':'medium','多':'heavy','light':'light','medium':'medium','heavy':'heavy','':'','none':''}
    flow = flow_alias.get(flow, flow)
    if flow not in ('', 'light', 'medium', 'heavy'):
        raise ValueError('流量应为 light、medium 或 heavy。')
    try:
        pain = int(payload.get('pain', current.get('pain', 0)) or 0)
    except Exception:
        pain = 0
    pain = max(0, min(pain, 3))
    return {
        'owner': owner,
        'start_date': start_date,
        'end_date': end_date,
        'flow': flow,
        'pain': pain,
        'mood': str(payload.get('mood', current.get('mood', '')) or '').strip()[:40],
        'note': str(payload.get('note', current.get('note', '')) or '').strip()[:500],
    }


def start_period(conn, payload):
    owner = normalize_owner(payload.get('owner', 'user'), allow_shared=False)
    ensure_period_owner_allowed(conn, owner)
    active = conn.execute('SELECT * FROM period_records WHERE owner=? AND end_date IS NULL AND deleted_at IS NULL ORDER BY start_date DESC LIMIT 1', (owner,)).fetchone()
    if active:
        return period_record_dict(active)
    data = _normalize_period_payload(dict(payload, owner=owner, end_date=None))
    record_id = new_id('period')
    stamp = now_iso()
    conn.execute('''INSERT INTO period_records
        (id,owner,start_date,end_date,flow,pain,mood,note,created_at,updated_at,deleted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,NULL)''',
        (record_id, data['owner'], data['start_date'], None, data['flow'], data['pain'], data['mood'], data['note'], stamp, stamp))
    conn.commit()
    return period_record_dict(conn.execute('SELECT * FROM period_records WHERE id=?', (record_id,)).fetchone())


def end_period(conn, payload):
    owner = normalize_owner(payload.get('owner', 'user'), allow_shared=False)
    ensure_period_owner_allowed(conn, owner)
    row = conn.execute('SELECT * FROM period_records WHERE owner=? AND end_date IS NULL AND deleted_at IS NULL ORDER BY start_date DESC LIMIT 1', (owner,)).fetchone()
    if not row:
        raise ValueError('当前没有进行中的记录。')
    end_date = normalize_date(payload.get('end_date'))
    if end_date < row['start_date']:
        raise ValueError('结束日期不能早于开始日期。')
    note = str(payload.get('note', row['note']) or '').strip()[:500]
    conn.execute('UPDATE period_records SET end_date=?,note=?,updated_at=? WHERE id=?', (end_date, note, now_iso(), row['id']))
    conn.commit()
    return period_record_dict(conn.execute('SELECT * FROM period_records WHERE id=?', (row['id'],)).fetchone())


def add_period_record(conn, payload):
    data = _normalize_period_payload(payload)
    ensure_period_owner_allowed(conn, data['owner'])
    if data['end_date'] is None:
        active = conn.execute('SELECT id FROM period_records WHERE owner=? AND end_date IS NULL AND deleted_at IS NULL LIMIT 1', (data['owner'],)).fetchone()
        if active:
            raise ValueError('该归属已经有一条进行中的记录。')
    record_id = new_id('period')
    stamp = now_iso()
    conn.execute('''INSERT INTO period_records
        (id,owner,start_date,end_date,flow,pain,mood,note,created_at,updated_at,deleted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,NULL)''',
        (record_id, data['owner'], data['start_date'], data['end_date'], data['flow'], data['pain'], data['mood'], data['note'], stamp, stamp))
    conn.commit()
    return period_record_dict(conn.execute('SELECT * FROM period_records WHERE id=?', (record_id,)).fetchone())


def update_period_record(conn, payload):
    record_id = str(payload.get('id') or '').strip()
    row = conn.execute('SELECT * FROM period_records WHERE id=? AND deleted_at IS NULL', (record_id,)).fetchone()
    if not row:
        raise ValueError('找不到这条生理期记录。')
    data = _normalize_period_payload(payload, dict(row))
    ensure_period_owner_allowed(conn, data['owner'])
    if data['end_date'] is None:
        active = conn.execute('SELECT id FROM period_records WHERE owner=? AND end_date IS NULL AND deleted_at IS NULL AND id<>? LIMIT 1', (data['owner'], record_id)).fetchone()
        if active:
            raise ValueError('该归属已经有另一条进行中的记录。')
    conn.execute('''UPDATE period_records SET owner=?,start_date=?,end_date=?,flow=?,pain=?,mood=?,note=?,updated_at=? WHERE id=?''',
        (data['owner'], data['start_date'], data['end_date'], data['flow'], data['pain'], data['mood'], data['note'], now_iso(), record_id))
    conn.commit()
    return period_record_dict(conn.execute('SELECT * FROM period_records WHERE id=?', (record_id,)).fetchone())


def delete_period_record(conn, record_id):
    record_id = str(record_id or '').strip()
    result = conn.execute('UPDATE period_records SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL', (now_iso(), now_iso(), record_id))
    if result.rowcount == 0:
        raise ValueError('找不到这条生理期记录。')
    conn.commit()
    return {'id': record_id, 'deleted': True}


def list_period_records(conn, owner='all', limit=50):
    limit = max(1, min(int(limit or 50), 200))
    owner_text = str(owner or 'all').strip().lower()
    sql = 'SELECT * FROM period_records WHERE deleted_at IS NULL'
    params = []
    if owner_text != 'all':
        owner_text = normalize_owner(owner_text, allow_shared=False)
        sql += ' AND owner=?'
        params.append(owner_text)
    sql += ' ORDER BY start_date DESC,created_at DESC LIMIT ?'
    params.append(limit)
    return [period_record_dict(row) for row in conn.execute(sql, params).fetchall()]


def period_status(conn, history_limit=3):
    result = {'user': None, 'ai': None, 'recent': []}
    allowed = allowed_period_owners(conn)
    for owner in ('user', 'ai'):
        if owner not in allowed:
            continue
        row = conn.execute('SELECT * FROM period_records WHERE owner=? AND deleted_at IS NULL ORDER BY CASE WHEN end_date IS NULL THEN 0 ELSE 1 END,start_date DESC LIMIT 1', (owner,)).fetchone()
        result[owner] = period_record_dict(row) if row else None
    if int(history_limit or 0) > 0:
        result['recent'] = list_period_records(conn, 'all', min(int(history_limit), 12))
    return result

def month_range(month=None):
    text = str(month or month_str()).strip()
    try:
        first = date.fromisoformat(text + '-01')
    except Exception:
        first = date.fromisoformat(month_str() + '-01')
    next_month = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    return first.isoformat(), (next_month - timedelta(days=1)).isoformat(), first.strftime('%Y-%m')


def _insert_user_transaction(conn, payload, *, event_id=None, event_kind='normal', payer='user', counts_outflow=True, counts_consumption=True):
    enriched = dict(payload or {})
    enriched.update({
        'event_id': event_id,
        'event_kind': event_kind,
        'payer': payer,
        'counts_user_outflow': bool(counts_outflow),
        'counts_user_consumption': bool(counts_consumption),
    })
    item = normalize_tx_input(enriched, conn=conn)
    conn.execute('''INSERT INTO transactions
        (id,type,amount,category,account,note,occurred_at,created_at,updated_at,event_id,event_kind,payer,
         counts_user_outflow,counts_user_consumption,deleted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)''', (
        item['id'], item['type'], item['amount'], item['category'], item['account'], item['note'],
        item['occurred_at'], item['created_at'], item['updated_at'], item['event_id'], item['event_kind'], item['payer'],
        int(item['counts_user_outflow']), int(item['counts_user_consumption'])))
    return tx_dict(conn.execute('SELECT * FROM transactions WHERE id=?', (item['id'],)).fetchone(), conn)


def add_transaction(conn, payload):
    with conn:
        result = _insert_user_transaction(conn, payload, event_kind='normal', payer='user', counts_outflow=True, counts_consumption=True)
    return result


def _assert_normal_transaction(row):
    if str(row['event_kind'] or 'normal') != 'normal' or row['event_id']:
        raise ValueError('这是钱包关联账单，请从“小钱包”中修改或删除整条关联事件。')


def update_transaction(conn, payload):
    tx_id = str(payload.get('id') or '').strip()
    row = conn.execute('SELECT * FROM transactions WHERE id=? AND deleted_at IS NULL', (tx_id,)).fetchone()
    if not row:
        raise ValueError('找不到这笔记录。')
    _assert_normal_transaction(row)
    current = dict(row)
    merged = dict(current)
    for key in ('type', 'amount', 'category', 'account', 'note', 'occurred_at'):
        if key in payload:
            merged[key] = payload.get(key)
    normalized = normalize_tx_input(merged, conn=conn, allow_id=True)
    conn.execute('''UPDATE transactions SET type=?,amount=?,category=?,account=?,note=?,occurred_at=?,updated_at=?
        WHERE id=?''', (
        normalized['type'], normalized['amount'], normalized['category'], normalized['account'],
        normalized['note'], normalized['occurred_at'], now_iso(), tx_id))
    conn.commit()
    return tx_dict(conn.execute('SELECT * FROM transactions WHERE id=?', (tx_id,)).fetchone(), conn)


def delete_transaction(conn, tx_id):
    row = conn.execute('SELECT * FROM transactions WHERE id=? AND deleted_at IS NULL', (tx_id,)).fetchone()
    if not row:
        raise ValueError('找不到这笔记录。')
    _assert_normal_transaction(row)
    conn.execute('UPDATE transactions SET deleted_at=?, updated_at=? WHERE id=?', (now_iso(), now_iso(), tx_id))
    conn.commit()
    return {'id': tx_id, 'deleted': True}


def restore_transaction(conn, tx_id):
    row = conn.execute('SELECT * FROM transactions WHERE id=? AND deleted_at IS NOT NULL', (tx_id,)).fetchone()
    if not row:
        raise ValueError('找不到可恢复的记录。')
    _assert_normal_transaction(row)
    conn.execute('UPDATE transactions SET deleted_at=NULL, updated_at=? WHERE id=?', (now_iso(), tx_id))
    conn.commit()
    return tx_dict(conn.execute('SELECT * FROM transactions WHERE id=?', (tx_id,)).fetchone(), conn)


def recent_transactions(conn, limit=5):
    limit = max(1, min(int(limit or 5), 100))
    rows = conn.execute('''SELECT * FROM transactions WHERE deleted_at IS NULL
        ORDER BY occurred_at DESC, created_at DESC LIMIT ?''', (limit,)).fetchall()
    return [tx_dict(row, conn) for row in rows]


def list_transactions(conn, month=None, query='', tx_type='all', category='', limit=100, offset=0):
    start, end, normalized_month = month_range(month)
    limit = max(1, min(int(limit or 100), 500))
    offset = max(0, int(offset or 0))
    sql = 'SELECT * FROM transactions WHERE deleted_at IS NULL AND occurred_at BETWEEN ? AND ?'
    params = [start, end]
    tx_type = str(tx_type or 'all').strip().lower()
    if tx_type in ('expense', 'income'):
        sql += ' AND type=?'; params.append(tx_type)
    category = str(category or '').strip()
    if category and category != 'all':
        sql += ' AND category=?'; params.append(category)
    query = str(query or '').strip().lower()
    if query:
        token = f'%{query}%'
        sql += ' AND (lower(note) LIKE ? OR lower(category) LIKE ? OR lower(account) LIKE ?)'
        params += [token, token, token]
    sql += ' ORDER BY occurred_at DESC, created_at DESC LIMIT ? OFFSET ?'
    params += [limit, offset]
    rows = conn.execute(sql, params).fetchall()
    return {'month': normalized_month, 'items': [tx_dict(row, conn) for row in rows], 'limit': limit, 'offset': offset}


def _category_statistics(conn, source, start, end):
    if source == 'ai_consumption':
        rows = conn.execute('''SELECT category, SUM(amount) AS total, COUNT(*) AS count
            FROM ai_wallet_transactions
            WHERE deleted_at IS NULL AND counts_ai_consumption=1 AND balance_delta<0 AND occurred_at BETWEEN ? AND ?
            GROUP BY category ORDER BY total DESC''', (start, end)).fetchall()
    else:
        flag = 'counts_user_consumption' if source == 'user_actual_consumption' else 'counts_user_outflow'
        rows = conn.execute(f'''SELECT category, SUM(amount) AS total, COUNT(*) AS count
            FROM transactions WHERE deleted_at IS NULL AND type='expense' AND {flag}=1 AND occurred_at BETWEEN ? AND ?
            GROUP BY category ORDER BY total DESC''', (start, end)).fetchall()
    total = money(sum(float(row['total'] or 0) for row in rows))
    result = []
    for row in rows:
        amount = money(row['total'])
        result.append({
            'category': row['category'], 'amount': amount, 'count': int(row['count']),
            'percent': round((amount / total * 100), 1) if total > 0 else 0,
            'color': category_color(conn, row['category'])
        })
    return result


def ai_wallet_balance(conn):
    row = conn.execute('''SELECT COALESCE(SUM(balance_delta),0) AS balance
        FROM ai_wallet_transactions WHERE deleted_at IS NULL''').fetchone()
    return money(row['balance'])


def wallet_metrics(conn, month=None):
    start, end, normalized_month = month_range(month)
    user = conn.execute('''SELECT
        COALESCE(SUM(CASE WHEN type='expense' AND counts_user_outflow=1 THEN amount ELSE 0 END),0) AS user_outflow,
        COALESCE(SUM(CASE WHEN type='expense' AND counts_user_consumption=1 THEN amount ELSE 0 END),0) AS user_actual
        FROM transactions WHERE deleted_at IS NULL AND occurred_at BETWEEN ? AND ?''', (start, end)).fetchone()
    ai = conn.execute('''SELECT
        COALESCE(SUM(CASE WHEN counts_ai_consumption=1 AND balance_delta<0 THEN amount ELSE 0 END),0) AS ai_consumption,
        COALESCE(SUM(CASE WHEN kind='funding' AND balance_delta>0 THEN amount ELSE 0 END),0) AS funding_received,
        COALESCE(SUM(CASE WHEN kind='treat_user' AND balance_delta<0 THEN amount ELSE 0 END),0) AS treat_user,
        COALESCE(SUM(CASE WHEN kind='ai_expense' AND balance_delta<0 THEN amount ELSE 0 END),0) AS ai_own_expense,
        COALESCE(SUM(CASE WHEN kind='transfer_to_user' AND balance_delta<0 THEN amount ELSE 0 END),0) AS transfer_to_user,
        COALESCE(SUM(CASE WHEN kind='balance_adjustment' THEN balance_delta ELSE 0 END),0) AS balance_adjustment_net
        FROM ai_wallet_transactions WHERE deleted_at IS NULL AND occurred_at BETWEEN ? AND ?''', (start, end)).fetchone()
    return {
        'month': normalized_month,
        'user_outflow': money(user['user_outflow']),
        'user_actual_consumption': money(user['user_actual']),
        'ai_consumption': money(ai['ai_consumption']),
        'funding_received': money(ai['funding_received']),
        'treat_user': money(ai['treat_user']),
        'ai_own_expense': money(ai['ai_own_expense']),
        'transfer_to_user': money(ai['transfer_to_user']),
        'balance_adjustment_net': money(ai['balance_adjustment_net']),
        'ai_wallet_balance': ai_wallet_balance(conn),
    }


def wallet_balance_breakdown(conn):
    row = conn.execute('''SELECT
        COALESCE(SUM(CASE WHEN kind='funding' AND balance_delta>0 THEN amount ELSE 0 END),0) AS funding_received,
        COALESCE(SUM(CASE WHEN kind='balance_adjustment' THEN balance_delta ELSE 0 END),0) AS balance_adjustment_net,
        COALESCE(SUM(CASE WHEN kind='treat_user' AND balance_delta<0 THEN amount ELSE 0 END),0) AS treat_user,
        COALESCE(SUM(CASE WHEN kind='ai_expense' AND balance_delta<0 THEN amount ELSE 0 END),0) AS ai_own_expense,
        COALESCE(SUM(CASE WHEN kind='transfer_to_user' AND balance_delta<0 THEN amount ELSE 0 END),0) AS transfer_to_user,
        COALESCE(SUM(CASE WHEN balance_delta>0 THEN balance_delta ELSE 0 END),0) AS total_inflow,
        COALESCE(SUM(CASE WHEN balance_delta<0 THEN -balance_delta ELSE 0 END),0) AS total_outflow
        FROM ai_wallet_transactions WHERE deleted_at IS NULL''').fetchone()
    return {
        'funding_received': money(row['funding_received']),
        'balance_adjustment_net': money(row['balance_adjustment_net']),
        'treat_user': money(row['treat_user']),
        'ai_own_expense': money(row['ai_own_expense']),
        'transfer_to_user': money(row['transfer_to_user']),
        'total_inflow': money(row['total_inflow']),
        'total_outflow': money(row['total_outflow']),
        'balance': ai_wallet_balance(conn),
    }


def transaction_statistics(conn, month=None):
    start, end, normalized_month = month_range(month)
    summary = transaction_summary(conn, normalized_month)
    sets = {
        'user_outflow': _category_statistics(conn, 'user_outflow', start, end),
        'user_actual_consumption': _category_statistics(conn, 'user_actual_consumption', start, end),
        'ai_consumption': _category_statistics(conn, 'ai_consumption', start, end),
    }
    return {
        'month': normalized_month,
        'summary': summary,
        'metrics': wallet_metrics(conn, normalized_month),
        'categories': sets['user_outflow'],
        'category_sets': sets,
    }


def transaction_summary(conn, month=None):
    start, end, normalized_month = month_range(month)
    row = conn.execute('''SELECT
        COALESCE(SUM(CASE WHEN type='expense' AND counts_user_outflow=1 THEN amount ELSE 0 END),0) AS expense,
        COALESCE(SUM(CASE WHEN type='expense' AND counts_user_consumption=1 THEN amount ELSE 0 END),0) AS actual_consumption,
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
        COUNT(*) AS count
        FROM transactions WHERE deleted_at IS NULL AND occurred_at BETWEEN ? AND ?''', (start, end)).fetchone()
    expense = money(row['expense'])
    income = money(row['income'])
    actual = money(row['actual_consumption'])
    top = conn.execute('''SELECT category, SUM(amount) AS total FROM transactions
        WHERE deleted_at IS NULL AND type='expense' AND counts_user_outflow=1 AND occurred_at BETWEEN ? AND ?
        GROUP BY category ORDER BY total DESC LIMIT 1''', (start, end)).fetchone()
    metrics = wallet_metrics(conn, normalized_month)
    return {
        'month': normalized_month,
        'expense': expense,
        'user_outflow': expense,
        'actual_consumption': actual,
        'user_actual_consumption': actual,
        'ai_consumption': metrics['ai_consumption'],
        'ai_wallet_balance': metrics['ai_wallet_balance'],
        'income': income,
        'balance': money(income - expense),
        'count': int(row['count']),
        'top_category': top['category'] if top else None,
        'top_category_amount': money(top['total']) if top else 0,
    }


def add_memo(conn, payload):
    item = normalize_memo_input(payload)
    conn.execute('''INSERT INTO memos
        (id,title,content,tags_json,pinned,done,due_date,owner,created_at,updated_at,deleted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,NULL)''', (
        item['id'], item['title'], item['content'], json.dumps(item['tags'], ensure_ascii=False),
        int(item['pinned']), int(item['done']), item['due_date'], item['owner'], item['created_at'], item['updated_at']))
    conn.commit()
    return memo_dict(conn.execute('SELECT * FROM memos WHERE id=?', (item['id'],)).fetchone())


def update_memo(conn, payload):
    memo_id = str(payload.get('id') or '').strip()
    row = conn.execute('SELECT * FROM memos WHERE id=? AND deleted_at IS NULL', (memo_id,)).fetchone()
    if not row:
        raise ValueError('找不到这条备忘。')
    current = memo_dict(row)
    title = str(payload.get('title', current['title']) or '').strip()
    content = str(payload.get('content', current['content']) or '').strip()
    if not title and not content:
        raise ValueError('标题和内容不能同时为空。')
    if not title:
        title = content[:30]
    tags = clean_tags(payload.get('tags')) if 'tags' in payload else current['tags']
    pinned = bool_value(payload.get('pinned'), current['pinned']) if 'pinned' in payload else current['pinned']
    done = bool_value(payload.get('done'), current['done']) if 'done' in payload else current['done']
    owner = normalize_owner(payload.get('owner', current.get('owner', 'user')), allow_shared=False)
    due_date = current.get('due_date')
    if 'due_date' in payload:
        due_text = str(payload.get('due_date') or '').strip()
        due_date = normalize_date(due_text) if due_text else None
    conn.execute('''UPDATE memos SET title=?,content=?,tags_json=?,pinned=?,done=?,due_date=?,owner=?,updated_at=? WHERE id=?''', (
        title, content, json.dumps(tags, ensure_ascii=False), int(pinned), int(done), due_date, owner, now_iso(), memo_id))
    conn.commit()
    return memo_dict(conn.execute('SELECT * FROM memos WHERE id=?', (memo_id,)).fetchone())


def delete_memo(conn, memo_id):
    result = conn.execute('UPDATE memos SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL', (now_iso(), now_iso(), memo_id))
    if result.rowcount == 0:
        raise ValueError('找不到这条备忘。')
    conn.commit()
    return {'id': memo_id, 'deleted': True}


def restore_memo(conn, memo_id):
    result = conn.execute('UPDATE memos SET deleted_at=NULL, updated_at=? WHERE id=? AND deleted_at IS NOT NULL', (now_iso(), memo_id))
    if result.rowcount == 0:
        raise ValueError('找不到可恢复的备忘。')
    conn.commit()
    return memo_dict(conn.execute('SELECT * FROM memos WHERE id=?', (memo_id,)).fetchone())


def list_memos(conn, query='', status='all', limit=100, owner='all'):
    limit = max(1, min(int(limit or 100), 300))
    sql = 'SELECT * FROM memos WHERE deleted_at IS NULL'
    params = []
    query = str(query or '').strip().lower()
    status = str(status or 'all').strip().lower()
    owner_text = str(owner or 'all').strip().lower()
    if owner_text != 'all':
        owner_text = normalize_owner(owner_text, allow_shared=False)
        sql += ' AND owner=?'
        params.append(owner_text)
    if status == 'pinned':
        sql += ' AND pinned=1'
    elif status == 'todo':
        sql += ' AND done=0'
    elif status == 'done':
        sql += ' AND done=1'
    if query:
        sql += ' AND (lower(title) LIKE ? OR lower(content) LIKE ? OR lower(tags_json) LIKE ?)'
        token = f'%{query}%'
        params += [token, token, token]
    sql += ' ORDER BY pinned DESC, done ASC, CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, updated_at DESC LIMIT ?'
    params.append(limit)
    return [memo_dict(row) for row in conn.execute(sql, params).fetchall()]


def due_memos(conn, days=7, owner='all'):
    days = max(0, min(int(days or 7), 365))
    today = now_dt().date()
    end = today + timedelta(days=days)
    sql = '''SELECT * FROM memos WHERE deleted_at IS NULL AND done=0 AND due_date IS NOT NULL AND due_date<=?'''
    params = [end.isoformat()]
    owner_text = str(owner or 'all').strip().lower()
    if owner_text != 'all':
        owner_text = normalize_owner(owner_text, allow_shared=False)
        sql += ' AND owner=?'
        params.append(owner_text)
    sql += ' ORDER BY due_date ASC, pinned DESC'
    return [memo_dict(row) for row in conn.execute(sql, params).fetchall()]


def wallet_entry_dict(row):
    if not row:
        return None
    item = dict(row)
    item['amount'] = money(item['amount'])
    item['balance_delta'] = money(item['balance_delta'])
    item['counts_ai_consumption'] = bool(item.get('counts_ai_consumption', 0))
    item['category_color'] = CATEGORY_COLORS.get(item['category'], CATEGORY_PALETTE[len(item['category']) % len(CATEGORY_PALETTE)])
    return item


def _wallet_amount(payload):
    amount = money(payload.get('amount'))
    if amount <= 0:
        raise ValueError('金额必须大于 0。')
    return amount


def _require_ai_balance(conn, amount):
    balance = ai_wallet_balance(conn)
    if amount > balance + 1e-9:
        raise ValueError(f'AI 钱包余额不足：当前 ¥{balance:.2f}，需要 ¥{amount:.2f}。')
    return balance


def _insert_ai_wallet_entry(conn, *, event_id, kind, amount, delta, category, note, counterparty, occurred_at, linked_user_tx_id=None, counts_consumption=False):
    entry_id = new_id('aw')
    stamp = now_iso()
    conn.execute('''INSERT INTO ai_wallet_transactions
        (id,event_id,kind,amount,balance_delta,category,note,counterparty,occurred_at,linked_user_tx_id,
         counts_ai_consumption,created_at,updated_at,deleted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)''', (
        entry_id, event_id, kind, money(amount), money(delta), str(category or '其他'), str(note or ''),
        str(counterparty or ''), normalize_date(occurred_at), linked_user_tx_id, int(bool(counts_consumption)), stamp, stamp))
    return wallet_entry_dict(conn.execute('SELECT * FROM ai_wallet_transactions WHERE id=?', (entry_id,)).fetchone())


def fund_ai_wallet(conn, payload):
    amount = _wallet_amount(payload)
    event_id = new_id('evt')
    occurred_at = normalize_date(payload.get('occurred_at'))
    prefs = get_settings(conn)
    note = str(payload.get('note') or f"给{prefs['ai_name']}转账").strip()
    account = str(payload.get('account') or '未指定').strip() or '未指定'
    with conn:
        user_tx = _insert_user_transaction(conn, {
            'amount': amount, 'type': 'expense', 'category': 'AI钱包', 'account': account,
            'note': note, 'occurred_at': occurred_at,
        }, event_id=event_id, event_kind='fund_ai_wallet', payer='user', counts_outflow=True, counts_consumption=False)
        ai_tx = _insert_ai_wallet_entry(conn, event_id=event_id, kind='funding', amount=amount, delta=amount,
            category='收到转账', note=note, counterparty=prefs['user_name'], occurred_at=occurred_at,
            linked_user_tx_id=user_tx['id'], counts_consumption=False)
    return {'event_id': event_id, 'user_transaction': user_tx, 'ai_transaction': ai_tx, 'balance': ai_wallet_balance(conn)}


def ai_treat_user(conn, payload):
    amount = _wallet_amount(payload)
    _require_ai_balance(conn, amount)
    event_id = new_id('evt')
    occurred_at = normalize_date(payload.get('occurred_at'))
    prefs = get_settings(conn)
    note = str(payload.get('note') or f"{prefs['ai_name']}请我").strip()
    category = str(payload.get('category') or '').strip()
    if not category or category in ('自动', 'auto'):
        category = infer_category(conn, note, 'expense')
    with conn:
        user_tx = _insert_user_transaction(conn, {
            'amount': amount, 'type': 'expense', 'category': category, 'account': 'AI钱包',
            'note': note, 'occurred_at': occurred_at,
        }, event_id=event_id, event_kind='ai_treat_user', payer='ai', counts_outflow=False, counts_consumption=True)
        ai_tx = _insert_ai_wallet_entry(conn, event_id=event_id, kind='treat_user', amount=amount, delta=-amount,
            category=category, note=note, counterparty=prefs['user_name'], occurred_at=occurred_at,
            linked_user_tx_id=user_tx['id'], counts_consumption=True)
    return {'event_id': event_id, 'user_transaction': user_tx, 'ai_transaction': ai_tx, 'balance': ai_wallet_balance(conn)}


def record_ai_expense(conn, payload):
    amount = _wallet_amount(payload)
    _require_ai_balance(conn, amount)
    event_id = new_id('evt')
    occurred_at = normalize_date(payload.get('occurred_at'))
    prefs = get_settings(conn)
    note = str(payload.get('note') or f"{prefs['ai_name']}的消费").strip()
    category = str(payload.get('category') or '').strip()
    if not category or category in ('自动', 'auto'):
        category = infer_category(conn, note, 'expense')
    with conn:
        ai_tx = _insert_ai_wallet_entry(conn, event_id=event_id, kind='ai_expense', amount=amount, delta=-amount,
            category=category, note=note, counterparty=prefs['ai_name'], occurred_at=occurred_at, counts_consumption=True)
    return {'event_id': event_id, 'ai_transaction': ai_tx, 'balance': ai_wallet_balance(conn)}


def ai_transfer_to_user(conn, payload):
    amount = _wallet_amount(payload)
    _require_ai_balance(conn, amount)
    event_id = new_id('evt')
    occurred_at = normalize_date(payload.get('occurred_at'))
    prefs = get_settings(conn)
    note = str(payload.get('note') or f"{prefs['ai_name']}给我转账").strip()
    account = str(payload.get('account') or '未指定').strip() or '未指定'
    with conn:
        user_tx = _insert_user_transaction(conn, {
            'amount': amount, 'type': 'income', 'category': 'AI转账', 'account': account,
            'note': note, 'occurred_at': occurred_at,
        }, event_id=event_id, event_kind='ai_transfer_to_user', payer='ai', counts_outflow=False, counts_consumption=False)
        ai_tx = _insert_ai_wallet_entry(conn, event_id=event_id, kind='transfer_to_user', amount=amount, delta=-amount,
            category='转账', note=note, counterparty=prefs['user_name'], occurred_at=occurred_at,
            linked_user_tx_id=user_tx['id'], counts_consumption=False)
    return {'event_id': event_id, 'user_transaction': user_tx, 'ai_transaction': ai_tx, 'balance': ai_wallet_balance(conn)}


def set_ai_wallet_balance(conn, payload):
    target = money(payload.get('balance'))
    if target < 0:
        raise ValueError('钱包余额不能小于 0。')
    current = ai_wallet_balance(conn)
    delta = money(target - current)
    if abs(delta) < 0.005:
        return {'event_id': None, 'balance': current, 'changed': False}
    event_id = new_id('evt')
    occurred_at = normalize_date(payload.get('occurred_at'))
    note = str(payload.get('note') or '余额校准').strip()
    with conn:
        ai_tx = _insert_ai_wallet_entry(conn, event_id=event_id, kind='balance_adjustment', amount=abs(delta), delta=delta,
            category='余额校准', note=note, counterparty='系统', occurred_at=occurred_at, counts_consumption=False)
    return {'event_id': event_id, 'ai_transaction': ai_tx, 'balance': ai_wallet_balance(conn), 'changed': True}


def list_ai_wallet_transactions(conn, month=None, query='', kind='all', limit=100, offset=0):
    limit = max(1, min(int(limit or 100), 500))
    offset = max(0, int(offset or 0))
    sql = 'SELECT * FROM ai_wallet_transactions WHERE deleted_at IS NULL'
    params = []
    normalized_month = None
    if month:
        start, end, normalized_month = month_range(month)
        sql += ' AND occurred_at BETWEEN ? AND ?'
        params += [start, end]
    kind = str(kind or 'all').strip()
    if kind != 'all':
        sql += ' AND kind=?'; params.append(kind)
    query = str(query or '').strip().lower()
    if query:
        token = f'%{query}%'
        sql += ' AND (lower(note) LIKE ? OR lower(category) LIKE ? OR lower(counterparty) LIKE ?)'
        params += [token, token, token]
    sql += ' ORDER BY occurred_at DESC, created_at DESC LIMIT ? OFFSET ?'
    params += [limit, offset]
    rows = conn.execute(sql, params).fetchall()
    return {'month': normalized_month, 'balance': ai_wallet_balance(conn), 'items': [wallet_entry_dict(row) for row in rows], 'limit': limit, 'offset': offset}


def wallet_overview(conn, month=None):
    _, _, normalized_month = month_range(month)
    return {
        'version': VERSION,
        'balance': ai_wallet_balance(conn),
        'metrics': wallet_metrics(conn, normalized_month),
        'breakdown': wallet_balance_breakdown(conn),
        'recent_transactions': list_ai_wallet_transactions(conn, None, limit=12)['items'],
    }


def delete_wallet_event(conn, event_id):
    event_id = str(event_id or '').strip()
    row = conn.execute('SELECT * FROM ai_wallet_transactions WHERE event_id=? AND deleted_at IS NULL', (event_id,)).fetchone()
    if not row:
        raise ValueError('找不到这条钱包事件。')
    current = ai_wallet_balance(conn)
    projected = money(current - float(row['balance_delta']))
    if projected < -1e-9:
        raise ValueError('删除后 AI 钱包会变成负数，请先校准或删除后续支出。')
    stamp = now_iso()
    with conn:
        conn.execute('UPDATE ai_wallet_transactions SET deleted_at=?,updated_at=? WHERE event_id=?', (stamp, stamp, event_id))
        conn.execute('UPDATE transactions SET deleted_at=?,updated_at=? WHERE event_id=? AND deleted_at IS NULL', (stamp, stamp, event_id))
    return {'event_id': event_id, 'deleted': True, 'balance': ai_wallet_balance(conn)}


def life_brief(conn):
    memo_counts = {'user': 0, 'ai': 0}
    for row in conn.execute('SELECT owner,COUNT(*) AS n FROM memos WHERE deleted_at IS NULL AND done=0 GROUP BY owner').fetchall():
        memo_counts[str(row['owner'] or 'user')] = int(row['n'])
    due = due_memos(conn, 7)[:3]
    periods = period_status(conn, 0)
    compact_periods = {}
    for owner in ('user', 'ai'):
        item = periods.get(owner)
        compact_periods[owner] = None if not item else {
            'active': bool(item.get('active')),
            'day_number': item.get('day_number'),
            'start_date': item.get('start_date'),
            'end_date': item.get('end_date'),
            'flow': item.get('flow') or '',
            'pain': int(item.get('pain') or 0),
            'mood': item.get('mood') or '',
        }
    return {
        'settings': get_settings(conn),
        'memo_todo_counts': memo_counts,
        'due_soon': [{'id': m['id'], 'owner': m['owner'], 'title': m['title'], 'due_date': m.get('due_date')} for m in due],
        'periods': compact_periods,
    }


def dashboard(conn):
    memo_counts = {row['owner']: int(row['n']) for row in conn.execute('SELECT owner,COUNT(*) AS n FROM memos WHERE deleted_at IS NULL GROUP BY owner').fetchall()}
    return {
        'version': VERSION,
        'settings': get_settings(conn),
        'summary': transaction_summary(conn),
        'wallet': wallet_overview(conn),
        'recent_transactions': recent_transactions(conn, 5),
        'categories': list_categories(conn),
        'memos': list_memos(conn, limit=120),
        'memo_counts': {'user': memo_counts.get('user', 0), 'ai': memo_counts.get('ai', 0)},
        'due_memos': due_memos(conn, 7),
        'periods': period_status(conn, 6),
        'database': str(DB_PATH),
    }


def action(conn, name, payload):
    if name == 'ping':
        tx_count = int(conn.execute('SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL').fetchone()[0])
        memo_count = int(conn.execute('SELECT COUNT(*) FROM memos WHERE deleted_at IS NULL').fetchone()[0])
        return {
            'ok': True,
            'version': VERSION,
            'database': str(DB_PATH),
            'database_exists': DB_PATH.exists(),
            'transactions': tx_count,
            'memos': memo_count,
            'period_records': int(conn.execute('SELECT COUNT(*) FROM period_records WHERE deleted_at IS NULL').fetchone()[0]),
            'ai_wallet_balance': ai_wallet_balance(conn),
            'ai_wallet_transactions': int(conn.execute('SELECT COUNT(*) FROM ai_wallet_transactions WHERE deleted_at IS NULL').fetchone()[0]),
        }
    if name == 'dashboard':
        return dashboard(conn)
    if name == 'get_settings':
        return get_settings(conn)
    if name == 'update_settings':
        return update_settings(conn, payload)
    if name == 'life_brief':
        return life_brief(conn)
    if name == 'wallet_overview':
        return wallet_overview(conn, payload.get('month'))
    if name == 'fund_ai_wallet':
        return fund_ai_wallet(conn, payload)
    if name == 'ai_treat_user':
        return ai_treat_user(conn, payload)
    if name == 'record_ai_expense':
        return record_ai_expense(conn, payload)
    if name == 'ai_transfer_to_user':
        return ai_transfer_to_user(conn, payload)
    if name == 'set_ai_wallet_balance':
        return set_ai_wallet_balance(conn, payload)
    if name == 'query_ai_wallet_transactions':
        return list_ai_wallet_transactions(conn, payload.get('month'), payload.get('query',''), payload.get('kind','all'), payload.get('limit',100), payload.get('offset',0))
    if name == 'delete_wallet_event':
        return delete_wallet_event(conn, payload.get('event_id'))
    if name == 'add_transaction':
        return add_transaction(conn, payload)
    if name == 'update_transaction':
        return update_transaction(conn, payload)
    if name == 'delete_transaction':
        return delete_transaction(conn, str(payload.get('id') or ''))
    if name == 'restore_transaction':
        return restore_transaction(conn, str(payload.get('id') or ''))
    if name == 'recent_transactions':
        return recent_transactions(conn, payload.get('limit', 5))
    if name == 'summary':
        return transaction_summary(conn, payload.get('month'))
    if name == 'query_transactions':
        return list_transactions(conn, payload.get('month'), payload.get('query',''), payload.get('type','all'), payload.get('category',''), payload.get('limit',100), payload.get('offset',0))
    if name == 'statistics':
        return transaction_statistics(conn, payload.get('month'))
    if name == 'list_categories':
        return list_categories(conn)
    if name == 'add_category':
        return add_category(conn, payload)
    if name == 'delete_category':
        return delete_category(conn, payload.get('name'))
    if name == 'add_memo':
        return add_memo(conn, payload)
    if name == 'update_memo':
        return update_memo(conn, payload)
    if name == 'delete_memo':
        return delete_memo(conn, str(payload.get('id') or ''))
    if name == 'restore_memo':
        return restore_memo(conn, str(payload.get('id') or ''))
    if name == 'list_memos':
        return list_memos(conn, payload.get('query', ''), payload.get('status', 'all'), payload.get('limit', 20), payload.get('owner', 'all'))
    if name == 'due_memos':
        return due_memos(conn, payload.get('days', 7), payload.get('owner', 'all'))
    if name == 'period_status':
        return period_status(conn, payload.get('history_limit', 3))
    if name == 'list_period_records':
        return list_period_records(conn, payload.get('owner', 'all'), payload.get('limit', 20))
    if name == 'start_period':
        return start_period(conn, payload)
    if name == 'end_period':
        return end_period(conn, payload)
    if name == 'add_period_record':
        return add_period_record(conn, payload)
    if name == 'update_period_record':
        return update_period_record(conn, payload)
    if name == 'delete_period_record':
        return delete_period_record(conn, payload.get('id'))
    raise ValueError(f'未知操作：{name}')


def read_payload(path):
    if not path:
        return {}
    p = Path(path)
    if not p.is_file():
        return {}
    value = json.loads(p.read_text(encoding='utf-8'))
    return value if isinstance(value, dict) else {}


class Handler(SimpleHTTPRequestHandler):
    server_version = 'DualLifeHub/1.0.3'

    def translate_path(self, path):
        parsed = urlparse(path)
        relative = parsed.path.lstrip('/') or 'index.html'
        target = (WEB_DIR / relative).resolve()
        root = WEB_DIR.resolve()
        if root not in target.parents and target != root:
            return str(WEB_DIR / 'index.html')
        return str(target)

    def log_message(self, format, *args):
        sys.stdout.write('[web] ' + format % args + '\n')
        sys.stdout.flush()

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def json_body(self):
        length = int(self.headers.get('Content-Length', '0') or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        value = json.loads(raw.decode('utf-8'))
        return value if isinstance(value, dict) else {}

    def api_route(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if self.command == 'GET' and path == '/api/health':
            return HTTPStatus.OK, {'ok': True, 'version': VERSION}

        conn = connect()
        try:
            if self.command == 'POST' and path.startswith('/api/action/'):
                action_name = unquote(path[len('/api/action/'):])
                return HTTPStatus.OK, action(conn, action_name, self.json_body())
            if self.command == 'GET' and path == '/api/dashboard':
                return HTTPStatus.OK, dashboard(conn)
            if self.command == 'GET' and path == '/api/settings':
                return HTTPStatus.OK, get_settings(conn)
            if self.command in ('POST', 'PATCH') and path == '/api/settings':
                return HTTPStatus.OK, update_settings(conn, self.json_body())
            if self.command == 'GET' and path == '/api/statistics':
                return HTTPStatus.OK, transaction_statistics(conn, query.get('month', [None])[0])
            if self.command == 'GET' and path == '/api/transactions':
                return HTTPStatus.OK, list_transactions(
                    conn, query.get('month', [None])[0], query.get('query', [''])[0],
                    query.get('type', ['all'])[0], query.get('category', [''])[0],
                    query.get('limit', ['100'])[0], query.get('offset', ['0'])[0])
            if self.command == 'GET' and path == '/api/categories':
                return HTTPStatus.OK, list_categories(conn)
            if self.command == 'POST' and path == '/api/categories':
                return HTTPStatus.CREATED, add_category(conn, self.json_body())
            if self.command == 'DELETE' and path.startswith('/api/categories/'):
                return HTTPStatus.OK, delete_category(conn, unquote(path.split('/')[-1]))
            if self.command == 'GET' and path == '/api/memos':
                return HTTPStatus.OK, list_memos(
                    conn,
                    query.get('query', [''])[0],
                    query.get('status', ['all'])[0],
                    query.get('limit', ['100'])[0],
                    query.get('owner', ['all'])[0],
                )
            if self.command == 'GET' and path == '/api/periods':
                return HTTPStatus.OK, {'status': period_status(conn, 6), 'items': list_period_records(conn, query.get('owner', ['all'])[0], query.get('limit', ['100'])[0])}
            if self.command == 'POST' and path == '/api/periods/start':
                return HTTPStatus.CREATED, start_period(conn, self.json_body())
            if self.command == 'POST' and path == '/api/periods/end':
                return HTTPStatus.OK, end_period(conn, self.json_body())
            if self.command == 'POST' and path == '/api/periods':
                return HTTPStatus.CREATED, add_period_record(conn, self.json_body())
            if path.startswith('/api/periods/'):
                period_id = path.split('/')[-1]
                if self.command == 'PATCH':
                    payload = self.json_body(); payload['id'] = period_id
                    return HTTPStatus.OK, update_period_record(conn, payload)
                if self.command == 'DELETE':
                    return HTTPStatus.OK, delete_period_record(conn, period_id)
            if self.command == 'POST' and path == '/api/transactions':
                return HTTPStatus.CREATED, add_transaction(conn, self.json_body())
            if path.startswith('/api/transactions/'):
                tx_id = path.split('/')[-1]
                if self.command == 'PATCH':
                    payload = self.json_body(); payload['id'] = tx_id
                    return HTTPStatus.OK, update_transaction(conn, payload)
                if self.command == 'DELETE':
                    return HTTPStatus.OK, delete_transaction(conn, tx_id)
            if self.command == 'POST' and path.startswith('/api/restore/transaction/'):
                return HTTPStatus.OK, restore_transaction(conn, path.split('/')[-1])
            if self.command == 'POST' and path == '/api/memos':
                return HTTPStatus.CREATED, add_memo(conn, self.json_body())
            if path.startswith('/api/memos/'):
                memo_id = path.split('/')[-1]
                if self.command == 'PATCH':
                    payload = self.json_body(); payload['id'] = memo_id
                    return HTTPStatus.OK, update_memo(conn, payload)
                if self.command == 'DELETE':
                    return HTTPStatus.OK, delete_memo(conn, memo_id)
            if self.command == 'POST' and path.startswith('/api/restore/memo/'):
                return HTTPStatus.OK, restore_memo(conn, path.split('/')[-1])
            return HTTPStatus.NOT_FOUND, {'message': 'Not found'}
        finally:
            conn.close()

    def do_GET(self):
        if self.path.startswith('/api/'):
            try:
                status, data = self.api_route()
                self.send_json(status, {'success': True, 'data': data})
            except Exception as exc:
                self.send_json(HTTPStatus.BAD_REQUEST, {'success': False, 'message': str(exc)})
            return
        if self.path == '/' or self.path.startswith('/?'):
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        try:
            status, data = self.api_route()
            self.send_json(status, {'success': True, 'data': data})
        except Exception as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {'success': False, 'message': str(exc)})

    def do_PATCH(self):
        return self.do_POST()

    def do_DELETE(self):
        return self.do_POST()


def cli(action_name, payload_path):
    conn = connect()
    try:
        result = action(conn, action_name, read_payload(payload_path))
        print(MARKER + json.dumps({'success': True, 'data': result}, ensure_ascii=False, separators=(',', ':')))
    except Exception as exc:
        print(MARKER + json.dumps({'success': False, 'message': str(exc), 'error_type': type(exc).__name__}, ensure_ascii=False, separators=(',', ':')))
        raise
    finally:
        conn.close()


def _read_pid():
    try:
        value = PID_PATH.read_text(encoding='utf-8').strip()
        return int(value) if value.isdigit() else None
    except Exception:
        return None


def _is_our_server(pid, port):
    try:
        raw = Path(f'/proc/{pid}/cmdline').read_bytes().replace(b'\x00', b' ')
        cmdline = raw.decode('utf-8', errors='replace')
        script = str(Path(__file__).resolve())
        return script in cmdline and '--serve' in cmdline and str(int(port)) in cmdline
    except Exception:
        return False


def _stop_existing_server(port):
    pid = _read_pid()
    if not pid:
        PID_PATH.unlink(missing_ok=True)
        return
    if not _is_our_server(pid, port):
        PID_PATH.unlink(missing_ok=True)
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        PID_PATH.unlink(missing_ok=True)
        return
    except Exception:
        return
    deadline = time.time() + 3.0
    while time.time() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            break
        except Exception:
            break
        time.sleep(0.1)
    PID_PATH.unlink(missing_ok=True)


def daemon_start(port):
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    _stop_existing_server(port)
    command = [sys.executable, str(Path(__file__).resolve()), '--serve', str(int(port))]
    child_env = os.environ.copy()
    child_env.pop('PYTHONHOME', None)
    child_env.pop('PYTHONPATH', None)
    child_env.update({'PYTHONUTF8': '1', 'LC_ALL': 'C', 'LANG': 'C'})
    with open(LOG_PATH, 'ab', buffering=0) as log_file:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            close_fds=True,
            start_new_session=True,
            env=child_env,
        )
    PID_PATH.write_text(str(process.pid), encoding='utf-8')
    time.sleep(0.35)
    exit_code = process.poll()
    if exit_code is not None:
        PID_PATH.unlink(missing_ok=True)
        try:
            detail = LOG_PATH.read_text(encoding='utf-8', errors='replace')[-2000:]
        except Exception:
            detail = ''
        raise RuntimeError(f'后台服务启动后立即退出（code={exit_code}）。\n{detail}')
    print(f'detached:{process.pid}', flush=True)


def serve(port):
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    conn.close()
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    PID_PATH.write_text(str(os.getpid()), encoding='utf-8')
    print(f'Dual Life Hub server listening on http://127.0.0.1:{port}', flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        try:
            if _read_pid() == os.getpid():
                PID_PATH.unlink(missing_ok=True)
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--serve', type=int)
    parser.add_argument('--daemon', type=int)
    parser.add_argument('--cli', nargs=2, metavar=('ACTION', 'PAYLOAD'))
    args = parser.parse_args()
    if args.serve:
        serve(args.serve)
    elif args.daemon:
        daemon_start(args.daemon)
    elif args.cli:
        cli(args.cli[0], args.cli[1])
    else:
        parser.error('use --serve PORT, --daemon PORT, or --cli ACTION PAYLOAD')


if __name__ == '__main__':
    main()
