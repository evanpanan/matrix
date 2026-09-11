import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

import { motion, AnimatePresence } from 'framer-motion';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';

import {
  Users, Eye, LayoutGrid, AlertTriangle, Filter, Download, RefreshCw,
  TrendingUp, TrendingDown, ChevronDown, ExternalLink, Activity, Search,
  BarChart3, Shield, UserCog, MessageSquare, Users2, MonitorDot, Globe2,
  Server, Flame, Clock, X, Layers, Heart, MessageCircle, Repeat2, ArrowUpRight, Building2,
  Sparkles, Copy, Cpu, AlertOctagon, BellRing, User,
} from 'lucide-react';

import {
  fetchSummary, fetchWhoami, exportCSV, exportCSVFromData, PLATFORM_META, OPERATORS, setJwtToken, clearSession, sanitizeUrl,
} from './lib/api.js';
import AccountDetailDrawer from './AccountDetailDrawer.jsx';
import PlatformDetailModal from './PlatformDetailModal.jsx';
import ViralPostToast from './ViralPostToast.jsx';
import AISummaryModal from './AISummaryModal.jsx';
import CollectorHealthModal from './CollectorHealthModal.jsx';
import DiagnosisDetailModal from './DiagnosisDetailModal.jsx';
import { generateWeeklyReportMarkdown } from './lib/mockData.js';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const VIRAL_TOAST_AUTO_DISMISS_MS = 45000;
const VIRAL_HISTORY_MAX = 20;

function formatShort(n) {
  if (n == null) return '—';
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return new Intl.NumberFormat('zh-CN').format(Math.round(n));
}

function timeFromNow(iso) {
  if (!iso) return '—';
  return dayjs(iso).fromNow();
}

function fmtPercent(n, digits = 1) {
  if (n == null || isNaN(n)) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

const FADE_UP = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
};

