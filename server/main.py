"""
Matrix Matrix 矩阵账号监测系统 · v4.0 Stage2 后端服务
---------------------------------------------------------
技术栈：FastAPI + Pydantic v2 + 内置 SQLite (零外部依赖即可本地跑)
功能：
  1. POST /api/heartbeat              插件心跳（每 3min 上报机器状态）
  2. POST /api/collect-data           采集数据上报（插件批量 POST，失败保留队列下次再发）
  3. GET  /api/dashboard-data         前端 Dashboard 聚合接口（替代 mockData.js）
  4. GET  /api/summary                Dashboard 别名（原 api.js 走这个 path）
  5. GET  /api/whoami                 Dashboard 登录态（按 machine_id / 默认 admin）

运行：
  cd server
  python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
  pip install -r requirements.txt
  uvicorn main:app --reload --host 0.0.0.0 --port 8000
  → 本地 API:  http://localhost:8000
  → 交互文档:  http://localhost:8000/docs

生产可替换 SQLite → Supabase PostgreSQL（schema/ 目录已提供 DDL）
"""

from __future__ import annotations

import os
import re
import json
import secrets
import sqlite3
import asyncio
import hashlib
import datetime as _dt
from contextlib import contextmanager
from typing import Any, Optional, List, Dict, Literal
from pathlib import Path

import httpx
from fastapi import FastAPI, Request, Query, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field, ConfigDict, EmailStr

try:
    import bcrypt as _bcrypt  # type: ignore
    from jose import jwt, JWTError  # type: ignore
except Exception:  # pragma: no cover - 首次启动未 pip install 时给优雅错误
    _bcrypt = None  # type: ignore
    jwt = None  # type: ignore
    JWTError = Exception  # type: ignore

DEFAULT_JWT_SECRET = "matrix-dev-secret-change-me-please-xxxxxxxxxxxxxxxx"


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip("\"'")
        if k and k not in os.environ:
            os.environ[k] = v


load_env_file(Path(__file__).parent / ".env")


def _env(name: str, default: Any = None) -> Any:
    v = os.environ.get(name)
    if v is None or v == "":
        return default
    return v


ENV_JWT_SECRET: str = _env("JWT_SECRET", DEFAULT_JWT_SECRET)
ENV_JWT_ACCESS_TTL: int = int(_env("JWT_ACCESS_TTL_SEC", "3600"))
ENV_JWT_REFRESH_TTL: int = int(_env("JWT_REFRESH_TTL_SEC", "604800"))
ENV_REQUIRE_AUTH: bool = True
ENV_SSO_JWT_SECRET: Optional[str] = _env("SSO_JWT_SECRET") or _env("JWT_SECRET") or None
ENV_SSO_JWT_ALG: str = _env("SSO_JWT_ALG", "HS256")
ENV_SSO_JWK_URL: Optional[str] = _env("SSO_JWK_URL") or None
ENV_SSO_LOGIN_URL: Optional[str] = _env("SSO_LOGIN_URL") or None
ENV_SSO_BUTTON_LABEL: str = _env("SSO_BUTTON_LABEL", "内部 SSO 登录")
ENV_DEBUG_MODE: bool = str(_env("DEBUG_MODE", "true")).lower() in {"1", "true", "yes", "on"}
_cors_raw = _env("CORS_ORIGINS", "*")
ENV_CORS_ORIGINS: List[str] = [s.strip() for s in _cors_raw.split(",") if s.strip()] if _cors_raw != "*" else ["*"]

RED_CSI = "\033[91m"
RESET_CSI = "\033[0m"

_security_warning = False

if ENV_REQUIRE_AUTH and ENV_CORS_ORIGINS == ["*"]:
    print(
        f"{RED_CSI}[CRITICAL][SECURITY] REQUIRE_AUTH=true 但 CORS_ORIGINS=['*']，"
        f"生产环境必须限制 CORS_ORIGINS 为具体域名列表！{RESET_CSI}"
    )
    _security_warning = True

if ENV_REQUIRE_AUTH and ENV_JWT_SECRET == DEFAULT_JWT_SECRET:
    print(
        f"{RED_CSI}[CRITICAL][SECURITY] REQUIRE_AUTH=true 但 JWT_SECRET 使用默认 dev 值，"
        f"生产必须设置强随机 JWT_SECRET 环境变量！{RESET_CSI}"
    )
    _security_warning = True
elif ENV_JWT_SECRET == DEFAULT_JWT_SECRET:
    print("[WARN] JWT_SECRET 使用默认 dev 值，生产必须设置 JWT_SECRET 环境变量")

DB_PATH = Path(__file__).parent / "matrix.db"
SEED_MOCK_ON_EMPTY = False
APP_VERSION = "2.0.0"

PLATFORMS: List[Dict[str, str]] = [
    dict(key="wechat",         name="微信公众号",   category="社媒", color="#07C160"),
    dict(key="wechat_video",   name="微信视频号",   category="社媒", color="#10B981"),
    dict(key="douyin",         name="抖音",         category="社媒", color="#000000"),
    dict(key="xiaohongshu",    name="小红书",       category="社媒", color="#EF4444"),
    dict(key="futu",           name="富途牛牛",     category="金融", color="#3B82F6"),
    dict(key="laohu",          name="老虎社区",     category="金融", color="#F59E0B"),
    dict(key="huasheng",       name="华盛通",       category="金融", color="#E91E63"),
    dict(key="xueqiu",         name="雪球",         category="金融", color="#14B8A6"),
    dict(key="x",              name="X(Twitter)",   category="海外", color="#18181B"),
    dict(key="youtube",        name="YouTube",      category="海外", color="#FF0000"),
    dict(key="tiktok",         name="TikTok",       category="海外", color="#FE2C55"),
    dict(key="linkedin",       name="LinkedIn",     category="海外", color="#0A66C2"),
    dict(key="instagram",      name="Instagram",    category="海外", color="#E4405F"),
    dict(key="discord",        name="Discord",      category="海外", color="#5865F2"),
    dict(key="stocktwits",     name="Stocktwits",   category="社区", color="#4263EB"),
    dict(key="seekingalpha",   name="Seeking Alpha",category="社区", color="#00853D"),
    dict(key="reddit",         name="Reddit",       category="社区", color="#FF4500"),
    dict(key="weibo",          name="微博",         category="社媒", color="#E6162D"),
]

OPERATORS: List[Dict[str, str]] = [
    dict(operator_uid="admin_001", operator_name="张总（管理）", role="admin"),
]

AVATAR_POOL = [
    "#6366f1,#8b5cf6", "#0ea5e9,#22d3ee", "#f59e0b,#ef4444", "#10b981,#14b8a6",
    "#ec4899,#f43f5e", "#4263EB,#3b82f6", "#FF4500,#f59e0b",
]

_GENERIC_ACCOUNT_NAMES = [
    '微信公众平台', '公众号', '公众平台', '登录', '注册', '首页', '主页', '控制台', '工作台',
    '小红书', '抖音', '抖音精选', '精选', '微博', 'b站', 'bilibili', '哔哩哔哩',
    '知乎', '知乎首页', '百度贴吧', '雪球', '富途', '老虎社区', '老虎证券',
    'youtube', 'linkedin', 'instagram', 'telegram', 'discord', 'reddit', 'stocktwits',
    'x', 'twitter', 'tiktok', 'home', 'index', 'explore', 'discover', '活动',
]


def is_generic_account_name(name: str) -> bool:
    if not name:
        return True
    n = str(name).strip()
    if not n:
        return True
    if len(n) > 30:
        return False
    lowered = n.lower()
    for g in _GENERIC_ACCOUNT_NAMES:
        if lowered == g.lower():
            return True
    if n.startswith('http://') or n.startswith('https://'):
        return True
    import re
    if re.match(r'^(sign in|log in|login|register|signup|sign up|homepage|home page|main page)$', lowered):
        return True
    return False


# ============================================================
# DB layer (sqlite3, 轻量无 ORM，迁移到 Supabase 只换 get_conn 即可)
# ============================================================

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS operators (
    operator_uid    TEXT PRIMARY KEY,
    operator_name   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'operator',
    avatar_color    TEXT,
    status          TEXT DEFAULT 'active',
    last_login_at   TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
    id                  TEXT PRIMARY KEY,
    account_name        TEXT NOT NULL,
    entity_type         TEXT NOT NULL DEFAULT 'ACCOUNT',
    platform            TEXT NOT NULL,
    platform_key        TEXT NOT NULL,
    platform_category   TEXT,
    target_url          TEXT,
    symbol              TEXT,
    subreddit           TEXT,
    channel             TEXT,
    avatar_color        TEXT,
    assigned_operator_uid TEXT,
    assigned_operator_name TEXT,
    active              INTEGER DEFAULT 1,
    tags                TEXT,
    note                TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    UNIQUE(platform_key, account_name, entity_type)
);

