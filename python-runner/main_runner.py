#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Matrix v2 · 矩阵账号 + 社区/股票数据采集调度器
新增：RBAC 角色体系 · operator 归属 & 溯源 · entity_type(ACCOUNT/COMMUNITY)
     Stocktwits 股票情绪 · Reddit Subreddit 社区监测
"""
import os
import re
import sys
import json
import time
import csv
import hmac
import hashlib
import base64
import asyncio
import logging
import traceback
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict, field
from pathlib import Path

import requests
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
from rich.panel import Panel
from rich import box

BASE_DIR = Path(__file__).resolve().parent
ACCOUNTS_FILE = BASE_DIR / "accounts.json"
DATA_FILE = BASE_DIR / "data.json"
CSV_FILE = BASE_DIR / "data_export.csv"
SCREENSHOT_DIR = BASE_DIR / "screenshots"
TZ_CN = timezone(timedelta(hours=8))

console = Console()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger("matrix.runner")

CLIENT_VERSION = "2.1.0"


# ============================================================
# 数据结构 v2
# ============================================================
@dataclass
class Operator:
    operator_uid: str
    operator_name: str
    role: str = "operator"
    email: str = ""
    avatar_color: str = "#6366f1,#8b5cf6"
    status: str = "active"

    @classmethod
    def from_dict(cls, d: Dict) -> "Operator":
        return cls(
            operator_uid=d["operator_uid"],
            operator_name=d["operator_name"],
            role=d.get("role", "operator"),
            email=d.get("email", ""),
            avatar_color=d.get("avatar_color", "#6366f1,#8b5cf6"),
            status=d.get("status", "active"),
        )


@dataclass
class Account:
    account_name: str
    platform: str
    platform_key: str
    target_url: str
    entity_type: str = "ACCOUNT"
    profile_id: str = ""
    symbol: str = ""
    subreddit: str = ""
    assigned_operator_uid: str = ""
    assigned_operator_name: str = ""
    active: bool = True

    @classmethod
    def from_dict(cls, d: Dict) -> "Account":
        return cls(
            account_name=d["account_name"],
            platform=d["platform"],
            platform_key=d.get("platform_key", ""),
            target_url=d["target_url"],
            entity_type=d.get("entity_type", "ACCOUNT"),
            profile_id=d.get("profile_id", "") or "",
            symbol=d.get("symbol", "") or "",
            subreddit=d.get("subreddit", "") or "",
            assigned_operator_uid=d.get("assigned_operator_uid", "") or "",
            assigned_operator_name=d.get("assigned_operator_name", "") or "",
            active=d.get("active", True),
        )


@dataclass
class Record:
    account: str
    platform: str
    platform_key: str
    target_url: str
    entity_type: str = "ACCOUNT"
    profile_id: str = ""

    # 账号指标 (entity=ACCOUNT 主用)
    followers: int = 0
    following: int = 0
    likes: int = 0
    views: int = 0
    comments: int = 0
    collect: int = 0
    engagement_rate: float = 0.0

    # 社区 / 股票指标 (entity=COMMUNITY 主用)
    members: int = 0
    online: int = 0
    message_volume_24h: int = 0
    sentiment_bull: float = 0.0
    sentiment_bear: float = 0.0
    posts_24h: int = 0
    symbol_price: Optional[float] = None
    symbol_change_pct: Optional[float] = None

    # 归属 + 采集溯源
    assigned_operator_uid: str = ""
    assigned_operator_name: str = ""
    operator_uid: str = ""
    operator_name: str = ""
    machine_id: str = ""
    machine_name: str = ""
    client_version: str = CLIENT_VERSION

    source: str = "runner"
    updated_at: str = ""
    timestamp: int = 0
    extra: Dict = field(default_factory=dict)


# ============================================================
# 工具
# ============================================================
def now_ts() -> int: return int(time.time() * 1000)
def now_iso() -> str: return datetime.now(TZ_CN).isoformat()
def load_json(p: Path, default: Any) -> Any:
    if not p.exists(): return default
    try: return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"读取 {p.name} 失败: {e}"); return default
def save_json(p: Path, data: Any) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
def fmt_short(n: int) -> str:
    if n >= 1e8: return f"{n / 1e8:.2f}亿"
    if n >= 1e4: return f"{n / 1e4:.1f}万"
    if n >= 1e3: return f"{n / 1e3:.1f}K"
    return f"{int(n):,}"

def load_config() -> Dict:
    data = load_json(ACCOUNTS_FILE, {})
    if "accounts" not in data:
        logger.error("accounts.json 缺少 accounts 字段"); sys.exit(1)
    if "operators" not in data:
        data["operators"] = []
    return data


# ============================================================
# JWT (简易内部系统对接)
# ============================================================
def _b64url_decode(s: str) -> bytes:
    s = s + "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode(s)

def decode_jwt(token: str, secret: str) -> Optional[Dict]:
    """仅验证签名，支持内部 HS256 JWT；不校验 exp（MVP 阶段）。"""
    try:
        parts = token.replace("Bearer ", "").strip().split(".")
        if len(parts) != 3: return None
        header_b, payload_b, sig_b = parts
        signing_input = f"{header_b}.{payload_b}".encode()
        expected = base64.urlsafe_b64encode(
            hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
        ).rstrip(b"=").decode()
        if expected != sig_b: return None
        return json.loads(_b64url_decode(payload_b))
    except Exception:
        return None


# ============================================================
# 指纹浏览器 API
# ============================================================
class FingerprintBrowserAPI:
    def __init__(self, base_url: str = "http://local.adspower.net:50325", timeout: int = 30):
        self.base_url = base_url.rstrip("/"); self.timeout = timeout
    def _get(self, path, params=None):
        try: return requests.get(f"{self.base_url}{path}", params=params or {}, timeout=self.timeout).json()
        except Exception as e: return {"code": -1, "msg": str(e)}
    def is_running(self) -> bool: return self._get("/api/v1/user/active").get("code") == 0

    def start(self, profile_id, max_wait=30):
        if not profile_id: return None
        resp = self._get("/api/v1/browser/start", {"user_id": profile_id, "open_tabs": "1", "ip_tab": "0"})
        if resp.get("code") != 0:
            logger.error(f"启动 Profile {profile_id} 失败: {resp.get('msg')}"); return None
        d = resp.get("data", {})
        ws = d.get("ws", {}).get("puppeteer") or d.get("debug_port")
        if ws:
            return ws if ws.startswith("ws") else f"ws://127.0.0.1:{ws}"
        deadline = time.time() + max_wait
        while time.time() < deadline:
            s = self._get("/api/v1/browser/active", {"user_id": profile_id})
            if s.get("code") == 0:
                dd = s.get("data", {})
                w = dd.get("ws", {}).get("puppeteer") or dd.get("debug_port")
                if w: return w if w.startswith("ws") else f"ws://127.0.0.1:{w}"
            time.sleep(1)
        return None
    def stop(self, profile_id):
        if not profile_id: return True
        r = self._get("/api/v1/browser/stop", {"user_id": profile_id})
        return r.get("code") == 0


# ============================================================
# 13 平台 DOM 提取 JS (Playwright evaluate)
# ============================================================
COMMON_PN = """
const pn = (t) => {
  if (!t) return 0; t = String(t).trim().replace(/[,，\\s]/g,'');
  const w = t.match(/([\\d.]+)\\s*万/);   if (w) return Math.round(parseFloat(w[1])*10000);
  const y = t.match(/([\\d.]+)\\s*亿/);   if (y) return Math.round(parseFloat(y[1])*1e8);
  const b = t.match(/([\\d.]+)\\s*[Bb]/); if (b) return Math.round(parseFloat(b[1])*1e9);
  const m = t.match(/([\\d.]+)\\s*[Mm]/); if (m) return Math.round(parseFloat(m[1])*1e6);
  const k = t.match(/([\\d.]+)\\s*[Kk]/); if (k) return Math.round(parseFloat(k[1])*1000);
  const n = t.match(/[\\d.]+/); return n ? Math.round(parseFloat(n[0])) : 0;
};
const pp = (t) => { if (!t) return 0; const m = String(t).match(/([\\d.]+)\\s*%?/); return m ? Math.min(100, Math.max(0, parseFloat(m[1]))) : 0; };
"""

XUEQIU_JS = COMMON_PN + """
() => {
  const t = document.body.innerText || '';
  let o = {followers:0,following:0,likes:0,views:0};
  const fm = t.match(/粉丝\\s*([\\d,.万]+)/); if (fm) o.followers = pn(fm[1]);
  const fg = t.match(/关注\\s*([\\d,.万]+)/); if (fg) o.following = pn(fg[1]);
  const lm = t.match(/([\\d,.万]+)\\s*获赞/); if (lm) o.likes = pn(lm[1]);
  const rm = t.match(/([\\d,.万]+)\\s*阅读/); if (rm) o.views = pn(rm[1]);
  const el = document.querySelector('.followers .count, [class*="follower"] [class*="count"]');
  if (el && !o.followers) o.followers = pn(el.textContent);
  return o;
}
"""
FUTU_JS   = COMMON_PN + """
() => { const t = document.body.innerText||'';
  let o = {followers:0,likes:0,views:0,comments:0};
  const fm=t.match(/粉丝\\s*([\\d,.万]+)/); if (fm) o.followers=pn(fm[1]);
  const zm=t.match(/([\\d,.万]+)\\s*赞/);   if (zm) o.likes=pn(zm[1]);
  const rm=t.match(/([\\d,.万]+)\\s*阅读/); if (rm) o.views=pn(rm[1]);
  const cm=t.match(/([\\d,.万]+)\\s*评论/); if (cm) o.comments=pn(cm[1]);
  return o; }