function AnimatedNumber({ value, format = v => v, duration = 1.1, digits = 2, flash = false }) {
  const [display, setDisplay] = useState(0);
  const [doFlash, setDoFlash] = useState(false);
  const lastValueRef = useRef(null);
  const rafRef = useRef(0);
  const flashTimerRef = useRef(0);
  useEffect(() => {
    if (lastValueRef.current !== null && value !== lastValueRef.current) setDoFlash(true);
    const start = performance.now();
    const from = lastValueRef.current != null && typeof lastValueRef.current === 'number' ? Number(lastValueRef.current) : 0;
    const to = Number(value) || 0;
    cancelAnimationFrame(rafRef.current);
    clearTimeout(flashTimerRef.current);
    function tick(now) {
      const elapsed = now - start;
      if (elapsed <= 0) { rafRef.current = requestAnimationFrame(tick); return; }
      const p = Math.min(1, elapsed / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (p >= 1) {
        lastValueRef.current = to;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    flashTimerRef.current = setTimeout(() => setDoFlash(false), 1200);
    return () => { cancelAnimationFrame(rafRef.current); clearTimeout(flashTimerRef.current); };
  }, [value, duration, digits]);
  const formatted = format(display);
  if (flash && doFlash) {
    return (
      <motion.span
        animate={{ color: ['#059669', '#18181b'] }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="inline-block"
      >{formatted}</motion.span>
    );
  }
  return formatted;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  const ks = new Set([...ak, ...bk]);
  for (const k of ks) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

function aggregateTrend(rawTrend, granularity) {
  if (!rawTrend || !rawTrend.length || granularity === 'day') return rawTrend;
  const groups = new Map();
  rawTrend.forEach((row, i) => {
    let label;
    if (granularity === 'week') {
      const weekSeq = Math.floor(i / 7) + 1;
      const mMatch = /^(\d{1,2})[\-\/]/.exec(String(row.date || ''));
      const month = mMatch ? mMatch[1] : '1';
      label = `${month}月 W${weekSeq}`;
    } else {
      const mMatch = /^(\d{1,2})[\-\/]/.exec(String(row.date || ''));
      label = mMatch ? `2026-${String(mMatch[1]).padStart(2, '0')}` : `2026-01`;
    }
    const base = groups.get(label) || Object.fromEntries(
      Object.keys(row).filter(k => k !== 'date').map(k => [k, 0])
    );
    Object.keys(row).forEach((k) => {
      if (k !== 'date') base[k] = (Number(base[k]) || 0) + (Number(row[k]) || 0);
    });
    groups.set(label, base);
  });
  return Array.from(groups.entries()).map(([label, rest]) => ({ date: label, ...rest }));
}

function GranularityChip({ value, onChange, compact = false }) {
  const items = [
    { key: 'day',   label: '日' },
    { key: 'week',  label: '周' },
    { key: 'month', label: '月' },
  ];
  return (
    <div className="inline-flex items-center p-0.5 rounded-xl bg-ink-50/60 border border-black/[0.04] shadow-sm">
      {items.map(it => {
        const active = value === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`inline-flex items-center justify-center rounded-lg font-semibold transition whitespace-nowrap ${
              compact ? 'h-7 px-2 text-[10.5px] sm:text-[11.5px]' : 'h-8 px-3 text-[11.5px]'
            } ${
              active
                ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm'
                : 'text-ink-500 hover:text-ink-800 hover:bg-white'
            }`}
          >{it.label}</button>
        );
      })}
    </div>
  );
}

function useRealtimeTicker(data, setData, enabled, setFlashRecords, setFlashIds) {
  useEffect(() => {
    if (!enabled || !data?.latestRecords || !data.latestRecords.length) return;
    let cancelled = false;
    const timerRef = { current: 0 };
    function schedule() {
      if (cancelled) return;
      const delay = 15000 + Math.random() * 10000;
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        setData(prev => {
          if (!prev?.latestRecords || !prev.latestRecords.length) return prev;
          const recordCount = Math.random() > 0.4 ? 2 : 1;
          const indices = new Set();
          const pool = prev.latestRecords.length;
          let tries = 0;
          while (indices.size < recordCount && tries < 20) {
            indices.add(Math.floor(Math.random() * pool));
            tries += 1;
          }
          const newRecords = prev.latestRecords.slice();
          const newFlashRecords = new Set();
          const newFlashPosts = new Set();
          let actuallyChanged = false;
          indices.forEach(idx => {
            const original = newRecords[idx];
            const r = { ...original };
            const fieldPick = Math.random();
            if (r.entity_type === 'COMMUNITY') {
              if (fieldPick < 0.45) {
                const delta = Math.floor(10 + Math.random() * 140);
                r.online = (r.online || 0) + delta;
                r.message_volume_24h = (r.message_volume_24h || r.posts_24h || 0) + Math.floor(delta / 5);
              } else if (fieldPick < 0.8) {
                const delta = Math.floor(20 + Math.random() * 800);
                r.members = (r.members || 0) + delta;
                r.online_ratio = r.members > 0 ? (r.online || 0) / r.members : 0;
              } else {
                r.posts_24h = (r.posts_24h || 0) + (Math.random() > 0.5 ? 1 : 0);
              }
            } else {
              if (fieldPick < 0.45) {
                const delta = Math.floor(12 + Math.random() * 150);
                r.views = (r.views || 0) + delta;
              } else if (fieldPick < 0.8) {
                const delta = Math.floor(1 + Math.random() * 25);
                r.likes = (r.likes || 0) + delta;
              } else {
                const delta = Math.floor(10 + Math.random() * 200);
                r.followers = (r.followers || 0) + delta;
              }
              if (r.posts && r.posts.length > 0) {
                const postIdx = Math.floor(Math.random() * Math.min(3, r.posts.length));
                const rp = { ...r.posts[postIdx] };
                const postDelta = Math.floor(5 + Math.random() * 120);
                rp.views = (rp.views || 0) + postDelta;
                if (Math.random() > 0.5) rp.likes = (rp.likes || 0) + Math.floor(1 + Math.random() * 15);
                rp.engagement_rate = rp.views > 0 ? Math.max(0.05, (((rp.likes || 0) + (rp.comments || 0) + (rp.shares || 0)) / rp.views) * 100) : rp.engagement_rate;
                const np = r.posts.slice();
                np[postIdx] = rp;
                r.posts = np;
                if (rp.id) newFlashPosts.add(rp.id);
              }
            }
            if (!deepEqual(r, original)) {
              actuallyChanged = true;
              newRecords[idx] = r;
              newFlashRecords.add(r.account);
            }
          });
          if (!actuallyChanged) return prev;
          if (setFlashRecords && newFlashRecords.size > 0) setFlashRecords(newFlashRecords);
          if (setFlashIds && newFlashPosts.size > 0) setFlashIds(newFlashPosts);
          return { ...prev, latestRecords: newRecords };
        });
        schedule();
      }, delay);
    }
    schedule();
    return () => { cancelled = true; clearTimeout(timerRef.current); };
  }, [enabled, data?.latestRecords?.length, setData, setFlashRecords, setFlashIds]);
}

function Skeleton({ className = '', w, h }) {
  return <div className={`animate-pulse rounded-lg bg-ink-100 ${className}`} style={{ width: w, height: h }} />;
}

function StatCard({ icon: Icon, label, value, sub, accent, trend, trendDown, animated = true, flash = false }) {
  const gradient = {
    indigo: 'from-indigo-500/15 to-violet-500/5 text-indigo-600',
    sky: 'from-sky-500/15 to-cyan-500/5 text-sky-600',
    emerald: 'from-emerald-500/15 to-teal-500/5 text-emerald-600',
    amber: 'from-amber-500/15 to-orange-500/5 text-amber-600',
    rose: 'from-rose-500/15 to-pink-500/5 text-rose-600',
    violet: 'from-violet-500/15 to-fuchsia-500/5 text-violet-600',
  }[accent] || 'from-slate-500/15 to-slate-500/5 text-slate-600';
  const trendColor = trendDown ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50';
  const TrendIcon = trendDown ? TrendingDown : TrendingUp;
  const numericValue = typeof value === 'number' ? value : null;
  return (
    <motion.div
      variants={FADE_UP}
      initial="hidden"
      animate={flash
        ? {
            boxShadow: ['0 1px 2px rgba(0,0,0,0.05)', '0 0 0 3px rgba(34,197,94,0.15)', '0 1px 2px rgba(0,0,0,0.05)'],
          }
        : 'show'}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      className="bg-white rounded-2xl border border-black/[0.04] shadow-card p-6 flex flex-col gap-4 relative overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
          <Icon size={21} strokeWidth={2.2} />
        </div>
        {trend && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${trendColor}`}
          >
            <TrendIcon size={12} />
            {trend}
          </motion.div>
        )}
      </div>
      <div>
        <div className="text-[13px] text-ink-500 font-medium mb-1.5">{label}</div>
        <motion.div
          animate={flash ? { backgroundColor: ['rgba(34,197,94,0)', 'rgba(34,197,94,0.10)', 'rgba(34,197,94,0)'] } : {}}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="text-[28px] font-semibold tracking-tight text-ink-900 leading-none tabular-nums rounded-xl -mx-2 px-2 py-0.5 inline-flex"
        >
          {animated && numericValue !== null ? (
            <AnimatedNumber value={numericValue} format={v => {
              const n = Math.round(v); return formatShort(n);
            }} flash={flash} />
          ) : value}
        </motion.div>
        {sub && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-2 text-xs text-ink-500">{sub}</motion.div>}
      </div>
      <div className={`absolute -bottom-24 -right-24 w-40 h-40 rounded-full opacity-20 blur-3xl bg-gradient-to-br ${gradient} pointer-events-none`} />
    </motion.div>
  );
}

function PlatformTag({ name, size = 'md' }) {
  const meta = PLATFORM_META[name] || PLATFORM_META[name?.replace(/\s*\(.*\)/, '')];
  const color = meta?.color || '#6366f1';
  const sz = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sz}`}
      style={{ background: `${color}12`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

function Avatar({ gradient, name, size = 40 }) {
  const [a, b] = (gradient || '#6366f1,#8b5cf6').split(',');
  return (
    <div
      className="rounded-2xl flex items-center justify-center text-white text-sm font-semibold shadow-inner shrink-0"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: `linear-gradient(135deg, ${a}, ${b})`, letterSpacing: '0.02em',
      }}
    >
      {name ? name.slice(0, 1) : '?'}
    </div>
  );
}

function UserAvatar({ name, size = 36 }) {
  const gradients = [
    ['#6366f1', '#8b5cf6'], ['#0ea5e9', '#22d3ee'], ['#f59e0b', '#ef4444'],
    ['#10b981', '#14b8a6'], ['#ec4899', '#f43f5e'], ['#4263EB', '#3b82f6'],
  ];
  const idx = [...(name || 'x')].reduce((s, c) => s + c.charCodeAt(0), 0) % gradients.length;
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${gradients[idx][0]}, ${gradients[idx][1]})`,
      }}
      title={name}
    >
      {name ? name.slice(0, 1) : '?'}
    </div>
  );
}

function SelectChip({ value, options, onChange, placeholder = '筛选', icon: Icon }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.key === value) || options[0];
  return (
    <div className="relative">
      <button
      onClick={() => setOpen(v => !v)}
      className="h-10 px-3.5 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50/60 transition flex items-center gap-2 text-sm font-medium text-ink-700 shadow-sm"
    >
      {Icon ? <Icon size={15} className="text-ink-500" /> : <Filter size={15} className="text-ink-500" />}
      {current?.name || placeholder}
      <ChevronDown size={14} className={`text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
    </button>
      <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-10" onClick={() => setOpen(false)}
          />
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 mt-2 z-20 min-w-[180px] bg-white rounded-2xl border border-black/[0.06] shadow-card py-1.5 overflow-hidden"
          >
            {options.map(o => (
              <button
                key={o.key}
                onClick={() => { onChange(o.key); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm transition hover:bg-ink-50 ${o.key === value ? 'text-ink-900 font-semibold' : 'text-ink-600'}`}
              >
                {o.name}
              </button>
            ))}
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
}

function RoleBadge({ role }) {
  const map = {
    admin: { text: '管理员', cls: 'bg-violet-50 text-violet-700', Icon: Shield },
    operator: { text: '运营', cls: 'bg-sky-50 text-sky-700', Icon: UserCog },
    viewer: { text: '访客', cls: 'bg-ink-100 text-ink-600', Icon: Users2 },
  };
  const cfg = map[role] || map.viewer;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
      <cfg.Icon size={11} />
      {cfg.text}
    </span>
  );
}

function UserSwitcher({ value, users, onChange }) {
  const [open, setOpen] = useState(false);
  const current = users.find(u => u.operator_uid === value) || users[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="h-9 sm:h-9 max-sm:h-11 pl-1.5 pr-3 max-sm:pr-2 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50/60 transition flex items-center gap-2.5 text-sm font-medium text-ink-700 shadow-sm"
      >
        <UserAvatar name={current?.operator_name} size={28} />
        <div className="text-left leading-tight max-sm:hidden">
          <div className="text-[13px] font-semibold text-ink-800">{current?.operator_name}</div>
          <div className="text-[10.5px] text-ink-400 mt-0.5">当前登录人</div>
        </div>
        <ChevronDown size={14} className={`text-ink-400 transition ${open ? 'rotate-180' : ''} max-sm:hidden`} />
      </button>
      <AnimatePresence>
        {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-10" onClick={() => setOpen(false)}
          />
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 max-sm:right-0 mt-2 z-20 w-[300px] max-sm:w-[min(280px,92vw)] bg-white rounded-2xl border border-black/[0.06] shadow-card overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-black/[0.04] bg-ink-50/40">
              <div className="text-[11.5px] font-semibold text-ink-500 uppercase tracking-wider">切换身份（RBAC 测试）</div>
            </div>
            <div className="py-1">
              {users.map(u => (
                <button
                  key={u.operator_uid}
                  onClick={() => { onChange(u.operator_uid); setOpen(false); }}
                  className={`w-full px-3 py-2.5 flex items-center gap-3 transition hover:bg-ink-50 ${u.operator_uid === value ? 'bg-indigo-50/60' : ''}`}
                >
                  <UserAvatar name={u.operator_name} size={34} />
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink-800 text-[13.5px] truncate">{u.operator_name}</span>
                      <RoleBadge role={u.role} />
                    </div>
                    <div className="text-[11.5px] text-ink-400 mt-0.5 font-mono truncate">{u.operator_uid}</div>
                  </div>
                  {u.operator_uid === value && <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
                </button>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-black/[0.04] bg-ink-50/30">
              <button
                onClick={() => {
                  const t = prompt('粘贴内部主系统 JWT Token（HS256，需含 sub/name/role）');
                  if (t) { setJwtToken(t); setOpen(false); location.reload(); }
                }}
                className="w-full h-9 rounded-lg text-[12px] font-medium text-ink-600 hover:bg-white hover:text-indigo-700 transition border border-dashed border-black/[0.08] flex items-center justify-center gap-1.5"
              >
                <Shield size={12} />
                粘贴 SSO JWT Token
              </button>
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
}

function GrowthChart({ data, platforms, activeKey, setActiveKey }) {
  const seriesMeta = useMemo(() => {
    const names = platforms.map(p => p.name);
    const usedKeys = new Set();
    Object.values(data || []).forEach(row => {
      Object.keys(row).forEach(k => {
        if (k !== 'date' && (names.includes(k) || Object.values(PLATFORM_META).some(m => m.name === k))) {
          usedKeys.add(k);
        }
      });
    });
    return Array.from(usedKeys).map(k => {
      const meta = PLATFORM_META[k] || Object.values(PLATFORM_META).find(m => m.name === k);
      const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#4263EB', '#FF4500'];
      const idx = Array.from(usedKeys).indexOf(k);
      return { key: k, color: meta?.color || palette[idx % palette.length] };
    });
  }, [data, platforms]);
  if (!data || data.length === 0) {
    return <div className="h-full flex items-center justify-center text-ink-400 text-sm">暂无趋势数据</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data} margin={{ top: 10, right: 16, bottom: 0, left: -14 }}
        onMouseLeave={() => setActiveKey && setActiveKey(null)}
      >
        <defs>
          {seriesMeta.map(s => (
            <linearGradient key={s.key} id={`g-${s.key.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="#f1f1f3" strokeWidth={1} />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} dy={8} minTickGap={30} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} width={60} tickFormatter={v => formatShort(v)} />
        <Tooltip
          contentStyle={{ borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.15)', padding: '10px 14px', fontSize: 12 }}
          formatter={(v, n) => [formatShort(v), String(n || '')]}
          labelStyle={{ color: '#71717a', marginBottom: 6, fontWeight: 500 }}
        />
        {seriesMeta.length > 1 && (
          <Legend
            verticalAlign="top" height={34} iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, color: '#71717a', paddingLeft: 6 }}
            onMouseEnter={(e) => setActiveKey && setActiveKey(e.value)}
            onMouseLeave={() => setActiveKey && setActiveKey(null)}
          />
        )}
        {seriesMeta.map(s => {
          const dimmed = !!activeKey && activeKey !== s.key;
          return (
            <Line
              key={s.key} type="monotone" dataKey={s.key} stroke={s.color}
              strokeOpacity={dimmed ? 0.2 : 1}
              strokeWidth={dimmed ? 1.2 : 2.2}
              dot={false}
              activeDot={{ r: dimmed ? 0 : 4, strokeWidth: 2, stroke: '#fff' }}
              onMouseEnter={() => setActiveKey && setActiveKey(s.key)}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

function TrafficPie({ data, activeName, setActiveName, onSelectPlatform, onNavigatePlatform }) {
  if (!data || data.length === 0) {
    return <div className="h-full flex items-center justify-center text-ink-400 text-sm">暂无流量数据</div>;
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  const platformNameToKey = (name) => {
    const meta = PLATFORM_META[name] || Object.values(PLATFORM_META).find(m => m.name === name);
    return meta?.key || name;
  };
  const handleClickPlatform = (name) => {
    if (onNavigatePlatform) onNavigatePlatform(platformNameToKey(name), name);
    else if (onSelectPlatform) onSelectPlatform(name);
  };
  return (
    <div className="h-full flex items-center justify-center gap-6 px-2">
      <div className="relative shrink-0">
        <div style={{ width: 220, height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart onMouseLeave={() => setActiveName && setActiveName(null)}>
              <Pie
                data={data} cx="50%" cy="50%" innerRadius={70} outerRadius={96} paddingAngle={3} dataKey="value" strokeWidth={0}
                onMouseEnter={(d) => setActiveName && setActiveName(d.name)}
                onClick={(d) => handleClickPlatform(d.name)}
                style={{ cursor: (onNavigatePlatform || onSelectPlatform) ? 'pointer' : 'default' }}
              >
                {data.map((entry, i) => {
                  const dim = !!activeName && activeName !== entry.name;
                  return <Cell key={i} fill={entry.color} opacity={dim ? 0.35 : 1} style={{ transition: 'opacity 200ms ease', cursor: (onNavigatePlatform || onSelectPlatform) ? 'pointer' : 'default' }} />;
                })}
              </Pie>
              <Tooltip formatter={v => formatShort(v)} contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', fontSize: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.1)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[11px] text-ink-400 font-medium">总曝光</div>
          <div className="text-xl font-semibold tracking-tight mt-0.5 text-ink-900 tabular-nums">
            <AnimatedNumber value={total} format={v => formatShort(Math.round(v))} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 min-w-[160px] max-h-[240px] overflow-y-auto pr-1 -mr-1">
        {data.slice().sort((a, b) => b.value - a.value).map(item => {
          const pct = total ? ((item.value / total) * 100).toFixed(1) : 0;
          const isActive = activeName === item.name;
          return (
            <motion.button
              type="button"
              key={item.name}
              whileHover={{ x: 2 }}
              onMouseEnter={() => setActiveName && setActiveName(item.name)}
              onMouseLeave={() => setActiveName && setActiveName(null)}
              onClick={() => handleClickPlatform(item.name)}
              className={`flex items-center gap-3 rounded-lg px-2 -mx-2 py-1 transition text-left ${isActive ? 'bg-ink-50' : ''}`}
              style={{ cursor: (onNavigatePlatform || onSelectPlatform) ? 'pointer' : 'default' }}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color, opacity: activeName && !isActive ? 0.35 : 1 }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium text-ink-700 truncate">{item.name}</div>
              </div>
              <div className="text-[12px] text-ink-500 tabular-nums">{pct}%</div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function OperatorPerformanceChart({ stats, onSelectOperator, selectedUid }) {
  if (!stats || !stats.length) return null;
  const data = stats
    .slice()
    .sort((a, b) => (b.total_followers + b.total_members * 0.05) - (a.total_followers + a.total_members * 0.05))
    .map(s => ({
      name: s.operator_name?.replace(/（.*?）/g, '') || s.operator_uid,
      uid: s.operator_uid,
      粉丝总量: s.total_followers || 0,
      社区覆盖: Math.round((s.total_members || 0) / 20),
      异常数: s.abnormal_count || 0,
    }));
  const handleClick = (d) => {
    if (onSelectOperator && d?.activePayload?.[0]?.payload?.uid) {
      onSelectOperator(d.activePayload[0].payload.uid);
    }
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 12, right: 20, left: -10, bottom: 4 }} barGap={6} onClick={handleClick}>
        <CartesianGrid vertical={false} stroke="#f1f1f3" strokeWidth={1} />
        <XAxis
          dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12 }}
          onClick={(d) => {
            const hit = stats.find(s => (s.operator_name || '').startsWith(d.value));
            if (hit && onSelectOperator) onSelectOperator(hit.operator_uid);
          }}
        />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} width={58} tickFormatter={v => formatShort(v)} />
        <Tooltip
          cursor={{ fill: 'rgba(99,102,241,0.04)' }}
          contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 12px 30px rgba(0,0,0,0.1)', fontSize: 12 }}
          formatter={v => formatShort(v)}
        />
        <Legend verticalAlign="top" height={28} iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
        <Bar key="fans" dataKey="粉丝总量" radius={[6, 6, 0, 0]} fill="url(#opgrad1)" />
        <Bar key="cover" dataKey="社区覆盖" radius={[6, 6, 0, 0]} fill="#0ea5e9" />
        <Bar key="abn" dataKey="异常数" radius={[6, 6, 0, 0]} fill="#f59e0b" />
        <defs>
          <linearGradient id="opgrad1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  );
}

function StocktwitsCard({ r, onOpenDetail, onNavigateOperator }) {
  const up = (r.symbol_change_pct || 0) >= 0;
  const bullish = (r.sentiment_bull || 0) >= (r.sentiment_bear || 0);
  return (
    <motion.div
      variants={FADE_UP}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      onClick={() => onOpenDetail && onOpenDetail(r)}
      className={
        'bg-white rounded-2xl border shadow-card p-5 transition cursor-pointer ' +
        (r.abnormal ? 'border-amber-300/60 bg-amber-50/20' : 'border-black/[0.04] hover:shadow-lg')
      }
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#4263EB] to-[#6366f1] flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-white font-bold text-[14px]">${r.symbol?.slice(0, 4) || 'ST'}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[17px] tracking-tight text-ink-900 truncate">{r.account}</span>
              {r.abnormal && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">掉线</span>}
            </div>
            <div className="text-[11.5px] text-ink-400 mt-0.5 flex items-center gap-1.5">
              <PlatformTag name="Stocktwits" size="sm" />
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onNavigateOperator?.(r.assigned_operator_uid, r.assigned_operator_name); }}
                disabled={!r.assigned_operator_uid}
                className="inline-flex items-center gap-1 hover:text-amber-700 transition disabled:hover:text-current"
                style={{ cursor: r.assigned_operator_uid ? 'pointer' : 'default' }}
              >
                归属 · {r.assigned_operator_name || '—'}
              </button>
            </div>
          </div>
        </div>
        <a href={r.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-400 hover:bg-ink-50 hover:text-ink-700 transition shrink-0">
          <ExternalLink size={14} />
        </a>
      </div>
      <div className="flex items-end gap-3 mb-4">
        <div className="text-[28px] font-bold tabular-nums tracking-tight text-ink-900 leading-none">
          {r.symbol_price ? `$${r.symbol_price.toFixed(2)}` : '—'}
        </div>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-[12px] tabular-nums ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {up ? '+' : ''}{fmtPercent(r.symbol_change_pct, 2)}
        </motion.div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl bg-ink-50/60 p-2.5 text-center">
          <div className="text-[10.5px] text-ink-400 font-semibold uppercase tracking-wider">Watchers</div>
          <div className="text-[15px] font-bold text-ink-800 mt-1 tabular-nums">{formatShort(r.members)}</div>
        </div>
        <div className="rounded-xl bg-ink-50/60 p-2.5 text-center">
          <div className="text-[10.5px] text-ink-400 font-semibold uppercase tracking-wider">24h 消息</div>
          <div className="text-[15px] font-bold text-ink-800 mt-1 tabular-nums">{formatShort(r.message_volume_24h)}</div>
        </div>
        <div className="rounded-xl bg-ink-50/60 p-2.5 text-center">
          <div className="text-[10.5px] text-ink-400 font-semibold uppercase tracking-wider">情绪</div>
          <div className={`text-[15px] font-bold mt-1 tabular-nums ${bullish ? 'text-emerald-600' : 'text-rose-600'}`}>
            {bullish ? '🐂' : '🐻'} {bullish ? r.sentiment_bull : r.sentiment_bear}%
          </div>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-700">
            <span>🐂 看涨</span>
            <span className="tabular-nums">{r.sentiment_bull || 0}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-rose-700">
            <span className="tabular-nums">{r.sentiment_bear || 0}%</span>
            <span>看跌 🐻</span>
          </div>
        </div>
        <div className="h-3 rounded-full overflow-hidden flex bg-rose-100/80">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, r.sentiment_bull || 0))}%` }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-gradient-to-r from-emerald-400 to-emerald-500"
          />
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-black/[0.04] flex items-center justify-between text-[11px] text-ink-400">
        <div className="flex items-center gap-1.5">
          <MonitorDot size={12} />
          <span className="truncate max-w-[130px]">{r.machine_name || r.operator_name || '未知'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshCw size={12} />
          <span>{timeFromNow(r.updated_at)}</span>
        </div>
      </div>
    </motion.div>
  );
}

function RedditCard({ r, onOpenDetail, onNavigateOperator }) {
  const onlineRatio = r.members > 0 ? ((r.online || 0) / r.members) : 0;
  const onlinePct = Math.min(100, onlineRatio * 100);
  const heatColor = onlineRatio > 0.004 ? '#10b981' : onlineRatio > 0.002 ? '#f59e0b' : '#94a3b8';
  return (
    <motion.div
      variants={FADE_UP}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      onClick={() => onOpenDetail && onOpenDetail(r)}
      className={
        'bg-white rounded-2xl border shadow-card p-5 transition cursor-pointer ' +
        (r.abnormal ? 'border-amber-300/60 bg-amber-50/20' : 'border-black/[0.04] hover:shadow-lg')
      }
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF4500] to-[#f59e0b] flex items-center justify-center shrink-0 shadow-sm">
            <Globe2 size={20} className="text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[16px] tracking-tight text-ink-900 truncate">{r.account}</span>
              {r.abnormal && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">掉线</span>}
            </div>
            <div className="text-[11.5px] text-ink-400 mt-0.5 flex items-center gap-1.5">
              <PlatformTag name="Reddit" size="sm" />
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onNavigateOperator?.(r.assigned_operator_uid, r.assigned_operator_name); }}
                disabled={!r.assigned_operator_uid}
                className="inline-flex items-center gap-1 hover:text-amber-700 transition disabled:hover:text-current"
                style={{ cursor: r.assigned_operator_uid ? 'pointer' : 'default' }}
              >
                归属 · {r.assigned_operator_name || '—'}
              </button>
            </div>
          </div>
        </div>
        <a href={r.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-400 hover:bg-ink-50 hover:text-ink-700 transition shrink-0">
          <ExternalLink size={14} />
        </a>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl bg-ink-50/60 p-2.5 text-center">
          <div className="text-[10.5px] text-ink-400 font-semibold uppercase tracking-wider flex items-center justify-center gap-1"><Users2 size={10.5} />Members</div>
          <div className="text-[15px] font-bold text-ink-800 mt-1 tabular-nums">{formatShort(r.members)}</div>
        </div>
        <div className="rounded-xl bg-ink-50/60 p-2.5 text-center">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider flex items-center justify-center gap-1" style={{ color: heatColor }}>
            <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: heatColor }}>
              <motion.span
                className="absolute inset-0 rounded-full animate-ping opacity-70" style={{ background: heatColor }}
              />
            </span>Online
          </div>
          <div className="text-[15px] font-bold mt-1 tabular-nums" style={{ color: heatColor }}>{formatShort(r.online)}</div>
        </div>
        <div className="rounded-xl bg-ink-50/60 p-2.5 text-center">
          <div className="text-[10.5px] text-ink-400 font-semibold uppercase tracking-wider flex items-center justify-center gap-1"><MessageSquare size={10.5} />24h 帖</div>
          <div className="text-[15px] font-bold text-ink-800 mt-1 tabular-nums">{formatShort(r.posts_24h)}</div>
        </div>
      </div>
      <div className="mb-1.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-500">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: heatColor }} />
            在线率 {onlinePct.toFixed(2)}%
          </div>
          <div className="text-[11px] text-ink-400">
            每 {(r.posts_24h > 0 ? (24 * 60 / r.posts_24h).toFixed(0) : '—')} 分钟 1 帖
          </div>
        </div>
        <div className="h-3 rounded-full overflow-hidden bg-ink-100">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: Math.max(2, Math.min(100, onlinePct * 30)) + '%' }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="rounded-full"
            style={{ background: 'linear-gradient(90deg, ' + heatColor + ', ' + heatColor + 'cc)' }}
          />
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-black/[0.04] flex items-center justify-between text-[11px] text-ink-400">
        <div className="flex items-center gap-1.5">
          <MonitorDot size={12} />
          <span className="truncate max-w-[130px]">{r.machine_name || r.operator_name || '未知'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshCw size={12} />
          <span>{timeFromNow(r.updated_at)}</span>
        </div>
      </div>
    </motion.div>
  );
}

function DataTable({ records, showOperatorCols = true, onRowClick, onSelectPlatform, onNavigateOperator, onNavigatePlatform, operators = [], flashRecords, loading = false }) {
  const [sortKey, setSortKey] = useState('entity_audience');
  const [sortDir, setSortDir] = useState('desc');

  const platformNameToKey = (name) => {
    const meta = PLATFORM_META[name] || Object.values(PLATFORM_META).find(m => m.name === name);
    return meta?.key || name;
  };

  const enriched = useMemo(() => records.map(r => ({
    ...r,
    entity_audience: r.entity_type === 'COMMUNITY' ? (r.members || 0) : (r.followers || 0),
    entity_volume: r.entity_type === 'COMMUNITY' ? (r.message_volume_24h || r.posts_24h || 0) : (r.views || 0),
  })), [records]);

  const sorted = useMemo(() => {
    const copy = enriched.slice();
    copy.sort((a, b) => {
      let va = a[sortKey]; let vb = b[sortKey];
      if (typeof va === 'string') return sortDir === 'asc' ? (va || '').localeCompare(vb || '') : (vb || '').localeCompare(va || '');
      va = Number(va ?? 0); vb = Number(vb ?? 0);
      return sortDir === 'asc' ? va - vb : vb - va;
      });
      return copy;
  }, [enriched, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const headClass = 'text-[11.5px] font-semibold text-ink-400 uppercase tracking-wider text-left px-4 py-3 select-none whitespace-nowrap';
  const headBtn = (key, label, align = 'left') => (
    <th className={`${headClass} ${align === 'right' ? 'text-right' : ''}`}>
      <button onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1.5 hover:text-ink-600 transition ${sortKey === key ? 'text-ink-700' : ''}`}>
        {label}
        {sortKey === key && <span className={`transition ${sortDir === 'asc' ? '' : 'rotate-180'}`}><ChevronDown size={12} /></span>}
      </button>
    </th>
  );

  const extraCols = showOperatorCols ? 3 : 0;
  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-card p-6 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton w={40} h={40} className="rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton w="60%" h={14} />
              <Skeleton w="40%" h={10} />
            </div>
            <Skeleton w={80} h={14} />
            <Skeleton w={80} h={14} />
            <Skeleton w={60} h={14} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-card">
      <div className="overflow-x-auto -mx-px scrollbar-thin">
        <table className="w-full min-w-[960px] border-collapse">
          <thead>
            <tr className="bg-ink-50/40 border-b border-black/[0.04]">
              {headBtn('account', '对象')}
              <th className={`${headClass} w-[90px]`}>类型</th>
              <th className={`${headClass} w-[140px]`}>平台</th>
              {headBtn('entity_audience', '粉丝/成员', 'right')}
              {headBtn('entity_volume', '曝光/消息', 'right')}
              {headBtn('engagement_rate', '互动率', 'right')}
              {showOperatorCols && <th className={`${headClass} w-[110px]`}>归属运营</th>}
              {showOperatorCols && <th className={`${headClass} w-[110px]`}>上报人</th>}
              {showOperatorCols && <th className={`${headClass} w-[130px]`}>机器</th>}
              {headBtn('updated_at', '最后上报', 'right')}
              <th className={`${headClass} w-[54px] text-right`} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={9 + extraCols} className="py-20 text-center text-ink-400 text-sm">暂无匹配的数据</td></tr>
            )}
            {sorted.map((r, i) => (
              <motion.tr
                key={`${r.platform_key}-${r.account}-${i}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => onRowClick && onRowClick(r)}
                className={`border-b border-black/[0.03] last:border-0 cursor-pointer transition-colors ${r.abnormal ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-sky-50/50'}`}
                style={{ cursor: 'pointer' }}
              >
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <Avatar gradient={r.avatar_gradient} name={r.account} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-900 truncate">{r.account}</span>
                        {r.abnormal && (
                          <span title="数据异常/掉线" className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-amber-700 bg-amber-100/80 rounded-full px-1.5 py-0.5">
                            <AlertTriangle size={10} />异常
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-ink-500 mt-0.5 truncate max-w-[260px]">
                        {String(r.url || '').replace(/^https?:\/\//, '').slice(0, 50) || '—'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  {r.entity_type === 'COMMUNITY' ? (
                    <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-bold px-2 py-0.5 bg-violet-50 text-violet-700"><Globe2 size={10} />社区</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-bold px-2 py-0.5 bg-sky-50 text-sky-700"><UserCog size={10} />账号</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {onNavigatePlatform ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onNavigatePlatform(platformNameToKey(r.platform), r.platform); }}
                      className="transition hover:brightness-90 cursor-pointer"
                      title="进入平台看板"
                    >
                      <PlatformTag name={r.platform} />
                    </button>
                  ) : onSelectPlatform ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelectPlatform(r.platform); }}
                      className="transition hover:brightness-90 cursor-pointer"
                      title="查看平台汇总"
                    >
                      <PlatformTag name={r.platform} />
                    </button>
                  ) : <PlatformTag name={r.platform} />}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className={`font-semibold tabular-nums ${r.entity_audience === 0 ? 'text-ink-300' : 'text-ink-900'}`}>{formatShort(r.entity_audience)}</div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <motion.div
                    animate={flashRecords?.has(r.account) ? { backgroundColor: ['rgba(34,197,94,0)', 'rgba(34,197,94,0.12)', 'rgba(34,197,94,0)'], color: ['#18181b', '#059669', '#18181b'] } : {}}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    className={`inline-block rounded-lg px-1.5 py-0.5 font-medium tabular-nums ${r.entity_volume === 0 ? 'text-ink-300' : 'text-ink-800'}`}
                  >{formatShort(r.entity_volume)}</motion.div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  {r.entity_type === 'COMMUNITY' ? (
                    r.sentiment_bull !== undefined ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] font-bold tabular-nums ${r.sentiment_bull >= r.sentiment_bear ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
                        🐂 {r.sentiment_bull}%
                      </span>
                    ) : <span className="text-[11.5px] text-ink-500">每 {(r.posts_24h > 0 ? (1440 / r.posts_24h).toFixed(0) : '—')} 分一帖</span>
                  ) : (r.engagement_rate > 0 ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] font-semibold tabular-nums ${r.engagement_rate >= 5 ? 'text-emerald-700 bg-emerald-50' : r.engagement_rate >= 2 ? 'text-indigo-700 bg-indigo-50' : 'text-ink-600 bg-ink-50'}`}>
                      <Activity size={10.5} />{Number(r.engagement_rate).toFixed(2)}%
                    </span>
                  ) : <span className="text-ink-300 text-[12px]">—</span>)}
                </td>
                {showOperatorCols && (
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onNavigateOperator?.(r.assigned_operator_uid, r.assigned_operator_name); }}
                      disabled={!r.assigned_operator_uid}
                      className="flex items-center gap-2 min-w-[96px] max-sm:h-11 max-sm:min-w-0 max-sm:rounded-xl text-left hover:text-amber-700 transition disabled:opacity-90 disabled:hover:text-current"
                      style={{ cursor: r.assigned_operator_uid ? 'pointer' : 'default' }}
                    >
                      <UserAvatar name={r.assigned_operator_name} size={24} />
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-ink-700 truncate">{r.assigned_operator_name || '未分配'}</div>
                      </div>
                    </button>
                  </td>
                )}
                {showOperatorCols && (
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onNavigateOperator?.(r.operator_uid || (operators || []).find(o => o.operator_name === r.operator_name)?.operator_uid, r.operator_name); }}
                      disabled={!(r.operator_uid || r.operator_name)}
                      className="flex items-center gap-1.5 max-sm:h-11 max-sm:rounded-xl text-left hover:text-amber-700 transition disabled:opacity-90 disabled:hover:text-current"
                      style={{ cursor: (r.operator_uid || r.operator_name) ? 'pointer' : 'default' }}
                    >
                      <UserAvatar name={r.operator_name} size={22} />
                      <span className="text-[12px] text-ink-600 truncate max-w-[70px]">{r.operator_name || '—'}</span>
                    </button>
                  </td>
                )}
                {showOperatorCols && (
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 max-w-[130px]" title={r.machine_name || r.machine_id || ''}>
                      <Server size={12} className="text-ink-400 shrink-0" />
                      <span className="text-[11.5px] text-ink-500 truncate">{r.machine_name || r.machine_id || '—'}</span>
                    </div>
                  </td>
                )}
                <td className="px-4 py-3.5 text-right">
                  <div className="text-[12.5px] text-ink-500 tabular-nums whitespace-nowrap">{timeFromNow(r.updated_at)}</div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {r.url && r.url !== '#' ? (
                    <a href={r.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex w-8 h-8 max-sm:h-11 max-sm:w-11 rounded-xl items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition shrink-0" title="打开">
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                    <button
                      onClick={e => { e.stopPropagation(); onRowClick && onRowClick(r); }}
                      className="inline-flex w-8 h-8 max-sm:h-11 max-sm:w-11 rounded-xl items-center justify-center text-ink-400 hover:text-indigo-600 hover:bg-indigo-50 transition shrink-0" title="查看明细"
                    >
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailDrawer({ record, onClose }) {
  const [postSort, setPostSort] = useState('newest');
  const trend = record?.daily_trend || [];
  const posts = useMemo(() => {
    const list = [...(record?.posts || [])];
    if (postSort === 'newest') {
      list.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
    } else {
      list.sort((a, b) => Number(b.engagement_rate || 0) - Number(a.engagement_rate || 0));
    }
    return list;
  }, [record, postSort]);
  const audience = record?.entity_type === 'COMMUNITY' ? (record?.members || 0) : (record?.followers || 0);
  const volume = record?.entity_type === 'COMMUNITY' ? (record?.message_volume_24h || record?.posts_24h || 0) : (record?.views || 0);
  return (
    <AnimatePresence>
      {record && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="fixed top-0 right-0 z-50 h-full w-[92%] sm:w-[600px] lg:w-[680px] bg-white shadow-[0_20px_80px_rgba(0,0,0,0.18)] border-l border-black/[0.06] flex flex-col"
          >
            <div className="px-6 pt-5 pb-4 border-b border-black/[0.04] flex items-start gap-4">
              <Avatar gradient={record.avatar_gradient} name={record.account} size={56} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[20px] font-bold tracking-tight text-ink-900 truncate">{record.account}</h3>
                  {record.abnormal && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">掉线</span>}
                  {record.entity_type === 'COMMUNITY' ? (
                    <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-bold px-2 py-0.5 bg-violet-50 text-violet-700"><Globe2 size={10} />社区</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-bold px-2 py-0.5 bg-sky-50 text-sky-700"><UserCog size={10} />账号</span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <PlatformTag name={record.platform} />
                  {record.assigned_operator_name && (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-500">
                      <UserAvatar name={record.assigned_operator_name} size={18} />
                      归属 · {record.assigned_operator_name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[12px] text-ink-500">
                    <MonitorDot size={12} />
                    {record.machine_name || record.operator_name || '—'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[12px] text-ink-500">
                    <RefreshCw size={12} />
                    {timeFromNow(record.updated_at)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {record.url && record.url !== '#' && (
                  <a href={record.url} target="_blank" rel="noreferrer" className="h-9 w-9 rounded-xl flex items-center justify-center text-ink-500 hover:bg-ink-50 hover:text-ink-800 transition" title="跳转原页">
                    <ExternalLink size={15} />
                  </a>
                )}
                <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center text-ink-500 hover:bg-ink-50 hover:text-ink-800 transition">
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-5 grid grid-cols-3 gap-3">
                <motion.div variants={FADE_UP} initial="hidden" animate="show" className="rounded-xl border border-black/[0.04] bg-ink-50/60 p-3 text-center">
                  <div className="text-[10.5px] text-ink-400 font-semibold uppercase tracking-wider">{record.entity_type === 'COMMUNITY' ? 'Members/Watchers' : '总粉丝'}</div>
                  <div className="text-[18px] font-bold text-ink-800 mt-1 tabular-nums">{formatShort(audience)}</div>
                </motion.div>
                <motion.div variants={FADE_UP} initial="hidden" animate="show" transition={{ delay: 0.05 }} className="rounded-xl border border-black/[0.04] bg-ink-50/60 p-3 text-center">
                  <div className="text-[10.5px] text-ink-400 font-semibold uppercase tracking-wider">{record.entity_type === 'COMMUNITY' ? '24h 消息量' : '曝光量'}</div>
                  <div className="text-[18px] font-bold text-ink-800 mt-1 tabular-nums">{formatShort(volume)}</div>
                </motion.div>
                <motion.div variants={FADE_UP} initial="hidden" animate="show" transition={{ delay: 0.1 }} className="rounded-xl border border-black/[0.04] bg-ink-50/60 p-3 text-center">
                  <div className="text-[10.5px] text-ink-400 font-semibold uppercase tracking-wider">
                    {record.entity_type === 'COMMUNITY' ? (record.symbol !== undefined ? '情绪看涨' : '在线率') : '互动率'}
                  </div>
                  <div className="text-[18px] font-bold mt-1 tabular-nums" style={{ color: record.entity_type === 'COMMUNITY' ? (record.symbol ? (record.sentiment_bull >= record.sentiment_bear ? '#059669' : '#e11d48') : (record.engagement_rate >= 5 ? '#059669' : '#4f46e5')) : '#4f46e5' }}>
                    {record.entity_type === 'COMMUNITY'
                      ? (record.symbol !== undefined
                        ? `${record.sentiment_bull || 0}%`
                        : (record.members ? `${((record.online || 0) / record.members * 100).toFixed(2)}%` : '—'))
                      : `${Number(record.engagement_rate || 0).toFixed(2)}%`}
                  </div>
                </motion.div>
              </div>
              <div className="px-6 pb-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-[14px] font-semibold text-ink-900 tracking-tight">核心指标趋势</h4>
                    <p className="text-[11.5px] text-ink-500 mt-0.5">近 30 天 · 粉丝/成员增长 + 曝光双轴</p>
                  </div>
                </div>
                <div className="h-[230px] rounded-2xl border border-black/[0.04] bg-ink-50/30 p-3 -mx-1">
                  {trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 10, right: 12, bottom: 0, left: -14 }}>
                        <defs>
                          <linearGradient id="g-df" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="g-dv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="#f1f1f3" strokeWidth={1} />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 10 }} dy={6} minTickGap={24} />
                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#6366f1', fontSize: 10 }} width={50} tickFormatter={v => formatShort(v)} />
                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#0ea5e9', fontSize: 10 }} width={50} tickFormatter={v => formatShort(v)} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 12px 30px rgba(0,0,0,0.1)', fontSize: 12 }}
                          formatter={(v) => formatShort(v)}
                        />
                        <Legend verticalAlign="top" height={22} iconSize={8} wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
                        <Line yAxisId="left" type="monotone" dataKey="followers" name={record.entity_type === 'COMMUNITY' ? 'Members' : '粉丝'} stroke="#6366f1" strokeWidth={2.2} dot={false} activeDot={{ r: 3, stroke: '#fff', strokeWidth: 2 }} fill="url(#g-df)" />
                        <Line yAxisId="right" type="monotone" dataKey="views" name="曝光/消息" stroke="#0ea5e9" strokeWidth={2.2} dot={false} activeDot={{ r: 3, stroke: '#fff', strokeWidth: 2 }} fill="url(#g-dv)" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-ink-400 text-sm">暂无趋势</div>
                  )}
                </div>
              </div>
              <div className="px-6 pb-8">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-[14px] font-semibold text-ink-900 tracking-tight flex items-center gap-1.5">
                      <Layers size={15} />
                      最新作品 / 帖子列表
                    </h4>
                    <p className="text-[11.5px] text-ink-500 mt-0.5">共 {(record?.posts?.length || 0)} 条 · Top 10</p>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-ink-50/80 border border-black/[0.04]">
                    <button
                      onClick={() => setPostSort('newest')}
                      className={`h-8 px-3 rounded-lg text-[11.5px] font-semibold flex items-center gap-1 transition ${postSort === 'newest' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
                    >
                      <Clock size={12} />最新发布
                    </button>
                    <button
                      onClick={() => setPostSort('engagement')}
                      className={`h-8 px-3 rounded-lg text-[11.5px] font-semibold flex items-center gap-1 transition ${postSort === 'engagement' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
                    >
                      <Flame size={12} />最高互动
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {posts.length === 0 && (
                      <div className="py-16 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06]">暂无作品数据</div>
                    )}
                    {posts.map((p, idx) => (
                      <motion.div
                        key={p.id || idx}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ delay: idx * 0.03 }}
                        className={`rounded-2xl border p-4 flex gap-4 transition hover:shadow-md ${p.is_bomb ? 'border-amber-200/60 bg-gradient-to-br from-amber-50/60 to-transparent' : 'border-black/[0.04] bg-white'}`}
                      >
                        <div className="relative shrink-0">
                          {p.cover_gradient ? (
                            <div className="w-[68px] h-[68px] rounded-xl overflow-hidden">
                              <div
                                className="w-full h-full"
                                style={{
                                  background: `linear-gradient(135deg, ${(p.cover_gradient || '#6366f1,#8b5cf6').split(',')[0]}, ${(p.cover_gradient || '#6366f1,#8b5cf6').split(',')[1]})`,
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-[68px] h-[68px] rounded-xl bg-ink-100 flex items-center justify-center text-ink-400">
                              <Layers size={20} />
                            </div>
                          )}
                          {p.is_bomb && (
                            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white shadow">
                              <Flame size={9} />爆款
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="text-[13.5px] font-semibold text-ink-900 leading-snug line-clamp-2">{p.title}</h5>
                          </div>
                          {p.summary && <p className="mt-1 text-[11.5px] text-ink-500 leading-snug line-clamp-1">{p.summary}</p>}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 text-[11px] text-ink-500">
                              <span className="inline-flex items-center gap-1"><Clock size={11} />{timeFromNow(p.published_at)}</span>
                              <span className="inline-flex items-center gap-1"><Eye size={11} />{formatShort(p.views || 0)}</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-[11px] text-ink-500">
                              <span className="inline-flex items-center gap-0.5"><Heart size={11} />{formatShort(p.likes || 0)}</span>
                              <span className="inline-flex items-center gap-0.5"><MessageCircle size={11} />{formatShort(p.comments || 0)}</span>
                              <span className="inline-flex items-center gap-0.5"><Repeat2 size={11} />{formatShort(p.shares || 0)}</span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${(p.engagement_rate || 0) >= 5 ? 'bg-emerald-50 text-emerald-700' : (p.engagement_rate || 0) >= 2 ? 'bg-indigo-50 text-indigo-700' : 'bg-ink-50 text-ink-600'}`}>
                                <Activity size={10} />{Number(p.engagement_rate || 0).toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function OperatorOverview({ operatorStat, onClose, onOpenRecord, onSelectPlatform }) {
  if (!operatorStat) return null;
  const mine = operatorStat.records || [];
  const ok = mine.filter(r => !r.abnormal).length;
  const abn = mine.filter(r => r.abnormal).length;
  const allPosts = mine.flatMap(r => r.posts || []);
  const postingTrend = useMemo(() => {
    const byDay = {};
    for (let i = 29; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day').format('MM/DD');
      byDay[d] = 0;
    }
    allPosts.forEach(p => {
      const d = dayjs(p.published_at).format('MM/DD');
      if (byDay[d] !== undefined) byDay[d] += 1;
    });
    return Object.entries(byDay).map(([date, count]) => ({ date, 发布数: count }));
  }, [allPosts]);
  const topContent = [...allPosts].sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 6);
  const healthData = [
    { name: '正常', value: ok, color: '#10b981' },
    { name: '异常/掉线', value: abn, color: '#f59e0b' },
  ];
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
        className="rounded-2xl border border-black/[0.04] shadow-card p-6 mb-6 bg-gradient-to-br from-violet-50/40 via-white to-sky-50/30"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative">
              <UserAvatar name={operatorStat.operator_name} size={56} />
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center"
              >
                <Users2 size={10} className="text-white" />
              </motion.div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[20px] font-bold tracking-tight text-ink-900">{operatorStat.operator_name}</h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700"><UserCog size={10} />运营 · 综合绩效</span>
              </div>
              <div className="text-[12px] text-ink-500 mt-1.5">负责 {operatorStat.accounts_count} 个账号 · {operatorStat.communities_count} 个社区 · 总覆盖 {formatShort((operatorStat.total_followers || 0) + (operatorStat.total_members || 0))}</div>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center text-ink-500 hover:bg-white hover:text-ink-800 transition border border-black/[0.04] bg-white">
              <X size={16} />
            </button>
          )}
        </div>
        <motion.div variants={STAGGER} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard icon={Users} label="负责总粉丝" value={formatShort(operatorStat.total_followers || 0)} accent="indigo" />
          <StatCard icon={Users2} label="社区覆盖人数" value={formatShort(operatorStat.total_members || 0)} accent="violet" />
          <StatCard icon={Flame} label="近 30 天作品数" value={operatorStat.total_posts_30d || 0} accent="amber" />
          <StatCard icon={TrendingUp} label="爆款率（互动前12%）" value={`${operatorStat.bomb_rate || 0}%`} accent="emerald" trend={`${operatorStat.bomb_rate > 10 ? '高产出' : '稳步'}`} />
        </motion.div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div variants={FADE_UP} initial="hidden" animate="show" className="bg-white rounded-2xl border border-black/[0.04] p-5 shadow-sm">
            <h3 className="text-[13.5px] font-semibold text-ink-900 mb-1">账号健康状态</h3>
            <p className="text-[11.5px] text-ink-500 mb-2">正常上报 vs 异常掉线</p>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={healthData} cx="50%" cy="50%" innerRadius={54} outerRadius={74} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {healthData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={v => [`${v} 个`, '数量']} contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 text-[12px]">
              <span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />正常 {ok}</span>
              <span className="inline-flex items-center gap-1.5 text-amber-700"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />异常 {abn}</span>
            </div>
          </motion.div>
          <motion.div variants={FADE_UP} initial="hidden" animate="show" transition={{ delay: 0.1 }} className="lg:col-span-2 bg-white rounded-2xl border border-black/[0.04] p-5 shadow-sm">
            <h3 className="text-[13.5px] font-semibold text-ink-900 mb-1">历史内容发布频率</h3>
            <p className="text-[11.5px] text-ink-500 mb-2">近 30 天每日发布作品数</p>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={postingTrend} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f1f1f3" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 10 }} minTickGap={20} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 10 }} width={36} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', fontSize: 12 }} formatter={v => [`${v} 条`, '发布数']} />
                  <defs>
                    <linearGradient id="pfbar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="发布数" fill="url(#pfbar)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>
        {mine.length > 0 && (
          <motion.div variants={FADE_UP} initial="hidden" animate="show" className="mt-4">
            <h3 className="text-[13.5px] font-semibold text-ink-900 mb-3 flex items-center gap-1.5">
              <Flame size={15} />负责对象明细（点击下钻）
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {mine.map(r => (
                <motion.button
                  key={r.account}
                  whileHover={{ y: -2 }}
                  onClick={() => onOpenRecord && onOpenRecord(r)}
                  className={`flex items-center gap-3 text-left p-3 rounded-xl border ${r.abnormal ? 'border-amber-300/60 bg-amber-50/40' : 'border-black/[0.04] bg-white hover:shadow-md hover:border-indigo-100'}`}
                >
                  <Avatar gradient={r.avatar_gradient} name={r.account} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-ink-900 truncate">{r.account}</span>
                      {r.abnormal && <AlertTriangle size={11} className="text-amber-600" />}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-500 flex items-center gap-1.5">
                      <PlatformTag name={r.platform} size="sm" />
                      <span>{formatShort(r.entity_type === 'COMMUNITY' ? r.members : r.followers)}</span>
                    </div>
                  </div>
                  <ArrowUpRight size={15} className="text-ink-400" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
        {topContent.length > 0 && (
          <motion.div variants={FADE_UP} initial="hidden" animate="show" className="mt-4">
            <h3 className="text-[13.5px] font-semibold text-ink-900 mb-3 flex items-center gap-1.5">
              <TrendingUp size={15} />流量贡献 Top 内容（按播放/曝光）
            </h3>
            <div className="space-y-2">
              {topContent.map((p, i) => (
                <motion.div
                  key={p.id || i}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                  whileHover={{ y: -1 }}
                  onClick={() => { if (p?.url && p.url !== '#') window.open(p.url, '_blank', 'noopener,noreferrer'); }}
                  style={{ cursor: p?.url && p.url !== '#' ? 'pointer' : 'default' }}
                  className={`group relative flex items-center gap-3 p-3 rounded-xl border border-black/[0.04] bg-white hover:bg-ink-50/60 transition`}
                >
                  {p?.url && p.url !== '#' && (
                    <a
                      href={p.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-white border border-black/[0.04] flex items-center justify-center text-ink-400 opacity-0 group-hover:opacity-100 transition hover:text-indigo-600 hover:bg-indigo-50 z-10"
                      title="跳转原帖"
                    ><ExternalLink size={12} /></a>
                  )}
                  <div className="w-7 h-7 rounded-lg text-[11px] font-bold text-white flex items-center justify-center shrink-0" style={{ background: i < 3 ? '#f59e0b' : i < 5 ? '#6366f1' : '#94a3b8' }}>{i + 1}</div>
                  <div className="flex-1 min-w-0 pr-8">
                    <div className="text-[12.5px] font-semibold text-ink-900 truncate">{p.title}</div>
                    <div className="text-[11px] text-ink-500 mt-0.5">{timeFromNow(p.published_at)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13px] font-bold tabular-nums text-ink-900">{formatShort(p.views || 0)}</div>
                    <div className="text-[10.5px] text-ink-500">互动 {Number(p.engagement_rate || 0).toFixed(1)}%</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function OperatorSelectorChip({ operators, value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = operators.find(o => o.operator_uid === value);
  return (
    <div className="relative">
      <button
      onClick={() => setOpen(v => !v)}
      className="h-9 sm:h-9 max-sm:h-11 pl-1.5 pr-3 max-sm:pr-2 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50/60 transition flex items-center gap-2.5 text-sm font-medium text-ink-700 shadow-sm"
    >
      {current ? <UserAvatar name={current.operator_name} size={28} /> : <UserCog size={15} className="text-ink-500 mx-1" />}
      <div className="text-left leading-tight max-sm:hidden">
        <div className="text-[13px] font-semibold text-ink-800">{current ? current.operator_name : '所有运营'}</div>
        <div className="text-[10.5px] text-ink-400 mt-0.5">{current ? '综合绩效' : '管理员视角 / 个人'}</div>
      </div>
      <ChevronDown size={14} className={`text-ink-400 transition ${open ? 'rotate-180' : ''} max-sm:hidden`} />
    </button>
      <AnimatePresence>
      {open && (
        <>
          <motion.div key="o" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <motion.div
            key="m"
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute right-0 max-sm:right-0 mt-2 z-20 w-[260px] max-sm:w-[min(240px,92vw)] bg-white rounded-2xl border border-black/[0.06] shadow-card overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-black/[0.04] bg-ink-50/40 text-[11.5px] font-semibold text-ink-500 uppercase tracking-wider">
              运营人员下钻
            </div>
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full px-3 py-2.5 flex items-center gap-3 transition hover:bg-ink-50 ${!value ? 'bg-indigo-50/60' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-[13px] font-bold">✶</div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-ink-800 text-[13.5px]">全景（所有运营）</div>
                <div className="text-[11.5px] text-ink-400">返回全局对比</div>
              </div>
              {!value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
            </button>
            {operators.filter(o => o.role === 'operator').map(u => (
              <button
                key={u.operator_uid}
                onClick={() => { onChange(u.operator_uid); setOpen(false); }}
                className={`w-full px-3 py-2.5 flex items-center gap-3 transition hover:bg-ink-50 ${u.operator_uid === value ? 'bg-indigo-50/60' : ''}`}
              >
                <UserAvatar name={u.operator_name} size={32} />
                <div className="flex-1 text-left min-w-0">
                  <div className="font-semibold text-ink-800 text-[13.5px] truncate">{u.operator_name}</div>
                  <div className="text-[11.5px] text-ink-400 font-mono">{u.operator_uid}</div>
                </div>
                {u.operator_uid === value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
              </button>
            ))}
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
}

function ScopeSelector({
  operators, platforms,
  selectedOperatorUid, effectivePlatformKey,
  onSelectOperator, onSelectPlatform,
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(effectivePlatformKey ? 'platform' : 'operator');
  const opCurr = operators?.find(o => o.operator_uid === selectedOperatorUid);
  const platCurr = platforms?.find(p => p.key === effectivePlatformKey || p.name === effectivePlatformKey);

  const hasAny = selectedOperatorUid || effectivePlatformKey;
  const selTitle = tab === 'operator'
    ? (opCurr ? opCurr.operator_name : '所有运营')
    : (platCurr ? platCurr.name : '全部平台');
  const selSub = tab === 'operator'
    ? (opCurr ? '综合绩效' : '管理员视角 / 个人')
    : (platCurr ? '平台专项看板' : '按平台筛选');

  const dimIcon = tab === 'operator' ? UserCog : Globe2;
  const dimColor = tab === 'operator'
    ? 'from-violet-500 to-indigo-500'
    : 'from-sky-500 to-cyan-500';
  const dimRing = tab === 'operator'
    ? 'text-indigo-700 bg-indigo-50'
    : 'text-sky-700 bg-sky-50';
  const tabs = [
    { key: 'operator', label: '运营', icon: Users, grad: 'from-violet-500 to-indigo-500' },
    { key: 'platform', label: '平台', icon: Globe2, grad: 'from-sky-500 to-cyan-500' },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(v => !v); }}
        className="h-9 sm:h-9 max-sm:h-11 pl-1.5 pr-3 max-sm:pr-2 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50/60 transition flex items-center gap-2.5 text-sm font-medium text-ink-700 shadow-sm"
      >
        <div className="relative shrink-0">
          {tab === 'operator'
            ? (opCurr ? <UserAvatar name={opCurr.operator_name} size={28} /> : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white">
                  <UserCog size={15} />
                </div>
              ))
            : (platCurr ? (
                <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center ring-1 ring-black/[0.04]" style={{ background: `linear-gradient(135deg, ${platCurr.color || '#6366f1'}, #8b5cf6)` }}>
                  <Globe2 size={14} className="text-white" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center text-white">
                  <Globe2 size={14} />
                </div>
              ))}
          {hasAny && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-white flex items-center justify-center ring-1 ring-black/[0.05]">
              <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-br ${tab === 'operator' ? 'from-violet-500 to-indigo-500' : 'from-sky-500 to-cyan-500'}`} />
            </span>
          )}
        </div>
        <div className="text-left leading-tight max-sm:hidden">
          <div className="text-[13px] font-semibold text-ink-800 flex items-center gap-1.5">
            {selTitle}
            {hasAny && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${dimRing}`}>已筛选</span>}
          </div>
          <div className="text-[10.5px] text-ink-400 mt-0.5 flex items-center gap-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-br ${dimColor}`} />{selSub}
          </div>
        </div>
        <ChevronDown size={14} className={`text-ink-400 transition ${open ? 'rotate-180' : ''} max-sm:hidden`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div key="o" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              key="m"
              initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className="absolute right-0 max-sm:right-0 mt-2 z-20 w-[280px] max-sm:w-[min(260px,94vw)] bg-white rounded-2xl border border-black/[0.06] shadow-card overflow-hidden"
            >
              <div className="px-2.5 pt-2.5 pb-1.5 border-b border-black/[0.04] bg-gradient-to-br from-ink-50/60 to-white">
                <div className="inline-flex items-center p-0.5 rounded-xl bg-white border border-black/[0.04] shadow-sm w-full">
                  {tabs.map(t => {
                    const a = tab === t.key;
                    const I = t.icon;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg text-[11.5px] font-semibold transition ${
                          a ? `bg-gradient-to-br ${t.grad} text-white shadow-sm` : 'text-ink-500 hover:text-ink-800 hover:bg-ink-50/60'
                        }`}
                      ><I size={13} />{t.label}</button>
                    );
                  })}
                </div>
              </div>
              <div className="max-h-[46vh] overflow-y-auto">
                {tab === 'operator' && (
                  <>
                    <button
                      onClick={() => { onSelectOperator(null); setOpen(false); }}
                      className={`w-full px-3 py-2.5 flex items-center gap-3 transition hover:bg-ink-50 ${!selectedOperatorUid && !effectivePlatformKey ? 'bg-indigo-50/60' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-[13px] font-bold shadow-sm">✶</div>
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-ink-800 text-[13.5px]">全景（所有运营）</div>
                        <div className="text-[11.5px] text-ink-400">返回全局对比 · 取消运营筛选</div>
                      </div>
                      {!selectedOperatorUid && !effectivePlatformKey && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                    </button>
                    {(operators || []).filter(o => o.role === 'operator').map(u => (
                      <button
                        key={u.operator_uid}
                        onClick={() => { onSelectOperator(u.operator_uid); setOpen(false); }}
                        className={`w-full px-3 py-2.5 flex items-center gap-3 transition hover:bg-ink-50 ${u.operator_uid === selectedOperatorUid ? 'bg-indigo-50/60' : ''}`}
                      >
                        <UserAvatar name={u.operator_name} size={32} />
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-semibold text-ink-800 text-[13.5px] truncate">{u.operator_name}</div>
                          <div className="text-[11.5px] text-ink-400 font-mono">{u.operator_uid}</div>
                        </div>
                        {u.operator_uid === selectedOperatorUid && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                      </button>
                    ))}
                  </>
                )}
                {tab === 'platform' && (
                  <>
                    <button
                      onClick={() => { onSelectPlatform(null); setOpen(false); }}
                      className={`w-full px-3 py-2.5 flex items-center gap-3 transition hover:bg-ink-50 ${!selectedOperatorUid && !effectivePlatformKey ? 'bg-sky-50/60' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center text-white shadow-sm">
                        <Globe2 size={15} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-ink-800 text-[13.5px]">全部平台</div>
                        <div className="text-[11.5px] text-ink-400">返回全局对比 · 取消平台筛选</div>
                      </div>
                      {!selectedOperatorUid && !effectivePlatformKey && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                    </button>
                    {(platforms || []).map(p => (
                      <button
                        key={p.key}
                        onClick={() => { onSelectPlatform(p.key); setOpen(false); }}
                        className={`w-full px-3 py-2.5 flex items-center gap-3 transition hover:bg-ink-50 ${p.key === effectivePlatformKey ? 'bg-sky-50/60' : ''}`}
                      >
                        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center ring-1 ring-black/[0.04]" style={{ background: `linear-gradient(135deg, ${p.color || '#6366f1'}, #8b5cf6)` }}>
                          <Globe2 size={15} className="text-white" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-semibold text-ink-800 text-[13.5px] truncate flex items-center gap-1.5">
                            {p.name}
                            <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-ink-50/80 text-ink-500 border border-black/[0.04]">{p.category || '平台'}</span>
                          </div>
                          <div className="text-[11.5px] text-ink-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color || '#6366f1' }} />{p.key}
                          </div>
                        </div>
                        {p.key === effectivePlatformKey && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [currentUid, setCurrentUid] = useState('admin_001');
  const [category, setCategory] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [query, setQuery] = useState('');
  const [liveMode, setLiveMode] = useState(false);

  const [activeSeries, setActiveSeries] = useState(null);
  const [activePie, setActivePie] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [selectedOperatorUid, setSelectedOperatorUid] = useState(null);
  const [effectivePlatform, setEffectivePlatform] = useState(null);

  const [flashRecords, setFlashRecords] = useState(new Set());
  const [flashIds, setFlashIds] = useState(new Set());

  const [activeViralAlert, setActiveViralAlert] = useState(null);
  const [viralHistory, setViralHistory] = useState([]);
  const [showViralHistory, setShowViralHistory] = useState(false);
  const [trendGranularity, setTrendGranularity] = useState('day');
  const [platformTrendGranularity, setPlatformTrendGranularity] = useState('day');
  const [activeDiagnosis, setActiveDiagnosis] = useState(null);

  const [showAISummaryModal, setShowAISummaryModal] = useState(false);
  const [showCollectorModal, setShowCollectorModal] = useState(false);

  const [globalToast, setGlobalToast] = useState(null);
  const globalToastTimerRef = useRef(null);
  const showToast = useCallback((msg, type = 'info') => {
    if (globalToastTimerRef.current) { clearTimeout(globalToastTimerRef.current); globalToastTimerRef.current = null; }
    setGlobalToast({ id: Date.now(), msg, type });
    globalToastTimerRef.current = setTimeout(() => setGlobalToast(null), 2600);
  }, []);

  const loadDataLockRef = useRef(null);

  useRealtimeTicker(data, setData, liveMode, setFlashRecords, setFlashIds);

  const platformNameToKey = useCallback((name) => {
    const meta = PLATFORM_META[name] || Object.values(PLATFORM_META).find(m => m.name === name);
    return meta?.key || name;
  }, []);

  const keyToPlatformMeta = useCallback((key) => {
    const byKey = PLATFORM_META[key];
    if (byKey) return byKey;
    return Object.values(PLATFORM_META).find(m => m.key === key) || null;
  }, []);

  const openViralPost = useCallback((p) => {
    if (!p?.url) return;
    const safe = sanitizeUrl(p.url);
    if (safe === '#') return;
    window.open(safe, '_blank', 'noopener,noreferrer');
  }, []);

  const navigateToHome = useCallback(() => {
    setSelectedOperatorUid(null);
    setEffectivePlatform(null);
    setDetailRecord(null);
    setShowViralHistory(false);
    setCategory('all');
    setPlatform('all');
    setEntityType('all');
    setQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToOperator = useCallback((uid, name) => {
    if (!uid) return;
    setEffectivePlatform(null);
    setSelectedOperatorUid(uid);
    setDetailRecord(null);
    setShowViralHistory(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToPlatform = useCallback((keyOrName, name) => {
    if (!keyOrName) return;
    const key = PLATFORM_META[keyOrName]?.key ? keyOrName : platformNameToKey(keyOrName);
    if (!key) return;
    setSelectedOperatorUid(null);
    setEffectivePlatform(key);
    setDetailRecord(null);
    setShowViralHistory(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [platformNameToKey]);

  const pushViralToHistory = useCallback((alert) => {
    if (!alert) return;
    setViralHistory(prev => [alert, ...prev].slice(0, VIRAL_HISTORY_MAX));
  }, []);

  useEffect(() => {
    if (!liveMode || !data?.latestRecords) return;
    let cancelled = false;
    let scheduleId = 0;
    let autoDismissId = 0;
    function schedule() {
      if (cancelled) return;
      const delay = 15000 + Math.random() * 15000;
      scheduleId = setTimeout(() => {
        if (cancelled) return;
        setData(prev => {
          const records = prev?.latestRecords || [];
          if (!records.length) return prev;
          const pool = records.filter(r => r.posts && r.posts.length > 0);
          if (!pool.length) return prev;
          const r = pool[Math.floor(Math.random() * pool.length)];
          const candidates = (r.posts || []).slice();
          candidates.sort((a, b) => {
            const sa = (a.is_bomb ? 50 : 0) + Number(a.engagement_rate || 0) * 3 + Number(a.views || 0) / 50000;
            const sb = (b.is_bomb ? 50 : 0) + Number(b.engagement_rate || 0) * 3 + Number(b.views || 0) / 50000;
            return sb - sa;
          });
          const base = candidates[0] || candidates[Math.floor(Math.random() * candidates.length)];
          const surgeIndex = Math.floor(Math.random() * 4);
          const engagementDelta = +(0.25 + Math.random() * 1.1 + surgeIndex * 0.1).toFixed(2);
          const viewBoost = Math.floor(500 + Math.random() * 5000) * (1 + surgeIndex);
          const likeBoost = Math.floor(10 + Math.random() * 180) * (1 + surgeIndex * 0.6);
          const boosted = {
            ...base,
            views: (base.views || 0) + viewBoost,
            likes: (base.likes || 0) + likeBoost,
            engagement_rate: +Math.max(0.1, Number(base.engagement_rate || 0) + engagementDelta).toFixed(2),
            is_bomb: true,
          };
          const postIdx = (r.posts || []).findIndex(p => p.id === base.id);
          const newRecords = records.slice();
          const recordIdx = newRecords.findIndex(x => x.id === r.id);
          if (recordIdx >= 0) {
            const nr = { ...newRecords[recordIdx] };
            if (nr.posts && postIdx >= 0) {
              const np = nr.posts.slice();
              np[postIdx] = boosted;
              nr.posts = np;
            }
            nr.views = (nr.views || 0) + Math.floor(viewBoost * 0.4);
            nr.likes = (nr.likes || 0) + Math.floor(likeBoost * 0.3);
            newRecords[recordIdx] = nr;
          }
          const meta = PLATFORM_META[r.platform_key] || PLATFORM_META[r.platform] || {};
          const alert = {
            id: `v_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
            recordId: r.id,
            account: r.account,
            operator_uid: r.assigned_operator_uid,
            operator_name: r.assigned_operator_name,
            platform_key: r.platform_key,
            platform_name: r.platform,
            color: meta?.color || '#6366f1',
            surgeIndex,
            engagementDelta,
            post: boosted,
            createdAt: Date.now(),
          };
          setActiveViralAlert(prev => {
            if (prev) pushViralToHistory(prev);
            clearTimeout(autoDismissId);
            autoDismissId = setTimeout(() => {
              setActiveViralAlert(cur => {
                if (cur && cur.id === alert.id) {
                  pushViralToHistory(cur);
                  return null;
                }
                return cur;
              });
            }, VIRAL_TOAST_AUTO_DISMISS_MS);
            return alert;
          });
          setFlashIds(new Set([boosted.id || 'x']));
          return { ...prev, latestRecords: newRecords };
        });
        schedule();
      }, delay);
    }
    const initialId = setTimeout(schedule, 4500);
    return () => {
      cancelled = true;
      clearTimeout(scheduleId);
      clearTimeout(initialId);
      clearTimeout(autoDismissId);
    };
  }, [liveMode, data?.latestRecords?.length, setData, pushViralToHistory]);

  const loadData = useCallback(async (uid, options = {}) => {
    const { silent = false, force = false } = options;
    if (loadDataLockRef.current && !force) return;
    const lock = { _id: Date.now() + Math.random() };
    loadDataLockRef.current = lock;
    if (!silent) setLoading(true);
    try {
      const id = uid || currentUid;
      const d = await fetchSummary(30, id);
      if (loadDataLockRef.current !== lock) return;
      setData(prev => {
        if (prev && deepEqual(prev.latestRecords, d.latestRecords) && deepEqual(prev.trend, d.trend) && deepEqual(prev.summary, d.summary)) {
          return prev;
        }
        return d;
      });
      setLiveMode(true);
    } catch (e) {
      console.error(e);
    } finally {
      if (loadDataLockRef.current === lock) loadDataLockRef.current = null;
      if (!silent) {
        setTimeout(() => {
          if (loadDataLockRef.current === null) setLoading(false);
        }, 250);
      }
    }
  }, [currentUid]);

  useEffect(() => {
    (async () => {
      try {
        const me = await fetchWhoami();
        if (me?.uid) setCurrentUid(me.uid);
      } catch { /* noop */ }
    })();
  }, []);

  useEffect(() => {
    loadData(currentUid);
    const t = setInterval(() => loadData(currentUid, { silent: true }), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [loadData, currentUid]);

  const isAdmin = data?.currentUser?.role === 'admin';

  const effectiveScopeUid = useMemo(() => {
    if (!data) return null;
    if (!isAdmin) return currentUid;
    if (selectedOperatorUid) return selectedOperatorUid;
    return null;
  }, [data, isAdmin, currentUid, selectedOperatorUid]);

  const currentView = useMemo(() => {
    if (effectivePlatform) return 'platform';
    if (effectiveScopeUid) return 'operator';
    return 'home';
  }, [effectivePlatform, effectiveScopeUid]);

  const viewKey = useMemo(() => {
    if (effectivePlatform) return `p-${effectivePlatform}`;
    if (effectiveScopeUid) return `o-${effectiveScopeUid}`;
    return 'home';
  }, [effectivePlatform, effectiveScopeUid]);

  const scopeStats = useMemo(() => {
    if (!data?.latestRecords) return null;
    if (!effectiveScopeUid) return null;
    const mine = data.latestRecords.filter(r => r.assigned_operator_uid === effectiveScopeUid);
    let totalFollowers = 0, totalMembers = 0, totalViews7d = 0, accounts = 0, communities = 0, abnormal = 0;
    mine.forEach(r => {
      if (r.entity_type === 'ACCOUNT') { totalFollowers += (r.followers || 0); accounts += 1; }
      else { totalMembers += (r.members || 0); communities += 1; }
      totalViews7d += (r.views || 0) + Math.round((r.message_volume_24h || r.posts_24h || 0) * 3.5);
      if (r.abnormal) abnormal += 1;
    });
    const opName = (data.operators || []).find(o => o.operator_uid === effectiveScopeUid)?.operator_name || '我';
    return { totalFollowers, totalMembers, totalViews7d, accounts, communities, abnormal, opName };
  }, [data, effectiveScopeUid]);

  const scopeDerivedCharts = useMemo(() => {
    if (!data?.latestRecords || !effectiveScopeUid) return null;
    const mine = data.latestRecords.filter(r => r.assigned_operator_uid === effectiveScopeUid);
    const platformKeys = new Set(mine.map(r => r.platform_key));
    const platforms = (data.platforms || []).filter(p => platformKeys.has(p.key));
    const trendByDate = new Map();
    mine.forEach(r => {
      const pMeta = PLATFORM_META[r.platform_key] || PLATFORM_META[r.platform];
      if (!pMeta || !r.daily_trend || !Array.isArray(r.daily_trend)) return;
      r.daily_trend.forEach(dt => {
        const bucket = trendByDate.get(dt.date) || {};
        if (typeof bucket[pMeta.name] !== 'number') bucket[pMeta.name] = 0;
        bucket[pMeta.name] += ((r.entity_type === 'ACCOUNT' ? (dt.followers || 0) : (dt.views || dt.followers || 0)) || 0);
        trendByDate.set(dt.date, bucket);
      });
    });
    const dates = Array.from(trendByDate.keys()).sort();
    const trend = dates.map(d => ({ date: d, ...(trendByDate.get(d) || {}) }));
    const trafficByKey = new Map();
    mine.forEach(r => {
      const key = r.platform_key;
      if (!key) return;
      const valueContrib = r.entity_type === 'ACCOUNT'
        ? (r.views || 0)
        : ((r.message_volume_24h || r.posts_24h || 0) * 50);
      const existing = trafficByKey.get(key) || { key, name: r.platform, value: 0, followers: 0, members: 0, count: 0 };
      existing.value += valueContrib;
      if (r.entity_type === 'ACCOUNT') existing.followers += (r.followers || 0);
      else existing.members += (r.members || 0);
      existing.count += 1;
      trafficByKey.set(key, existing);
    });
    let platformTraffic = Array.from(trafficByKey.values()).map(t => {
      const meta = PLATFORM_META[t.key] || {};
      return {
        ...t,
        color: meta.color,
        category: meta.category,
        audience: t.followers + t.members,
        share: 0,
      };
    }).filter(p => (p.value || 0) > 0);
    const totalValue = platformTraffic.reduce((s, t) => s + (t.value || 0), 0);
    platformTraffic.forEach(t => { t.share = totalValue > 0 ? (t.value / totalValue * 100) : 0; });
    platformTraffic.sort((a, b) => (b.value || 0) - (a.value || 0));
    return { platforms, trend: (trend.length ? trend : (data.trend || [])), platformTraffic };
  }, [data, effectiveScopeUid]);

  const scopedDiagnosis = useMemo(() => {
    if (!data?.aiDiagnosis?.length) return [];
    if (!effectiveScopeUid) return data.aiDiagnosis;
    const scopedIds = new Set(
      (data.latestRecords || [])
        .filter(r => r.assigned_operator_uid === effectiveScopeUid)
        .map(r => r.id)
    );
    return data.aiDiagnosis.filter(d =>
      (d.target_ids || []).some(tid => scopedIds.has(tid))
    );
  }, [data, effectiveScopeUid]);

  const platformStats = useMemo(() => {
    if (!effectivePlatform || !data?.latestRecords) return null;
    const meta = keyToPlatformMeta(effectivePlatform);
    const platRecords = data.latestRecords.filter(r =>
      r.platform_key === effectivePlatform || r.platform === meta?.name
    );
    let followers = 0, members = 0, views = 0, likes = 0, posts = 0, engagementSum = 0, engagementCount = 0;
    const allPosts = [];
    platRecords.forEach(r => {
      if (r.entity_type === 'ACCOUNT') followers += (r.followers || 0);
      else members += (r.members || 0);
      views += (r.views || 0);
      likes += (r.likes || 0);
      if (r.engagement_rate && Number(r.engagement_rate) > 0) {
        engagementSum += Number(r.engagement_rate); engagementCount += 1;
      }
      (r.posts || []).forEach(p => {
        posts += 1;
        allPosts.push({ ...p, _account: r.account, _platform: r.platform });
        if (p.engagement_rate && Number(p.engagement_rate) > 0) {
          engagementSum += Number(p.engagement_rate); engagementCount += 1;
        }
      });
    });
    const contribution = platRecords.map(r => ({
      account: r.account,
      avatar_gradient: r.avatar_gradient,
      views: r.views || 0,
      audience: r.entity_type === 'COMMUNITY' ? (r.members || 0) : (r.followers || 0),
      platform: r.platform,
      entity_type: r.entity_type,
      assigned_operator_uid: r.assigned_operator_uid,
      assigned_operator_name: r.assigned_operator_name,
    })).sort((a, b) => b.views - a.views);
    const topPosts = [...allPosts].sort((a, b) => Number(b.engagement_rate || 0) - Number(a.engagement_rate || 0));
    return {
      meta,
      records: platRecords,
      totals: {
        audience: followers + members,
        followers, members, views, likes, posts,
        avgEngagement: engagementCount > 0 ? (engagementSum / engagementCount) : 0,
      },
      contribution,
      topPosts,
      maxViews: Math.max(1, ...contribution.map(c => c.views)),
      name: meta?.name || effectivePlatform,
      color: meta?.color || '#6366f1',
    };
  }, [effectivePlatform, data, keyToPlatformMeta]);

  const categoryOptions = useMemo(() => data?.categories || [{ key: 'all', name: '全部' }], [data]);
  const platformOptions = useMemo(() => {
    const base = [{ key: 'all', name: '所有平台' }];
    (data?.platforms || []).forEach(p => base.push({ key: p.key, name: p.name }));
    return base;
  }, [data]);
  const entityTypeOptions = useMemo(() => data?.entityTypes || [{ key: 'all', name: '全部类型' }], [data]);

  const filteredRecords = useMemo(() => {
    let r = data?.latestRecords || [];
    if (effectiveScopeUid) r = r.filter(x => x.assigned_operator_uid === effectiveScopeUid);
    if (effectivePlatform) {
      const meta = keyToPlatformMeta(effectivePlatform);
      r = r.filter(x => x.platform_key === effectivePlatform || x.platform === meta?.name);
    }
    if (category !== 'all') r = r.filter(x => x.platform_category === category);
    if (platform !== 'all') r = r.filter(x => x.platform_key === platform || x.platform === platformOptions.find(p => p.key === platform)?.name);
    if (entityType !== 'all') r = r.filter(x => x.entity_type === entityType);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      r = r.filter(x =>
        x.account.toLowerCase().includes(q) ||
        (x.platform || '').toLowerCase().includes(q) ||
        (x.assigned_operator_name || '').toLowerCase().includes(q) ||
        (x.machine_name || '').toLowerCase().includes(q)
      );
    }
    return r;
  }, [data, effectiveScopeUid, effectivePlatform, category, platform, entityType, query, platformOptions, keyToPlatformMeta]);

  const stocktwitsRecords = useMemo(() => filteredRecords.filter(r => r.platform_key === 'stocktwits'), [filteredRecords]);
  const redditRecords = useMemo(() => filteredRecords.filter(r => r.platform_key === 'reddit'), [filteredRecords]);

  const selectedOpStat = useMemo(() => {
    if (!isAdmin || !selectedOperatorUid) return null;
    const found = (data?.operatorStats || []).find(s => s.operator_uid === selectedOperatorUid);
    return found || null;
  }, [isAdmin, selectedOperatorUid, data]);

  const headerSubtitle = useMemo(() => {
    if (!data) return '加载中...';
    const parts = [];
    parts.push(`${filteredRecords.length} / ${data.latestRecords.length} 个对象`);
    if (data.accountCount) parts.push(`${data.accountCount} 账号`);
    if (data.communityCount) parts.push(`${data.communityCount} 社区`);
    parts.push(`${data.platforms?.length || 0} 平台`);
    const last = data.latestRecords.slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0]?.updated_at;
    if (last) parts.push(`最近更新 ${timeFromNow(last)}`);
    return parts.join(' · ');
  }, [data, filteredRecords]);

  function StatCardMini({ icon: Icon, label, value, accent, sub }) {
    const gradient = {
      indigo: 'from-indigo-500/15 to-violet-500/5 text-indigo-600',
      sky: 'from-sky-500/15 to-cyan-500/5 text-sky-600',
      emerald: 'from-emerald-500/15 to-teal-500/5 text-emerald-600',
      amber: 'from-amber-500/15 to-orange-500/5 text-amber-600',
      rose: 'from-rose-500/15 to-pink-500/5 text-rose-600',
    }[accent] || 'from-slate-500/15 to-slate-500/5 text-slate-600';
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-black/[0.04] bg-white p-3.5 sm:p-4 flex flex-col gap-2.5 relative overflow-hidden min-w-0"
      >
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
          <Icon size={17} strokeWidth={2.1} />
        </div>
        <div className="min-w-0">
          <div className="text-[11.5px] text-ink-500 font-medium mb-0.5 truncate">{label}</div>
          <div className="text-[18px] sm:text-[20px] font-semibold tracking-tight text-ink-900 tabular-nums leading-none whitespace-nowrap">
            <AnimatedNumber value={typeof value === 'number' ? value : 0} format={v => formatShort(Math.round(v))} />
          </div>
          {sub && <div className="mt-1 text-[10.5px] sm:text-[11px] text-ink-500 leading-snug line-clamp-2 break-words">{sub}</div>}
        </div>
      </motion.div>
    );
  }

  function BreadcrumbBar() {
    if (currentView === 'home') {
      return (
        <nav className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-ink-500">
          <Layers size={12} className="text-violet-500" />
          <span className="font-semibold text-ink-700">{isAdmin ? '矩阵数据总览' : `我的负责范围 · ${data?.currentUser?.operator_name || ''}`}</span>
          {isAdmin && <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-100/70">管理员全景</span>}
        </nav>
      );
    }
    if (currentView === 'operator') {
      return (
        <nav className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-ink-500 flex-wrap">
          <button
            onClick={navigateToHome}
            className="inline-flex items-center gap-1 hover:text-indigo-600 font-medium transition"
            style={{ cursor: 'pointer' }}
          >
            <Layers size={12} />矩阵数据总览
          </button>
          <ChevronDown size={12} className="-rotate-90 text-ink-300" />
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
            <UserCog size={12} className="text-sky-600" />
            {scopeStats?.opName || (isAdmin ? '所选运营' : '我')}
            <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-100/70">个人绩效</span>
          </span>
        </nav>
      );
    }
    if (currentView === 'platform') {
      const color = platformStats?.color || '#6366f1';
      return (
        <nav className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-ink-500 flex-wrap">
          <button
            onClick={navigateToHome}
            className="inline-flex items-center gap-1 hover:text-indigo-600 font-medium transition"
            style={{ cursor: 'pointer' }}
          >
            <Layers size={12} />矩阵数据总览
          </button>
          <ChevronDown size={12} className="-rotate-90 text-ink-300" />
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
            <Globe2 size={12} style={{ color }} />
            {platformStats?.name || effectivePlatform}
            <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-md border" style={{ background: `${color}12`, color, borderColor: `${color}29` }}>平台汇总</span>
          </span>
        </nav>
      );
    }
    return null;
  }

  function ViralHistoryDrawer() {
    const [tab, setTab] = React.useState('posts');
    const byOperator = React.useMemo(() => {
      const map = new Map();
      viralHistory.forEach((it) => {
        const key = it.operator_uid || '__none__';
        const cur = map.get(key) || {
          key, operator_uid: it.operator_uid, operator_name: it.operator_name || '未分配',
          count: 0, views: 0, likes: 0, engDeltas: [],
        };
        cur.count += 1;
        cur.views += Number(it.post?.views) || 0;
        cur.likes += Number(it.post?.likes) || 0;
        if (typeof it.engagementDelta === 'number') cur.engDeltas.push(it.engagementDelta);
        map.set(key, cur);
      });
      const arr = Array.from(map.values());
      const maxV = Math.max(1, ...arr.map(r => r.views));
      arr.forEach(r => { r._share = r.views / maxV; r._avgEng = r.engDeltas.length > 0 ? r.engDeltas.reduce((s, v) => s + v, 0) / r.engDeltas.length : 0; });
      return arr.sort((a, b) => b.count - a.count || b.views - a.views);
    }, [viralHistory]);
    const byPlatform = React.useMemo(() => {
      const map = new Map();
      viralHistory.forEach((it) => {
        const key = it.platform_key || it.platform_name || '__none__';
        const cur = map.get(key) || {
          key, platform_key: it.platform_key, platform_name: it.platform_name || '未分类', color: it.color,
          count: 0, views: 0, likes: 0, surgeIndices: [],
        };
        cur.count += 1;
        cur.views += Number(it.post?.views) || 0;
        cur.likes += Number(it.post?.likes) || 0;
        if (typeof it.surgeIndex === 'number') cur.surgeIndices.push(it.surgeIndex);
        map.set(key, cur);
      });
      const arr = Array.from(map.values());
      const maxV = Math.max(1, ...arr.map(r => r.views));
      arr.forEach(r => { r._share = r.views / maxV; r._avgSurge = r.surgeIndices.length > 0 ? r.surgeIndices.reduce((s, v) => s + v, 0) / r.surgeIndices.length : 0; });
      return arr.sort((a, b) => b.count - a.count || b.views - a.views);
    }, [viralHistory]);
    const TABS = [
      { key: 'posts', label: '爆款内容', icon: Flame },
      { key: 'ops',   label: '运营排行', icon: Building2 },
      { key: 'plats', label: '平台排行', icon: Globe2 },
    ];
    return (
      <AnimatePresence>
        {showViralHistory && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-[54] bg-black/20 backdrop-blur-[2px]"
              onClick={() => setShowViralHistory(false)}
            />
            <motion.aside
              key="drawer"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed z-[55] top-24 right-4 sm:right-6 w-[92vw] sm:w-[460px] max-w-[96vw] h-[78vh] max-h-[78vh] rounded-3xl bg-[#fafafa] border border-black/[0.06] shadow-[0_40px_120px_rgba(0,0,0,0.22)] flex flex-col overflow-hidden"
            >
              <div className="px-5 pt-4 pb-3.5 border-b border-black/[0.04] bg-white/70 backdrop-blur-sm shrink-0 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-rose-500/10 flex items-center justify-center shrink-0">
                      <Flame size={17} className="text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[16px] font-bold tracking-tight text-ink-900">历史爆款</h3>
                      <p className="text-[11.5px] text-ink-500 mt-0.5">最近 {viralHistory.length} / 最多 {VIRAL_HISTORY_MAX} 条 · 按诞生时间倒序</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowViralHistory(false)} className="h-9 w-9 rounded-xl flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition shrink-0 bg-white/80 border border-black/[0.04]">
                  <X size={16} />
                </button>
              </div>
              <div className="px-4 pt-3 pb-2 shrink-0">
                <div className="inline-flex items-center p-1 rounded-xl bg-white border border-black/[0.04] shadow-sm w-full">
                  {TABS.map(t => {
                    const active = tab === t.key;
                    const I = t.icon;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg text-[12px] font-semibold transition ${
                          active
                            ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm'
                            : 'text-ink-500 hover:text-ink-800 hover:bg-ink-50/60'
                        }`}
                      >
                        <I size={13} />{t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
                {tab === 'posts' && (
                  <>
                    {viralHistory.length === 0 && (
                      <div className="py-20 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06] bg-white/60 mt-2">
                        暂无历史爆款<br />
                        <span className="text-[11px] text-ink-400 mt-1 block">等待实时监测中爆款诞生…</span>
                      </div>
                    )}
                    {viralHistory.map((item, i) => {
                      const p = item.post;
                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="group relative rounded-2xl border border-black/[0.04] bg-white p-3 hover:border-amber-200/70 hover:bg-gradient-to-br hover:from-amber-50/30 hover:to-rose-50/30 transition"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 ring-1 ring-black/[0.04]" style={{ background: `linear-gradient(135deg, ${(p?.cover_gradient || '#6366f1,#8b5cf6').split(',')[0]}, ${(p?.cover_gradient || '#6366f1,#8b5cf6').split(',')[1]})` }} />
                            <div className="flex-1 min-w-0 pr-8">
                              <div className="text-[12.5px] font-semibold text-ink-900 leading-snug line-clamp-2 break-words">{p?.title || '互动率突破临界值'}</div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-ink-500">
                                <span className="inline-flex items-center gap-0.5">
                                  <User size={10.5} />{item.account}
                                </span>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); navigateToOperator(item.operator_uid, item.operator_name); }}
                                  disabled={!item.operator_uid}
                                  className="inline-flex items-center gap-0.5 hover:text-amber-700 transition disabled:hover:text-current"
                                  style={{ cursor: item.operator_uid ? 'pointer' : 'default' }}
                                >
                                  <Building2 size={10.5} />{item.operator_name || '—'}
                                </button>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); navigateToPlatform(item.platform_key, item.platform_name); }}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-ink-50/80 border border-black/[0.04]"
                                  style={{ cursor: 'pointer', color: item.color || '#6366f1' }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full mr-0.5 shrink-0" style={{ background: item.color || '#6366f1' }} />{item.platform_name || '—'}
                                </button>
                                <span className="tabular-nums opacity-70">{item.createdAt ? dayjs(item.createdAt).fromNow() : '刚刚'}</span>
                              </div>
                            </div>
                            {p?.url && p.url !== '#' && (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); openViralPost(p); }}
                                className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-white/90 border border-black/[0.04] flex items-center justify-center text-ink-400 opacity-0 group-hover:opacity-100 transition hover:text-amber-700 hover:bg-amber-50 shrink-0"
                                title="新标签页打开原帖"
                                style={{ cursor: 'pointer' }}
                              >
                                <ExternalLink size={13.5} />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </>
                )}
                {tab === 'ops' && (
                  <div className="space-y-2.5 mt-1">
                    {byOperator.length === 0 && (
                      <div className="py-16 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06] bg-white/60">暂无运营爆款数据</div>
                    )}
                    {byOperator.map((row, i) => (
                      <motion.div
                        key={row.key}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="rounded-2xl border border-black/[0.04] bg-white p-3.5 hover:shadow-md transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <UserAvatar name={row.operator_name} size={36} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="text-[13px] font-semibold text-ink-900 truncate max-w-[180px]">{row.operator_name}</div>
                                <span className="inline-flex items-center text-[10.5px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 tabular-nums">{row.count} 爆</span>
                              </div>
                              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-500 tabular-nums">
                                <span>总曝光 <b className="text-ink-800"><AnimatedNumber value={row.views} format={v => formatShort(Math.round(v))} /></b></span>
                                <span className="opacity-70">|</span>
                                <span>平均互动率增幅 <b className="text-emerald-600">+{(row._avgEng || 0).toFixed(2)}</b></span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigateToOperator(row.operator_uid, row.operator_name)}
                            disabled={!row.operator_uid}
                            className="h-8 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-[11.5px] font-semibold text-indigo-700 transition shrink-0 disabled:opacity-40 disabled:hover:bg-indigo-50"
                          >下钻 →</button>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-ink-100/70 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-amber-400" style={{ width: `${Math.round(row._share * 100)}%` }} />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
                {tab === 'plats' && (
                  <div className="space-y-2.5 mt-1">
                    {byPlatform.length === 0 && (
                      <div className="py-16 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06] bg-white/60">暂无平台爆款数据</div>
                    )}
                    {byPlatform.map((row, i) => (
                      <motion.div
                        key={row.key}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="rounded-2xl border border-black/[0.04] bg-white p-3.5 hover:shadow-md transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ring-1 ring-black/[0.04]"
                              style={{ background: `linear-gradient(135deg, ${(row.color || '#6366f1,#8b5cf6').split(',')[0] || (row.color || '#6366f1')}, ${(row.color || '#6366f1,#8b5cf6').split(',')[1] || '#8b5cf6'})`, opacity: 0.9 }}
                            >
                              <Globe2 size={16} className="text-white drop-shadow-sm" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="text-[13px] font-semibold text-ink-900 truncate max-w-[180px]">{row.platform_name}</div>
                                <span className="inline-flex items-center text-[10.5px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 tabular-nums">{row.count} 爆</span>
                                {row._avgSurge > 1 && <span className="inline-flex items-center text-[10.5px] font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 tabular-nums">★ {row._avgSurge.toFixed(1)}级</span>}
                              </div>
                              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-500 tabular-nums">
                                <span>总曝光 <b className="text-ink-800"><AnimatedNumber value={row.views} format={v => formatShort(Math.round(v))} /></b></span>
                                <span className="opacity-70">|</span>
                                <span>总赞 <b className="text-ink-800"><AnimatedNumber value={row.likes} format={v => formatShort(Math.round(v))} /></b></span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigateToPlatform(row.platform_key || row.platform_name, row.platform_name)}
                            className="h-8 px-2.5 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-100 text-[11.5px] font-semibold text-sky-700 transition shrink-0"
                          >进入平台 →</button>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-ink-100/70 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-violet-500 to-rose-400" style={{ width: `${Math.round(row._share * 100)}%` }} />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  function PlatformView() {
    if (!platformStats) return null;
    const { name, color, totals, contribution, topPosts, maxViews, records } = platformStats;
    const top10 = topPosts.slice(0, 10);
    const top20 = topPosts.slice(0, 20);
    return (
      <motion.div key={viewKey} variants={STAGGER} initial="hidden" animate="show" className="space-y-4 sm:space-y-5">
        <motion.div variants={STAGGER} initial="hidden" animate="show" className="flex flex-wrap items-start justify-between gap-3 mb-4 sm:mb-5">
          <motion.div variants={FADE_UP} className="min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <h1 className="text-[26px] font-semibold tracking-tight text-ink-900 leading-tight flex items-center gap-2.5 flex-wrap">
                <span className="w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center" style={{ background: `${color}15` }}>
                  <span className="w-3.5 h-3.5 rounded-full" style={{ background: color }} />
                </span>
                <div className="inline-flex items-center gap-2 flex-wrap">
                  {name} · 平台汇总看板
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); navigateToPlatform(effectivePlatform, name); }}
                    className="inline-flex items-center"
                  >
                    <PlatformTag name={name} size="sm" />
                  </button>
                </div>
              </h1>
              <p className="text-[13.5px] text-ink-500 mt-1.5">{records.length} 个监测对象 · {headerSubtitle}</p>
            </div>
          </motion.div>
          <motion.button
            variants={FADE_UP}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowViralHistory(true)}
            className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-black/[0.06] bg-white hover:bg-amber-50/60 text-sm font-medium text-ink-700 transition shadow-sm shrink-0"
          >
            <Flame size={15} className="text-amber-600" />历史爆款 · {viralHistory.length}
          </motion.button>
        </motion.div>

        <motion.div variants={STAGGER} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
          <StatCardMini icon={Users} label="总粉丝 / 成员" value={totals.audience} accent="indigo" sub={`${formatShort(totals.followers)} 账号粉丝 + ${formatShort(totals.members)} 社区成员`} />
          <StatCardMini icon={Eye} label="总曝光 / 阅读" value={totals.views} accent="sky" sub="全量账号曝光 + 社区消息折算" />
          <StatCardMini icon={Layers} label="总发布作品数" value={totals.posts} accent="emerald" sub="抓取到的最新帖子 / 视频数" />
          <StatCardMini icon={Activity} label="平均互动率 %" value={totals.avgEngagement} accent="amber" sub={`${Number(totals.avgEngagement).toFixed(2)}% · ${totals.posts > 0 ? `共 ${totals.posts} 条样本` : '暂无'}`} />
        </motion.div>

        <motion.div variants={STAGGER} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div variants={FADE_UP} className="bg-white rounded-2xl border border-black/[0.04] p-4 sm:p-5 min-w-0">
            <div className="flex items-center justify-between mb-3 sm:mb-3.5 gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-[13.5px] sm:text-[14px] font-semibold text-ink-900 tracking-tight flex items-center gap-1.5">
                  <TrendingUp size={15} />账号 / 社区贡献占比
                </h3>
                <p className="text-[11px] sm:text-[11.5px] text-ink-500 mt-0.5 leading-snug">按曝光量排序 · 进度条为相对占比</p>
              </div>
              <span className="text-[11px] font-medium text-ink-500 shrink-0">{contribution.length} 个对象</span>
            </div>
            <div className="space-y-2 sm:space-y-2.5">
              {contribution.length === 0 && (
                <div className="py-14 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06]">该平台暂无数据</div>
              )}
              {contribution.map((c, i) => (
                <motion.div
                  key={c.account}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-xl hover:bg-ink-50/60 transition min-w-0"
                >
                  <Avatar gradient={c.avatar_gradient} name={c.account} size={34} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 sm:gap-3 mb-1.5">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <span className="text-[12.5px] sm:text-[13px] font-semibold text-ink-900 truncate">{c.account}</span>
                        {c.entity_type === 'COMMUNITY' && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 shrink-0">社区</span>}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-[10.5px] sm:text-[11.5px] tabular-nums whitespace-nowrap">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); navigateToOperator(c.assigned_operator_uid, c.assigned_operator_name); }}
                          disabled={!c.assigned_operator_uid}
                          className="text-ink-500 hover:text-amber-700 transition disabled:hover:text-current"
                          style={{ cursor: c.assigned_operator_uid ? 'pointer' : 'default' }}
                          title={`归属 · ${c.assigned_operator_name || '未分配'}`}
                        >
                          <UserCog size={10.5} />{c.assigned_operator_name || '—'}
                        </button>
                        <span className="text-ink-600 font-medium">{formatShort(c.audience)} 粉</span>
                        <span className="text-ink-900 font-bold text-[11.5px] sm:text-[12px]">{formatShort(c.views)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${(c.views / maxViews) * 100}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.03 }}
                        className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${color}aa, ${color})` }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={FADE_UP} className="bg-white rounded-2xl border border-black/[0.04] p-4 sm:p-5 min-w-0">
            <div className="flex items-center justify-between mb-3 sm:mb-3.5 gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-[13.5px] sm:text-[14px] font-semibold text-ink-900 tracking-tight flex items-center gap-1.5">
                  <Flame size={15} />Top 10 爆款作品
                </h3>
                <p className="text-[11px] sm:text-[11.5px] text-ink-500 mt-0.5 leading-snug">按互动率排序 · 点击跳转原帖</p>
              </div>
            </div>
            <div className="space-y-2 sm:space-y-2.5">
              {top10.length === 0 && (
                <div className="py-14 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06]">暂无作品数据</div>
              )}
              {top10.map((p, i) => (
                <motion.div
                  key={p.id || i}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.05 }}
                  onClick={() => openViralPost(p)}
                  whileHover={{ y: -1 }}
                  style={{ cursor: p?.url && p.url !== '#' ? 'pointer' : 'default' }}
                  className={`group relative rounded-xl border p-2.5 sm:p-3 flex gap-2.5 sm:gap-3 transition hover:shadow-md hover:border-indigo-100 min-w-0 ${p.is_bomb ? 'border-amber-200/60 bg-gradient-to-br from-amber-50/60 to-transparent' : 'border-black/[0.04] bg-white'}`}
                >
                  {p?.url && p.url !== '#' && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); openViralPost(p); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-white border border-black/[0.04] flex items-center justify-center text-ink-400 opacity-0 group-hover:opacity-100 transition hover:text-indigo-600 hover:bg-indigo-50 z-20 shrink-0"
                      title="跳转原帖"
                      style={{ cursor: 'pointer' }}
                    ><ExternalLink size={12} /></button>
                  )}
                  <div className="relative shrink-0">
                    {p.cover_gradient ? (
                      <div className="w-[48px] h-[48px] sm:w-[54px] sm:h-[54px] rounded-lg overflow-hidden shrink-0">
                        <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${(p.cover_gradient || '#6366f1,#8b5cf6').split(',')[0]}, ${(p.cover_gradient || '#6366f1,#8b5cf6').split(',')[1]})` }} />
                      </div>
                    ) : (
                      <div className="w-[48px] h-[48px] sm:w-[54px] sm:h-[54px] rounded-lg bg-ink-100 flex items-center justify-center text-ink-400 text-[11px] font-bold shrink-0">#{i + 1}</div>
                    )}
                    {p.is_bomb && (
                      <span className="absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white shadow shrink-0">
                        <Flame size={8} />爆
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pr-8">
                    <div className="text-[11.5px] sm:text-[12px] font-semibold text-ink-900 leading-snug line-clamp-2 break-words">{p.title}</div>
                    <div className="mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <div className="text-[10px] sm:text-[10.5px] text-ink-500 whitespace-nowrap overflow-hidden text-ellipsis">
                        <Clock size={9.5} className="inline mr-0.5" />{timeFromNow(p.published_at)} · {p._account}
                      </div>
                      <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 text-[10px] sm:text-[10.5px] tabular-nums whitespace-nowrap">
                        <span className="text-ink-600 font-medium inline-flex items-center gap-0.5"><Eye size={9.5} className="inline" />{formatShort(p.views || 0)}</span>
                        <span className="text-ink-500 inline-flex items-center gap-0.5"><Heart size={9.5} className="inline" />{formatShort(p.likes || 0)}</span>
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-semibold ${(Number(p.engagement_rate) || 0) >= 5 ? 'bg-emerald-50 text-emerald-700' : (Number(p.engagement_rate) || 0) >= 2 ? 'bg-indigo-50 text-indigo-700' : 'bg-ink-50 text-ink-600'}`}>
                          <Activity size={8.5} />{Number(p.engagement_rate || 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <motion.div variants={FADE_UP} initial="hidden" animate="show" className="bg-white rounded-2xl border border-black/[0.04] shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink-900 tracking-tight">{name} · 覆盖增长趋势</h2>
              <p className="text-[12px] text-ink-500 mt-0.5">近 30 天趋势 · 账号粉丝 + 社区成员 按平台拆分</p>
            </div>
            <GranularityChip value={platformTrendGranularity} onChange={setPlatformTrendGranularity} />
          </div>
          <div className="h-[300px] -ml-2">
            {loading && !data ? (
              <div className="h-full flex items-center justify-center"><RefreshCw size={20} className="animate-spin text-ink-300" /></div>
            ) : <GrowthChart data={aggregateTrend(data?.trend, platformTrendGranularity)} platforms={[platformStats.meta].filter(Boolean)} activeKey={activeSeries} setActiveKey={setActiveSeries} />}
          </div>
        </motion.div>

        <motion.div variants={FADE_UP} initial="hidden" animate="show">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-[15px] font-semibold text-ink-900 tracking-tight">平台监测对象明细</h2>
              <span className="text-[12px] text-ink-500">共 {filteredRecords.length} / {data?.latestRecords?.length || 0} 条 · 点击行查看明细</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <SelectChip value={entityType} options={entityTypeOptions} onChange={setEntityType} placeholder="类型" icon={LayoutGrid} />
              <SelectChip value={category} options={categoryOptions} onChange={setCategory} placeholder="分类" />
              <motion.button
                whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                onClick={() => { const ok = exportCSV(currentUid); if (!ok) exportCSVFromData(filteredRecords); }}
                className="h-10 px-3.5 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50/60 transition flex items-center gap-2 text-sm font-medium text-ink-700 shadow-sm">
                <Download size={15} className="text-ink-500" />导出 CSV
              </motion.button>
            </div>
          </div>
          <DataTable
            records={filteredRecords}
            showOperatorCols={isAdmin}
            onRowClick={setDetailRecord}
            onNavigateOperator={navigateToOperator}
            onNavigatePlatform={navigateToPlatform}
            operators={data?.operators || []}
            flashRecords={flashRecords}
            loading={loading && !data}
          />
        </motion.div>

        {top20.length > 0 && (
          <motion.div variants={STAGGER} initial="hidden" animate="show">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h2 className="text-[15px] font-semibold text-ink-900 tracking-tight">Top 20 作品卡片</h2>
                <p className="text-[12px] text-ink-500 mt-0.5">按互动率排序 · Hover 显示外链跳转</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {top20.map((p, i) => {
                const hasUrl = p?.url && p.url !== '#';
                return (
                  <motion.div
                    key={p.id || `top-${i}`}
                    variants={FADE_UP}
                    whileHover={{ y: -2 }}
                    onClick={() => hasUrl && openViralPost(p)}
                    style={{ cursor: hasUrl ? 'pointer' : 'default' }}
                    className={`group relative rounded-2xl border overflow-hidden bg-white transition hover:shadow-lg min-w-0 ${p.is_bomb ? 'border-amber-200/70' : 'border-black/[0.04]'}`}
                  >
                    {hasUrl && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); openViralPost(p); }}
                        className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-white/90 border border-black/[0.04] flex items-center justify-center text-ink-400 opacity-0 group-hover:opacity-100 transition hover:text-indigo-600 hover:bg-indigo-50 z-20 shrink-0 shadow-sm"
                        title="跳转原帖"
                        style={{ cursor: 'pointer' }}
                      >
                        <ExternalLink size={14} />
                      </button>
                    )}
                    <div className="h-32 relative" style={{ background: `linear-gradient(135deg, ${(p?.cover_gradient || '#6366f1,#8b5cf6').split(',')[0]}, ${(p?.cover_gradient || '#6366f1,#8b5cf6').split(',')[1]})` }}>
                      <div className="absolute top-2.5 left-2.5 w-7 h-7 rounded-lg bg-white/90 backdrop-blur-sm text-[11px] font-bold flex items-center justify-center text-ink-700 shadow-sm">#{i + 1}</div>
                      {p.is_bomb && (
                        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-0.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white shadow">
                          <Flame size={8.5} />爆
                        </span>
                      )}
                    </div>
                    <div className="p-3.5">
                      <div className="text-[13px] font-semibold text-ink-900 leading-snug line-clamp-2 break-words h-[38px]">{p.title || '该内容互动率突破临界值'}</div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="text-[10.5px] text-ink-500 truncate min-w-0">
                          <Clock size={9.5} className="inline mr-0.5" />{timeFromNow(p.published_at)} · {p._account}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-1.5 text-[11px] tabular-nums">
                        <span className="inline-flex items-center gap-0.5 text-ink-600 font-medium"><Eye size={11} />{formatShort(p.views || 0)}</span>
                        <span className="inline-flex items-center gap-0.5 text-ink-500"><Heart size={11} />{formatShort(p.likes || 0)}</span>
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-semibold ${(Number(p.engagement_rate) || 0) >= 5 ? 'bg-emerald-50 text-emerald-700' : (Number(p.engagement_rate) || 0) >= 2 ? 'bg-indigo-50 text-indigo-700' : 'bg-ink-50 text-ink-600'}`}>
                          <Activity size={9} />{Number(p.engagement_rate || 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-ink-900 font-sans">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/75 border-b border-black/[0.04]">
        <div className="max-w-[1480px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button
            onClick={navigateToHome}
            className="flex items-center gap-2 sm:gap-3 group transition min-w-0 max-w-[58%] sm:max-w-[48%]"
            title="返回首页"
            style={{ cursor: 'pointer' }}
          >
            <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-8 h-8 sm:w-9 sm:h-9 rounded-[12px] bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shrink-0">
              <BarChart3 size={17} className="text-white sm:w-5 sm:h-5" strokeWidth={2.3} />
            </motion.div>
            <div className="text-left min-w-0">
              <div className="text-[14px] sm:text-[15px] font-semibold tracking-tight text-ink-900 group-hover:text-indigo-600 transition-colors truncate">Matrix</div>
              <div className="hidden sm:block text-[11px] text-ink-500 -mt-0.5">监测看板 · v3.4</div>
              <div className="sm:hidden text-[10px] text-ink-500 -mt-0.5 truncate">v3.4 · 监测看板</div>
            </div>
            <div className="ml-2 sm:ml-3 hidden md:block">
              {isAdmin
                ? <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[10.5px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100/80 whitespace-nowrap"><Shield size={11} className="sm:w-3 sm:h-3" />管理员全景</span>
                : <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[10.5px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100/80 whitespace-nowrap"><UserCog size={11} className="sm:w-3 sm:h-3" />个人视角</span>}
            </div>
          </button>
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`hidden md:flex items-center gap-1.5 px-2 h-9 rounded-xl bg-ink-50/60 border border-black/[0.04] ${effectiveScopeUid || effectivePlatform ? '!hidden' : ''}`}>
              <Search size={15} className="text-ink-400 ml-1.5 shrink-0" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索账号/社区/运营" className="bg-transparent outline-none text-sm w-72 px-2 py-1 placeholder:text-ink-400" />
            </motion.div>
            {liveMode && (
              <motion.span
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="hidden sm:inline-flex items-center gap-1.5 text-[10.5px] sm:text-[11.5px] font-medium text-emerald-700 bg-emerald-50 px-2 sm:px-2.5 py-1.5 rounded-full whitespace-nowrap shrink-0"
              >
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500 opacity-70 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </span>
                <span className="hidden sm:inline">实时</span><span className="sm:hidden">Live</span>
              </motion.span>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setShowAISummaryModal(true)}
              className="h-9 sm:h-9 max-sm:h-11 max-sm:w-11 px-2 sm:px-3 rounded-xl border border-black/[0.06] bg-gradient-to-br from-violet-50 to-indigo-50 hover:from-violet-100 hover:to-indigo-100 transition flex items-center gap-1.5 text-sm font-medium text-indigo-700 disabled:opacity-50 shadow-sm shrink-0"
              title="AI 智能周报"
            >
              <Sparkles size={14} className="text-indigo-600 shrink-0 animate-pulse" />
              <span className="hidden sm:inline">AI 周报</span>
              {scopedDiagnosis?.length > 0 && <span className="text-[10.5px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-white text-indigo-700 border border-indigo-100 min-w-[20px] text-center">{scopedDiagnosis.length}</span>}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setShowViralHistory(v => !v)}
              className="h-9 sm:h-9 max-sm:h-11 max-sm:w-11 px-2 sm:px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-amber-50/60 transition flex items-center gap-1.5 text-sm font-medium text-ink-700 disabled:opacity-50 shadow-sm shrink-0"
              title={`历史爆款（${viralHistory.length} 条）`}
            >
              <Flame size={14} className="text-amber-600 shrink-0" />
              <span className="hidden sm:inline">爆款</span>
              <span className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 min-w-[20px] text-center">{viralHistory.length}</span>
            </motion.button>
            <motion.button
              whileHover={{ rotate: 15 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => loadData(currentUid)} disabled={loading}
              className="h-9 w-9 sm:h-9 sm:w-9 max-sm:h-11 max-sm:w-11 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50/60 transition flex items-center justify-center text-ink-600 disabled:opacity-50 shrink-0" title="刷新"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setShowCollectorModal(true)}
              className="h-9 sm:h-9 max-sm:h-11 max-sm:w-11 px-2 sm:px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-sky-50/60 transition flex items-center gap-1.5 text-sm font-medium text-ink-700 disabled:opacity-50 shadow-sm shrink-0"
              title="采集节点 / 告警配置"
            >
              <Cpu size={14} className="text-sky-600 shrink-0" />
              <span className="hidden sm:inline">节点</span>
              {data?.collectorMachines?.filter(m => !m.online)?.length > 0 && (
                <span className="relative inline-flex shrink-0">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-rose-400 opacity-70 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-rose-500" />
                </span>
              )}
            </motion.button>
            {isAdmin && data?.operators?.length > 1 && data?.platforms?.length > 0 && (
              <ScopeSelector
                operators={data.operators}
                platforms={data.platforms}
                selectedOperatorUid={selectedOperatorUid}
                effectivePlatformKey={effectivePlatform}
                onSelectOperator={(uid) => uid ? navigateToOperator(uid) : navigateToHome()}
                onSelectPlatform={(key) => key ? navigateToPlatform(key) : navigateToHome()}
              />
            )}
            <UserSwitcher value={currentUid} users={data?.operators || OPERATORS} onChange={setCurrentUid} />
          </div>
        </div>
      </header>

      <main className="max-w-[1480px] mx-auto px-4 sm:px-6 py-5 sm:py-7">
        <motion.div variants={STAGGER} initial="hidden" animate="show" className="flex flex-wrap items-end justify-between gap-4 mb-3">
          <motion.div variants={FADE_UP} className="w-full">
            <BreadcrumbBar />
          </motion.div>
        </motion.div>

        {scopedDiagnosis?.length > 0 && currentView !== 'platform' && (
          <motion.div
            variants={FADE_UP}
            initial="hidden"
            animate="show"
            className="mb-4 sm:mb-5 rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50/80 via-violet-50/60 to-fuchsia-50/70 shadow-sm overflow-hidden"
          >
            <div className="px-4 sm:px-5 py-3 sm:py-3.5 flex items-start gap-3 sm:gap-4">
              <div className="shrink-0 mt-0.5 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-200/60">
                <Sparkles size={18} className="text-white shrink-0 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <h3 className="text-[13.5px] sm:text-[14px] font-semibold text-indigo-900 tracking-tight">AI 智能诊断 · 实时异常监测</h3>
                  <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-white/80 border border-indigo-100 text-indigo-600 tabular-nums">{scopedDiagnosis.length} 条</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 py-1">
                  {scopedDiagnosis.map((d, di) => {
                    const sevColor = d.severity === 'critical'
                      ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100/80'
                      : (d.severity === 'major' ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/80' : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100/80');
                    const sevDot = d.severity === 'critical' ? 'bg-rose-500' : (d.severity === 'major' ? 'bg-amber-500' : 'bg-sky-500');
                    return (
                      <motion.button
                        key={d.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.04 * di }}
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setActiveDiagnosis(d)}
                        className={`shrink-0 h-10 sm:h-11 px-3 sm:px-3.5 rounded-xl border ${sevColor} flex items-center gap-2 text-[12px] sm:text-[12.5px] font-medium transition`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sevDot} ${d.severity !== 'minor' ? 'animate-pulse' : ''}`} />
                        <span className="truncate max-w-[min(260px,60vw)] sm:max-w-[360px]">{d.title} · {d.desc}</span>
                        <ChevronDown size={13} className="shrink-0 opacity-60 -rotate-90" />
                      </motion.button>
                    );
                  })}
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.93 }}
                onClick={() => setShowAISummaryModal(true)}
                className="shrink-0 h-9 sm:h-10 px-3 sm:px-3.5 rounded-xl bg-white/80 hover:bg-white border border-indigo-200/70 flex items-center gap-1.5 text-[12px] sm:text-[12.5px] font-semibold text-indigo-700 transition shadow-sm"
              >
                <Copy size={13} className="shrink-0" />
                <span className="hidden sm:inline">生成周报</span>
                <span className="sm:hidden">周报</span>
              </motion.button>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {currentView !== 'platform' && (
            <motion.div key={viewKey} variants={STAGGER} initial="hidden" animate="show" exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.24 }} className="space-y-4 sm:space-y-5">
              <motion.div variants={STAGGER} initial="hidden" animate="show" className="flex flex-wrap items-start justify-between gap-3 mb-4 sm:mb-5">
                <motion.div variants={FADE_UP} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h1 className="text-[26px] font-semibold tracking-tight text-ink-900 leading-tight">
                        {effectiveScopeUid
                          ? `${scopeStats?.opName || '个人'} · 个人绩效看板`
                          : (isAdmin ? '矩阵数据总览 · 全景' : `我的负责范围 · ${data?.currentUser?.operator_name || ''}`)}
                      </h1>
                      <p className="text-[13.5px] text-ink-500 mt-1.5">{headerSubtitle}</p>
                    </div>
                  </div>
                </motion.div>
                {currentView === 'home' && (
                  <motion.button
                    variants={FADE_UP}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowViralHistory(true)}
                    className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-black/[0.06] bg-white hover:bg-amber-50/60 text-sm font-medium text-ink-700 transition shadow-sm shrink-0"
                  >
                    <Flame size={15} className="text-amber-600" />历史爆款 · {viralHistory.length}
                  </motion.button>
                )}
                {(!effectiveScopeUid && !isAdmin) && data?.operatorStats?.[0] && (
                  <motion.div variants={FADE_UP} whileHover={{ y: -1 }} className="flex items-center gap-4">
                    <div className="flex items-center gap-2 rounded-xl bg-white border border-black/[0.04] px-4 py-2.5 shadow-sm">
                      <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center"><UserCog size={18} /></div>
                      <div>
                        <div className="text-[10.5px] text-ink-400 font-semibold uppercase tracking-wider">负责账号</div>
                        <div className="text-[16px] font-bold text-ink-900 -mt-0.5 tabular-nums">
                          <AnimatedNumber value={data.operatorStats[0].accounts_count + data.operatorStats[0].communities_count || 0} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                {effectiveScopeUid && scopeStats && (
                  <motion.div variants={FADE_UP} whileHover={{ y: -1 }} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100/70 px-4 py-2.5 shadow-sm">
                      <div className="w-9 h-9 rounded-xl bg-white/80 text-sky-700 flex items-center justify-center border border-sky-100/70"><UserCog size={18} /></div>
                      <div>
                        <div className="text-[10.5px] text-sky-600 font-semibold uppercase tracking-wider">负责监测对象</div>
                        <div className="text-[16px] font-bold text-ink-900 -mt-0.5 tabular-nums">
                          <AnimatedNumber value={scopeStats.accounts + scopeStats.communities || 0} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>

              {!effectiveScopeUid && (loading && !data ? (
                <motion.div variants={STAGGER} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 mb-5">
                  {[...Array(5)].map((_, i) => (
                    <motion.div key={i} variants={FADE_UP} className="bg-white rounded-2xl border border-black/[0.04] shadow-card p-5 flex flex-col gap-3">
                      <Skeleton w={40} h={40} className="rounded-xl" />
                      <div className="space-y-2">
                        <Skeleton w={'55%'} h={12} />
                        <Skeleton w={'80%'} h={26} />
                        <Skeleton w={'65%'} h={10} />
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                !effectiveScopeUid && (
                  <motion.div variants={STAGGER} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 mb-5">
                    <StatCard
                      icon={Users}
                      label={scopeStats ? '个人负责总粉丝' : '全网总粉丝（账号）'}
                      value={scopeStats ? scopeStats.totalFollowers : (data?.totalFollowers || 0)}
                      sub={scopeStats
                        ? `${scopeStats.opName} · ${scopeStats.accounts} 个账号累计`
                        : (isAdmin ? `所有 ${data?.accountCount || 0} 个账号最新统计` : '我负责的账号累计')}
                      accent="indigo"
                      trend={scopeStats ? null : '+12.4%'}
                      flash={!!scopeStats && (flashRecords.size > 0 || liveMode)}
                    />
                    <StatCard
                      icon={Users2}
                      label={scopeStats ? '个人社区覆盖' : '社区覆盖（成员）'}
                      value={scopeStats ? scopeStats.totalMembers : (data?.totalMembers || 0)}
                      sub={scopeStats
                        ? `${scopeStats.opName} 负责 · ${scopeStats.communities} 个社区`
                        : `${data?.communityCount || 0} 个公开社区/股票页`}
                      accent="violet"
                      trend={scopeStats ? null : '+5.2%'}
                      flash={!!scopeStats && (flashRecords.size > 0 || liveMode)}
                    />
                    <StatCard
                      icon={Eye}
                      label={scopeStats ? '个人近 7 天曝光' : '近 7 天总曝光量'}
                      value={scopeStats ? scopeStats.totalViews7d : (data?.totalViews7d || 0)}
                      sub={scopeStats ? `${scopeStats.opName} 名下曝光汇总` : '包含阅读 / 播放 / 消息量折算'}
                      accent="sky"
                      trend={scopeStats ? null : '+8.1%'}
                      flash={!!scopeStats && (flashRecords.size > 0 || liveMode)}
                    />
                    <StatCard
                      icon={LayoutGrid}
                      label={scopeStats ? '我的负责对象' : '涵盖监测对象'}
                      value={scopeStats ? (scopeStats.accounts + scopeStats.communities) : ((data?.accountCount || 0) + (data?.communityCount || 0))}
                      sub={scopeStats
                        ? `${scopeStats.accounts} 账号 · ${scopeStats.communities} 社区`
                        : `${data?.platformCount || 0} 平台 · ${data?.accountCount || 0} 账号 · ${data?.communityCount || 0} 社区`}
                      accent="emerald"
                    />
                    <StatCard
                      icon={AlertTriangle}
                      label={scopeStats ? '我的异常 / 掉线' : '异常 / 掉线'}
                      value={scopeStats ? scopeStats.abnormal : (data?.abnormalCount || 0)}
                      sub={scopeStats
                        ? ((scopeStats.abnormal || 0) > 0 ? `${scopeStats.opName} 名下需检查` : `${scopeStats.opName} 名下全部正常`)
                        : (((data?.abnormalCount || 0) > 0) ? '需尽快检查登录态或采集器在线' : '全部在线状态良好')}
                      accent={((scopeStats ? scopeStats.abnormal : (data?.abnormalCount || 0)) > 0) ? 'rose' : 'amber'}
                      animated={false}
                    />
                  </motion.div>
                )
              ))}

              {isAdmin && selectedOpStat && (
                <OperatorOverview
                  operatorStat={selectedOpStat}
                  onClose={navigateToHome}
                  onOpenRecord={setDetailRecord}
                  onSelectPlatform={(name) => navigateToPlatform(name)}
                />
              )}

              {isAdmin && data?.operatorStats?.length > 0 && !selectedOpStat && (
                <motion.div variants={FADE_UP} initial="hidden" animate="show" className="mb-6 bg-white rounded-2xl border border-black/[0.04] shadow-card p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className="text-[15px] font-semibold text-ink-900 tracking-tight">运营绩效对比</h2>
                      <p className="text-[12px] text-ink-500 mt-0.5">管理员视角 · 点击运营姓名进入个人综合绩效下钻</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 font-medium"><BarChart3 size={12} />按人维度</span>
                  </div>
                  <div className="h-[260px] -ml-2">
                    <OperatorPerformanceChart
                      stats={data.operatorStats}
                      onSelectOperator={navigateToOperator}
                      selectedUid={selectedOperatorUid}
                    />
                  </div>
                </motion.div>
              )}

              {stocktwitsRecords.length > 0 && (
                <motion.div variants={STAGGER} initial="hidden" animate="show" className="mb-6">
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-[#4263EB]/10 text-[#4263EB] flex items-center justify-center"><span className="font-bold text-[11px]">$</span></div>
                      <h2 className="text-[15px] font-semibold text-ink-900 tracking-tight">Stocktwits · 股票情绪监测</h2>
                      <span className="text-[12px] text-ink-400">{stocktwitsRecords.length} 只股票</span>
                    </div>
                  </div>
                  <motion.div variants={STAGGER} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stocktwitsRecords.map((r) => <StocktwitsCard key={`st-${r.account}`} r={r} onOpenDetail={setDetailRecord} onNavigateOperator={navigateToOperator} />)}
                  </motion.div>
                </motion.div>
              )}

              {redditRecords.length > 0 && (
                <motion.div variants={STAGGER} initial="hidden" animate="show" className="mb-6">
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-[#FF4500]/10 text-[#FF4500] flex items-center justify-center"><Globe2 size={15} /></div>
                      <h2 className="text-[15px] font-semibold text-ink-900 tracking-tight">Reddit · 社区活跃度监测</h2>
                      <span className="text-[12px] text-ink-400">{redditRecords.length} 个 Subreddit</span>
                    </div>
                  </div>
                  <motion.div variants={STAGGER} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {redditRecords.map((r) => <RedditCard key={`rd-${r.account}`} r={r} onOpenDetail={setDetailRecord} onNavigateOperator={navigateToOperator} />)}
                  </motion.div>
                </motion.div>
              )}

              <motion.div variants={STAGGER} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
                <motion.div variants={FADE_UP} className="lg:col-span-2 bg-white rounded-2xl border border-black/[0.04] shadow-card p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="min-w-0">
                      <h2 className="text-[14px] sm:text-[15px] font-semibold text-ink-900 tracking-tight truncate">各平台覆盖增长</h2>
                      <p className="text-[11.5px] sm:text-[12px] text-ink-500 mt-0.5 truncate">近 30 天趋势 · 账号粉丝 + 社区成员 按平台拆分</p>
                    </div>
                    <GranularityChip value={trendGranularity} onChange={setTrendGranularity} compact />
                  </div>
                  <div className="h-[260px] sm:h-[320px] max-sm:ml-0 -ml-2">
                    {loading && !data ? (
                      <div className="h-full flex items-center justify-center"><RefreshCw size={20} className="animate-spin text-ink-300" /></div>
                    ) : <GrowthChart data={aggregateTrend(scopeDerivedCharts ? scopeDerivedCharts.trend : (data?.trend), trendGranularity)} platforms={scopeDerivedCharts ? scopeDerivedCharts.platforms : (data?.platforms || [])} activeKey={activeSeries} setActiveKey={setActiveSeries} />}
                  </div>
                </motion.div>
                <motion.div variants={FADE_UP} className="bg-white rounded-2xl border border-black/[0.04] shadow-card p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="min-w-0">
                      <h2 className="text-[14px] sm:text-[15px] font-semibold text-ink-900 tracking-tight truncate">平台曝光占比</h2>
                      <p className="text-[11.5px] sm:text-[12px] text-ink-500 mt-0.5 truncate">按最新曝光量累计 · 点击扇区或图例进入平台看板</p>
                    </div>
                  </div>
                  <div className="h-[280px] sm:h-[320px]">
                    {loading && !data ? (
                      <div className="h-full flex items-center justify-center"><RefreshCw size={20} className="animate-spin text-ink-300" /></div>
                    ) : <TrafficPie data={scopeDerivedCharts ? scopeDerivedCharts.platformTraffic : (data?.platformTraffic || [])} activeName={activePie} setActiveName={setActivePie} onNavigatePlatform={navigateToPlatform} />}
                  </div>
                </motion.div>
              </motion.div>

              <motion.div variants={FADE_UP} initial="hidden" animate="show">
                <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <h2 className="text-[14px] sm:text-[15px] font-semibold text-ink-900 tracking-tight whitespace-nowrap">监测对象明细</h2>
                    <span className="text-[11px] sm:text-[12px] text-ink-500 truncate">共 {filteredRecords.length} / {data?.latestRecords?.length || 0} 条 · 点击行查看明细</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 max-sm:w-full">
                    <SelectChip value={entityType} options={entityTypeOptions} onChange={setEntityType} placeholder="类型" icon={LayoutGrid} />
                    <SelectChip value={category} options={categoryOptions} onChange={setCategory} placeholder="分类" />
                    <SelectChip value={platform} options={platformOptions} onChange={(key) => key === 'all' ? setPlatform('all') : navigateToPlatform(key)} placeholder="平台" icon={Globe2} />
                    <motion.button
                      whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                      onClick={() => { const ok = exportCSV(currentUid); if (!ok) exportCSVFromData(filteredRecords); }}
                      className="max-sm:h-11 max-sm:flex-1 min-w-[80px] h-10 px-3 sm:px-3.5 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50/60 transition flex items-center justify-center gap-2 text-sm font-medium text-ink-700 shadow-sm whitespace-nowrap">
                      <Download size={15} className="text-ink-500 shrink-0" /><span className="max-sm:inline hidden sm:inline">导出 CSV</span><span className="sm:hidden inline">导出</span>
                    </motion.button>
                    <motion.button
                      whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                      onClick={clearSession} title="清除会话（清除 JWT + 登录人）"
                      className="max-sm:h-11 max-sm:w-11 h-10 w-10 rounded-xl border border-black/[0.06] bg-white hover:bg-rose-50 hover:border-rose-200/80 transition flex items-center justify-center text-ink-500 hover:text-rose-600 shadow-sm shrink-0">
                      <Shield size={15} />
                    </motion.button>
                  </div>
                </div>
                <DataTable
                  records={filteredRecords}
                  showOperatorCols={isAdmin}
                  onRowClick={setDetailRecord}
                  onNavigateOperator={navigateToOperator}
                  onNavigatePlatform={navigateToPlatform}
                  operators={data?.operators || []}
                  flashRecords={flashRecords}
                  loading={loading && !data}
                />
              </motion.div>
            </motion.div>
          )}

          {currentView === 'platform' && (
            <motion.div key={viewKey} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24 }}>
              <PlatformView />
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-12 pb-4 text-center text-[11.5px] text-ink-400">
          Matrix Monitor v3.4 · 独立平台页全屏视图 · 单条常驻爆款 + 历史抽屉 · 全局下钻锚点 · 统一面包屑导航 · RBAC 分布式溯源
        </footer>
      </main>

      <AccountDetailDrawer
        record={detailRecord}
        onClose={() => setDetailRecord(null)}
        flashIds={flashIds}
        onNavigateOperator={navigateToOperator}
        onNavigatePlatform={navigateToPlatform}
      />
      <ViralPostToast
        item={activeViralAlert}
        onDismiss={(id) => {
          if (activeViralAlert && activeViralAlert.id === id) {
            pushViralToHistory(activeViralAlert);
            setActiveViralAlert(null);
          }
        }}
        onOpenPost={openViralPost}
        onNavigateOperator={navigateToOperator}
        onNavigatePlatform={navigateToPlatform}
      />
      <ViralHistoryDrawer />

      <AISummaryModal
        open={showAISummaryModal}
        onClose={() => setShowAISummaryModal(false)}
        data={data}
        scopeUid={effectiveScopeUid}
        operatorName={scopeStats?.opName || null}
        generateFn={generateWeeklyReportMarkdown}
        onToast={showToast}
      />
      <CollectorHealthModal
        open={showCollectorModal}
        onClose={() => setShowCollectorModal(false)}
        collectorMachines={data?.collectorMachines || []}
        onToast={showToast}
      />
      <DiagnosisDetailModal
        open={activeDiagnosis !== null}
        diagnosis={activeDiagnosis}
        data={data}
        onClose={() => setActiveDiagnosis(null)}
        onNavigateOperator={(uid, name) => { setActiveDiagnosis(null); navigateToOperator(uid, name); }}
        onNavigatePlatform={(key, name) => { setActiveDiagnosis(null); navigateToPlatform(key, name); }}
      />

      <AnimatePresence>
        {globalToast && (
          <motion.div
            key={globalToast.id}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="fixed z-[9999] left-1/2 -translate-x-1/2 bottom-5 sm:bottom-8 max-w-[min(92vw,440px)] w-full"
          >
            <div className={`px-4 sm:px-4.5 py-3 rounded-2xl shadow-xl border backdrop-blur-xl flex items-center gap-3 ${
              globalToast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200/70 text-emerald-800'
                : (globalToast.type === 'warning'
                  ? 'bg-amber-50/95 border-amber-200/70 text-amber-800'
                  : (globalToast.type === 'error'
                    ? 'bg-rose-50/95 border-rose-200/70 text-rose-800'
                    : 'bg-white/95 border-black/[0.08] text-ink-800'))
            }`}>
              <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
                globalToast.type === 'success' ? 'bg-emerald-100'
                  : (globalToast.type === 'warning' ? 'bg-amber-100'
                    : (globalToast.type === 'error' ? 'bg-rose-100' : 'bg-indigo-100'))
              }`}>
                {globalToast.type === 'success' ? <BellRing size={15} className="text-emerald-600" />
                  : (globalToast.type === 'warning' ? <AlertOctagon size={15} className="text-amber-600" />
                    : (globalToast.type === 'error' ? <AlertTriangle size={15} className="text-rose-600" />
                      : <Sparkles size={15} className="text-indigo-600" />))}
              </div>
              <div className="min-w-0 flex-1 text-[13px] sm:text-[13.5px] font-medium leading-snug break-words">{globalToast.msg}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