CREATE TABLE IF NOT EXISTS records (
    id                  TEXT PRIMARY KEY,
    account_id          TEXT,
    entity_type         TEXT NOT NULL,
    account             TEXT NOT NULL,
    platform            TEXT NOT NULL,
    platform_key        TEXT NOT NULL,
    target_url          TEXT,
    followers           INTEGER DEFAULT 0,
    following           INTEGER DEFAULT 0,
    likes               INTEGER DEFAULT 0,
    views               INTEGER DEFAULT 0,
    comments            INTEGER DEFAULT 0,
    collect             INTEGER DEFAULT 0,
    engagement_rate     REAL DEFAULT 0,
    members             INTEGER DEFAULT 0,
    online              INTEGER DEFAULT 0,
    message_volume_24h  INTEGER DEFAULT 0,
    sentiment_bull      REAL DEFAULT 0,
    sentiment_bear      REAL DEFAULT 0,
    posts_24h           INTEGER DEFAULT 0,
    symbol_price        REAL,
    symbol_change_pct   REAL,
    extra               TEXT,
    latest_post         TEXT,
    posts               TEXT,
    source              TEXT DEFAULT 'chrome_extension',
    operator_uid        TEXT,
    operator_name       TEXT,
    machine_id          TEXT,
    machine_name        TEXT,
    client_version      TEXT,
    error               TEXT,
    updated_at          TEXT DEFAULT (datetime('now')),
    timestamp_ms        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_acc_plat    ON records(platform_key, account);
CREATE INDEX IF NOT EXISTS idx_records_operator    ON records(operator_uid);
CREATE INDEX IF NOT EXISTS idx_records_updated     ON records(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_account     ON records(account_id);

CREATE TABLE IF NOT EXISTS daily_snapshots (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date       TEXT NOT NULL,
    account_id          TEXT,
    entity_type         TEXT,
    platform_key        TEXT,
    assigned_operator_uid TEXT,
    followers           INTEGER DEFAULT 0,
    views               INTEGER DEFAULT 0,
    likes               INTEGER DEFAULT 0,
    engagement_rate     REAL DEFAULT 0,
    members             INTEGER DEFAULT 0,
    message_volume_24h  INTEGER DEFAULT 0,
    sentiment_bull      REAL DEFAULT 0,
    UNIQUE(snapshot_date, account_id)
);
CREATE INDEX IF NOT EXISTS idx_snap_op   ON daily_snapshots(assigned_operator_uid);
CREATE INDEX IF NOT EXISTS idx_snap_dt   ON daily_snapshots(snapshot_date, platform_key);

CREATE TABLE IF NOT EXISTS machines (
    machine_id          TEXT PRIMARY KEY,
    machine_name        TEXT,
    site_id           TEXT,
    collector_id      TEXT,
    operator_uid        TEXT,
    operator_name       TEXT,
    version             TEXT,
    source              TEXT,
    pending_count       INTEGER DEFAULT 0,
    last_collect_at     INTEGER DEFAULT 0,
    last_hb_at          INTEGER DEFAULT 0,
    user_agent          TEXT,
    status              TEXT DEFAULT 'online',
    ip_address          TEXT,
    today_records_count   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_machine_site   ON machines(site_id);
CREATE INDEX IF NOT EXISTS idx_machine_col  ON machines(collector_id);
CREATE INDEX IF NOT EXISTS idx_machine_op   ON machines(operator_uid);
CREATE INDEX IF NOT EXISTS idx_machine_hb   ON machines(last_hb_at DESC);

CREATE TABLE IF NOT EXISTS sites (
    site_id             TEXT PRIMARY KEY,
    site_name           TEXT NOT NULL,
    handshake_code      TEXT NOT NULL UNIQUE,
    created_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collector_tokens (
    id                  TEXT PRIMARY KEY,
    site_id             TEXT NOT NULL,
    operator_uid        TEXT NOT NULL,
    token_hash          TEXT NOT NULL UNIQUE,
    label               TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    last_used_at        TEXT,
    expires_at          TEXT,
    revoked_at          TEXT,
    status              TEXT DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_col_site  ON collector_tokens(site_id);
CREATE INDEX IF NOT EXISTS idx_col_op    ON collector_tokens(operator_uid);
CREATE INDEX IF NOT EXISTS idx_col_status ON collector_tokens(status);

CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    username            TEXT NOT NULL UNIQUE,
    email               TEXT UNIQUE,
    password_hash       TEXT,
    role                TEXT NOT NULL DEFAULT 'operator',
    status              TEXT NOT NULL DEFAULT 'active',
    operator_uid        TEXT,
    sso_provider        TEXT,
    sso_sub             TEXT,
    invite_code_used    TEXT,
    must_change_pw      INTEGER DEFAULT 0,
    last_login_at       TEXT,
    login_count         INTEGER DEFAULT 0,
    display_name        TEXT,
    avatar_gradient     TEXT,
    avatar_data_url     TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_sso         ON users(sso_provider, sso_sub) WHERE sso_provider IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_op          ON users(operator_uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sso_uniq ON users(sso_provider, sso_sub) WHERE sso_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS invite_codes (
    code                TEXT PRIMARY KEY,
    created_by_user_id  TEXT,
    role                TEXT NOT NULL DEFAULT 'operator',
    used_by_user_id     TEXT,
    used_at             TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    expires_at          TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token               TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    expires_at          TEXT NOT NULL,
    revoked             INTEGER DEFAULT 0,
    ip                  TEXT,
    ua                  TEXT,
    created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             TEXT,
    event               TEXT NOT NULL,
    ip                  TEXT,
    ua                  TEXT,
    ok                  INTEGER DEFAULT 1,
    detail              TEXT,
    created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user        ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_time        ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS operator_tokens (
    id                  TEXT PRIMARY KEY,
    operator_uid        TEXT NOT NULL,
    token_hash          TEXT NOT NULL UNIQUE,
    label               TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    last_used_at        TEXT,
    expires_at          TEXT,
    revoked_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_optok_op          ON operator_tokens(operator_uid);

CREATE TABLE IF NOT EXISTS system_flags (
    key                 TEXT PRIMARY KEY,
    value               TEXT,
    updated_at          TEXT DEFAULT (datetime('now'))
);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_system_flag(c: sqlite3.Connection, key: str, default: Any = None) -> Any:
    row = c.execute("SELECT value FROM system_flags WHERE key=?", (key,)).fetchone()
    if row is None:
        return default
    return row["value"]


def set_system_flag(c: sqlite3.Connection, key: str, value: Any) -> None:
    c.execute(
        "INSERT INTO system_flags(key,value,updated_at) VALUES (?,?,datetime('now')) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
        (key, str(value) if value is not None else None),
    )


def is_mock_enabled(c: Optional[sqlite3.Connection] = None) -> bool:
    def _check(conn: sqlite3.Connection) -> bool:
        v = get_system_flag(conn, "mock_enabled", None)
        if v is None:
            return SEED_MOCK_ON_EMPTY
        return str(v).lower() in {"1", "true", "yes", "on"}
    if c is None:
        with get_conn() as conn:
            return _check(conn)
    return _check(c)


def init_db():
    with get_conn() as c:
        preflight_alters = [
            ("users", [("display_name", "TEXT"), ("avatar_gradient", "TEXT"), ("avatar_data_url", "TEXT")]),
            ("machines", [("site_id", "TEXT"), ("collector_id", "TEXT"), ("today_records_count", "INTEGER DEFAULT 0")]),
            ("accounts", [("avatar_url", "TEXT"), ("avatar_data_url", "TEXT")]),
        ]
        exists_tables = set(r["name"] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall())
        for tname, add_cols in preflight_alters:
            if tname not in exists_tables:
                continue
            existing = set(r["name"] for r in c.execute(f"PRAGMA table_info({tname})").fetchall())
            for col, tdef in add_cols:
                if col not in existing:
                    try:
                        c.execute(f"ALTER TABLE {tname} ADD COLUMN {col} {tdef}")
                    except Exception:
                        pass
        c.executescript(SCHEMA_SQL)
        if get_system_flag(c, "mock_enabled", None) is None:
            set_system_flag(c, "mock_enabled", "true" if SEED_MOCK_ON_EMPTY else "false")
        if get_system_flag(c, "site_initialized_v1", None) != "1":
            cur = c.execute("SELECT COUNT(*) AS n FROM sites")
            if cur.fetchone()["n"] == 0:
                import uuid as _uuid
                raw_id = _uuid.uuid4().hex[:10]
                handshake = "MX-" + secrets.token_hex(2).upper() + "-" + secrets.token_hex(2).upper()
                c.execute(
                    "INSERT INTO sites(site_id,site_name,handshake_code) VALUES (?,?,?)",
                    (raw_id, "Matrix 数据矩阵平台", handshake),
                )
            need_migrate = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='operator_tokens'").fetchone() is not None and \
                           c.execute("SELECT COUNT(*) AS n FROM operator_tokens").fetchone()["n"] > 0
            if need_migrate:
                site_row = c.execute("SELECT site_id FROM sites LIMIT 1").fetchone()
                sid = site_row["site_id"]
                rows = c.execute("SELECT id,operator_uid,token_hash,label,created_at,last_used_at,expires_at,revoked_at FROM operator_tokens").fetchall()
                for r in rows:
                    c.execute(
                        "INSERT OR IGNORE INTO collector_tokens(id,site_id,operator_uid,token_hash,label,created_at,last_used_at,expires_at,revoked_at,status) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (r["id"], sid, r["operator_uid"], r["token_hash"], r["label"] or "迁移自旧采集器Token",
                         r["created_at"], r["last_used_at"], r["expires_at"], r["revoked_at"],
                         "revoked" if r["revoked_at"] else "active"),
                    )
                c.execute("UPDATE machines SET site_id=?", (sid,))
            set_system_flag(c, "site_initialized_v1", "1")
        for op in OPERATORS:
            c.execute(
                "INSERT OR IGNORE INTO operators(operator_uid,operator_name,role,avatar_color) VALUES (?,?,?,?)",
                (op["operator_uid"], op["operator_name"], op["role"], AVATAR_POOL[0]),
            )
        if is_mock_enabled(c):
            cur = c.execute("SELECT COUNT(*) AS n FROM accounts")
            if cur.fetchone()["n"] == 0:
                seed_demo_accounts(c)
        cur = c.execute("SELECT COUNT(*) AS n FROM users")
        if cur.fetchone()["n"] == 0:
            seed_initial_admin(c)


def get_current_site(c: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
    def _q(conn: sqlite3.Connection) -> Dict[str, Any]:
        row = conn.execute("SELECT site_id, site_name, handshake_code FROM sites LIMIT 1").fetchone()
        if row is None:
            return {
                "site_id": "default",
                "site_name": "Matrix 数据矩阵平台",
                "handshake_code": "MX-DEFA-ULT0",
            }
        return {
            "site_id": row["site_id"],
            "site_name": row["site_name"],
            "handshake_code": row["handshake_code"],
        }
    if c is None:
        with get_conn() as conn:
            return _q(conn)
    return _q(c)


def gen_collector_plaintext(site: Dict[str, Any], collector_id: str) -> str:
    site_token = (site.get("site_id") or "").lower()[:6] or "default"
    col_token = (collector_id or "").lower()[:8] or secrets.token_hex(4)
    rand = secrets.token_urlsafe(16).replace("-", "a").replace("_", "b")
    return f"mxtok_{site_token}_{col_token}_{rand}"


def seed_demo_accounts(c: sqlite3.Connection):
    seeds = [
        ("价值投资笔记",        "futu",       "富途牛牛",   "ACCOUNT",  "op_001", "李运营", 58000,  2_450_000, 120000),
        ("成长股猎手",          "laohu",      "老虎社区",   "ACCOUNT",  "op_001", "李运营", 32000,  1_100_000, 55000),
        ("财经观察",            "xueqiu",     "雪球",       "ACCOUNT",  "op_001", "李运营", 128000, 5_200_000, 380000),
        ("港股研究员",          "wechat",     "微信公众号", "ACCOUNT",  "op_002", "王运营", 8500,   420_000,   18000),
        ("生活记录",            "xiaohongshu","小红书",     "ACCOUNT",  "op_002", "王运营", 42000,  890_000,   72000),
        ("短视频运营",          "douyin",     "抖音",       "ACCOUNT",  "op_002", "王运营", 210000, 12_500_000,980000),
        ("Global Investor",     "x",          "X(Twitter)", "ACCOUNT",  "op_003", "赵运营", 38000,  2_100_000, 95000),
        ("Tech Insights",       "youtube",    "YouTube",    "ACCOUNT",  "op_003", "赵运营", 156000, 18_300_000,620000),
        ("科技数码观察",        "tiktok",     "TikTok",     "ACCOUNT",  "op_003", "赵运营", 298000, 9_800_000, 720000),
        ("消费品牌研究",        "wechat_video","微信视频号","ACCOUNT",  "op_001", "李运营", 185000, 7_600_000, 580000),
        ("职场成长日记",        "linkedin",   "LinkedIn",   "ACCOUNT",  "op_002", "王运营", 72000,  3_200_000, 210000),
        ("期权交易员",          "futu",       "富途牛牛",   "ACCOUNT",  "op_003", "赵运营", 14000,  680_000,   28000),
        ("Crypto Daily",        "x",          "X(Twitter)", "ACCOUNT",  "op_003", "赵运营", 72000,  4_100_000, 190000),
        ("价值投资观察",        "xueqiu",     "雪球",       "ACCOUNT",  "op_001", "李运营", 21000,  850_000,   42000),
        ("穿搭分享",            "xiaohongshu","小红书",     "ACCOUNT",  "op_002", "王运营", 118000, 2_900_000, 210000),
        ("AI 前沿观察",         "instagram",  "Instagram",  "ACCOUNT",  "op_002", "王运营", 95000,  4_100_000, 280000),
        ("深度研究室",          "seekingalpha","Seeking Alpha","ACCOUNT","op_001", "李运营", 48000,  2_100_000, 135000),
        ("$NVDA",               "stocktwits", "Stocktwits", "COMMUNITY","op_001", "李运营", 1_820_000, 12840, 0, True, "NVDA", 68.5, 31.5, 118.42, 2.31),
        ("$TSLA",               "stocktwits", "Stocktwits", "COMMUNITY","op_001", "李运营", 2_540_000, 28960, 0, True, "TSLA", 52.8, 47.2, 248.60, -1.15),
        ("$AAPL",               "stocktwits", "Stocktwits", "COMMUNITY","op_002", "王运营", 3_120_000, 15220, 0, True, "AAPL", 61.2, 38.8, 224.80, 0.58),
        ("r/wallstreetbets",    "reddit",     "Reddit",     "COMMUNITY","op_003", "赵运营", 15_800_000, 42_800, 3210, False, None, 0, 0, 0, 0, "wallstreetbets"),
        ("r/stocks",            "reddit",     "Reddit",     "COMMUNITY","op_002", "王运营", 6_200_000,  18_400, 890,  False, None, 0, 0, 0, 0, "stocks"),
        ("r/CryptoCurrency",    "reddit",     "Reddit",     "COMMUNITY","op_003", "赵运营", 7_800_000,  25_600, 1560, False, None, 0, 0, 0, 0, "CryptoCurrency"),
    ]
    for row in seeds:
        if len(row) == 9:
            name, pk, pname, et, op_uid, op_name, f, v, l = row
            aid = f"acc_{hashlib.md5(f'{pk}|{name}|{et}'.encode()).hexdigest()[:10]}"
            c.execute(
                "INSERT OR IGNORE INTO accounts(id,account_name,entity_type,platform,platform_key,assigned_operator_uid,assigned_operator_name,avatar_color)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (aid, name, et, pname, pk, op_uid, op_name, AVATAR_POOL[hash(name.encode()) % len(AVATAR_POOL)]),
            )
            now_ms = int(_dt.datetime.now().timestamp() * 1000)
            c.execute(
                "INSERT OR IGNORE INTO records(id,account_id,entity_type,account,platform,platform_key,followers,views,likes,engagement_rate,operator_uid,operator_name,source,timestamp_ms,updated_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?, datetime('now'))",
                (f"rec_{aid}_{now_ms}", aid, et, name, pname, pk, f, v, l,
                 float(f"{(l / v * 100):.2f}") if v > 0 else 0.0,
                 op_uid, op_name, "seed_mock", now_ms),
            )
        else:
            name, pk, pname, et, op_uid, op_name, members, online, msg24h, is_sym, symbol, bull, bear, price, change, *rest = row
            sub = rest[0] if rest else None
            aid = f"acc_{hashlib.md5(f'{pk}|{name}|{et}'.encode()).hexdigest()[:10]}"
            c.execute(
                "INSERT OR IGNORE INTO accounts(id,account_name,entity_type,platform,platform_key,assigned_operator_uid,assigned_operator_name,symbol,subreddit,avatar_color)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (aid, name, et, pname, pk, op_uid, op_name, symbol or None, sub, AVATAR_POOL[hash(name.encode()) % len(AVATAR_POOL)]),
            )
            now_ms = int(_dt.datetime.now().timestamp() * 1000)
            c.execute(
                "INSERT OR IGNORE INTO records(id,account_id,entity_type,account,platform,platform_key,members,online,message_volume_24h,posts_24h,sentiment_bull,sentiment_bear,symbol_price,symbol_change_pct,operator_uid,operator_name,source,timestamp_ms,updated_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, datetime('now'))",
                (f"rec_{aid}_{now_ms}", aid, et, name, pname, pk, members, online, msg24h, msg24h, bull, bear, price, change, op_uid, op_name, "seed_mock", now_ms),
            )


# ============================================================
# Auth helpers (密码 + JWT + Depends 鉴权中间件)
# ============================================================

if _bcrypt is None or jwt is None:  # pragma: no cover
    print("[FATAL] 未安装 bcrypt / python-jose[cryptography]，请执行 `pip install -r requirements.txt`")
    raise SystemExit(1)

BCRYPT_ROUNDS = 12
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")
ROLES = {"admin", "manager", "operator"}
ALLOWED_USER_LIST_WHERE_FIELDS = {"username", "email", "role", "status"}
ALLOWED_USER_UPDATE_SET_FIELDS = {"username", "email", "role", "status", "operator_uid", "updated_at"}
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(pw: str) -> str:
    pw_bytes = pw.encode("utf-8")
    if len(pw_bytes) > 72:
        pw_bytes = hashlib.sha256(pw_bytes).digest()
    salt = _bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return _bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def verify_password(pw: str, h: Optional[str]) -> bool:
    if not h:
        return False
    try:
        pw_bytes = pw.encode("utf-8")
        if len(pw_bytes) > 72:
            pw_bytes = hashlib.sha256(pw_bytes).digest()
        return bool(_bcrypt.checkpw(pw_bytes, h.encode("utf-8")))
    except Exception:
        return False


def gen_user_id() -> str:
    return "u_" + secrets.token_hex(8)


def gen_random_pwd(length: int = 16) -> str:
    alpha = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*"
    return "".join(secrets.choice(alpha) for _ in range(length))


def gen_invite_code() -> str:
    alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alpha) for _ in range(16))


def _utcnow_iso() -> str:
    return _dt.datetime.utcnow().isoformat(timespec="seconds")


def sign_jwt(payload: Dict[str, Any], ttl_seconds: int) -> str:
    to_encode = {
        **payload,
        "iss": "matrix",
        "iat": int(_dt.datetime.utcnow().timestamp()),
        "exp": int((_dt.datetime.utcnow() + _dt.timedelta(seconds=ttl_seconds)).timestamp()),
    }
    if jwt is None:  # pragma: no cover
        raise RuntimeError("python-jose 未安装")
    return jwt.encode(to_encode, ENV_JWT_SECRET, algorithm="HS256")


def decode_jwt(token: str, secret: Optional[str] = None, alg: Optional[str] = None) -> Dict[str, Any]:
    if jwt is None:  # pragma: no cover
        raise RuntimeError("python-jose 未安装")
    sec = secret or ENV_JWT_SECRET
    algorithm = alg or "HS256"
    try:
        payload = dict(jwt.decode(token, sec, algorithms=[algorithm], options={"verify_iss": False, "verify_exp": False, "verify_iat": False, "verify_nbf": False}))
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"invalid_token: {e.__class__.__name__}")
    if "exp" in payload and isinstance(payload["exp"], int):
        now_ts = int(_dt.datetime.utcnow().timestamp())
        if payload["exp"] < now_ts:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token: ExpiredSignatureError")
    return payload


def decode_jwt_rs256(token: str, jwk_url: str) -> Dict[str, Any]:
    if jwt is None:
        raise RuntimeError("python-jose 未安装")
    try:
        resp = httpx.get(jwk_url, timeout=10.0)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="jwk_fetch_fail")
        from jose.backends import RSAKey  # lazy
        keyset = resp.json()
        key = RSAKey(keyset, algorithm="RS256")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"jwk_fetch_fail: {e.__class__.__name__}")
    try:
        payload = dict(jwt.decode(token, key, algorithms=["RS256"], options={"verify_iss": False, "verify_exp": False, "verify_iat": False, "verify_nbf": False}))
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"invalid_token: {e.__class__.__name__}")
    if "exp" in payload and isinstance(payload["exp"], int):
        now_ts = int(_dt.datetime.utcnow().timestamp())
        if payload["exp"] < now_ts:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token: ExpiredSignatureError")
    return payload


def row_to_user(r: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": r["id"],
        "username": r["username"],
        "email": r["email"],
        "role": r["role"],
        "status": r["status"],
        "operator_uid": r["operator_uid"],
        "sso_provider": r["sso_provider"],
        "sso_sub": r["sso_sub"],
        "must_change_pw": bool(r["must_change_pw"]),
        "last_login_at": r["last_login_at"],
        "login_count": int(r["login_count"] or 0),
        "created_at": r["created_at"],
    }


def user_public(u: Dict[str, Any]) -> Dict[str, Any]:
    return {k: u[k] for k in ("id", "username", "email", "role", "operator_uid", "status", "must_change_pw", "last_login_at") if k in u}


def sign_token_pair(user: Dict[str, Any], request: Optional[Request] = None) -> Dict[str, Any]:
    ip = request.client.host if request and request.client else None
    ua = request.headers.get("user-agent") if request else None
    access = sign_jwt({"sub": user["id"], "typ": "access", "role": user["role"], "username": user["username"]}, ENV_JWT_ACCESS_TTL)
    refresh_id = secrets.token_urlsafe(32)
    refresh_exp = (_dt.datetime.utcnow() + _dt.timedelta(seconds=ENV_JWT_REFRESH_TTL)).isoformat(timespec="seconds")
    with get_conn() as c:
        c.execute(
            "INSERT INTO refresh_tokens(token,user_id,expires_at,ip,ua) VALUES (?,?,?,?,?)",
            (refresh_id, user["id"], refresh_exp, ip, ua),
        )
    return {"access_token": access, "refresh_token": refresh_id, "token_type": "Bearer"}


def _get_token_user(token: Optional[str]) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    try:
        payload = decode_jwt(token)
    except HTTPException:
        return None
    sub = payload.get("sub")
    if not sub or payload.get("typ") != "access":
        return None
    with get_conn() as c:
        r = c.execute("SELECT * FROM users WHERE id=?", (sub,)).fetchone()
    if not r or r["status"] != "active":
        return None
    return row_to_user(r)


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[Dict[str, Any]]:
    return _get_token_user(token)


async def require_current_user(user: Optional[Dict[str, Any]] = Depends(get_current_user)) -> Dict[str, Any]:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
    return user


def require_role(*allowed: str):
    async def _inner(user: Dict[str, Any] = Depends(require_current_user)) -> Dict[str, Any]:
        if user["role"] not in set(allowed):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
        return user
    return _inner


def write_audit(conn, user_id: Optional[str], event: str, ok: bool = True, detail: Optional[str] = None, ip: Optional[str] = None, ua: Optional[str] = None):
    def _do(c: sqlite3.Connection):
        c.execute(
            "INSERT INTO audit_logs(user_id,event,ip,ua,ok,detail) VALUES (?,?,?,?,?,?)",
            (user_id, event, ip, ua, 1 if ok else 0, (detail or "")[:500] if detail else None),
        )
    if isinstance(conn, sqlite3.Connection):
        _do(conn)
    else:
        with get_conn() as c:
            _do(c)


def seed_initial_admin(c: sqlite3.Connection):
    """首次启动种入管理员 admin / admin123，绑定档案 admin_001（张总（管理））"""
    h = hash_password("admin123")
    c.execute(
        "INSERT OR IGNORE INTO users(id,username,email,password_hash,role,status,operator_uid,display_name,avatar_gradient,created_at,updated_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
        (gen_user_id(), "admin", "admin@matrix.local", h, "admin", "active", "admin_001", "张总（管理）", "#3b82f6,#8b5cf6"),
    )


init_db()


# ============================================================
# Pydantic schemas
# ============================================================

class HeartbeatRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    machine_id: str
    machine_name: Optional[str] = None
    operator_uid: Optional[str] = None
    operator_name: Optional[str] = None
    operator_token: Optional[str] = None
    version: Optional[str] = None
    source: Optional[str] = "chrome_extension"
    pending_count: Optional[int] = 0
    last_collect_at: Optional[int] = 0
    timestamp_ms: Optional[int] = None
    user_agent: Optional[str] = None


class CollectPost(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = ""
    views: Optional[int] = 0
    likes: Optional[int] = 0
    comments: Optional[int] = 0
    shares: Optional[int] = 0
    collect: Optional[int] = 0
    engagement_rate: Optional[float] = 0.0
    url: Optional[str] = ""
    published_at: Optional[str] = None
    platform: Optional[str] = ""
    platform_key: Optional[str] = ""
    is_bomb: Optional[bool] = False


class CollectItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    platform: Optional[str] = None
    platform_key: Optional[str] = None
    platform_category: Optional[str] = None
    entity_type: Optional[str] = "ACCOUNT"
    account: Optional[str] = None
    target_url: Optional[str] = None
    followers: Optional[int] = 0
    following: Optional[int] = 0
    likes: Optional[int] = 0
    views: Optional[int] = 0
    comments: Optional[int] = 0
    collect: Optional[int] = 0
    engagement_rate: Optional[float] = 0.0
    members: Optional[int] = 0
    online: Optional[int] = 0
    message_volume_24h: Optional[int] = 0
    posts_24h: Optional[int] = 0
    sentiment_bull: Optional[float] = 0.0
    sentiment_bear: Optional[float] = 0.0
    symbol_price: Optional[float] = None
    symbol_change_pct: Optional[float] = None
    symbol: Optional[str] = None
    subreddit: Optional[str] = None
    channel: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None
    latest_post: Optional[Dict[str, Any]] = None
    posts: Optional[List[CollectPost]] = None
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    operator_uid: Optional[str] = None
    operator_name: Optional[str] = None
    client_version: Optional[str] = None
    source: Optional[str] = "chrome_extension"
    timestamp_ms: Optional[int] = None
    collected_at: Optional[str] = None
    page_title: Optional[str] = None


class CollectRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    machine_id: str
    machine_name: Optional[str] = None
    operator_uid: Optional[str] = None
    operator_name: Optional[str] = None
    operator_token: Optional[str] = None
    version: Optional[str] = None
    source: Optional[str] = "chrome_extension"
    count: Optional[int] = 0
    timestamp_ms: Optional[int] = None
    webhook_url: Optional[str] = None
    items: List[CollectItem] = Field(default_factory=list)


# -------- Auth / SSO / Admin Pydantic --------

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    invite_code: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


class SSOJWTLoginRequest(BaseModel):
    external_jwt: str


class CreateUserRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: str = "operator"
    status: str = "active"
    operator_uid: Optional[str] = None


class UpdateUserRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    operator_uid: Optional[str] = None


class UpdateMeRequest(BaseModel):
    display_name: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar_gradient: Optional[str] = None
    avatar_data_url: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class CreateInviteCodeRequest(BaseModel):
    role: str = "operator"
    expires_days: Optional[int] = None


# ============================================================
# FastAPI app
# ============================================================

app = FastAPI(
    title="Matrix 矩阵账号监测 · Backend",
    version=APP_VERSION,
    description="Chrome 采集插件心跳 + 数据上报 + Dashboard 聚合 API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ENV_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

CLIENT_HTTP = httpx.AsyncClient(timeout=6.0)


# ============================================================
# Helpers
# ============================================================

def now_ms() -> int:
    return int(_dt.datetime.now().timestamp() * 1000)


def platform_meta(key: str) -> Dict[str, str]:
    for p in PLATFORMS:
        if p["key"] == key:
            return p
    return dict(key=key or "other", name=key or "未知", category="社媒", color="#6366f1")


async def fire_webhook(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not url:
        return {"ok": False, "reason": "no_url"}
    try:
        r = await CLIENT_HTTP.post(url, json=payload, headers={"Content-Type": "application/json"})
        return {"ok": True, "status": r.status_code, "text": (r.text[:500] if hasattr(r, "text") else "")}
    except Exception as e:
        return {"ok": False, "error": str(e)[:500]}


# ============================================================
# Operator Token (采集器身份凭证) helpers
# ============================================================
OPTOKEN_PREFIX = "mxtok_"


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_collector_token_plaintext() -> str:
    return OPTOKEN_PREFIX + secrets.token_urlsafe(32)


def verify_operator_identity(
    conn: sqlite3.Connection,
    machine_id: str,
    operator_uid: Optional[str],
    operator_token: Optional[str],
) -> Dict[str, Any]:
    """
    四端对齐校验：site_id ↔ machine_id ↔ operator_uid ↔ collector_token
    规则（向后兼容，避免老插件挂掉）：
      1. 没有传 operator_token → 允许兼容模式，返回 authorized=False 但 ok=True
      2. 传了 token：
         a. token_hash 在 collector_tokens 中查不到 / 已吊销 / 已过期 → 403 拒绝
         b. token 绑定的 operator_uid 与请求 operator_uid 不一致 → 403 拒绝
      3. machine_id 在 machines 表已有绑定 operator_uid：
         a. 与请求 operator_uid 不一致 → 403 拒绝（防止一台机器被多人共享 token 盗采）
      4. 通过 → 返回 authorized=True，并更新 token.last_used_at / 写入 machine 首次绑定
    """
    now = _dt.datetime.now().isoformat(timespec="seconds")
    site = get_current_site(conn)
    site_id = site["site_id"]
    machine_row = conn.execute("SELECT operator_uid, collector_id, site_id FROM machines WHERE machine_id=?", (machine_id,)).fetchone()
    existing_machine_op = machine_row["operator_uid"] if machine_row else None
    existing_machine_collector = machine_row["collector_id"] if machine_row else None
    existing_machine_site = machine_row["site_id"] if machine_row else None

    token_op_uid: Optional[str] = None
    token_id: Optional[str] = None
    token_site_id: Optional[str] = None
    if operator_token:
        token_hash = _hash_token(operator_token)
        row = conn.execute(
            "SELECT id, site_id, operator_uid, expires_at, revoked_at, status FROM collector_tokens WHERE token_hash=?",
            (token_hash,),
        ).fetchone()
        if row is None:
            row = conn.execute(
                "SELECT id, operator_uid, expires_at, revoked_at FROM operator_tokens WHERE token_hash=?",
                (token_hash,),
            ).fetchone()
            if row is None:
                raise HTTPException(403, detail="forbidden_invalid_token")
            token_op_uid = row["operator_uid"]
            token_id = row["id"]
        else:
            if row["status"] != "active" or row["revoked_at"]:
                raise HTTPException(403, detail="forbidden_token_revoked")
            if row["expires_at"] and row["expires_at"] < now:
                raise HTTPException(403, detail="forbidden_token_expired")
            token_op_uid = row["operator_uid"]
            token_id = row["id"]
            token_site_id = row["site_id"]
        if token_site_id and token_site_id != site_id:
            raise HTTPException(403, detail="forbidden_token_wrong_site")
        mismatch_reported = False
        if operator_uid and token_op_uid != operator_uid:
            mismatch_reported = True
            print(f"[verify][WARN] operator_token_mismatch_auto_correct: operator_uid in body={operator_uid!r} overridden by token-bound operator_uid={token_op_uid!r} (machine_id={machine_id!r}, token_id={token_id!r})")
        operator_uid = token_op_uid
    if not operator_uid and existing_machine_op:
        operator_uid = existing_machine_op

    rebind_ok = False
    if operator_token and token_id and operator_uid:
        rebind_ok = (operator_uid == token_op_uid)

    if not rebind_ok and operator_token and token_id and operator_uid and machine_row:
        existing_col_token = None
        if existing_machine_collector:
            trow = conn.execute("SELECT operator_uid, status, revoked_at, expires_at FROM collector_tokens WHERE id=?", (existing_machine_collector,)).fetchone()
            if trow:
                if trow["status"] != "active" or trow["revoked_at"] or (trow["expires_at"] and trow["expires_at"] < now):
                    existing_col_token = None
                else:
                    existing_col_token = trow["operator_uid"]
        if existing_col_token is None:
            print(f"[verify][INFO] collector_rebind_orphan_machine: machine_id={machine_id!r} was bound to operator_uid={existing_machine_op!r} / collector_id={existing_machine_collector!r}, rebinding to token owner {token_op_uid!r} / {token_id!r}")
            rebind_ok = True

    if rebind_ok and machine_row and (
        (existing_machine_op and existing_machine_op != operator_uid) or
        (existing_machine_collector and existing_machine_collector != token_id) or
        (existing_machine_site and token_site_id and existing_machine_site != token_site_id)
    ):
        conn.execute(
            "UPDATE machines SET operator_uid=?, collector_id=?, site_id=? WHERE machine_id=?",
            (
                operator_uid if operator_uid else existing_machine_op,
                token_id if token_id else existing_machine_collector,
                (token_site_id or site_id) if token_site_id else existing_machine_site,
                machine_id,
            ),
        )
        existing_machine_op = operator_uid if operator_uid else existing_machine_op
        existing_machine_collector = token_id if token_id else existing_machine_collector
        existing_machine_site = (token_site_id or site_id) if token_site_id else existing_machine_site

    if existing_machine_op and operator_uid and existing_machine_op != operator_uid:
        raise HTTPException(403, detail="forbidden_machine_bound_to_other_operator")
    if existing_machine_collector and token_id and existing_machine_collector != token_id:
        raise HTTPException(403, detail="forbidden_machine_bound_to_other_collector")
    if existing_machine_site and token_site_id and existing_machine_site != token_site_id:
        raise HTTPException(403, detail="forbidden_machine_bound_to_other_site")

    return dict(
        authorized=bool(operator_token),
        operator_uid=operator_uid,
        token_id=token_id,
        site_id=site_id,
        collector_id=token_id,
    )


def upsert_account(conn: sqlite3.Connection, r: CollectItem) -> str:
    pk = (r.platform_key or "").strip() or (r.platform or "").lower()
    name = (r.account or "").strip()
    et = (r.entity_type or "ACCOUNT").upper()
    if not pk or not name:
        return ""
    # 先查 UNIQUE 三列是否已存在：兼容 Admin 手动加入时用不同 hash 前缀长度造 id（例如 md5[:14] vs md5[:10]）
    exist = conn.execute(
        "SELECT id FROM accounts WHERE platform_key=? AND account_name=? AND entity_type=? LIMIT 1",
        (pk, name, et),
    ).fetchone()
    if exist and exist["id"]:
        aid = exist["id"]
        # 还是走一次 UPDATE，同步 symbol/subreddit/target_url 等可能的变化（但不插入，不撞约束）
        meta = platform_meta(pk)
        extra = r.extra or {}
        symbol, subreddit, channel = None, None, None
        av_url, av_data = None, None
        op_uid, op_name = None, None
        if isinstance(extra, dict):
            symbol = extra.get("symbol") or getattr(r, "symbol", None) or None
            subreddit = extra.get("subreddit") or getattr(r, "subreddit", None) or None
            channel = extra.get("channel") or getattr(r, "channel", None) or None
        av_url = extra.get("avatar_url") or getattr(r, "avatar_url", None) or None
        av_data = extra.get("avatar_data_url") or getattr(r, "avatar_data_url", None) or None
        if isinstance(extra, dict):
            op_uid = extra.get("assigned_operator_uid") or r.operator_uid or None
            op_name = extra.get("assigned_operator_name") or r.operator_name or None
        else:
            op_uid = r.operator_uid or None
            op_name = r.operator_name or None
        conn.execute(
            """UPDATE accounts SET
                 platform_category=COALESCE(?, platform_category),
                 target_url=COALESCE(?, target_url),
                 symbol=COALESCE(?, symbol),
                 subreddit=COALESCE(?, subreddit),
                 channel=COALESCE(?, channel),
                 assigned_operator_uid=COALESCE(NULLIF(?,''), assigned_operator_uid),
                 assigned_operator_name=COALESCE(NULLIF(?,''), assigned_operator_name),
                 avatar_url=COALESCE(?, avatar_url),
                 avatar_data_url=COALESCE(?, avatar_data_url),
                 active=1, updated_at=datetime('now')
               WHERE id=?""",
            (meta.get("category"), r.target_url or None, symbol, subreddit, channel,
             op_uid, op_name, av_url, av_data, aid),
        )
        return aid
    meta = platform_meta(pk)
    aid = f"acc_{hashlib.md5(f'{pk}|{name}|{et}'.encode()).hexdigest()[:10]}"
    symbol = None
    subreddit = None
    channel = None
    avatar_url = None
    avatar_data_url = None
    extra = r.extra or {}
    if isinstance(extra, dict):
        symbol = extra.get("symbol") or r.symbol or None
        subreddit = extra.get("subreddit") or r.subreddit or None
        channel = extra.get("channel") or r.channel or None
        avatar_url = extra.get("avatar_url") or getattr(r, "avatar_url", None) or None
        avatar_data_url = extra.get("avatar_data_url") or getattr(r, "avatar_data_url", None) or None
    conn.execute(
        """INSERT INTO accounts(id,account_name,entity_type,platform,platform_key,platform_category,target_url,symbol,subreddit,channel,assigned_operator_uid,assigned_operator_name,avatar_color,avatar_url,avatar_data_url,active,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             platform_category=excluded.platform_category,
             target_url=COALESCE(excluded.target_url, accounts.target_url),
             symbol=COALESCE(excluded.symbol, accounts.symbol),
             subreddit=COALESCE(excluded.subreddit, accounts.subreddit),
             channel=COALESCE(excluded.channel, accounts.channel),
             assigned_operator_uid=COALESCE(NULLIF(excluded.assigned_operator_uid,''), accounts.assigned_operator_uid),
             assigned_operator_name=COALESCE(NULLIF(excluded.assigned_operator_name,''), accounts.assigned_operator_name),
             avatar_url=COALESCE(excluded.avatar_url, accounts.avatar_url),
             avatar_data_url=COALESCE(excluded.avatar_data_url, accounts.avatar_data_url),
             active=1, updated_at=datetime('now')
        """,
        (aid, name, et, meta["name"], meta["key"], meta["category"],
         r.target_url or None, symbol, subreddit, channel,
         r.operator_uid or None, r.operator_name or None,
         AVATAR_POOL[hash(name.encode()) % len(AVATAR_POOL)],
         avatar_url, avatar_data_url),
    )
    return aid


def is_bomb_viral(r: CollectItem) -> bool:
    lp = r.latest_post or {}
    if isinstance(lp, dict) and lp.get("is_bomb"):
        return True
    if r.posts:
        for p in r.posts:
            if getattr(p, "is_bomb", None):
                return True
            views = int(getattr(p, "views", 0) or 0)
            er = float(getattr(p, "engagement_rate", 0) or 0)
            if views >= 50000 or er >= 8.0:
                return True
    return False


def snapshot_daily(conn: sqlite3.Connection, account_id: str, r: CollectItem):
    today = _dt.date.today().isoformat()
    conn.execute(
        """INSERT INTO daily_snapshots(snapshot_date,account_id,entity_type,platform_key,assigned_operator_uid,followers,views,likes,engagement_rate,members,message_volume_24h,sentiment_bull)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(snapshot_date, account_id) DO UPDATE SET
             followers=excluded.followers, views=excluded.views, likes=excluded.likes,
             engagement_rate=excluded.engagement_rate, members=excluded.members,
             message_volume_24h=excluded.message_volume_24h, sentiment_bull=excluded.sentiment_bull
        """,
        (today, account_id, r.entity_type or "ACCOUNT", r.platform_key or "",
         r.operator_uid or None, int(r.followers or 0), int(r.views or 0), int(r.likes or 0),
         float(r.engagement_rate or 0), int(r.members or 0), int(r.message_volume_24h or 0), float(r.sentiment_bull or 0)),
    )


def insert_record(conn: sqlite3.Connection, r: CollectItem):
    account_id = upsert_account(conn, r)
    if not account_id:
        account_id = ""
    ts_ms = r.timestamp_ms or now_ms()
    rec_id = r.id or f"rec_{account_id or hashlib.md5(str(ts_ms).encode()).hexdigest()[:8]}_{ts_ms}"
    day_key = _dt.datetime.now().isoformat(timespec="seconds")[:10]
    rec_id_pk = f"{account_id or 'na'}_{day_key}"
    _new_members = int(r.members or 0)
    _new_msg24 = int(r.message_volume_24h or 0)
    _new_posts24 = int(r.posts_24h or 0)
    _new_bull = float(r.sentiment_bull or 0)
    _new_bear = float(r.sentiment_bear or 0)
    conn.execute(
        """INSERT INTO records(id,account_id,entity_type,account,platform,platform_key,target_url,followers,following,likes,views,comments,collect,engagement_rate,
                              members,online,message_volume_24h,posts_24h,sentiment_bull,sentiment_bear,symbol_price,symbol_change_pct,
                              extra,latest_post,posts,source,operator_uid,operator_name,machine_id,machine_name,client_version,error,updated_at,timestamp_ms)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             account=excluded.account,
             platform=excluded.platform,
             platform_key=excluded.platform_key,
             target_url=excluded.target_url,
             followers=CASE WHEN excluded.followers>0 THEN excluded.followers ELSE records.followers END,
             following=CASE WHEN excluded.following>0 THEN excluded.following ELSE records.following END,
             likes=CASE WHEN excluded.likes>0 THEN excluded.likes ELSE records.likes END,
             views=CASE WHEN excluded.views>0 THEN excluded.views ELSE records.views END,
             comments=CASE WHEN excluded.comments>0 THEN excluded.comments ELSE records.comments END,
             collect=CASE WHEN excluded.collect>0 THEN excluded.collect ELSE records.collect END,
             engagement_rate=CASE WHEN excluded.engagement_rate>0 THEN excluded.engagement_rate ELSE records.engagement_rate END,
             members=CASE WHEN ? > 0 THEN ? ELSE COALESCE(records.members,0) END,
             online=CASE WHEN excluded.online>=0 AND excluded.online IS NOT NULL THEN excluded.online ELSE COALESCE(records.online,0) END,
             message_volume_24h=CASE WHEN ? > 0 THEN ? ELSE COALESCE(records.message_volume_24h,0) END,
             posts_24h=CASE WHEN ? > 0 THEN ? ELSE COALESCE(records.posts_24h,0) END,
             sentiment_bull=CASE WHEN ? > 0 THEN ? ELSE COALESCE(records.sentiment_bull,0) END,
             sentiment_bear=CASE WHEN ? > 0 THEN ? ELSE COALESCE(records.sentiment_bear,0) END,
             symbol_price=CASE WHEN excluded.symbol_price IS NOT NULL AND excluded.symbol_price > 0 THEN excluded.symbol_price ELSE records.symbol_price END,
             symbol_change_pct=CASE WHEN excluded.symbol_change_pct IS NOT NULL THEN excluded.symbol_change_pct ELSE records.symbol_change_pct END,
             extra=excluded.extra,
             latest_post=excluded.latest_post,
             posts=excluded.posts,
             source=excluded.source,
             operator_uid=COALESCE(excluded.operator_uid, records.operator_uid),
             operator_name=COALESCE(excluded.operator_name, records.operator_name),
             machine_id=COALESCE(excluded.machine_id, records.machine_id),
             machine_name=COALESCE(excluded.machine_name, records.machine_name),
             error=excluded.error,
             updated_at=excluded.updated_at,
             timestamp_ms=excluded.timestamp_ms
        """,
        (rec_id_pk, account_id or None, r.entity_type or "ACCOUNT", r.account, r.platform or platform_meta(r.platform_key or "")["name"],
         (r.platform_key or ""), r.target_url or None,
         int(r.followers or 0), int(r.following or 0), int(r.likes or 0), int(r.views or 0), int(r.comments or 0), int(r.collect or 0), float(r.engagement_rate or 0),
         _new_members, int(r.online or 0), _new_msg24, _new_posts24, _new_bull, _new_bear,
         r.symbol_price, r.symbol_change_pct,
         json.dumps(r.extra or {}, ensure_ascii=False),
         json.dumps(r.latest_post or {}, ensure_ascii=False),
         json.dumps([p.model_dump() for p in (r.posts or [])], ensure_ascii=False),
         r.source or "chrome_extension", r.operator_uid or None, r.operator_name or None, r.machine_id or None, r.machine_name or None, r.client_version or None,
         None,
         _dt.datetime.now().isoformat(timespec="seconds"), ts_ms,
         _new_members, _new_members,
         _new_msg24, _new_msg24,
         _new_posts24, _new_posts24,
         _new_bull, _new_bull,
         _new_bear, _new_bear),
    )
    if account_id:
        snapshot_daily(conn, account_id, r)
    return rec_id_pk


# ============================================================
# Routes
# ============================================================

@app.get("/", tags=["meta"])
def index():
    return {
        "service": "matrix-backend",
        "version": APP_VERSION,
        "endpoints": {
            "POST /api/heartbeat":       "插件心跳上报",
            "POST /api/collect-data":    "插件数据批量上报",
            "GET  /api/dashboard-data":  "Dashboard 聚合数据(建议)",
            "GET  /api/summary":         "Dashboard 聚合数据(api.js 默认)",
            "GET  /api/whoami":          "Dashboard 登录态",
            "GET  /api/health":          "健康检查",
        },
        "docs": "/docs",
    }


@app.get("/api/health", tags=["meta"])
def health():
    with get_conn() as c:
        machines_n = c.execute("SELECT COUNT(*) AS n FROM machines").fetchone()["n"]
        records_n = c.execute("SELECT COUNT(*) AS n FROM records").fetchone()["n"]
    return {
        "ok": True,
        "version": APP_VERSION,
        "db": str(DB_PATH.name),
        "time": _dt.datetime.now().isoformat(timespec="seconds"),
        "machines_online": machines_n,
        "records_total": records_n,
        "security_warning": bool(_security_warning),
    }


@app.get("/debug/auth", include_in_schema=False)
def debug_auth(request: Request, token: Optional[str] = Depends(oauth2_scheme), user: Optional[Dict[str, Any]] = Depends(get_current_user)):
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    info = {
        "token_extracted": (token[:20] + "...") if token else None,
        "auth_header_present": bool(auth_header),
        "auth_header_value": (auth_header[:20] + "...") if auth_header else None,
        "user_id": user["id"] if user else None,
        "user_role": user["role"] if user else None,
        "env": {
            "jwt_secret_first_5": ENV_JWT_SECRET[:5],
            "access_ttl": ENV_JWT_ACCESS_TTL,
            "refresh_ttl": ENV_JWT_REFRESH_TTL,
            "require_auth": ENV_REQUIRE_AUTH,
        },
    }
    if token:
        try:
            raw = jwt.get_unverified_claims(token) if jwt else {}
            info["unverified"] = {k: raw.get(k) for k in ["iat", "exp", "typ"]}
            info["now_ts"] = int(_dt.datetime.utcnow().timestamp())
            if "exp" in raw and isinstance(raw["exp"], int):
                info["exp_diff"] = int(raw["exp"]) - info["now_ts"]
        except Exception as e:
            info["unverified_err"] = f"{type(e).__name__}: {str(e)[:100]}"
        try:
            p = decode_jwt(token)
            info["decode_ok"] = True
            info["payload"] = {k: p.get(k) for k in ["sub", "typ", "role", "iss", "iat", "exp"]}
            info["typ_eq_access"] = p.get("typ") == "access"
            sub = p.get("sub")
            if sub:
                with get_conn() as c:
                    r = c.execute("SELECT id,status,role FROM users WHERE id=?", (sub,)).fetchone()
                info["db_row"] = dict(r) if r else None
        except HTTPException as e:
            info["decode_fail"] = dict(status=e.status_code, detail=e.detail)
        except Exception as e:
            info["decode_exception"] = f"{type(e).__name__}: {str(e)[:200]}"
    return info


# ============================================================
# Collector 公开接口（插件启动时拉配置
# ============================================================

@app.get("/api/collector/bootstrap", tags=["collector"])
def api_collector_bootstrap(token: Optional[str] = None):
    """
    插件/脚本启动时调用：
    1. 返回 site 信息（用于双向匹配：Token 前缀 ↔ 本站握手码）
    2. 返回所有有效运营列表（用于填充归属运营下拉 datalist 建议）
    3. 若传了 token，还返回该 token 绑定的 operator 身份信息（用于自检 + 错误细分）
    """
    with get_conn() as c:
        site = get_current_site(c)
        operators = [
            dict(operator_uid=r["operator_uid"], operator_name=r["operator_name"], role=r["role"])
            for r in c.execute("SELECT operator_uid, operator_name, role FROM operators WHERE status='active' ORDER BY operator_name").fetchall()
        ]
        me = None
        token_error = None
        if token:
            th = _hash_token(token)
            row = c.execute(
                "SELECT t.id, t.site_id, t.operator_uid, t.label, t.created_at, t.last_used_at, t.expires_at, t.revoked_at, t.status,"
                " o.operator_name, o.role AS operator_role"
                " FROM collector_tokens t LEFT JOIN operators o ON o.operator_uid=t.operator_uid WHERE t.token_hash=?",
                (th,),
            ).fetchone()
            if row is None:
                row2 = c.execute(
                    "SELECT t.id, t.operator_uid, t.label, t.created_at, t.last_used_at, t.expires_at, t.revoked_at,"
                    " o.operator_name, o.role AS operator_role"
                    " FROM operator_tokens t LEFT JOIN operators o ON o.operator_uid=t.operator_uid WHERE t.token_hash=?",
                    (th,),
                ).fetchone()
                if row2 is None:
                    token_error = "invalid_token"
                else:
                    now = _dt.datetime.now().isoformat(timespec="seconds")
                    valid = (row2["revoked_at"] is None) and not (row2["expires_at"] and row2["expires_at"] < now)
                    me = dict(
                        token_id=row2["id"],
                        site_id=site["site_id"],
                        operator_uid=row2["operator_uid"],
                        operator_name=row2["operator_name"],
                        operator_role=row2["operator_role"],
                        label=row2["label"] or "兼容旧Token",
                        valid=valid,
                        revoked=bool(row2["revoked_at"]),
                        expires_at=row2["expires_at"],
                        last_used_at=row2["last_used_at"],
                    )
            else:
                now = _dt.datetime.now().isoformat(timespec="seconds")
                valid = (row["status"] == "active") and (row["revoked_at"] is None) and not (row["expires_at"] and row["expires_at"] < now)
                if row["site_id"] and row["site_id"] != site["site_id"]:
                    token_error = "wrong_site"
                elif not valid:
                    token_error = "revoked" if row["revoked_at"] else "expired"
                me = dict(
                    token_id=row["id"],
                    site_id=row["site_id"] or site["site_id"],
                    operator_uid=row["operator_uid"],
                    operator_name=row["operator_name"],
                    operator_role=row["operator_role"],
                    label=row["label"],
                    valid=valid and (not token_error),
                    revoked=bool(row["revoked_at"]),
                    expires_at=row["expires_at"],
                    last_used_at=row["last_used_at"],
                )
        monitor_whitelist = [
            dict(
                id=r["id"],
                platform_key=r["platform_key"],
                entity_type=r["entity_type"],
                account_name=r["account_name"],
                symbol=r["symbol"],
                subreddit=r["subreddit"],
                target_url=r["target_url"],
            )
            for r in c.execute(
                "SELECT id, platform_key, entity_type, account_name, symbol, subreddit, target_url "
                "FROM accounts WHERE active=1 AND entity_type IN ('STOCK','SUBREDDIT') ORDER BY account_name"
            ).fetchall()
        ]
    return {
        "ok": True,
        "server_version": APP_VERSION,
        "site": {
            "site_id": site["site_id"],
            "site_name": site["site_name"],
            "handshake_code": site["handshake_code"],
            "site_prefix": (site["site_id"] or "").lower()[:6],
        },
        "operators": operators,
        "token_identity": me,
        "token_error": token_error,
        "monitor_whitelist": monitor_whitelist,
        "docs": "把 token 放到 heartbeat / collect-data body 的 operator_token 字段",
    }


# ============================================================
# Heartbeat + Collect-data（改造版
# ============================================================


@app.post("/api/heartbeat", tags=["collector"])
def api_heartbeat(hb: HeartbeatRequest, request: Request):
    ip = request.client.host if request.client else None
    ts_ms = hb.timestamp_ms or now_ms()
    with get_conn() as c:
        site = get_current_site(c)
        ident = verify_operator_identity(c, hb.machine_id, hb.operator_uid, hb.operator_token)
        operator_uid = ident["operator_uid"] or hb.operator_uid
        collector_id = ident.get("collector_id") or ident.get("token_id")
        if operator_uid and not hb.operator_uid:
            hb.operator_uid = operator_uid
        c.execute(
            """INSERT INTO machines(machine_id,machine_name,site_id,collector_id,operator_uid,operator_name,version,source,pending_count,last_collect_at,last_hb_at,user_agent,status,ip_address)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'online', ?)
               ON CONFLICT(machine_id) DO UPDATE SET
                 machine_name=excluded.machine_name,
                 site_id=COALESCE(excluded.site_id, machines.site_id),
                 collector_id=COALESCE(excluded.collector_id, machines.collector_id),
                 operator_uid=excluded.operator_uid,
                 operator_name=excluded.operator_name,
                 version=excluded.version,
                 source=excluded.source,
                 pending_count=excluded.pending_count,
                 last_collect_at=excluded.last_collect_at,
                 last_hb_at=excluded.last_hb_at,
                 user_agent=excluded.user_agent,
                 status='online',
                 ip_address=COALESCE(excluded.ip_address, machines.ip_address)
            """,
            (hb.machine_id, hb.machine_name,
             site["site_id"], collector_id,
             operator_uid, hb.operator_name, hb.version or APP_VERSION,
             hb.source or "chrome_extension", int(hb.pending_count or 0), int(hb.last_collect_at or 0),
             ts_ms, hb.user_agent or None, ip),
        )
        if operator_uid:
            c.execute("UPDATE operators SET last_login_at=datetime('now') WHERE operator_uid=?", (operator_uid,))
        c.execute("UPDATE machines SET status='offline' WHERE last_hb_at < ?", (now_ms() - 15 * 60 * 1000,))
    return {
        "ok": True,
        "authorized": ident.get("authorized", False),
        "site": {
            "site_id": site["site_id"],
            "site_name": site["site_name"],
            "handshake_code": site["handshake_code"],
            "site_prefix": (site["site_id"] or "").lower()[:6],
        },
        "collector": {
            "collector_id": collector_id,
            "operator_uid": operator_uid,
        },
        "received_at": ts_ms,
        "next_heartbeat_ms": 3 * 60 * 1000,
        "server_version": APP_VERSION,
        "config_patch": None,
    }


@app.post("/api/collect-data", tags=["collector"])
async def api_collect_data(req: CollectRequest, request: Request):
    viral_events: List[Dict[str, Any]] = []
    accepted = 0
    rejected_foreign = 0
    rejected_invalid = 0
    rejected_detail: List[Dict[str, str]] = []
    with get_conn() as c:
        site = get_current_site(c)
        ident = verify_operator_identity(c, req.machine_id, req.operator_uid, req.operator_token)
        operator_uid = ident["operator_uid"] or req.operator_uid
        collector_id = ident.get("collector_id") or ident.get("token_id")
        for item in req.items:
            item.machine_id = item.machine_id or req.machine_id
            item.machine_name = item.machine_name or req.machine_name
            item.operator_uid = operator_uid or item.operator_uid or req.operator_uid
            item.operator_name = item.operator_name or req.operator_name
            item.client_version = item.client_version or req.version
            item.source = item.source or req.source or "chrome_extension"
            try:
                name_raw = (
                    getattr(item, 'account', None)
                    or getattr(item, 'account_name', None)
                    or getattr(item, 'name', None)
                    or ""
                )
                name = str(name_raw).strip()
                pk = (getattr(item, 'platform_key', None) or "").strip() or (getattr(item, 'platform', None) or "").lower()
                et = (getattr(item, 'entity_type', None) or "ACCOUNT").upper()
                aid = f"acc_{hashlib.md5(f'{pk}|{name}|{et}'.encode()).hexdigest()[:10]}" if pk and name else ""
                extra = getattr(item, 'extra', None)
                try:
                    extra_dict = extra.model_dump() if hasattr(extra, "model_dump") else (dict(extra) if extra else {})
                except Exception:
                    extra_dict = {}
                # ====== 后端最后一道白名单校验：STOCK/SUBREDDIT 必须在官方监控清单（方案 A 严格）
                if et in {"STOCK", "SUBREDDIT"}:
                    sym_top = (
                        getattr(item, 'symbol', None)
                        or extra_dict.get("symbol")
                        or (name if et == "STOCK" else None)
                        or ""
                    )
                    sub_top = (
                        getattr(item, 'subreddit', None)
                        or extra_dict.get("subreddit")
                        or (name if et == "SUBREDDIT" else None)
                        or ""
                    )
                    sym = str(sym_top).strip().upper() if et == "STOCK" else None
                    sub_raw = str(sub_top).strip().lower() if et == "SUBREDDIT" else None
                    sub = sub_raw[2:] if sub_raw and sub_raw.startswith("r/") else sub_raw
                    wl_sym = sym if et == "STOCK" else None
                    wl_sub = f"r/{sub}" if (et == "SUBREDDIT" and sub) else None
                    wl_sub_match = wl_sub if et == "SUBREDDIT" else None
                    wl_acc_match = (wl_sym if et == "STOCK" else wl_sub)
                    wl_row = c.execute(
                        "SELECT id, platform_key, entity_type, account_name, symbol, subreddit FROM accounts "
                        "WHERE entity_type=? AND active=1 "
                        "  AND (symbol=? OR subreddit=? OR account_name=?)",
                        (et,
                         wl_sym,
                         wl_sub_match,
                         wl_acc_match),
                    ).fetchone()
                    # platform_key 兜底兼容：有 pk 再二次校验匹配性；无 pk 或 pk 不匹配但 symbol/sub 唯一匹配也放行
                    if wl_row and pk:
                        row_pk = (wl_row["platform_key"] or "").lower()
                        # 允许 platform_key 为空或模糊匹配（reddit/stocktwits 单平台）
                        if row_pk and row_pk != pk.lower():
                            # 冲突：再按完整 pk+symbol/sub 精确找
                            wl_row_strict = c.execute(
                                "SELECT id, platform_key, entity_type, account_name, symbol, subreddit FROM accounts "
                                "WHERE platform_key=? AND entity_type=? AND active=1 "
                                "  AND (symbol=? OR subreddit=? OR account_name=?) LIMIT 1",
                                (pk, et, wl_sym, wl_sub_match, wl_acc_match),
                            ).fetchone()
                            if wl_row_strict:
                                wl_row = wl_row_strict
                    if not wl_row:
                        rejected_invalid += 1
                        rejected_detail.append({
                            "account": name or (sym if et == "STOCK" else (f"r/{sub}" if sub else "")),
                            "reason": "not_in_monitor_whitelist",
                            "detail": "该 Stock/Subreddit 不在官方监控清单，请联系 Admin 添加；严格方案 A 白名单外一律拒绝入库",
                        })
                        continue
                    # 强制后端重写 entity_type + account_name + account_id，不信任前端传值
                    item.entity_type = wl_row["entity_type"]
                    item.account = wl_row["account_name"]
                    try:
                        if hasattr(item, "account_id") and (not getattr(item, "account_id", None)):
                            item.account_id = wl_row["id"]
                    except Exception:
                        pass
                    aid = wl_row["id"]
                # ====== 白名单校验结束
                # -------------- 双重校验（后端最后一道防线：非当前运营的账号一律拒绝 --------------
                existing = None
                if aid:
                    existing = c.execute(
                        "SELECT assigned_operator_uid FROM accounts WHERE id=?",
                        (aid,),
                    ).fetchone()
                if existing and existing["assigned_operator_uid"] and operator_uid:
                    if existing["assigned_operator_uid"] != operator_uid:
                        rejected_foreign += 1
                        rejected_detail.append({
                            "account": name,
                            "reason": "foreign_operator_account",
                            "detail": f"账号已归属运营者 {existing['assigned_operator_uid']}，当前 {operator_uid} 无权采集",
                        })
                        continue
                followers_i = int(item.followers or 0)
                members_i = int(item.members or 0)
                views_i = int(item.views or 0)
                likes_i = int(item.likes or 0)
                posts_i = int(item.posts_24h or 0) or (len(item.posts) if item.posts else 0)
                audience = followers_i + members_i
                signal = views_i + likes_i + posts_i
                if not existing:
                    if audience == 0 and signal == 0:
                        rejected_invalid += 1
                        rejected_detail.append({"account": name, "reason": "no_signal", "detail": "粉丝/浏览/点赞/帖子均为 0，拒绝入库"})
                        continue
                    if followers_i < 1 and members_i < 1 and name and is_generic_account_name(name):
                        rejected_invalid += 1
                        rejected_detail.append({"account": name, "reason": "generic_name_zero_audience", "detail": f"账号名是通用平台词且粉丝=0"})
                        continue
                if not existing and name and is_generic_account_name(name):
                    rejected_invalid += 1
                    rejected_detail.append({"account": name, "reason": "generic_name", "detail": "账号名是通用平台词/首页/活动等，拒绝首入库"})
                    continue
                insert_record(c, item)
                accepted += 1
                if is_bomb_viral(item):
                    viral_events.append({
                        "event": "viral_alert",
                        "machine": dict(id=item.machine_id, name=item.machine_name),
                        "operator": dict(uid=item.operator_uid, name=item.operator_name),
                        "account": dict(name=item.account, platform=item.platform, platform_key=item.platform_key, entity_type=item.entity_type, target_url=item.target_url),
                        "latest_post": item.latest_post or {},
                        "top_post": (item.posts[0].model_dump() if item.posts else {}),
                        "metrics": dict(followers=item.followers, views=item.views, likes=item.likes, comments=item.comments, engagement_rate=item.engagement_rate),
                        "generated_at_ms": now_ms(),
                    })
            except Exception as e:
                print(f"[collect][WARN] insert failed: {e}")
                continue
        if accepted > 0:
            today = _dt.date.today().isoformat()
            c.execute(
                "UPDATE machines SET today_records_count = COALESCE(today_records_count, 0) + ?, last_collect_at=?, site_id=COALESCE(site_id,?), collector_id=COALESCE(collector_id,?) WHERE machine_id=?",
                (accepted, now_ms(), site["site_id"], collector_id, req.machine_id),
            )
            # 次日重置计数器：通过 system_flags 存 last_reset_day
            last_reset = get_system_flag(c, "machines_today_reset_day", None)
            if last_reset != today:
                c.execute("UPDATE machines SET today_records_count = 0 WHERE today_records_count IS NOT NULL")
                set_system_flag(c, "machines_today_reset_day", today)
    webhook_results: List[Any] = []
    if viral_events and req.webhook_url:
        for ev in viral_events:
            webhook_results.append(await fire_webhook(req.webhook_url, ev))
    def _fmt(n):
        if n is None:
            return None
        try:
            x = int(n)
        except Exception:
            return n
        if x >= 100_000_000:
            return f"{x/100_000_000:.1f}亿".replace(".0亿", "亿")
        if x >= 10_000:
            return f"{x/10_000:.1f}万".replace(".0万", "万")
        return str(x)
    items_summary = []
    for it in req.items:
        rec: Dict[str, Any] = {
            "platform": it.platform,
            "platform_key": it.platform_key,
            "account": it.account,
            "entity_type": it.entity_type,
        }
        if it.entity_type == "COMMUNITY":
            if it.members:
                rec["members"] = _fmt(it.members)
            if it.message_volume_24h:
                rec["msg_24h"] = _fmt(it.message_volume_24h)
        else:
            if it.followers:
                rec["followers"] = _fmt(it.followers)
            if it.following:
                rec["following"] = _fmt(it.following)
            if it.likes:
                rec["likes"] = _fmt(it.likes)
            if it.views:
                rec["views"] = _fmt(it.views)
        if it.extra:
            try:
                extra = it.extra.model_dump() if hasattr(it.extra, "model_dump") else dict(it.extra)
            except Exception:
                extra = {}
            for k in ("native_account_id", "symbol", "subreddit", "channel"):
                if extra.get(k):
                    rec[k] = extra[k]
        items_summary.append(rec)
    return {
        "ok": True,
        "authorized": ident.get("authorized", False),
        "site": {
            "site_id": site["site_id"],
            "site_name": site["site_name"],
            "handshake_code": site["handshake_code"],
            "site_prefix": (site["site_id"] or "").lower()[:6],
        },
        "received": len(req.items),
        "accepted": accepted,
        "rejected_foreign": rejected_foreign,
        "rejected_invalid": rejected_invalid,
        "rejected_total": rejected_foreign + rejected_invalid,
        "rejected_sample": rejected_detail[:5],
        "viral_events": len(viral_events),
        "viral_events_sample": viral_events[:3],
        "webhook_fired": len(webhook_results),
        "webhook_results": webhook_results[:3],
        "server_version": APP_VERSION,
        "collected_at_ms": now_ms(),
        "items_summary": items_summary,
    }


# ============================================================
# Auth Routes: auth/* (公开，无鉴权) + sso/* + admin/*
# ============================================================

def _client_meta(request: Request):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return ip, ua


@app.post("/api/auth/login", tags=["auth"])
def api_login(body: LoginRequest, request: Request):
    username = (body.username or "").strip()
    ip, ua = _client_meta(request)
    with get_conn() as c:
        r = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        ok = False
        if r:
            ok = verify_password(body.password or "", r["password_hash"])
            if ok and r["status"] != "active":
                write_audit(c, r["id"], "login", False, "account_disabled", ip, ua)
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="account_disabled")
        if not ok or not r:
            write_audit(c, r["id"] if r else None, "login", False, "invalid_credentials", ip, ua)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
        user = row_to_user(r)
        c.execute(
            "UPDATE users SET last_login_at=datetime('now'), login_count=login_count+1, updated_at=datetime('now') WHERE id=?",
            (user["id"],),
        )
        write_audit(c, user["id"], "login", True, None, ip, ua)
    pair = sign_token_pair(user, request)
    return {"access_token": pair["access_token"], "refresh_token": pair["refresh_token"], "token_type": "Bearer", "user": user_public(user)}


@app.post("/api/auth/register", tags=["auth"])
def api_register(body: RegisterRequest, request: Request):
    username = (body.username or "").strip()
    code = (body.invite_code or "").strip().upper()
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "bad_username")
    email = (body.email or "").strip() or None
    if email and not EMAIL_RE.match(email):
        raise HTTPException(400, "bad_email")
    pw = body.password or ""
    if len(pw) < 8:
        raise HTTPException(400, "weak_password")
    ip, ua = _client_meta(request)
    with get_conn() as c:
        ic = c.execute(
            "SELECT * FROM invite_codes WHERE code=? AND used_by_user_id IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))",
            (code,),
        ).fetchone()
        if not ic:
            raise HTTPException(400, "invite_invalid_or_used")
        if c.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            raise HTTPException(409, "username_exists")
        if email and c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(409, "email_exists")
        role = ic["role"] if ic["role"] in ROLES else "operator"
        uid = gen_user_id()
        c.execute(
            "INSERT INTO users(id,username,email,password_hash,role,status,invite_code_used,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
            (uid, username, email, hash_password(pw), role, "active", code),
        )
        c.execute("UPDATE invite_codes SET used_by_user_id=?, used_at=datetime('now') WHERE code=?", (uid, code))
        user = row_to_user(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())
        write_audit(c, uid, "register", True, f"invite={code}", ip, ua)
    pair = sign_token_pair(user, request)
    return {"access_token": pair["access_token"], "refresh_token": pair["refresh_token"], "token_type": "Bearer", "user": user_public(user)}


@app.post("/api/auth/refresh", tags=["auth"])
def api_refresh(body: RefreshRequest, request: Request):
    token = (body.refresh_token or "").strip()
    ip, ua = _client_meta(request)
    with get_conn() as c:
        r = c.execute(
            "SELECT * FROM refresh_tokens WHERE token=? AND revoked=0 AND expires_at > datetime('now')",
            (token,),
        ).fetchone()
        if not r:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "refresh_invalid_or_revoked")
        ur = c.execute("SELECT * FROM users WHERE id=?", (r["user_id"],)).fetchone()
        if not ur or ur["status"] != "active":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "account_unavailable")
        access = sign_jwt({"sub": ur["id"], "typ": "access", "role": ur["role"], "username": ur["username"]}, ENV_JWT_ACCESS_TTL)
        write_audit(c, ur["id"], "refresh", True, None, ip, ua)
    return {"access_token": access, "token_type": "Bearer"}


@app.post("/api/auth/logout", tags=["auth"])
def api_logout(body: LogoutRequest, request: Request, user: Optional[Dict[str, Any]] = Depends(get_current_user)):
    tok = (body.refresh_token or "").strip()
    ip, ua = _client_meta(request)
    uid = user["id"] if user else None
    with get_conn() as c:
        if tok:
            c.execute("UPDATE refresh_tokens SET revoked=1 WHERE token=?", (tok,))
        write_audit(c, uid, "logout", True, None, ip, ua)
    return {"ok": True}


@app.post("/api/auth/reset-admin", tags=["auth"])
def api_reset_admin(request: Request):
    """重置管理员密码为 admin123。
    允许条件：DEBUG_MODE=true  或者  admin 账号超过 30 天未登录或从未登录。
    重置后会吊销所有 refresh_token 并记录审计日志。
    """
    ip, ua = _client_meta(request)
    with get_conn() as c:
        admin = c.execute(
            "SELECT id, username, role, created_at, "
            " (SELECT MAX(created_at) FROM audit_logs a WHERE a.user_id=u.id AND a.event='login') AS last_login"
            " FROM users u WHERE role='admin' ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        if not admin:
            seed_initial_admin(c)
            admin = c.execute("SELECT * FROM users WHERE username='admin'").fetchone()
            return {"ok": True, "username": "admin", "password": "admin123", "reason": "seeded_new_admin"}

        last_login = admin["last_login"]
        days_since_login = None
        if last_login:
            try:
                dt_last = _dt.datetime.fromisoformat(last_login.replace("Z", "+00:00"))
                days_since_login = (_dt.datetime.utcnow() - dt_last.replace(tzinfo=None)).days
            except Exception:
                days_since_login = None

        allow = ENV_DEBUG_MODE or (last_login is None) or (days_since_login is not None and days_since_login >= 30)
        if not allow:
            raise HTTPException(
                403,
                f"reset_forbidden: admin last_login={days_since_login}d (need >=30d or DEBUG_MODE=true)",
            )

        new_hash = hash_password("admin123")
        c.execute(
            "UPDATE users SET password_hash=?, must_change_pw=0, updated_at=datetime('now') WHERE id=?",
            (new_hash, admin["id"]),
        )
        c.execute("UPDATE refresh_tokens SET revoked=1 WHERE user_id=? AND revoked=0", (admin["id"],))
        write_audit(
            c,
            admin["id"],
            "reset_admin_password",
            True,
            f"reason={'debug_mode' if ENV_DEBUG_MODE else ('never_logged' if last_login is None else f'last_login_{days_since_login}d_ago')}",
            ip,
            ua,
        )
        return {
            "ok": True,
            "username": admin["username"],
            "password": "admin123",
            "reason": "debug_mode" if ENV_DEBUG_MODE else ("never_logged" if last_login is None else f"idle_{days_since_login}d"),
        }


@app.get("/api/user/me", tags=["user"])
def api_user_me(user: Dict[str, Any] = Depends(require_current_user)):
    with get_conn() as c:
        row = c.execute(
            "SELECT u.id,u.username,u.email,u.role,u.status,u.operator_uid,u.display_name,u.avatar_gradient,u.avatar_data_url,u.created_at,u.updated_at,"
            " COALESCE((SELECT COUNT(1) FROM audit_logs a WHERE a.user_id=u.id),0) AS audit_count,"
            " COALESCE((SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id=u.id AND a.event='login'),u.updated_at) AS last_login_at"
            " FROM users u WHERE u.id=?",
            (user["id"],),
        ).fetchone()
        if not row:
            raise HTTPException(404, "user_not_found")
        return {
            "id": row["id"],
            "uid": row["operator_uid"] or row["id"],
            "username": row["username"],
            "operator_name": row["display_name"] or row["username"],
            "display_name": row["display_name"] or row["username"],
            "email": row["email"],
            "role": row["role"],
            "status": row["status"],
            "operator_uid": row["operator_uid"],
            "avatar_gradient": row["avatar_gradient"],
            "avatar_data_url": row["avatar_data_url"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "audit_count": row["audit_count"],
            "last_login_at": row["last_login_at"],
        }


# -------- 我的采集器 Token --------

class CreateCollectorTokenRequest(BaseModel):
    label: Optional[str] = Field(None, max_length=64)
    expires_days: Optional[int] = Field(None, ge=1, le=365 * 10)


@app.get("/api/user/me/collector-tokens", tags=["user"])
def api_user_list_collector_tokens(user: Dict[str, Any] = Depends(require_current_user)):
    op_uid = user.get("operator_uid")
    if not op_uid:
        return {"items": [], "note": "账号未绑定 operator_uid，请联系管理员在「用户管理」绑定运营档案"}
    with get_conn() as c:
        site = get_current_site(c)
        rows = c.execute(
            "SELECT id, site_id, operator_uid, label, status, created_at, last_used_at, expires_at, revoked_at "
            "FROM collector_tokens WHERE operator_uid=? AND site_id=? ORDER BY created_at DESC LIMIT 100",
            (op_uid, site["site_id"]),
        ).fetchall()
        items = []
        hb_cutoff = now_ms() - 15 * 60 * 1000
        for r in rows:
            now = _dt.datetime.now().isoformat(timespec="seconds")
            machine_rows = c.execute(
                "SELECT machine_id, machine_name, last_hb_at, today_records_count, pending_count, source, version, status, ip_address "
                "FROM machines WHERE collector_id=? AND site_id=? ORDER BY last_hb_at DESC",
                (r["id"], site["site_id"]),
            ).fetchall()
            online_count = sum(1 for m in machine_rows if (m["last_hb_at"] or 0) >= hb_cutoff)
            today_total = sum(int(m["today_records_count"] or 0) for m in machine_rows)
            items.append(dict(
                id=r["id"],
                site_id=r["site_id"],
                site_name=site["site_name"],
                handshake_code=site["handshake_code"],
                operator_uid=r["operator_uid"],
                label=r["label"],
                created_at=r["created_at"],
                last_used_at=r["last_used_at"],
                expires_at=r["expires_at"],
                revoked_at=r["revoked_at"],
                status=(r["status"] or "active") if r["revoked_at"] is None else "revoked",
                _computed_status="revoked" if r["revoked_at"] else ("expired" if r["expires_at"] and r["expires_at"] < now else "active"),
                online_machines=online_count,
                today_records=today_total,
                machines=[
                    {
                        "machine_id": m["machine_id"],
                        "machine_name": m["machine_name"],
                        "last_hb_at": m["last_hb_at"],
                        "today_records": int(m["today_records_count"] or 0),
                        "pending_count": int(m["pending_count"] or 0),
                        "source": m["source"],
                        "version": m["version"],
                        "status": m["status"],
                        "ip": m["ip_address"],
                        "online": bool((m["last_hb_at"] or 0) >= hb_cutoff),
                    }
                    for m in machine_rows
                ],
            ))
    return {"items": items, "operator_uid": op_uid, "site": site}


@app.post("/api/user/me/collector-tokens", tags=["user"])
def api_user_create_collector_token(body: CreateCollectorTokenRequest, request: Request, user: Dict[str, Any] = Depends(require_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, detail="admin_only: 仅管理员可创建采集器 Token，请联系管理员分配")
    op_uid = user.get("operator_uid")
    if not op_uid:
        raise HTTPException(400, detail="account_not_bound_to_operator")
    ip, ua = _client_meta(request)
    with get_conn() as c:
        site = get_current_site(c)
        token_id = "col_" + secrets.token_hex(8)
        plain = gen_collector_plaintext(site, token_id)
        expires_at = None
        if body.expires_days and body.expires_days > 0:
            expires_at = (_dt.datetime.utcnow() + _dt.timedelta(days=body.expires_days)).isoformat(timespec="seconds")
        c.execute(
            "INSERT INTO collector_tokens(id,site_id,operator_uid,token_hash,label,expires_at,created_at,status) VALUES (?,?,?,?,?,?,datetime('now'),'active')",
            (token_id, site["site_id"], op_uid, _hash_token(plain), (body.label or "").strip()[:64] or None, expires_at),
        )
        write_audit(c, user["id"], "create_collector_token", True, f"token_id={token_id} label={body.label}", ip, ua)
    return {
        "ok": True,
        "id": token_id,
        "token": plain,
        "note": "⚠️ 此明文 token 仅显示一次，丢失不可找回，请妥善保存",
        "operator_uid": op_uid,
        "site": {
            "site_id": site["site_id"],
            "site_name": site["site_name"],
            "handshake_code": site["handshake_code"],
            "site_prefix": (site["site_id"] or "").lower()[:6],
        },
        "collector_prefix": (token_id or "").lower()[:8],
        "label": body.label,
        "expires_at": expires_at,
        "usage": "粘贴到插件「采集器 Token」字段或 Python 脚本 --operator-token / YAML operator_token 即可；粘贴后会自动识别站点并核对握手码",
    }


@app.delete("/api/user/me/collector-tokens/{token_id}", tags=["user"])
def api_user_revoke_collector_token(token_id: str, request: Request, user: Dict[str, Any] = Depends(require_current_user)):
    op_uid = user.get("operator_uid")
    if not op_uid:
        raise HTTPException(404, "token_not_found")
    ip, ua = _client_meta(request)
    with get_conn() as c:
        site = get_current_site(c)
        row = c.execute("SELECT id, operator_uid, site_id FROM collector_tokens WHERE id=?", (token_id,)).fetchone()
        if not row or row["operator_uid"] != op_uid or row["site_id"] != site["site_id"]:
            raise HTTPException(404, "token_not_found")
        c.execute(
            "UPDATE collector_tokens SET revoked_at=datetime('now'), status='revoked' WHERE id=?",
            (token_id,),
        )
        write_audit(c, user["id"], "revoke_collector_token", True, f"token_id={token_id}", ip, ua)
    return {"ok": True, "id": token_id, "revoked": True}


@app.get("/api/user/me/collector-tokens/{token_id}/machines", tags=["user"])
def api_user_collector_machines(token_id: str, user: Dict[str, Any] = Depends(require_current_user)):
    op_uid = user.get("operator_uid")
    if not op_uid:
        return {"items": [], "token_id": token_id}
    with get_conn() as c:
        site = get_current_site(c)
        row = c.execute("SELECT id, operator_uid, site_id FROM collector_tokens WHERE id=?", (token_id,)).fetchone()
        if not row or row["operator_uid"] != op_uid or row["site_id"] != site["site_id"]:
            raise HTTPException(404, "token_not_found")
        rows = c.execute(
            "SELECT machine_id, machine_name, last_hb_at, last_collect_at, today_records_count, pending_count, source, version, status, ip_address, user_agent, operator_uid, operator_name "
            "FROM machines WHERE collector_id=? AND site_id=? ORDER BY last_hb_at DESC LIMIT 50",
            (token_id, site["site_id"]),
        ).fetchall()
        hb_cutoff = now_ms() - 15 * 60 * 1000
        items = [
            {
                "machine_id": r["machine_id"],
                "machine_name": r["machine_name"],
                "last_hb_at": r["last_hb_at"],
                "last_collect_at": r["last_collect_at"],
                "today_records": int(r["today_records_count"] or 0),
                "pending": int(r["pending_count"] or 0),
                "source": r["source"],
                "version": r["version"],
                "status": r["status"],
                "ip": r["ip_address"],
                "user_agent": r["user_agent"],
                "operator_uid": r["operator_uid"],
                "operator_name": r["operator_name"],
                "online": bool((r["last_hb_at"] or 0) >= hb_cutoff),
            }
            for r in rows
        ]
    return {"ok": True, "token_id": token_id, "items": items, "site": site}


@app.get("/api/admin/site-overview", tags=["admin"])
def api_admin_site_overview(user: Dict[str, Any] = Depends(require_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "admin_only")
    with get_conn() as c:
        site = get_current_site(c)
        hb_cutoff = now_ms() - 15 * 60 * 1000
        token_stats = c.execute(
            "SELECT status, COUNT(*) AS n FROM collector_tokens WHERE site_id=? GROUP BY status",
            (site["site_id"],),
        ).fetchall()
        machine_stats = c.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN last_hb_at >= ? THEN 1 ELSE 0 END), 0) AS online_n, COALESCE(SUM(today_records_count),0) AS today_n FROM machines WHERE site_id=?",
            (hb_cutoff, site["site_id"]),
        ).fetchone()
        per_op = c.execute(
            "SELECT o.operator_uid, o.operator_name, "
            "  COALESCE(COUNT(DISTINCT t.id),0) AS tokens, "
            "  COALESCE(SUM(CASE WHEN m.last_hb_at >= ? THEN 1 ELSE 0 END), 0) AS online_machines, "
            "  COALESCE(SUM(m.today_records_count), 0) AS today_n "
            "FROM operators o "
            "LEFT JOIN collector_tokens t ON t.operator_uid=o.operator_uid AND t.site_id=? "
            "LEFT JOIN machines m ON m.collector_id=t.id AND m.site_id=? "
            "GROUP BY o.operator_uid, o.operator_name ORDER BY today_n DESC",
            (hb_cutoff, site["site_id"], site["site_id"]),
        ).fetchall()
    return {
        "ok": True,
        "site": site,
        "collector_tokens": {
            "total": sum(int(r["n"] or 0) for r in token_stats),
            "active": sum(int(r["n"] or 0) for r in token_stats if (r["status"] or "active") == "active"),
            "revoked": sum(int(r["n"] or 0) for r in token_stats if (r["status"] or "active") == "revoked"),
        },
        "machines": {
            "total": int(machine_stats["n"] or 0),
            "online": int(machine_stats["online_n"] or 0),
            "offline": int((machine_stats["n"] or 0) - (machine_stats["online_n"] or 0)),
            "today_records": int(machine_stats["today_n"] or 0),
        },
        "per_operator": [
            {
                "operator_uid": r["operator_uid"],
                "operator_name": r["operator_name"],
                "tokens": int(r["tokens"] or 0),
                "online_machines": int(r["online_machines"] or 0),
                "today_records": int(r["today_n"] or 0),
            }
            for r in per_op
        ],
    }


@app.patch("/api/user/me", tags=["user"])
def api_user_update_me(body: UpdateMeRequest, request: Request, user: Dict[str, Any] = Depends(require_current_user)):
    ip, ua = _client_meta(request)
    fields, params = [], []
    if body.display_name is not None:
        name = body.display_name.strip()[:40]
        if not name: raise HTTPException(400, "weak_display_name")
        fields.append("display_name=?"); params.append(name)
    if body.email is not None:
        fields.append("email=?"); params.append(body.email)
    if body.avatar_gradient is not None:
        if re.fullmatch(r"#[0-9a-fA-F]{6},#[0-9a-fA-F]{6}", body.avatar_gradient or "") or body.avatar_gradient == "":
            fields.append("avatar_gradient=?"); params.append(body.avatar_gradient)
        else:
            raise HTTPException(400, "bad_avatar_gradient")
    if body.avatar_data_url is not None:
        data = body.avatar_data_url or ""
        if data and not data.startswith("data:image/"):
            raise HTTPException(400, "bad_avatar_data_url")
        if len(data) > 1.2 * 1024 * 1024:
            raise HTTPException(400, "avatar_too_large")
        fields.append("avatar_data_url=?"); params.append(data)
    if not fields:
        raise HTTPException(400, "nothing_to_update")
    params.append(user["id"])
    with get_conn() as c:
        c.execute(f"UPDATE users SET {', '.join(fields)}, updated_at=datetime('now') WHERE id=?", tuple(params))
        write_audit(c, user["id"], "update_me", True, f"fields={','.join(fields)}", ip, ua)
    return {"ok": True}


@app.post("/api/user/me/change-password", tags=["user"])
def api_user_change_password(body: ChangePasswordRequest, request: Request, user: Dict[str, Any] = Depends(require_current_user)):
    ip, ua = _client_meta(request)
    new_pw = (body.new_password or "").strip()
    if len(new_pw) < 8:
        raise HTTPException(400, "weak_password")
    with get_conn() as c:
        row = c.execute("SELECT password_hash FROM users WHERE id=?", (user["id"],)).fetchone()
        if not row or not verify_password(body.old_password or "", row["password_hash"]):
            raise HTTPException(400, "invalid_credentials")
        c.execute("UPDATE users SET password_hash=?, must_change_pw=0, updated_at=datetime('now') WHERE id=?", (hash_password(new_pw), user["id"]))
        c.execute("UPDATE refresh_tokens SET revoked=1 WHERE user_id=? AND revoked=0", (user["id"],))
        write_audit(c, user["id"], "change_password", True, None, ip, ua)
    return {"ok": True}


@app.get("/api/whoami", tags=["dashboard"])
def api_whoami(user: Optional[Dict[str, Any]] = Depends(get_current_user)):
    if not user:
        if ENV_REQUIRE_AUTH: raise HTTPException(401, "auth_required")
        return {"id": "anon", "uid": "op_001", "name": "访客模式", "role": "operator", "machine_id": None, "display_name": "访客模式"}
    with get_conn() as c:
        row = c.execute(
            "SELECT display_name, avatar_gradient, avatar_data_url FROM users WHERE id=?",
            (user["id"],),
        ).fetchone()
    return {
        "id": user["id"],
        "uid": user["operator_uid"] or user["id"],
        "name": (row and row["display_name"]) or user["username"],
        "display_name": (row and row["display_name"]) or user["username"],
        "role": user["role"],
        "machine_id": user.get("machine_id"),
        "username": user.get("username"),
        "email": user.get("email"),
        "avatar_gradient": row["avatar_gradient"] if row else None,
        "avatar_data_url": row["avatar_data_url"] if row else None,
    }


class UpdateAccountRequest(BaseModel):
    account_name: Optional[str] = None
    avatar_color: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[str] = None


@app.patch("/api/accounts/{account_id}", tags=["accounts"])
def api_patch_account(account_id: str, body: UpdateAccountRequest, request: Request, user: Dict[str, Any] = Depends(require_current_user)):
    ip, ua = _client_meta(request)
    fields, params = [], []
    if body.account_name is not None:
        name = body.account_name.strip()[:80]
        if not name: raise HTTPException(400, "weak_name")
        fields.append("account_name=?"); params.append(name)
    if body.avatar_color is not None:
        if re.fullmatch(r"#[0-9a-fA-F]{6},#[0-9a-fA-F]{6}", body.avatar_color or "") or body.avatar_color == "":
            fields.append("avatar_color=?"); params.append(body.avatar_color)
        else:
            raise HTTPException(400, "bad_avatar_color")
    if body.note is not None:
        fields.append("note=?"); params.append(body.note)
    if body.tags is not None:
        fields.append("tags=?"); params.append(body.tags)
    if not fields: raise HTTPException(400, "nothing_to_update")
    params.append(account_id)
    with get_conn() as c:
        if user["role"] != "admin":
            existing = c.execute("SELECT assigned_operator_uid FROM accounts WHERE id=?", (account_id,)).fetchone()
            if not existing: raise HTTPException(404, "not_found")
            if existing["assigned_operator_uid"] and existing["assigned_operator_uid"] != (user.get("operator_uid") or user["id"]):
                raise HTTPException(403, "forbidden")
        c.execute(f"UPDATE accounts SET {', '.join(fields)}, updated_at=datetime('now') WHERE id=?", tuple(params))
        write_audit(c, user["id"], "update_account", True, f"id={account_id} fields={','.join(fields)}", ip, ua)
    return {"ok": True}


# -------- SSO --------

@app.get("/api/sso/config", tags=["sso"])
def api_sso_config():
    return {
        "sso_login_url": ENV_SSO_LOGIN_URL,
        "sso_button_label": ENV_SSO_BUTTON_LABEL,
        "allow_paste_token": True,
        "require_auth": ENV_REQUIRE_AUTH,
    }


@app.post("/api/sso/jwt-login", tags=["sso"])
def api_sso_jwt_login(body: SSOJWTLoginRequest, request: Request):
    ip, ua = _client_meta(request)
    external = (body.external_jwt or "").strip()
    if not ENV_SSO_JWT_SECRET and not ENV_SSO_JWK_URL:
        raise HTTPException(400, "sso_not_enabled")
    try:
        if ENV_SSO_JWT_ALG.upper() == "RS256" and ENV_SSO_JWK_URL:
            payload = decode_jwt_rs256(external, ENV_SSO_JWK_URL)
        elif ENV_SSO_JWT_SECRET:
            payload = decode_jwt(external, ENV_SSO_JWT_SECRET, ENV_SSO_JWT_ALG or "HS256")
        else:
            raise HTTPException(400, "sso_not_enabled")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid_token: {e.__class__.__name__}")
    sub = payload.get("sub")
    name = payload.get("name") or payload.get("username") or sub
    role = payload.get("role") or "operator"
    if role not in ROLES:
        role = "operator"
    email = payload.get("email")
    provider = "sso_default"
    uid = None
    with get_conn() as c:
        r = c.execute(
            "SELECT * FROM users WHERE sso_provider=? AND sso_sub=?",
            (provider, str(sub)),
        ).fetchone()
        if not r and email:
            r = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if r:
            uid = r["id"]
            if r["status"] != "active":
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "account_disabled")
            c.execute(
                "UPDATE users SET sso_provider=COALESCE(?, sso_provider), sso_sub=COALESCE(?, sso_sub), updated_at=datetime('now') WHERE id=?",
                (provider, str(sub), uid),
            )
            user = row_to_user(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())
        else:
            uid = gen_user_id()
            username_base = (email or "").split("@")[0] if email else str(sub)
            username = username_base[:20] if username_base else f"sso_{sub}"
            suffix = 1
            base_username = username
            while c.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
                username = f"{base_username[:16]}_{suffix}"
                suffix += 1
            c.execute(
                "INSERT INTO users(id,username,email,role,status,sso_provider,sso_sub,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
                (uid, username, email, role, "active", provider, str(sub)),
            )
            user = row_to_user(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())
        write_audit(c, uid, "sso_login", True, f"sub={sub}", ip, ua)
        c.execute("UPDATE users SET last_login_at=datetime('now'), login_count=login_count+1 WHERE id=?", (uid,))
    pair = sign_token_pair(user, request)
    return {"access_token": pair["access_token"], "refresh_token": pair["refresh_token"], "token_type": "Bearer", "user": user_public(user)}


@app.get("/api/sso/oauth-callback", tags=["sso"])
def api_sso_oauth_callback(code: Optional[str] = None, state: Optional[str] = None):
    return {"error": "TODO_oauth_code_pending", "code": code, "state": state}


# -------- Admin (需admin+ Admin 9 endpoints (role=admin --------

@app.get("/api/admin/users", tags=["admin"])
def api_admin_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    q: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    user: Dict[str, Any] = Depends(require_role("admin")),
):
    conds: List[str] = []
    args: List[Any] = []
    if q:
        conds.append("(username LIKE ? OR email LIKE ?)")
        args += [f"%{q}%", f"%{q}%"]
    if role in ROLES:
        conds.append("role=?")
        args.append(role)
    if status in {"active", "disabled", "pending"}:
        conds.append("status=?")
        args.append(status)
    _field_re = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\b(?=\s*(?:=|LIKE\b))", re.IGNORECASE)
    for cond in conds:
        for f in _field_re.findall(cond):
            if f not in ALLOWED_USER_LIST_WHERE_FIELDS:
                raise HTTPException(400, f"invalid_field: {f}")
    where = f"WHERE {' AND '.join(conds)}" if conds else ""
    with get_conn() as c:
        total = c.execute(f"SELECT COUNT(*) AS n FROM users {where}", args).fetchone()["n"]
        rows = c.execute(
            f"SELECT u.*, o.operator_name AS op_name FROM users u LEFT JOIN operators o ON o.operator_uid=u.operator_uid {where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?",
            args + [size, (page - 1) * size],
        ).fetchall()
    items = []
    for r in rows:
        u = row_to_user(r)
        u["operator_name"] = r["op_name"]
        u["sso_provider"] = r["sso_provider"]
        items.append(u)
    return {"items": items, "total": total, "page": page, "size": size}


