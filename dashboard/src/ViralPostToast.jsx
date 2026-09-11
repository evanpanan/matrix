import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, ExternalLink, Eye, Heart, Activity, User, Building2 } from 'lucide-react';
import { sanitizeUrl } from './lib/api.js';

function formatShort(n) {
  if (n == null) return '—';
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return new Intl.NumberFormat('zh-CN').format(Math.round(n));
}

function AnimatedNumber({ value, duration = 0.9, format = v => v }) {
  const [display, setDisplay] = useState(0);
  const rafRef = React.useRef(0);
  const fromRef = React.useRef(0);
  useEffect(() => {
    const start = performance.now();
    const from = fromRef.current || 0;
    const to = Number(value) || 0;
    cancelAnimationFrame(rafRef.current);
    function tick(now) {
      const p = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);
  return format(display);
}

function openPost(p) {
  if (!p?.url) return;
  const safe = sanitizeUrl(p.url);
  if (safe === '#') return;
  window.open(safe, '_blank', 'noopener,noreferrer');
}

function ViralBanner({ item, onClose, onOpenPost, onNavigateOperator, onNavigatePlatform }) {
  const p = item.post;
  const c = p?.cover_gradient || '#6366f1,#8b5cf6';
  const [c1, c2] = c.split(',');
  const safeUrl = sanitizeUrl(p?.url);
  const hasValidUrl = !!(safeUrl && safeUrl !== '#');
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      style={{ cursor: 'default' }}
      className="group relative rounded-2xl border shadow-[0_18px_48px_rgba(239,68,68,0.18)] overflow-hidden border-amber-200/80 bg-gradient-to-br from-white via-amber-50/40 to-rose-50/40 max-sm:rounded-xl"
    >
      <span className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-amber-400 via-rose-500 to-orange-500" />
      <div className="relative p-3 sm:p-3.5 pr-3 max-sm:px-3 max-sm:py-3">
        <div className="flex items-center gap-2.5 mb-2.5 relative z-20">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-sm shrink-0">
            <Flame size={11} className="sm:w-3 sm:h-3" />爆款诞生
          </span>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onNavigateOperator?.(item.operator_uid || null, item.operator_name); }}
            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-100/90 to-rose-100/85 border border-amber-200/60 hover:from-amber-200 hover:to-rose-200 hover:border-amber-300 transition shadow-sm shrink-0 min-w-0 max-sm:h-11"
            style={{ cursor: item.operator_uid ? 'pointer' : 'default' }}
            disabled={!item.operator_uid}
          >
            <Building2 size={11} className="text-amber-700 shrink-0" />
            <span className="text-[11px] sm:text-[11.5px] font-extrabold tracking-tight text-amber-800 truncate max-w-[96px] sm:max-w-[140px]">{item.operator_name || '—'}</span>
            <span className="hidden sm:inline text-[9.5px] text-amber-600/80 font-semibold shrink-0">· 所属运营</span>
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 shrink-0">
            {hasValidUrl && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onOpenPost?.(p) || openPost(p); }}
                className="w-8 h-8 sm:w-9 sm:h-9 max-sm:h-11 max-sm:w-11 rounded-xl bg-white/90 border border-amber-200/60 flex items-center justify-center text-amber-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 transition shadow-sm"
                title="新标签页打开原帖"
                style={{ cursor: 'pointer' }}
              >
                <ExternalLink size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onClose?.(); }}
              className="w-8 h-8 sm:w-9 sm:h-9 max-sm:h-11 max-sm:w-11 rounded-xl bg-white/80 border border-black/[0.04] flex items-center justify-center text-ink-500 hover:text-rose-600 hover:bg-rose-50/80 transition relative z-20"
              title="关闭通知"
              style={{ cursor: 'pointer' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 min-w-0">
          <button
            type="button"
            onClick={() => hasValidUrl && (onOpenPost?.(p) || openPost(p))}
            className="relative shrink-0 group/cover"
            style={{ cursor: hasValidUrl ? 'pointer' : 'default' }}
            disabled={!hasValidUrl}
          >
            <div className="w-[72px] h-[72px] rounded-xl overflow-hidden shadow-inner ring-1 ring-black/[0.04] group-hover/cover:ring-amber-300 transition">
              <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />
            </div>
            {p?.is_bomb && (
              <span className="absolute -top-1.5 -left-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white shadow">
                <Flame size={8} />爆
              </span>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => hasValidUrl && (onOpenPost?.(p) || openPost(p))}
              className="block w-full text-left group/title"
              style={{ cursor: hasValidUrl ? 'pointer' : 'default' }}
              disabled={!hasValidUrl}
            >
              <div className="text-[13px] font-bold text-ink-900 leading-snug line-clamp-2 group-hover/title:text-amber-700 transition-colors">
                {p?.title || '该内容互动率突破临界值'}
              </div>
            </button>

            <div className="mt-1.5 flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[10.5px] text-ink-500">
              <span className="inline-flex items-center gap-1">
                <User size={10.5} />{item.account}
              </span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onNavigatePlatform?.(item.platform_key, item.platform_name); }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/80 border border-black/[0.04] text-[10px] font-medium hover:brightness-105 transition"
                style={{ cursor: 'pointer', color: item.color || '#6366f1' }}
              >
                <span className="w-1.5 h-1.5 rounded-full mr-0.5" style={{ background: item.color || '#6366f1' }} />{item.platform_name || '—'}
              </button>
            </div>

            <div className="mt-2 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11.5px] tabular-nums">
              <span className="inline-flex items-center gap-1 font-semibold text-ink-700">
                <Eye size={12} />
                <AnimatedNumber value={p?.views || 0} format={v => formatShort(Math.round(v))} />
                <span className="text-emerald-600 font-bold text-[10.5px] ml-0.5 inline-flex items-center gap-0.5">
                  ↑+{formatShort((p?.views || 0) * (0.08 + (item.surgeIndex || 0) * 0.05) | 0)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-ink-600">
                <Heart size={12} />
                <AnimatedNumber value={p?.likes || 0} format={v => formatShort(Math.round(v))} />
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold">
                <Activity size={11} />
                {Number(p?.engagement_rate || 0).toFixed(2)}%
                <span className="text-[9.5px] ml-0.5 opacity-80">↑+{Number(item.engagementDelta || 0.3).toFixed(2)}pp</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function ViralPostToast({ item, onDismiss, onOpenPost, onNavigateOperator, onNavigatePlatform }) {
  if (!item) return null;
  return (
    <div className="fixed z-[60] right-2 sm:right-6 bottom-2 sm:bottom-6 w-[92vw] sm:w-[380px] max-w-[min(340px,92vw)] sm:max-w-none pointer-events-none max-sm:left-2 sm:left-auto">
      <AnimatePresence initial={false}>
        <div key={item.id} className="pointer-events-auto">
          <ViralBanner
            item={item}
            onClose={() => onDismiss?.(item.id, { reason: 'manual' })}
            onOpenPost={onOpenPost}
            onNavigateOperator={onNavigateOperator}
            onNavigatePlatform={onNavigatePlatform}
          />
        </div>
      </AnimatePresence>
    </div>
  );
}