"""
LAOHU_JS = FUTU_JS
WECHAT_JS = COMMON_PN + """
() => { const t = document.body.innerText||'';
  let o={followers:0,views:0,likes:0,comments:0};
  const fm=t.match(/(总用户数|粉丝|关注用户)[^\\d]{0,8}([\\d,.万]+)/); if (fm) o.followers=pn(fm[2]);
  const rm=t.match(/([\\d,.万]+)\\s*阅读/); if (rm) o.views=pn(rm[1]);
  const zm=t.match(/([\\d,.万]+)\\s*赞/);   if (zm) o.likes=pn(zm[1]);
  const cm=t.match(/([\\d,.万]+)\\s*留言/); if (cm) o.comments=pn(cm[1]);
  return o; }
"""
XHS_JS = COMMON_PN + """
() => { const t = document.body.innerText||'';
  let o={followers:0,likes:0,collect:0,views:0};
  const fm=t.match(/粉丝\\s*([\\d,.万]+)/); if (fm) o.followers=pn(fm[1]);
  const zm=t.match(/获赞(与收藏)?[^\\d]{0,8}([\\d,.万]+)/); if (zm) o.likes=pn(zm[2]||zm[1]);
  const cm=t.match(/([\\d,.万]+)\\s*收藏/);   if (cm) o.collect=pn(cm[1]);
  const rm=t.match(/([\\d,.万]+)\\s*阅读/);   if (rm) o.views=pn(rm[1]);
  return o; }
"""
DOUYIN_JS = COMMON_PN + """
() => { const t = document.body.innerText||'';
  let o={followers:0,likes:0,views:0,comments:0};
  const fm=t.match(/粉丝\\s*([\\d,.万]+)/);  if (fm) o.followers=pn(fm[1]);
  const zm=t.match(/获赞\\s*([\\d,.万]+)/);  if (zm) o.likes=pn(zm[1]);
  const pm=t.match(/(播放|总获赞)[^\\d]{0,8}([\\d,.万]+)/); if (pm) o.views=pn(pm[2]);
  return o; }
"""
X_JS = COMMON_PN + """
() => { const t = document.body.innerText||'';
  let o={followers:0,following:0,likes:0,views:0};
  document.querySelectorAll('a[href$="/followers"],a[href$="/following"]').forEach(a=>{
    const txt = a.textContent||'';
    if (/follower/i.test(a.href)) o.followers = o.followers || pn(txt.split(/\\s+/)[0]);
    if (/following/i.test(a.href)) o.following = o.following || pn(txt.split(/\\s+/)[0]);
  });
  const f=t.match(/([\\d,.KM]+)\\s*Followers/i); if (f && !o.followers) o.followers=pn(f[1]);
  const g=t.match(/([\\d,.KM]+)\\s*Following/i); if (g && !o.following) o.following=pn(g[1]);
  return o; }
