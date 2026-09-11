-- SQLite 版 Schema v2（对应 supabase_schema.sql，去掉 UUID/JSONB 等 PG 特性）

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operators (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_uid    TEXT UNIQUE NOT NULL,
    operator_name   TEXT NOT NULL,
    email           TEXT,
    role            TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin','operator','viewer')),
    avatar_color    TEXT DEFAULT '#6366f1,#8b5cf6',
    status          TEXT DEFAULT 'active',
    last_login_at   DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operators_role ON operators(role);
CREATE INDEX IF NOT EXISTS idx_operators_uid  ON operators(operator_uid);

CREATE TABLE IF NOT EXISTS accounts (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name           TEXT NOT NULL,
    entity_type            TEXT NOT NULL DEFAULT 'ACCOUNT' CHECK (entity_type IN ('ACCOUNT','COMMUNITY')),
    platform               TEXT NOT NULL,
    platform_key           TEXT NOT NULL,
    platform_category      TEXT DEFAULT '社媒',
    profile_id             TEXT,
    target_url             TEXT NOT NULL,
    symbol                 TEXT,
    subreddit              TEXT,
    avatar_color           TEXT DEFAULT '#6366f1,#8b5cf6',
    assigned_operator_id   INTEGER REFERENCES operators(id) ON DELETE SET NULL,
    assigned_operator_uid  TEXT,
    assigned_operator_name TEXT,
    active                 INTEGER DEFAULT 1,
    tags                   TEXT DEFAULT '[]',
    note                   TEXT,
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (platform_key, account_name, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_accounts_entity   ON accounts(entity_type);
CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform_key);
CREATE INDEX IF NOT EXISTS idx_accounts_operator ON accounts(assigned_operator_id);

CREATE TABLE IF NOT EXISTS records (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id          INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    entity_type         TEXT NOT NULL DEFAULT 'ACCOUNT',
    account             TEXT NOT NULL,
    platform            TEXT NOT NULL,
    platform_key        TEXT NOT NULL,
    profile_id          TEXT,
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

    latest_post         TEXT DEFAULT '{}',
    extra               TEXT DEFAULT '{}',

    source              TEXT DEFAULT 'runner',
    operator_uid        TEXT,
    operator_name       TEXT,
    machine_id          TEXT,
    machine_name        TEXT,
    client_version      TEXT,

    error               TEXT,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    timestamp_ms        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_entity          ON records(entity_type);
CREATE INDEX IF NOT EXISTS idx_records_operator        ON records(operator_uid);
CREATE INDEX IF NOT EXISTS idx_records_account_platform ON records(platform_key, account);
CREATE INDEX IF NOT EXISTS idx_records_updated         ON records(updated_at DESC);

CREATE TABLE IF NOT EXISTS daily_snapshots (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date       TEXT NOT NULL,
    account_id          INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    entity_type         TEXT NOT NULL,
    platform_key        TEXT NOT NULL,
    assigned_operator_id INTEGER,

    followers           INTEGER DEFAULT 0,
    views               INTEGER DEFAULT 0,
    likes               INTEGER DEFAULT 0,
    engagement_rate     REAL DEFAULT 0,
    members             INTEGER DEFAULT 0,
    message_volume_24h  INTEGER DEFAULT 0,
    sentiment_bull      REAL DEFAULT 0,

    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (snapshot_date, account_id)
);

CREATE VIEW IF NOT EXISTS vw_latest_records AS
SELECT r.*,
       a.platform_category,
       a.avatar_color,
       a.assigned_operator_id   AS account_operator_id,
       a.assigned_operator_uid  AS account_operator_uid,
       a.assigned_operator_name AS account_operator_name,
       CASE
           WHEN (r.entity_type = 'ACCOUNT'   AND r.followers = 0 AND r.views = 0) THEN 1
           WHEN (r.entity_type = 'COMMUNITY' AND r.members   = 0 AND r.message_volume_24h = 0 AND r.posts_24h = 0) THEN 1
           WHEN r.error IS NOT NULL THEN 1
           ELSE 0
       END AS abnormal
FROM records r
LEFT JOIN accounts a ON a.id = r.account_id
WHERE r.id IN (
    SELECT MAX(id) FROM records GROUP BY platform_key, entity_type, account
);

CREATE VIEW IF NOT EXISTS vw_operator_performance AS
SELECT
    o.id                AS operator_id,
    o.operator_uid,
    o.operator_name,
    o.role,
    o.avatar_color,
    (SELECT COUNT(*) FROM accounts a WHERE a.assigned_operator_id = o.id) AS accounts_count,
    (SELECT COUNT(*) FROM accounts a WHERE a.assigned_operator_id = o.id AND a.entity_type = 'ACCOUNT') AS account_count,
    (SELECT COUNT(*) FROM accounts a WHERE a.assigned_operator_id = o.id AND a.entity_type = 'COMMUNITY') AS community_count,
    COALESCE((SELECT SUM(r.followers)           FROM records r WHERE r.account_id IN (SELECT id FROM accounts WHERE assigned_operator_id = o.id) AND r.id IN (SELECT MAX(id) FROM records GROUP BY account_id)),0) AS total_followers,
    COALESCE((SELECT SUM(r.views)               FROM records r WHERE r.account_id IN (SELECT id FROM accounts WHERE assigned_operator_id = o.id) AND r.id IN (SELECT MAX(id) FROM records GROUP BY account_id)),0) AS total_views,
    COALESCE((SELECT SUM(r.members)             FROM records r WHERE r.account_id IN (SELECT id FROM accounts WHERE assigned_operator_id = o.id) AND r.id IN (SELECT MAX(id) FROM records GROUP BY account_id)),0) AS total_members,
    COALESCE((SELECT SUM(r.message_volume_24h)  FROM records r WHERE r.account_id IN (SELECT id FROM accounts WHERE assigned_operator_id = o.id) AND r.id IN (SELECT MAX(id) FROM records GROUP BY account_id)),0) AS total_msg_24h,
    (SELECT MAX(r.updated_at) FROM records r WHERE r.operator_uid = o.operator_uid) AS last_report_at
FROM operators o
WHERE o.status = 'active';