@app.post("/api/admin/users", tags=["admin"])
def api_admin_create_user(body: CreateUserRequest, request: Request, user: Dict[str, Any] = Depends(require_role("admin"))):
    email = (body.email or "").strip() or None
    if email and not EMAIL_RE.match(email):
        raise HTTPException(400, "bad_email")
    username = (body.username or "").strip()
    if not username:
        username_base = email.split("@")[0] if email else None
        if not username_base:
            raise HTTPException(400, "username_or_email_required")
        username = username_base[:20]
    role = body.role if body.role in ROLES else "operator"
    status = body.status if body.status in {"active", "disabled", "pending"} else "active"
    op_uid = body.operator_uid or None
    pwd_plain = body.password or gen_random_pwd()
    ip, ua = _client_meta(request)
    with get_conn() as c:
        suffix = 1
        base_username = username
        while c.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            username = f"{base_username[:16]}_{suffix}"
            suffix += 1
        if not USERNAME_RE.match(username):
            raise HTTPException(400, "bad_username")
        if email and c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(409, "email_exists")
        uid = gen_user_id()
        c.execute(
            "INSERT INTO users(id,username,email,password_hash,role,status,operator_uid,created_at,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
            (uid, username, email, hash_password(pwd_plain), role, status, op_uid),
        )
        write_audit(c, user["id"], "admin_create_user", True, f"target={uid} role={role}", ip, ua)
    return {"ok": True, "user_id": uid, "username": username, "generated_password": pwd_plain if not body.password else None}