"""
YT_JS = COMMON_PN + """
() => { let o={followers:0,views:0,likes:0,comments:0};
  const se = document.querySelector('#subscriber-count, yt-formatted-string[id*="subscriber"]');
  if (se) o.followers = pn(se.textContent);
  const ve = document.querySelector('#view-count, yt-view-count-renderer');
  if (ve) o.views = pn(ve.textContent);
  const lb = document.querySelector('#segmented-like-button button');
  if (lb) o.likes = pn(lb.getAttribute('aria-label') || lb.textContent || '');
  if (!o.followers){ const fm=(document.body.innerText||'').match(/([\\d,.MKB]+)\\s*subscribers/i); if (fm) o.followers=pn(fm[1]); }
  return o; }
"""
BILI_JS = COMMON_PN + """
() => { const t = document.body.innerText||'';
  let o={followers:0,likes:0,views:0,collect:0};
  const fm=t.match(/粉丝\\s*([\\d,.万]+)/); if (fm) o.followers=pn(fm[1]);
  const zm=t.match(/点赞(数)?[^\\d]{0,8}([\\d,.万]+)/); if (zm) o.likes=pn(zm[2]);
  const vm=t.match(/播放(量)?[^\\d]{0,8}([\\d,.万]+)/); if (vm) o.views=pn(vm[2]);
  const cm=t.match(/收藏[^\\d]{0,8}([\\d,.万]+)/);   if (cm) o.collect=pn(cm[1]);
  return o; }
"""
WEIBO_JS = COMMON_PN + """
() => { const t = document.body.innerText||'';
  let o={followers:0,likes:0,views:0,comments:0};
  const fm=t.match(/粉丝\\s*([\\d,.万]+)/); if (fm) o.followers=pn(fm[1]);
  const zm=t.match(/赞\\s*([\\d,.万]+)/);   if (zm) o.likes=pn(zm[1]);
  const rm=t.match(/阅读\\s*([\\d,.万]+)/); if (rm) o.views=pn(rm[1]);
  const cm=t.match(/评论\\s*([\\d,.万]+)/); if (cm) o.comments=pn(cm[1]);
  return o; }
"""
ZHIHU_JS = COMMON_PN + """
() => { const t = document.body.innerText||'';
  let o={followers:0,likes:0,views:0,collect:0};
  const fm=t.match(/(关注者|被关注)[^\\d]{0,8}([\\d,.万]+)/); if (fm) o.followers=pn(fm[2]);
  const zm=t.match(/([\\d,.万]+)\\s*赞同/);    if (zm) o.likes=pn(zm[1]);
  const rm=t.match(/([\\d,.万]+)\\s*次阅读/);  if (rm) o.views=pn(rm[1]);
  const cm=t.match(/([\\d,.万]+)\\s*次收藏/);  if (cm) o.collect=pn(cm[1]);
  return o; }
