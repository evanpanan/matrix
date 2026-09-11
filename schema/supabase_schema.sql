-- ============================================================
-- Matrix 矩阵账号监测系统 v2 Schema · Supabase / PostgreSQL
-- 新增：RBAC 角色体系 · 运营归属 · entity_type(ACCOUNT/COMMUNITY) · 采集溯源
-- ============================================================

-- ---------- 用户 / 角色 ----------
CREATE TABLE IF NOT EXISTS operators (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_uid    TEXT UNIQUE NOT NULL,            -- 内部系统对接 user_id / JWT sub
    operator_name   TEXT NOT NULL,
    email           TEXT,
    role            TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'viewer')),
    avatar_color    TEXT DEFAULT '#6366f1,#8b5cf6',
    status          TEXT DEFAULT 'active',           -- active / disabled
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operators_role ON operators(role);
CREATE INDEX IF NOT EXISTS idx_operators_uid  ON operators(operator_uid);

-- ---------- 监测对象（账号 / 社区 / 股票） ----------
CREATE TABLE IF NOT EXISTS accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_name        TEXT NOT NULL,                -- 账号昵称 / 社区名 / $股票代码
    entity_type         TEXT NOT NULL DEFAULT 'ACCOUNT' CHECK (entity_type IN ('ACCOUNT','COMMUNITY')),
    platform            TEXT NOT NULL,                 -- 展示名
    platform_key        TEXT NOT NULL,                 -- futu / stocktwits / reddit ...
    platform_category   TEXT DEFAULT '社媒',            -- 金融 / 社媒 / 海外 / 股票 / 社区
    profile_id          TEXT,                          -- 指纹浏览器 profile id（仅 ACCOUNT 用）
    target_url          TEXT NOT NULL,
    symbol              TEXT,                          -- 股票代码，stocktwits 专用
    subreddit           TEXT,                          -- subreddit 名，reddit 专用
    avatar_color        TEXT DEFAULT '#6366f1,#8b5cf6',
    assigned_operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    assigned_operator_uid  TEXT,                       -- 冗余，方便 JSON 导出
    assigned_operator_name TEXT,                       -- 冗余，方便 JSON 导出
    active              BOOLEAN DEFAULT TRUE,
    tags                TEXT[] DEFAULT '{}',
    note                TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (platform_key, account_name, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_accounts_entity     ON accounts(entity_type);
CREATE INDEX IF NOT EXISTS idx_accounts_platform   ON accounts(platform_key);
CREATE INDEX IF NOT EXISTS idx_accounts_operator   ON accounts(assigned_operator_id);
CREATE INDEX IF NOT EXISTS idx_accounts_active     ON accounts(active);
COMMENT ON COLUMN accounts.entity_type IS 'ACCOUNT=个人账号, COMMUNITY=公开社区/股票页面';

-- ---------- 采集记录 ----------
CREATE TABLE IF NOT EXISTS records (
    id                  BIGSERIAL PRIMARY KEY,
    account_id          UUID REFERENCES accounts(id) ON DELETE SET NULL,
    entity_type         TEXT NOT NULL DEFAULT 'ACCOUNT',
    account             TEXT NOT NULL,
    platform            TEXT NOT NULL,
    platform_key        TEXT NOT NULL,
    profile_id          TEXT,
    target_url          TEXT,

    -- 账号类指标
    followers           BIGINT DEFAULT 0,
    following           BIGINT DEFAULT 0,
    likes               BIGINT DEFAULT 0,
    views               BIGINT DEFAULT 0,
    comments            BIGINT DEFAULT 0,
    collect             BIGINT DEFAULT 0,
    engagement_rate     NUMERIC(6,2) DEFAULT 0,

    -- 社区 / 股票 类指标
    members             BIGINT DEFAULT 0,              -- Reddit Members / Stocktwits Watchers
    online              BIGINT DEFAULT 0,              -- Reddit Online
    message_volume_24h  BIGINT DEFAULT 0,              -- 24h 发帖 / 讨论条数
    sentiment_bull      NUMERIC(5,2) DEFAULT 0,       -- 看涨 % (Stocktwits)
    sentiment_bear      NUMERIC(5,2) DEFAULT 0,       -- 看跌 % (Stocktwits)
    posts_24h           BIGINT DEFAULT 0,              -- 24h 帖文数 (Reddit)
    symbol_price        NUMERIC(12,4),                 -- 股票价格 (可选)
    symbol_change_pct   NUMERIC(8,4),                  -- 股票涨跌 %

    extra               JSONB DEFAULT '{}'::jsonb,
    latest_post         JSONB DEFAULT '{}'::jsonb,

    -- 分布式采集溯源
    source              TEXT DEFAULT 'runner',         -- runner / chrome_extension / api
    operator_uid        TEXT,                          -- 上报人 operator_uid
    operator_name       TEXT,                          -- 上报人（冗余）
    machine_id          TEXT,                          -- 电脑/环境指纹
    machine_name        TEXT,                          -- 机器展示名（如 "运营A-MBP"）
    client_version      TEXT,

    error               TEXT,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    timestamp_ms        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_entity          ON records(entity_type);
CREATE INDEX IF NOT EXISTS idx_records_account_platform ON records(platform_key, account);
CREATE INDEX IF NOT EXISTS idx_records_operator        ON records(operator_uid);
CREATE INDEX IF NOT EXISTS idx_records_updated         ON records(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_source          ON records(source);

-- ---------- 每日快照 ----------
CREATE TABLE IF NOT EXISTS daily_snapshots (
    id                  BIGSERIAL PRIMARY KEY,
    snapshot_date       DATE NOT NULL,
    account_id          UUID REFERENCES accounts(id) ON DELETE CASCADE,
    entity_type         TEXT NOT NULL,
    platform_key        TEXT NOT NULL,
    assigned_operator_id UUID,

    followers           BIGINT DEFAULT 0,
    views               BIGINT DEFAULT 0,
    likes               BIGINT DEFAULT 0,
    engagement_rate     NUMERIC(6,2) DEFAULT 0,
    members             BIGINT DEFAULT 0,
    message_volume_24h  BIGINT DEFAULT 0,
    sentiment_bull      NUMERIC(5,2) DEFAULT 0,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (snapshot_date, account_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_operator ON daily_snapshots(assigned_operator_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date_platform ON daily_snapshots(snapshot_date, platform_key);

-- ---------- 视图：每个监测对象的最新一条数据（Dashboard 主数据源） ----------
CREATE OR REPLACE VIEW vw_latest_records AS
SELECT DISTINCT ON (r.platform_key, r.entity_type, r.account)
    r.id,
    r.account_id,
    r.account,
    r.platform,
    r.platform_key,
    r.entity_type,
    a.platform_category,
    a.avatar_color,
    r.profile_id,
    r.target_url,

    r.followers,
    r.following,
    r.likes,
    r.views,
    r.comments,
    r.collect,
    r.engagement_rate,

    r.members,
    r.online,
    r.message_volume_24h,
    r.sentiment_bull,
    r.sentiment_bear,
    r.posts_24h,
    r.symbol_price,
    r.symbol_change_pct,

    r.latest_post,
    r.extra,
    r.source,
    r.operator_uid,
    r.operator_name,
    r.machine_id,
    r.machine_name,

    a.assigned_operator_id   AS account_operator_id,
    a.assigned_operator_uid  AS account_operator_uid,
    a.assigned_operator_name AS account_operator_name,

    r.error,
    r.updated_at,
    CASE
        WHEN (r.entity_type = 'ACCOUNT'   AND r.followers = 0 AND r.views = 0) THEN TRUE
        WHEN (r.entity_type = 'COMMUNITY' AND r.members   = 0 AND r.message_volume_24h = 0 AND r.posts_24h = 0) THEN TRUE
        WHEN r.error IS NOT NULL THEN TRUE
        ELSE FALSE
    END AS abnormal
FROM records r
LEFT JOIN accounts a ON a.id = r.account_id
ORDER BY r.platform_key, r.entity_type, r.account, r.updated_at DESC;

-- ---------- 视图：运营人员绩效（Admin 用） ----------
CREATE OR REPLACE VIEW vw_operator_performance AS
SELECT
    o.id                AS operator_id,
    o.operator_uid,
    o.operator_name,
    o.role,
    o.avatar_color,
    COUNT(a.id)         AS accounts_count,
    COUNT(DISTINCT CASE WHEN a.entity_type = 'ACCOUNT'   THEN a.id END) AS account_count,
    COUNT(DISTINCT CASE WHEN a.entity_type = 'COMMUNITY' THEN a.id END) AS community_count,
    COALESCE(SUM(r.followers), 0)      AS total_followers,
    COALESCE(SUM(r.views), 0)          AS total_views,
    COALESCE(SUM(r.members), 0)        AS total_members,
    COALESCE(SUM(r.message_volume_24h), 0) AS total_msg_24h,
    COUNT(DISTINCT CASE WHEN l.abnormal THEN r.account_id END) AS abnormal_count,
    MAX(r.updated_at)   AS last_report_at
FROM operators o
LEFT JOIN accounts a ON a.assigned_operator_id = o.id
LEFT JOIN vw_latest_records l ON l.account_operator_id = o.id
LEFT JOIN records r ON r.id IN (
    SELECT r2.id FROM records r2
    WHERE r2.account_id = a.id
    ORDER BY r2.updated_at DESC LIMIT 1
)
WHERE o.status = 'active'
GROUP BY o.id, o.operator_uid, o.operator_name, o.role, o.avatar_color;

-- ---------- 触发器 ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS accounts_set_updated_at  ON accounts;
CREATE TRIGGER accounts_set_updated_at  BEFORE UPDATE ON accounts  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS operators_set_updated_at ON operators;
CREATE TRIGGER operators_set_updated_at BEFORE UPDATE ON operators FOR EACH ROW EXECUTE FUNCTION set_updated_at();