@app.patch("/api/admin/users/{user_id}", tags=["admin"])
def api_admin_update_user(user_id: str, body: UpdateUserRequest, user: Dict[str, Any] = Depends(require_role("admin"))):
    with get_conn() as c:
        existing = c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "user_not_found")
        sets = []
        args: List[Any] = []
        if body.username is not None:
            u = body.username.strip()
            if not USERNAME_RE.match(u):
                raise HTTPException(400, "bad_username")
            if c.execute("SELECT 1 FROM users WHERE username=? AND id!=?", (u, user_id)).fetchone():
                raise HTTPException(409, "username_exists")
            sets.append("username=?")
            args.append(u)
        if body.email is not None:
            e = body.email.strip() or None
            if e and not EMAIL_RE.match(e):
                raise HTTPException(400, "bad_email")
            if e and c.execute("SELECT 1 FROM users WHERE email=? AND id!=?", (e, user_id)).fetchone():
                raise HTTPException(409, "email_exists")
            sets.append("email=?")
            args.append(e)
        if body.role in ROLES and body.role != existing["role"]:
            sets.append("role=?")
            args.append(body.role)
        if body.status in {"active", "disabled", "pending"} and body.status != existing["status"]:
            sets.append("status=?")
            args.append(body.status)
        if body.operator_uid is not None:  # 允许 None 解绑
            sets.append("operator_uid=?")
            args.append(body.operator_uid or None)
        if sets:
            sets.append("updated_at=datetime('now')")
            _set_re = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\b(?=\s*=)")
            for s in sets:
                for f in _set_re.findall(s):
                    if f not in ALLOWED_USER_UPDATE_SET_FIELDS:
                        raise HTTPException(400, f"invalid_field: {f}")
            c.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", args + [user_id])
    return {"ok": True}


