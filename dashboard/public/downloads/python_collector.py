#!/usr/bin/env python3
"""
================================================================================
 Matrix · Python 独立自动化采集脚本 (Playwright)
================================================================================
 支持 3 种浏览器运行模式：
   1. AdsPower  指纹浏览器 Local API → GET /api/v1/browser/start → ws 连接
   2. Hubstudio 指纹浏览器 Local API → 同上（接口协议几乎一致）
   3. Standard Chromium（Playwright 自带浏览器）→ 有头 / 无头 直接打开

 功能：
   · 23 个平台 DOM 自动解析（粉丝 / 作品 / 阅读/点赞/评论 / 发布时间 / URL）
   · 每轮采集结果批量 POST 给后端 /api/collect-data（与 Chrome 插件协议完全一致）
   · 3 分钟 POST /api/heartbeat 机器心跳（插件同款协议）
   · --interval 3600 可常驻轮询

 快速开始：
   # 1. 安装依赖 + 下载 playwright chromium
   pip install playwright httpx click tenacity pyyaml
   playwright install chromium

   # 2. 连接 AdsPower（user_id 从 AdsPower 客户端 → 环境详情 复制）
   python scripts/python_collector.py \
       --mode adspower \
       --user-id k1xxxxx \
       --operator-uid op_001 --operator-name 李运营 \
       --machine-name "李运营 - MBP" \
       --urls "https://creator.xiaohongshu.com,https://x.com/elonmusk,https://xueqiu.com/u/000001"

   # 3. Hubstudio 同理
   python scripts/python_collector.py --mode hubstudio --profile-id xxxxx --urls "..."

   # 4. 本机普通 Chromium（用于测试解析逻辑）
   python scripts/python_collector.py --mode chrome --headless --urls "https://x.com/elonmusk,https://xueqiu.com/S/NVDA"
================================================================================
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import yaml
from tenacity import (AsyncRetrying, retry_if_exception_type, stop_after_attempt,
                      wait_exponential)

try:
    from playwright.async_api import (Browser, BrowserContext, Page, Playwright,
                                       TimeoutError as PwTimeout, async_playwright)
except ImportError:  # pragma: no cover
    print("[ERROR] 请先安装 playwright:  pip install playwright && playwright install chromium")
    sys.exit(1)

APP_VERSION = "2.0.0-py"
COLLECT_VERSION = "2.0.0-py"
DEFAULT_API_BASE = "http://localhost:8000"

PLATFORM_DETECTORS: List[Dict[str, Any]] = [
    dict(key="xiaohongshu",   name="小红书",       re=r"(^|\.)xiaohongshu\.com$",        category="社媒"),
    dict(key="douyin",        name="抖音",         re=r"(^|\.)douyin\.com$",             category="社媒"),
    dict(key="wechat",        name="微信公众号",   re=r"(^|\.)mp\.weixin\.qq\.com$",     category="社媒"),
    dict(key="wechat_video",  name="微信视频号",   re=r"channels\.weixin\.qq\.com",       category="社媒"),
    dict(key="weibo",         name="微博",         re=r"(^|\.)weibo\.(com|cn)$",         category="社媒"),
    dict(key="bilibili",      name="B 站",        re=r"(^|\.)bilibili\.com$",            category="社媒"),
    dict(key="zhihu",         name="知乎",         re=r"(^|\.)zhihu\.com$",              category="社媒"),
    dict(key="tieba",         name="百度贴吧",     re=r"(^|\.)tieba\.baidu\.com$",       category="社区"),
    dict(key="futu",          name="富途牛牛",     re=r"(^|\.)(futu\.moomoo|futunn|moomoo)\.com$", category="金融"),
    dict(key="laohu",         name="老虎社区",     re=r"(^|\.)(laohu8|itiger)\.com$",   category="金融"),
    dict(key="xueqiu",        name="雪球",         re=r"(^|\.)xueqiu\.com$",             category="金融"),
    dict(key="changqiao",     name="长桥",         re=r"(^|\.)(changqiao|longbridge\.sg)\.com$", category="金融"),
    dict(key="x",             name="X(Twitter)",   re=r"(^|\.)(x|twitter)\.com$",        category="海外"),
    dict(key="tiktok",        name="TikTok",       re=r"(^|\.)tiktok\.com$",             category="海外"),
    dict(key="youtube",       name="YouTube",      re=r"(^|\.)youtube\.com$",            category="海外"),
    dict(key="linkedin",      name="LinkedIn",     re=r"(^|\.)linkedin\.com$",           category="海外"),
    dict(key="instagram",     name="Instagram",    re=r"(^|\.)instagram\.com$",          category="海外"),
    dict(key="telegram",      name="Telegram",     re=r"(^|\.)(t|telegram)\.me$",        category="海外"),
    dict(key="discord",       name="Discord",      re=r"(^|\.)discord\.com$",            category="海外"),
    dict(key="stocktwits",    name="Stocktwits",   re=r"(^|\.)stocktwits\.com$",         category="社区"),
    dict(key="reddit",        name="Reddit",       re=r"(^|\.)reddit\.com$",             category="社区"),
    dict(key="seekingalpha",  name="Seeking Alpha",re=r"(^|\.)seekingalpha\.com$",      category="社区"),
]


def now_ms() -> int:
    return int(dt.datetime.now().timestamp() * 1000)


def to_num(s: Any) -> int:
    if s is None: return 0
    if isinstance(s, (int, float)): return int(s)
    t = str(s).strip().replace(",", "")
    import re
    m = re.match(r"([\d.]+)\s*(亿|万|k|m|b)?", t, re.I)
    if not m:
        try: return int(t)
        except: return 0
    n = float(m.group(1))
    u = (m.group(2) or "").lower()
    if u == "亿": return int(n * 1e8)
    if u == "万": return int(n * 1e4)
    if u == "k": return int(n * 1e3)
    if u == "m": return int(n * 1e6)
    if u == "b": return int(n * 1e9)
    return int(n)


def platform_meta(key: str) -> Dict[str, str]:
    for p in PLATFORM_DETECTORS:
        if p["key"] == key: return p
    return dict(key=(key or "other").lower(), name=key or "未知", category="社媒")


def detect_platform(url: str) -> Dict[str, str]:
    from urllib.parse import urlparse
    host = urlparse(url).hostname or ""
    import re
    for p in PLATFORM_DETECTORS:
        if re.search(p["re"], host, re.I): return p
    return dict(key="unknown", name=host or "unknown", category="社媒")


# ---------------------------------------------------------------------------
# 指纹浏览器 Local API 获取 WS Endpoint
# ---------------------------------------------------------------------------

async def adspower_start(user_id: str, local_api: str = "http://local.adspower.net:50325",
                          open_tabs: int = 1, ip_tab: int = 1, launch_args: str = "") -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        params = dict(user_id=user_id, open_tabs=str(open_tabs), ip_tab=str(ip_tab))
        if launch_args: params["launch_args"] = launch_args
        r = await client.get(f"{local_api.rstrip('/')}/api/v1/browser/start", params=params)
        data = r.json()
        if data.get("code") != 0:
            raise RuntimeError(f"AdsPower start failed: {data}")
        ws = data["data"]["ws"]["selenium"]
        return ws


async def hubstudio_start(profile_id: str, local_api: str = "http://local.getbrowser.cc:50325") -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{local_api.rstrip('/')}/api/v1/browser/start",
                             params=dict(profileId=profile_id or ""))
        data = r.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Hubstudio start failed: {data}")
        return data["data"]["ws"]["selenium"]


# ---------------------------------------------------------------------------
# DOM 解析逻辑（在 Playwright page.evaluate 内运行，与 content.js 保持一致）
# ---------------------------------------------------------------------------

EXTRACT_JS = r"""
({host}) => {
  const PLATFORM_DETECTORS = [
    { key:"xiaohongshu",  name:"小红书",    re: /(^|\.)xiaohongshu\.com$/i },
    { key:"douyin",       name:"抖音",      re: /(^|\.)douyin\.com$/i },
    { key:"wechat",       name:"微信公众号",re: /(^|\.)mp\.weixin\.qq\.com$/i },
    { key:"weibo",        name:"微博",      re: /(^|\.)weibo\.(com|cn)$/i },
    { key:"bilibili",     name:"B 站",     re: /(^|\.)bilibili\.com$/i },
    { key:"zhihu",        name:"知乎",      re: /(^|\.)zhihu\.com$/i },
    { key:"tieba",        name:"贴吧",      re: /(^|\.)tieba\.baidu\.com$/i },
    { key:"futu",         name:"富途牛牛",  re: /(^|\.)(futu\.moomoo|futunn|moomoo)\.com$/i },
    { key:"laohu",        name:"老虎社区",  re: /(^|\.)(laohu8|itiger)\.com$/i },
    { key:"xueqiu",       name:"雪球",      re: /(^|\.)xueqiu\.com$/i },
    { key:"x",            name:"X(Twitter)",re: /(^|\.)(x|twitter)\.com$/i },
    { key:"tiktok",       name:"TikTok",    re: /(^|\.)tiktok\.com$/i },
    { key:"youtube",      name:"YouTube",   re: /(^|\.)youtube\.com$/i },
    { key:"linkedin",     name:"LinkedIn",  re: /(^|\.)linkedin\.com$/i },
    { key:"instagram",    name:"Instagram", re: /(^|\.)instagram\.com$/i },
    { key:"telegram",     name:"Telegram",  re: /(^|\.)(t|telegram)\.me$/i },
    { key:"discord",      name:"Discord",   re: /(^|\.)discord\.com$/i },
    { key:"stocktwits",   name:"Stocktwits",re: /(^|\.)stocktwits\.com$/i },
    { key:"reddit",       name:"Reddit",    re: /(^|\.)reddit\.com$/i },
    { key:"seekingalpha", name:"Seeking Alpha", re: /(^|\.)seekingalpha\.com$/i },
  ];
  let plat = { key:"unknown", name:host, category:"社媒" };
  for (const p of PLATFORM_DETECTORS) { if (p.re.test(host)) { plat = p; break; } }

  const toNum = (v) => {
    if (!v) return 0;
    const s = String(v).replace(/,/g,"").trim();
    const m = s.match(/([\d.]+)\s*(亿|万|k|m|b)?/i);
    if (!m) return parseInt(s,10) || 0;
    const n = parseFloat(m[1]); const u = (m[2] || "").toLowerCase();
    if (u === "亿") return Math.round(n * 1e8);
    if (u === "万") return Math.round(n * 1e4);
    if (u === "k") return Math.round(n * 1e3);
    if (u === "m") return Math.round(n * 1e6);
    if (u === "b") return Math.round(n * 1e9);
    return Math.round(n);
  };
  const t = (s) => (s && s.textContent ? s.textContent : "").trim();
  const all = (sel) => Array.from(document.querySelectorAll(sel) || []);
  const firstText = (arr_sel) => {
    for (const s of (Array.isArray(arr_sel)?arr_sel:[arr_sel])) {
      try { for (const n of document.querySelectorAll(s)) { const x = toNum(n.textContent); if (x>0) return x; } } catch {}
    }
    return 0;
  };
  let account = (document.title || host).replace(/[｜|\-—_].*$/,"").trim() || host;
  const accountSels = {
    xiaohongshu: [".username",".user-nickname",".name","h1"],
    douyin: [".author-name",".user-name","h1"],
    wechat: [".rich_media_meta_nickname","#js_name",".profile_nickname"],
    weibo: [".username",".name","h1"],
    bilibili: [".username","#h-name","h1.user-name"],
    zhihu: [".ProfileHeader-name","h1"],
    x: ['[data-testid="User-Name"]','h1','div[data-testid="UserProfileHeader_Items"] + div h2'],
    xueqiu: [".name",".user-name",".screen-name","h1"],
    futu: [".user-name",".nick-name",".name","h1"],
    stocktwits: [".with-header-user-name",".UserHeader__username","h1"],
    reddit: ['[data-testid="top-bar-title"]','h1','.subredditname'],
    youtube: ["#channel-title yt-formatted-string","h1 yt-formatted-string",".ytd-channel-name"],
  };
  for (const s of (accountSels[plat.key] || ["h1"])) { try { const x=t(document.querySelector(s)); if (x && x.length<80) { account=x; break; } } catch {} }

  const followSels = {
    xiaohongshu:[".fans-count",".follower-count","[class*=fans]","[class*=follower]"],
    douyin:[".follow-count","[class*=fans]","[class*=follow] + span"],
    weibo:["table.tb_counter strong + span",".S_line1 strong",".W_f18"],
    bilibili:["#n-fans .n-num",".n-f .n-stat .n-num"],
    zhihu:[".NumberBoard-itemValue",".FollowStatus + strong"],
    x:['a[href$=followers] span span:first-child','a[href$="/followers"] span'],
    xueqiu:[".fans_count","a[href$=followers]",".follow-count"],
    futu:[".fans-count",".follow-count","[class*=fans]"],
    stocktwits:[".UserHeader__watchers",".with-header-subtitle","span:contains('Watchers')"],
    reddit:['[data-testid=subscribers-id]','div:contains("members")'],
    youtube:["#subscriber-count yt-formatted-string"],
  };
  let followers = firstText(followSels[plat.key] || []);
  if (!followers) { const m = (document.body.innerText||"").match(/(粉丝|关注者|订阅者|followers|fans|subscribers|成员)[^\d]{0,8}([\d,.]+)\s*(亿|万|k|m|b)?/i); if (m) followers = toNum(m[2] + (m[3]||"")); }

  const postRules = {
    xiaohongshu: {list:".note-item, .feeds-container .note, a[href^='/explore/']", title:".title, .content, h3, p", views:".view, .count", likes:".like-wrapper .count, .like", comments:".comment, .icon-comment + span", url:"a[href]", date:".date, .time"},
    douyin: {list:'li[data-e2e="user-post-item-list-item"], div[class*="video-card"], a[href^="/video/"]', title:'div[data-e2e="user-post-item-desc"]', views:'div[data-e2e="user-post-item-play-count"], .play-count', likes:'div[data-e2e="user-post-item-digg"], .digg-count', comments:".comment-count", url:"a[href]", date:".time"},
    x: {list:'article[data-testid="tweet"], div[data-testid="cellInnerDiv"]', title:'div[data-testid="tweetText"]', views:'div[aria-label*=views], a[href$=analytics] span', likes:'button[data-testid="like"] div, div[data-testid="like"] span', comments:'button[data-testid="reply"] div, div[data-testid="reply"] span', url:'a[href*=status]', date:"time"},
    weibo: {list:".WB_cardwrap[class*=S_bg2]", title:".WB_text, .content", views:".WB_from a", likes:".WB_feed_handle .pos span:nth-child(3) em", comments:".WB_feed_handle .pos span:nth-child(2) em", url:".WB_from a[href]", date:".WB_from a"},
    bilibili:{list:".small-item, .video-list-item, li.small-item", title:".title, .info .title", views:".so-icon, .play", likes:".like, .fav", comments:".comment, .danmaku", url:"a[href]", date:".time"},
    xueqiu:  {list:".status-list .status, article, .AnonymousHome_home__timeline-item", title:".status-title, .status-content", views:".status-source, .retweet", likes:".like-count, .iconfont.icon-like + span", comments:".reply-count, .iconfont.icon-comment + span", url:'a[href^="/status/"]', date:".status-source a, time"},
    futu:    {list:".momo-post, .article-item, .feed-item", title:".title, .content", views:".read-count, .view-count", likes:".like-count, .digg-count", comments:".comment-count", url:"a[href]", date:".time"},
    youtube: {list:"#contents ytd-grid-video-renderer, ytd-rich-grid-media", title:"#video-title yt-formatted-string", views:"#metadata-line yt-formatted-string:nth-child(1)", likes:"", comments:"", url:"#video-title", date:"#metadata-line yt-formatted-string:nth-child(2)"},
    stocktwits:{list:"article.message, .stream-item", title:".Message_content", views:".views", likes:".like-count, .like-btn span", comments:".reply-count", url:'a[href*=messages/]', date:"time"},
    reddit:  {list:'div[data-testid="post-container"], .Post', title:"h3", views:'[data-testid="vote-arrows"] + div', likes:'[data-testid="vote-arrows"]', comments:'[data-testid="comments-count"]', url:'a[data-testid="comments-page-link"]', date:"time"},
    zhihu:   {list:".ContentItem, .List-item, article", title:".ContentItem-title, h2", views:"", likes:".VoteButton--up .count", comments:".ContentItem-actions .Button--plain:contains('评论')", url:'a[href*=answer], a[href*=p/]', date:".ContentItem-time"},
  };
  const posts = [];
  const r = postRules[plat.key] || null;
  if (r) {
    try {
      const nodes = Array.from(document.querySelectorAll(r.list) || []).slice(0,12);
      for (const n of nodes) {
        const title = ((r.title ? t(n.querySelector(r.title)) : "") || (n.querySelector("img") && n.querySelector("img").alt || "")).replace(/\s+/g," ").trim().slice(0,200);
        if (!title) continue;
        let views = r.views ? toNum(t(n.querySelector(r.views))) : 0;
        if (!views) { const mm = (n.textContent || "").match(/(阅读|播放|views?|播放量)[^\d]{0,6}([\d,.]+\s*[亿万km]?)/i); if (mm) views = toNum(mm[2]); }
        const likes = r.likes ? toNum(t(n.querySelector(r.likes))) : 0;
        const comments = r.comments ? toNum(t(n.querySelector(r.comments))) : 0;
        let href = "";
        if (r.url) { const a = n.querySelector(r.url); if (a) href = a.getAttribute("href") || ""; }
        if (href && !/^https?:/i.test(href)) href = new URL(href, location.href).href;
        if (!href) href = location.href;
        const dateTxt = r.date ? t(n.querySelector(r.date)) : "";
        posts.push({id: `p_${Date.now().toString(36)}_${Math.floor(Math.random()*1e6).toString(36)}`, title, views, likes, comments, shares:0, collect:0, engagement_rate: views>0 ? +(((likes+comments)/views)*100).toFixed(2) : 0, url: href, published_at: dateTxt, platform: plat.name, platform_key: plat.key});
      }
    } catch {}
  }
  posts.sort((a,b) => {
    const pa = new Date(a.published_at || 0).getTime() || 0;
    const pb = new Date(b.published_at || 0).getTime() || 0;
    return pb - pa;
  });

  let members = 0;
  if (["COMMUNITY"].includes("ACCOUNT") || plat.key === "stocktwits" || plat.key === "reddit" || plat.key === "telegram" || plat.key === "tieba") {
    const sel = plat.key==="reddit" ? '[data-testid="subscribers-id"], div:contains("members")'
              : plat.key==="stocktwits" ? '.UserHeader__watchers'
              : plat.key==="telegram" ? '.tgme_page_extra, .members-count'
              : plat.key==="tieba" ? '.tbui_total_num'
              : "";
    let max = 0;
    if (sel) { for (const n of document.querySelectorAll(sel)) { const v = toNum(n.textContent); if (v>max) max = v; } }
    members = max || followers;
  }

  const views = posts.reduce((s,p) => s + (p.views||0), 0);
  const likes = posts.reduce((s,p) => s + (p.likes||0), 0);
  const comments = posts.reduce((s,p) => s + (p.comments||0), 0);
  return { platform:plat.name, platform_key:plat.key, platform_category:plat.category, account, followers, posts, views, likes, comments, members, latest_post: posts[0] || null, page_title: document.title };
}
"""


# ---------------------------------------------------------------------------
# HTTP 上报
# ---------------------------------------------------------------------------

@dataclass
class CollectorConfig:
    api_base: str = DEFAULT_API_BASE
    operator_uid: str = "op_001"
    operator_name: str = "李运营"
    machine_id: str = ""
    machine_name: str = "Python Collector"
    webhook_url: str = ""


async def post_heartbeat(cfg: CollectorConfig, pending_count: int = 0) -> Dict[str, Any]:
    body = dict(
        machine_id=cfg.machine_id,
        machine_name=cfg.machine_name,
        operator_uid=cfg.operator_uid,
        operator_name=cfg.operator_name,
        version=COLLECT_VERSION,
        source="python_collector",
        pending_count=pending_count,
        last_collect_at=0,
        user_agent=f"python-collector/{APP_VERSION}",
        timestamp_ms=now_ms(),
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(f"{cfg.api_base.rstrip('/')}/api/heartbeat", json=body)
            return dict(status=r.status_code, body=r.json())
    except Exception as e:
        return dict(status=0, error=str(e)[:300])


async def post_batch(cfg: CollectorConfig, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not items:
        return dict(status=0, accepted=0, note="empty_items")
    body = dict(
        machine_id=cfg.machine_id,
        machine_name=cfg.machine_name,
        operator_uid=cfg.operator_uid,
        operator_name=cfg.operator_name,
        version=COLLECT_VERSION,
        source="python_collector",
        webhook_url=cfg.webhook_url or None,
        count=len(items),
        timestamp_ms=now_ms(),
        items=items,
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{cfg.api_base.rstrip('/')}/api/collect-data", json=body)
            return dict(status=r.status_code, body=r.json())
    except Exception as e:
        return dict(status=0, error=str(e)[:500])


# ---------------------------------------------------------------------------
# Playwright 采集核心
# ---------------------------------------------------------------------------

async def collect_url(page: Page, url: str, cfg: CollectorConfig) -> Optional[Dict[str, Any]]:
    try:
        async for attempt in AsyncRetrying(
            reraise=True,
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=6),
            retry=retry_if_exception_type((PwTimeout, httpx.HTTPError, TimeoutError)),
        ):
            with attempt:
                await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=10_000)
                except PwTimeout:
                    pass
                try:
                    await page.mouse.wheel(0, 2000)
                    await asyncio.sleep(1.2)
                except Exception:
                    pass
    except Exception as e:
        print(f"[WARN] goto 失败，跳过 {url}: {e}")
        return None

    try:
        host = page.url
        data = await page.evaluate(EXTRACT_JS, dict(host=host))
    except Exception as e:
        print(f"[WARN] evaluate 失败 {url}: {e}")
        return None

    plat = detect_platform(page.url) or detect_platform(url)
    entity_type = "COMMUNITY" if plat["key"] in {"stocktwits", "reddit", "tieba", "telegram", "discord"} else "ACCOUNT"
    msg24h = len(data.get("posts") or [])
    views = int(data.get("views") or 0)
    likes = int(data.get("likes") or 0)
    comments = int(data.get("comments") or 0)
    eng = float(f"{( (likes + comments) / views * 100 ):.2f}") if views > 0 else 0.0
    latest = data.get("latest_post") or None
    rec_id = f"py_{hashlib.md5((plat['key'] + '|' + data.get('account','') + '|' + entity_type).encode()).hexdigest()[:10]}_{now_ms()}"
    return dict(
        id=rec_id,
        platform=data.get("platform") or plat["name"],
        platform_key=data.get("platform_key") or plat["key"],
        platform_category=data.get("platform_category") or plat["category"],
        entity_type=entity_type,
        account=data.get("account") or f"{plat['name']}-页面",
        target_url=page.url,
        followers=int(data.get("followers") or 0),
        views=views,
        likes=likes,
        comments=comments,
        members=int(data.get("members") or 0),
        message_volume_24h=msg24h,
        posts_24h=msg24h,
        engagement_rate=eng,
        symbol=None,
        subreddit=None,
        latest_post=latest,
        posts=data.get("posts") or [],
        source="python_collector",
        operator_uid=cfg.operator_uid,
        operator_name=cfg.operator_name,
        machine_id=cfg.machine_id,
        machine_name=cfg.machine_name,
        client_version=COLLECT_VERSION,
        timestamp_ms=now_ms(),
        collected_at=dt.datetime.now().isoformat(timespec="seconds"),
        page_title=data.get("page_title") or "",
    )


async def run_once(cfg: CollectorConfig, urls: List[str], mode: str, *,
                   user_id: Optional[str], profile_id: Optional[str],
                   headless: bool, adspower_api: str, hubstudio_api: str) -> List[Dict[str, Any]]:
    async with async_playwright() as pw:
        browser: Optional[Browser] = None
        context: Optional[BrowserContext] = None
        page: Optional[Page] = None
        try:
            if mode == "adspower":
                ws = await adspower_start(user_id=user_id or "", local_api=adspower_api)
                browser = await pw.chromium.connect_over_cdp(ws)
                ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
                page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            elif mode == "hubstudio":
                ws = await hubstudio_start(profile_id=profile_id or "", local_api=hubstudio_api)
                browser = await pw.chromium.connect_over_cdp(ws)
                ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
                page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            elif mode == "chrome":
                browser = await pw.chromium.launch(headless=headless)
                ctx = await browser.new_context(
                    viewport=dict(width=1440, height=900),
                    user_agent=f"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 MatrixPythonCollector/{APP_VERSION}",
                )
                page = await ctx.new_page()
            else:
                raise ValueError(f"未知 mode: {mode}")

            items: List[Dict[str, Any]] = []
            for idx, url in enumerate(urls, 1):
                if not url.strip(): continue
                print(f"  [{idx}/{len(urls)}] 采集 → {url[:80]}")
                item = await collect_url(page, url.strip(), cfg)
                if item:
                    items.append(item)
                    acc = item.get("account")
                    plat = item.get("platform")
                    f = item.get("followers") or item.get("members") or 0
                    posts = item.get("posts") or []
                    print(f"       OK  {plat} | {acc}  粉丝/成员 {f:,}  抓作品 {len(posts)} 条")
                else:
                    print(f"       SKIP 无数据")
                if idx < len(urls):
                    await asyncio.sleep(2.5)

            if items:
                res = await post_batch(cfg, items)
                print(f"[INFO] 批量上报 {len(items)} 条 → HTTP {res.get('status')}")
                if res.get("status") not in (200, 201):
                    print(f"       响应：{res}")
                else:
                    print(f"       后端接受 accepted={res.get('body',{}).get('accepted')}  爆款={res.get('body',{}).get('viral_events')}")
            return items
        finally:
            try:
                if browser and mode in {"chrome"}:
                    await browser.close()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def load_config(path: str) -> Dict[str, Any]:
    p = Path(path)
    if not p.exists():
        return {}
    if p.suffix in {".yaml", ".yml"}:
        return yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    if p.suffix in {".json"}:
        return json.loads(p.read_text(encoding="utf-8"))
    raise ValueError(f"不支持的配置文件格式: {p.suffix}")


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Matrix · Python 独立自动化采集脚本 (Playwright)")
    ap.add_argument("--mode", choices=["adspower", "hubstudio", "chrome"], required=True,
                    help="运行模式：adspower 指纹浏览器 / hubstudio 指纹浏览器 / chrome 本地 Chromium")
    ap.add_argument("--user-id", default=os.environ.get("ADSPOWER_USER_ID"),
                    help="[adspower] 环境 user_id（AdsPower 客户端 → 环境详情复制）")
    ap.add_argument("--profile-id", default=os.environ.get("HUBSTUDIO_PROFILE_ID"),
                    help="[hubstudio] 环境 profileId（Hubstudio 客户端 → 环境详情）")
    ap.add_argument("--urls", default="", help="要采集的 URL 列表（逗号分隔），如 'https://x.com/a,https://x.com/b'")
    ap.add_argument("--config", default="", help="配置文件路径 (YAML / JSON)，字段见 README")
    ap.add_argument("--api-base", default=os.environ.get("MATRIX_API_BASE", DEFAULT_API_BASE),
                    help=f"后端 API 地址，默认 {DEFAULT_API_BASE}")
    ap.add_argument("--operator-uid", default=os.environ.get("MATRIX_OP_UID", "op_001"))
    ap.add_argument("--operator-name", default=os.environ.get("MATRIX_OP_NAME", "李运营"))
    ap.add_argument("--machine-name", default=os.environ.get("MATRIX_MACHINE_NAME", "Python Collector"))
    ap.add_argument("--machine-id", default=os.environ.get("MATRIX_MACHINE_ID", ""),
                    help="机器 ID，不传则用 host+operator 自动生成一个稳定 ID")
    ap.add_argument("--webhook-url", default=os.environ.get("MATRIX_WEBHOOK", ""),
                    help="可选：爆款告警 Webhook（飞书/钉钉/Slack）")
    ap.add_argument("--headless", action="store_true", help="仅在 mode=chrome 生效：启用无头模式")
    ap.add_argument("--interval", type=int, default=0,
                    help="轮询秒数，>0 时常驻循环（推荐 3600 = 每小时一轮）")
    ap.add_argument("--adspower-api", default=os.environ.get("ADSPOWER_LOCAL_API", "http://local.adspower.net:50325"),
                    help="AdsPower Local API 地址")
    ap.add_argument("--hubstudio-api", default=os.environ.get("HUBSTUDIO_LOCAL_API", "http://local.getbrowser.cc:50325"),
                    help="Hubstudio Local API 地址")
    return ap.parse_args()


async def main() -> int:
    args = parse_args()
    file_cfg = load_config(args.config) if args.config else {}
    urls: List[str] = []
    if args.urls:
        urls = [u for u in args.urls.split(",") if u.strip()]
    elif "urls" in file_cfg:
        urls = list(file_cfg["urls"])
    if not urls:
        print("[ERROR] 请传入 --urls 或 配置文件里配置 urls 列表")
        return 2

    if args.mode == "adspower" and not args.user_id and not file_cfg.get("user_id"):
        print("[ERROR] adspower 模式需要 --user-id 或配置 user_id")
        return 2
    if args.mode == "hubstudio" and not args.profile_id and not file_cfg.get("profile_id"):
        print("[ERROR] hubstudio 模式需要 --profile-id 或配置 profile_id")
        return 2

    mid = args.machine_id or file_cfg.get("machine_id") or hashlib.md5(
        f"{args.machine_name}|{args.operator_uid}|py_collector".encode()
    ).hexdigest()[:14]
    cfg = CollectorConfig(
        api_base=args.api_base or file_cfg.get("api_base", DEFAULT_API_BASE),
        operator_uid=args.operator_uid or file_cfg.get("operator_uid", "op_001"),
        operator_name=args.operator_name or file_cfg.get("operator_name", "李运营"),
        machine_id=mid,
        machine_name=args.machine_name or file_cfg.get("machine_name", "Python Collector"),
        webhook_url=args.webhook_url or file_cfg.get("webhook_url", ""),
    )
    user_id = args.user_id or file_cfg.get("user_id")
    profile_id = args.profile_id or file_cfg.get("profile_id")

    print("=" * 80)
    print(f"  Matrix Python Collector  v{APP_VERSION}")
    print(f"  mode            : {args.mode}")
    print(f"  api_base        : {cfg.api_base}")
    print(f"  operator        : {cfg.operator_name} ({cfg.operator_uid})")
    print(f"  machine         : {cfg.machine_name}  id={cfg.machine_id}")
    print(f"  targets         : {len(urls)} 个 URL")
    if args.interval: print(f"  interval        : 每 {args.interval}s 常驻轮询")
    print("=" * 80)

    interval = max(int(args.interval), 0)
    round_no = 0
    hb_task: Optional[asyncio.Task] = None
    stop = asyncio.Event()

    async def heartbeat_loop():
        while not stop.is_set():
            try:
                r = await post_heartbeat(cfg, pending_count=0)
                print(f"[HEARTBEAT] → {r}")
            except Exception as e:
                print(f"[HEARTBEAT] 失败: {e}")
            for _ in range(180):  # 3 min
                if stop.is_set(): return
                await asyncio.sleep(1)

    if interval:
        hb_task = asyncio.create_task(heartbeat_loop())
    else:
        print("[HEARTBEAT] 单轮模式，先发送一次心跳...")
        await post_heartbeat(cfg)

    try:
        while True:
            round_no += 1
            t0 = time.time()
            print(f"\n======== 第 {round_no} 轮采集开始 @ {dt.datetime.now().isoformat(timespec='seconds')} ========")
            await run_once(cfg, urls, args.mode,
                           user_id=user_id, profile_id=profile_id,
                           headless=args.headless,
                           adspower_api=args.adspower_api,
                           hubstudio_api=args.hubstudio_api)
            if not interval:
                break
            remain = interval - (time.time() - t0)
            if remain > 0:
                print(f"[SLEEP] {remain:.0f}s 后进入下一轮（Ctrl+C 退出）")
                try:
                    await asyncio.sleep(remain)
                except asyncio.CancelledError:
                    break
    except KeyboardInterrupt:
        print("\n[INFO] 收到 Ctrl+C，准备退出...")
    finally:
        stop.set()
        if hb_task and not hb_task.done():
            hb_task.cancel()
            try: await hb_task
            except (asyncio.CancelledError, Exception): pass
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("\nBye.")
        sys.exit(130)
