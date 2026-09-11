import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, RefreshCcw, Copy, Printer, Sparkles,
} from 'lucide-react';

const FADE_UP = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

export default function AISummaryModal({
  open,
  onClose,
  data,
  scopeUid = null,
  operatorName = null,
  generateFn,
  onToast = () => {},
}) {
  const [regenTick, setRegenTick] = useState(0);
  const [copying, setCopying] = useState(false);

  const weekLabel = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 86400000);
    const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${fmt(start)} - ${fmt(end)} · 近 7 天`;
  }, [open, regenTick]);

  const markdown = useMemo(() => {
    if (!generateFn || !data) return '数据加载中…';
    try {
      return generateFn(data, { scopeUid, operatorName, weekLabel, _rand: regenTick });
    } catch (e) {
      return '⚠️ 周报生成失败，请稍后重试。\n' + String(e?.message || e);
    }
  }, [data, scopeUid, operatorName, weekLabel, generateFn, regenTick]);

  const lines = useMemo(() => markdown.split('\n'), [markdown]);

  const handleCopy = async () => {
    try {
      setCopying(true);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      } else {
        const ta = document.createElement('textarea');
        ta.value = markdown;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      onToast('✅ 周报已复制到剪贴板', 'ok');
    } catch (e) {
      onToast('复制失败，请手动选择文本', 'warn');
    } finally {
      setTimeout(() => setCopying(false), 900);
    }
  };

  const handleRegenerate = () => {
    onToast('🔄 重新生成周报中…', 'ok');
    setTimeout(() => setRegenTick(t => t + 1), 350);
  };

  const handlePrint = () => {
    try {
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(n => n.outerHTML).join('\n');
      const w = window.open('', '_blank', 'width=900,height=1200');
      if (!w) {
        onToast('浏览器拦截了打印窗口，请允许弹窗', 'warn');
        try { window.print(); } catch (e) {}
        return;
      }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Matrix AI 周报</title>
        ${styles}
        <style>
          body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
               padding:2cm 1.5cm;color:#111827;background:#fff;}
          h1{font-size:24px;margin:0 0 8px;border-bottom:2px solid #6366f1;padding-bottom:12px;}
          h2{font-size:18px;margin:28px 0 12px;color:#312e81;}
          blockquote{margin:12px 0 20px;padding:10px 14px;border-left:3px solid #8b5cf6;
                     background:#faf5ff;color:#5b21b6;font-size:13px;}
          ul{padding-left:20px;line-height:1.85;}
          li{margin:3px 0 3px;}
          hr{margin:30px 0 8px;border:none;border-top:1px solid #e5e7eb;}
          em{color:#6b7280;font-size:12px;}
        </style>
        </head><body class="ai-weekly-report-body">
          <pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;line-height:1.75;font-size:14px;margin:0;"></pre>
        </body></html>`);
      w.document.close();
      const pre = w.document.querySelector('pre');
      if (pre) pre.textContent = markdown;
      setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 250);
      onToast('📄 已打开打印预览，可另存为 PDF', 'ok');
    } catch (e) {
      onToast('导出失败：' + (e?.message || e), 'warn');
    }
  };

  if (!open) return null;
  const scopeHint = scopeUid && operatorName ? ` · ${operatorName} 个人视角` : '';

  const renderLine = (line, idx) => {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      return <h1 key={idx} className="text-[22px] sm:text-[24px] font-bold tracking-tight text-ink-900 pb-3 mb-3 border-b-2 border-indigo-500/70">{line.slice(2)}</h1>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={idx} className="text-[17px] sm:text-[18px] font-bold text-indigo-900 mt-6 mb-2 flex items-center gap-2"><span className="w-1 h-5 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500" />{line.slice(3)}</h2>;
    }
    if (line.startsWith('> ')) {
      return <blockquote key={idx} className="my-3 px-4 py-2.5 rounded-xl border-l-4 border-violet-400 bg-violet-50/70 text-violet-800 text-[13.5px] leading-6">{line.slice(2)}</blockquote>;
    }
    if (line.startsWith('- ')) {
      const inner = line.slice(2);
      return (
        <li key={idx} className="my-1.5 text-[14px] text-ink-700 leading-7 pl-1 marker:text-indigo-400">
          <span
            className="inline"
            dangerouslySetInnerHTML={{
              __html: inner
                .replace(/\*\*(.+?)\*\*/g, '<strong class="text-ink-900 font-semibold">$1</strong>')
                .replace(/\[(.+?)\]/g, '<span class="inline-flex items-center rounded-md bg-indigo-50 text-indigo-700 px-1.5 py-0.5 text-[12px] font-medium mx-0.5">$1</span>')
                .replace(/「(.+?)」/g, '<span class="text-amber-700 font-medium">「$1」</span>'),
            }}
          />
        </li>
      );
    }
    if (line.startsWith('---')) {
      return <hr key={idx} className="my-6 border-t border-black/[0.06]" />;
    }
    if (line.trim() === '') return <div key={idx} className="h-2" />;
    return (
      <p key={idx} className="text-[14px] text-ink-700 leading-7 my-1">
        <span dangerouslySetInnerHTML={{
          __html: line.replace(/_(.+?)_/g, '<em class="text-ink-400 text-[12px]">$1</em>'),
        }} />
      </p>
    );
  };

  return (
    <AnimatePresence>
      <>
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
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
            style={{ width: 'min(96vw, 60rem)' }}
            className="max-h-[88vh] overflow-hidden rounded-3xl bg-[#fafafa] border border-black/[0.06] shadow-[0_40px_120px_rgba(0,0,0,0.22)] flex flex-col"
          >
            <motion.div
              variants={FADE_UP}
              initial="hidden"
              animate="show"
              className="px-5 sm:px-6 py-4 sm:py-4.5 border-b border-black/[0.04] bg-white/70 backdrop-blur-sm flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 max-sm:w-11 max-sm:h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-inner shadow-violet-900/30 shrink-0">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] sm:text-[15px] font-bold tracking-tight text-ink-900 flex items-center gap-2">
                    AI 智能周报
                    <span className="hidden sm:inline-flex text-[11px] font-medium text-ink-400">{weekLabel}</span>
                  </div>
                  <div className="text-[11.5px] text-ink-500 mt-0.5 truncate max-w-[300px]">
                    由 AI 诊断引擎 4 大章节自动生成{scopeHint}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  title="重新生成"
                  className="h-9 w-9 max-sm:h-11 max-sm:w-11 rounded-xl border border-black/[0.06] bg-white hover:bg-indigo-50 hover:text-indigo-600 text-ink-600 transition flex items-center justify-center group"
                >
                  <RefreshCcw size={15} className="transition group-hover:rotate-180 duration-500" />
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  title="复制到剪贴板"
                  className={`h-9 w-9 max-sm:h-11 max-sm:w-11 rounded-xl border transition flex items-center justify-center ${copying ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-black/[0.06] hover:bg-emerald-50 hover:text-emerald-700 text-ink-600'}`}
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  title="导出 PDF / 打印"
                  className="h-9 w-9 max-sm:h-11 max-sm:w-11 rounded-xl border border-black/[0.06] bg-white hover:bg-sky-50 hover:text-sky-700 text-ink-600 transition flex items-center justify-center"
                >
                  <Printer size={15} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  title="关闭"
                  className="h-9 w-9 max-sm:h-11 max-sm:w-11 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50 hover:text-ink-800 text-ink-500 transition flex items-center justify-center"
                >
                  <X size={17} />
                </button>
              </div>
            </motion.div>

            <div className="flex-1 overflow-y-auto">
              <motion.article
                variants={FADE_UP}
                initial="hidden"
                animate="show"
                className="px-4 sm:px-8 py-6 sm:py-8 max-w-[820px] mx-auto"
              >
                <ul className="list-disc">
                  {lines.map((ln, idx) => {
                    if (ln.startsWith('- ')) {
                      return renderLine(ln, idx);
                    }
                    if (ln.startsWith('-')) return null;
                    return <React.Fragment key={idx}>{renderLine(ln, idx)}</React.Fragment>;
                  })}
                </ul>
                {!lines.some(l => l.startsWith('- ')) && lines.map((ln, idx) => renderLine(ln, idx))}
              </motion.article>
            </div>
          </motion.div>
        </div>
      </>
    </AnimatePresence>
  );
}
