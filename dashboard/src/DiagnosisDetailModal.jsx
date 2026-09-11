import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, AlertOctagon, AlertTriangle, TrendingDown, Users,
  Globe2, ExternalLink, ChevronRight,
} from 'lucide-react';

const ICONS = { AlertOctagon, AlertTriangle, TrendingDown };

const SEV_META = {
  critical: { label: '严重', badge: 'bg-rose-100 text-rose-700 border-rose-200', bar: 'bg-gradient-to-r from-rose-500 to-rose-400', ring: 'ring-rose-200/80' },
  major:    { label: '重要', badge: 'bg-amber-100 text-amber-800 border-amber-200', bar: 'bg-gradient-to-r from-amber-500 to-orange-400', ring: 'ring-amber-200/80' },
  minor:    { label: '提示', badge: 'bg-sky-100 text-sky-700 border-sky-200',     bar: 'bg-gradient-to-r from-sky-500 to-indigo-400', ring: 'ring-sky-200/80' },
};

const SUGGESTIONS = {
  abnormal_drop: [
    '在「节点」面板重启对应采集机（Collector），检查登录态是否过期',
    '重新登录指纹浏览器，确保账号在线状态稳定',
    '检查 JWT/会话有效期，若已过期则重新签发 token',
  ],
  stalled_data: [
    '检查该社区/账号的最新上报时间是否超过 24h',
    '验证采集规则（XPath/CSS 选择器）是否因站点改版失效',
    '若为公开社区，确认是否有频率限制或反爬封禁',
  ],
  reading_drop: [
    '对比同期爆款选题，参考 Viral History 选题趋势优化内容角度',
    '本周建议增加 2-3 条高频时段发布（7-9 点 / 19-22 点）',
    '适当加大投放预算，优先推最近 7 天互动率 Top3 内容',
  ],
};

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

function formatShort(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(1).replace(/\.0$/, '') + ' 亿';
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1).replace(/\.0$/, '') + ' 万';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v));
}