"""

# 新增：Stocktwits 股票情绪
STOCKTWITS_JS = COMMON_PN + """
() => {
  const t = document.body.innerText||'';
  let o = {members:0,online:0,message_volume_24h:0,sentiment_bull:0,sentiment_bear:0,symbol_price:null,symbol_change_pct:null,posts_24h:0};
  const wm = t.match(/([\\d,.KMB]+)\\s*Watcher/i); if (wm) o.members = pn(wm[1]);
  const mm = t.match(/([\\d,.KMB]+)\\s*(Message|messages?|讨论|消息)/i); if (mm) o.message_volume_24h = pn(mm[1]);
  const bm = t.match(/(看涨|Bullish)[^0-9]{0,6}([\\d.]+)\\s*%?/i);
  const br = t.match(/([\\d.]+)%\\s*(看涨|Bullish)/i);
  if (bm||br) o.sentiment_bull = pp((bm||br)[1]);
  const em = t.match(/(看跌|Bearish)[^0-9]{0,6}([\\d.]+)\\s*%?/i);
  const er = t.match(/([\\d.]+)%\\s*(看跌|Bearish)/i);
  if (em||er) o.sentiment_bear = pp((em||er)[1]);
  if (!o.sentiment_bull && !o.sentiment_bear) {
    document.querySelectorAll('[class*="sentiment"],[class*="Sentiment"]').forEach(bar=>{
      const x = bar.textContent||'';
      const bs = x.match(/([\\d.]+)\\s*%/);
      if (bs && /bull|涨|多/i.test(x)) o.sentiment_bull = pp(bs[1]);
      const be = x.match(/([\\d.]+)\\s*%/);
      if (be && /bear|跌|空/i.test(x)) o.sentiment_bear = pp(be[1]);
    });
  }
  const pr = document.querySelector('[data-testid="symbol-price"],.symbol-price,[class*="symbol"] [class*="price"]');
  if (pr) o.symbol_price = parseFloat(pr.textContent.replace(/[^0-9.-]/g,'')) || null;
  const ch = document.querySelector('[data-testid="change-percent"],[class*="change"] [class*="percent"],.price-change');
  if (ch) o.symbol_change_pct = parseFloat(ch.textContent.replace(/[^0-9.-]/g,'')) || null;
  o.posts_24h = o.message_volume_24h;
  return o;
}
"""

# 新增：Reddit 社区监测
REDDIT_JS = COMMON_PN + """
() => {
  const t = document.body.innerText||'';
  let o = {members:0,online:0,posts_24h:0,message_volume_24h:0,sentiment_bull:0,sentiment_bear:0};
  const mm = t.match(/([\\d,.KMB]+)\\s*members?/i); if (mm) o.members = pn(mm[1]);
  const om = t.match(/([\\d,.KMB]+)\\s*online/i);   if (om) o.online  = pn(om[1]);
  const pm = t.match(/([\\d,.KMB]+)\\s*(posts?|帖文|帖子)\\s*(per day|today|今日)?/i);
  if (pm) { o.posts_24h = pn(pm[1]); o.message_volume_24h = o.posts_24h; }
  if (!o.members || !o.online) {
    document.querySelectorAll('h1,h2,[class*="about"],[class*="sidebar"] [class*="text"]').forEach(el=>{
      const x = el.textContent||'';
      if (!o.members) { const m=x.match(/([\\d,.KMB]+)\\s*members?/i); if (m) o.members=pn(m[1]); }
      if (!o.online)  { const m=x.match(/([\\d,.KMB]+)\\s*online/i);   if (m) o.online=pn(m[1]); }
    });
  }
  return o;
}
"""

PLATFORM_EXTRACTORS = {
    "xueqiu": XUEQIU_JS, "futu": FUTU_JS, "laohu": LAOHU_JS,
    "wechat": WECHAT_JS, "xiaohongshu": XHS_JS, "douyin": DOUYIN_JS,
    "x": X_JS, "twitter": X_JS, "youtube": YT_JS,
    "bilibili": BILI_JS, "weibo": WEIBO_JS, "zhihu": ZHIHU_JS,
    "stocktwits": STOCKTWITS_JS, "reddit": REDDIT_JS,
}

GENERIC_JS = COMMON_PN + """
() => {
  const txt = document.body.innerText || '';
  const out = {followers:0,likes:0,views:0,comments:0,members:0,online:0,message_volume_24h:0,sentiment_bull:0,sentiment_bear:0,posts_24h:0};
  const rules = [
    [/粉丝\\s*([\\d,.万KM]+)/,                                'followers'],
    [/([\\d,.万KM]+)\\s*Followers/i,                           'followers'],
    [/关注者[^\\d]{0,6}([\\d,.万KM]+)/,                         'followers'],
    [/([\\d,.万KM]+)\\s*阅读(量)?/i,                            'views'],
    [/([\\d,.万KM]+)\\s*播放(量)?/i,                            'views'],
    [/([\\d,.万KM]+)\\s*(赞|Like|喜欢|赞同)/i,                   'likes'],
    [/([\\d,.KMB]+)\\s*members?/i,                              'members'],
    [/([\\d,.KMB]+)\\s*online/i,                                'online'],
    [/([\\d,.KMB]+)\\s*(posts?|帖文|消息|讨论)\\s*(per day|今日)?/i,'posts_24h'],
  ];
  for (const [re,k] of rules){
    const m = txt.match(re);
    if (m) out[k] = Math.max(out[k]||0, pn(m[1]));
  }
  out.message_volume_24h = out.message_volume_24h || out.posts_24h;
  return out;
}
"""


# ============================================================
# Playwright CDP 采集
# ============================================================
async def extract_via_cdp(ws_url, account: Account, settings: Dict, task_id: str, default_op: Dict) -> Record:
    from playwright.async_api import async_playwright

    rec = Record(
        account=account.account_name,
        platform=account.platform,
        platform_key=account.platform_key,
        target_url=account.target_url,
        entity_type=account.entity_type,
        profile_id=account.profile_id,
        assigned_operator_uid=account.assigned_operator_uid,
        assigned_operator_name=account.assigned_operator_name,
        operator_uid=default_op.get("operator_uid", ""),
        operator_name=default_op.get("operator_name", ""),
        machine_name=default_op.get("machine_name", ""),
        source="runner",
        updated_at=now_iso(),
        timestamp=now_ts(),
    )
    async with async_playwright() as p:
        browser = None
        try:
            browser = await p.chromium.connect_over_cdp(ws_url, timeout=60_000)
            ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            page.set_default_timeout(settings.get("page_load_timeout", 45000))
            logger.info(f"[{task_id}] 访问 {account.target_url}")
            await page.goto(account.target_url, wait_until="domcontentloaded")
            await asyncio.sleep(settings.get("delay_before_extract", 4))
            try: await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception: pass
            for _ in (1.5, 2.0):
                try: await page.evaluate("document.body.innerText.length"); break
                except Exception: await asyncio.sleep(_)

            js = PLATFORM_EXTRACTORS.get(account.platform_key, GENERIC_JS)
            metrics: Dict = await page.evaluate(js) or {}
            logger.debug(f"[{task_id}] metrics={json.dumps(metrics, ensure_ascii=False)[:120]}")

            if account.entity_type == "COMMUNITY":
                for k in ["members","online","message_volume_24h","sentiment_bull","sentiment_bear","posts_24h","symbol_price","symbol_change_pct"]:
                    if metrics.get(k) is not None and metrics[k] != "":
                        if isinstance(metrics[k], str):
                            try:
                                setattr(rec, k, float(metrics[k]))
                                if k not in ("sentiment_bull","sentiment_bear","symbol_price","symbol_change_pct"):
                                    setattr(rec, k, int(float(metrics[k])))
                            except: pass
                        else:
                            setattr(rec, k, metrics[k])
                if not rec.message_volume_24h: rec.message_volume_24h = int(rec.posts_24h)
            else:
                for k in ["followers","following","likes","views","comments","collect"]:
                    if metrics.get(k):
                        try: setattr(rec, k, int(metrics[k]))
                        except: pass
                if rec.views > 0:
                    rec.engagement_rate = round((rec.likes + rec.comments + rec.collect) / rec.views * 100, 2)
        except Exception as e:
            logger.error(f"[{task_id}] 采集异常: {e}")
            rec.extra["error"] = str(e)
            if settings.get("screenshot_on_error") and browser is not None:
                try:
                    SCREENSHOT_DIR.mkdir(exist_ok=True)
                    fname = f"{int(time.time())}_{account.platform_key}_{account.entity_type}_{hash(account.account_name)%10000}.png"
                    fpath = SCREENSHOT_DIR / fname
                    cc = browser.contexts[0] if browser.contexts else None
                    if cc and cc.pages:
                        await cc.pages[0].screenshot(path=str(fpath), full_page=False)
                        logger.info(f"[{task_id}] 截图 {fname}")
                except Exception as se: logger.warning(f"截图失败 {se}")
        finally:
            try:
                if browser is not None: await browser.close()
            except Exception: pass
    return rec


# ============================================================
# 存储 + 导出
# ============================================================
def append_record(record: Record) -> None:
    existing: List = load_json(DATA_FILE, [])
    if isinstance(existing, dict) and "records" in existing: existing = existing["records"]
    existing.append(asdict(record))
    save_json(DATA_FILE, {
        "generated_at": now_iso(),
        "generated_ts": now_ts(),
        "total": len(existing),
        "client_version": CLIENT_VERSION,
        "records": existing,
    })

def export_csv(records: List[Dict] = None) -> None:
    if records is None:
        d = load_json(DATA_FILE, {"records": []})
        records = d.get("records", []) if isinstance(d, dict) else d
    if not records: logger.info("CSV: 无数据"); return
    keys = [
        "updated_at","entity_type","account","platform","platform_key",
        "followers","views","likes","comments","collect","engagement_rate",
        "members","online","message_volume_24h","posts_24h",
        "sentiment_bull","sentiment_bear","symbol_price","symbol_change_pct",
        "assigned_operator_uid","assigned_operator_name",
        "operator_uid","operator_name","machine_name",
        "source","target_url","profile_id",
    ]
    with open(CSV_FILE, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        w.writeheader()
        for r in records: w.writerow(r)
    logger.info(f"已导出 {len(records)} 条 → {CSV_FILE.name}")


# ============================================================
# 权限过滤 (Dashboard 用)
# ============================================================
def apply_rbac(records: List[Dict], operator_uid: Optional[str], role: str) -> List[Dict]:
    if role == "admin" or not operator_uid:
        return records
    # operator: 只看自己 assigned 的 + 自己上报的
    return [
        r for r in records
        if r.get("assigned_operator_uid") == operator_uid
        or r.get("operator_uid") == operator_uid
    ]

def latest_per_entity(records: List[Dict]) -> List[Dict]:
    latest: Dict[Tuple[str, str], Dict] = {}
    for r in records:
        k = (r.get("platform_key", ""), r.get("entity_type", "ACCOUNT"), r.get("account", ""))
        if k not in latest or (r.get("updated_at","") > latest[k].get("updated_at","")):
            latest[k] = r
    return list(latest.values())


# ============================================================
# 控制台汇总表
# ============================================================
def print_summary(records: List[Record]):
    table = Table(title="v2 采集结果", box=box.ROUNDED)
    table.add_column("实体"); table.add_column("类型", style="yellow", no_wrap=True)
    table.add_column("平台", style="magenta")
    table.add_column("归属运营", style="cyan")
    if any(r.entity_type == "ACCOUNT" for r in records):
        table.add_column("粉丝", justify="right", style="green")
        table.add_column("阅读", justify="right")
    if any(r.entity_type == "COMMUNITY" for r in records):
        table.add_column("成员/Watcher", justify="right", style="blue")
        table.add_column("24h量", justify="right")
        table.add_column("情绪", justify="right")
    table.add_column("异常", justify="right")
    tf=tv=tm=t24=0; abnormal=0
    for r in records:
        abnormal += 1 if (r.entity_type=="ACCOUNT" and r.followers==0 and r.views==0) or (r.entity_type=="COMMUNITY" and r.members==0 and r.message_volume_24h==0) or r.extra.get("error") else 0
        row = [r.account, r.entity_type, r.platform, r.assigned_operator_name or "—"]
        if any(x.entity_type=="ACCOUNT" for x in records):
            row += [fmt_short(r.followers), fmt_short(r.views)]
            if r.entity_type=="ACCOUNT":
                tf += r.followers; tv += r.views
        if any(x.entity_type=="COMMUNITY" for x in records):
            sent = f"🐂{r.sentiment_bull:g}%/🐻{r.sentiment_bear:g}%" if r.sentiment_bull or r.sentiment_bear else "—"
            row += [fmt_short(r.members), fmt_short(r.message_volume_24h), sent]
            if r.entity_type=="COMMUNITY":
                tm += r.members; t24 += r.message_volume_24h
        row.append("⚠" if ( (r.entity_type=="ACCOUNT" and r.followers==0 and r.views==0) or (r.entity_type=="COMMUNITY" and r.members==0 and r.message_volume_24h==0) or r.extra.get("error") else "")
        table.add_row(*row)
    console.print(table)
    parts = [f"[bold]异常:[/bold] [yellow]{abnormal}[/yellow]"]
    if tf or tv: parts += [f"[bold]总粉丝:[/bold] [green]{fmt_short(tf)}[/green]", f"[bold]总阅读:[/bold] [cyan]{fmt_short(tv)}[/cyan]"]
    if tm or t24: parts += [f"[bold]总成员:[/bold] [blue]{fmt_short(tm)}[/blue]", f"[bold]24h讨论:[/bold] [violet]{fmt_short(t24)}[/violet]"]
    console.print(Panel.fit("    ".join(parts), title="汇总", border_style="blue"))


# ============================================================
# run_once 采集循环
# ============================================================
async def run_once() -> List[Record]:
    cfg = load_config()
    fb_cfg = cfg.get("fingerprint_browser", {})
    settings = cfg.get("run_settings", {})
    default_op = {
        "operator_uid": settings.get("default_operator_uid", "op_runner_001"),
        "operator_name": settings.get("default_operator_name", "中央调度器"),
        "machine_name": settings.get("machine_name", ""),
    }
    console.print(Panel.fit(
        f"FB: [bold]{fb_cfg.get('type','adspower').upper()}[/bold] · {fb_cfg.get('base_url')}    "
        f"账号: [yellow]{len([a for a in cfg['accounts'] if a.get('active',True)])}[/yellow]    "
        f"社区对象: [blue]{len([a for a in cfg['accounts'] if a.get('entity_type')=='COMMUNITY'])}[/blue]",
        title="Matrix Runner v2", border_style="purple"))

    fb = FingerprintBrowserAPI(fb_cfg.get("base_url","http://local.adspower.net:50325"), fb_cfg.get("start_timeout",30))
    if not fb.is_running():
        console.print("[red]⚠ 无法连接指纹浏览器 API，请启动客户端并开启 Local API[/red]")
        console.print(f"  {fb.base_url}/api/v1/user/active")
        # 没 API 就跳过不跑
        return []

    accounts = [Account.from_dict(a) for a in cfg.get("accounts",[]) if a.get("active", True)]
    collected: List[Record] = []; failed = []

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                  BarColumn(), TextColumn("{task.completed}/{task.total}"),
                  console=console, transient=False) as prog:
        task = prog.add_task("采集进度", total=len(accounts))
        for idx, acc in enumerate(accounts, 1):
            tid = f"{idx}/{len(accounts)}"
            prog.update(task, description=f"[bold cyan]{acc.platform}[/bold cyan] · [bold]{acc.account_name}[/bold] ({acc.entity_type})")
            record: Optional[Record] = None; last_err = ""

            # COMMUNITY(股票/社区) 不需要登录态 → 为了省 License 也会直接跑，但仍经过指纹浏览器
            for attempt in range(1, settings.get("max_retry_per_account", 2) + 1):
                ws_url = None
                try:
                    if acc.profile_id:
                        logger.info(f"[{tid}] 启动 Profile {acc.profile_id} (attempt {attempt})")
                        ws_url = fb.start(acc.profile_id)
                        if not ws_url:
                            last_err = "无法获取 CDP 调试地址"
                            await asyncio.sleep(settings.get("retry_delay",8)); continue
                    else:
                        logger.info(f"[{tid}] 无 profile_id，假设 Playwright 默认本地浏览器上下文")
                    record = await extract_via_cdp(ws_url, acc, settings, tid, default_op)
                    err = record.extra.get("error")
                    is_zero = (record.entity_type=="ACCOUNT" and record.followers==0 and record.views==0) or (record.entity_type=="COMMUNITY" and record.members==0 and record.message_volume_24h==0)
                    if err and is_zero:
                        last_err = err
                        await asyncio.sleep(settings.get("retry_delay",8)); continue
                    break
                except Exception as e:
                    last_err = str(e)
                    logger.error(f"[{tid}] {e}")
                    await asyncio.sleep(settings.get("retry_delay",8))
                finally:
                    if ws_url:
                        try: await asyncio.sleep(1.2); fb.stop(acc.profile_id)
                        except Exception: pass

            if record is None:
                record = Record(
                    account=acc.account_name, platform=acc.platform, platform_key=acc.platform_key,
                    entity_type=acc.entity_type, target_url=acc.target_url, profile_id=acc.profile_id,
                    assigned_operator_uid=acc.assigned_operator_uid,
                    assigned_operator_name=acc.assigned_operator_name,
                    operator_uid=default_op.get("operator_uid",""),
                    operator_name=default_op.get("operator_name",""),
                    updated_at=now_iso(), timestamp=now_ts(),
                    extra={"error": last_err or "采集失败"},
                )
                failed.append((acc, last_err))

            append_record(record); collected.append(record)
            if idx < len(accounts): await asyncio.sleep(settings.get("delay_between_accounts", 5))
            prog.advance(task)

    if failed:
        console.print(f"[red]{len(failed)} 失败:[/red]")
        for acc, err in failed:
            console.print(f"  · [yellow]{acc.platform}[/yellow] {acc.account_name}: {err[:90]}")

    export_csv(); print_summary(collected); return collected


# ============================================================
# FastAPI (接收扩展 + RBAC 过滤视图 + 运营绩效)
# ============================================================
def build_api_app():
    from fastapi import FastAPI, Request, HTTPException, Query
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="Matrix API v2", version="2.1.0")
    api_cfg = load_config().get("api_server", {})
    origins = api_cfg.get("cors_origins", ["*"])
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"],
                       expose_headers=["X-Powered-By", "Content-Disposition"])

    # ---------- 解析当前用户 ----------
    async def current_user(request: Request) -> Dict:
        """优先级: JWT sub → X-Operator-UID Header → ?operator_uid=..."""
        operators = load_config().get("operators", [])
        op_map = {o["operator_uid"]: o for o in operators}

        auth = request.headers.get("Authorization", "")
        jwt_secret = api_cfg.get("jwt_secret", "")
        uid = role = name = None
        if auth.startswith("Bearer ") and api_cfg.get("trust_internal_jwt") and jwt_secret:
            payload = decode_jwt(auth, jwt_secret)
            if payload:
                uid  = payload.get("sub") or payload.get("user_id") or payload.get("uid")
                name = payload.get("name") or payload.get("username") or payload.get("nickname")
                role = payload.get("role")

        if not uid: uid  = request.headers.get("X-Operator-UID") or request.headers.get("x-operator-uid")
        if not name: name = request.headers.get("X-Operator-Name")
        if not uid: uid  = request.query_params.get("operator_uid")
        if not role:
            role = request.headers.get("X-Role") or request.query_params.get("role")
        # 本地匹配 role
        if uid and uid in op_map:
            meta = op_map[uid]
            if not role: role = meta.get("role", "operator")
            if not name: name = meta.get("operator_name")
        role = (role or "admin" if not uid else "operator").lower()
        return {"operator_uid": uid or "", "operator_name": name or "", "role": role}

    @app.get("/api/health")
    def health():
        return {"ok": True, "now": now_iso(), "client_version": CLIENT_VERSION,
                "total_records": len(load_json(DATA_FILE,{"records":[]}).get("records",[]))}

    # ---- 当前身份信息 (前端角色切换调试也用) ----
    @app.get("/api/whoami")
    async def whoami(user=Dep(current_user)):
        return user

    # ---- 采集上报 (Chrome 扩展 + 手动) ----
    @app.post("/api/collect")
    async def collect_endpoint(request: Request):
        try: payload = await request.json()
        except Exception: raise HTTPException(400, "Invalid JSON")
        if not payload.get("account") or not payload.get("platform"):
            raise HTTPException(400, "account + platform required")

        # Header → Body 兜底赋值
        for hk, bk in [
            ("x-operator-uid","operator_uid"),("x-operator-name","operator_name"),
            ("x-machine-id","machine_id"),    ("x-machine-name","machine_name"),
            ("x-client-version","client_version"), ("x-entity-type","entity_type"),
        ]:
            v = request.headers.get(hk)
            if v and not payload.get(bk):
                payload[bk] = v if hk != "x-operator-name" else payload.setdefault(bk, v)
        # URL decode 简单处理
        for bk in ("operator_name","machine_name"):
            if isinstance(payload.get(bk), str):
                try:
                    from urllib.parse import unquote
                    if "%" in payload[bk]: payload[bk] = unquote(payload[bk])
                except Exception: pass

        entity_type = payload.get("entity_type") or ("COMMUNITY" if payload.get("platform_key") in ("stocktwits","reddit") else "ACCOUNT")
        assigned_operator_uid  = payload.get("assigned_operator_uid") or ""
        assigned_operator_name = payload.get("assigned_operator_name") or ""
        cfg_accounts = load_config().get("accounts", [])
        for a in cfg_accounts:
            if a.get("account_name") == payload.get("account") and a.get("platform_key") == payload.get("platform_key"):
                if a.get("assigned_operator_uid"): assigned_operator_uid = a["assigned_operator_uid"]
                if a.get("assigned_operator_name"): assigned_operator_name = a["assigned_operator_name"]
                break

        r = Record(
            account=payload["account"], platform=payload["platform"],
            platform_key=payload.get("platform_key",""), target_url=payload.get("target_url") or payload.get("url",""),
            entity_type=entity_type, profile_id=payload.get("profile_id",""),
            followers=int(payload.get("followers",0) or 0),
            following=int(payload.get("following",0) or 0),
            likes=int(payload.get("likes",0) or 0),
            views=int(payload.get("views",0) or 0),
            comments=int(payload.get("comments",0) or 0),
            collect=int(payload.get("collect",0) or 0),
            engagement_rate=float(payload.get("engagement_rate",0) or 0),
            members=int(payload.get("members",0) or 0),
            online=int(payload.get("online",0) or 0),
            message_volume_24h=int(payload.get("message_volume_24h") or payload.get("posts_24h") or 0),
            sentiment_bull=float(payload.get("sentiment_bull",0) or 0),
            sentiment_bear=float(payload.get("sentiment_bear",0) or 0),
            posts_24h=int(payload.get("posts_24h",0) or 0),
            symbol_price=float(payload["symbol_price"]) if payload.get("symbol_price") not in (None,"") else None,
            symbol_change_pct=float(payload["symbol_change_pct"]) if payload.get("symbol_change_pct") not in (None,"") else None,
            assigned_operator_uid=assigned_operator_uid,
            assigned_operator_name=assigned_operator_name,
            operator_uid=payload.get("operator_uid",""),
            operator_name=payload.get("operator_name",""),
            machine_id=payload.get("machine_id",""),
            machine_name=payload.get("machine_name",""),
            client_version=payload.get("client_version") or CLIENT_VERSION,
            source=payload.get("source") or "api",
            extra={k:v for k,v in payload.items() if k not in Record.__annotations__},
            updated_at=payload.get("updated_at") or now_iso(),
            timestamp=int(payload.get("timestamp",0) or now_ts()),
        )
        if r.entity_type=="ACCOUNT" and r.views>0 and r.engagement_rate==0:
            r.engagement_rate = round((r.likes+r.comments+r.collect)/r.views*100, 2)
        append_record(r)
        return {"ok": True, "record_id": r.timestamp, "received_at": r.updated_at}

    # 辅助
    def Dep(fn):
        """和 FastAPI Depends 等价，但兼容没装 fastapi 的导入阶段(外层已装)"""
        from fastapi import Depends as FD
        return FD(fn)

    # ---- 汇总 / 记录 (所有 GET 支持 RBAC 过滤) ----
    @app.get("/api/records")
    async def get_records(request: Request, limit:int=500, platform: Optional[str]=None):
        user = await current_user(request)
        data = load_json(DATA_FILE, {"records":[]})
        records = data.get("records", []) if isinstance(data, dict) else data
        if platform:
            records = [r for r in records if platform.lower() in (r.get("platform","")+r.get("platform_key","")).lower()]
        records = apply_rbac(records, user["operator_uid"], user["role"])
        return {"total": len(records), "user": user, "generated_at": now_iso(), "records": records[-limit:]}

    @app.get("/api/summary")
    async def api_summary(request: Request, days: int = 30):
        user = await current_user(request)
        cfg = load_config()
        operators_list = [o for o in cfg.get("operators", []) if o.get("status") == "active"]

        data = load_json(DATA_FILE, {"records": []})
        records = data.get("records", []) if isinstance(data, dict) else data
        records = apply_rbac(records, user["operator_uid"], user["role"])

        cutoff = (datetime.now(TZ_CN) - timedelta(days=days)).isoformat()
        filtered = [r for r in records if r.get("updated_at", "") >= cutoff]
        latests = latest_per_entity(records)

        # 分类统计
        platforms = sorted({r.get("platform","") for r in latests if r.get("platform")})
        plat_traffic = {}
        for r in latests:
            p = r.get("platform","其他")
            unit = int(r.get("views") or 0) + int(r.get("message_volume_24h") or 0)
            plat_traffic[p] = plat_traffic.get(p, 0) + unit

        total_followers = sum(int(r.get("followers") or 0) for r in latests if r.get("entity_type","ACCOUNT") == "ACCOUNT")
        total_views = sum(int(r.get("views") or 0) for r in filtered if r.get("entity_type","ACCOUNT") == "ACCOUNT")
        total_members = sum(int(r.get("members") or 0) for r in latests if r.get("entity_type","ACCOUNT") == "COMMUNITY")
        total_msg = sum(int(r.get("message_volume_24h") or 0) for r in latests if r.get("entity_type","ACCOUNT") == "COMMUNITY")

        def is_abn(r):
            if r.get("extra") and isinstance(r.get("extra"), dict) and r["extra"].get("error"): return True
            if r.get("entity_type","ACCOUNT") == "ACCOUNT":
                return int(r.get("followers") or 0)==0 and int(r.get("views") or 0)==0
            return int(r.get("members") or 0)==0 and int(r.get("message_volume_24h") or 0)==0 and int(r.get("posts_24h") or 0)==0

        # 30 天趋势 (按日+平台累加)
        from collections import defaultdict
        trend_by_day: Dict[str, Dict[str, float]] = defaultdict(dict)
        day_set = set()
        for i in range(days - 1, -1, -1):
            d = datetime.now(TZ_CN) - timedelta(days=i)
            key = d.strftime("%m/%d"); day_set.add(key)
        trend_running: Dict[str, float] = defaultdict(float)
        day_records = defaultdict(list)
        for r in records:
            ud = r.get("updated_at","")
            if not ud: continue
            try:
                key = datetime.fromisoformat(ud.replace("Z","+00:00")).astimezone(TZ_CN).strftime("%m/%d")
            except Exception: continue
            if key in day_set: day_records[key].append(r)
        for d in sorted(day_set):
            for r in day_records.get(d, []):
                pf = r.get("platform") or r.get("platform_key") or "未知"
                inc = int(r.get("followers") or r.get("members") or 0)
                trend_running[pf] = max(trend_running.get(pf, 0), inc)
            trend_by_day[d] = {"date": d, **{k: int(v) for k,v in trend_running.items()}}
        trend = [trend_by_day[d] for d in sorted(day_set)]

        # 运营绩效汇总 (仅 admin 看全量)
        op_map = {o["operator_uid"]: o for o in operators_list}
        operator_stats = []
        for op_uid, meta in op_map.items():
            op_latests = latest_per_entity(apply_rbac(records, op_uid, "operator"))
            operator_stats.append({
                "operator_uid": op_uid,
                "operator_name": meta.get("operator_name"),
                "role": meta.get("role"),
                "avatar_color": meta.get("avatar_color"),
                "accounts_count": len(op_latests),
                "account_count":   len([x for x in op_latests if x.get("entity_type","ACCOUNT")=="ACCOUNT"]),
                "community_count": len([x for x in op_latests if x.get("entity_type")=="COMMUNITY"]),
                "total_followers": sum(int(x.get("followers") or 0) for x in op_latests if x.get("entity_type","ACCOUNT")=="ACCOUNT"),
                "total_views":     sum(int(x.get("views")     or 0) for x in op_latests if x.get("entity_type","ACCOUNT")=="ACCOUNT"),
                "total_members":   sum(int(x.get("members")   or 0) for x in op_latests if x.get("entity_type")=="COMMUNITY"),
                "total_msg_24h":   sum(int(x.get("message_volume_24h") or 0) for x in op_latests if x.get("entity_type")=="COMMUNITY"),
                "abnormal_count":  sum(1 for x in op_latests if is_abn(x)),
                "last_report_at":  max((x.get("updated_at") for x in op_latests), default=None),
            })

        return {
            "user": user,
            "total_followers": total_followers,
            "total_views_7d": total_views,
            "total_members": total_members,
            "total_msg_24h": total_msg,
            "platform_count": len(platforms),
            "abnormal_count": sum(1 for r in latests if is_abn(r)),
            "accounts_total": len(latests),
            "account_total":   len([x for x in latests if x.get("entity_type","ACCOUNT")=="ACCOUNT"]),
            "community_total": len([x for x in latests if x.get("entity_type")=="COMMUNITY"]),
            "platforms": platforms,
            "platform_traffic": [
                {"name": k, "value": v,
                 "color": ({
                     "富途牛牛":"#3B82F6","老虎社区":"#F59E0B","雪球":"#10B981",
                     "微信公众号":"#07C160","小红书":"#EF4444","抖音":"#000000",
                     "X(Twitter)":"#18181B","YouTube":"#FF0000","哔哩哔哩":"#00AEEC",
                     "微博":"#E6162D","知乎":"#0066FF",
                     "Stocktwits":"#00B16A","Reddit":"#FF4500",
                 }).get(k, "#6366f1")}
                for k,v in plat_traffic.items()
            ],
            "latest_records": latests,
            "all_records_count": len(records),
            "trend": trend,
            "operators": operators_list,
            "operator_stats": operator_stats if user["role"]=="admin" else [o for o in operator_stats if o["operator_uid"]==user["operator_uid"]],
            "days": days,
        }

    @app.get("/api/operators")
    async def operators_endpoint(request: Request):
        user = await current_user(request)
        cfg = load_config()
        ops = [o for o in cfg.get("operators", []) if o.get("status") == "active"]
        if user["role"] != "admin":
            ops = [o for o in ops if o["operator_uid"] == user["operator_uid"]]
        return {"total": len(ops), "operators": ops, "as_user": user}

    @app.get("/api/export/csv")
    async def export_csv_ep(request: Request):
        from fastapi.responses import FileResponse
        user = await current_user(request)
        data = load_json(DATA_FILE, {"records": []})
        records = data.get("records", []) if isinstance(data, dict) else data
        records = apply_rbac(records, user["operator_uid"], user["role"])
        export_csv(records)
        if not CSV_FILE.exists(): raise HTTPException(404, "No data")
        return FileResponse(str(CSV_FILE),
                            filename=f"matrix_export_{datetime.now(TZ_CN).strftime('%Y%m%d_%H%M%S')}.csv",
                            media_type="text/csv")

    # iframe 嵌入安全头：允许 (X-Frame-Options 现代浏览器用 CSP frame-ancestors)
    @app.middleware("http")
    async def iframe_header(request: Request, call_next):
        resp = await call_next(request)
        if api_cfg.get("allow_iframe", True):
            resp.headers["Content-Security-Policy"] = "frame-ancestors *"
        return resp

    return app


# ============================================================
# main
# ============================================================
def main():
    args = sys.argv[1:]
    mode = args[0].lower() if args else "run"
    if mode in ("run","collect","once"):
        asyncio.run(run_once())
    elif mode in ("server","api","serve"):
        cfg = load_config().get("api_server", {})
        try:
            import uvicorn
            app = build_api_app()
            host = cfg.get("host","0.0.0.0"); port = int(cfg.get("port",8000))
            console.print(f"[green]✓ Matrix v2 API[/green] → http://{host}:{port}")
            console.print(f"    健康:  http://127.0.0.1:{port}/api/health")
            console.print(f"    上报:  http://127.0.0.1:{port}/api/collect")
            console.print(f"    汇总:  http://127.0.0.1:{port}/api/summary")
            console.print(f"    身份:  http://127.0.0.1:{port}/api/whoami?operator_uid=op_001")
            console.print(f"    绩效:  http://127.0.0.1:{port}/api/operators")
            uvicorn.run(app, host=host, port=port, log_level="warning")
        except ImportError:
            logger.error("缺少 fastapi/uvicorn：pip install -r requirements.txt")
            sys.exit(1)
    elif mode == "export": export_csv()
    elif mode in ("summary","stat","stats"):
        d = load_json(DATA_FILE, {"records":[]})
        recs = d.get("records",[]) if isinstance(d,dict) else d
        console.print(f"记录总数: {len(recs)}")
        rl: List[Record] = []
        for x in latest_per_entity(recs):
            rl.append(Record(
                account=x.get("account",""), platform=x.get("platform",""),
                platform_key=x.get("platform_key",""), target_url=x.get("target_url",""),
                entity_type=x.get("entity_type","ACCOUNT"),
                profile_id=x.get("profile_id",""),
                followers=int(x.get("followers") or 0), likes=int(x.get("likes") or 0),
                views=int(x.get("views") or 0), comments=int(x.get("comments") or 0),
                collect=int(x.get("collect") or 0), engagement_rate=float(x.get("engagement_rate") or 0),
                members=int(x.get("members") or 0), online=int(x.get("online") or 0),
                message_volume_24h=int(x.get("message_volume_24h") or 0),
                sentiment_bull=float(x.get("sentiment_bull") or 0),
                sentiment_bear=float(x.get("sentiment_bear") or 0),
                posts_24h=int(x.get("posts_24h") or 0),
                assigned_operator_uid=x.get("assigned_operator_uid",""),
                assigned_operator_name=x.get("assigned_operator_name",""),
                operator_uid=x.get("operator_uid",""),
                operator_name=x.get("operator_name",""),
                source=x.get("source",""), updated_at=x.get("updated_at", now_iso()),
                timestamp=int(x.get("timestamp") or now_ts()),
                extra=x.get("extra") or {},
            ))
        print_summary(rl)
    else:
        print("用法:\n"
              "  python main_runner.py run       采集一次\n"
              "  python main_runner.py server    启动 FastAPI\n"
              "  python main_runner.py export    data.json → CSV\n"
              "  python main_runner.py summary   控制台汇总")

if __name__ == "__main__":
    main()