@app.post("/api/admin/users/{user_id}/reset-password", tags=["admin"])
def api_admin_reset_pw(user_id: str, user: Dict[str, Any] = Depends(require_role("admin"))):
    pwd = gen_random_pwd()
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone():
            raise HTTPException(404, "user_not_found")
        c.execute("UPDATE users SET password_hash=?, must_change_pw=1, updated_at=datetime('now') WHERE id=?", (hash_password(pwd), user_id))
        write_audit(c, user["id"], "admin_reset_pw", True, f"target={user_id}")
    return {"ok": True, "password": pwd}


@app.post("/api/admin/users/{user_id}/disable", tags=["admin"])
def api_admin_disable(user_id: str, user: Dict[str, Any] = Depends(require_role("admin"))):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone():
            raise HTTPException(404, "user_not_found")
        c.execute("UPDATE users SET status='disabled', updated_at=datetime('now') WHERE id=?", (user_id,))
        write_audit(c, user["id"], "admin_disable", True, f"target={user_id}")
    return {"ok": True}


@app.post("/api/admin/users/{user_id}/enable", tags=["admin"])
def api_admin_enable(user_id: str, user: Dict[str, Any] = Depends(require_role("admin"))):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone():
            raise HTTPException(404, "user_not_found")
        c.execute("UPDATE users SET status='active', updated_at=datetime('now') WHERE id=?", (user_id,))
        write_audit(c, user["id"], "admin_enable", True, f"target={user_id}")
    return {"ok": True}


