import React, { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Globe2, UserCog, MonitorDot, RefreshCw, ExternalLink, X, Layers, Clock, Flame,
  Eye, Heart, MessageCircle, Repeat2, Activity,
} from 'lucide-react';

import { PLATFORM_META, sanitizeUrl } from './lib/api.js';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const FADE_UP = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

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

export default function AccountDetailDrawer({ record, onClose, flashIds = new Set(), onNavigateOperator, onNavigatePlatform }) {
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

  const platformNameToKey = (name) => {
    const meta = PLATFORM_META[name] || Object.values(PLATFORM_META).find(m => m.name === name);
    return meta?.key || name;
  };

  const openPost = (p) => {
    if (!p?.url) return;
    const safe = sanitizeUrl(p.url);
    if (safe === '#') return;
    window.open(safe, '_blank', 'noopener,noreferrer');
  };

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
            className="fixed top-0 right-0 z-50 h-full w-[92%] sm:w-[600px] lg:w-[680px] max-sm:w-[92vw] bg-white shadow-[0_20px_80px_rgba(0,0,0,0.18)] border-l border-black/[0.06] flex flex-col"
          >
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-black/[0.04] flex items-start gap-3 sm:gap-4">
              <Avatar gradient={record.avatar_gradient} name={record.account} size={56} className="w-11 h-11 sm:w-14 sm:h-14" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[18px] sm:text-[20px] font-bold tracking-tight text-ink-900 truncate max-sm:max-w-[160px]">{record.account}</h3>
                  {record.abnormal && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">掉线</span>}
                  {record.entity_type === 'COMMUNITY' ? (
                    <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-bold px-2 py-0.5 bg-violet-50 text-violet-700"><Globe2 size={10} />社区</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-bold px-2 py-0.5 bg-sky-50 text-sky-700"><UserCog size={10} />账号</span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onNavigatePlatform?.(platformNameToKey(record.platform), record.platform); }}
                    title="进入平台看板"
                    style={{ cursor: onNavigatePlatform ? 'pointer' : 'default' }}
                    className="transition hover:brightness-95"
                  >
                    <PlatformTag name={record.platform} />
                  </button>
                  {record.assigned_operator_name && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onNavigateOperator?.(record.assigned_operator_uid, record.assigned_operator_name); }}
                      disabled={!record.assigned_operator_uid}
                      title="进入个人看板"
                      style={{ cursor: record.assigned_operator_uid ? 'pointer' : 'default' }}
                      className="inline-flex items-center gap-1.5 text-[12px] text-ink-500 hover:text-amber-700 transition disabled:hover:text-current"
                    >
                      <UserAvatar name={record.assigned_operator_name} size={18} />
                      归属 · {record.assigned_operator_name}
                    </button>
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
                  <a href={record.url} target="_blank" rel="noreferrer" className="h-9 w-9 max-sm:h-11 max-sm:w-11 rounded-xl flex items-center justify-center text-ink-500 hover:bg-ink-50 hover:text-ink-800 transition" title="跳转原页">
                    <ExternalLink size={15} />
                  </a>
                )}
                <button onClick={onClose} className="h-9 w-9 max-sm:h-11 max-sm:w-11 rounded-xl flex items-center justify-center text-ink-500 hover:bg-ink-50 hover:text-ink-800 transition">
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 sm:px-6 py-4 sm:py-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                          <linearGradient id="adf" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="adv" x1="0" y1="0" x2="0" y2="1">
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
                        <Line yAxisId="left" type="monotone" dataKey="followers" name={record.entity_type === 'COMMUNITY' ? 'Members' : '粉丝'} stroke="#6366f1" strokeWidth={2.2} dot={false} activeDot={{ r: 3, stroke: '#fff', strokeWidth: 2 }} fill="url(#adf)" />
                        <Line yAxisId="right" type="monotone" dataKey="views" name="曝光/消息" stroke="#0ea5e9" strokeWidth={2.2} dot={false} activeDot={{ r: 3, stroke: '#fff', strokeWidth: 2 }} fill="url(#adv)" />
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
                    <p className="text-[11.5px] text-ink-500 mt-0.5">共 {(record?.posts?.length || 0)} 条 · Top 10 · 点击卡片跳转原帖</p>
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
                      <div key="empty" className="py-16 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06]">暂无作品数据</div>
                    )}
                    {posts.map((p, idx) => (
                      <motion.div
                        key={p.id || idx}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ delay: idx * 0.03 }}
                        onClick={() => openPost(p)}
                        whileHover={{ y: -2 }}
                        style={{ cursor: p?.url && p.url !== '#' ? 'pointer' : 'default' }}
                        className={`group relative rounded-2xl border p-4 flex gap-4 transition hover:shadow-md hover:border-indigo-100 ${p.is_bomb ? 'border-amber-200/60 bg-gradient-to-br from-amber-50/60 to-transparent' : 'border-black/[0.04] bg-white'}`}
                      >
                        {p?.url && p.url !== '#' && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-white border border-black/[0.04] flex items-center justify-center text-ink-400 opacity-0 group-hover:opacity-100 transition hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-100 z-10"
                            title="跳转原帖"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
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
                        <div className="flex-1 min-w-0 pr-8">
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="text-[13.5px] font-semibold text-ink-900 leading-snug line-clamp-2">{p.title}</h5>
                          </div>
                          {p.summary && <p className="mt-1 text-[11.5px] text-ink-500 leading-snug line-clamp-1">{p.summary}</p>}
                          <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-3 text-[11px] text-ink-500">
                              <span className="inline-flex items-center gap-1"><Clock size={11} />{timeFromNow(p.published_at)}</span>
                              <motion.span
                                animate={flashIds?.has(p.id) ? { color: ['#71717a', '#22c55e', '#71717a'] } : { color: '#71717a' }}
                                transition={{ duration: 1.2, ease: 'easeOut' }}
                                className="inline-flex items-center gap-1 font-semibold tabular-nums"
                              >
                                <Eye size={11} />{formatShort(p.views || 0)}
                              </motion.span>
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