export default function DiagnosisDetailModal({
  open,
  onClose,
  diagnosis,
  data,
  onNavigateOperator = () => {},
  onNavigatePlatform = () => {},
}) {
  const sev = SEV_META[diagnosis?.severity || 'minor'];
  const Icon = diagnosis?.icon ? (ICONS[diagnosis.icon] || AlertTriangle) : AlertTriangle;
  const suggestions = SUGGESTIONS[diagnosis?.type] || [
    '检查采集节点在线状态与最近上报时间',
    '参考历史爆款内容调整选题与发布节奏',
  ];
  const targets = React.useMemo(() => {
    if (!data?.latestRecords || !diagnosis?.target_ids?.length) return [];
    const ids = new Set(diagnosis.target_ids);
    return data.latestRecords.filter(r => ids.has(r.id)).slice(0, 5);
  }, [diagnosis, data]);
  return (
    <AnimatePresence>
      {open && diagnosis && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <div
            className="fixed z-50 left-1/2 top-1/2 w-[92vw] sm:w-[620px] max-w-[96vw] max-h-[86vh]"
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <motion.div
              key="modal"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="w-full h-full flex flex-col rounded-3xl bg-[#fbfbfc] border border-black/[0.06] shadow-[0_40px_120px_rgba(0,0,0,0.25)] overflow-hidden ring-1 ring-white/60"
            >
              <div className={`h-1.5 w-full ${sev.bar} shrink-0`} />
              <div className="px-5 sm:px-6 pt-4 pb-3 flex items-start justify-between gap-4 border-b border-black/[0.04] bg-white/60 shrink-0">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className={`w-11 h-11 rounded-2xl ${sev.badge} border flex items-center justify-center shrink-0 ring-4 ${sev.ring}`}>
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15.5px] font-semibold tracking-tight text-ink-900 leading-tight break-words">
                        {diagnosis.title?.replace(/^[^\w\u4e00-\u9fa5]+/, '') || 'AI 诊断详情'}
                      </h3>
                      <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${sev.badge}`}>
                        {sev.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-ink-500 leading-snug">{diagnosis.desc || '—'}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="h-9 w-9 rounded-xl flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition shrink-0 bg-white border border-black/[0.04]"
                  title="关闭"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-5">
                <div>
                  <h4 className="text-[12px] font-semibold text-ink-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <ChevronRight size={13} className="text-indigo-500" />建议措施
                  </h4>
                  <ul className="space-y-2">
                    {suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 rounded-xl bg-white border border-black/[0.04] px-3.5 py-2.5">
                        <span className="mt-0.5 inline-flex w-5 h-5 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold items-center justify-center shrink-0">{i + 1}</span>
                        <span className="text-[12.5px] text-ink-700 leading-snug">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {targets.length > 0 && (
                  <div>
                    <h4 className="text-[12px] font-semibold text-ink-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <Users size={13} className="text-rose-500" />受影响对象 · {diagnosis.target_ids?.length || 0}
                    </h4>
                    <div className="rounded-2xl border border-black/[0.04] bg-white overflow-hidden">
                      {targets.map((r, i) => {
                        const meta = {};
                        return (
                          <div
                            key={r.id}
                            className={`px-4 py-3 flex items-center justify-between gap-3 min-w-0 ${i > 0 ? 'border-t border-black/[0.04]' : ''}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-9 h-9 rounded-xl shrink-0 ring-1 ring-black/[0.04]"
                                style={{ background: `linear-gradient(135deg, ${(r.avatar_gradient || '#6366f1,#8b5cf6').split(',')[0]}, ${(r.avatar_gradient || '#6366f1,#8b5cf6').split(',')[1]})` }}
                              />
                              <div className="min-w-0">
                                <div className="text-[13px] font-semibold text-ink-900 truncate">{r.account}</div>
                                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-500">
                                  <span className="inline-flex items-center gap-0.5"><Globe2 size={10.5} />{r.platform || r.platform_key || '—'}</span>
                                  <span className="opacity-70">{r.entity_type === 'ACCOUNT' ? '账号' : '社区'}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <div className="text-[12.5px] font-semibold tabular-nums text-ink-900 leading-none">
                                  <AnimatedNumber value={(r.followers || r.members || 0)} format={formatShort} />
                                </div>
                                <div className="mt-1 text-[10.5px] text-ink-400 tabular-nums">
                                  <AnimatedNumber value={(r.views || 0)} format={v => formatShort(v) + ' 曝光'} />
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  if (r.assigned_operator_uid) onNavigateOperator(r.assigned_operator_uid, r.assigned_operator_name);
                                  else if (r.platform_key || r.platform) onNavigatePlatform(r.platform_key || r.platform, r.platform);
                                }}
                                className="h-8 w-8 rounded-lg bg-ink-50 hover:bg-indigo-50 border border-black/[0.04] flex items-center justify-center text-ink-500 hover:text-indigo-600 transition shrink-0"
                                title="跳转下钻"
                              >
                                <ExternalLink size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-5 sm:px-6 py-3.5 border-t border-black/[0.04] bg-white/70 backdrop-blur-sm shrink-0 flex items-center justify-end gap-2">
                <button
                  onClick={onClose}
                  className="h-9 px-3.5 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50/60 text-[12.5px] font-medium text-ink-700 transition"
                >关闭</button>
                <button
                  onClick={() => {
                    if (targets[0]?.assigned_operator_uid) onNavigateOperator(targets[0].assigned_operator_uid, targets[0].assigned_operator_name);
                    else if (targets[0]?.platform_key || targets[0]?.platform) onNavigatePlatform(targets[0].platform_key || targets[0].platform, targets[0].platform);
                    onClose();
                  }}
                  className="h-9 px-3.5 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white text-[12.5px] font-semibold transition shadow-sm inline-flex items-center gap-1.5"
                >
                  <ChevronRight size={13} />立即处理
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