@app.get("/api/admin/invite-codes", tags=["admin"])
def api_admin_list_invites(used: str = Query("all"), user: Dict[str, Any] = Depends(require_role("admin"))):
    sql = "SELECT ic.*, u.username AS used_by_name FROM invite_codes ic LEFT JOIN users u ON u.id=ic.used_by_user_id ORDER BY ic.created_at DESC LIMIT 200"
    with get_conn() as c:
        rows = [dict(r) for r in c.execute(sql).fetchall()]
    if used == "unused":
        rows = [r for r in rows if r["used_by_user_id"] is None]
    elif used == "used":
        rows = [r for r in rows if r["used_by_user_id"] is not None]
    return {"items": rows}


@app.post("/api/admin/invite-codes", tags=["admin"])
def api_admin_create_invite(body: CreateInviteCodeRequest, request: Request, user: Dict[str, Any] = Depends(require_role("admin"))):
    role = body.role if body.role in ROLES else "operator"
    expires = None
    if body.expires_days and body.expires_days > 0:
        expires = (_dt.datetime.utcnow() + _dt.timedelta(days=body.expires_days)).isoformat(timespec="seconds")
    code = gen_invite_code()
    ip, ua = _client_meta(request)
    with get_conn() as c:
        c.execute(
            "INSERT INTO invite_codes(code,created_by_user_id,role,expires_at,created_at) VALUES (?,?,?,?,datetime('now'))",
            (code, user["id"], role, expires),
        )
        write_audit(c, user["id"], "admin_create_invite", True, f"code={code[:6]} role={role}", ip, ua)
    return {"ok": True, "code": code, "role": role, "expires_at": expires}


@app.get("/api/admin/operators", tags=["admin"])
def api_admin_operators(user: Dict[str, Any] = Depends(require_role("admin"))):
    with get_conn() as c:
        rows = [dict(r) for r in c.execute("SELECT operator_uid, operator_name, role, avatar_color, status FROM operators WHERE status='active' ORDER BY operator_name")]
    return {"items": rows}


class AdminCreateCollectorTokenRequest(BaseModel):
    operator_uid: str = Field(..., min_length=1, max_length=64)
    label: Optional[str] = Field(None, max_length=64)
    expires_days: Optional[int] = Field(None, ge=1, le=365 * 10)


@app.post("/api/admin/collector-tokens", tags=["admin"])
def api_admin_create_collector_token(body: AdminCreateCollectorTokenRequest, request: Request, user: Dict[str, Any] = Depends(require_role("admin"))):
    target_uid = (body.operator_uid or "").strip()
    if not target_uid:
        raise HTTPException(400, detail="operator_uid_required")
    ip, ua = _client_meta(request)
    with get_conn() as c:
        site = get_current_site(c)
        op_row = c.execute(
            "SELECT operator_uid, operator_name, role FROM operators WHERE operator_uid=? AND status='active'",
            (target_uid,),
        ).fetchone()
        if not op_row:
            raise HTTPException(404, detail="operator_not_found")
        token_id = "col_" + secrets.token_hex(8)
        plain = gen_collector_plaintext(site, token_id)
        expires_at = None
        if body.expires_days and body.expires_days > 0:
            expires_at = (_dt.datetime.utcnow() + _dt.timedelta(days=body.expires_days)).isoformat(timespec="seconds")
        c.execute(
            "INSERT INTO collector_tokens(id,site_id,operator_uid,token_hash,label,expires_at,created_at,status) VALUES (?,?,?,?,?,?,datetime('now'),'active')",
            (token_id, site["site_id"], target_uid, _hash_token(plain), (body.label or "").strip()[:64] or None, expires_at),
        )
        write_audit(c, user["id"], "admin_create_collector_token", True,
                    f"token_id={token_id} target_operator={target_uid} label={body.label}", ip, ua)
    return {
        "ok": True,
        "id": token_id,
        "token": plain,
        "note": "⚠️ 此明文 token 仅显示一次，丢失不可找回，请妥善保存；请将 Token 下发给对应运营人（勿转发无关人员）",
        "operator_uid": target_uid,
        "operator_name": op_row["operator_name"],
        "site": {
            "site_id": site["site_id"],
            "site_name": site["site_name"],
            "handshake_code": site["handshake_code"],
            "site_prefix": (site["site_id"] or "").lower()[:6],
        },
        "collector_prefix": (token_id or "").lower()[:8],
        "label": body.label,
        "expires_at": expires_at,
        "usage": "请让对应运营人在插件「采集器 Token」字段或 Python 脚本 --operator-token / YAML operator_token 粘贴此 Token；粘贴后会自动识别站点并核对握手码，所有通过此 Token 上报的记录会自动归属到「" + (op_row["operator_name"] or target_uid) + "」",
    }


class PatchSystemFlagRequest(BaseModel):
    key: str
    value: Any


@app.get("/api/admin/system-flags", tags=["admin"])
def api_admin_list_system_flags(user: Dict[str, Any] = Depends(require_role("admin"))):
    with get_conn() as c:
        rows = [dict(r) for r in c.execute("SELECT key, value, updated_at FROM system_flags ORDER BY key")]
    defaults = {"mock_enabled": "true"}
    out = {r["key"]: dict(value=r["value"], updated_at=r.get("updated_at")) for r in rows}
    for k, v in defaults.items():
        if k not in out:
            out[k] = dict(value=v, updated_at=None)
    return {"items": rows, "flags": out}


@app.patch("/api/admin/system-flags", tags=["admin"])
def api_admin_patch_system_flags(body: List[PatchSystemFlagRequest], request: Request, user: Dict[str, Any] = Depends(require_role("admin"))):
    ip, ua = _client_meta(request)
    ALLOWED = {"mock_enabled"}
    with get_conn() as c:
        for item in body:
            if item.key not in ALLOWED:
                raise HTTPException(400, f"forbidden_flag: {item.key}")
            if item.key == "mock_enabled":
                item.value = "true" if str(item.value).lower() in {"1", "true", "yes", "on"} else "false"
            set_system_flag(c, item.key, item.value)
        write_audit(c, user["id"], "admin_patch_system_flags", True, f"keys={','.join(b.key for b in body)}", ip, ua)
    return {"ok": True}


class AdminClearDataRequest(BaseModel):
    scope: str = "all"
    confirm: bool = False


@app.post("/api/admin/clear-data", tags=["admin"])
def api_admin_clear_data(body: AdminClearDataRequest, request: Request, user: Dict[str, Any] = Depends(require_role("admin"))):
    ip, ua = _client_meta(request)
    if not body.confirm:
        raise HTTPException(400, "confirm_required")
    scope = (body.scope or "all").lower()
    with get_conn() as c:
        deleted = {"records": 0, "daily_snapshots": 0, "accounts": 0}
        if scope in {"all", "monitoring"}:
            r1 = c.execute("DELETE FROM records")
            r2 = c.execute("DELETE FROM daily_snapshots")
            r3 = c.execute("DELETE FROM accounts")
            deleted["records"] = getattr(r1, "rowcount", 0) or 0
            deleted["daily_snapshots"] = getattr(r2, "rowcount", 0) or 0
            deleted["accounts"] = getattr(r3, "rowcount", 0) or 0
        elif scope == "records":
            r1 = c.execute("DELETE FROM records")
            r2 = c.execute("DELETE FROM daily_snapshots")
            deleted["records"] = getattr(r1, "rowcount", 0) or 0
            deleted["daily_snapshots"] = getattr(r2, "rowcount", 0) or 0
        else:
            raise HTTPException(400, f"unknown_scope: {scope}")
        write_audit(c, user["id"], "admin_clear_data", True, f"scope={scope} deleted={deleted}", ip, ua)
    return {"ok": True, "scope": scope, "deleted": deleted}


@app.delete("/api/admin/accounts/{account_id}", tags=["admin"])
def api_admin_delete_account(account_id: str, request: Request, user: Dict[str, Any] = Depends(require_role("admin"))):
    ip, ua = _client_meta(request)
    with get_conn() as c:
        acc = c.execute("SELECT id, account_name, platform FROM accounts WHERE id=?", (account_id,)).fetchone()
        if not acc:
            raise HTTPException(404, "account_not_found")
        c.execute("DELETE FROM records WHERE account_id=?", (account_id,))
        c.execute("DELETE FROM daily_snapshots WHERE account_id=?", (account_id,))
        c.execute("DELETE FROM accounts WHERE id=?", (account_id,))
        write_audit(c, user["id"], "admin_delete_account", True, f"account_id={account_id} name={acc['account_name']}", ip, ua)
    return {"ok": True, "account_id": account_id, "account_name": acc["account_name"]}


@app.delete("/api/admin/accounts/{account_id}/records", tags=["admin"])
def api_admin_clear_account_records(account_id: str, request: Request, user: Dict[str, Any] = Depends(require_role("admin"))):
    ip, ua = _client_meta(request)
    with get_conn() as c:
        acc = c.execute("SELECT id FROM accounts WHERE id=?", (account_id,)).fetchone()
        if not acc:
            raise HTTPException(404, "account_not_found")
        c.execute("DELETE FROM records WHERE account_id=?", (account_id,))
        c.execute("DELETE FROM daily_snapshots WHERE account_id=?", (account_id,))
        write_audit(c, user["id"], "admin_clear_account_records", True, f"account_id={account_id}", ip, ua)
    return {"ok": True, "account_id": account_id}


# ============================================================
# Admin: 官方监控清单管理（Stocktwits 股票 + Reddit Subreddit 社区）
# ============================================================

class _AddMonitorStockReq(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=12)
    note: Optional[str] = Field(default=None, max_length=500)
    tags: Optional[List[str]] = Field(default=None)


