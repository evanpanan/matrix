import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Eye, Layers, Activity, X, ExternalLink,
  Clock, Heart, MessageCircle, Repeat2, Flame, TrendingUp,
} from 'lucide-react';

import { PLATFORM_META, PLATFORM_LOGOS, sanitizeUrl, dedupPosts, pickPostCover } from './lib/api.js';
import { PLATFORM_METRIC_SEMANTICS } from './lib/mockData.js';

dayjs.extend(relativeTime);

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

function PlatformTag({ name, size = 'md' }) {
  const meta = PLATFORM_META[name] || PLATFORM_META[name?.replace(/\s*\(.*\)/, '')];
  const color = meta?.color || '#6366f1';
  const sz = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium shrink-0 ${sz}`} style={{ background: `${color}12`, color }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {name}
    </span>
  );
}

function Avatar({ gradient, name, size = 40, src, dataUrl, platformKey, platformName }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = dataUrl || src || null;
  const fallback = () => {
    const pm = PLATFORM_META[platformKey] || Object.values(PLATFORM_META).find(m => m.key === platformKey || m.name === (platformKey || platformName));
    const color = pm?.color || '#6366f1';
    const logoSvg = PLATFORM_LOGOS?.[pm?.key] || pm?.logo_svg || null;
    const [a, b] = (gradient || (pm ? (color + ',' + '#6366f1') : '#6366f1,#8b5cf6')).split(',');
    return (
      <div
        className="rounded-2xl flex items-center justify-center text-white font-semibold shadow-inner shrink-0"
        style={{
          width: size, height: size, fontSize: size * 0.36,
          background: (logoSvg ? color : `linear-gradient(135deg, ${a}, ${b})`),
          letterSpacing: '0.02em',
        }}
      >
        {logoSvg ? (
          <span style={{ color: '#ffffff', width: Math.round(size * 0.56), height: Math.round(size * 0.56), display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: logoSvg }} />
        ) : (name ? name.slice(0, 1) : '?')}
      </div>
    );
  };
  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name || ''}
        onError={(e) => { setFailed(true); try { e.target.onerror = null; } catch {} }}
        className="rounded-2xl object-cover shrink-0 shadow-inner"
        style={{ width: size, height: size }}
      />
    );
  }
  return fallback();
}

function AnimatedNumber({ value, format = v => v, duration = 0.9 }) {
  const [display, setDisplay] = React.useState(0);
  const prevRef = React.useRef(0);
  React.useEffect(() => {
    const start = performance.now();
    const from = prevRef.current;
    const to = Number(value) || 0;
    let raf = 0;
    function tick(now) {
      const p = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = from + (to - from) * eased;
      setDisplay(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return format(display);
}

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

function openPost(p) {
  if (!p?.url) return;
  const safe = sanitizeUrl(p.url);
  if (safe === '#') return;
  window.open(safe, '_blank', 'noopener,noreferrer');
}

export default function PlatformDetailModal({ platformName, records, onClose }) {
  const platformMeta = PLATFORM_META[platformName] || PLATFORM_META[platformName?.replace(/\s*\(.*\)/, '')];
  const color = platformMeta?.color || '#6366f1';

  const platRecords = useMemo(() => {
    return (records || []).filter(r => r.platform === platformName || r.platform_key === platformMeta?.key);
  }, [records, platformName, platformMeta]);

  const totals = useMemo(() => {
    let followers = 0, members = 0, views = 0, likes = 0, posts = 0, engagementSum = 0, engagementCount = 0;
    platRecords.forEach(r => {
      if (r.entity_type === 'ACCOUNT') followers += (r.followers || 0);
      else members += (r.members || 0);
      views += (r.views || 0);
      likes += (r.likes || 0);
      if (r.engagement_rate && Number(r.engagement_rate) > 0) { engagementSum += Number(r.engagement_rate); engagementCount += 1; }
      (r.posts || []).forEach(p => {
        posts += 1;
        if (p.engagement_rate && Number(p.engagement_rate) > 0) { engagementSum += Number(p.engagement_rate); engagementCount += 1; }
      });
    });
    return {
      audience: followers + members,
      followers, members,
      views, likes, posts,
      avgEngagement: engagementCount > 0 ? (engagementSum / engagementCount) : 0,
    };
  }, [platRecords]);

  const contribution = useMemo(() => {
    const list = platRecords.map(r => ({
      account: r.account,
      avatar_gradient: r.avatar_gradient,
      views: r.views || 0,
      audience: r.entity_type === 'COMMUNITY' ? (r.members || 0) : (r.followers || 0),
      platform: r.platform,
      platform_key: r.platform_key,
      entity_type: r.entity_type,
      _metric: r._metric,
    }));
    list.sort((a, b) => b.views - a.views);
    return list;
  }, [platRecords]);
  const maxViews = Math.max(1, ...contribution.map(c => c.views));

  const topPosts = useMemo(() => {
    const all = platRecords.flatMap(r => (r.posts || []).map(p => ({ ...p, _account: r.account, _platform: r.platform, platform_key: r.platform_key })));
    const deduped = dedupPosts(all, platformMeta?.key);
    deduped.sort((a, b) => Number(b.engagement_rate || 0) - Number(a.engagement_rate || 0));
    return deduped.slice(0, 5);
  }, [platRecords, platformMeta]);

  return (
    <AnimatePresence>
      {platformName && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px]"
            onClick={onClose}
          />
          <div
            className="fixed z-50 left-1/2 top-1/2"
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <motion.div
              key="modal"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              style={{ width: 'min(96vw, 80rem)' }}
              className="max-h-[88vh] overflow-hidden rounded-3xl bg-[#fafafa] border border-black/[0.06] shadow-[0_40px_120px_rgba(0,0,0,0.22)] flex flex-col"
            >
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3.5 sm:pb-4 flex items-start justify-between gap-3 border-b border-black/[0.04] bg-white/60 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
                  <span className="w-3.5 h-3.5 rounded-full" style={{ background: color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-[16px] sm:text-[18px] sm:text-[20px] font-bold tracking-tight text-ink-900 truncate">{platformName}</h2>
                    <PlatformTag name={platformName} size="sm" />
                  </div>
                  <p className="text-[11.5px] sm:text-[12px] text-ink-500 mt-1 leading-snug">平台汇总分析 · {platRecords.length} 个监测对象 · 点击平台饼图扇区或 Tag 可进入</p>
                </div>
              </div>
              <button onClick={onClose} className="max-sm:h-11 max-sm:w-11 h-9 w-9 rounded-xl flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition shrink-0 bg-white/80 border border-black/[0.04]" title="关闭">
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
                <StatCardMini icon={Users} label="总粉丝 / 成员" value={totals.audience} accent="indigo" sub={`${formatShort(totals.followers)} 账号粉丝 + ${formatShort(totals.members)} 社区成员`} />
                <StatCardMini icon={Eye} label="总曝光 / 阅读" value={totals.views} accent="sky" sub="全量账号曝光 + 社区消息折算" />
                <StatCardMini icon={Layers} label="总发布作品数" value={totals.posts} accent="emerald" sub="抓取到的最新帖子 / 视频数" />
                <StatCardMini icon={Activity} label="平均互动率 %" value={totals.avgEngagement} accent="amber" sub={`${Number(totals.avgEngagement).toFixed(2)}% · ${totals.posts > 0 ? `共 ${totals.posts} 条样本` : '暂无'}`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-black/[0.04] p-4 sm:p-5 min-w-0">
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
                        <Avatar gradient={c.avatar_gradient} name={c.account} size={34} src={c.avatar_url} dataUrl={c.avatar_data_url} platformKey={c.platform_key} platformName={c.platform} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 sm:gap-3 mb-1.5">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                              <span className="text-[12.5px] sm:text-[13px] font-semibold text-ink-900 truncate">{c.account}</span>
                              {c.entity_type === 'COMMUNITY' && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 shrink-0">社区</span>}
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-[10.5px] sm:text-[11.5px] tabular-nums whitespace-nowrap">
                              <span className="text-ink-600 font-medium">{formatShort(c.audience)} 粉</span>
                              <span className="inline-flex items-center text-ink-900 font-bold text-[11.5px] sm:text-[12px]">
                                {formatShort(c.views)}
                                {(() => {
                                  const pk = c.platform_key || platformMeta?.key || Object.keys(PLATFORM_META).find(k => PLATFORM_META[k]?.name === c.platform);
                                  const volumeLabel = pk && PLATFORM_METRIC_SEMANTICS[pk]?.volume_label || c._metric?.volume_label;
                                  return volumeLabel ? <span className="text-[10px] ml-1 text-ink-400 font-normal">{volumeLabel}</span> : null;
                                })()}
                              </span>
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
                </div>

                <div className="bg-white rounded-2xl border border-black/[0.04] p-4 sm:p-5 min-w-0">
                  <div className="flex items-center justify-between mb-3 sm:mb-3.5 gap-2 flex-wrap">
                    <div className="min-w-0">
                      <h3 className="text-[13.5px] sm:text-[14px] font-semibold text-ink-900 tracking-tight flex items-center gap-1.5">
                        <Flame size={15} />Top 5 爆款作品
                      </h3>
                      <p className="text-[11px] sm:text-[11.5px] text-ink-500 mt-0.5 leading-snug">按互动率排序 · 点击跳转原帖</p>
                    </div>
                  </div>
                  <div className="space-y-2 sm:space-y-2.5">
                    {topPosts.length === 0 && (
                      <div className="py-14 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06]">暂无作品数据</div>
                    )}
                    {topPosts.map((p, i) => (
                      <motion.div
                        key={p.id || i}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.05 }}
                        onClick={() => openPost(p)}
                        whileHover={{ y: -1 }}
                        style={{ cursor: p?.url && p.url !== '#' ? 'pointer' : 'default' }}
                        className={`group relative rounded-xl border p-2.5 sm:p-3 flex gap-2.5 sm:gap-3 transition hover:shadow-md hover:border-indigo-100 min-w-0 ${p.is_bomb ? 'border-amber-200/60 bg-gradient-to-br from-amber-50/60 to-transparent' : 'border-black/[0.04] bg-white'}`}
                      >
                        {p?.url && p.url !== '#' && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); openPost(p); }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-white border border-black/[0.04] flex items-center justify-center text-ink-400 opacity-0 group-hover:opacity-100 transition hover:text-indigo-600 hover:bg-indigo-50 z-20"
                            title="跳转原帖"
                            style={{ cursor: 'pointer' }}
                          ><ExternalLink size={12} /></button>
                        )}
                        <div className="relative shrink-0">
                          {(() => {
                            const thumb = pickPostCover(p, platformMeta?.key || p.platform_key);
                            const grad = (p.cover_gradient || thumb.gradient || '#6366f1,#8b5cf6').split(',');
                            const meta = PLATFORM_META[thumb.platform_key || platformMeta?.key || p.platform_key];
                            const logo = PLATFORM_LOGOS[thumb.platform_key || platformMeta?.key || p.platform_key];
                            if (thumb.src) {
                              return (
                                <div className="w-[48px] h-[48px] sm:w-[54px] sm:h-[54px] rounded-lg overflow-hidden bg-ink-50 shrink-0 relative">
                                  <img
                                    src={thumb.src}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      if (e.currentTarget.dataset.fallback === '1') return;
                                      e.currentTarget.dataset.fallback = '1';
                                      e.currentTarget.remove();
                                    }}
                                  />
                                </div>
                              );
                            }
                            return (
                              <div className="w-[48px] h-[48px] sm:w-[54px] sm:h-[54px] rounded-lg overflow-hidden shrink-0 relative">
                                <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})` }} />
                                {logo ? (
                                  <div
                                    className="absolute inset-0 flex items-center justify-center text-white/95"
                                    dangerouslySetInnerHTML={{ __html: logo }}
                                    style={{ opacity: 0.82, transform: 'scale(0.62)' }}
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-white text-[18px] sm:text-[20px] font-bold tracking-tight opacity-90">
                                    #{i + 1}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
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
                </div>
              </div>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