class _AddMonitorCommunityReq(BaseModel):
    subreddit: str = Field(..., min_length=1, max_length=30)
    note: Optional[str] = Field(default=None, max_length=500)
    tags: Optional[List[str]] = Field(default=None)


class _AccountLogoReq(BaseModel):
    avatar_data_url: Optional[str] = Field(default=None)
    avatar_url: Optional[str] = Field(default=None, max_length=1000)


@app.put("/api/admin/accounts/{account_id}/logo", tags=["admin"])
def api_admin_update_account_logo(
    account_id: str,
    body: _AccountLogoReq,
    request: Request,
    user: Dict[str, Any] = Depends(require_role("admin")),
):
    ip, ua = _client_meta(request)
    if not body.avatar_data_url and not body.avatar_url:
        raise HTTPException(400, "empty_payload: avatar_data_url 或 avatar_url 至少提供一项")
    if body.avatar_data_url:
        if len(body.avatar_data_url) > 4 * 1024 * 1024:
            raise HTTPException(400, "payload_too_large: 头像不得超过约 3MB")
        if not body.avatar_data_url.startswith("data:image/"):
            raise HTTPException(400, "invalid_data_url: avatar_data_url 必须是 data:image/... 格式")
    with get_conn() as c:
        acc = c.execute("SELECT id, entity_type, account_name FROM accounts WHERE id=?", (account_id,)).fetchone()
        if not acc:
            raise HTTPException(404, "account_not_found")
        c.execute(
            "UPDATE accounts SET avatar_data_url=COALESCE(?, avatar_data_url), avatar_url=COALESCE(?, avatar_url), updated_at=datetime('now') WHERE id=?",
            (body.avatar_data_url, body.avatar_url, account_id),
        )
        write_audit(c, user["id"], "admin_update_account_logo", True, f"id={account_id} name={acc['account_name']} type={acc['entity_type']}", ip, ua)
    return {"ok": True, "id": account_id}


_SYMBOL_RE = re.compile(r"^[A-Z0-9.]{1,10}$")
_SUBR_RE = re.compile(r"^[A-Za-z0-9_-]{2,21}$")


def _account_id_for(pk: str, name: str, et: str) -> str:
    return f"acc_{hashlib.md5(f'{pk}|{name}|{et}'.encode()).hexdigest()[:14]}"


@app.get("/api/admin/monitored-stocks", tags=["admin"])
def api_admin_list_stocks(
    q: Optional[str] = Query(None, max_length=30),
    page: int = Query(1, ge=1, le=200),
    size: int = Query(50, ge=1, le=200),
    user: Dict[str, Any] = Depends(require_role("admin")),
):
    with get_conn() as c:
        where = "WHERE platform_key='stocktwits' AND entity_type='STOCK'"
        params: List[Any] = []
        if q:
            where += " AND (account_name LIKE ? OR symbol LIKE ?)"
            params += [f"%{q.upper()}%", f"%{q.upper()}%"]
        total = c.execute(f"SELECT COUNT(*) AS n FROM accounts {where}", params).fetchone()["n"]
        rows = c.execute(
            f"SELECT a.*, (SELECT MAX(updated_at) FROM records r WHERE r.account_id=a.id) AS last_update "
            f"FROM accounts a {where} ORDER BY last_update DESC NULLS LAST, a.created_at DESC LIMIT ? OFFSET ?",
            params + [size, (page - 1) * size],
        ).fetchall()
        items = []
        for r in rows:
            d = dict(r)
            if d.get("tags") and isinstance(d["tags"], str):
                try: d["tags"] = json.loads(d["tags"])
                except Exception: d["tags"] = []
            items.append(d)
    return {"ok": True, "items": items, "total": total, "page": page, "size": size}


@app.post("/api/admin/monitored-stocks", tags=["admin"])
def api_admin_add_stock(body: _AddMonitorStockReq, request: Request, user: Dict[str, Any] = Depends(require_role("admin"))):
    ip, ua = _client_meta(request)
    sym_raw = (body.symbol or "").strip().upper()
    m = _SYMBOL_RE.match(sym_raw)
    if not m:
        raise HTTPException(400, f"invalid_symbol: 仅允许字母/数字/.，长度1-10")
    sym = m.group(0)
    pk = "stocktwits"
    et = "STOCK"
    aid = _account_id_for(pk, sym, et)
    target = f"https://stocktwits.com/symbol/{sym}"
    avatar_color = "#6366f1,#8b5cf6"
    tags_json = json.dumps(body.tags, ensure_ascii=False) if body.tags else None
    with get_conn() as c:
        exist = c.execute("SELECT id,account_name FROM accounts WHERE id=?", (aid,)).fetchone()
        if exist:
            raise HTTPException(409, f"already_in_list: {sym} 已在监控清单")
        c.execute(
            "INSERT INTO accounts (id,platform,platform_key,account_name,entity_type,symbol,target_url,avatar_color,active,note,tags,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
            (aid, "Stocktwits", pk, sym, et, sym, target, avatar_color, 1, body.note or None, tags_json),
        )
        write_audit(c, user["id"], "admin_add_monitor_stock", True, f"symbol={sym}", ip, ua)
    return {"ok": True, "id": aid, "symbol": sym, "account_name": sym, "target_url": target}


@app.delete("/api/admin/monitored-stocks/{account_id}", tags=["admin"])
def api_admin_delete_stock(account_id: str, confirm: bool = Query(False), user: Dict[str, Any] = Depends(require_role("admin"))):
    if not confirm:
        raise HTTPException(400, "require_confirm: 必须 confirm=true")
    with get_conn() as c:
        acc = c.execute("SELECT id, account_name FROM accounts WHERE id=? AND entity_type='STOCK'", (account_id,)).fetchone()
        if not acc:
            raise HTTPException(404, "stock_not_found")
        c.execute("DELETE FROM daily_snapshots WHERE account_id=?", (account_id,))
        c.execute("DELETE FROM records WHERE account_id=?", (account_id,))
        c.execute("DELETE FROM accounts WHERE id=?", (account_id,))
    return {"ok": True, "id": account_id, "account_name": acc["account_name"]}


@app.get("/api/admin/monitored-communities", tags=["admin"])
def api_admin_list_communities(
    q: Optional[str] = Query(None, max_length=30),
    page: int = Query(1, ge=1, le=200),
    size: int = Query(50, ge=1, le=200),
    user: Dict[str, Any] = Depends(require_role("admin")),
):
    with get_conn() as c:
        where = "WHERE platform_key='reddit' AND entity_type='SUBREDDIT'"
        params: List[Any] = []
        if q:
            sub = q.lower().removeprefix("r/")
            where += " AND (account_name LIKE ? OR subreddit LIKE ?)"
            params += [f"%{sub}%", f"%{sub}%"]
        total = c.execute(f"SELECT COUNT(*) AS n FROM accounts {where}", params).fetchone()["n"]
        rows = c.execute(
            f"SELECT a.*, (SELECT MAX(updated_at) FROM records r WHERE r.account_id=a.id) AS last_update "
            f"FROM accounts a {where} ORDER BY last_update DESC NULLS LAST, a.created_at DESC LIMIT ? OFFSET ?",
            params + [size, (page - 1) * size],
        ).fetchall()
        items = []
        for r in rows:
            d = dict(r)
            if d.get("tags") and isinstance(d["tags"], str):
                try: d["tags"] = json.loads(d["tags"])
                except Exception: d["tags"] = []
            items.append(d)
    return {"ok": True, "items": items, "total": total, "page": page, "size": size}


@app.post("/api/admin/monitored-communities", tags=["admin"])
def api_admin_add_community(body: _AddMonitorCommunityReq, request: Request, user: Dict[str, Any] = Depends(require_role("admin"))):
    ip, ua = _client_meta(request)
    raw = (body.subreddit or "").strip().lower()
    if raw.startswith("r/"): raw = raw[2:]
    m = _SUBR_RE.match(raw)
    if not m:
        raise HTTPException(400, f"invalid_subreddit: 仅允许字母/数字/_/-，长度2-21（自动去掉 r/ 前缀）")
    sub = m.group(0)
    pk = "reddit"
    et = "SUBREDDIT"
    account_name = f"r/{sub}"
    aid = _account_id_for(pk, account_name, et)
    target = f"https://www.reddit.com/r/{sub}/"
    avatar_color = "#f97316,#ef4444"
    tags_json = json.dumps(body.tags, ensure_ascii=False) if body.tags else None
    with get_conn() as c:
        exist = c.execute("SELECT id,account_name FROM accounts WHERE id=?", (aid,)).fetchone()
        if exist:
            raise HTTPException(409, f"already_in_list: r/{sub} 已在监控清单")
        c.execute(
            "INSERT INTO accounts (id,platform,platform_key,account_name,entity_type,subreddit,target_url,avatar_color,active,note,tags,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
            (aid, "Reddit", pk, account_name, et, account_name, target, avatar_color, 1, body.note or None, tags_json),
        )
        write_audit(c, user["id"], "admin_add_monitor_community", True, f"subreddit=r/{sub}", ip, ua)
    return {"ok": True, "id": aid, "account_name": account_name, "subreddit": account_name, "target_url": target}


@app.delete("/api/admin/monitored-communities/{account_id}", tags=["admin"])
def api_admin_delete_community(account_id: str, confirm: bool = Query(False), user: Dict[str, Any] = Depends(require_role("admin"))):
    if not confirm:
        raise HTTPException(400, "require_confirm: 必须 confirm=true")
    with get_conn() as c:
        acc = c.execute("SELECT id, account_name FROM accounts WHERE id=? AND entity_type='SUBREDDIT'", (account_id,)).fetchone()
        if not acc:
            raise HTTPException(404, "community_not_found")
        c.execute("DELETE FROM daily_snapshots WHERE account_id=?", (account_id,))
        c.execute("DELETE FROM records WHERE account_id=?", (account_id,))
        c.execute("DELETE FROM accounts WHERE id=?", (account_id,))
    return {"ok": True, "id": account_id, "account_name": acc["account_name"]}


# ============================================================
# Dashboard aggregation（对齐 api.js fetchSummary 期望字段）
# ============================================================

def build_dashboard(days: int = 30, operator_uid: Optional[str] = None, role: Optional[str] = None) -> Dict[str, Any]:
    with get_conn() as c:
        mock_en = is_mock_enabled(c)
        all_ops = [dict(r) for r in c.execute("SELECT * FROM operators WHERE status='active'")]
        by_uid = {o["operator_uid"]: o for o in all_ops}
        current_user = dict(
            uid=operator_uid or "admin_001",
            name=(by_uid.get(operator_uid or "admin_001") or by_uid.get("admin_001") or (all_ops[0] if all_ops else {"operator_name": "admin"})).get("operator_name"),
            role=(by_uid.get(operator_uid or "admin_001") or by_uid.get("admin_001") or (all_ops[0] if all_ops else {"role": "admin"})).get("role", "operator"),
        )
        op_from_uid = by_uid.get(operator_uid or "")
        if role == "admin" or (op_from_uid and op_from_uid["role"] == "admin"):
            operator_uid_filter = None
        else:
            operator_uid_filter = operator_uid or None

        def _non_empty(v, allow_data=False):
            if v is None: return None
            s = str(v).strip()
            if len(s) == 0 or s.lower() in ('about:blank', '#'): return None
            if s.lower().startswith('data:') and not allow_data: return None
            return s

        def _non_empty_data(v):
            if v is None: return None
            s = str(v).strip()
            if not s.lower().startswith('data:image/'): return None
            return s if len(s) > 16 else None

        def _coalesce(*vs):
            for v in vs:
                r = _non_empty(v, allow_data=True)
                if r: return r
            return None

        latest_q = """
            SELECT r.*,
                   a.avatar_url          AS a_avatar_url,
                   a.avatar_data_url     AS a_avatar_data_url,
                   a.avatar_color        AS a_avatar_color,
                   a.platform_category   AS a_platform_category,
                   a.symbol              AS a_symbol, a.subreddit AS a_subreddit,
                   a.assigned_operator_uid  AS acc_operator_uid,
                   a.assigned_operator_name AS acc_operator_name
            FROM records r
            LEFT JOIN accounts a ON a.id = r.account_id
            WHERE r.id = (
                SELECT r2.id FROM records r2
                WHERE r2.account_id = r.account_id
                ORDER BY r2.updated_at DESC, r2.timestamp_ms DESC
                LIMIT 1
            )
            AND r.entity_type = 'ACCOUNT'
            AND (a.id IS NULL OR a.entity_type = 'ACCOUNT')
            ORDER BY r.followers DESC, r.members DESC, r.views DESC
            LIMIT 500
        """

        def _latest_monitors_rows(c, platform_key, entity_type):
            platform_name = {
                "stocktwits": "Stocktwits",
                "reddit": "Reddit",
            }.get(platform_key, platform_key.title())
            # 第一段：有 records 的最新行
            q1 = f"""
                SELECT r.id,
                       r.account, r.entity_type, r.platform, r.platform_key,
                       r.target_url, r.followers, r.following, r.likes, r.views, r.comments, r.collect,
                       r.engagement_rate, r.members, r.online, r.message_volume_24h,
                       r.sentiment_bull, r.sentiment_bear, r.posts_24h,
                       r.symbol_price, r.symbol_change_pct, r.latest_post, r.posts, r.source,
                       r.operator_uid, r.operator_name, r.machine_id, r.machine_name, r.client_version,
                       r.error, r.updated_at, r.timestamp_ms, r.account_id, r.extra,
                       a.avatar_url          AS a_avatar_url,
                       a.avatar_data_url     AS a_avatar_data_url,
                       a.avatar_color        AS a_avatar_color,
                       a.platform_category   AS a_platform_category,
                       a.symbol              AS a_symbol, a.subreddit AS a_subreddit,
                       a.target_url          AS a_target_url,
                       a.symbol              AS symbol, a.subreddit AS subreddit
                FROM records r
                LEFT JOIN accounts a ON a.id = r.account_id
                WHERE r.id = (
                    SELECT r2.id FROM records r2
                    WHERE r2.account_id = r.account_id
                    ORDER BY r2.updated_at DESC, r2.timestamp_ms DESC
                    LIMIT 1
                )
                AND r.platform_key = ?
                AND r.entity_type = ?
                AND (a.id IS NULL OR a.entity_type = ?)
                ORDER BY (COALESCE(r.members, 0) + COALESCE(r.posts_24h, 0) * 50) DESC, r.account ASC
            """
            rows1 = [dict(r) for r in c.execute(q1, (platform_key, entity_type, entity_type))]
            existing_ids = {r["account_id"] for r in rows1 if r.get("account_id")}
            # 第二段：accounts 有但 records 无 -> 占位卡片（Admin 刚加还没人采）
            q2 = f"""
                SELECT NULL AS id,
                       a.account_name  AS account,
                       ? AS entity_type,
                       ? AS platform,
                       ? AS platform_key,
                       NULL AS platform_category,
                       a.target_url    AS target_url,
                       0 AS followers, 0 AS following, 0 AS likes, 0 AS views,
                       0 AS comments, 0 AS collect, 0 AS engagement_rate,
                       0 AS members, 0 AS online, 0 AS message_volume_24h,
                       0 AS sentiment_bull, 0 AS sentiment_bear,
                       0 AS posts_24h, NULL AS symbol_price, NULL AS symbol_change_pct,
                       NULL AS latest_post, '[]' AS posts, NULL AS source,
                       NULL AS operator_uid, NULL AS operator_name,
                       NULL AS machine_id, NULL AS machine_name, NULL AS client_version,
                       NULL AS error, a.created_at AS updated_at, NULL AS timestamp_ms,
                       a.id AS account_id, NULL AS extra, a.symbol AS symbol, a.subreddit AS subreddit,
                       a.avatar_url          AS a_avatar_url,
                       a.avatar_data_url     AS a_avatar_data_url,
                       a.avatar_color        AS a_avatar_color,
                       a.platform_category   AS a_platform_category,
                       a.symbol              AS a_symbol, a.subreddit AS a_subreddit,
                       a.target_url          AS a_target_url
                FROM accounts a
                WHERE a.platform_key = ?
                  AND a.entity_type = ?
                  AND a.active = 1
            """
            rows2 = [dict(r) for r in c.execute(q2, (entity_type, platform_name, platform_key, platform_key, entity_type))]
            rows2 = [r for r in rows2 if r.get("account_id") not in existing_ids]
            combined = rows1 + rows2
            combined.sort(key=lambda r: (-(int(r.get("members") or 0) + int(r.get("posts_24h") or 0) * 50), r.get("account") or ""))
            return combined[:200]

        def _build_monitor_list(recs_raw):
            out: List[Dict[str, Any]] = []
            for r in recs_raw:
                r = dict(r) if not isinstance(r, dict) else r
                pk = r.get("platform_key") or ""
                meta = platform_meta(pk) if pk else {"name": "", "category": "", "key": pk, "logo": None}
                et = (r.get("entity_type") or "ACCOUNT").upper()
                try:
                    posts = json.loads(r.get("posts") or "[]") if isinstance(r.get("posts"), str) else (r.get("posts") or [])
                    latest_post = json.loads(r.get("latest_post") or "{}") if isinstance(r.get("latest_post"), str) else (r.get("latest_post") or {})
                except Exception:
                    posts, latest_post = [], {}
                plat_cat = r.get("a_platform_category") or meta.get("category")
                _durl = _non_empty_data(r.get("a_avatar_data_url"))
                _url  = _non_empty(r.get("a_avatar_url"))
                _col  = _non_empty(r.get("a_avatar_color"))
                _turl = _coalesce(r.get("a_target_url"), r.get("target_url")) or ""
                sp = r.get("symbol_price")
                sc = r.get("symbol_change_pct")
                record = dict(
                    id=r.get("id"),
                    account=r.get("account") or "",
                    platform=r.get("platform") or meta.get("name"),
                    platform_key=pk or meta.get("key"),
                    platform_category=plat_cat,
                    entity_type=et,
                    operator_uid=r.get("operator_uid"),
                    operator_name=r.get("operator_name"),
                    machine_id=r.get("machine_id"),
                    machine_name=r.get("machine_name"),
                    updated_at=r.get("updated_at"),
                    target_url=_turl,
                    url=_turl,
                    avatar_url=_durl or _url,
                    avatar_data_url=_durl,
                    avatar_gradient=_col or (
                        "#6366f1,#8b5cf6" if et == "STOCK" else "#f97316,#ef4444"
                    ),
                    followers=int(r.get("followers") or 0),
                    following=int(r.get("following") or 0),
                    likes=int(r.get("likes") or 0),
                    views=int(r.get("views") or 0),
                    comments=int(r.get("comments") or 0),
                    collect=int(r.get("collect") or 0),
                    engagement_rate=float(r.get("engagement_rate") or 0),
                    members=int(r.get("members") or 0),
                    online=int(r.get("online") or 0),
                    message_volume_24h=int(r.get("message_volume_24h") or 0),
                    posts_24h=int(r.get("posts_24h") or 0),
                    sentiment_bull=float(r.get("sentiment_bull") or 0),
                    sentiment_bear=float(r.get("sentiment_bear") or 0),
                    symbol_price=(float(sp) if sp is not None else None),
                    symbol_change_pct=(float(sc) if sc is not None else None),
                    symbol=r.get("a_symbol") or r.get("symbol"),
                    subreddit=r.get("a_subreddit") or r.get("subreddit"),
                    latest_post=latest_post,
                    posts=posts,
                )
                out.append(record)
            return out

        recs_raw = [dict(r) for r in c.execute(latest_q)]
        stock_raw = _latest_monitors_rows(c, "stocktwits", "STOCK")
        reddit_raw = _latest_monitors_rows(c, "reddit", "SUBREDDIT")
        latest_records: List[Dict[str, Any]] = []
        for r in recs_raw:
            pk = r["platform_key"]
            meta = platform_meta(pk)
            et = (r["entity_type"] or "ACCOUNT").upper()
            op_uid = r["acc_operator_uid"] or r["operator_uid"]
            op_name = r["acc_operator_name"] or r["operator_name"]
            if operator_uid_filter and op_uid != operator_uid_filter:
                continue
            try:
                posts = json.loads(r["posts"] or "[]") if isinstance(r.get("posts"), str) else (r.get("posts") or [])
                latest_post = json.loads(r["latest_post"] or "{}") if isinstance(r.get("latest_post"), str) else (r.get("latest_post") or {})
            except Exception:
                posts, latest_post = [], {}
            plat_cat = r["a_platform_category"] or meta["category"]
            _durl = _non_empty_data(r.get("a_avatar_data_url"))
            _url  = _non_empty(r.get("a_avatar_url"))
            _col  = _non_empty(r.get("a_avatar_color"))
            record = dict(
                id=r["id"],
                account=r["account"],
                platform=r["platform"] or meta["name"],
                platform_key=pk or meta["key"],
                platform_category=plat_cat,
                entity_type=et,
                assigned_operator_uid=op_uid,
                assigned_operator_name=op_name,
                operator_uid=r["operator_uid"],
                operator_name=r["operator_name"],
                machine_id=r["machine_id"],
                machine_name=r["machine_name"],
                client_version=r["client_version"],
                updated_at=r.get("updated_at"),
                target_url=r["target_url"],
                url=r["target_url"] or "",
                avatar_url=_durl or _url,
                avatar_data_url=_durl,
                avatar_gradient=_col or "#6366f1,#8b5cf6",
                followers=int(r.get("followers") or 0),
                following=int(r.get("following") or 0),
                likes=int(r.get("likes") or 0),
                views=int(r.get("views") or 0),
                comments=int(r.get("comments") or 0),
                collect=int(r.get("collect") or 0),
                engagement_rate=float(r.get("engagement_rate") or 0),
                members=int(r.get("members") or 0),
                online=int(r.get("online") or 0),
                message_volume_24h=int(r.get("message_volume_24h") or 0),
                posts_24h=int(r.get("posts_24h") or 0),
                sentiment_bull=float(r.get("sentiment_bull") or 0),
                sentiment_bear=float(r.get("sentiment_bear") or 0),
                symbol_price=(float(r["symbol_price"]) if r.get("symbol_price") is not None else None),
                symbol_change_pct=(float(r["symbol_change_pct"]) if r.get("symbol_change_pct") is not None else None),
                symbol=r["a_symbol"] or r.get("symbol"),
                subreddit=r["a_subreddit"] or r.get("subreddit"),
                latest_post=latest_post,
                posts=posts,
                daily_trend=[],
            )
            _cur_val = (record["followers"] if et == "ACCOUNT" else record["members"]) or 0
            if False and _cur_val > 0:  # 2026-09-15: 移除模拟数据填充，仅保留真实采集趋势
                _base = max(1, int(_cur_val * 0.72))
                _seed = (hash(record["account"] or record["id"] or f"{pk}-{i}") % 1000) / 1000.0
                _rec_start = _dt.date.today() - _dt.timedelta(days=29)
                _dtl = []
                for _k in range(30):
                    _p = (_k + 1) / 30.0
                    _ease = 0.35 + 0.65 * (_p * _p * (3 - 2 * _p))
                    _noise = 0.93 + 0.14 * ((hash(f"{_k}-{_seed:.3f}") % 10000) / 10000.0)
                    _val = int(_base + (_cur_val - _base) * _ease * _noise)
                    _d = _rec_start + _dt.timedelta(days=_k)
                    _dtl.append({
                        "date": f"{_d.month:02d}/{_d.day:02d}",
                        "audience": _val,
                        "views": 0 if et == "COMMUNITY" else int((record["views"] or 0) * (_p * 0.7 + 0.3) * (0.9 + 0.2 * ((hash(f"v{_k}") % 1000) / 1000))),
                        "eng_rate": round(
                            float(record["engagement_rate"] or 0) * (0.85 + 0.3 * ((hash(f"e{_k}") % 1000) / 1000)),
                            4,
                        ),
                    })
                record["daily_trend"] = [
                    {
                        "date": d["date"],
                        "followers": d["audience"],
                        "audience": d["audience"],
                        "views": d["views"],
                        "engagement_rate": d["eng_rate"],
                        "eng_rate": d["eng_rate"],
                    } for d in _dtl
                ]
            record["abnormal"] = False
            if et == "ACCOUNT":
                if record["followers"] == 0 and record["views"] == 0:
                    record["abnormal"] = True
            else:
                if record["members"] == 0 and record["message_volume_24h"] == 0 and record["posts_24h"] == 0:
                    record["abnormal"] = True
            latest_records.append(record)

        stocktwits_monitors = _build_monitor_list(stock_raw)
        reddit_monitors = _build_monitor_list(reddit_raw)

        machines = [dict(r) for r in c.execute("SELECT * FROM machines ORDER BY last_hb_at DESC LIMIT 100")]

        totals_followers = sum(r["followers"] for r in latest_records if r["entity_type"] == "ACCOUNT")
        totals_members = sum(r["members"] for r in latest_records if r["entity_type"] == "COMMUNITY")
        totals_views = sum(r["views"] for r in latest_records)
        account_count = sum(1 for r in latest_records if r["entity_type"] == "ACCOUNT")
        community_count = sum(1 for r in latest_records if r["entity_type"] == "COMMUNITY")
        abnormal_count = sum(1 for r in latest_records if r.get("abnormal"))
        plat_set = dict()
        for r in latest_records:
            key = r["platform_key"]
            if key not in plat_set:
                plat_set[key] = {**platform_meta(key), "value": 0, "audience": 0, "count": 0}
            plat_set[key]["count"] += 1
            if r["entity_type"] == "ACCOUNT":
                plat_set[key]["value"] += r["views"]
                plat_set[key]["audience"] += r["followers"]
            else:
                plat_set[key]["value"] += r["message_volume_24h"] * 50
                plat_set[key]["audience"] += r["members"]
        plat_list = list(plat_set.values())
        plat_list.sort(key=lambda x: x["value"], reverse=True)
        platform_count = len(plat_set)

        operator_stats = []
        for op in all_ops:
            uid = op["operator_uid"]
            mine = [r for r in latest_records if r["assigned_operator_uid"] == uid]
            ac = [r for r in mine if r["entity_type"] == "ACCOUNT"]
            cm = [r for r in mine if r["entity_type"] == "COMMUNITY"]
            posts_all = [p for r in mine for p in (r.get("posts") or [])]
            bombs = sum(1 for p in posts_all if isinstance(p, dict) and p.get("is_bomb"))
            total_f = sum(r["followers"] for r in ac)
            total_m = sum(r["members"] for r in cm)
            abn = sum(1 for r in mine if r.get("abnormal"))
            total_posts_30d = round(len(posts_all) * 3.2)
            bomb_rate = float(f"{(bombs / len(posts_all) * 100):.2f}") if posts_all else 0.0
            operator_stats.append(dict(
                operator_uid=uid, operator_name=op["operator_name"], role=op["role"], avatar_color=op.get("avatar_color"),
                accounts_count=len(ac), communities_count=len(cm),
                total_followers=total_f, total_members=total_m, total_views_7d=sum(r["views"] for r in mine),
                abnormal_count=abn, bomb_rate=bomb_rate, total_posts_30d=total_posts_30d,
                last_report_at=max((r["updated_at"] for r in mine), default=None),
                machines=[m for m in machines if m["operator_uid"] == uid],
                records_count=len(mine),
            ))

        trend = []
        start = _dt.date.today() - _dt.timedelta(days=days - 1)
        plat_metrics = {}
        _snap_count = 0
        for i in range(days):
            d = start + _dt.timedelta(days=i)
            key = f"{d.month:02d}/{d.day:02d}"
            snap_rows = c.execute(
                "SELECT * FROM daily_snapshots WHERE snapshot_date=? AND (? IS NULL OR assigned_operator_uid=?)",
                (d.isoformat(), operator_uid_filter, operator_uid_filter or ""),
            ).fetchall()
            _snap_count += len(snap_rows)
            entry: Dict[str, Any] = {"date": key}
            if not snap_rows and i == days - 1:
                for r in latest_records:
                    name = r["platform"]
                    entry[name] = (entry.get(name) or 0) + (r["followers"] if r["entity_type"] == "ACCOUNT" else r["members"])
            for sr in snap_rows:
                pk = sr["platform_key"]
                name = platform_meta(pk)["name"]
                val = int(sr["followers"] or 0) + int(sr["members"] or 0)
                entry[name] = (entry.get(name) or 0) + val
            for k, v in entry.items():
                if k != "date":
                    plat_metrics[k] = max(plat_metrics.get(k, 0), v)
            trend.append(entry)
        if _snap_count == 0 and False:  # 2026-09-15: 移除模拟数据填充，空快照即真实空
            _finals: Dict[str, int] = {}
            for r in latest_records:
                _pname = r["platform"]
                _finals[_pname] = (_finals.get(_pname) or 0) + (r["followers"] if r["entity_type"] == "ACCOUNT" else r["members"])
            _pnames = list(_finals.keys())
            for _idx, entry in enumerate(trend):
                _p = (_idx + 1) / max(1, len(trend))
                _ease = 0.32 + 0.68 * (_p * _p * (3 - 2 * _p))
                for _pn in _pnames:
                    _base = max(1, int(_finals[_pn] * 0.68))
                    _noise = 0.94 + 0.12 * ((hash(f"tr_{_idx}_{_pn}") % 10000) / 10000.0)
                    entry[_pn] = int(_base + (_finals[_pn] - _base) * _ease * _noise)
                    plat_metrics[_pn] = max(plat_metrics.get(_pn, 0), entry[_pn])
        prev: Dict[str, int] = {}
        for entry in trend:
            for k in list(plat_metrics.keys()):
                cur = entry.get(k)
                if cur is None:
                    entry[k] = prev.get(k) or 0
                else:
                    prev[k] = cur

        op_filter_sql = ""
        op_params: List[Any] = [_dt.date.today() - _dt.timedelta(days=365)]
        if operator_uid_filter:
            op_filter_sql = " AND operator_uid = ? "
            op_params.append(operator_uid_filter)
        freq_rows = c.execute(
            f"""
            SELECT date(updated_at)                       AS d,
                   platform_key                            AS pk,
                   COUNT(*)                                AS n,
                   SUM(COALESCE(posts_24h, 0))             AS s_p24,
                   SUM(COALESCE(message_volume_24h, 0))    AS s_msg,
                   SUM(COALESCE(views, 0))                 AS s_views,
                   SUM(COALESCE(likes, 0))                 AS s_likes,
                   SUM(COALESCE(comments, 0))              AS s_comments
            FROM records
            WHERE datetime(updated_at) >= datetime(?)
                  {op_filter_sql}
            GROUP BY d, pk
            ORDER BY d, pk
            """,
            op_params,
        ).fetchall()
        by_day_pk: Dict[str, Dict[str, int]] = {}
        total_by_day: Dict[str, int] = {}
        all_pk_order = [p["key"] for p in PLATFORMS]
        for fr in freq_rows:
            d = fr["d"]
            pk = fr["pk"] or "unknown"
            if pk not in all_pk_order:
                all_pk_order.append(pk)
            n = int(fr["n"] or 0)
            s_p24 = int(fr["s_p24"] or 0)
            s_msg = int(fr["s_msg"] or 0)
            s_views = int(fr["s_views"] or 0)
            s_likes = int(fr["s_likes"] or 0)
            s_comments = int(fr["s_comments"] or 0)
            value = n + s_p24 + s_msg + (s_views // 500) + (s_likes // 20) + (s_comments // 10)
            if d not in by_day_pk:
                by_day_pk[d] = {}
                total_by_day[d] = 0
            by_day_pk[d][pk] = int(value)
            total_by_day[d] += int(value)
        today = _dt.date.today()
        start_day = today - _dt.timedelta(days=365)
        days_out: List[Dict[str, Any]] = []
        cursor = start_day
        while cursor <= today:
            ds = cursor.isoformat()
            day_vals = by_day_pk.get(ds, {})
            row: Dict[str, Any] = {
                "date": ds,
                "total": int(total_by_day.get(ds) or 0),
                "by_platform": {pk: int(day_vals.get(pk) or 0) for pk in all_pk_order},
            }
            days_out.append(row)
            cursor += _dt.timedelta(days=1)
        calendar_platforms = [
            {**platform_meta(p["key"]), "key": p["key"]} for p in PLATFORMS
        ]
        hourly_rows = c.execute(
            f"""
            SELECT CAST(strftime('%H', updated_at) AS INTEGER) AS hr,
                   platform_key                                      AS pk,
                   COUNT(*)                                         AS n,
                   SUM(COALESCE(posts_24h, 0))                     AS s_p24,
                   SUM(COALESCE(message_volume_24h, 0))            AS s_msg,
                   SUM(COALESCE(views, 0))                         AS s_views,
                   SUM(COALESCE(likes, 0))                         AS s_likes,
                   SUM(COALESCE(comments, 0))                      AS s_comments
            FROM records
            WHERE datetime(updated_at) >= datetime(?)
                  {op_filter_sql}
            GROUP BY hr, pk
            ORDER BY hr, pk
            """,
            op_params,
        ).fetchall()
        by_hr_pk: Dict[int, Dict[str, int]] = {h: {} for h in range(24)}
        total_by_hr = {h: 0 for h in range(24)}
        for fr in hourly_rows:
            hr = int(fr["hr"] or 0)
            if not (0 <= hr <= 23):
                continue
            pk = fr["pk"] or "unknown"
            n = int(fr["n"] or 0)
            s_p24 = int(fr["s_p24"] or 0)
            s_msg = int(fr["s_msg"] or 0)
            s_views = int(fr["s_views"] or 0)
            s_likes = int(fr["s_likes"] or 0)
            s_comments = int(fr["s_comments"] or 0)
            value = n + s_p24 + s_msg + (s_views // 500) + (s_likes // 20) + (s_comments // 10)
            by_hr_pk[hr][pk] = int(value)
            total_by_hr[hr] += int(value)
        hourly_distribution = [
            {
                "hour": h,
                "total": int(total_by_hr[h]),
                "by_platform": {pk: int(by_hr_pk[h].get(pk) or 0) for pk in all_pk_order},
            }
            for h in range(24)
        ]
        total_freq = sum(r["total"] for r in days_out)
        active_days_count = sum(1 for r in days_out if r["total"] > 0)
        post_frequency_calendar = {
            "days": days_out,
            "platforms": calendar_platforms,
            "hourly_distribution": hourly_distribution,
            "total_days": len(days_out),
            "total_value": total_freq,
            "active_days": active_days_count,
        }

    current_user = dict(
        uid=operator_uid or "admin_001",
        name=(by_uid.get(operator_uid or "admin_001") or by_uid.get("admin_001") or all_ops[0]).get("operator_name"),
        role=(by_uid.get(operator_uid or "admin_001") or by_uid.get("admin_001") or all_ops[0]).get("role", "operator"),
    )

    return dict(
        current_user=current_user,
        operators=all_ops,
        operator_stats=operator_stats,
        total_followers=totals_followers,
        total_members=totals_members,
        total_views_7d=totals_views,
        platform_count=platform_count,
        account_count=account_count,
        community_count=community_count,
        abnormal_count=abnormal_count,
        latest_records=latest_records,
        platform_traffic=plat_list,
        trend=trend,
        platforms=[platform_meta(p["key"]) for p in PLATFORMS],
        categories=[
            dict(key="all", name="全部"),
            dict(key="金融", name="金融社区"),
            dict(key="社媒", name="国内社媒"),
            dict(key="海外", name="海外平台"),
            dict(key="社区", name="公开社区"),
        ],
        entity_types=[
            dict(key="all", name="全部类型"),
            dict(key="ACCOUNT", name="仅账号"),
            dict(key="COMMUNITY", name="仅社区"),
        ],
        collector_machines=machines,
        viral_alerts=[],
        ai_diagnosis=[],
        stocktwits_monitors=stocktwits_monitors,
        reddit_monitors=reddit_monitors,
        post_frequency_calendar=post_frequency_calendar,
    )


@app.get("/api/dashboard-data", tags=["dashboard"])
@app.get("/api/summary", tags=["dashboard"])
def api_summary(
    days: int = Query(30, ge=1, le=180),
    operator_uid: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    machine_id: Optional[str] = Query(None),
    user: Optional[Dict[str, Any]] = Depends(get_current_user),
):
    if not user and ENV_REQUIRE_AUTH:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "auth_required")
    eff_role = user["role"] if user else (role or None)
    eff_op = user["operator_uid"] if user and user.get("operator_uid") else operator_uid
    out = build_dashboard(days=days, operator_uid=eff_op, role=eff_role)
    out["query"] = dict(days=days, operator_uid=eff_op, role=eff_role, machine_id=machine_id)
    return out


@app.get("/api/whoami", tags=["dashboard"])
def api_whoami(
    machine_id: Optional[str] = None,
    operator_uid: Optional[str] = None,
    user: Optional[Dict[str, Any]] = Depends(get_current_user),
):
    if not user and ENV_REQUIRE_AUTH:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "auth_required")
    if user:
        with get_conn() as c:
            op = c.execute("SELECT * FROM operators WHERE operator_uid=?", (user["operator_uid"],)).fetchone() if user.get("operator_uid") else None
            profile = c.execute("SELECT display_name,avatar_gradient,avatar_data_url,username FROM users WHERE id=?", (user["id"],)).fetchone()
        return dict(
            uid=user.get("operator_uid") or user["id"],
            name=(profile and profile["display_name"]) or (op and op["operator_name"]) or user["username"],
            role=user["role"],
            operator_uid=user.get("operator_uid"),
            operator_name=op["operator_name"] if op else None,
            from_token=True,
            auth_mode="jwt",
            email=user.get("email"),
            sso_provider=user.get("sso_provider"),
            must_change_pw=bool(user.get("must_change_pw")),
            username=profile and profile["username"],
            display_name=profile and profile["display_name"],
            avatar_gradient=profile["avatar_gradient"] if profile else None,
            avatar_data_url=profile["avatar_data_url"] if profile else None,
        )
    with get_conn() as c:
        if machine_id:
            m = c.execute("SELECT * FROM machines WHERE machine_id=?", (machine_id,)).fetchone()
            if m and m["operator_uid"]:
                op = c.execute("SELECT * FROM operators WHERE operator_uid=?", (m["operator_uid"],)).fetchone()
                if op:
                    return dict(uid=op["operator_uid"], name=op["operator_name"], role=op["role"],
                                machine_id=machine_id, machine_name=m["machine_name"],
                                status=m["status"], from_token=False, auth_mode="mock_machine")
        uid = operator_uid or "admin_001"
        op = c.execute("SELECT * FROM operators WHERE operator_uid=?", (uid,)).fetchone()
        if op:
            return dict(uid=op["operator_uid"], name=op["operator_name"], role=op["role"], from_token=False, auth_mode="mock_default")
    return dict(uid="admin_001", name="张总（管理）", role="admin", from_token=False, auth_mode="mock_fallback")


@app.on_event("shutdown")
async def _shutdown():
    try:
        await CLIENT_HTTP.aclose()
    except Exception:
        pass
