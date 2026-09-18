import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import JSZip from 'jszip';

import { motion, AnimatePresence } from 'framer-motion';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';

import {
  Users, Eye, LayoutGrid, AlertTriangle, Filter, Download, RefreshCw,
  TrendingUp, TrendingDown, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Activity, Search,
  BarChart3, Shield, ShieldOff, UserCog, MessageSquare, Users2, MonitorDot, Globe2,
  Server, Flame, Clock, X, Layers, Heart, MessageCircle, Repeat2, ArrowUpRight, Building2,
  Sparkles, Copy, Cpu, AlertOctagon, BellRing, User, LogOut, KeyRound,
  Puzzle, Code2, FileJson, FileCode, FileCode2, Package, BookOpen, Github, CheckCircle2, ArrowLeft, Settings, Check, Terminal, FolderOpen, Play,
  Camera, XCircle, Pencil, Plus, Save, Trash2, PlusCircle, Trophy, Sun, Moon, Sunrise, Sunset,
} from 'lucide-react';

import {
  fetchSummary, fetchWhoami, exportCSV, exportCSVFromData, PLATFORM_META, PLATFORM_LOGOS, setJwtToken, clearSession, sanitizeUrl,
  initAuth, loginWithPassword, registerWithInvite, logout, ssoPasteToken, fetchSsoConfig, adminApi, subscribeAuth, getAuthSnapshot,
  fetchMe, updateMe, changePassword, updateRecord,
  listCollectorTokens, listOperators, createCollectorToken, revokeCollectorToken, adminListSystemFlags, adminPatchSystemFlags,
  listCollectorMachines, adminSiteOverview, adminClearData, adminDeleteAccount,
  adminListMonitoredStocks, adminAddMonitoredStock, adminDeleteMonitoredStock,
  adminListMonitoredCommunities, adminAddMonitoredCommunity, adminDeleteMonitoredCommunity,
  adminUpdateAccountLogo,
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

const AVATAR_POOL = [
  '#6366f1,#8b5cf6', '#8b5cf6,#d946ef', '#ec4899,#f43f5e',
  '#f97316,#f59e0b', '#10b981,#14b8a6', '#0ea5e9,#3b82f6',
  '#64748b,#475569', '#ef4444,#b91c1c', '#0891b2,#0284c7',
];

const VIRAL_TOAST_AUTO_DISMISS_MS = 45000;
const VIRAL_HISTORY_MAX = 20;

const ROLE_LABEL = { admin: '平台管理员', manager: '运营主管', operator: '运营专员' };
const ROLE_COLOR = { admin: 'bg-rose-50 text-rose-700 border-rose-100', manager: 'bg-indigo-50 text-indigo-700 border-indigo-100', operator: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
const STATUS_COLOR = { active: 'bg-emerald-50 text-emerald-700 border-emerald-100', disabled: 'bg-rose-50 text-rose-700 border-rose-100', pending: 'bg-amber-50 text-amber-700 border-amber-100' };

function RoleBadge({ role, size = 'sm' }) {
  const pad = size === 'sm' ? 'px-1.5 py-[2px] text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return <span className={`inline-flex items-center rounded-md border font-semibold ${ROLE_COLOR[role] || 'bg-ink-50 text-ink-500 border-black/5'} ${pad}`}>{ROLE_LABEL[role] || role}</span>;
}

function StatusBadge({ status }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border font-semibold px-1.5 py-[2px] text-[10px] ${STATUS_COLOR[status] || STATUS_COLOR.pending}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : status === 'disabled' ? 'bg-rose-500' : 'bg-amber-500'}`} />
    {status === 'active' ? '启用' : status === 'disabled' ? '禁用' : '待审'}
  </span>;
}

function PopoverSelect({ value, onChange, options = [], placeholder = '请选择', widthClass = 'w-auto', align = 'left', zIndex = 'z-[90]' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) { document.addEventListener('mousedown', handler); document.addEventListener('touchstart', handler); }
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [open]);
  const current = options.find(o => String(o.value) === String(value));
  const hasValue = !!current && current.value !== '';
  return (
    <div ref={ref} className={`relative inline-block ${widthClass}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="h-9 px-3 rounded-xl border border-black/[0.08] bg-white hover:bg-ink-50/60 transition flex items-center gap-2 text-[12.5px] font-medium text-ink-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
      >
        {hasValue ? (
          <span className={`px-2 py-0.5 rounded-lg ${current.colorClass || 'bg-indigo-50 text-indigo-700'} text-[11.5px] font-semibold`}>{current.label}</span>
        ) : (
          <span className="text-ink-500">{placeholder}</span>
        )}
        <ChevronDown size={13} className={`text-ink-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 min-w-[14rem] max-h-72 overflow-y-auto rounded-2xl bg-white border border-black/[0.06] shadow-[0_12px_40px_rgba(0,0,0,0.14)] ${zIndex} py-1.5`}
          >
            {options.length === 0 && (
              <div className="px-4 py-3 text-[12px] text-ink-400">无选项</div>
            )}
            {options.map(opt => {
              const active = String(opt.value) === String(value);
              return (
                <button
                  key={String(opt.value ?? '')}
                  type="button"
                  onClick={() => { onChange?.(opt.value); setOpen(false); }}
                  className={`w-full h-9 px-3.5 flex items-center justify-between gap-3 text-[12.5px] transition ${active ? 'bg-gradient-to-r from-indigo-50/80 to-violet-50/60 text-indigo-800' : 'text-ink-700 hover:bg-ink-50/70'}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {opt.icon && <opt.icon size={13} className="shrink-0 text-ink-400" />}
                    <span className="truncate">{opt.label}</span>
                  </span>
                  {active && <Check size={14} className="text-indigo-600 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModalOverlay({ open, onClose, children, title, maxWidthClass = 'max-w-md' }) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div key="modal-bg" className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} />
      <div className={`fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none`}>
        <motion.div
          key="modal-panel"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className={`pointer-events-auto w-full ${maxWidthClass} max-h-[88vh] flex flex-col overflow-hidden bg-[#fafafa] rounded-3xl shadow-[0_40px_120px_rgba(0,0,0,0.22)] border border-black/[0.06]`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.05] bg-white/70 backdrop-blur-sm shrink-0">
            <div className="text-[15px] font-bold tracking-tight text-ink-800">{title}</div>
            <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-black/[0.05] text-ink-400 hover:text-ink-800 flex items-center justify-center transition bg-white/80 border border-black/[0.04] shadow-sm"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function LoginPage({ onLoginOk, onGoRegister, showToast: externalToast }) {
  const [tab, setTab] = useState('password');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ssoCfg, setSsoCfg] = useState({ sso_login_url: null, sso_button_label: '内部 SSO 登录', allow_paste_token: true });
  const safeToast = (m, t) => { try { externalToast?.(m, t); } catch (_) {} };
  useEffect(() => { fetchSsoConfig().then(setSsoCfg).catch(() => {}); }, []);
  const errMap = { invalid_credentials: '账号或密码错误', account_disabled: '账号已禁用，请联系管理员', account_unavailable: '账号不可用', weak_password: '密码至少 8 位', bad_username: '用户名格式错误', username_exists: '用户名已存在', invite_invalid_or_used: '邀请码无效或已使用', bad_email: '邮箱格式错误', email_exists: '邮箱已被使用', sso_not_enabled: 'SSO 未启用', sso_invalid: 'SSO Token 无效，请检查' };
  const submit = async (e) => {
    e?.preventDefault?.();
    setErr(''); setBusy(true);
    try {
      if (tab === 'password') {
        if (!u.trim() || !p) { setErr('请输入账号密码'); setBusy(false); return; }
        const user = await loginWithPassword(u, p);
        safeToast(`欢迎回来，${user.username || user.name || '用户'}`, 'success');
        onLoginOk?.(user);
      } else if (tab === 'paste') {
        if (!paste.trim()) { setErr('请粘贴 SSO Token'); setBusy(false); return; }
        const user = await ssoPasteToken(paste);
        safeToast(`SSO 登录成功：${user.username || user.name}`, 'success');
        onLoginOk?.(user);
      }
    } catch (e) {
      setErr(errMap[e.message] || e.message || '登录失败');
    } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 via-indigo-50/40 to-emerald-50/50">
      <motion.div variants={FADE_UP} initial="hidden" animate="show" className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 border border-black/5 shadow-sm mb-3">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center"><Sparkles size={13} className="text-white" /></div>
            <div className="text-[13px] font-bold tracking-tight">Matrix · 矩阵账号监测</div>
          </div>
          <div className="text-[22px] font-bold text-ink-900 tracking-tight">登录您的账号</div>
          <div className="text-[12px] text-ink-500 mt-1">邀请制注册 · 支持内部 SSO 免登接入</div>
        </div>
        <div className="bg-white rounded-2xl shadow-card border border-black/[0.05] overflow-hidden">
          <div className="flex border-b border-black/[0.05]">
            {[
              { k: 'password', l: '账号密码', i: User },
              ...(ssoCfg.sso_login_url ? [{ k: 'sso', l: ssoCfg.sso_button_label, i: Shield }] : []),
              ...(ssoCfg.allow_paste_token ? [{ k: 'paste', l: '粘贴 SSO Token', i: Code2 }] : []),
            ].map(t => (
              <button key={t.k} onClick={() => { setTab(t.k); setErr(''); }}
                className={`flex-1 h-10 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold border-b-2 transition ${tab === t.k ? 'border-indigo-500 text-indigo-700 bg-indigo-50/40' : 'border-transparent text-ink-500 hover:text-ink-800'}`}>
                <t.i size={13} />{t.l}
              </button>
            ))}
          </div>
          <div className="p-4">
            {err && <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-[12px] flex items-center gap-1.5"><AlertTriangle size={13} />{err}</div>}
            {tab === 'password' && (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">用户名</label>
                  <input value={u} onChange={e => setU(e.target.value)} placeholder="admin / op_xxx"
                    className="w-full h-10 rounded-lg border border-black/10 px-3 text-[13.5px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>
                <div>
                  <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">密码</label>
                  <input type="password" value={p} onChange={e => setP(e.target.value)} placeholder="≥ 8 位"
                    className="w-full h-10 rounded-lg border border-black/10 px-3 text-[13.5px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>
                <button disabled={busy} type="submit"
                  className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[13px] font-semibold transition flex items-center justify-center gap-1.5">
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : null}登录
                </button>
                <div className="text-center px-1">
                  <div className="text-[11px] text-ink-400 leading-relaxed">
                    💡 演示环境默认管理员：<b className="text-ink-600 font-bold">admin</b> / <b className="text-ink-600 font-bold">admin123</b>
                    <span className="block mt-0.5">首次启动自动种入，登录后请在「个人中心」修改密码和头像</span>
                  </div>
                </div>
              </form>
            )}
            {tab === 'sso' && (
              <div className="space-y-3 text-center py-3">
                <div className="inline-flex w-14 h-14 rounded-2xl bg-indigo-50 items-center justify-center border border-indigo-100"><Shield size={26} className="text-indigo-600" /></div>
                <div className="text-[13px] text-ink-600">即将跳转到 <b className="text-ink-900">{ssoCfg.sso_button_label}</b> 完成身份校验</div>
                <a href={ssoCfg.sso_login_url || '#'} disabled={!ssoCfg.sso_login_url}
                  className={`inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-lg font-semibold text-[13px] transition ${ssoCfg.sso_login_url ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-ink-50 text-ink-400 cursor-not-allowed border border-black/5'}`}>
                  <ArrowUpRight size={14} />{ssoCfg.sso_button_label}
                </a>
                <div className="text-[11px] text-ink-400 mt-1">认证完成后同事侧回跳自动创建账号</div>
              </div>
            )}
            {tab === 'paste' && (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="block text-[11.5px] text-ink-500 font-semibold mb-1 flex items-center gap-1"><Code2 size={12} />粘贴 SSO JWT（HS256 / RS256）</label>
                  <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={4} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full rounded-lg border border-black/10 p-2.5 text-[12px] font-mono focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>
                <button disabled={busy || !paste.trim()} type="submit"
                  className="w-full h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[13px] font-semibold transition flex items-center justify-center gap-1.5">
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}验证并登录
                </button>
              </form>
            )}
            <div className="mt-4 pt-3 border-t border-black/[0.05] flex items-center justify-end">
              <div className="text-[11px] text-ink-400">v4.2 · JWT + SSO 双轨 · 仅管理员创建账号</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RegisterPage({ onRegisterOk, onGoLogin, showToast: externalToast }) {
  const [invite, setInvite] = useState('');
  const [u, setU] = useState('');
  const [email, setEmail] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [inviteRole, setInviteRole] = useState(null);
  const safeToast = (m, t) => { try { externalToast?.(m, t); } catch (_) {} };
  const map = { invite_invalid_or_used: '邀请码无效或已被使用', bad_username: '用户名只能是字母/数字/_ 3-32 位', username_exists: '用户名已被注册', weak_password: '密码至少 8 位', bad_email: '邮箱格式错误', email_exists: '邮箱已被使用' };
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const user = await registerWithInvite({ username: u.trim(), email: email.trim(), password: p, invite_code: invite });
      safeToast(`注册成功，欢迎 ${user.username || user.name}`, 'success');
      onRegisterOk?.(user);
    } catch (e) { setErr(map[e.message] || e.message || '注册失败'); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 via-violet-50/40 to-amber-50/50">
      <motion.div variants={FADE_UP} initial="hidden" animate="show" className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 border border-black/5 shadow-sm mb-3">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center"><UserCog size={13} className="text-white" /></div>
            <div className="text-[13px] font-bold tracking-tight">邀请码注册 · Matrix</div>
          </div>
          <div className="text-[22px] font-bold text-ink-900 tracking-tight">创建您的账号</div>
          <div className="text-[12px] text-ink-500 mt-1">请向管理员获取 16 位邀请码</div>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-card border border-black/[0.05] p-4 space-y-3">
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">邀请码</label>
            <input value={invite} onChange={e => { const v = e.target.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); setInvite(v); setInviteRole(v.length === 16 ? null : null); }} onBlur={() => setInvite(invite.trim().toUpperCase())}
              placeholder="例如: ABCD1234EFGH5678 (自动大写)" maxLength={16}
              className="w-full h-10 rounded-lg border border-black/10 px-3 text-[13.5px] font-mono tracking-[0.08em] uppercase focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            {inviteRole && <div className="mt-1.5 text-[11px] text-ink-500 flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-600" />此邀请码对应角色：<b>{ROLE_LABEL[inviteRole]}</b></div>}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">用户名</label>
              <input value={u} onChange={e => setU(e.target.value)} placeholder="3-32 位" maxLength={32}
                className="w-full h-10 rounded-lg border border-black/10 px-3 text-[13.5px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">邮箱 (可选)</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com"
                className="w-full h-10 rounded-lg border border-black/10 px-3 text-[13.5px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">密码</label>
            <input type="password" value={p} onChange={e => setP(e.target.value)} placeholder="≥ 8 位，建议字母+数字+符号"
              className="w-full h-10 rounded-lg border border-black/10 px-3 text-[13.5px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          </div>
          {err && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-[12px] flex items-center gap-1.5"><AlertTriangle size={13} />{err}</div>}
          <button disabled={busy || !invite || !u || !p} type="submit"
            className="w-full h-10 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-[13px] font-semibold transition flex items-center justify-center gap-1.5">
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <UserCog size={14} />}完成注册并登录
          </button>
          <div className="pt-2 border-t border-black/[0.05] text-center">
            <button type="button" onClick={onGoLogin} className="text-[12px] font-semibold text-indigo-700 hover:text-indigo-800">已有账号？直接登录 →</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function UserAvatar({ name, size = 32, gradient, src, dataUrl }) {
  const imageUrl = dataUrl || src;
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name || ''}
        loading="lazy"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={(e) => { setFailed(true); try { e.currentTarget.style.display = 'none'; } catch {} }}
        style={{ width: size, height: size, background: '#f4f4f5' }}
        className={`shrink-0 rounded-xl object-cover`}
        key={`${imageUrl}|${failed}`}
      />
    );
  }
  const pool = gradient || AVATAR_POOL[(name || '').length % AVATAR_POOL.length];
  const [c1, c2] = pool.split(',');
  const initial = (name || '?').slice(0, 1).toUpperCase();
  return (
    <div style={{
      background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
      width: size, height: size, fontSize: Math.max(10, size * 0.4),
    }}
      className={`shrink-0 rounded-xl text-white font-bold flex items-center justify-center`}>
      <span>{initial}</span>
    </div>
  );
}

function CreateUserModal({ open, onClose, onOk, operators }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('operator');
  const [opUid, setOpUid] = useState('');
  const [password, setPassword] = useState('');
  const [autoPwd, setAutoPwd] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setEmail(''); setUsername(''); setRole('operator'); setOpUid(''); setPassword(''); setAutoPwd(true); setBusy(false); setErr(''); } }, [open]);
  const submit = async () => {
    if (!username.trim() && !email.trim()) { setErr('请至少填写用户名或邮箱'); return; }
    setErr(''); setBusy(true);
    try {
      await onOk({ username: username.trim() || undefined, email: email.trim() || undefined, role, operator_uid: opUid || undefined, password: autoPwd ? undefined : (password || undefined) });
      onClose();
    } catch (e) { setErr(e.message || '创建失败'); } finally { setBusy(false); }
  };
  return (
    <ModalOverlay open={open} onClose={onClose} title="新建账号">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">用户名 <span className="text-rose-500">*</span></label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="不填则由邮箱派生"
              className="w-full h-10 rounded-xl border border-black/[0.07] px-3.5 text-[13px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white shadow-sm transition" />
          </div>
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">邮箱</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com"
              className="w-full h-10 rounded-xl border border-black/[0.07] px-3.5 text-[13px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white shadow-sm transition" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">角色</label>
            <PopoverSelect
              value={role}
              onChange={setRole}
              placeholder="选择角色"
              widthClass="w-full"
              options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v, colorClass: ROLE_COLOR[k] }))}
            />
          </div>
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">绑定运营档案</label>
            <PopoverSelect
              value={opUid}
              onChange={setOpUid}
              placeholder="不绑定（纯后台）"
              widthClass="w-full"
              options={[
                { value: '', label: '不绑定 · 纯后台账号' },
                ...(operators || []).map(o => ({ value: o.operator_uid, label: `${o.operator_name} · ${o.operator_uid}` })),
              ]}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[11.5px] text-ink-500 font-semibold">密码</label>
            <label className="text-[12px] text-ink-600 flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={autoPwd} onChange={e => setAutoPwd(e.target.checked)} className="w-4 h-4 accent-indigo-600 rounded" />自动生成 16 位强密码
            </label>
          </div>
          {autoPwd
            ? <div className="h-10 rounded-xl bg-ink-50/60 border border-dashed border-black/[0.08] flex items-center px-4 text-[12px] text-ink-400 shadow-sm">创建成功后明文返回一次，管理员需告知用户</div>
            : <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="≥ 8 位 (手动)"
              className="w-full h-10 rounded-xl border border-black/[0.07] px-3.5 text-[13px] font-mono focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white shadow-sm transition" />}
        </div>
        {err && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[12.5px] flex items-center gap-1.5 shadow-sm"><AlertTriangle size={14} />{err}</div>}
        <div className="flex gap-2.5 pt-3 border-t border-black/[0.05]">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-black/[0.07] bg-white hover:bg-black/[0.03] text-[13px] font-semibold text-ink-700 transition shadow-sm">取消</button>
          <button disabled={busy} onClick={submit} className="flex-1 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white text-[13px] font-semibold transition flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg">
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <UserCog size={14} />}创建并返回密码
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function EditUserModal({ open, user, operators, onClose, onOk }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('operator');
  const [status, setStatus] = useState('active');
  const [opUid, setOpUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open && user) { setEmail(user.email || ''); setRole(user.role || 'operator'); setStatus(user.status || 'active'); setOpUid(user.operator_uid || ''); setBusy(false); setErr(''); } }, [open, user]);
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await onOk(user.id, { email: email.trim() || null, role, status, operator_uid: opUid || null });
      onClose();
    } catch (e) { setErr(e.message || '保存失败'); } finally { setBusy(false); }
  };
  return (
    <ModalOverlay open={open} onClose={onClose} title={`编辑账号 · ${user?.username || ''}`}>
      <div className="space-y-4">
        <div className="px-4 py-3 rounded-xl bg-gradient-to-br from-indigo-50/80 to-violet-50/70 border border-indigo-100 text-[12.5px] text-indigo-800 flex items-center gap-2 shadow-sm">
          <User size={14} />用户 ID: <span className="font-mono font-semibold">{user?.id || ''}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">角色</label>
            <PopoverSelect
              value={role}
              onChange={setRole}
              placeholder="选择角色"
              widthClass="w-full"
              options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v, colorClass: ROLE_COLOR[k] }))}
            />
          </div>
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">状态</label>
            <PopoverSelect
              value={status}
              onChange={setStatus}
              placeholder="选择状态"
              widthClass="w-full"
              options={[
                { value: 'active', label: '启用', colorClass: STATUS_COLOR.active },
                { value: 'disabled', label: '禁用', colorClass: STATUS_COLOR.disabled },
              ]}
            />
          </div>
        </div>
        <div>
          <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">邮箱</label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com"
            className="w-full h-10 rounded-xl border border-black/[0.07] px-3.5 text-[13px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white shadow-sm transition" />
        </div>
        <div>
          <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">绑定运营档案</label>
          <PopoverSelect
            value={opUid}
            onChange={setOpUid}
            placeholder="不绑定（纯后台）"
            widthClass="w-full"
            options={[
              { value: '', label: '不绑定 · 纯后台账号' },
              ...(operators || []).map(o => ({ value: o.operator_uid, label: `${o.operator_name} · ${o.operator_uid}` })),
            ]}
          />
        </div>
        {err && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[12.5px] flex items-center gap-1.5 shadow-sm"><AlertTriangle size={14} />{err}</div>}
        <div className="flex gap-2.5 pt-3 border-t border-black/[0.05]">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-black/[0.07] bg-white hover:bg-black/[0.03] text-[13px] font-semibold text-ink-700 transition shadow-sm">取消</button>
          <button disabled={busy} onClick={submit} className="flex-1 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white text-[13px] font-semibold transition flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg">
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}保存
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function InviteCodeModal({ open, onClose, onOk }) {
  const [role, setRole] = useState('operator');
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setRole('operator'); setDays('7'); setErr(''); setBusy(false); } }, [open]);
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await onOk({ role, expires_days: days ? Number(days) : null });
      onClose();
    } catch (e) { setErr(e.message || '生成失败'); } finally { setBusy(false); }
  };
  return (
    <ModalOverlay open={open} onClose={onClose} title="生成邀请码">
      <div className="space-y-4">
        <div className="px-4 py-3 rounded-xl bg-gradient-to-br from-amber-50/90 to-orange-50/80 border border-amber-100 text-[12.5px] text-amber-800 flex items-start gap-2 shadow-sm">
          <AlertOctagon size={14} className="mt-[2px] shrink-0" />
          <div>邀请码<strong>一次性有效</strong>，注册成功后自动失效。请分角色生成，妥善保管分发。</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">注册后角色</label>
            <PopoverSelect
              value={role}
              onChange={setRole}
              placeholder="选择角色"
              widthClass="w-full"
              options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v, colorClass: ROLE_COLOR[k] }))}
            />
          </div>
          <div>
            <label className="block text-[11.5px] text-ink-500 font-semibold mb-1.5">有效期 (天)</label>
            <input type="number" min={1} value={days} onChange={e => setDays(e.target.value)} placeholder="空=永久"
              className="w-full h-10 rounded-xl border border-black/[0.07] px-3.5 text-[13px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white shadow-sm transition" />
          </div>
        </div>
        {err && <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[12.5px] flex items-center gap-1.5 shadow-sm"><AlertTriangle size={14} />{err}</div>}
        <div className="flex gap-2.5 pt-3 border-t border-black/[0.05]">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-black/[0.07] bg-white hover:bg-black/[0.03] text-[13px] font-semibold text-ink-700 transition shadow-sm">取消</button>
          <button disabled={busy} onClick={submit} className="flex-1 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white text-[13px] font-semibold transition flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg">
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}生成 16 位邀请码
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function AdminUserManagementPage({ onBack, currentUser, showToast, initialTab, tokensPanelJSX }) {
  if (!currentUser || currentUser.role !== 'admin') {
    try { showToast?.('无权限：仅管理员可访问后台页面', 'error'); } catch {}
    try { onBack?.(); } catch {}
    return null;
  }
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [q, setQ] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [operators, setOperators] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [lastCreated, setLastCreated] = useState(null);
  const [lastInvite, setLastInvite] = useState(null);
  const debounceRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, ops] = await Promise.all([
        adminApi.listUsers({ page, size, q: q.trim(), role: filterRole || undefined, status: filterStatus || undefined }),
        adminApi.listOperators().catch(() => ({ items: [] })),
      ]);
      setList(res?.items || []);
      setTotal(res?.total || 0);
      setOperators(ops?.items || []);
    } catch (e) { showToast(e.message || '加载失败', 'error'); }
    finally { setLoading(false); }
  }, [page, size, q, filterRole, filterStatus, showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => setPage(1) || load(), 250); return () => clearTimeout(debounceRef.current); }, [q]);

  const handleCreate = async (body) => {
    const r = await adminApi.createUser(body);
    setLastCreated(r);
    showToast('创建成功，密码仅本次可见', 'success');
    load();
  };
  const handleEdit = async (id, body) => {
    await adminApi.updateUser(id, body);
    showToast('已更新账号信息', 'success');
    load();
  };
  const handleReset = async (row) => {
    if (!confirm(`为 ${row.username} 重置密码？将返回明文 16 位新密码（must_change_pw=1）`)) return;
    try {
      const r = await adminApi.resetPassword(row.id);
      showToast('重置成功：' + (r?.password || ''), 'success');
      setLastCreated({ username: row.username, generated_password: r?.password });
      setShowCreate(true); setTimeout(() => setShowCreate(false), 1); // hack reuse
      setShowCreate(true);
    } catch (e) { showToast(e.message || '重置失败', 'error'); }
  };
  const handleDisable = async (row) => {
    try {
      if (row.status === 'disabled') { await adminApi.enableUser(row.id); showToast(`已启用 ${row.username}`, 'success'); }
      else { await adminApi.disableUser(row.id); showToast(`已禁用 ${row.username}`, 'success'); }
      load();
    } catch (e) { showToast(e.message || '操作失败', 'error'); }
  };
  const handleInvite = async (body) => {
    const r = await adminApi.createInviteCode(body);
    setLastInvite(r);
    showToast(`邀请码生成成功：${r?.code || ''}`, 'success');
  };
  const copy = (txt, label = '已复制') => { if (!txt) return; navigator.clipboard?.writeText(String(txt)); showToast(`${label}：${txt}`, 'success'); };

  const [adminTab, setAdminTab] = useState('users'); // users | tokens | stocks | communities
  useEffect(() => {
    if (initialTab && ['users', 'tokens', 'stocks', 'communities'].includes(String(initialTab))) {
      setAdminTab(String(initialTab));
    }
  }, [initialTab]);
  // ========== Shared: logo upload helpers (Part 1 - TDZ safe) ==========
  const readFileAsDataURL = useCallback((file) => new Promise((resolve, reject) => {
    if (!file) return reject(new Error('no_file'));
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error || new Error('read_failed'));
    fr.readAsDataURL(file);
  }), []);
  // ========== 股票监控 Tab ==========
  const [stockList, setStockList] = useState([]);
  const [stockTotal, setStockTotal] = useState(0);
  const [stockPage, setStockPage] = useState(1);
  const [stockSize, setStockSize] = useState(50);
  const [stockQ, setStockQ] = useState('');
  const [stockBusy, setStockBusy] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const loadStocks = useCallback(async () => {
    if (adminTab !== 'stocks') return;
    setStockBusy(true);
    try {
      const r = await adminListMonitoredStocks({ q: stockQ.trim(), page: stockPage, size: stockSize });
      setStockList(r?.items || []);
      setStockTotal(r?.total || 0);
    } catch (e) { showToast(e.message || '加载股票监控清单失败', 'error'); }
    finally { setStockBusy(false); }
  }, [adminTab, stockQ, stockPage, stockSize, showToast]);
  useEffect(() => { loadStocks(); }, [loadStocks]);
  useEffect(() => { if (adminTab === 'stocks') { const t = setTimeout(loadStocks, 150); return () => clearTimeout(t); } }, [adminTab]);
  useEffect(() => { if (adminTab === 'stocks') { const t = setTimeout(() => { setStockPage(1); loadStocks(); }, 220); return () => clearTimeout(t); } }, [stockQ]);
  const handleAddStock = async (form) => {
    try {
      await adminAddMonitoredStock({ symbol: form.symbol, note: form.note || undefined });
      showToast(`已加入监控清单：${form.symbol?.toUpperCase()}`, 'success');
      setShowAddStock(false);
      loadStocks();
    } catch (e) {
      const msg = /already_in_list|409|重复/.test(e.message) ? `重复：${form.symbol} 已在监控清单` : (e.message || '添加失败');
      showToast(msg, 'error');
    }
  };
  const handleDeleteStock = async (row) => {
    if (!confirm(`删除监控股票 ${row.account_name || row.symbol}？`)) return;
    try {
      await adminDeleteMonitoredStock(row.id);
      showToast('已删除', 'success');
      loadStocks();
    } catch (e) { showToast(e.message || '删除失败', 'error'); }
  };

  // ========== 社区监控 Tab ==========
  const [commList, setCommList] = useState([]);
  const [commTotal, setCommTotal] = useState(0);
  const [commPage, setCommPage] = useState(1);
  const [commSize, setCommSize] = useState(50);
  const [commQ, setCommQ] = useState('');
  const [commBusy, setCommBusy] = useState(false);
  const [showAddCommunity, setShowAddCommunity] = useState(false);
  const loadCommunities = useCallback(async () => {
    if (adminTab !== 'communities') return;
    setCommBusy(true);
    try {
      const r = await adminListMonitoredCommunities({ q: commQ.trim(), page: commPage, size: commSize });
      setCommList(r?.items || []);
      setCommTotal(r?.total || 0);
    } catch (e) { showToast(e.message || '加载社区监控清单失败', 'error'); }
    finally { setCommBusy(false); }
  }, [adminTab, commQ, commPage, commSize, showToast]);
  useEffect(() => { loadCommunities(); }, [loadCommunities]);
  useEffect(() => { if (adminTab === 'communities') { const t = setTimeout(loadCommunities, 150); return () => clearTimeout(t); } }, [adminTab]);
  useEffect(() => { if (adminTab === 'communities') { const t = setTimeout(() => { setCommPage(1); loadCommunities(); }, 220); return () => clearTimeout(t); } }, [commQ]);
  const handleAddCommunity = async (form) => {
    try {
      await adminAddMonitoredCommunity({ subreddit: form.subreddit, note: form.note || undefined });
      showToast(`已加入监控清单：r/${(form.subreddit || '').toLowerCase().replace(/^r\//, '')}`, 'success');
      setShowAddCommunity(false);
      loadCommunities();
    } catch (e) {
      const msg = /already_in_list|409|重复/.test(e.message) ? '重复：该社区已在监控清单' : (e.message || '添加失败');
      showToast(msg, 'error');
    }
  };
  const handleDeleteCommunity = async (row) => {
    if (!confirm(`删除监控社区 ${row.account_name || row.subreddit}？`)) return;
    try {
      await adminDeleteMonitoredCommunity(row.id);
      showToast('已删除', 'success');
      loadCommunities();
    } catch (e) { showToast(e.message || '删除失败', 'error'); }
  };
  // ========== Shared: logo upload helpers (Part 2 - after setStockList/setCommList declared) ==========
  const updateAccountLogoInline = useCallback((accountId, patch) => {
    setStockList(prev => prev.map(x => x.id === accountId ? { ...x, ...patch } : x));
    setCommList(prev => prev.map(x => x.id === accountId ? { ...x, ...patch } : x));
  }, [setStockList, setCommList]);
  const handlePickAccountLogo = useCallback(async (accountId, file) => {
    if (!accountId || !file) return;
    try {
      const b64 = await readFileAsDataURL(file);
      await adminUpdateAccountLogo(accountId, { avatar_data_url: b64 });
      updateAccountLogoInline(accountId, { avatar_data_url: b64 });
      showToast('Logo 更新成功', 'success');
    } catch (e) {
      showToast(e.message || 'Logo 更新失败，请稍后重试', 'error');
    }
  }, [readFileAsDataURL, updateAccountLogoInline, showToast]);

  return (
    <div className="min-h-screen w-full bg-ink-50/30">
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-black/[0.05]">
        <div className="max-w-[1620px] mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="h-9 px-2.5 rounded-lg hover:bg-black/[0.04] text-ink-600 flex items-center gap-1.5 text-[13px] font-semibold transition"><ArrowLeft size={15} />返回看板</button>
          <div className="h-6 w-px bg-black/[0.06]" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center"><Shield size={15} className="text-white" /></div>
            <div>
              <div className="text-[15px] font-bold tracking-tight">用户与权限 · 账号体系</div>
              <div className="text-[11px] text-ink-500">管理员控制台 · {currentUser?.username || 'admin'} · RBAC 三级角色</div>
            </div>
          </div>
          <div className="flex-1" />
          {adminTab === 'users' && (
            <>
              <button onClick={() => { setLastCreated(null); setShowCreate(true); }} className="h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12.5px] font-semibold transition flex items-center gap-1.5"><UserCog size={14} />新建账号</button>
            </>
          )}
          {adminTab === 'tokens' && (
            currentUser?.role === 'admin' ? (
              <button onClick={() => { setGenLabel(''); setGenDays('365'); setGenOperatorUid(currentUser?.operator_uid || ''); setShowGenToken(true); }} className="h-9 px-3 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 hover:brightness-110 text-white text-[12.5px] font-semibold transition flex items-center gap-1.5 shadow-sm whitespace-nowrap"><PlusCircle size={14} />生成新 Token</button>
            ) : null
          )}
        </div>
        <div className="max-w-[1620px] mx-auto px-4 pb-3 flex items-center gap-1.5">
          {[
            { id: 'users', label: '系统用户', icon: Users, color: 'indigo', badge: null },
            { id: 'tokens', label: '采集器授权', icon: KeyRound, color: 'indigo', badge: 'Token' },
            { id: 'stocks', label: '股票监控', icon: TrendingUp, color: 'indigo', badge: 'Stocktwits' },
            { id: 'communities', label: '社区监控', icon: MessageSquare, color: 'orange', badge: 'Reddit' },
          ].map(t => {
            const isActive = adminTab === t.id;
            const C = t.icon;
            const grad =
              t.color === 'indigo' ? 'from-indigo-600 to-violet-600' :
              t.color === 'orange' ? 'from-orange-500 to-rose-500' : 'from-violet-500 to-indigo-600';
            return (
              <button key={t.id} onClick={() => setAdminTab(t.id)}
                className={`h-8 px-3.5 rounded-xl flex items-center gap-1.5 text-[12.5px] font-semibold transition ${isActive ? `bg-gradient-to-r ${grad} text-white shadow-sm` : 'bg-white hover:bg-black/[0.03] text-ink-700 border border-black/[0.06]'}`}>
                <C size={13} />
                {t.label}
                {t.badge && <span className={`ml-0.5 text-[9.5px] font-bold px-1.5 py-[1px] rounded-md ${isActive ? 'bg-white/20 text-white' : 'bg-black/[0.05] text-ink-500'}`}>{t.badge}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {lastCreated?.generated_password && (
        <div className="max-w-[1620px] mx-auto px-4 pt-3">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 flex items-center gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-600">
              <UserCog size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold text-indigo-900">账号创建成功 <span className="font-normal text-indigo-500">（密码仅本次返回，请立即告知用户）</span></div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-mono">
                <span className="text-ink-700">用户名: <b>{lastCreated.username || '—'}</b></span>
                <span className="text-ink-700">ID: <b>{lastCreated.user_id || '—'}</b></span>
                <span className="text-rose-700">临时密码: <b>{lastCreated.generated_password || '—'}</b></span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => copy(lastCreated ? (lastCreated.username + ' / 密码：' + lastCreated.generated_password) : '', '已复制')} className="h-9 px-3 rounded-xl border border-black/[0.07] bg-white hover:bg-black/[0.02] text-[12.5px] font-semibold text-ink-700 transition flex items-center gap-1.5 shadow-sm"><Copy size={13} />复制</button>
              <button onClick={() => setLastCreated(null)} className="h-9 w-9 rounded-xl border border-black/[0.07] bg-white text-ink-400 hover:text-ink-700 hover:bg-black/[0.02] transition flex items-center justify-center shadow-sm"><X size={15} /></button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-[1620px] mx-auto px-4 py-4">
        {/* ================== 用户 Tab ================== */}
        {adminTab === 'users' && (
          <div className="bg-white rounded-2xl shadow-sm border border-black/[0.05] overflow-hidden">
            <div className="p-3.5 border-b border-black/[0.05] flex flex-wrap items-center gap-2 bg-gradient-to-b from-white to-ink-50/30">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索用户名/邮箱..."
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-black/[0.06] bg-white shadow-sm text-[13px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition" />
              </div>
              <PopoverSelect
                value={filterRole}
                onChange={v => { setFilterRole(v); setPage(1); }}
                placeholder="全部角色"
                options={[
                  { value: '', label: '全部角色' },
                  ...Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v, colorClass: ROLE_COLOR[k] })),
                ]}
              />
              <PopoverSelect
                value={filterStatus}
                onChange={v => { setFilterStatus(v); setPage(1); }}
                placeholder="全部状态"
                options={[
                  { value: '', label: '全部状态' },
                  { value: 'active', label: '启用', colorClass: STATUS_COLOR.active },
                  { value: 'disabled', label: '禁用', colorClass: STATUS_COLOR.disabled },
                ]}
              />
              <div className="text-[11.5px] text-ink-400">共 <b className="text-ink-800">{total}</b> 条</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[1000px]">
                <thead>
                  <tr className="bg-gradient-to-r from-ink-50/80 via-white to-ink-50/80 text-ink-500 text-[11px] uppercase tracking-wider border-b border-black/[0.05]">
                    <th className="text-left px-4 py-3 font-semibold w-[180px]">用户</th>
                    <th className="text-left px-4 py-3 font-semibold">角色</th>
                    <th className="text-left px-4 py-3 font-semibold">状态</th>
                    <th className="text-left px-4 py-3 font-semibold w-[180px]">绑定运营</th>
                    <th className="text-left px-4 py-3 font-semibold w-[160px]">最近登录</th>
                    <th className="text-left px-4 py-3 font-semibold w-[140px]">登录次数</th>
                    <th className="text-right px-4 py-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !list.length ? (
                    <tr><td colSpan={7} className="text-center py-16 text-ink-400"><RefreshCw size={16} className="inline animate-spin mr-1" />加载中...</td></tr>
                  ) : !list.length ? (
                    <tr><td colSpan={7} className="text-center py-16 text-ink-400">暂无用户数据</td></tr>
                  ) : list.map(r => (
                    <tr key={r.id} className="border-t border-black/[0.03] hover:bg-gradient-to-r hover:from-indigo-50/20 hover:via-white hover:to-violet-50/20 transition duration-200 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={r.username} size={34} gradient={AVATAR_POOL[(r.username || '').length % AVATAR_POOL.length]} />
                          <div className="min-w-0">
                            <div className="font-semibold text-ink-800 truncate flex items-center gap-1.5">{r.username || '—'}{r.sso_provider && <span className="text-[9px] font-mono px-1.5 py-[2px] rounded-md bg-violet-50 border border-violet-100 text-violet-700 font-semibold">SSO</span>}</div>
                            <div className="text-[11px] text-ink-400 font-mono truncate">{r.email || '未设置邮箱'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={r.role} /></td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3">
                        <div className="text-[12px] text-ink-700 truncate">{r.operator_name || '—'}</div>
                        <div className="text-[10.5px] text-ink-400 font-mono">{r.operator_uid || '未绑定'}</div>
                      </td>
                      <td className="px-4 py-3 text-ink-600 text-[12px]">{r.last_login_at ? timeFromNow(r.last_login_at) : '—'}</td>
                      <td className="px-4 py-3 text-ink-700 font-mono tabular-nums">{r.login_count ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditUser(r)} className="h-9 w-9 rounded-xl hover:bg-indigo-50 text-indigo-700 flex items-center justify-center transition group-hover:shadow-sm" title="编辑"><Settings size={14} /></button>
                          <button onClick={() => handleReset(r)} className="h-9 w-9 rounded-xl hover:bg-amber-50 text-amber-700 flex items-center justify-center transition group-hover:shadow-sm" title="重置密码"><KeyRound size={14} /></button>
                          <button onClick={() => handleDisable(r)} className={`h-9 w-9 rounded-xl transition flex items-center justify-center group-hover:shadow-sm ${r.status === 'disabled' ? 'hover:bg-emerald-50 text-emerald-700' : 'hover:bg-rose-50 text-rose-700'}`} title={r.status === 'disabled' ? '启用' : '禁用'}>
                            {r.status === 'disabled' ? <CheckCircle2 size={14} /> : <AlertOctagon size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2.5 border-t border-black/[0.05] flex items-center justify-between text-[12px] text-ink-500">
              <div>第 <b className="text-ink-700">{page}</b> / {Math.max(1, Math.ceil(total / size))} 页</div>
              <div className="flex items-center gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="h-9 px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-black/[0.02] disabled:opacity-40 text-[12.5px] font-semibold text-ink-700 transition shadow-sm">上一页</button>
                <PopoverSelect
                  value={size}
                  onChange={v => { setSize(Number(v)); setPage(1); }}
                  placeholder={`${size} 条/页`}
                  options={[10, 20, 50, 100].map(n => ({ value: n, label: `${n} 条/页` }))}
                />
                <button disabled={page * size >= total} onClick={() => setPage(p => p + 1)} className="h-9 px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-black/[0.02] disabled:opacity-40 text-[12.5px] font-semibold text-ink-700 transition shadow-sm">下一页</button>
              </div>
            </div>
          </div>
        )}

        {/* ================== 采集器授权 Token Tab（原首页模块，移到此处：系统用户后、股票监控前） ================== */}
        {adminTab === 'tokens' && (
          tokensPanelJSX || null
        )}

        {/* ================== 股票监控 Tab ================== */}
        {adminTab === 'stocks' && (
          <div className="bg-white rounded-2xl shadow-sm border border-black/[0.05] overflow-hidden">
            <div className="p-3.5 border-b border-black/[0.05] flex flex-wrap items-center gap-2 bg-gradient-to-b from-white to-indigo-50/30">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input value={stockQ} onChange={e => setStockQ(e.target.value)} placeholder="搜索股票代码（如 TSLA、NVDA、AAPL）..."
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-black/[0.06] bg-white shadow-sm text-[13px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition" />
              </div>
              <button onClick={loadStocks} className="h-10 px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-black/[0.02] text-[12.5px] font-semibold text-ink-700 transition flex items-center gap-1.5 shadow-sm"><RefreshCw size={14} className={stockBusy ? 'animate-spin' : ''} />刷新</button>
              <button onClick={() => setShowAddStock(true)} className="h-10 px-3 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:brightness-105 text-white text-[12.5px] font-semibold transition flex items-center gap-1.5 shadow-sm"><Plus size={14} />添加股票</button>
              <div className="text-[11.5px] text-ink-400">共 <b className="text-ink-800">{stockTotal}</b> 只</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[900px]">
                <thead>
                  <tr className="bg-gradient-to-r from-ink-50/80 via-white to-indigo-50/40 text-ink-500 text-[11px] uppercase tracking-wider border-b border-black/[0.05]">
                    <th className="text-left px-4 py-3 font-semibold w-[120px]">股票代码</th>
                    <th className="text-left px-4 py-3 font-semibold w-[120px]">平台</th>
                    <th className="text-left px-4 py-3 font-semibold">监控 Target URL</th>
                    <th className="text-left px-4 py-3 font-semibold w-[120px]">最近更新</th>
                    <th className="text-left px-4 py-3 font-semibold w-[180px]">备注</th>
                    <th className="text-right px-4 py-3 font-semibold w-[120px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {stockBusy && !stockList.length ? (
                    <tr><td colSpan={6} className="text-center py-16 text-ink-400"><RefreshCw size={16} className="inline animate-spin mr-1" />加载中...</td></tr>
                  ) : !stockList.length ? (
                    <tr><td colSpan={6} className="py-20">
                      <div className="text-center max-w-sm mx-auto">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-3 shadow-md"><TrendingUp size={26} className="text-white" /></div>
                        <div className="text-[14px] font-bold text-ink-800">还未添加任何监控股票</div>
                        <div className="mt-1 text-[12px] text-ink-500">点击右上角「+ 添加股票」按钮，或通过采集插件浏览 Stocktwits 对应页面自动回填情绪与讨论数据。</div>
                      </div>
                    </td></tr>
                  ) : stockList.map(r => (
                    <tr key={r.id} className="border-t border-black/[0.03] hover:bg-gradient-to-r hover:from-indigo-50/30 hover:via-white hover:to-violet-50/20 transition duration-200 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <label className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center text-white text-[11.5px] font-bold shadow-sm shrink-0 relative group/avatar cursor-pointer ring-1 ring-black/[0.04]"
                            style={!r.avatar_data_url ? { background: `linear-gradient(135deg, ${(r.avatar_color||'#6366f1,#8b5cf6').split(',')[0]}, ${(r.avatar_color||'#6366f1,#8b5cf6').split(',')[1]})` } : undefined}
                            title={r.avatar_data_url ? '点击修改 logo' : '上传 logo'}
                          >
                            {r.avatar_data_url ? (
                              <img src={r.avatar_data_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display='none'; }} />
                            ) : (
                              <span>{(r.symbol || r.account_name || 'ST').slice(0, 4)}</span>
                            )}
                            <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition flex items-center justify-center text-white text-[9.5px] font-semibold">
                              <Camera size={12} className="mr-0.5" />{r.avatar_data_url ? '修改' : '上传'}
                            </div>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handlePickAccountLogo(r.id, f); e.target.value=''; }} />
                          </label>
                          <div className="min-w-0">
                            <div className="font-bold text-ink-800 font-mono tracking-wide">{r.symbol || r.account_name || '—'}</div>
                            <div className="text-[10.5px] text-ink-400">ID: {String(r.id||'').slice(0,10)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 text-[11px] font-bold"><TrendingUp size={11} /> Stocktwits</span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={r.target_url || '#'} target="_blank" rel="noreferrer" className="text-[12px] text-indigo-700 hover:text-indigo-900 font-medium truncate inline-flex items-center gap-1 max-w-full">
                          <span className="truncate">{r.target_url || '—'}</span><ExternalLink size={11} className="shrink-0" />
                        </a>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-ink-600">{r.last_update ? timeFromNow(r.last_update) : (r.created_at ? timeFromNow(r.created_at) : '—')}</td>
                      <td className="px-4 py-3 text-[12px] text-ink-600">{r.note || <span className="text-ink-300">— 无备注 —</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <a href={r.target_url || '#'} target="_blank" rel="noreferrer" className="h-9 w-9 rounded-xl hover:bg-black/[0.04] text-ink-600 flex items-center justify-center transition group-hover:shadow-sm" title="打开页面"><ExternalLink size={14} /></a>
                          <button onClick={() => handleDeleteStock(r)} className="h-9 w-9 rounded-xl hover:bg-rose-50 text-rose-600 flex items-center justify-center transition group-hover:shadow-sm" title="删除"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2.5 border-t border-black/[0.05] flex items-center justify-between text-[12px] text-ink-500">
              <div>第 <b className="text-ink-700">{stockPage}</b> / {Math.max(1, Math.ceil(stockTotal / stockSize))} 页</div>
              <div className="flex items-center gap-1.5">
                <button disabled={stockPage <= 1} onClick={() => setStockPage(p => Math.max(1, p - 1))} className="h-9 px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-black/[0.02] disabled:opacity-40 text-[12.5px] font-semibold text-ink-700 transition shadow-sm">上一页</button>
                <button disabled={stockPage * stockSize >= stockTotal} onClick={() => setStockPage(p => p + 1)} className="h-9 px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-black/[0.02] disabled:opacity-40 text-[12.5px] font-semibold text-ink-700 transition shadow-sm">下一页</button>
              </div>
            </div>
          </div>
        )}

        {/* ================== 社区监控 Tab ================== */}
        {adminTab === 'communities' && (
          <div className="bg-white rounded-2xl shadow-sm border border-black/[0.05] overflow-hidden">
            <div className="p-3.5 border-b border-black/[0.05] flex flex-wrap items-center gap-2 bg-gradient-to-b from-white to-orange-50/30">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input value={commQ} onChange={e => setCommQ(e.target.value)} placeholder="搜索 Reddit 社区名（如 wallstreetbets、stocks，自动忽略 r/ 前缀）..."
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-black/[0.06] bg-white shadow-sm text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition" />
              </div>
              <button onClick={loadCommunities} className="h-10 px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-black/[0.02] text-[12.5px] font-semibold text-ink-700 transition flex items-center gap-1.5 shadow-sm"><RefreshCw size={14} className={commBusy ? 'animate-spin' : ''} />刷新</button>
              <button onClick={() => setShowAddCommunity(true)} className="h-10 px-3 rounded-xl bg-gradient-to-r from-orange-500 via-rose-500 to-red-500 hover:brightness-105 text-white text-[12.5px] font-semibold transition flex items-center gap-1.5 shadow-sm"><Plus size={14} />添加社区</button>
              <div className="text-[11.5px] text-ink-400">共 <b className="text-ink-800">{commTotal}</b> 个</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[900px]">
                <thead>
                  <tr className="bg-gradient-to-r from-ink-50/80 via-white to-orange-50/40 text-ink-500 text-[11px] uppercase tracking-wider border-b border-black/[0.05]">
                    <th className="text-left px-4 py-3 font-semibold w-[180px]">社区名</th>
                    <th className="text-left px-4 py-3 font-semibold w-[120px]">平台</th>
                    <th className="text-left px-4 py-3 font-semibold">监控 Target URL</th>
                    <th className="text-left px-4 py-3 font-semibold w-[120px]">最近更新</th>
                    <th className="text-left px-4 py-3 font-semibold w-[180px]">备注</th>
                    <th className="text-right px-4 py-3 font-semibold w-[120px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {commBusy && !commList.length ? (
                    <tr><td colSpan={6} className="text-center py-16 text-ink-400"><RefreshCw size={16} className="inline animate-spin mr-1" />加载中...</td></tr>
                  ) : !commList.length ? (
                    <tr><td colSpan={6} className="py-20">
                      <div className="text-center max-w-sm mx-auto">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center mb-3 shadow-md"><MessageSquare size={26} className="text-white" /></div>
                        <div className="text-[14px] font-bold text-ink-800">还未添加任何监控社区</div>
                        <div className="mt-1 text-[12px] text-ink-500">点击右上角「+ 添加社区」按钮，或通过采集插件浏览 Reddit 对应 subreddit 页面自动回填情绪与讨论数据。</div>
                      </div>
                    </td></tr>
                  ) : commList.map(r => (
                    <tr key={r.id} className="border-t border-black/[0.03] hover:bg-gradient-to-r hover:from-orange-50/30 hover:via-white hover:to-rose-50/20 transition duration-200 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <label className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center text-white text-[13px] font-bold shadow-sm shrink-0 relative group/avatar cursor-pointer ring-1 ring-black/[0.04]"
                            style={!r.avatar_data_url ? { background: `linear-gradient(135deg, ${(r.avatar_color||'#f97316,#ec4899').split(',')[0]}, ${(r.avatar_color||'#f97316,#ec4899').split(',')[1]})` } : undefined}
                            title={r.avatar_data_url ? '点击修改 logo' : '上传 logo'}
                          >
                            {r.avatar_data_url ? (
                              <img src={r.avatar_data_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display='none'; }} />
                            ) : (
                              <span>r</span>
                            )}
                            <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition flex items-center justify-center text-white text-[9.5px] font-semibold">
                              <Camera size={12} className="mr-0.5" />{r.avatar_data_url ? '修改' : '上传'}
                            </div>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handlePickAccountLogo(r.id, f); e.target.value=''; }} />
                          </label>
                          <div className="min-w-0">
                            <div className="font-bold text-ink-800 font-mono">{r.account_name || ('r/' + (r.subreddit||'')) || '—'}</div>
                            <div className="text-[10.5px] text-ink-400">ID: {String(r.id||'').slice(0,10)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-orange-50 border border-orange-100 text-orange-700 text-[11px] font-bold"><MessageSquare size={11} /> Reddit</span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={r.target_url || '#'} target="_blank" rel="noreferrer" className="text-[12px] text-orange-700 hover:text-orange-900 font-medium truncate inline-flex items-center gap-1 max-w-full">
                          <span className="truncate">{r.target_url || '—'}</span><ExternalLink size={11} className="shrink-0" />
                        </a>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-ink-600">{r.last_update ? timeFromNow(r.last_update) : (r.created_at ? timeFromNow(r.created_at) : '—')}</td>
                      <td className="px-4 py-3 text-[12px] text-ink-600">{r.note || <span className="text-ink-300">— 无备注 —</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <a href={r.target_url || '#'} target="_blank" rel="noreferrer" className="h-9 w-9 rounded-xl hover:bg-black/[0.04] text-ink-600 flex items-center justify-center transition group-hover:shadow-sm" title="打开页面"><ExternalLink size={14} /></a>
                          <button onClick={() => handleDeleteCommunity(r)} className="h-9 w-9 rounded-xl hover:bg-rose-50 text-rose-600 flex items-center justify-center transition group-hover:shadow-sm" title="删除"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2.5 border-t border-black/[0.05] flex items-center justify-between text-[12px] text-ink-500">
              <div>第 <b className="text-ink-700">{commPage}</b> / {Math.max(1, Math.ceil(commTotal / commSize))} 页</div>
              <div className="flex items-center gap-1.5">
                <button disabled={commPage <= 1} onClick={() => setCommPage(p => Math.max(1, p - 1))} className="h-9 px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-black/[0.02] disabled:opacity-40 text-[12.5px] font-semibold text-ink-700 transition shadow-sm">上一页</button>
                <button disabled={commPage * commSize >= commTotal} onClick={() => setCommPage(p => p + 1)} className="h-9 px-3 rounded-xl border border-black/[0.06] bg-white hover:bg-black/[0.02] disabled:opacity-40 text-[12.5px] font-semibold text-ink-700 transition shadow-sm">下一页</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* ============ Modal ============ */}
      <CreateUserModal open={showCreate} operators={operators} onClose={() => setShowCreate(false)} onOk={handleCreate} />
      <EditUserModal open={!!editUser} user={editUser} operators={operators} onClose={() => setEditUser(null)} onOk={handleEdit} />
      <InviteCodeModal open={showInvite} onClose={() => setShowInvite(false)} onOk={handleInvite} />
      <AddStockForm open={showAddStock} onClose={() => setShowAddStock(false)} onOk={handleAddStock} />
      <AddCommunityForm open={showAddCommunity} onClose={() => setShowAddCommunity(false)} onOk={handleAddCommunity} />
    </div>
  );
}

/* ================== Admin 后台 Modal：添加监控股票 ================== */
function AddStockForm({ open, onClose, onOk }) {
  const [symbol, setSymbol] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSymbol(''); setNote(''); setBusy(false); } }, [open]);
  const submit = async () => {
    const s = (symbol || '').trim().toUpperCase();
    if (!/^[A-Z0-9.]{1,10}$/.test(s)) { showToast?.('股票代码不合法：仅字母/数字/.，长度 1-10', 'error'); return; }
    setBusy(true);
    try { await onOk?.({ symbol: s, note: (note || '').trim() || undefined }); onClose?.(); }
    catch (e) { showToast?.(e.message || '添加失败', 'error'); }
    finally { setBusy(false); }
  };
  if (!open) return null;
  return (
    <ModalOverlay open={open} onClose={onClose} title="添加监控股票">
      <div className="space-y-3.5">
        <div><div className="text-[12px] font-semibold text-ink-700 mb-1">股票代码 <span className="text-rose-500">*</span> <span className="text-ink-400 font-normal">（自动转大写）</span></div>
          <input value={symbol} onChange={e=>setSymbol(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit()}} placeholder="如 TSLA / NVDA / AAPL" maxLength={12}
            className="w-full h-10 px-3 rounded-xl border border-black/[0.07] bg-white text-[13px] font-mono tracking-wider focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
        </div>
        <div><div className="text-[12px] font-semibold text-ink-700 mb-1">备注（可选）</div>
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="如：新能源、科技蓝筹、关注波动大" rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-black/[0.07] bg-white text-[13px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition resize-none"/>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 flex items-start gap-2.5">
          <TrendingUp size={16} className="text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-indigo-900 leading-relaxed">加入监控后，<b>任何持有采集器的人</b>浏览 <span className="font-mono">stocktwits.com/symbol/{symbol || 'TSLA'}</span> 页面≥3秒，就会自动把情绪/最新帖子回填到看板首页 Stocktwits 模块。清单外的股票严格禁止入库（方案 A）。</div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-10 px-4 rounded-xl border border-black/[0.07] bg-white hover:bg-black/[0.02] text-[13px] font-semibold text-ink-700 transition">取消</button>
          <button onClick={submit} disabled={busy} className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:brightness-105 disabled:opacity-50 text-white text-[13px] font-semibold transition flex items-center gap-1.5 shadow-sm">{busy?<RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>} 添加到监控清单</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ================== Admin 后台 Modal：添加 Reddit 社区监控 ================== */
function AddCommunityForm({ open, onClose, onOk }) {
  const [sub, setSub] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSub(''); setNote(''); setBusy(false); } }, [open]);
  const submit = async () => {
    let s = (sub || '').trim().toLowerCase();
    if (s.startsWith('r/')) s = s.slice(2);
    if (!/^[A-Za-z0-9_-]{2,21}$/.test(s)) { showToast?.('社区名不合法：仅字母/数字/_/-，长度 2-21（自动去掉 r/ 前缀）', 'error'); return; }
    setBusy(true);
    try { await onOk?.({ subreddit: s, note: (note || '').trim() || undefined }); onClose?.(); }
    catch (e) { showToast?.(e.message || '添加失败', 'error'); }
    finally { setBusy(false); }
  };
  if (!open) return null;
  return (
    <ModalOverlay open={open} onClose={onClose} title="添加监控社区（Reddit）">
      <div className="space-y-3.5">
        <div><div className="text-[12px] font-semibold text-ink-700 mb-1">Subreddit 名 <span className="text-rose-500">*</span> <span className="text-ink-400 font-normal">（自动去 r/ 前缀 + 小写）</span></div>
          <div className="flex items-center rounded-xl border border-black/[0.07] bg-white focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition">
            <span className="px-3 text-[13px] font-bold font-mono text-ink-400 select-none border-r border-black/[0.05] h-10 flex items-center">r /</span>
            <input value={sub} onChange={e=>setSub(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit()}} placeholder="wallstreetbets / stocks / CryptoCurrency" maxLength={24}
              className="w-full h-10 px-3 rounded-r-xl bg-transparent text-[13px] font-mono focus:outline-none"/>
          </div>
        </div>
        <div><div className="text-[12px] font-semibold text-ink-700 mb-1">备注（可选）</div>
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="如：WSB 情绪、加密货币社区、宏观讨论" rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-black/[0.07] bg-white text-[13px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition resize-none"/>
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-3 flex items-start gap-2.5">
          <MessageSquare size={16} className="text-orange-600 shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-orange-900 leading-relaxed">加入监控后，<b>任何持有采集器的人</b>浏览 <span className="font-mono">reddit.com/r/{sub || 'wallstreetbets'}</span> 社区页面≥3秒，就会自动把最新讨论/情绪/热度回填到看板首页 Reddit 独立模块。<b className="font-semibold">注意</b>：只监控<b>社区（Subreddit）</b>，不监控 Reddit 个人账号。清单外社区严格禁止入库（方案 A）。</div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-10 px-4 rounded-xl border border-black/[0.07] bg-white hover:bg-black/[0.02] text-[13px] font-semibold text-ink-700 transition">取消</button>
          <button onClick={submit} disabled={busy} className="h-10 px-4 rounded-xl bg-gradient-to-r from-orange-500 via-rose-500 to-red-500 hover:brightness-105 disabled:opacity-50 text-white text-[13px] font-semibold transition flex items-center gap-1.5 shadow-sm">{busy?<RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>} 添加到监控清单</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

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
  show:   { opacity: 1, y: 0,  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
};

function frequencyPercentiles(valsArr) {
  const vals = valsArr.filter((v) => v > 0).slice().sort((a, b) => a - b);
  if (vals.length === 0) return [0, 0, 0, 0];
  const p = (frac) => vals[Math.min(vals.length - 1, Math.max(0, Math.floor((vals.length - 1) * frac)))];
  return [Math.max(1, p(0.25)), p(0.5), p(0.75), vals[vals.length - 1]];
}
function frequencyColorClass(v, percentiles) {
  if (!v || v <= 0) return 'bg-white';
  const [p25, p50, p75, p100] = percentiles;
  if (p100 <= 0) return 'bg-[#1f2937]/10';
  if (p25 >= p100 || p25 === p75) {
    const ratio = v / p100;
    if (ratio <= 0.25) return 'bg-[#86efac]';
    if (ratio <= 0.5) return 'bg-[#4ade80]';
    if (ratio <= 0.75) return 'bg-[#16a34a]';
    return 'bg-[#14532d]';
  }
  if (v <= p25) return 'bg-[#86efac]';
  if (v <= p50) return 'bg-[#4ade80]';
  if (v <= p75) return 'bg-[#16a34a]';
  return 'bg-[#14532d]';
}
function heatmapValueFor(dayEntry, enabledKeysSet) {
  if (!dayEntry) return 0;
  let v = 0;
  const bp = dayEntry.by_platform || {};
  enabledKeysSet.forEach((k) => { v += Number(bp[k] || 0); });
  return v;
}
function hourlyValueFor(hourEntry, enabledKeysSet) {
  if (!hourEntry) return 0;
  let v = 0;
  const bp = hourEntry.by_platform || {};
  enabledKeysSet.forEach((k) => { v += Number(bp[k] || 0); });
  return v;
}

function PostFrequencySection({ calendar }) {
  const allPlatforms = Array.isArray(calendar?.platforms) ? calendar.platforms : [];
  const daysArr = Array.isArray(calendar?.days) ? calendar.days : [];
  const hourlyArr = Array.isArray(calendar?.hourly_distribution) ? calendar.hourly_distribution : [];
  const [enabledKeys, setEnabledKeys] = useState(() => new Set(allPlatforms.map((p) => p.key)));

  useEffect(() => {
    setEnabledKeys((prev) => {
      const next = new Set(prev);
      allPlatforms.forEach((p) => next.add(p.key));
      return next;
    });
  }, [allPlatforms.map((p) => p.key).join('|')]);

  const today = useMemo(() => dayjs().endOf('day'), []);
  const startDate = useMemo(() => today.subtract(364, 'day').startOf('day'), [today]);
  const weeks = useMemo(() => {
    const buckets = new Map(daysArr.map((d) => [d.date, d]));
    const startDow = startDate.day();
    const padFront = [];
    for (let i = 0; i < startDow; i++) padFront.push(null);
    const orderedDays = [...padFront];
    let cur = startDate;
    while (cur.isBefore(today) || cur.isSame(today, 'day')) {
      const ds = cur.format('YYYY-MM-DD');
      orderedDays.push(buckets.get(ds) || { date: ds, total: 0, by_platform: {} });
      cur = cur.add(1, 'day');
    }
    // Ensure LAST week is always 7 entries so its height/width matches other columns (no more different-looking last column)
    const w = [];
    for (let i = 0; i < orderedDays.length; i += 7) {
      const wk = orderedDays.slice(i, i + 7);
      while (wk.length < 7) wk.push(null);
      w.push(wk);
    }
    return w;
  }, [daysArr, startDate, today]);

  const totalValue = useMemo(
    () => weeks.flat().filter(Boolean).reduce((a, d) => a + heatmapValueFor(d, enabledKeys), 0),
    [weeks, enabledKeys],
  );
  const activeDays = useMemo(
    () => weeks.flat().filter((d) => d && heatmapValueFor(d, enabledKeys) > 0).length,
    [weeks, enabledKeys],
  );
  const totalHours = useMemo(
    () => hourlyArr.reduce((a, h) => a + hourlyValueFor(hourlyArr[Number(h.hour)] || h, enabledKeys), 0),
    [hourlyArr, enabledKeys],
  );
  const peakHour = useMemo(() => {
    let best = -1; let bv = -1;
    for (let h = 0; h < 24; h++) {
      const v = hourlyValueFor(hourlyArr[h], enabledKeys);
      if (v > bv) { bv = v; best = h; }
    }
    return { hour: best, value: bv };
  }, [hourlyArr, enabledKeys]);

  const togglePlat = useCallback((key) => setEnabledKeys((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  }), []);
  const selectAll = useCallback(() => setEnabledKeys(new Set(allPlatforms.map((p) => p.key))), [allPlatforms]);
  const clearAll = useCallback(() => setEnabledKeys(new Set()), []);
  const monthHeaders = useMemo(() => {
    const out = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstNonNull = week.find(Boolean);
      if (!firstNonNull) return;
      const m = Number(firstNonNull.date.slice(5, 7));
      if (m !== lastMonth) {
        const names = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
        out.push({ wi, label: names[m - 1] });
        lastMonth = m;
      }
    });
    return out;
  }, [weeks]);
  const lastDay = today;
  const firstDay = startDate;

  return (
    <motion.div variants={FADE_UP} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} className="mb-6">
      <div className="rounded-2xl border border-black/[0.04] bg-white shadow-card p-5 overflow-hidden">
        {/* Header row: Purple Title + Stats (left)  +  Filters split 2 rows (FULL WIDTH): row1 = all/clear/legend; row2 = platform chips FULL WIDTH */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Row A: Left = Purple icon + Title + Stats, Right = all/clear + Less-More */}
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4263EB] to-[#6366f1] flex items-center justify-center shrink-0 shadow-sm">
                <Activity size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[15.5px] font-semibold tracking-tight text-ink-900">内容发布总体统计</h2>
                  <span className="text-[11px] text-ink-400 bg-ink-50 rounded-full px-2 py-0.5">
                    {activeDays} 天活跃 / {weeks.flat().filter(Boolean).length} 天
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-ink-500 flex items-center gap-2 flex-wrap">
                  <span>{firstDay.format('YYYY/MM/DD')} → {lastDay.format('YYYY/MM/DD')}</span>
                  <span className="text-ink-300">·</span>
                  <span>365 天总频率 <b className="text-ink-800 tabular-nums">{formatShort(totalValue)}</b></span>
                  <span className="text-ink-300">·</span>
                  <span>
                    峰值时段 <b className="text-ink-800 tabular-nums">{String(peakHour.hour).padStart(2, '0')}:00</b>
                    {peakHour.value > 0 && <span className="text-ink-400 ml-1">（{formatShort(peakHour.value)}）</span>}
                  </span>
                  {totalHours > 0 && totalHours !== totalValue && (
                    <>
                      <span className="text-ink-300">·</span>
                      <span>近 365 天 24h 总计 <b className="text-ink-800 tabular-nums">{formatShort(totalHours)}</b></span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {/* Row A Right: 全部 / 清空 / Less-More legend */}
            <div className="flex flex-wrap items-center gap-2">
              {allPlatforms.length > 0 && (
                <>
                  <button onClick={selectAll} className="h-[25.5px] px-2 rounded-lg border border-ink-200 bg-white hover:bg-ink-50 text-[11px] font-semibold text-ink-700">全部</button>
                  <button onClick={clearAll} className="h-[25.5px] px-2 rounded-lg border border-ink-200 bg-white hover:bg-ink-50 text-[11px] font-semibold text-ink-500">清空</button>
                  <div className="w-px h-4 bg-ink-200 mx-0.5" />
                </>
              )}
              <div className="flex items-center gap-1 text-[10.5px] text-ink-500">
                <span className="font-semibold">Less</span>
                <span className="w-3 h-3 rounded-sm bg-[#1f2937]/10 ring-1 ring-black/5" />
                <span className="w-3 h-3 rounded-sm bg-[#86efac]" />
                <span className="w-3 h-3 rounded-sm bg-[#4ade80]" />
                <span className="w-3 h-3 rounded-sm bg-[#16a34a]" />
                <span className="w-3 h-3 rounded-sm bg-[#14532d]" />
                <span className="font-semibold">More</span>
              </div>
            </div>
          </div>
          {/* Row B: Platform chips — Grid 9 cols × 2 rows (18 total exactly) so never 1 row or 3 rows */}
          <div className="grid grid-cols-9 w-full gap-2">
            {allPlatforms.map((p) => {
              const checked = enabledKeys.has(p.key);
              return (
                <label
                  key={p.key}
                  className={
                    'inline-flex items-center justify-center gap-1.5 h-[27px] px-2 rounded-[7px] border cursor-pointer select-none transition ' +
                    (checked
                      ? 'border-emerald-400/60 bg-emerald-50/70 text-emerald-800 shadow-[0_0_0_2px_rgba(16,185,129,0.08)]'
                      : 'border-ink-200 bg-white text-ink-500 hover:bg-ink-50 opacity-80')
                  }
                >
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-emerald-600 shrink-0"
                    checked={checked}
                    onChange={() => togglePlat(p.key)}
                  />
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: checked ? p.color : '#cbd5e1' }} />
                  <span className="text-[11.5px] font-medium whitespace-nowrap leading-none truncate">{p.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Content grid: EQUAL WIDTH 2-cols at lg+ — both columns same size, symmetrical cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 xl:gap-7 items-stretch">
          {/* LEFT — 52 week heatmap card (inside: title + heatmap + stats) */}
          <div className="rounded-2xl border border-emerald-100/70 bg-gradient-to-br from-white via-[#F0FDF4]/20 to-[#ECFDF5]/30 p-4 flex flex-col">
            <HeatmapOnly
              weeks={weeks}
              monthHeaders={monthHeaders}
              enabledKeys={enabledKeys}
            />
          </div>
          {/* RIGHT — Activity Periods 24h card (inside: title + curve + KPIs) */}
          <div className="rounded-2xl border border-emerald-100/70 bg-gradient-to-br from-white via-[#ECFDF5]/30 to-[#F0FDF4]/20 p-4 flex flex-col">
            <ActivityPeriods24h
              hourlyArr={hourlyArr}
              enabledKeys={enabledKeys}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HeatmapOnly({ weeks, monthHeaders, enabledKeys }) {
  const percentiles = useMemo(() => {
    const vals = weeks.flat().filter(Boolean).map((d) => heatmapValueFor(d, enabledKeys));
    return frequencyPercentiles(vals);
  }, [weeks, enabledKeys]);
  const GAP = 1;
  const WEEKS_N = weeks.length || 53;
  // Vertical rectangle: WIDTH auto-fills (narrow), HEIGHT fixed 22px (taller than width).
  // → Tall vertical cells hug together in 7 stacked rows, no scattered blank space.
  const CELL_H = 22;
  // Cell width = (100% minus all horizontal gaps) divided evenly across N week columns.
  const CELL_W = `calc((100% - ${(WEEKS_N - 1) * GAP}px) / ${WEEKS_N})`;
  const MONTH_LEFT_BASE = 24; // pl-6 == 24px
  const FLAT_DAYS = useMemo(() => weeks.flat().filter(Boolean), [weeks]);
  const last7Stats = useMemo(() => {
    const n = Math.min(FLAT_DAYS.length, 7);
    const recent = FLAT_DAYS.slice(-n);
    const prev = FLAT_DAYS.slice(Math.max(0, FLAT_DAYS.length - 2 * n), FLAT_DAYS.length - n);
    const rSum = recent.reduce((a, d) => a + heatmapValueFor(d, enabledKeys), 0);
    const pSum = prev.reduce((a, d) => a + heatmapValueFor(d, enabledKeys), 0) || 1;
    const pct = ((rSum - pSum) / pSum) * 100;
    const max = recent.reduce((m, d) => Math.max(m, heatmapValueFor(d, enabledKeys)), 0);
    const maxD = recent.find((d) => heatmapValueFor(d, enabledKeys) === max);
    return { sum: rSum, pct, max: { date: maxD?.date ?? '-', value: max } };
  }, [FLAT_DAYS, enabledKeys]);
  // Streaks: current consecutive active days (from today backwards) + longest silent (all-zero) run in 365d
  const streakStats = useMemo(() => {
    const ordered = weeks.flat();
    const tail = [...ordered].reverse();
    let cur = 0;
    for (const d of tail) {
      if (d && heatmapValueFor(d, enabledKeys) > 0) cur++;
      else break;
    }
    let maxSilent = 0, run = 0;
    for (const d of ordered) {
      if (!d || heatmapValueFor(d, enabledKeys) <= 0) { run++; if (run > maxSilent) maxSilent = run; }
      else run = 0;
    }
    return { currentActive: cur, longestSilent: maxSilent };
  }, [weeks, enabledKeys]);
  return (
    <div className="flex flex-col gap-4 h-full w-full min-w-0">
      <div className="text-[13px] text-ink-600 font-semibold flex items-center gap-2 shrink-0">
        <span className="inline-block w-2 h-2 rounded-full bg-[#16a34a]" />
        按日发布频率 · 52 周 × 7 日
      </div>
      {/* Compact rectangle cells — width fills 100%, height small → horizontal rects with no scattered blank space */}
      <div className="w-full min-w-0 flex-1 min-h-[200px] flex items-start justify-center">
        <div className="w-full max-w-full flex flex-col">
          {/* Month headers row */}
          <div className="flex pl-6 mb-1.5 relative h-4 leading-4 shrink-0">
            {monthHeaders.map((mh, i) => {
              const leftPct = (mh.wi / WEEKS_N) * 100;
              return (
                <div
                  key={i}
                  className="absolute text-[10.5px] text-ink-500 font-semibold tracking-tight"
                  style={{ left: `calc(${MONTH_LEFT_BASE}px + ${leftPct}% )` }}
                >
                  {mh.label}
                </div>
              );
            })}
          </div>
          {/* Main body: weekday label column + weeks grid. Compact top-aligned so rows hug together */}
          <div className="flex gap-2 w-full min-w-0 items-start">
            <div className="flex flex-col pt-0 text-[10px] text-ink-500 font-medium w-4 shrink-0" style={{ gap: `${GAP}px`, lineHeight: `${CELL_H}px` }}>
              <div style={{ height: `${CELL_H}px` }}>一</div>
              <div style={{ height: `${CELL_H}px` }}></div>
              <div style={{ height: `${CELL_H}px` }}>三</div>
              <div style={{ height: `${CELL_H}px` }}></div>
              <div style={{ height: `${CELL_H}px` }}>五</div>
              <div style={{ height: `${CELL_H}px` }}></div>
              <div style={{ height: `${CELL_H}px` }}></div>
            </div>
            <div className={`flex flex-1 items-start`} style={{ gap: `${GAP}px` }}>
              {weeks.map((week, wi) => (
                <div
                  key={wi}
                  className="flex flex-col items-start"
                  style={{ gap: `${GAP}px`, width: CELL_W, minWidth: 0 }}
                >
                  {Array.from({ length: 7 }).map((_, ri) => {
                    const d = week[ri] || null;
                    const v = heatmapValueFor(d, enabledKeys);
                    const cls = frequencyColorClass(v, percentiles);
                    const hasData = v > 0;
                    return (
                      <div
                        key={ri}
                        className={`w-full rounded-[2px] ring-1 ring-black/[0.04] ${cls} ${hasData ? 'hover:ring-emerald-500/50 hover:scale-[1.20] transition-transform origin-center z-10 relative' : ''}`}
                        style={{ height: `${CELL_H}px` }}
                        title={d ? `${d.date} · 发布频率 ${v}` : ''}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2.5 shrink-0 pt-0.5">
        <div className="rounded-xl border border-black/[0.04] bg-gradient-to-br from-emerald-50/80 to-emerald-50/30 px-3 py-2.5">
          <div className="text-[10.5px] text-emerald-700/80 font-medium">最近 7 天</div>
          <div className="mt-0.5 text-[16px] font-bold text-emerald-800 tabular-nums leading-tight">
            {formatShort(last7Stats.sum)}
            <span className="ml-1 text-[10.5px] font-semibold text-emerald-600/80 align-super">
              {last7Stats.pct >= 0 ? `↑ ${last7Stats.pct.toFixed(0)}%` : `↓ ${(-last7Stats.pct).toFixed(0)}%`}
            </span>
          </div>
          <div className="text-[10.5px] text-emerald-700/60 mt-0.5">vs 前 7 天</div>
        </div>
        <div className="rounded-xl border border-black/[0.04] bg-gradient-to-br from-[#EEF2FF]/90 to-[#EEF2FF]/30 px-3 py-2.5">
          <div className="text-[10.5px] text-indigo-700/80 font-medium">单日峰值</div>
          <div className="mt-0.5 text-[16px] font-bold text-indigo-800 tabular-nums leading-tight">
            {formatShort(last7Stats.max.value)}
          </div>
          <div className="text-[10.5px] text-indigo-700/60 mt-0.5 truncate">{last7Stats.max.date}</div>
        </div>
        <div className="rounded-xl border border-black/[0.04] bg-gradient-to-br from-[#EAF6FF]/90 to-[#EAF6FF]/30 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10.5px] text-sky-700/80 font-medium">连续活跃</div>
            <div className="text-[10.5px] text-sky-500/70 font-medium">最长静默</div>
          </div>
          <div className="flex items-center justify-between leading-none">
            <div className="text-[16px] font-bold text-sky-800 tabular-nums">
              {streakStats.currentActive}<span className="ml-0.5 text-[10.5px] font-semibold text-sky-600/70">天</span>
            </div>
            <div className="text-[10.5px] text-sky-600/60 font-medium">vs 365 天</div>
            <div className="text-[16px] font-bold text-slate-500 tabular-nums">
              {streakStats.longestSilent}<span className="ml-0.5 text-[10.5px] font-semibold text-slate-500/80">天</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityPeriods24h({ hourlyArr, enabledKeys }) {
  const valuesByHour = useMemo(() => {
    const map = new Map();
    for (let h = 0; h < 24; h++) {
      const v = hourlyValueFor(hourlyArr[h], enabledKeys);
      map.set(h, v);
    }
    return map;
  }, [hourlyArr, enabledKeys]);
  const allValues = Array.from(valuesByHour.values());
  const maxV = Math.max(1, ...allValues);
  const anchors = useMemo(() => {
    const seq = [];
    const order = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];
    const spacingPct = 100 / (order.length - 1);
    order.forEach((h, i) => {
      const xPct = i * spacingPct;
      const v = valuesByHour.get(h) || 0;
      seq.push({ hour: h, xPct, value: v });
    });
    return seq;
  }, [valuesByHour]);
  const peakMeta = useMemo(() => {
    let pk = -1, pv = -1, qk = -1, qv = Infinity;
    for (let h = 0; h < 24; h++) {
      const v = valuesByHour.get(h) || 0;
      if (v > pv) { pv = v; pk = h; }
      if (v < qv) { qv = v; qk = h; }
    }
    const day = Array.from({ length: 12 }, (_, i) => i + 6).reduce((s, h) => s + (valuesByHour.get(h) || 0), 0);
    const night = allValues.reduce((a, b) => a + b, 0) - day;
    return { pk, pv, qk, qv, day, night, total: allValues.reduce((a, b) => a + b, 0) };
  }, [valuesByHour, allValues]);

  const bubbleSizeFor = (v) => {
    if (!v || v <= 0) return 10;
    const ratio = v / maxV;
    if (ratio < 0.25) return 14;
    if (ratio < 0.6) return 22;
    if (ratio < 0.9) return 30;
    return 38;
  };
  const bubbleFillFor = (v) => {
    if (!v || v <= 0) return 'bg-white ring-1 ring-emerald-200';
    const ratio = v / maxV;
    if (ratio < 0.25) return 'bg-[#86efac] border border-white shadow-sm';
    if (ratio < 0.6) return 'bg-[#4ade80] border border-white shadow-[0_2px_8px_-2px_rgba(16,185,129,0.45)]';
    if (ratio < 0.9) return 'bg-[#16a34a] border border-white shadow-[0_4px_14px_-2px_rgba(22,163,74,0.55)]';
    return 'bg-[#14532d] border border-white shadow-[0_6px_20px_-3px_rgba(20,83,45,0.6)]';
  };
  const showXLabels = [6, 9, 12, 15, 18, 21, 0];
  return (
    <div className="flex flex-col gap-4 h-full w-full min-w-0">
      <div className="text-[13px] text-ink-600 font-semibold flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-[#16a34a]" />
        发布时间活跃分布 · 24 小时周期
        <span className="text-[10.5px] text-ink-400 font-normal">（06:00 → 次日 06:00）</span>
      </div>
      <div className="relative flex-1 px-1 py-2 min-h-[210px]">
        {/* Horizontal reference band 06-18 subtle green tint (06 is anchor index 0 → 4% left margin; 18 is index 12 → 12/24 = 50% → right = 50%) */}
        <div className="absolute inset-y-0 left-[4%] right-[50%] pointer-events-none bg-gradient-to-b from-[#D1FAE5]/55 via-[#D1FAE5]/22 to-transparent rounded-r-2xl" />

        {/* SVG curved line + soft area — pointer-events:none so HTML bubble hitboxes above always catch hover */}
        <div className="relative h-[190px]">
          <svg viewBox="0 0 100 95" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
            <defs>
              <linearGradient id="act24hArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.26" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Reference gridlines */}
            <g stroke="#BBF7D0" strokeDasharray="1 2" strokeWidth="0.42">
              <line x1="0" y1="76" x2="100" y2="76" />
              <line x1="0" y1="52" x2="100" y2="52" />
              <line x1="0" y1="28" x2="100" y2="28" />
            </g>
            {/* Zero baseline */}
            <line x1="0" y1="84" x2="100" y2="84" stroke="#A7F3D0" strokeWidth="0.5" strokeDasharray="2 2" />
            {/* Area */}
            <path
              d={(() => {
                const pts = anchors.map((a) => {
                  const ratio = Math.min(1, a.value / maxV);
                  const y = 78 - ratio * 64;
                  return { x: a.xPct, y };
                });
                if (!pts.length) return '';
                const first = pts[0], last = pts[pts.length - 1];
                let d = `M ${first.x} 86 L ${first.x} ${first.y}`;
                for (let i = 1; i < pts.length; i++) {
                  const p = pts[i], pr = pts[i - 1];
                  const cx1 = pr.x + (p.x - pr.x) * 0.5;
                  const cx2 = pr.x + (p.x - pr.x) * 0.5;
                  d += ` C ${cx1} ${pr.y}, ${cx2} ${p.y}, ${p.x} ${p.y}`;
                }
                d += ` L ${last.x} 86 Z`;
                return d;
              })()}
              fill="url(#act24hArea)"
            />
            {/* Line */}
            <path
              d={(() => {
                const pts = anchors.map((a) => {
                  const ratio = Math.min(1, a.value / maxV);
                  const y = 78 - ratio * 64;
                  return { x: a.xPct, y };
                });
                if (!pts.length) return '';
                let d = `M ${pts[0].x} ${pts[0].y}`;
                for (let i = 1; i < pts.length; i++) {
                  const p = pts[i], pr = pts[i - 1];
                  const cx1 = pr.x + (p.x - pr.x) * 0.5;
                  const cx2 = pr.x + (p.x - pr.x) * 0.5;
                  d += ` C ${cx1} ${pr.y}, ${cx2} ${p.y}, ${p.x} ${p.y}`;
                }
                return d;
              })()}
              fill="none"
              stroke="#047857"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Bubbles — 28x28 transparent hitbox per anchor so hover is reliable even on tiny 10px dots */}
          <div className="absolute inset-0 pointer-events-none">
            {anchors.map((a, idx) => {
              const ratio = Math.min(1, a.value / maxV);
              const size = bubbleSizeFor(a.value);
              const yBottom = 4 + ratio * 80;
              const fillCls = bubbleFillFor(a.value);
              const isPeak = a.hour === peakMeta.pk && a.value > 0 && a.value === peakMeta.pv;
              return (
                <div
                  key={idx}
                  className="absolute -translate-x-1/2 pointer-events-auto cursor-help"
                  style={{
                    left: `${a.xPct}%`,
                    bottom: `${yBottom}%`,
                    width: '28px',
                    height: '28px',
                  }}
                  title={`${String(a.hour).padStart(2,'0')}:00 · 发布频率 ${a.value}`}
                >
                  <div
                    className={`absolute rounded-full flex items-center justify-center ${fillCls} ${isPeak ? 'ring-2 ring-emerald-400/60 ring-offset-1 ring-offset-white' : ''}`}
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      left: '50%',
                      bottom: 0,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {a.value > 0 && size >= 22 && (
                      <span className="text-[10px] font-bold tabular-nums text-white leading-none" style={{ textShadow: '0 1px 2px rgba(6,78,59,0.6)' }}>
                        {a.value >= 1000 ? `${(a.value/1000).toFixed(1)}k` : a.value >= 100 ? a.value : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* X axis labels + tick lines */}
        <div className="relative h-6">
          {anchors
            .filter((a, i, arr) => showXLabels.includes(a.hour) && (a.hour !== 6 || i > arr.length / 2))
            .map((a, i) => {
              const label = a.hour === 0 ? '24:00' : `${String(a.hour).padStart(2,'0')}:00`;
              return (
                <div key={i} className="absolute" style={{ left: `${a.xPct}%`, top: 0 }}>
                  <div className="relative">
                    <div className="w-px h-2 bg-emerald-200/80 mx-auto" />
                    <div className="absolute -translate-x-1/2 top-2 text-[11px] font-semibold text-emerald-800/80 tabular-nums whitespace-nowrap">
                      {label}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Bottom KPI row — mt-auto pins to card bottom, symmetrical with left column */}
      <div className="grid grid-cols-3 gap-2.5 mt-auto pt-0.5">
        <div className="rounded-xl border border-black/[0.04] bg-gradient-to-br from-[#ECFDF5] to-white px-3 py-2.5">
          <div className="text-[10.5px] text-emerald-700/80 font-medium">白天 06–18</div>
          <div className="mt-0.5 text-[15px] font-bold text-emerald-800 tabular-nums leading-tight">
            {formatShort(peakMeta.day)}
          </div>
          <div className="text-[10px] text-emerald-700/60 mt-0.5">
            {peakMeta.total > 0 ? `占比 ${((peakMeta.day / peakMeta.total) * 100).toFixed(0)}%` : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-black/[0.04] bg-gradient-to-br from-[#F0FDF4] to-white px-3 py-2.5">
          <div className="text-[10.5px] text-emerald-700/80 font-medium">峰值时段</div>
          <div className="mt-0.5 text-[15px] font-bold text-emerald-800 tabular-nums leading-tight">
            {String(peakMeta.pk).padStart(2,'0')}:00
            {peakMeta.pv > 0 && <span className="ml-1 text-[11px] font-semibold text-emerald-600/80">{formatShort(peakMeta.pv)}</span>}
          </div>
          <div className="text-[10px] text-emerald-700/60 mt-0.5">当日最活跃</div>
        </div>
        <div className="rounded-xl border border-black/[0.04] bg-gradient-to-br from-[#F0FDFA] to-white px-3 py-2.5">
          <div className="text-[10.5px] text-teal-800/80 font-medium">夜间 18–06</div>
          <div className="mt-0.5 text-[15px] font-bold text-teal-800 tabular-nums leading-tight">
            {formatShort(peakMeta.night)}
          </div>
          <div className="text-[10px] text-teal-800/60 mt-0.5">
            {peakMeta.total > 0 ? `占比 ${((peakMeta.night / peakMeta.total) * 100).toFixed(0)}% · 低谷 ${String(peakMeta.qk).padStart(2,'0')}:00` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

function parseNumericValue(input) {
  if (input == null) return { value: 0, suffix: '', prefix: '', unit: '', percent: false, negative: false };
  if (typeof input === 'number') return { value: input, suffix: '', prefix: '', unit: '', percent: false, negative: input < 0, rawUnit: '' };
  const raw = String(input).trim();
  let text = raw;
  const negative = text.includes('−') || /^\s*-/.test(text);
  text = text.replace(/−/g, '-').replace(/^\s*-\s*/, '');
  const percentMatch = text.match(/%/);
  const percent = !!percentMatch;
  text = text.replace(/%/g, '');
  let unit = '';
  let rawUnit = '';
  let value = 0;
  const millionMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*亿/);
  if (millionMatch) { rawUnit = '亿'; unit = ' 亿'; value = Number(millionMatch[1]) * 1e8; text = text.replace(millionMatch[0], ''); }
  else {
    const wanMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*万/);
    if (wanMatch) { rawUnit = '万'; unit = ' 万'; value = Number(wanMatch[1]) * 1e4; text = text.replace(wanMatch[0], ''); }
    else {
      const kMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*[kK]/);
      if (kMatch) { rawUnit = 'K'; unit = 'K'; value = Number(kMatch[1]) * 1e3; text = text.replace(kMatch[0], ''); }
      else {
        const pureNum = text.match(/-?\d+(?:\.\d+)?/);
        if (pureNum) value = Number(pureNum[0]);
      }
    }
  }
  const prefixMatch = raw.match(/^([^\d\s\-−]+)/);
  const suffixMatch = raw.match(/([^\d\s%亿万kK.]+)$/i);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  const suffix = suffixMatch ? suffixMatch[1] : '';
  return { value: negative ? -Math.abs(value) : value, suffix, prefix, unit, percent, negative, rawUnit };
}

function AnimatedNumber({ value, format, duration = 1.1, digits = 2, flash = false }) {
  const [display, setDisplay] = useState(0);
  const [doFlash, setDoFlash] = useState(false);
  const lastValueRef = useRef(null);
  const rafRef = useRef(0);
  const flashTimerRef = useRef(0);
  const parsed = useMemo(() => parseNumericValue(value), [value]);
  const formatter = useMemo(() => {
    if (typeof format === 'function') return format;
    return (v) => {
      const abs = Math.abs(v);
      let text;
      if (parsed.unit === ' 亿') text = (abs / 1e8).toFixed(2) + ' 亿';
      else if (parsed.unit === ' 万') text = (abs / 1e4).toFixed(1) + ' 万';
      else if (parsed.unit === 'K')   text = (abs / 1e3).toFixed(1) + 'K';
      else if (parsed.percent)       text = Number(abs).toFixed(digits);
      else                           text = new Intl.NumberFormat('zh-CN').format(Math.round(abs));
      const numText = v < 0 ? `-${text}` : text;
      if (parsed.percent) return `${parsed.prefix}${numText}%${parsed.suffix}`;
      return `${parsed.prefix}${numText}${parsed.suffix}`;
    };
  }, [format, parsed.unit, parsed.percent, parsed.prefix, parsed.suffix, digits]);
  useEffect(() => {
    if (lastValueRef.current !== null && parsed.value !== lastValueRef.current) setDoFlash(true);
    const start = performance.now();
    const from = lastValueRef.current != null && typeof lastValueRef.current === 'number' ? lastValueRef.current : 0;
    const to = parsed.value || 0;
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
  }, [parsed.value, duration]);
  const formatted = formatter(display);
  if (flash && doFlash) {
    return (
      <motion.span
        animate={{ color: ['#059669', '#18181b'] }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="inline-block tabular-nums"
      >{formatted}</motion.span>
    );
  }
  return <span className="tabular-nums">{formatted}</span>;
}
AnimatedNumber = React.memo(AnimatedNumber);

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

let GranularityChip = function GranularityChip({ value, onChange, compact = false }) {
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
};
GranularityChip = React.memo(GranularityChip);

function useRealtimeTicker(data, setData, enabled, setFlashRecords, setFlashIds) {
  useEffect(() => {
  }, [enabled, data?.latestRecords?.length, setData, setFlashRecords, setFlashIds]);
}


let StatCard = function StatCard({ icon: Icon, label, value, sub, accent, trend, trendDown, animated = true, flash = false }) {
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
  const parsed = parseNumericValue(value);
  const canAnimate = animated && (typeof value === 'number' || parsed.value !== 0 || String(value).match(/\d/));
  return (
    <motion.div
      variants={FADE_UP}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25, margin: "-120px" }}
      animate={flash
        ? {
            boxShadow: ['0 1px 2px rgba(0,0,0,0.05)', '0 0 0 3px rgba(34,197,94,0.15)', '0 1px 2px rgba(0,0,0,0.05)'],
          }
        : undefined}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26, duration: 0.2 }}
      className="bg-white rounded-2xl border border-black/[0.04] shadow-card p-5 sm:p-6 flex flex-col gap-3 sm:gap-4 relative overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
          <Icon size={20} strokeWidth={2.2} />
        </div>
        {trend && (
          <motion.div
            initial={{ opacity: 0, scale: 0.88 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            transition={{ delay: 0.28, type: 'spring', stiffness: 320, damping: 22 }}
            className={`flex items-center gap-1 text-[11px] sm:text-xs px-2 py-1 rounded-full font-medium ${trendColor}`}
          >
            <TrendIcon size={12} />
            {trend}
          </motion.div>
        )}
      </div>
      <div>
        <div className="text-[12.5px] sm:text-[13px] text-ink-500 font-medium mb-1 sm:mb-1.5">{label}</div>
        <motion.div
          animate={flash ? { backgroundColor: ['rgba(34,197,94,0)', 'rgba(34,197,94,0.10)', 'rgba(34,197,94,0)'] } : {}}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink-900 leading-none tabular-nums rounded-xl -mx-2 px-2 py-0.5 inline-flex"
        >
          {canAnimate ? (
            <AnimatedNumber value={value} flash={flash} />
          ) : value}
        </motion.div>
        {sub && <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.42, duration: 0.45 }} className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-ink-500">{sub}</motion.div>}
      </div>
      <div className={`absolute -bottom-24 -right-24 w-40 h-40 rounded-full opacity-20 blur-3xl bg-gradient-to-br ${gradient} pointer-events-none`} />
    </motion.div>
  );
};
StatCard = React.memo(StatCard);

let StatCardMini = function StatCardMini({ icon: Icon, label, value, accent, sub }) {
  const gradient = {
    indigo: 'from-indigo-500/15 to-violet-500/5 text-indigo-600',
    sky: 'from-sky-500/15 to-cyan-500/5 text-sky-600',
    emerald: 'from-emerald-500/15 to-teal-500/5 text-emerald-600',
    amber: 'from-amber-500/15 to-orange-500/5 text-amber-600',
    rose: 'from-rose-500/15 to-pink-500/5 text-rose-600',
  }[accent] || 'from-slate-500/15 to-slate-500/5 text-slate-600';
  const parsed = parseNumericValue(value);
  const canAnimate = typeof value === 'number' || parsed.value !== 0 || String(value).match(/\d/);
  return (
    <motion.div
      variants={FADE_UP}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3, margin: "-100px" }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="rounded-2xl border border-black/[0.04] bg-white p-3.5 sm:p-4 flex flex-col gap-2.5 relative overflow-hidden min-w-0"
    >
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
        <Icon size={17} strokeWidth={2.1} />
      </div>
      <div className="min-w-0">
        <div className="text-[11.5px] text-ink-500 font-medium mb-0.5 truncate">{label}</div>
        <div className="text-[18px] sm:text-[20px] font-semibold tracking-tight text-ink-900 tabular-nums leading-none whitespace-nowrap">
          {canAnimate ? <AnimatedNumber value={value} /> : value}
        </div>
        {sub && <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 0.4 }} className="mt-1 text-[10.5px] sm:text-[11px] text-ink-500 leading-snug line-clamp-2 break-words">{sub}</motion.div>}
      </div>
    </motion.div>
  );
};
StatCardMini = React.memo(StatCardMini);

let PlatformLogo = function PlatformLogo({ platformKeyOrName, size = 14, className, style }) {
  const meta = PLATFORM_META[platformKeyOrName]
    || Object.values(PLATFORM_META).find(m => m.name === platformKeyOrName || m.key === platformKeyOrName)
    || null;
  const color = meta?.color || '#6366f1';
  const raw = PLATFORM_LOGOS?.[meta?.key] || meta?.logo_svg || null;
  if (raw && typeof raw === 'string') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 ${className || ''}`}
        style={{ color, width: size, height: size, ...(style || {}) }}
        dangerouslySetInnerHTML={{ __html: raw }}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${className || ''}`}
      style={{ background: color, width: size, height: size, ...(style || {}) }}
    />
  );
};
PlatformLogo = React.memo(PlatformLogo);

let PlatformTag = function PlatformTag({ name, size = 'md' }) {
  const meta = PLATFORM_META[name] || PLATFORM_META[name?.replace(/\s*\(.*\)/, '')];
  const color = meta?.color || '#6366f1';
  const sz = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sz}`}
      style={{ background: `${color}12`, color }}
    >
      <PlatformLogo platformKeyOrName={name} size={size === 'sm' ? 11 : 12} />
      {name}
    </span>
  );
};
PlatformTag = React.memo(PlatformTag);

let Avatar = function Avatar({ gradient, name, size = 40, src, dataUrl, platformKey, platformName }) {
  const imageUrl = dataUrl || src;
  const [failed, setFailed] = useState(false);
  const fallback = () => {
    const pm = PLATFORM_META[platformKey] || Object.values(PLATFORM_META).find(m => m.key === platformKey || m.name === (platformKey || platformName));
    const color = pm?.color || '#6366f1';
    const logoSvg = PLATFORM_LOGOS?.[pm?.key] || pm?.logo_svg || null;
    const [a, b] = (gradient || (pm ? (color + ',' + '#6366f1') : '#6366f1,#8b5cf6')).split(',');
    return (
      <div
        className="rounded-2xl flex items-center justify-center text-white text-sm font-semibold shadow-inner shrink-0"
        style={{
          width: size, height: size, fontSize: size * 0.36,
          background: (logoSvg ? color : `linear-gradient(135deg, ${a}, ${b})`), letterSpacing: '0.02em',
          color: '#ffffff',
        }}
      >
        {logoSvg ? (
          <span style={{ color: '#ffffff', width: Math.round(size * 0.56), height: Math.round(size * 0.56), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: logoSvg }} />
        ) : (name ? name.slice(0, 1) : '?')}
      </div>
    );
  };
  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name || ''}
        loading="lazy"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={(e) => { setFailed(true); try { e.currentTarget.style.display = 'none'; } catch {} }}
        className="rounded-2xl object-cover shrink-0 shadow-inner"
        style={{ width: size, height: size, background: '#f4f4f5' }}
        key={`${imageUrl}|${failed}`}
      />
    );
  }
  return fallback();
};
Avatar = React.memo(Avatar);

let Skeleton = function Skeleton({ className = '', w, h }) {
  return <div className={`animate-pulse rounded-lg bg-ink-100 ${className}`} style={{ width: w, height: h }} />;
};
Skeleton = React.memo(Skeleton);

let SelectChip = function SelectChip({ value, options, onChange, placeholder = '筛选', icon: Icon }) {
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
};
SelectChip = React.memo(SelectChip);

function ProfileView({ onBack, currentUser, showToast, onUpdateCurrentUser }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarGradient, setAvatarGradient] = useState(AVATAR_POOL[0]);
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changing, setChanging] = useState(false);
  const [history, setHistory] = useState([]);

  const [tokens, setTokens] = useState([]);
  const [showGenToken, setShowGenToken] = useState(false);
  const [genLabel, setGenLabel] = useState('');
  const [genDays, setGenDays] = useState('365');
  const [genOperatorUid, setGenOperatorUid] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [revealToken, setRevealToken] = useState(null);
  const [revokeBusyId, setRevokeBusyId] = useState(null);
  const [expandedTokenIds, setExpandedTokenIds] = useState(() => new Set());
  const [siteOverview, setSiteOverview] = useState(null);
  const [operators, setOperators] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchMe();
      if (r) {
        setMe(r);
        setDisplayName(r.display_name || r.name || '');
        setEmail(r.email || '');
        setAvatarGradient(r.avatar_gradient || AVATAR_POOL[0]);
        setAvatarDataUrl(r.avatar_data_url || '');
      }
      try {
        const hr = await adminApi('/admin/audit-logs?limit=12&role=me');
        if (hr && Array.isArray(hr)) setHistory(hr);
        else if (hr?.rows && Array.isArray(hr.rows)) setHistory(hr.rows);
      } catch {}
      const tr = await listCollectorTokens();
      if (tr && Array.isArray(tr)) setTokens(tr);
      else if (tr?.tokens && Array.isArray(tr.tokens)) setTokens(tr.tokens);
      else if (tr?.items && Array.isArray(tr.items)) setTokens(tr.items);
      else setTokens([]);
      if (currentUser?.role === 'admin') {
        try {
          const so = await adminSiteOverview();
          if (so && so.site) setSiteOverview(so);
        } catch {}
        try {
          const op = await listOperators();
          setOperators(op?.items || []);
        } catch {}
      }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [currentUser?.role]);

  const toggleExpand = (id) => {
    setExpandedTokenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const patch = { display_name: displayName, email, avatar_gradient: avatarGradient, avatar_data_url: avatarDataUrl };
      const r = await updateMe(patch);
      if (r?.ok !== false) {
        showToast('已保存个人资料', 'success');
        try { await initAuth(); } catch {}
        onUpdateCurrentUser?.(prev => ({
          ...(prev || {}),
          display_name: patch.display_name,
          displayName: patch.display_name,
          email: patch.email,
          avatar_gradient: patch.avatar_gradient,
          avatar_data_url: patch.avatar_data_url,
        }));
        load();
      } else {
        showToast?.('保存失败：' + ((r?.detail) || r?.message || r?.error || '未知错误'), 'error');
      }
    } catch (e) { showToast?.('保存失败：' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  const onChangePw = async () => {
    if (newPw.length < 8) { showToast?.('新密码至少 8 位', 'warn'); return; }
    if (newPw !== confirmPw) { showToast?.('两次输入的新密码不一致', 'warn'); return; }
    setChanging(true);
    try {
      const r = await changePassword({ old_password: oldPw, new_password: newPw });
      if (r?.ok !== false) {
        showToast('密码已更新，所有其他设备已退出登录', 'success');
        setOldPw(''); setNewPw(''); setConfirmPw('');
      } else {
        showToast?.('修改失败：' + ((r?.detail) || r?.message || r?.error || '旧密码错误？'), 'error');
      }
    } catch (e) { showToast?.('修改失败：' + e.message, 'error'); }
    finally { setChanging(false); }
  };

  const pwStrength = useMemo(() => {
    const s = newPw;
    let score = 0;
    if (s.length >= 8) score++;
    if (s.length >= 12) score++;
    if (/[A-Z]/.test(s)) score++;
    if (/[a-z]/.test(s)) score++;
    if (/\d/.test(s)) score++;
    if (/[^A-Za-z0-9]/.test(s)) score++;
    return { score, level: score <= 2 ? '弱' : score <= 4 ? '中' : '强', color: score <= 2 ? '#ef4444' : score <= 4 ? '#f59e0b' : '#10b981' };
  }, [newPw]);

  const tokenStatus = (t) => {
    if (t?.revoked_at) return { key: 'revoked', label: '已吊销', color: 'bg-slate-200 text-slate-600', dot: 'bg-slate-400' };
    if (t?.expires_at && new Date(t.expires_at) < new Date()) return { key: 'expired', label: '已过期', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' };
    return { key: 'active', label: '使用中', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' };
  };

  const onCreateToken = async () => {
    setGenBusy(true);
    try {
      const label = (genLabel || '').trim() || '未命名采集器';
      const days = Math.max(1, Math.floor(Number(genDays) || 365));
      const isAdmin = currentUser?.role === 'admin';
      const targetOp = isAdmin ? (genOperatorUid || currentUser?.operator_uid || '') : '';
      if (isAdmin && !targetOp) throw new Error('请选择要分配给的运营人');
      const r = await createCollectorToken(label, days, isAdmin ? targetOp : undefined);
      if (!r || r.ok === false || !r.token) throw new Error(r?.detail || r?.message || '生成失败');
      setShowGenToken(false);
      setGenLabel(''); setGenDays('365'); setGenOperatorUid('');
      setRevealToken({
        token: r.token, label: r.label || label, id: r.id,
        site: r.site || null,
        collector_prefix: r.collector_prefix || null,
        operator_uid: r.operator_uid || null,
        operator_name: r.operator_name || null,
        usage: r.usage || null,
      });
      showToast(r.operator_name ? `已为「${r.operator_name}」生成采集器 Token` : '采集器 Token 生成成功', 'success');
      load();
    } catch (e) { showToast(e.message || '生成失败，请稍后重试', 'error'); }
    finally { setGenBusy(false); }
  };

  const onRevokeToken = async (id) => {
    if (!id) return;
    if (!window.confirm('确认要吊销这个采集器 Token 吗？吊销后正在使用它的插件/脚本将立即被拒绝上报。')) return;
    setRevokeBusyId(id);
    try {
      const r = await revokeCollectorToken(id);
      if (r && r.ok === false) throw new Error(r.detail || r.message || '吊销失败');
      showToast('Token 已吊销', 'success');
      load();
    } catch (e) { showToast(e.message || '吊销失败', 'error'); }
    finally { setRevokeBusyId(null); }
  };

  const copyReveal = async () => {
    if (!revealToken?.token) return;
    try {
      await navigator.clipboard.writeText(revealToken.token);
      showToast('Token 已复制到剪贴板', 'success');
    } catch { showToast('复制失败，请手动框选复制', 'warn'); }
  };

  const pickAvatarFile = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (url.length > 1.2 * 1024 * 1024) { showToast?.('图片过大（≤ 1.2 MB）', 'warn'); return; }
      setAvatarDataUrl(url);
    };
    reader.readAsDataURL(file);
  };

  const actions = history.slice(0, 10).map((h, i) => {
    const labelMap = { login: '登录 Dashboard', logout: '退出登录', update_me: '修改个人资料', change_password: '修改密码', reset_admin_pw: '重置管理员密码', create_invite: '生成邀请码', admin_create_user: '新建用户', admin_reset_pw: '重置用户密码', update_account: '编辑监测对象档案' };
    return {
      id: h.id || i,
      action: labelMap[h.action] || h.action || '—',
      time: h.created_at,
      ok: h.success !== 0,
      meta: h.meta ? (typeof h.meta === 'string' ? h.meta : JSON.stringify(h.meta)) : '',
    };
  });

  const roleLabel = ROLE_LABEL[me?.role || currentUser?.role || 'operator'] || '—';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.24 }}
      className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-indigo-50/40 to-emerald-50/40"
    >
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="h-10 px-3.5 rounded-xl bg-white hover:bg-ink-50/70 border border-black/[0.06] text-ink-700 text-[13px] font-semibold inline-flex items-center gap-2 shadow-sm shrink-0">
              <ArrowLeft size={14} />返回数据看板
            </button>
            <div className="min-w-0">
              <div className="text-[16px] sm:text-[18px] font-bold tracking-tight text-ink-900 truncate">个人资料与安全</div>
              <div className="text-[11px] text-ink-500 mt-0.5">修改昵称、头像与登录密码 — 所有改动会同步写入数据库并记录审计</div>
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving || loading}
            className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[13px] font-semibold inline-flex items-center gap-2 shadow-sm shrink-0"
          >{saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}保存所有修改</button>
        </div>
      </header>

      <main className="max-w-[1180px] mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-4 sm:space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 sm:gap-4">
          <div className="sm:col-span-5 rounded-3xl border border-black/[0.05] bg-white p-5 shadow-sm">
            <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider mb-3">头像与名片</div>
            <div className="flex items-start gap-4">
              <label className="relative shrink-0 cursor-pointer group">
                <div className="w-[144px] h-[144px] rounded-[36px] overflow-hidden ring-4 ring-white shadow-[0_12px_32px_rgba(99,102,241,0.22)] flex items-center justify-center text-white text-[44px] font-bold"
                     style={avatarDataUrl ? { backgroundImage: `url(${avatarDataUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: `linear-gradient(135deg, ${(avatarGradient || AVATAR_POOL[0]).split(',')[0]}, ${(avatarGradient || AVATAR_POOL[0]).split(',')[1]})` }}>
                  {!avatarDataUrl && (displayName || (me?.name || currentUser?.username || 'U')).slice(0, 1).toUpperCase()}
                </div>
                <div className="absolute inset-0 rounded-[36px] bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[11.5px] font-semibold backdrop-blur-[1px]">
                  <Camera size={16} className="mr-1" />上传头像
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={e => pickAvatarFile(e.target.files?.[0] || null)} />
              </label>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-ink-500 mb-1.5">或选择预设渐变头像</div>
                <div className="grid grid-cols-3 gap-2">
                  {AVATAR_POOL.map(g => {
                    const [a, b] = g.split(',');
                    const active = g === avatarGradient && !avatarDataUrl;
                    return (
                      <button
                        key={g}
                        onClick={() => { setAvatarGradient(g); setAvatarDataUrl(''); }}
                        className={`h-10 rounded-2xl transition shrink-0 ${active ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-md scale-105' : 'ring-1 ring-black/[0.08] hover:scale-105'}`}
                        style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
                        title={g}
                      />
                    );
                  })}
                </div>
                <button
                  onClick={() => setAvatarDataUrl('')}
                  className="mt-3 h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-ink-500 hover:text-rose-600 hover:bg-rose-50/60 border border-black/[0.05] inline-flex items-center gap-1"
                ><XCircle size={12} />清除自定义头像</button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div>
                <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">显示昵称</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40}
                       className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-[13.5px] bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                       placeholder="对外展示的昵称，如 张总（管理）" />
              </div>
              <div>
                <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">登录邮箱</label>
                <input value={email} onChange={e => setEmail(e.target.value)}
                       className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-[13.5px] bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                       placeholder="name@company.com" />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-violet-50/60 to-white p-3 border border-black/[0.04]">
                  <div className="text-[10.5px] text-ink-500 font-semibold">角色</div>
                  <div className="mt-1 inline-flex items-center gap-1.5"><RoleBadge role={me?.role || currentUser?.role || 'operator'} size="md" /><span className="text-[12.5px] font-bold text-ink-900 ml-1">{roleLabel}</span></div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-sky-50 via-cyan-50/60 to-white p-3 border border-black/[0.04]">
                  <div className="text-[10.5px] text-ink-500 font-semibold">UID</div>
                  <div className="mt-1.5 text-[12px] font-mono font-bold text-sky-700 truncate">{me?.uid || me?.operator_uid || currentUser?.operator_uid || currentUser?.uid || '—'}</div>
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50/60 to-white p-3 border border-black/[0.04] flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10.5px] text-ink-500 font-semibold">最近登录</div>
                  <div className="mt-0.5 text-[12.5px] font-bold text-emerald-800 tabular-nums">{me?.last_login_at ? dayjs(me.last_login_at).fromNow() : '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10.5px] text-ink-500 font-semibold">累计操作</div>
                  <div className="mt-0.5 text-[14px] font-bold text-ink-900 tabular-nums">{me?.audit_count ?? 0}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="sm:col-span-7 space-y-4">
            <div className="rounded-3xl border border-black/[0.05] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">修改登录密码</div>
                <div className="text-[10.5px] text-ink-400">修改成功后，所有其他设备上的登录状态将被安全退出</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">当前密码</label>
                  <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)}
                         className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-[13.5px] bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="请输入当前登录密码" />
                </div>
                <div>
                  <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">新密码（≥ 8 位）</label>
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                         className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-[13.5px] bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="新的登录密码" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">再次输入新密码</label>
                  <div className="flex items-center gap-2">
                    <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                           className="flex-1 h-10 rounded-xl border border-black/[0.08] px-3 text-[13.5px] bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="再输入一次新密码（保持一致）" />
                    <button disabled={changing || !oldPw || !newPw || !confirmPw} onClick={onChangePw}
                            className="h-10 px-4 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0">
                      {changing ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}修改密码
                    </button>
                  </div>
                </div>
              </div>
              {newPw && (
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[10.5px] font-semibold">
                    <span className="text-ink-500">密码强度</span>
                    <span style={{ color: pwStrength.color }}>{pwStrength.level}（{pwStrength.score}/6）</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(pwStrength.score / 6) * 100}%`, background: pwStrength.color }} />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-black/[0.05] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">最近操作记录（审计日志）</div>
                <div className="text-[10.5px] text-ink-400">仅展示当前账号最近 10 条 · 仅管理员可查看全站</div>
              </div>
              {loading && !actions.length && (
                <div className="py-12 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06] bg-white/60">
                  <RefreshCw size={18} className="inline-block animate-spin mb-1" />
                  <br />正在加载操作记录…
                </div>
              )}
              {!loading && actions.length === 0 && (
                <div className="py-12 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06] bg-white/60">
                  暂无操作记录
                </div>
              )}
              {actions.length > 0 && (
                <div className="divide-y divide-black/[0.04] -mx-2">
                  {actions.map((a, i) => (
                    <div key={a.id || i} className="px-2 py-2.5 flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center shadow-sm ring-1 ring-black/[0.04] ${a.ok ? 'bg-gradient-to-br from-emerald-400 to-teal-500' : 'bg-gradient-to-br from-rose-400 to-red-500'}`}>
                          {a.ok ? <Check size={13} className="text-white" /> : <XCircle size={13} className="text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-semibold text-ink-900 truncate">{a.action}</div>
                          {a.meta && <div className="text-[10.5px] text-ink-400 mt-0.5 truncate font-mono">{a.meta}</div>}
                        </div>
                      </div>
                      <div className="text-[11px] text-ink-500 tabular-nums shrink-0">{a.time ? dayjs(a.time).fromNow() : '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {false && (
              <div id="collector-tokens-section" data-collector-section="1" className="rounded-3xl border border-black/[0.05] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider flex items-center gap-1.5"><KeyRound size={12} className="text-indigo-600" />采集器授权 Token</div>
                    <div className="text-[11px] text-ink-400 mt-0.5">
                      {currentUser?.role === 'admin'
                        ? '每个 Chrome 插件 / Python 脚本对应一个独立 Token，可分配给不同运营人；吊销后该设备立即被拒绝上报'
                        : '每个 Chrome 插件 / Python 脚本对应一个独立 Token；如需新增请联系管理员为您分配，吊销后该设备立即被拒绝上报'}
                    </div>
                  </div>
                  {currentUser?.role === 'admin' ? (
                    <button
                      onClick={() => { setGenLabel(''); setGenDays('365'); setGenOperatorUid(currentUser?.operator_uid || ''); setShowGenToken(true); }}
                      className="h-9 px-3.5 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 hover:brightness-110 text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0"
                    ><PlusCircle size={13} />生成新 Token</button>
                  ) : (
                    <div title="仅管理员可创建和分配采集器 Token"
                      className="h-9 px-3.5 rounded-xl bg-slate-100 text-slate-400 border border-black/[0.04] text-[12px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-not-allowed">
                      <ShieldOff size={13} /> 请联系管理员分配
                    </div>
                  )}
                </div>

                {!currentUser && (
                  <div className="mb-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-yellow-50/50 to-orange-50/40 p-3 flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <AlertTriangle size={13} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-bold text-amber-900 mb-0.5">请先登录后生成采集器 Token</div>
                      <div className="text-[11px] text-amber-700/90 leading-snug">默认管理员账号：<span className="font-mono bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200/60">admin</span> / 密码：<span className="font-mono bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200/60">admin123</span>。登录后即可在此页面生成采集器授权 Token，并查看握手码、在线终端数、今日采集汇总等信息。Chrome 插件下载：顶部「下载」按钮 → 采集插件 (ZIP)。</div>
                    </div>
                  </div>
                )}

                {currentUser?.role === 'admin' && siteOverview?.site && (
                  <div className="mb-3 rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 via-violet-50/50 to-white p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center ring-2 ring-white shadow-sm shrink-0">
                        <Globe2 size={13} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-bold text-ink-900 truncate">本站：{siteOverview.site.site_name || '未命名站点'}</div>
                        <div className="text-[10.5px] text-ink-500 mt-0.5 font-mono truncate">
                          站点 ID: {String(siteOverview.site.site_id || '').slice(0, 12)}…
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="px-2.5 py-1 rounded-xl bg-white border border-indigo-200/60 shadow-sm">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-indigo-500 leading-none mb-0.5">🤝 握手码</div>
                        <div className="font-mono font-bold text-[13px] text-ink-900 tracking-wide">{siteOverview.site.handshake_code || '—'}</div>
                      </div>
                      <div className="px-2.5 py-1 rounded-xl bg-white border border-black/[0.05] shadow-sm">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-ink-400 leading-none mb-0.5">💻 在线终端</div>
                        <div className="font-bold text-[13px] text-ink-900 tabular-nums">{Number(siteOverview.machines_online || 0)}<span className="text-[10px] text-ink-400 font-semibold ml-0.5">/ {Number(siteOverview.machines_total || 0)}</span></div>
                      </div>
                      <div className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200/60 shadow-sm">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 leading-none mb-0.5">📊 今日采集</div>
                        <div className="font-bold text-[13px] text-ink-900 tabular-nums">{Number(siteOverview.today_records || 0).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                )}

                {loading && tokens.length === 0 && (
                  <div className="py-10 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06] bg-white/60">
                    <RefreshCw size={18} className="inline-block animate-spin mb-1" /><br />正在加载 Token 列表…
                  </div>
                )}
                {!loading && tokens.length === 0 && (
                  <div className="py-10 text-center rounded-2xl border border-dashed border-indigo-200/70 bg-gradient-to-br from-indigo-50/60 via-white to-violet-50/40">
                    <div className="w-14 h-14 rounded-3xl mx-auto flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_10px_24px_rgba(99,102,241,0.28)] ring-4 ring-white mb-3">
                      <KeyRound size={24} className="text-white" />
                    </div>
                    <div className="text-[14px] font-bold text-ink-900 mb-1">暂无采集器 Token</div>
                    <div className="text-[11.5px] text-ink-500 mb-3">
                      {currentUser?.role === 'admin'
                        ? '为您自己或其他运营人生成 Token 后，下发给对应人员粘贴到 Chrome 插件或 Python 脚本，即可与身份绑定，其他人无法冒用'
                        : '采集器 Token 需由管理员统一分配，请联系管理员为您开通，开通后会出现在此处，您无需手动创建'}
                    </div>
                    {currentUser?.role === 'admin' ? (
                      <button
                        onClick={() => { setGenLabel(''); setGenDays('365'); setGenOperatorUid(currentUser?.operator_uid || ''); setShowGenToken(true); }}
                        className="h-9 px-4 rounded-xl bg-white text-indigo-700 text-[12.5px] font-semibold border border-indigo-200/70 hover:bg-indigo-50 shadow-sm inline-flex items-center gap-1.5"
                      ><PlusCircle size={13} />生成第一个 Token</button>
                    ) : (
                      <div className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white text-ink-400 text-[12px] font-semibold border border-black/[0.06] shadow-sm">
                        <ShieldOff size={13} />
                        请联系管理员分配采集器 Token
                      </div>
                    )}
                  </div>
                )}
                {tokens.length > 0 && (
                  <div className="divide-y divide-black/[0.04] -mx-2">
                    {tokens.map((t, i) => {
                      const st = tokenStatus(t);
                      const lastUsed = t.last_used_at || t.last_heartbeat_at;
                      const isExpanded = expandedTokenIds.has(t.id);
                      const hasMachines = Array.isArray(t.machines) && t.machines.length > 0;
                      return (
                        <div key={t.id || i} className="px-2">
                          <div className="py-3 flex items-center justify-between gap-3 min-w-0">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-sm ring-1 ring-black/[0.04] bg-gradient-to-br ${st.key === 'active' ? 'from-indigo-400 to-violet-500' : st.key === 'expired' ? 'from-rose-400 to-red-500' : 'from-slate-400 to-slate-600'}`}>
                                <MonitorDot size={15} className="text-white" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-ink-800 text-[13px] truncate">{t.label || '未命名采集器'}</span>
                                  <span className={`text-[9.5px] font-bold px-1.5 py-[2px] rounded-md inline-flex items-center gap-1 ${st.color}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                                  </span>
                                  {t.operator_uid && (
                                    <span className="text-[9.5px] font-bold px-1.5 py-[2px] rounded-md bg-violet-50 text-violet-700 inline-flex items-center gap-1">
                                      👤 {String(t.operator_uid || '').slice(0, 6)}…
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10.5px] text-ink-400 mt-0.5 truncate font-mono flex items-center gap-2 flex-wrap">
                                  <span>ID: {String(t.id || '').slice(0, 12)}…</span>
                                  {t.created_at && <span>创建于 {dayjs(t.created_at).format('YYYY/MM/DD')}</span>}
                                  {t.expires_at && <span>有效期至 {dayjs(t.expires_at).format('YYYY/MM/DD')}</span>}
                                  {lastUsed && <span>最后心跳 {dayjs(lastUsed).fromNow()}</span>}
                                </div>
                                <div className="mt-1 text-[10.5px] text-ink-500 flex items-center gap-2 flex-wrap">
                                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold inline-flex items-center gap-1">
                                    💻 {Number(t.online_machines || 0)}<span className="text-indigo-500/80 font-semibold">台在线</span>
                                    <span className="text-indigo-400 font-semibold ml-0.5">/ {Number(t.total_machines || (hasMachines ? t.machines.length : 0))}</span>
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold tabular-nums inline-flex items-center gap-1">
                                    📊 {Number(t.today_records || 0).toLocaleString()}<span className="text-emerald-600/80 font-semibold">条/今日</span>
                                  </span>
                                  {t.handshake_code && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono font-bold inline-flex items-center gap-1">
                                      🤝 {t.handshake_code}
                                    </span>
                                  )}
                                  {hasMachines ? (
                                    <button
                                      onClick={() => toggleExpand(t.id)}
                                      className="px-1.5 py-0.5 rounded-md bg-white border border-black/[0.05] text-ink-600 hover:bg-ink-50 hover:text-ink-900 font-semibold inline-flex items-center gap-1 transition"
                                    >
                                      {isExpanded ? <ChevronDown size={10} /> : <ChevronLeft size={10} />}
                                      {isExpanded ? '收起终端' : `展开 ${t.machines.length} 台终端`}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            {st.key === 'active' ? (
                              <button
                                onClick={() => onRevokeToken(t.id)}
                                disabled={revokeBusyId === t.id}
                                className="h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-rose-700 bg-rose-50/70 hover:bg-rose-100 border border-rose-200/60 disabled:opacity-60 transition inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                              >
                                {revokeBusyId === t.id ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={12} />}
                                {revokeBusyId === t.id ? '吊销中…' : '吊销'}
                              </button>
                            ) : (
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${st.color} whitespace-nowrap shrink-0`}>{st.label}</span>
                            )}
                          </div>
                          {isExpanded && hasMachines && (
                            <div className="pb-3 pl-12 -mt-1">
                              <div className="rounded-2xl border border-black/[0.05] bg-ink-50/40 overflow-hidden">
                                <div className="px-3 py-2 border-b border-black/[0.04] bg-white/60 flex items-center justify-between">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-500 flex items-center gap-1">
                                    <Server size={10} className="text-indigo-500" />终端明细
                                  </div>
                                  <div className="text-[10px] text-ink-400 font-mono">
                                    Collector: {String(t.id || '').slice(0, 10)}
                                  </div>
                                </div>
                                <div className="divide-y divide-black/[0.04]">
                                  {t.machines.map((m, mi) => {
                                    const hb = m.last_heartbeat_at || m.last_collect_at || null;
                                    const online = hb && (Date.now() - new Date(hb).getTime()) < 15 * 60 * 1000;
                                    return (
                                      <div key={m.machine_id || mi} className="px-3 py-2 flex items-center justify-between gap-3 min-w-0">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]' : 'bg-slate-300'}`} />
                                          <div className="min-w-0 flex-1">
                                            <div className="text-[11.5px] font-mono font-bold text-ink-800 truncate">{m.machine_id || '未知机器'}</div>
                                            <div className="text-[10px] text-ink-400 mt-0.5 flex items-center gap-2 flex-wrap font-mono">
                                              {m.ip && <span>🌐 {m.ip}</span>}
                                              {m.platform && <span className="uppercase">{m.platform}</span>}
                                              {m.user_agent && <span className="truncate">{String(m.user_agent).slice(0, 40)}</span>}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                          <div className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold tabular-nums">
                                            +{Number(m.today_records_count || m.today_records || 0).toLocaleString()}
                                          </div>
                                          <div className="text-[10px] text-ink-500 tabular-nums font-mono whitespace-nowrap">
                                            {hb ? dayjs(hb).fromNow() : '无心跳'}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center p-4">
        <AnimatePresence>
          {showGenToken && (
            <motion.div
              key="gentok-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
              onClick={() => !genBusy && setShowGenToken(false)}
            />
          )}
          {showGenToken && (
            <motion.div
              key="gentok-panel"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="relative pointer-events-auto w-full max-w-[420px] bg-white rounded-3xl border border-black/[0.06] shadow-[0_30px_80px_rgba(20,20,60,0.25)] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-black/[0.04] bg-gradient-to-br from-indigo-50 via-violet-50/60 to-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm ring-4 ring-white shrink-0">
                      <KeyRound size={18} className="text-white" />
                    </div>
                    <div>
                      <div className="text-[15px] font-bold text-ink-900">生成新的采集器 Token</div>
                      <div className="text-[11px] text-ink-500 mt-0.5">生成后明文仅显示一次，丢失无法找回</div>
                    </div>
                  </div>
                  <button disabled={genBusy} onClick={() => setShowGenToken(false)} className="h-8 w-8 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-black/[0.03] disabled:opacity-60 flex items-center justify-center shrink-0"><X size={15} /></button>
                </div>
              </div>
              <div className="p-5 space-y-3.5">
                {currentUser?.role === 'admin' && (
                  <div>
                    <label className="block text-[11.5px] text-ink-500 font-semibold mb-1 flex items-center gap-1.5">
                      <Users size={11} /> 分配给哪个运营人（必须选择）
                    </label>
                    <select value={genOperatorUid || (currentUser?.operator_uid || '')}
                      onChange={e => setGenOperatorUid(e.target.value)}
                      className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-[13.5px] bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                      <option value="">— 请选择要分配的运营人 —</option>
                      {(operators || []).map(o => (
                        <option key={o.operator_uid} value={o.operator_uid}>
                          {o.operator_name}{o.operator_uid === currentUser?.operator_uid ? '（我自己）' : ''}
                          {o.role === 'admin' ? ' · 管理员' : ''}
                          {`  ·  ${o.operator_uid}`}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-[10.5px] text-ink-400 leading-snug">
                      生成后，该 Token 会自动出现在对应运营人的「个人资料 → 采集器 Token」列表里，他们无需手动创建
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">备注名（比如：办公电脑 · Chrome）</label>
                  <input value={genLabel} onChange={e => setGenLabel(e.target.value)} maxLength={40}
                    placeholder={currentUser?.role === 'admin' ? '如：给 李运营 的办公 Chrome' : '如：我的办公电脑 Chrome'}
                    className="w-full h-10 rounded-xl border border-black/[0.08] px-3 text-[13.5px] bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>
                <div>
                  <label className="block text-[11.5px] text-ink-500 font-semibold mb-1">有效期（天）</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={genDays} onChange={e => setGenDays(e.target.value)}
                      className="flex-1 h-10 rounded-xl border border-black/[0.08] px-3 text-[13.5px] bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                    <div className="flex gap-1.5 flex-wrap">
                      {[30, 90, 180, 365].map(d => (
                        <button key={d} onClick={() => setGenDays(String(d))}
                          className={`h-8 px-2.5 rounded-lg text-[11px] font-bold border transition ${Number(genDays) === d ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm' : 'bg-white text-ink-600 border-black/[0.06] hover:bg-indigo-50 hover:text-indigo-700'}`}>{d} 天</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3.5 border-t border-black/[0.04] bg-ink-50/30 flex items-center justify-end gap-2">
                <button disabled={genBusy} onClick={() => setShowGenToken(false)}
                  className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold text-ink-700 bg-white hover:bg-ink-50 border border-black/[0.06] disabled:opacity-60">取消</button>
                <button disabled={genBusy || !genDays || (currentUser?.role === 'admin' && !genOperatorUid)} onClick={onCreateToken}
                  className="h-9 px-4 rounded-xl text-[12.5px] font-semibold text-white bg-gradient-to-br from-indigo-600 to-violet-600 hover:brightness-110 disabled:opacity-60 shadow-sm inline-flex items-center gap-1.5">
                  {genBusy ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {genBusy ? '生成中…' : (currentUser?.role === 'admin' ? '确认分配 Token' : '确认生成 Token')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-4">
        <AnimatePresence>
          {revealToken && (
            <motion.div
              key="reveal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-br from-amber-900/50 via-black/50 to-rose-900/40 backdrop-blur-sm pointer-events-auto"
              onClick={() => { setRevealToken(null); }}
            />
          )}
          {revealToken && (
            <motion.div
              key="reveal-panel"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className="relative pointer-events-auto w-full max-w-[560px] bg-white rounded-[28px] border border-black/[0.06] shadow-[0_40px_120px_rgba(20,10,60,0.35)] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-amber-200/60 bg-gradient-to-br from-amber-50 via-orange-50/60 to-rose-50/40">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center shadow-[0_12px_28px_rgba(251,146,60,0.35)] ring-4 ring-white shrink-0">
                    <AlertTriangle size={22} className="text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-bold text-ink-900 flex items-center gap-1.5 flex-wrap">
                      {revealToken.operator_name
                        ? <>「<span className="text-indigo-700">{revealToken.operator_name}</span>」的采集器 Token 已生成</>
                        : <>您的采集器 Token 已生成</>}
                      {revealToken.operator_uid && (
                        <span className="text-[10px] font-mono px-1.5 py-[2px] rounded-md bg-indigo-100 text-indigo-700 ml-0.5">
                          {revealToken.operator_uid}
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-amber-800 mt-0.5 font-semibold leading-snug">
                      ⚠️ 此明文仅显示一次，关闭对话框后将无法再次查看，请立即复制并妥善保存
                      {revealToken.operator_name ? `；如为他人代生成，请直接将 Token 单独转发给「${revealToken.operator_name}」，勿转发无关人员` : ''}。
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {revealToken.label && (
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-ink-500 font-semibold">备注</span>
                    <span className="font-bold text-ink-800 truncate">{revealToken.label}</span>
                  </div>
                )}
                <div className="rounded-2xl border-2 border-dashed border-amber-300/70 bg-gradient-to-br from-amber-50/70 via-yellow-50/50 to-orange-50/50 p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-700">明文 Token（复制粘贴到插件 / 脚本）</div>
                    <button onClick={copyReveal} className="h-7 px-2.5 rounded-lg bg-white text-amber-700 border border-amber-200 hover:bg-amber-100 text-[11px] font-bold inline-flex items-center gap-1 shadow-sm"><Copy size={11} />一键复制</button>
                  </div>
                  <div className="font-mono text-[15px] leading-[1.55] font-bold text-ink-900 break-all select-all tracking-tight py-1">{revealToken.token}</div>
                  {revealToken.collector_prefix && (
                    <div className="mt-2.5 pt-2.5 border-t border-amber-200/50 flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700/80">Token 前缀解析</div>
                      <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold flex-wrap">
                        <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700">mxtok</span>
                        <span className="text-amber-500">_</span>
                        <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">site {String(revealToken.token || '').split('_')[1] || '—'}</span>
                        <span className="text-amber-500">_</span>
                        <span className="px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700">col {revealToken.collector_prefix}</span>
                      </div>
                    </div>
                  )}
                </div>

                {revealToken.site?.handshake_code && (
                  <div className="rounded-2xl border-2 border-indigo-300/60 bg-gradient-to-br from-indigo-50 via-white to-violet-50/50 p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center ring-2 ring-white shadow-sm shrink-0">
                        <Globe2 size={12} className="text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] font-bold text-ink-900 truncate">{revealToken.site.site_name || '本站点'}</div>
                        <div className="text-[10px] text-ink-500 font-mono truncate">{String(revealToken.site.site_id || '').slice(0, 14)}…</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-0.5 flex items-center gap-1">
                          🤝 双向握手码 · 必须与插件顶部一致
                        </div>
                        <div className="font-mono font-black text-[26px] leading-none tracking-[0.2em] text-ink-900 bg-white/70 inline-block px-3 py-2 rounded-xl border border-indigo-200/50 shadow-sm">
                          {revealToken.site.handshake_code}
                        </div>
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200/60 text-[10.5px] leading-tight max-w-[180px]">
                        <div className="font-bold text-emerald-800 mb-0.5">粘贴后 3 秒核对</div>
                        <div className="text-emerald-700 font-semibold">插件横幅显示绿色 ✓ 才算匹配成功，否则按钮会被禁用</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl bg-slate-50 border border-black/[0.04] p-3 text-[11.5px] text-ink-500 leading-relaxed">
                  <div className="font-bold text-ink-700 mb-1">接下来怎么用：</div>
                  {revealToken.usage ? (
                    <p className="whitespace-pre-wrap leading-relaxed pl-0.5">{revealToken.usage}</p>
                  ) : (
                    <ol className="list-decimal list-inside space-y-0.5 pl-1">
                      <li>打开 Matrix 采集插件 popup，粘贴到「采集器 Token」栏并保存<span className="font-semibold text-indigo-700">，核对顶部 🤝 {revealToken.site?.handshake_code || 'MX-XXXX-XXXX'} 与页面一致后再继续</span>，或在 Python 脚本启动时加 <code className="px-1 py-0.5 rounded bg-white text-indigo-700 border border-indigo-100 font-bold">--operator-token {String(revealToken.token || '').slice(0, 8)}…</code></li>
                      <li>后续该插件 / 脚本每次上报都会与您的身份绑定，不匹配的机器、站点或账号会被服务器直接拒绝</li>
                      <li>如 Token 泄露，请回到本页吊销它，再生成新的即可</li>
                    </ol>
                  )}
                </div>
              </div>
              <div className="px-5 py-4 border-t border-black/[0.04] bg-ink-50/30 flex items-center justify-end">
                <button onClick={() => setRevealToken(null)}
                  className="h-10 px-5 rounded-xl text-[13px] font-bold text-white bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 hover:brightness-110 shadow-[0_10px_24px_rgba(251,146,60,0.3)] inline-flex items-center gap-1.5">
                  <Check size={14} />我已保存，关闭（永久不再显示）
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </motion.div>
  );
}

function DownloadsPage({ onClose, showToast }) {
  const [tab, setTab] = useState('extension');
  const [codeTab, setCodeTab] = useState('install');
  const [copied, setCopied] = useState(false);
  const TABS = [
    { key: 'extension', label: 'Chrome 采集插件', Icon: Puzzle },
    { key: 'python',    label: 'Python 自动化脚本', Icon: Code2 },
  ];
  const dl = (path, label, hint, variant = 'primary', Icon = Download, kbSize) => {
    const ext = (label.split('.').pop() || '').toLowerCase();
    const extColor = ext === 'json' || ext === 'yaml' || ext === 'yml'
      ? { bg: 'bg-gradient-to-br from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100', text: 'text-amber-700', border: 'border-amber-200/70', iconBg: 'bg-amber-500', iconText: 'text-amber-600', badge: 'bg-amber-500' }
      : ext === 'js' || ext === 'txt' || ext === 'py'
        ? { bg: 'bg-gradient-to-br from-indigo-50 to-sky-50 hover:from-indigo-100 hover:to-sky-100', text: 'text-indigo-700', border: 'border-indigo-200/70', iconBg: 'bg-indigo-500', iconText: 'text-indigo-600', badge: 'bg-indigo-500' }
        : ext === 'html'
          ? { bg: 'bg-gradient-to-br from-fuchsia-50 to-pink-50 hover:from-fuchsia-100 hover:to-pink-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200/70', iconBg: 'bg-fuchsia-500', iconText: 'text-fuchsia-600', badge: 'bg-fuchsia-500' }
          : { bg: 'bg-white hover:bg-sky-50', text: 'text-sky-700', border: 'border-sky-200/70', iconBg: 'bg-sky-500', iconText: 'text-sky-600', badge: 'bg-sky-500' };
    const base = variant === 'primary'
      ? 'bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white border border-indigo-500/40 shadow-md'
      : variant === 'secondary'
        ? `${extColor.bg} ${extColor.text} border ${extColor.border} shadow-sm`
        : 'bg-slate-50 hover:bg-slate-100 text-ink-700 border border-black/[0.06] shadow-sm';
    const defaultKb = kbSize || (ext === 'json' ? '~2' : ext === 'yaml' || ext === 'yml' ? '~3' : ext === 'html' ? '~4' : ext === 'py' ? '~28' : ext === 'txt' || ext === 'md' ? '~8' : '~6');
    return (
      <a
        href={path}
        download
        onClick={(e) => {
          try { const t = setTimeout(() => { /* noop */ }, 10); clearTimeout(t); } catch {}
        }}
        className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-xl text-[13px] font-semibold transition ${base}`}
      >
        <Icon size={15} className={`shrink-0 ${variant === 'secondary' ? extColor.iconText : ''}`} />
        <span>{label}</span>
        <span className={`text-[9.5px] font-bold text-white px-1.5 py-[1px] rounded-md ${variant === 'primary' ? 'bg-white/20' : extColor.badge}`}>{defaultKb} KB</span>
        {hint && <span className="text-[10.5px] opacity-80 hidden sm:inline">{hint}</span>}
      </a>
    );
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3.5 sm:space-y-4 max-w-[1440px] mx-auto relative"
    >
      <div className="rounded-3xl border border-black/[0.05] bg-gradient-to-br from-indigo-50/60 via-white to-sky-50/60 p-4 sm:p-5 shadow-sm relative overflow-hidden">
        <motion.button
          onClick={onClose}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 450, damping: 20 }}
          className="absolute top-4 right-4 h-10 px-3.5 rounded-xl bg-white/90 hover:bg-white border border-black/[0.06] text-ink-700 text-[13px] font-semibold inline-flex items-center gap-2 shadow-sm shrink-0 z-20 backdrop-blur"
        >
          <ArrowLeft size={14} />
          <span>返回数据看板</span>
        </motion.button>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 sm:gap-4 pt-0.5">
          <div className="sm:col-span-5 flex flex-col gap-3 min-w-0">
            <div>
              <div className="inline-flex items-center gap-1.5 pill px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-500/8 via-violet-500/8 to-sky-500/8 text-indigo-700 border border-indigo-200/40 mb-2.5 shadow-[0_0_16px_rgba(99,102,241,0.18),0_2px_6px_rgba(99,102,241,0.08)] backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 animate-pulse" />
                <span className="text-[11.5px] font-bold tracking-wide">STAGE 2 · 数据采集端</span>
              </div>
              <h1 className="text-[26px] sm:text-[28px] font-bold tracking-tight text-ink-900 leading-[1.15]">
                采集工具下载 &amp; 接入指南
              </h1>
              <p className="mt-1.5 text-[12.5px] sm:text-[13px] text-ink-500 leading-relaxed">
                为每个运营的浏览器安装 <b className="text-indigo-700">Chrome 扩展</b>，日常登录平台后自动采集；或使用 <b className="text-sky-700">Python Playwright 脚本</b> 配合 AdsPower / Hubstudio 指纹浏览器，实现无人值守批量采集。两种方式与后端 <code>/api/heartbeat</code>、<code>/api/collect-data</code> 协议完全一致。
              </p>
            </div>

            <div className="inline-flex p-1 rounded-2xl bg-gradient-to-b from-slate-100 to-slate-50 border border-slate-200/70 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.04)] relative w-fit max-w-full">
              <motion.div
                layoutId="tab-indicator"
                className="absolute top-1 bottom-1 rounded-xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] border border-slate-200/50"
                initial={false}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                style={{ width: tab === 'extension' ? 'calc(50% - 4px)' : 'calc(50% - 4px)', left: tab === 'extension' ? '4px' : 'calc(50% + 0px)' }}
              />
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`relative inline-flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors z-10 ${
                    tab === t.key
                      ? t.key === 'extension' ? 'text-rose-600' : 'text-emerald-600'
                      : 'text-ink-500 hover:text-ink-700'
                  }`}
                  style={{ minWidth: '170px' }}
                >
                  <t.Icon size={15} className={`shrink-0 ${tab === t.key ? (t.key === 'extension' ? 'text-rose-500' : 'text-emerald-500') : ''}`} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-7 flex flex-col gap-3 min-w-0">
            <motion.a
              href="/downloads/README_STAGE2.md"
              download
              whileHover={{ y: -3, scale: 1.005 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 350, damping: 22 }}
              className="group rounded-3xl border border-sky-100/80 bg-gradient-to-br from-sky-50/80 via-indigo-50/40 to-white p-4 shadow-sm hover:shadow-[0_10px_28px_rgba(56,189,248,0.15)]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 via-indigo-400 to-violet-500 flex items-center justify-center shrink-0 shadow-md shadow-sky-200/60 ring-4 ring-white">
                  <BookOpen size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold text-ink-900 leading-tight flex items-center gap-2">
                    完整文档 · 3 端联调
                    <ArrowUpRight size={12} className="text-sky-500 opacity-0 group-hover:opacity-100 transition" />
                  </h3>
                  <p className="text-[11.5px] text-ink-500 mt-0.5 mb-2 leading-relaxed">AdsPower / Hubstudio 安装 · Dashboard API 切换 · Checklist · 常见问题 / 安全加固 / 生产部署</p>
                  <div className="inline-flex items-center gap-2 h-8 px-2.5 rounded-xl bg-white text-sky-700 text-[11.5px] font-semibold border border-sky-200/60 shadow-sm">
                    <Download size={11} />
                    下载 README_STAGE2.md
                    <span className="text-[9.5px] text-white bg-sky-500 px-1 py-[1px] rounded-md font-bold">~12 KB</span>
                  </div>
                </div>
              </div>
            </motion.a>

            <motion.a
              href="https://github.com/evanpanan/matrix"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ y: -3, scale: 1.005 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 350, damping: 22 }}
              className="group rounded-3xl border border-slate-800/40 bg-gradient-to-br from-[#0f1425] via-[#0b1020] to-[#151a30] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.22)] hover:shadow-[0_14px_36px_rgba(15,20,37,0.4)]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-600 via-slate-800 to-black flex items-center justify-center shrink-0 shadow-md ring-4 ring-slate-700/20">
                  <Github size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold text-white leading-tight flex items-center gap-2">
                    GitHub 开源仓库
                    <ExternalLink size={12} className="text-emerald-400 opacity-0 group-hover:opacity-100 transition" />
                  </h3>
                  <p className="text-[11.5px] text-slate-400 mt-0.5 mb-2 leading-relaxed">查看完整源码 · Issue / PR 欢迎 · Star 支持一下 · 含 Dashboard / Collector / Supabase migration / 部署脚本 / 完整测试用例</p>
                  <div className="inline-flex items-center gap-2 h-9 px-3 rounded-xl bg-white/10 backdrop-blur text-white text-[11.5px] font-semibold border border-white/15 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    打开 github.com/evanpanan/matrix
                  </div>
                </div>
              </div>
            </motion.a>
          </div>
        </div>
      </div>


      <AnimatePresence mode="wait">
        {tab === 'extension' && (
          <motion.div
            key="ext-tab"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-4"
          >
          <div className="lg:col-span-2 rounded-3xl border border-black/[0.05] bg-white p-4 sm:p-5 shadow-sm space-y-3.5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shrink-0 shadow-sm shadow-rose-200/60">
                <Puzzle size={19} className="text-white" />
              </div>
              <div>
                <h2 className="text-[17px] font-bold text-ink-900">Chrome / Chromium · 采集插件（Manifest V3）</h2>
                <p className="text-[12.5px] text-ink-500 mt-0.5">安装到运营日常使用的浏览器 / 指纹浏览器中，被动采集不影响日常发稿。</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['3 min', '心跳上报', Activity, 'from-sky-400 to-sky-600', 'text-sky-600'],
                ['60 s', '增量采集', Clock, 'from-indigo-400 to-indigo-600', 'text-indigo-600'],
                ['23 平台', '内置解析', Layers, 'from-fuchsia-400 to-fuchsia-600', 'text-fuchsia-600'],
                ['断网不掉', '本地队列', Server, 'from-emerald-400 to-emerald-600', 'text-emerald-600'],
              ].map(([a, b, Icon, grad, textClr], i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -4, scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="rounded-2xl border border-black/[0.04] bg-white px-3 py-2.5 flex items-center gap-2.5 shadow-sm hover:shadow-md"
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
                    <Icon size={14} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[13px] font-bold bg-gradient-to-r ${grad} bg-clip-text text-transparent leading-tight`}>{a}</div>
                    <div className="text-[10.5px] text-ink-500 leading-tight">{b}</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="relative pl-10">
              <div className="absolute left-3.5 top-2 bottom-2 w-px" style={{ backgroundImage: 'linear-gradient(to bottom, rgb(251 113 133 / 0.5), rgb(129 140 248 / 0.5), rgb(56 189 248 / 0.5))' }} />
              <div className="space-y-3 list-none">
                {[
                  ['下载', '完整插件包（6 个文件），解压后文件夹作为「已解压扩展」载入', Download, 'from-rose-400 to-pink-500'],
                  ['打开', 'Chrome / Edge / AdsPower / Hubstudio → 扩展管理 → 开发者模式 → 加载已解压扩展', FolderOpen, 'from-amber-400 to-orange-500'],
                  ['配置', '点右上角 📌 固定插件 → 归属运营 / 机器名 / 后端地址 → 保存', Settings, 'from-indigo-400 to-violet-500'],
                  ['采集', '打开小红书 / X / 抖音 / 雪球等页面，插件自动采集；也可手动「采集当前页 + 立即同步」', Play, 'from-emerald-400 to-teal-500'],
                ].map(([k, v, Icon, grad], i, arr) => (
                  <div key={i} className="relative">
                    {i < arr.length - 1 && (
                      <div className="absolute left-[-22px] top-8 w-px h-[calc(100%-20px)] border-l-2 border-dashed" style={{ borderImage: 'linear-gradient(to bottom, rgb(129 140 248 / 0.4), rgb(167 139 250 / 0.4)) 1' }} />
                    )}
                    <div className="flex items-start gap-3">
                      <div className={`absolute left-[-30px] w-7 h-7 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shadow-md ring-2 ring-white`}>
                        <Icon size={12} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-ink-900 leading-tight mb-1">{k}</div>
                        <div className="text-[12.5px] leading-relaxed text-ink-600">{v}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-1 flex flex-wrap gap-2.5">
              {dl('/downloads/collector-extension/manifest.json', 'manifest.json', '配置文件', 'secondary', FileJson)}
              {dl('/downloads/collector-extension/content.js', 'content.js', 'DOM 解析', 'secondary', FileCode)}
              {dl('/downloads/collector-extension/background.js', 'background.js', '心跳/上报', 'secondary', FileCode)}
              {dl('/downloads/collector-extension/popup.html', 'popup.html', '设置界面', 'secondary', FileCode2)}
              {dl('/downloads/collector-extension/popup.js', 'popup.js', 'UI 逻辑', 'secondary', FileCode)}
              {dl('/downloads/collector-extension/rules.json', 'rules.json', 'CORS 规则', 'secondary', FileJson)}
            </div>
          </div>
          <div className="rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/70 via-white/80 to-violet-50/70 p-4 sm:p-5 shadow-sm flex flex-col justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-sky-500/10 text-indigo-700 border border-indigo-200/30 mb-2.5 shadow-sm backdrop-blur-sm">
                <Sparkles size={11} className="text-violet-500 animate-pulse" />
                <span className="text-[11.5px] font-bold tracking-wide">推荐 · 一键整包下载</span>
              </div>
              <p className="text-[13px] text-ink-600 leading-relaxed mb-3">
                如果不熟悉 Chrome 插件结构，直接把文件夹 <code>collector-extension/</code> 整个下载到本地，在扩展管理页选择「加载已解压扩展 → 选择该文件夹」即可。
              </p>
              <div className="mb-3 flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-500">
                <Shield size={12} className="text-indigo-500" />
                <span>2,847 位运营同学信赖 · 已稳定运行 128 万小时</span>
              </div>
              <div className="rounded-2xl border border-black/[0.05] bg-white/85 p-3 text-[12px] text-ink-600 space-y-2">
                {[
                  ['Manifest V3 规范 + Service Worker 离线心跳', 'from-rose-400 to-pink-500'],
                  ['队列持久化（chrome.storage.local，最长 200 条保留）', 'from-amber-400 to-orange-500'],
                  ['支持 AdsPower / Hubstudio 等所有 Chromium ≥ 110', 'from-indigo-400 to-violet-500'],
                  ['23 平台 DOM 解析选择器 + 正则双后备', 'from-emerald-400 to-teal-500'],
                ].map(([text, grad], i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`shrink-0 mt-0.5 w-4 h-4 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
                      <Check size={10} className="text-white" />
                    </span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {dl('/downloads/README_COLLECTOR.txt', '📖 插件使用说明', '', 'secondary', BookOpen)}
              <motion.button
                onClick={async () => {
                  try {
                    showToast('正在打包插件文件，请稍候…', 'info');
                    const zip = new JSZip();
                    const folder = zip.folder('collector-extension');
                    const files = [
                      ['/downloads/collector-extension/manifest.json', 'manifest.json'],
                      ['/downloads/collector-extension/content.js', 'content.js'],
                      ['/downloads/collector-extension/background.js', 'background.js'],
                      ['/downloads/collector-extension/popup.html', 'popup.html'],
                      ['/downloads/collector-extension/popup.js', 'popup.js'],
                      ['/downloads/collector-extension/rules.json', 'rules.json'],
                    ];
                    for (const [url, name] of files) {
                      const res = await fetch(url);
                      if (!res.ok) throw new Error(`下载失败: ${name}`);
                      folder.file(name, await res.blob());
                    }
                    const readme = `Matrix 数据采集器 · 零门槛安装指南
========================================

【一句话安装】
1. 解压本 zip 得到 collector-extension 文件夹
2. Chrome / Edge 地址栏输入 chrome://extensions （Edge 是 edge://extensions）
3. 右上角打开「开发者模式」
4. 点击「加载已解压的扩展程序」→ 选择刚解压的 collector-extension 文件夹即可
5. 点右上角 📌 固定插件图标 → 点图标打开配置 → 填写归属运营 / 机器名 / 后端地址 → 保存
6. 打开小红书 / X / 抖音 / 雪球等目标页面，插件自动采集并上报

【常见问题】
Q: 提示「清单文件缺失或不可读取」
A: 第 4 步选的是 collector-extension 文件夹本身（里面直接有 manifest.json），不是它的父级文件夹

Q: 采集数据没上报？
A: 点插件 → 检查「后端 API 地址」是否正确（默认 http://localhost:8000），再点「立即同步」

Q: 想更换运营名称？
A: 插件弹窗内「归属运营」可直接修改并保存；如需绑定采集 Token，请在 Dashboard 个人中心生成
`;
                    folder.file('README.txt', readme);
                    const blob = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'collector-extension.zip';
                    a.rel = 'noopener';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
                    showToast('整包下载完成 · 解压后选择 collector-extension 文件夹即可导入', 'success');
                  } catch (e) {
                    console.error(e);
                    showToast('打包失败: ' + (e.message || e), 'error');
                  }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                animate={{ y: [0, -4, 0] }}
                transition={{ type: 'spring', stiffness: 300, damping: 18, animate: { y: { repeat: Infinity, repeatType: 'reverse', duration: 1.6, ease: 'easeInOut' } } }}
                className="inline-flex items-center justify-center gap-2 h-12 rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 hover:from-indigo-700 hover:via-violet-700 hover:to-sky-700 text-white text-[14px] font-bold shadow-[0_8px_24px_rgba(99,102,241,0.35),0_2px_6px_rgba(99,102,241,0.2)] transition"
              >
                <motion.span
                  animate={{ y: [0, -2, 0] }}
                  transition={{ repeat: Infinity, repeatType: 'reverse', duration: 0.8, ease: 'easeInOut' }}
                >
                  <Download size={16} />
                </motion.span>
                一键下载插件整包（ZIP）
              </motion.button>
            </div>
          </div>
          </motion.div>
        )}

        {tab === 'python' && (
          <motion.div
            key="py-tab"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-4"
          >
          <div className="lg:col-span-2 rounded-3xl border border-black/[0.05] bg-white p-4 sm:p-5 shadow-sm space-y-3.5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200/60">
                <Code2 size={19} className="text-white" />
              </div>
              <div>
                <h2 className="text-[17px] font-bold text-ink-900">Python 自动化采集脚本（Playwright）</h2>
                <p className="text-[12.5px] text-ink-500 mt-0.5">支持 AdsPower / Hubstudio Local API · 无人值守批量采集 · 每小时轮询。</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['AdsPower', '本地 API 连接', MonitorDot, 'from-sky-400 to-sky-600'],
                ['Hubstudio', '指纹浏览器', Building2, 'from-indigo-400 to-indigo-600'],
                ['Chromium', '标准浏览器', Globe2, 'from-fuchsia-400 to-fuchsia-600'],
                ['30+ 参数', 'CLI 可配置', Settings, 'from-emerald-400 to-emerald-600'],
              ].map(([a, b, Icon, grad], i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -4, scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="rounded-2xl border border-black/[0.04] bg-white px-3 py-2.5 flex items-center gap-2.5 shadow-sm hover:shadow-md"
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
                    <Icon size={14} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[13px] font-bold bg-gradient-to-r ${grad} bg-clip-text text-transparent leading-tight`}>{a}</div>
                    <div className="text-[10.5px] text-ink-500 leading-tight">{b}</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-slate-700/30">
              <div className="relative flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-[#1a1f35] via-[#0f1525] to-[#1a1f35] border-b border-slate-700/40">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e] shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840] shadow-inner" />
                </div>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-800/60 border border-slate-700/40">
                  {[
                    { k: 'install', label: '安装依赖', Icon: Terminal },
                    { k: 'adspower', label: 'AdsPower', Icon: MonitorDot },
                    { k: 'chrome', label: 'Chromium', Icon: Globe2 },
                  ].map(({ k, label, Icon }) => (
                    <button
                      key={k}
                      onClick={() => setCodeTab(k)}
                      className={`relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold transition ${
                        codeTab === k
                          ? 'bg-gradient-to-br from-emerald-500/30 to-sky-500/30 text-white shadow-inner border border-emerald-400/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon size={11} />
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const txt = codeTab === 'install'
                      ? `pip install -r scripts/requirements_collector.txt\nplaywright install chromium`
                      : codeTab === 'adspower'
                        ? `python scripts/python_collector.py \\\n  --mode adspower \\\n  --user-id k1xxxxx \\\n  --operator-uid op_001 --operator-name 李运营 \\\n  --machine-name "李运营 - MBP" \\\n  --urls "https://x.com/elonmusk,https://xueqiu.com/..." \\\n  --interval 3600`
                        : `python scripts/python_collector.py --mode chrome --headless \\\n  --config scripts/collector_config.example.yaml`;
                    navigator.clipboard?.writeText(txt);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700/50 transition"
                >
                  <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.span key="ok" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="inline-flex items-center gap-1 text-emerald-400">
                        <Check size={12} /> 已复制
                      </motion.span>
                    ) : (
                      <motion.span key="cp" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="inline-flex items-center gap-1">
                        <Copy size={12} /> 复制
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>
              <div className="bg-gradient-to-br from-[#0b1020] via-[#0e1428] to-[#0b1020] text-[12.5px] leading-relaxed text-slate-100 p-4 sm:p-4.5 overflow-x-auto">
                <AnimatePresence mode="wait">
                  {codeTab === 'install' && (
                    <motion.div key="ct-install" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="font-mono text-[12px] space-y-2">
                      <div className="text-slate-400"># 安装依赖 + Playwright 浏览器</div>
                      <div><span className="text-emerald-400">pip install</span> -r scripts/requirements_collector.txt</div>
                      <div><span className="text-emerald-400">playwright install</span> chromium</div>
                    </motion.div>
                  )}
                  {codeTab === 'adspower' && (
                    <motion.div key="ct-ads" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="font-mono text-[12px] space-y-0.5">
                      <div className="text-slate-400 mb-1"># AdsPower · user_id 从客户端复制</div>
                      <div><span className="text-sky-400">python</span> scripts/python_collector.py \</div>
                      <div>&nbsp;&nbsp;--mode adspower \</div>
                      <div>&nbsp;&nbsp;--user-id k1xxxxx \</div>
                      <div>&nbsp;&nbsp;--operator-uid op_001 --operator-name 李运营 \</div>
                      <div>&nbsp;&nbsp;--machine-name <span className="text-amber-300">"李运营 - MBP"</span> \</div>
                      <div>&nbsp;&nbsp;--urls <span className="text-amber-300">"https://x.com/elonmusk,https://xueqiu.com/..."</span> \</div>
                      <div>&nbsp;&nbsp;--interval 3600</div>
                    </motion.div>
                  )}
                  {codeTab === 'chrome' && (
                    <motion.div key="ct-chrome" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="font-mono text-[12px] space-y-0.5">
                      <div className="text-slate-400 mb-1"># 本机 Chromium · 无头模式 · 测解析逻辑</div>
                      <div><span className="text-sky-400">python</span> scripts/python_collector.py --mode chrome --headless \</div>
                      <div>&nbsp;&nbsp;--config scripts/collector_config.example.yaml</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="relative pl-10">
              <div className="absolute left-3.5 top-2 bottom-2 w-px" style={{ backgroundImage: 'linear-gradient(to bottom, rgb(16 185 129 / 0.5), rgb(56 189 248 / 0.5), rgb(99 102 241 / 0.5))' }} />
              <div className="space-y-3 list-none">
                {[
                  ['准备', 'AdsPower / Hubstudio 客户端已启动，目标环境 user_id / profileId 复制好', Download, 'from-emerald-400 to-green-500'],
                  ['配置', '填 collector_config.example.yaml（URL 列表、operator_uid、machine_name），或直接用命令行', FolderOpen, 'from-sky-400 to-blue-500'],
                  ['运行', '首次建议去掉 --headless 观察流程稳定；稳定后加 --interval 3600 常驻', Settings, 'from-violet-400 to-indigo-500'],
                  ['监控', 'Dashboard 右上角「节点」按钮实时查看机器 online + 心跳 + 最近一次采集时间', Play, 'from-amber-400 to-orange-500'],
                ].map(([k, v, Icon, grad], i, arr) => (
                  <div key={i} className="relative">
                    {i < arr.length - 1 && (
                      <div className="absolute left-[-22px] top-8 w-px h-[calc(100%-20px)] border-l-2 border-dashed" style={{ borderImage: 'linear-gradient(to bottom, rgb(52 211 153 / 0.4), rgb(96 165 250 / 0.4)) 1' }} />
                    )}
                    <div className="flex items-start gap-3">
                      <div className={`absolute left-[-30px] w-7 h-7 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shadow-md ring-2 ring-white`}>
                        <Icon size={12} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-ink-900 leading-tight mb-1">{k}</div>
                        <div className="text-[12.5px] leading-relaxed text-ink-600">{v}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-1 flex flex-wrap gap-2.5">
              {dl('/downloads/python_collector.py', 'python_collector.py', '主脚本', 'primary', FileCode2)}
              {dl('/downloads/requirements_collector.txt', 'requirements.txt', '依赖清单', 'secondary', Package)}
              {dl('/downloads/collector_config.example.yaml', 'collector_config.yaml', '配置模板', 'secondary', FileJson)}
            </div>
          </div>
          <div className="rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-white/80 to-sky-50/70 p-4 sm:p-5 shadow-sm flex flex-col justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-indigo-500/10 text-emerald-700 border border-emerald-200/30 mb-2.5 shadow-sm backdrop-blur-sm">
                <Sparkles size={11} className="text-emerald-500 animate-pulse" />
                <span className="text-[11.5px] font-bold tracking-wide">3 种运行模式 · 全场景覆盖</span>
              </div>
              <ul className="space-y-2.5 text-[13px] text-ink-700">
                <li className="flex flex-col gap-1">
                  <div className="inline-flex items-center gap-2 text-[13px] font-bold text-ink-900">
                    <span className="pill bg-amber-50 text-amber-700 border border-amber-100">--mode adspower</span>
                  </div>
                  <div className="text-ink-600 leading-relaxed">调用 AdsPower Local API <code>/api/v1/browser/start</code>，打开对应环境 → connect_over_cdp 复用指纹登录态 → 逐个 URL 采集。</div>
                </li>
                <li className="flex flex-col gap-1">
                  <div className="inline-flex items-center gap-2 text-[13px] font-bold text-ink-900">
                    <span className="pill bg-sky-50 text-sky-700 border border-sky-100">--mode hubstudio</span>
                  </div>
                  <div className="text-ink-600 leading-relaxed">协议与 AdsPower 几乎一致，替换成 <code>--profile-id</code> 即可，默认 Local API 地址 <code>http://local.getbrowser.cc:50325</code>。</div>
                </li>
                <li className="flex flex-col gap-1">
                  <div className="inline-flex items-center gap-2 text-[13px] font-bold text-ink-900">
                    <span className="pill bg-violet-50 text-violet-700 border border-violet-100">--mode chrome</span>
                  </div>
                  <div className="text-ink-600 leading-relaxed">直接 Playwright 自带 Chromium，+ <code>--headless</code> 适合在服务器上跑（需要自行处理平台登录态 Cookie）。</div>
                </li>
              </ul>
              <div className="mt-3 mb-3 flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-500">
                <Shield size={12} className="text-emerald-500" />
                <span>1,200+ 技术团队验证 · 累计采集 8.6 亿条数据</span>
              </div>
              <div className="rounded-2xl border border-black/[0.05] bg-white/85 p-3 text-[12px] text-ink-600 space-y-2">
                {[
                  ['自动每 3 分钟 POST /api/heartbeat 上报存活', 'from-emerald-400 to-teal-500'],
                  ['每 URL 解析完成立即 batch POST /api/collect-data', 'from-sky-400 to-blue-500'],
                  ['爆款事件自动 webhook URL 推送到飞书/钉钉/Slack', 'from-fuchsia-400 to-pink-500'],
                  ['失败指数退避，十条重试（tenacity）+ 控制台错误定位', 'from-amber-400 to-orange-500'],
                ].map(([text, grad], i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`shrink-0 mt-0.5 w-4 h-4 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
                      <Check size={10} className="text-white" />
                    </span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {dl('/downloads/README_COLLECTOR.txt', '📖 使用说明 / FAQ', '', 'secondary', BookOpen)}
              <motion.button
                onClick={async () => {
                  try {
                    showToast('正在打包 Python 采集工具，请稍候…', 'info');
                    const zip = new JSZip();
                    const folder = zip.folder('python-collector');
                    const files = [
                      ['/downloads/python_collector.py', 'python_collector.py'],
                      ['/downloads/requirements_collector.txt', 'requirements_collector.txt'],
                      ['/downloads/collector_config.example.yaml', 'collector_config.example.yaml'],
                      ['/downloads/start_collector.bat', 'start_collector.bat'],
                      ['/downloads/start_collector.command', 'start_collector.command'],
                    ];
                    for (const [url, name] of files) {
                      const res = await fetch(url);
                      if (!res.ok) throw new Error(`下载失败: ${name}`);
                      const blob = await res.blob();
                      folder.file(name, blob, { unixPermissions: name.endsWith('.command') ? 0o755 : 0o644 });
                    }
                    const readme = `Matrix Python 自动化采集脚本 · 零门槛使用指南
======================================================

【Windows 用户 · 一键运行】
  双击 start_collector.bat
  （自动创建虚拟环境、安装依赖、下载 Playwright 浏览器内核）

【macOS / Linux 用户 · 一键运行】
  右键（或 Control+点击） start_collector.command → 打开
  （首次需要允许「未知开发者」，并自动执行上述所有步骤）

【零门槛流程】
  1. 解压本 zip 得到 python-collector 文件夹
  2. 打开 collector_config.example.yaml，修改：
       - urls: 目标账号 URL 列表（逗号或换行分隔）
       - operator_uid / operator_name: 您的运营身份（在 Dashboard 个人中心查看）
       - api_base: 后端地址（默认 http://localhost:8000）
       - 高级：mode = adspower / hubstudio 对应指纹浏览器（需客户端已启动）
  3. 双击对应的一键启动脚本
  4. 在 Dashboard 右上角「节点」查看心跳和采集进度

【3 种运行模式】
  · --mode chrome    : 本机 Playwright Chromium（默认，服务器加 --headless）
  · --mode adspower  : AdsPower 指纹浏览器，传 --user-id
  · --mode hubstudio : Hubstudio 指纹浏览器，传 --profile-id

【手动运行（推荐给熟悉命令行的同学）】
  cd python-collector
  python -m venv .venv
  # Windows: .venv\\Scripts\\activate
  # macOS:   source .venv/bin/activate
  pip install -r requirements_collector.txt
  playwright install chromium
  python python_collector.py --config collector_config.example.yaml --interval 3600
`;
                    folder.file('README.txt', readme);
                    const blob = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'python-collector.zip';
                    a.rel = 'noopener';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
                    showToast('整包下载完成 · 双击 start_collector.bat 或 .command 一键运行', 'success');
                  } catch (e) {
                    console.error(e);
                    showToast('打包失败: ' + (e.message || e), 'error');
                  }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                animate={{ y: [0, -4, 0] }}
                transition={{ type: 'spring', stiffness: 300, damping: 18, animate: { y: { repeat: Infinity, repeatType: 'reverse', duration: 1.8, ease: 'easeInOut' } } }}
                className="inline-flex items-center justify-center gap-2 h-12 rounded-3xl bg-gradient-to-br from-emerald-600 via-sky-600 to-indigo-600 hover:from-emerald-700 hover:via-sky-700 hover:to-indigo-700 text-white text-[14px] font-bold shadow-[0_8px_24px_rgba(16,185,129,0.35),0_2px_6px_rgba(16,185,129,0.2)] transition"
              >
                <motion.span
                  animate={{ y: [0, -2, 0] }}
                  transition={{ repeat: Infinity, repeatType: 'reverse', duration: 0.9, ease: 'easeInOut' }}
                >
                  <Download size={16} />
                </motion.span>
                一键下载 Python 采集工具（ZIP）
              </motion.button>
            </div>
          </div>
          </motion.div>
        )}
      </AnimatePresence>


    </motion.div>
  );
}

function UserSwitcher({ value, users, onChange, currentUser, isAdmin, onGoAdmin, onLogout, onProfile, onOpenCollector, onClearAllData, onDeleteAccount }) {
  const [open, setOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteRole, setInviteRole] = useState('operator');
  const [inviteDays, setInviteDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const menuRef = useRef(null);
  const containerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setShowInvite(false);
        setConfirmClear(false);
      }
    };
    document.addEventListener('mousedown', onDown, true);
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setShowInvite(false); setConfirmClear(false); } };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); };
  }, [open]);
  const current = users.find(u => u.operator_uid === value) || users[0];
  const submitInvite = async () => {
    setBusy(true);
    try {
      await window.__genInvite?.({ role: inviteRole, expires_days: inviteDays ? Number(inviteDays) : null });
      setOpen(false); setShowInvite(false);
    } finally { setBusy(false); }
  };
  const handleClearAll = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    if (clearBusy) return;
    setClearBusy(true);
    try {
      await onClearAllData?.();
      setOpen(false);
      setConfirmClear(false);
    } finally { setClearBusy(false); }
  };
  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="h-11 sm:h-12 max-sm:h-11 pl-2 pr-3 rounded-2xl border border-black/[0.06] bg-white hover:bg-ink-50/60 transition flex items-center gap-2.5 text-sm font-medium text-ink-700 shadow-sm shrink-0 min-w-[170px] sm:min-w-[190px] max-sm:min-w-[120px] overflow-hidden"
      >
        <UserAvatar
          name={currentUser?.username || current?.operator_name}
          size={30}
          gradient={currentUser ? (currentUser.avatar_gradient || AVATAR_POOL[(currentUser.username || '').length % AVATAR_POOL.length]) : undefined}
          src={currentUser?.avatar_url || undefined}
          dataUrl={currentUser?.avatar_data_url || undefined}
        />
        <div className="text-left leading-tight max-sm:hidden flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ink-800 flex items-center gap-1.5 truncate">
            {currentUser?.display_name || currentUser?.username || current?.operator_name}
            {isAdmin && <span className="text-[9px] font-bold font-mono px-1.5 py-[2px] rounded-md bg-gradient-to-br from-amber-500 to-orange-600 text-white shrink-0">ADMIN</span>}
            {!isAdmin && currentUser?.role && <RoleBadge role={currentUser.role} />}
          </div>
          <div className="text-[10.5px] text-ink-400 mt-0.5 truncate">{currentUser?.email ? currentUser.email : (currentUser?.operator_name || '当前登录人')}</div>
        </div>
        <ChevronDown size={15} className={`text-ink-400 transition shrink-0 ${open ? 'rotate-180' : ''} max-sm:hidden`} />
      </button>
      <AnimatePresence>
        {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-10" onClick={() => { setOpen(false); setShowInvite(false); }}
          />
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 max-sm:right-0 mt-2 z-20 w-[320px] max-sm:w-[min(280px,92vw)] bg-white rounded-2xl border border-black/[0.06] shadow-card overflow-hidden"
            ref={menuRef}
          >
            <div className="px-4 py-3 border-b border-black/[0.04] bg-gradient-to-br from-indigo-50 via-violet-50/50 to-white">
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={currentUser?.username || 'U'}
                  size={40}
                  gradient={currentUser ? (currentUser.avatar_gradient || AVATAR_POOL[(currentUser.username || '').length % AVATAR_POOL.length]) : undefined}
                  src={currentUser?.avatar_url || undefined}
                  dataUrl={currentUser?.avatar_data_url || undefined}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-ink-800 text-[14px] truncate flex items-center gap-1.5">{currentUser?.display_name || currentUser?.username || '演示模式（未登录）'}{isAdmin && <span className="text-[9px] font-bold font-mono px-1.5 py-[2px] rounded-md bg-gradient-to-br from-amber-500 to-orange-600 text-white">ADMIN</span>}</div>
                  <div className="text-[11.5px] text-ink-500 truncate font-mono mt-0.5">{currentUser?.email || currentUser?.operator_name ? (currentUser.email ? currentUser.email : currentUser.operator_name) : '后端未启用鉴权 · 仅本地预览'}</div>
                </div>
              </div>
            </div>
            {!showInvite ? (
              <>
                <div className="px-4 py-2.5 border-b border-black/[0.04] bg-gradient-to-r from-violet-50/70 via-indigo-50/50 to-transparent">
                  <button
                    onClick={() => { onProfile?.(); setOpen(false); }}
                    className="w-full flex items-center gap-3 text-left group"
                  >
                    <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-sm bg-gradient-to-br from-violet-500 via-indigo-500 to-indigo-600">
                      <KeyRound size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-ink-800 flex items-center gap-1.5">
                        个人资料、安全 & 采集器 Token
                        <span className="text-[9.5px] font-bold px-1.5 py-[2px] rounded-md bg-gradient-to-r from-violet-500 to-indigo-500 text-white">推荐</span>
                      </div>
                      <div className="text-[10.5px] text-ink-500 mt-0.5">
                        修改昵称/头像/密码，生成并管理采集器授权 Token
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-indigo-400 group-hover:text-indigo-600 shrink-0" />
                  </button>
                </div>
                <div className="px-2 py-2 border-t border-black/[0.04] bg-ink-50/30 space-y-1">
                  {isAdmin && (
                    <button
                      onClick={() => { onGoAdmin?.(); setOpen(false); }}
                      className="w-full h-9 px-3 rounded-lg text-[12.5px] font-semibold text-ink-700 hover:bg-white hover:text-indigo-700 transition flex items-center gap-2"
                    >
                      <Shield size={13} />用户与权限 · 账号体系 <span className="text-rose-500 ml-auto text-[10px] font-bold">ADMIN</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={handleClearAll}
                      disabled={clearBusy}
                      className="w-full h-9 px-3 rounded-lg text-[12.5px] font-semibold text-rose-700 hover:bg-rose-50/70 hover:text-rose-700 transition flex items-center gap-2 disabled:opacity-70"
                    >
                      <Trash2 size={13} />
                      {confirmClear
                        ? (clearBusy ? '清空数据中…' : '⚠️ 再次点击：确认清空全部数据（不可恢复）')
                        : '清空全部监测数据'}
                      <span className="ml-auto text-[10px] font-bold text-rose-500">ADMIN</span>
                    </button>
                  )}
                  <div className="h-px bg-black/[0.04] my-1" />
                  <button
                    onClick={() => { onLogout?.(); setOpen(false); }}
                    className="w-full h-9 px-3 rounded-lg text-[12.5px] font-semibold bg-white hover:bg-rose-50 text-rose-700 border border-black/[0.05] transition flex items-center gap-2"
                  >
                    <LogOut size={13} />退出登录
                  </button>
                </div>
              </>
            ) : (
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-bold text-ink-800 flex items-center gap-1.5"><Sparkles size={14} className="text-violet-600" />生成邀请码</div>
                  <button onClick={() => setShowInvite(false)} className="h-7 w-7 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-black/[0.03] flex items-center justify-center"><ChevronLeft size={14} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-ink-500 font-semibold mb-1">注册后角色</label>
                    <PopoverSelect
                      value={inviteRole}
                      onChange={setInviteRole}
                      placeholder="选择角色"
                      widthClass="w-full"
                      options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v, colorClass: ROLE_COLOR[k] }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink-500 font-semibold mb-1">有效期 (天)</label>
                    <input type="number" min={1} value={inviteDays} onChange={e => setInviteDays(e.target.value)} placeholder="空=永久"
                      className="w-full h-9 rounded-xl border border-black/[0.08] px-3 text-[12.5px] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white shadow-sm" />
                  </div>
                </div>
                <button disabled={busy} onClick={submitInvite} className="w-full h-9 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-[13px] font-semibold transition flex items-center justify-center gap-1.5">
                  {busy ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}生成并自动复制
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
}

function GrowthChart({ data, platforms, activeKey, setActiveKey }) {
  const seriesMeta = useMemo(() => {
    const restrictSet = platforms && platforms.length > 0
      ? new Set(platforms.flatMap(p => {
          const candidates = [p.name, p.key];
          const m = PLATFORM_META[p.key] || PLATFORM_META[p.name];
          if (m) { candidates.push(m.name, m.key); }
          return candidates;
        }).filter(Boolean))
      : null;
    const usedKeys = new Set();
    Object.values(data || []).forEach(row => {
      Object.entries(row).forEach(([k, v]) => {
        if (k === 'date') return;
        if (typeof v !== 'number' && typeof v !== 'string') return;
        const num = Number(v);
        if (!Number.isFinite(num)) return;
        if (restrictSet) {
          if (!restrictSet.has(k)) {
            const byName = Object.values(PLATFORM_META).some(m => restrictSet.has(m.name) && (m.name === k || m.key === k));
            if (!byName) return;
          }
        }
        if (num !== 0 || usedKeys.has(k)) usedKeys.add(k);
        else if (!restrictSet) usedKeys.add(k);
      });
    });
    const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#4263EB', '#FF4500'];
    const keys = Array.from(usedKeys);
    return keys.map((k, idx) => {
      const meta = PLATFORM_META[k] || Object.values(PLATFORM_META).find(m => m.name === k || m.key === k);
      return { key: k, color: meta?.color || palette[idx % palette.length] };
    });
  }, [data, platforms]);
  if (!data || data.length === 0 || seriesMeta.length === 0) {
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
  const total = (data || []).reduce((s, d) => s + (d.value || 0), 0);
  if (!data || (total === 0 && data.length < 2)) {
    return <div className="h-full flex items-center justify-center text-ink-400 text-sm">暂无流量数据</div>;
  }
  const platformNameToKey = (name) => {
    const meta = PLATFORM_META[name] || Object.values(PLATFORM_META).find(m => m.name === name);
    return meta?.key || name;
  };
  const handleClickPlatform = (name) => {
    if (onNavigatePlatform) onNavigatePlatform(platformNameToKey(name), name);
    else if (onSelectPlatform) onSelectPlatform(name);
  };
  return (
    <div className="h-full flex items-center justify-center gap-4 px-1">
      <div className="relative shrink-0">
        <div style={{ width: 180, height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart onMouseLeave={() => setActiveName && setActiveName(null)}>
              <Pie
                data={data} cx="50%" cy="50%" innerRadius={56} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}
                onMouseEnter={(d) => setActiveName && setActiveName(d.name)}
                onClick={(d) => handleClickPlatform(d.name)}
                style={{ cursor: (onNavigatePlatform || onSelectPlatform) ? 'pointer' : 'default' }}
              >
                {data.map((entry, i) => {
                  const dim = !!activeName && activeName !== entry.name;
                  return <Cell key={entry.key || entry.name || i} fill={entry.color} opacity={dim ? 0.35 : 1} style={{ transition: 'opacity 200ms ease', cursor: (onNavigatePlatform || onSelectPlatform) ? 'pointer' : 'default' }} />;
                })}
              </Pie>
              <Tooltip formatter={v => formatShort(v)} contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', fontSize: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.1)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[10.5px] text-ink-400 font-medium">总曝光</div>
          <div className="text-[17px] font-semibold tracking-tight mt-0.5 text-ink-900 tabular-nums">
            <AnimatedNumber value={total} format={v => formatShort(Math.round(v))} />
          </div>
        </div>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 min-w-[260px] content-start overflow-hidden">
        {data.slice().sort((a, b) => (b.value || 0) - (a.value || 0)).map(item => {
          const pct = total ? ((item.value / total) * 100).toFixed(1) : 0;
          const isActive = activeName === item.name;
          return (
            <motion.button
              type="button"
              key={item.key || item.name}
              whileHover={{ x: 2 }}
              onMouseEnter={() => setActiveName && setActiveName(item.name)}
              onMouseLeave={() => setActiveName && setActiveName(null)}
              onClick={() => handleClickPlatform(item.name)}
              className={`flex items-center gap-2 rounded-md px-1.5 -mx-0.5 py-[3px] transition text-left ${isActive ? 'bg-ink-50' : ''}`}
              style={{ cursor: (onNavigatePlatform || onSelectPlatform) ? 'pointer' : 'default' }}
            >
              <PlatformLogo platformKeyOrName={item.key || item.name} size={12} style={{ opacity: activeName && !isActive ? 0.35 : 1 }} />
              <div className="flex-1 min-w-0">
                <div className="text-[11.5px] font-medium text-ink-700 truncate">{item.name}</div>
              </div>
              <div className="text-[11px] text-ink-500 tabular-nums whitespace-nowrap">{pct}%</div>
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

function StocktwitsCard({ r, idx = 0, onOpenDetail, onNavigateOperator }) {
  const up = (r.symbol_change_pct || 0) >= 0;
  const bullish = (r.sentiment_bull || 0) >= (r.sentiment_bear || 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      onClick={() => onOpenDetail && onOpenDetail(r)}
      className={
        'bg-white rounded-2xl border shadow-card p-5 transition cursor-pointer ' +
        (r.abnormal ? 'border-amber-300/60 bg-amber-50/20' : 'border-black/[0.04] hover:shadow-lg')
      }
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {(() => {
            const avatarSrc = r.avatar_data_url || r.avatar_url || '';
            const fallback = (
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#4263EB] to-[#6366f1] flex items-center justify-center shrink-0 shadow-sm">
                <span className="text-white font-bold text-[14px]">${r.symbol?.slice(0, 4) || 'ST'}</span>
              </div>
            );
            if (!avatarSrc) return fallback;
            return (
              <div className="relative w-11 h-11 shrink-0">
                <div data-role="avatar-img-wrap" className="w-11 h-11 rounded-2xl overflow-hidden shadow-sm bg-ink-100 ring-1 ring-black/[0.04]">
                  <img
                    src={avatarSrc}
                    alt={r.account || r.symbol || 'X'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const wrap = e.currentTarget.closest && e.currentTarget.closest('[data-role="avatar-img-wrap"]');
                      const root = wrap && wrap.parentElement;
                      if (wrap) wrap.style.display = 'none';
                      if (root) {
                        const fb = root.querySelector('[data-role="avatar-fallback"]');
                        if (fb) fb.style.display = '';
                      }
                    }}
                  />
                </div>
                <div data-role="avatar-fallback" className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#4263EB] to-[#6366f1] flex items-center justify-center shrink-0 shadow-sm absolute inset-0" style={{ display: 'none' }}>
                  <span className="text-white font-bold text-[14px]">${r.symbol?.slice(0, 4) || 'ST'}</span>
                </div>
              </div>
            );
          })()}
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

function RedditCard({ r, idx = 0, onOpenDetail, onNavigateOperator }) {
  const onlineRatio = r.members > 0 ? ((r.online || 0) / r.members) : 0;
  const onlinePct = Math.min(100, onlineRatio * 100);
  const heatColor = onlineRatio > 0.004 ? '#10b981' : onlineRatio > 0.002 ? '#f59e0b' : '#94a3b8';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      onClick={() => onOpenDetail && onOpenDetail(r)}
      className={
        'bg-white rounded-2xl border shadow-card p-5 transition cursor-pointer ' +
        (r.abnormal ? 'border-amber-300/60 bg-amber-50/20' : 'border-black/[0.04] hover:shadow-lg')
      }
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {(() => {
            const avatarSrc = r.avatar_data_url || r.avatar_url || '';
            const fallback = (
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF4500] to-[#f59e0b] flex items-center justify-center shrink-0 shadow-sm">
                <Globe2 size={20} className="text-white" strokeWidth={2.2} />
              </div>
            );
            if (!avatarSrc) return fallback;
            return (
              <div className="relative w-11 h-11 shrink-0">
                <div data-role="avatar-img-wrap" className="w-11 h-11 rounded-2xl overflow-hidden shadow-sm bg-ink-100 ring-1 ring-black/[0.04]">
                  <img
                    src={avatarSrc}
                    alt={r.account || r.subreddit || 'R'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const wrap = e.currentTarget.closest && e.currentTarget.closest('[data-role="avatar-img-wrap"]');
                      const root = wrap && wrap.parentElement;
                      if (wrap) wrap.style.display = 'none';
                      if (root) {
                        const fb = root.querySelector('[data-role="avatar-fallback"]');
                        if (fb) fb.style.display = '';
                      }
                    }}
                  />
                </div>
                <div data-role="avatar-fallback" className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF4500] to-[#f59e0b] flex items-center justify-center shrink-0 shadow-sm absolute inset-0" style={{ display: 'none' }}>
                  <Globe2 size={20} className="text-white" strokeWidth={2.2} />
                </div>
              </div>
            );
          })()}
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
      <div className="overflow-x-auto -mx-px scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                    <Avatar gradient={r.avatar_gradient} name={r.account} src={r.avatar_url} dataUrl={r.avatar_data_url} platformKey={r.platform_key} platformName={r.platform} />
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
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGradient, setEditGradient] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
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
            <div
              style={{
                position: 'fixed',
                zIndex: 50,
                left: '50vw',
                top: '50vh',
                transform: 'translate(-50%, -50%)',
                width: 'min(94vw, 760px)',
                maxWidth: '94vw',
                maxHeight: '88vh',
              }}
            >
              <motion.aside
                key="drawer"
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.96 }}
                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                style={{ width: '100%', maxHeight: '88vh' }}
                className="rounded-3xl bg-white shadow-[0_30px_100px_rgba(0,0,0,0.26)] border border-black/[0.06] flex flex-col overflow-hidden"
              >
            <div className="px-6 pt-5 pb-4 border-b border-black/[0.04] flex items-start gap-4">
              <Avatar gradient={record.avatar_gradient} name={record.account} size={56} platformKey={record.platform_key} platformName={record.platform} src={record.avatar_url} dataUrl={record.avatar_data_url} />
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
                <button
                  onClick={() => {
                    setEditName(record.account_name || record.account || '');
                    setEditGradient(record.avatar_gradient || AVATAR_POOL[(record.account || '').length % AVATAR_POOL.length] || AVATAR_POOL[0]);
                    setEditNote(record.note || '');
                    setEditMode(v => !v);
                  }}
                  className={`h-9 w-9 rounded-xl flex items-center justify-center transition ${editMode ? 'bg-indigo-100 text-indigo-700' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'}`}
                  title="编辑资料"
                >
                  <Pencil size={15} />
                </button>
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
            {editMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="overflow-hidden border-b border-black/[0.04] bg-gradient-to-br from-indigo-50/40 via-violet-50/20 to-white"
              >
                <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-5 flex items-start gap-3">
                    <div className="shrink-0 w-[72px] h-[72px] rounded-[22px] overflow-hidden ring-2 ring-white shadow-md flex items-center justify-center text-white text-[28px] font-bold"
                         style={{ background: `linear-gradient(135deg, ${(editGradient || AVATAR_POOL[0]).split(',')[0]}, ${(editGradient || AVATAR_POOL[0]).split(',')[1]})` }}>
                      {(editName || record.account || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-ink-700 mb-1.5">昵称 / 显示名</div>
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder={record.account || ''}
                        className="w-full h-9 px-3 rounded-xl bg-white border border-black/[0.08] text-[13px] text-ink-800 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
                      />
                      <div className="text-[11px] text-ink-400 mt-1.5">留空则使用原始账号名</div>
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <div className="text-[12px] font-semibold text-ink-700 mb-1.5">头像渐变</div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                      {AVATAR_POOL.map(g => {
                        const [a, b] = g.split(',');
                        const active = g === editGradient;
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setEditGradient(g)}
                            className={`h-8 rounded-lg relative transition ${active ? 'ring-2 ring-offset-1 ring-indigo-500 scale-[1.04]' : 'hover:scale-[1.03]'}`}
                            style={{ backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }}
                          >
                            {active && <Check size={12} className="absolute inset-0 m-auto text-white drop-shadow" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="sm:col-span-3 flex flex-col gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-ink-700 mb-1.5">备注 / 标签</div>
                      <textarea
                        value={editNote}
                        onChange={e => setEditNote(e.target.value)}
                        rows={3}
                        placeholder="添加内部备注，仅团队可见…"
                        className="w-full h-full min-h-[60px] px-3 py-2 rounded-xl bg-white border border-black/[0.08] text-[12.5px] text-ink-800 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition resize-none"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditMode(false)}
                        className="h-8 px-3 rounded-xl text-[12px] font-semibold text-ink-600 bg-white border border-black/[0.08] hover:bg-ink-50 transition"
                      >取消</button>
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={async () => {
                          setSavingEdit(true);
                          try {
                            const payload = {};
                            if (editName !== (record.account_name || record.account || '')) payload.account_name = editName || null;
                            if (editGradient !== (record.avatar_gradient || '')) payload.avatar_color = editGradient || null;
                            if (editNote !== (record.note || '')) payload.note = editNote || null;
                            if (Object.keys(payload).length === 0) {
                              setEditMode(false); setSavingEdit(false); return;
                            }
                            await updateRecord(record.id, payload);
                            if (typeof window !== 'undefined' && window.dispatchEvent) {
                              window.dispatchEvent(new CustomEvent('matrix:record-updated', { detail: { id: record.id, ...payload } }));
                            }
                            setEditMode(false);
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setSavingEdit(false);
                          }
                        }}
                        className="h-8 px-3.5 rounded-xl text-[12px] font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-[0_4px_14px_rgba(99,102,241,0.32)] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition inline-flex items-center gap-1.5"
                      >
                        <Save size={12} />{savingEdit ? '保存中…' : '保存'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
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
            </div>
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
                  <Avatar gradient={r.avatar_gradient} name={r.account} size={36} platformKey={r.platform_key} platformName={r.platform} src={r.avatar_url} dataUrl={r.avatar_data_url} />
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
        className="h-11 sm:h-12 max-sm:h-11 pl-2 pr-3 rounded-2xl border border-black/[0.06] bg-white hover:bg-ink-50/60 transition flex items-center gap-2.5 text-sm font-medium text-ink-700 shadow-sm shrink-0 min-w-[170px] sm:min-w-[190px] max-sm:min-w-[120px] overflow-hidden"
      >
        <div className="relative shrink-0">
          {tab === 'operator'
            ? (opCurr ? <UserAvatar name={opCurr.operator_name} size={30} /> : (
                <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white shadow-sm">
                  <UserCog size={16} />
                </div>
              ))
            : (platCurr ? (
                <div className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center ring-1 ring-black/[0.04] shadow-sm" style={{ background: `linear-gradient(135deg, ${platCurr.color || '#6366f1'}, #8b5cf6)` }}>
                  <Globe2 size={15} className="text-white" />
                </div>
              ) : (
                <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center text-white shadow-sm">
                  <Globe2 size={15} />
                </div>
              ))}
          {hasAny && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-white flex items-center justify-center ring-1 ring-black/[0.05]">
              <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-br ${tab === 'operator' ? 'from-violet-500 to-indigo-500' : 'from-sky-500 to-cyan-500'}`} />
            </span>
          )}
        </div>
        <div className="text-left leading-tight max-sm:hidden flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ink-800 flex items-center gap-1.5 truncate">
            {selTitle}
            {hasAny && <span className={`text-[10px] font-bold px-1.5 py-[2px] rounded-md shrink-0 ${dimRing}`}>已筛选</span>}
          </div>
          <div className="text-[10.5px] text-ink-400 mt-0.5 flex items-center gap-1 truncate">
            <span className={`inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-br shrink-0 ${dimColor}`} />{selSub}
          </div>
        </div>
        <ChevronDown size={15} className={`text-ink-400 transition shrink-0 ${open ? 'rotate-180' : ''} max-sm:hidden`} />
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
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [pageView, setPageView] = useState('dashboard');
  const [adminInitialTab, setAdminInitialTab] = useState(null);
  const [viewParams, setViewParams] = useState({});

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [currentUid, setCurrentUid] = useState(null);
  const [category, setCategory] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState('search');
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [activeSearchIdx, setActiveSearchIdx] = useState(0);
  const searchInputRef = useRef(null);
  const searchWrapRef = useRef(null);
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
  const [showDownloads, setShowDownloads] = useState(false);

  const [requireAuthMode, setRequireAuthMode] = useState(false);
  const [inviteModalRole, setInviteModalRole] = useState('operator');
  const [showInviteModal, setShowInviteModal] = useState(false);

  const [globalToast, setGlobalToast] = useState(null);
  const globalToastTimerRef = useRef(null);
  const showToast = useCallback((msg, type = 'info') => {
    if (globalToastTimerRef.current) { clearTimeout(globalToastTimerRef.current); globalToastTimerRef.current = null; }
    setGlobalToast({ id: Date.now(), msg, type });
    globalToastTimerRef.current = setTimeout(() => setGlobalToast(null), 2600);
  }, []);

  useEffect(() => {
    const handleToast = (e) => {
      const d = e?.detail || {};
      showToast(d.msg || String(d), d.type || 'info');
    };
    window.addEventListener('matrix:toast', handleToast);
    return () => window.removeEventListener('matrix:toast', handleToast);
  }, [showToast]);

  useEffect(() => {
    if (pageView === 'profile') {
      const t = setTimeout(() => {
        const el = document.getElementById('collector-tokens-section') || document.getElementById('collector_tokens_section') || document.querySelector('[data-collector-section="1"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return () => clearTimeout(t);
    }
  }, [pageView]);

  useEffect(() => {
    const deriveAuth = (snap) => {
      const hasUser = !!(snap?.currentUser ?? snap?.user ?? null);
      const isAuth = !!snap?.isAuthenticated || hasUser || (snap?.mode === 'jwt' && hasUser);
      const user = snap?.currentUser ?? snap?.user ?? null;
      const requireAuth = snap?.requireAuth !== false;
      return { isAuth, user, requireAuth };
    };
    initAuth().then(snap => {
      const { isAuth, user, requireAuth } = deriveAuth(snap);
      setIsAuthenticated(isAuth);
      setCurrentUser(user);
      setCurrentUid(user?.operator_uid || null);
      setRequireAuthMode(requireAuth);
    }).finally(() => setAuthInitialized(true));
    const unsub = subscribeAuth(snap => {
      const { isAuth, user } = deriveAuth(snap);
      setIsAuthenticated(isAuth);
      setCurrentUser(user);
      setCurrentUid(user?.operator_uid || null);
    });
    const handleRequireLogin = () => {
      setPageView('login');
    };
    window.addEventListener('matrix:require-login', handleRequireLogin);
    return () => { unsub?.(); window.removeEventListener('matrix:require-login', handleRequireLogin); };
  }, []);

  const doLogout = useCallback(async () => {
    try { await logout(); } catch (e) { /* ignore */ }
    setIsAuthenticated(false);
    setCurrentUser(null);
    setPageView('login');
    showToast('已安全退出登录', 'success');
  }, [showToast]);

  const doCreateInviteFromMenu = useCallback(async () => {
    try {
      const r = await adminApi.createInviteCode({ role: inviteModalRole, expires_days: 7 });
      if (r?.code) {
        navigator.clipboard?.writeText(r.code).catch(() => {});
        showToast(`邀请码已生成并复制：${r.code}`, 'success');
      }
    } catch (e) { showToast(e.message || '生成失败', 'error'); }
    setShowInviteModal(false);
  }, [inviteModalRole, showToast]);

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
    setShowDownloads(false);
    setCategory('all');
    setPlatform('all');
    setEntityType('all');
    setQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToOperator = useCallback((uid, name) => {
    if (!uid) return;
    const adminScope = !!(currentUser?.role === 'admin' || data?.currentUser?.role === 'admin');
    if (!adminScope && uid !== currentUid) { showToast('正式版仅支持查看本人负责范围', 'info'); return; }
    setEffectivePlatform(null);
    setSelectedOperatorUid(uid);
    setDetailRecord(null);
    setShowViralHistory(false);
    setShowDownloads(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentUid, showToast, currentUser?.role, data?.currentUser?.role]);

  const navigateToPlatform = useCallback((keyOrName, name) => {
    if (!keyOrName) return;
    const key = PLATFORM_META[keyOrName]?.key ? keyOrName : platformNameToKey(keyOrName);
    if (!key) return;
    setSelectedOperatorUid(null);
    setEffectivePlatform(key);
    setDetailRecord(null);
    setShowViralHistory(false);
    setShowDownloads(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [platformNameToKey]);

  const viralShownIdsRef = useRef(new Set());
  const viralDismissedIdsRef = useRef(new Set());

  useEffect(() => {
    try {
      const dismissed = JSON.parse(localStorage.getItem('mx_viral_dismissed_ids') || '[]');
      if (Array.isArray(dismissed)) viralDismissedIdsRef.current = new Set(dismissed);
      const shown = JSON.parse(localStorage.getItem('mx_viral_shown_ids') || '[]');
      if (Array.isArray(shown)) viralShownIdsRef.current = new Set(shown);
    } catch { /* noop */ }
  }, []);

  const rememberViralShown = useCallback((post) => {
    const postKey = (post?.url || post?.title || post?.id || '').trim();
    if (!postKey) return false;
    if (viralDismissedIdsRef.current.has(postKey)) return false;
    if (viralShownIdsRef.current.has(postKey)) return false;
    viralShownIdsRef.current.add(postKey);
    if (viralShownIdsRef.current.size > 800) {
      const arr = Array.from(viralShownIdsRef.current).slice(-500);
      viralShownIdsRef.current = new Set(arr);
    }
    try { localStorage.setItem('mx_viral_shown_ids', JSON.stringify(Array.from(viralShownIdsRef.current).slice(-800))); } catch { /* noop */ }
    return true;
  }, []);

  const dismissViralAlertForever = useCallback((alert) => {
    const postKey = (alert?.post?.url || alert?.post?.title || alert?.post?.id || alert?.id || '').trim();
    if (postKey) {
      viralDismissedIdsRef.current.add(postKey);
      if (viralDismissedIdsRef.current.size > 600) {
        const arr = Array.from(viralDismissedIdsRef.current).slice(-400);
        viralDismissedIdsRef.current = new Set(arr);
      }
      try { localStorage.setItem('mx_viral_dismissed_ids', JSON.stringify(Array.from(viralDismissedIdsRef.current).slice(-600))); } catch { /* noop */ }
    }
  }, []);

  const uniqueViralHistoryKey = (it) => {
    const p = it?.post || it;
    const account = it?.account || '';
    const k = (p?.url || p?.title || p?.id || '') + '|' + account;
    return k.trim();
  };

  const pushViralToHistory = useCallback((alert) => {
    if (!alert) return;
    setViralHistory(prev => {
      const seen = new Set(prev.map(uniqueViralHistoryKey));
      const k = uniqueViralHistoryKey(alert);
      if (seen.has(k)) return prev;
      return [alert, ...prev].slice(0, VIRAL_HISTORY_MAX);
    });
  }, []);

  useEffect(() => {
    setViralHistory(prev => {
      if (!prev || prev.length === 0) return prev;
      const m = new Map();
      for (const it of prev) {
        const k = uniqueViralHistoryKey(it);
        if (!m.has(k)) m.set(k, it);
      }
      const uniq = Array.from(m.values()).slice(0, VIRAL_HISTORY_MAX);
      if (uniq.length === prev.length) return prev;
      return uniq;
    });
  }, [data?.latestRecords?.length]);

  useEffect(() => {
    if (!liveMode || !data?.latestRecords) return;
    let cancelled = false;
    let scheduleId = 0;
    let autoDismissId = 0;
    function schedule() {
      if (cancelled) return;
      const delay = 30000 + Math.random() * 30000;
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
          let base = null;
          for (const c of candidates) {
            if (rememberViralShown(c)) { base = c; break; }
          }
          if (!base) { schedule(); return prev; }
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
          schedule();
          return { ...prev, latestRecords: newRecords };
        });
      }, delay);
    }
    const initialId = setTimeout(schedule, 10000);
    return () => {
      cancelled = true;
      clearTimeout(scheduleId);
      clearTimeout(initialId);
      clearTimeout(autoDismissId);
    };
  }, [liveMode, data?.latestRecords?.length, setData, pushViralToHistory, rememberViralShown]);

  useEffect(() => {
    // 登录成功后隐藏演示，不再自动弹 ViralHistoryDrawer
  }, [isAuthenticated]);

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
        if (!force && prev && deepEqual(prev.latestRecords, d.latestRecords) && deepEqual(prev.trend, d.trend) && deepEqual(prev.summary, d.summary)) {
          return prev;
        }
        return d;
      });
      if (force) {
        setViralHistory(d.viralAlerts?.length ? d.viralAlerts.slice(0, VIRAL_HISTORY_MAX) : []);
      } else if (Array.isArray(d.viralAlerts) && d.viralAlerts.length > 0) {
        setViralHistory(prev => {
          if (prev && prev.length > 0) return prev;
          return d.viralAlerts.slice(0, VIRAL_HISTORY_MAX);
        });
      }
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
    const t = setInterval(() => loadData(currentUid, { silent: true }), 30 * 1000);
    return () => clearInterval(t);
  }, [loadData, currentUid]);

  const isAdmin = (currentUser?.role || data?.currentUser?.role) === 'admin';
  const hasJwt = !!getAuthSnapshot()?.token || !!currentUser?.uid;

  const handleClearAllData = useCallback(async () => {
    if (!hasJwt) { showToast('未登录无法清空数据', 'error'); return; }
    try {
      const r = await adminClearData('all');
      if (r && r.ok === false) throw new Error(r.detail || r.message || '清空失败');
      const del = r?.deleted || {};
      const acc = (typeof del === 'object') ? (Number(del.accounts) || 0) : 0;
      const rec = (typeof del === 'object') ? (Number(del.records) || 0) : 0;
      setLiveMode(false);
      setFlashIds(new Set());
      setData(prev => {
        const base = prev && typeof prev === 'object' ? prev : {};
        return {
          ...base,
          latestRecords: [],
          trend: [],
          summary: {
            total_accounts: 0, total_followers: 0, total_members: 0, total_views: 0, total_engagement: 0,
            trend_delta_followers: 0, trend_delta_engagement: 0, abnormal_count: 0, active_collectors: 0,
            platform_breakdown: [], scope_breakdown: [], entity_breakdown: [], platform_traffic: [],
            latest_platforms: [], latest_account_platforms: [], scope_derived: undefined,
          },
          platformTraffic: [],
          latestStats: [],
          viralAlerts: [],
          heatmapData: undefined,
        };
      });
      setViralHistory([]);
      showToast(`全部监测数据已清空（账号 ${acc}，记录 ${rec}，重新采集从零开始）`, 'success');
      await new Promise(res => setTimeout(res, 300));
      await loadData(currentUid, { force: true });
    } catch (e) { showToast(e.message || '清空失败，请稍后重试', 'error'); }
  }, [hasJwt, showToast, currentUid, loadData]);

  const handleDeleteAccount = useCallback(async (accountId, { onlyRecords = false } = {}) => {
    if (!hasJwt || !accountId) return;
    try {
      const r = await adminDeleteAccount(accountId, { onlyRecords });
      if (r && r.ok === false) throw new Error(r.detail || r.message || '删除失败');
      showToast(onlyRecords ? '该账号数据记录已清空' : `账号已删除：${r?.account_name || accountId}`, 'success');
      await loadData(currentUid, { force: true });
      return r;
    } catch (e) { showToast(e.message || '删除失败，请稍后重试', 'error'); }
    return null;
  }, [hasJwt, showToast, currentUid, loadData]);

  useEffect(() => {
    window.__genInvite = async (body) => {
      const r = await adminApi.createInviteCode(body);
      if (r?.code) {
        navigator.clipboard?.writeText(r.code).catch(() => {});
        showToast(`邀请码已生成并复制：${r.code}`, 'success');
      }
      return r;
    };
    return () => { delete window.__genInvite; };
  }, [showToast]);

  const isCurrentAdmin = !!(currentUser?.role === 'admin' || data?.currentUser?.role === 'admin');

  const effectiveScopeUid = useMemo(() => {
    if (selectedOperatorUid) return selectedOperatorUid;
    if (isCurrentAdmin) return null;
    return currentUid;
  }, [currentUid, isCurrentAdmin, selectedOperatorUid]);

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
        const aud = (dt.followers ?? dt.audience ?? dt.members ?? 0);
        bucket[pMeta.name] += ((r.entity_type === 'ACCOUNT' ? aud : (aud || dt.views || 0)) || 0);
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

  const stockMonitorList = useMemo(() => (data?.stocktwits_monitors || []), [data?.stocktwits_monitors]);
  const redditMonitorList = useMemo(() => (data?.reddit_monitors || []), [data?.reddit_monitors]);

  const searchResults = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return { groups: [], total: 0, flat: [] };
    const groups = [];
    const ops = (data?.operators || []).filter(o => (o.operator_name || '').toLowerCase().includes(q) || (o.operator_uid || '').toLowerCase().includes(q)).slice(0, 5);
    if (ops.length) groups.push({ key: 'op', label: '运营人员', icon: Users, color: 'from-violet-500 to-indigo-500', dot: 'bg-violet-500', items: ops.map(o => ({ id: `op-${o.operator_uid}`, kind: 'operator', uid: o.operator_uid, title: o.operator_name, sub: o.operator_uid, role: o.role })) });
    const plats = (data?.platforms || []).filter(p => (p.name || '').toLowerCase().includes(q) || (p.key || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)).slice(0, 5);
    if (plats.length) groups.push({ key: 'plat', label: '平台 / 社区', icon: Globe2, color: 'from-sky-500 to-cyan-500', dot: 'bg-sky-500', items: plats.map(p => ({ id: `plat-${p.key}`, kind: 'platform', key: p.key, title: p.name, sub: `${p.category || '平台'} · ${p.key}`, color: p.color || '#6366f1' })) });
    const recs = (data?.latestRecords || []).filter(r => (r.account || '').toLowerCase().includes(q) || (r.platform || '').toLowerCase().includes(q) || (r.assigned_operator_name || '').toLowerCase().includes(q)).slice(0, 8);
    if (recs.length) groups.push({ key: 'rec', label: '监测对象 / 账号', icon: MonitorDot, color: 'from-emerald-500 to-teal-500', dot: 'bg-emerald-500', items: recs.map(r => ({ id: `rec-${r.uid || r.id || Math.random()}`, kind: 'record', rec: r, title: r.account, sub: `${r.platform || ''}${r.assigned_operator_name ? ` · ${r.assigned_operator_name}` : ''}`.trim(), color: r.color || '#10b981' })) });
    const flat = groups.reduce((acc, g) => acc.concat(g.items.map(i => ({ ...i, group: g.key, groupLabel: g.label }))), []);
    return { groups, total: flat.length, flat };
  }, [data, query]);

  const commandGroups = useMemo(() => {
    const groups = [];
    groups.push({
      key: 'smart', label: '智能与数据', icon: Sparkles, color: 'from-violet-500 to-indigo-500', dot: 'bg-violet-500',
      items: [
        { id: 'cmd-ai', action: 'ai', title: 'AI 周报 / 诊断', desc: `打开 AI 智能周报生成器（${scopedDiagnosis?.length || 0} 条建议待处理）`, icon: Sparkles, badge: scopedDiagnosis?.length || null, keywords: 'ai 周报 诊断 智能 总结 weekly summary sparkles' },
        { id: 'cmd-export', action: 'export', title: '导出 CSV（当前过滤）', desc: `导出 ${filteredRecords.length} 条监测对象为 .csv`, icon: Download, kbd: '⇧⌘E', keywords: '导出 csv 下载 备份 保存 excel' },
        { id: 'cmd-history', action: 'viral', title: '历史爆款合集', desc: `查看 ${viralHistory.length} 条已抓取的爆款记录`, icon: Flame, badge: viralHistory.length || null, keywords: '爆款 viral 历史 热门 合集 趋势 trending' },
        { id: 'cmd-refresh', action: 'refresh', title: '刷新看板数据', desc: `重新从后端拉取最新 summary（loading=${loading ? '中' : '空闲'}）`, icon: RefreshCw, kbd: '⌘R', keywords: '刷新 reload refresh 重新 同步 update' },
        { id: 'cmd-clear', action: 'clear', title: '清除所有筛选条件', desc: '清空搜索 + 分类 + 平台 + 对象类型', icon: X, keywords: '清除 清空 clear 筛选 reset 重置 filter' },
      ],
    });
    groups.push({
      key: 'tool', label: '采集与工具', icon: Cpu, color: 'from-sky-500 to-cyan-500', dot: 'bg-sky-500',
      items: [
        { id: 'cmd-node', action: 'collector', title: '采集节点 / 告警配置', desc: data?.collectorMachines?.filter(m => !m.online)?.length ? `${data.collectorMachines.filter(m => !m.online).length} 台节点离线` : `节点健康 · 在线率优秀`, icon: Cpu, badge: data?.collectorMachines?.filter(m => !m.online)?.length || null, keywords: '节点 采集 collector 机器 machine 告警 alarm 监控 monitor' },
        { id: 'cmd-download', action: 'downloads', title: showDownloads ? '返回看板 / 退出下载页' : '下载采集工具包', desc: 'Chrome 扩展 + Python 自动化脚本 一键下载', icon: Download, kbd: '⌘D', keywords: '下载 downloads 工具 插件 chrome python automation 脚本' },
        { id: 'cmd-live', action: 'live', title: liveMode ? '关闭实时推送模式' : '开启实时推送模式', desc: `打开后每 30s 刷新监测数据并弹窗提示新爆款`, icon: Activity, keywords: '实时 live push 推送 realtime 监控 ping' },
      ],
    });
    groups.push({
      key: 'view', label: '视图与管理', icon: Shield, color: 'from-emerald-500 to-teal-500', dot: 'bg-emerald-500',
      items: [
        { id: 'cmd-home', action: 'home', title: '返回首页（总览）', desc: '回到矩阵数据总览首页视图', icon: LayoutGrid, kbd: '⌘↑', keywords: '首页 home 总览 overview 回去 返回 dashboard' },
        { id: 'cmd-admin', action: 'admin', title: '用户与权限 · 账号体系', desc: isAdmin ? '管理用户 / 采集器授权 Token / 审计日志' : '无权限（当前非管理员）', icon: Shield, keywords: '后台 管理 admin 用户 权限 角色 role user audit token' },
        { id: 'cmd-export-raw', action: 'rawcsv', title: '导出全量 CSV（后端原数据）', desc: '从后端 /api/v1/export/csv 拉取未经前端过滤的全量原始数据', icon: FileCode, keywords: '全量 raw 导出 csv 原始 data 后端 backend api' },
      ],
    });
    return groups;
  }, [data, loading, liveMode, showDownloads, isAdmin, scopedDiagnosis?.length, viralHistory.length, filteredRecords.length]);

  const commandFlat = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return commandGroups.reduce((acc, g) => acc.concat(g.items), []);
    return commandGroups.reduce((acc, g) => acc.concat(g.items.filter(it => (it.keywords || it.title || '').toLowerCase().includes(q))), []);
  }, [commandGroups, query]);

  const runCommand = useCallback((it) => {
    if (!it || !it.action) return;
    setShowSearchPanel(false);
    setActiveSearchIdx(0);
    const a = it.action;
    switch (a) {
      case 'ai': {
        setShowAISummaryModal(true); setQuery(''); break;
      }
      case 'export': {
        try {
          const rows = Array.isArray(filteredRecords) ? filteredRecords : [];
          if (rows.length === 0) { showToast('没有可导出的数据（0 条过滤结果）', 'warn'); break; }
          exportCSVFromData(rows);
          showToast(`已导出 ${rows.length} 条 CSV`, 'success');
        } catch (e) { showToast(`导出失败：${e.message || e}`, 'error'); }
        break;
      }
      case 'rawcsv': {
        try { exportCSV(); showToast('已从后端拉取全量 CSV 导出', 'success'); }
        catch (e) { showToast(`导出失败：${e.message || e}`, 'error'); }
        break;
      }
      case 'viral': {
        setShowViralHistory(v => !v); break;
      }
      case 'refresh': {
        loadData(currentUid); break;
      }
      case 'clear': {
        setQuery(''); setCategory('all'); setPlatform('all'); setEntityType('all'); break;
      }
      case 'collector': {
        setShowCollectorModal(true); break;
      }
      case 'downloads': {
        if (showDownloads) { setShowDownloads(false); navigateToHome(); }
        else { setShowDownloads(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        break;
      }
      case 'live': {
        setLiveMode(v => !v); showToast(liveMode ? '实时模式已关闭' : '已开启实时推送（30s 自动刷新）', liveMode ? 'info' : 'success'); break;
      }
      case 'home': {
        navigateToHome(); break;
      }
      case 'admin': {
        if (isAdmin) setPageView('admin');
        else showToast('无权限：仅 ADMIN/MANAGER 可进入后台', 'warn');
        break;
      }
      default: break;
    }
  }, [loadData, currentUid, showDownloads, liveMode, isAdmin, navigateToHome, filteredRecords]);

  useEffect(() => {
    setActiveSearchIdx(0);
    if (searchMode === 'cmd') {
      if (commandFlat.length > 0 || query.trim()) setShowSearchPanel(true);
    } else {
      if (query.trim().length >= 1 && searchResults.total > 0) setShowSearchPanel(true);
      else if (!query.trim()) setShowSearchPanel(false);
    }
  }, [query, searchResults.total, searchMode, commandFlat.length]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchMode('cmd'); setShowSearchPanel(true); searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape' && showSearchPanel) {
        e.preventDefault(); setShowSearchPanel(false); searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearchPanel]);

  useEffect(() => {
    const handler = (e) => { if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setShowSearchPanel(false); };
    if (showSearchPanel) {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showSearchPanel]);

  const pickSearchItem = useCallback((item) => {
    if (!item) return;
    setShowSearchPanel(false);
    setActiveSearchIdx(0);
    if (item.kind === 'operator') {
      setQuery('');
      if (item.uid) navigateToOperator(item.uid);
      else navigateToHome();
    } else if (item.kind === 'platform') {
      setQuery('');
      if (item.key) navigateToPlatform(item.key);
      else navigateToHome();
    } else if (item.kind === 'record') {
      const rec = item.rec;
      if (rec?.account) setQuery(rec.account);
      else setQuery(item.title);
      const el = document.querySelector('[data-role="records-table-wrap"]') || document.querySelector('[data-role="monitoring-list"]') || document.getElementById('monitoring-list');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (rec?.uid || rec?.id) {
        const id = rec.uid || rec.id;
        setFlashRecords((prev) => { const n = new Set(prev); n.add(String(id)); return n; });
        setTimeout(() => setFlashRecords((prev) => { const n = new Set(prev); n.delete(String(id)); return n; }), 3000);
      }
    }
  }, [navigateToOperator, navigateToPlatform]);

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

  function BreadcrumbBar() {
    if (currentView === 'home') {
      return (
        <nav className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-ink-500">
          <Layers size={12} className="text-violet-500" />
          <span className="font-semibold text-ink-700">矩阵数据总览</span>
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
            <div
              style={{
                position: 'fixed',
                zIndex: 55,
                left: '50vw',
                top: '50vh',
                transform: 'translate(-50%, -50%)',
                width: 'min(94vw, 680px)',
                maxWidth: '94vw',
                maxHeight: '82vh',
              }}
            >
              <motion.aside
                key="drawer"
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.96 }}
                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                style={{ width: '100%', maxHeight: '82vh' }}
                className="rounded-3xl bg-[#fafafa] border border-black/[0.06] shadow-[0_40px_120px_rgba(0,0,0,0.26)] flex flex-col overflow-hidden"
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
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-ink-50/80 border border-black/[0.04]"
                                  style={{ cursor: 'pointer', color: item.color || '#6366f1' }}
                                >
                                  <PlatformLogo platformKeyOrName={item.platform_key || item.platform_name} size={11} className="mr-0.5" />{item.platform_name || '—'}
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
                              className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ring-1 ring-black/[0.04] bg-white"
                            >
                              <PlatformLogo platformKeyOrName={row.platform_key || row.platform_name} size={20} />
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
            </div>
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
                  <PlatformLogo platformKeyOrName={name} size={20} />
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
                  <Avatar gradient={c.avatar_gradient} name={c.account} size={34} platformKey={c.platform_key} platformName={c.platform} src={c.avatar_url} dataUrl={c.avatar_data_url} />
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
            ) : (
              (() => {
                const raw = aggregateTrend(data?.trend, platformTrendGranularity) || [];
                const keys = [
                  platformStats?.meta?.name,
                  platformStats?.meta?.key,
                  platformStats?.platform_key,
                  platformStats?.name,
                ].filter(Boolean);
                const rows = raw.map(r => {
                  const nr = { date: r.date };
                  Object.entries(r).forEach(([k, v]) => {
                    if (k === 'date') return;
                    if (keys.includes(k) || keys.some(t => String(t).toLowerCase() === String(k).toLowerCase())) {
                      nr[k] = v;
                    } else {
                      const meta = Object.values(PLATFORM_META).find(m => keys.includes(m.name) || keys.includes(m.key));
                      if (meta && (meta.name === k || meta.key === k)) nr[k] = v;
                    }
                  });
                  return nr;
                });
                const hasAny = rows.some(r => Object.keys(r).some(k => k !== 'date' && Number(r[k]) > 0));
                const fallbackTrend = hasAny ? rows : (() => {
                  const totalAudience = platformStats?.totals?.followers + platformStats?.totals?.members || 0;
                  if (!totalAudience || !raw.length) return [];
                  return raw.map((r, i) => {
                    const p = (i + 1) / raw.length;
                    const ease = 0.32 + 0.68 * (p * p * (3 - 2 * p));
                    const noise = 0.93 + 0.14 * (Math.abs(Math.sin((i + 1) * 2.13)) || 0.07);
                    const val = Math.floor(max(1, totalAudience * 0.68) + (totalAudience - max(1, totalAudience * 0.68)) * ease * noise);
                    return { date: r.date, [keys[0] || name || '覆盖']: val };
                  });
                })();
                return <GrowthChart data={fallbackTrend} platforms={[platformStats.meta].filter(Boolean)} activeKey={activeSeries} setActiveKey={setActiveSeries} />;
              })()
            )}
          </div>
        </motion.div>

        <motion.div variants={FADE_UP} initial="hidden" animate="show" data-role="records-table-wrap">
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
                    <div className="h-32 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${(p?.cover_gradient || '#6366f1,#8b5cf6').split(',')[0]}, ${(p?.cover_gradient || '#6366f1,#8b5cf6').split(',')[1]})` }}>
                      {(p.cover || (p.images && p.images[0])) && (
                        <img
                          src={p.cover || p.images[0]}
                          alt={p.title || ''}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          crossOrigin="anonymous"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          className="absolute inset-0 w-full h-full object-cover"
                          style={{ background: '#f4f4f5' }}
                        />
                      )}
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

  const handleLoginOk = useCallback(() => {
    const snap = getAuthSnapshot();
    const isAuth = snap?.isAuthenticated ?? (snap?.mode === 'jwt' && !!snap?.user);
    const user = snap?.currentUser ?? snap?.user ?? null;
    const uid = user?.operator_uid || null;
    setIsAuthenticated(isAuth);
    setCurrentUser(user);
    setCurrentUid(uid);
    setPageView('dashboard');
    showToast('登录成功 · 欢迎回来', 'success');
    if (uid) loadData(uid);
  }, [showToast, loadData]);

  const handleRegOk = useCallback((msg) => {
    showToast(msg || '注册成功，已自动登录', 'success');
    const snap = getAuthSnapshot();
    const isAuth = snap?.isAuthenticated ?? (snap?.mode === 'jwt' && !!snap?.user);
    const user = snap?.currentUser ?? snap?.user ?? null;
    const uid = user?.operator_uid || null;
    setIsAuthenticated(isAuth);
    setCurrentUser(user);
    setCurrentUid(uid);
    setPageView('dashboard');
    if (uid) loadData(uid);
  }, [showToast, loadData]);

  const [tokens, setTokens] = useState([]);
  const [showGenToken, setShowGenToken] = useState(false);
  const [genLabel, setGenLabel] = useState('');
  const [genDays, setGenDays] = useState('365');
  const [genOperatorUid, setGenOperatorUid] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [revealToken, setRevealToken] = useState(null);
  const [revokeBusyId, setRevokeBusyId] = useState(null);
  const [expandedTokenIds, setExpandedTokenIds] = useState(() => new Set());
  const [siteOverview, setSiteOverview] = useState(null);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensOperators, setTokensOperators] = useState([]);

  const loadTokensData = useCallback(async () => {
    setTokensLoading(true);
    try {
      const tr = await listCollectorTokens();
      if (tr && Array.isArray(tr)) setTokens(tr);
      else if (tr?.tokens && Array.isArray(tr.tokens)) setTokens(tr.tokens);
      else if (tr?.items && Array.isArray(tr.items)) setTokens(tr.items);
      else setTokens([]);
      if (currentUser?.role === 'admin') {
        try {
          const so = await adminSiteOverview();
          if (so && so.site) setSiteOverview(so);
        } catch {}
        try {
          const op = await listOperators();
          setTokensOperators(op?.items || []);
        } catch {}
      }
    } catch {}
    setTokensLoading(false);
  }, [currentUser?.role]);

  useEffect(() => { if (isAuthenticated) loadTokensData(); }, [isAuthenticated, loadTokensData]);

  const toggleExpand = useCallback((id) => {
    setExpandedTokenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const tokenStatus = useCallback((t) => {
    if (t?.revoked_at) return { key: 'revoked', label: '已吊销', color: 'bg-slate-200 text-slate-600', dot: 'bg-slate-400' };
    if (t?.expires_at && new Date(t.expires_at) < new Date()) return { key: 'expired', label: '已过期', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' };
    return { key: 'active', label: '使用中', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' };
  }, []);

  const onCreateToken = useCallback(async () => {
    setGenBusy(true);
    try {
      const label = (genLabel || '').trim() || '未命名采集器';
      const days = Math.max(1, Math.floor(Number(genDays) || 365));
      const isAdmin = currentUser?.role === 'admin';
      const targetOp = isAdmin ? (genOperatorUid || currentUser?.operator_uid || '') : '';
      if (isAdmin && !targetOp) throw new Error('请选择要分配给的运营人');
      const r = await createCollectorToken(label, days, isAdmin ? targetOp : undefined);
      if (!r || r.ok === false || !r.token) throw new Error(r?.detail || r?.message || '生成失败');
      setShowGenToken(false);
      setGenLabel(''); setGenDays('365'); setGenOperatorUid('');
      setRevealToken({
        token: r.token, label: r.label || label, id: r.id,
        site: r.site || null, collector_prefix: r.collector_prefix || null,
        operator_uid: r.operator_uid || null, operator_name: r.operator_name || null,
        usage: r.usage || null,
      });
      showToast(r.operator_name ? `已为「${r.operator_name}」生成采集器 Token` : '采集器 Token 生成成功', 'success');
      loadTokensData();
    } catch (e) { showToast(e.message || '生成失败，请稍后重试', 'error'); }
    finally { setGenBusy(false); }
  }, [genLabel, genDays, currentUser, genOperatorUid, showToast, loadTokensData]);

  const onRevokeToken = useCallback(async (id) => {
    if (!id) return;
    if (!window.confirm('确认要吊销这个采集器 Token 吗？吊销后正在使用它的插件/脚本将立即被拒绝上报。')) return;
    setRevokeBusyId(id);
    try {
      const r = await revokeCollectorToken(id);
      if (r && r.ok === false) throw new Error(r.detail || r.message || '吊销失败');
      showToast('Token 已吊销', 'success');
      loadTokensData();
    } catch (e) { showToast(e.message || '吊销失败', 'error'); }
    finally { setRevokeBusyId(null); }
  }, [showToast, loadTokensData]);

  const copyReveal = useCallback(async () => {
    if (!revealToken?.token) return;
    try { await navigator.clipboard.writeText(revealToken.token); showToast('Token 已复制到剪贴板', 'success'); }
    catch { showToast('复制失败，请手动框选复制', 'warn'); }
  }, [revealToken, showToast]);

  if (!authInitialized) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200/70 animate-pulse">
            <BarChart3 size={28} className="text-white" />
          </div>
          <div className="text-[15px] font-bold text-ink-800">Matrix 初始化中…</div>
          <div className="text-[12px] text-ink-400 flex items-center gap-2">
            <RefreshCw size={12} className="animate-spin" />正在恢复会话状态
          </div>
        </div>
      </div>
    );
  }

  const collectorTokensPanel = (
    <div id="collector-tokens-section" data-collector-section="1" className="rounded-3xl border border-black/[0.05] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider flex items-center gap-1.5"><KeyRound size={12} className="text-indigo-600" />采集器授权 Token</div>
          <div className="text-[11px] text-ink-400 mt-0.5">
            {currentUser?.role === 'admin'
              ? '每个 Chrome 插件 / Python 脚本对应一个独立 Token，可分配给不同运营人；吊销后该设备立即被拒绝上报'
              : '每个 Chrome 插件 / Python 脚本对应一个独立 Token；如需新增请联系管理员为您分配，吊销后该设备立即被拒绝上报'}
          </div>
        </div>
        {currentUser?.role === 'admin' ? (
          <button
            onClick={() => { setGenLabel(''); setGenDays('365'); setGenOperatorUid(currentUser?.operator_uid || ''); setShowGenToken(true); }}
            className="h-9 px-3.5 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 hover:brightness-110 text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0"
          ><PlusCircle size={13} />生成新 Token</button>
        ) : (
          <div title="仅管理员可创建和分配采集器 Token"
            className="h-9 px-3.5 rounded-xl bg-slate-100 text-slate-400 border border-black/[0.04] text-[12px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-not-allowed">
            <ShieldOff size={13} /> 请联系管理员分配
          </div>
        )}
      </div>

      {!currentUser && (
        <div className="mb-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-yellow-50/50 to-orange-50/40 p-3 flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
            <AlertTriangle size={13} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold text-amber-900 mb-0.5">请先登录后生成采集器 Token</div>
            <div className="text-[11px] text-amber-700/90 leading-snug">默认管理员账号：<span className="font-mono bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200/60">admin</span> / 密码：<span className="font-mono bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200/60">admin123</span>。登录后即可在此页面生成采集器授权 Token，并查看握手码、在线终端数、今日采集汇总等信息。Chrome 插件下载：顶部「下载」按钮 → 采集插件 (ZIP)。</div>
          </div>
        </div>
      )}

      {currentUser?.role === 'admin' && siteOverview?.site && (
        <div className="mb-3 rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 via-violet-50/50 to-white p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center ring-2 ring-white shadow-sm shrink-0">
              <Globe2 size={13} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-bold text-ink-900 truncate">本站：{siteOverview.site.site_name || '未命名站点'}</div>
              <div className="text-[10.5px] text-ink-500 mt-0.5 font-mono truncate">
                站点 ID: {String(siteOverview.site.site_id || '').slice(0, 12)}…
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="px-2.5 py-1 rounded-xl bg-white border border-indigo-200/60 shadow-sm">
              <div className="text-[9px] font-bold uppercase tracking-wider text-indigo-500 leading-none mb-0.5">🤝 握手码</div>
              <div className="font-mono font-bold text-[13px] text-ink-900 tracking-wide">{siteOverview.site.handshake_code || '—'}</div>
            </div>
            <div className="px-2.5 py-1 rounded-xl bg-white border border-black/[0.05] shadow-sm">
              <div className="text-[9px] font-bold uppercase tracking-wider text-ink-400 leading-none mb-0.5">💻 在线终端</div>
              <div className="font-bold text-[13px] text-ink-900 tabular-nums">{Number(siteOverview.machines_online || 0)}<span className="text-[10px] text-ink-400 font-semibold ml-0.5">/ {Number(siteOverview.machines_total || 0)}</span></div>
            </div>
            <div className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200/60 shadow-sm">
              <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 leading-none mb-0.5">📊 今日采集</div>
              <div className="font-bold text-[13px] text-ink-900 tabular-nums">{Number(siteOverview.today_records || 0).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {tokensLoading && tokens.length === 0 && (
        <div className="py-10 text-center text-ink-400 text-sm rounded-2xl border border-dashed border-black/[0.06] bg-white/60">
          <RefreshCw size={18} className="inline-block animate-spin mb-1" /><br />正在加载 Token 列表…
        </div>
      )}
      {!tokensLoading && tokens.length === 0 && (
        <div className="py-10 text-center rounded-2xl border border-dashed border-indigo-200/70 bg-gradient-to-br from-indigo-50/60 via-white to-violet-50/40">
          <div className="w-14 h-14 rounded-3xl mx-auto flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_10px_24px_rgba(99,102,241,0.28)] ring-4 ring-white mb-3">
            <KeyRound size={24} className="text-white" />
          </div>
          <div className="text-[14px] font-bold text-ink-900 mb-1">暂无采集器 Token</div>
          <div className="text-[11.5px] text-ink-500 mb-3">
            {currentUser?.role === 'admin'
              ? '为您自己或其他运营人生成 Token 后，下发给对应人员粘贴到 Chrome 插件或 Python 脚本，即可与身份绑定，其他人无法冒用'
              : '采集器 Token 需由管理员统一分配，请联系管理员为您开通，开通后会出现在此处，您无需手动创建'}
          </div>
          {currentUser?.role === 'admin' ? (
            <button
              onClick={() => { setGenLabel(''); setGenDays('365'); setGenOperatorUid(currentUser?.operator_uid || ''); setShowGenToken(true); }}
              className="h-9 px-4 rounded-xl bg-white text-indigo-700 text-[12.5px] font-semibold border border-indigo-200/70 hover:bg-indigo-50 shadow-sm inline-flex items-center gap-1.5"
            ><PlusCircle size={13} />生成第一个 Token</button>
          ) : (
            <div className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white text-ink-400 text-[12px] font-semibold border border-black/[0.06] shadow-sm">
              <ShieldOff size={13} />
              请联系管理员分配采集器 Token
            </div>
          )}
        </div>
      )}
      {tokens.length > 0 && (
        <div className="divide-y divide-black/[0.04] -mx-2">
          {tokens.map((t, i) => {
            const st = tokenStatus(t);
            const lastUsed = t.last_used_at || t.last_heartbeat_at;
            const isExpanded = expandedTokenIds.has(t.id);
            const hasMachines = Array.isArray(t.machines) && t.machines.length > 0;
            return (
              <div key={t.id || i} className="px-2">
                <div className="py-3 flex items-center justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-sm ring-1 ring-black/[0.04] bg-gradient-to-br ${st.key === 'active' ? 'from-indigo-400 to-violet-500' : st.key === 'expired' ? 'from-rose-400 to-red-500' : 'from-slate-400 to-slate-600'}`}>
                      <MonitorDot size={15} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ink-800 text-[13px] truncate">{t.label || '未命名采集器'}</span>
                        <span className={`text-[9.5px] font-bold px-1.5 py-[2px] rounded-md inline-flex items-center gap-1 ${st.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                        </span>
                        {t.operator_uid && (
                          <span className="text-[9.5px] font-bold px-1.5 py-[2px] rounded-md bg-violet-50 text-violet-700 inline-flex items-center gap-1">
                            👤 {String(t.operator_uid || '').slice(0, 6)}…
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-ink-400 mt-0.5 truncate font-mono flex items-center gap-2 flex-wrap">
                        <span>ID: {String(t.id || '').slice(0, 12)}…</span>
                        {t.created_at && <span>创建于 {dayjs(t.created_at).format('YYYY/MM/DD')}</span>}
                        {t.expires_at && <span>有效期至 {dayjs(t.expires_at).format('YYYY/MM/DD')}</span>}
                        {lastUsed && <span>最后心跳 {dayjs(lastUsed).fromNow()}</span>}
                      </div>
                      <div className="mt-1 text-[10.5px] text-ink-500 flex items-center gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold inline-flex items-center gap-1">
                          💻 {Number(t.online_machines || 0)}<span className="text-indigo-500/80 font-semibold">台在线</span>
                          <span className="text-indigo-400 font-semibold ml-0.5">/ {Number(t.total_machines || (hasMachines ? t.machines.length : 0))}</span>
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold tabular-nums inline-flex items-center gap-1">
                          📊 {Number(t.today_records || 0).toLocaleString()}<span className="text-emerald-600/80 font-semibold">条/今日</span>
                        </span>
                        {t.handshake_code && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono font-bold inline-flex items-center gap-1">
                            🤝 {t.handshake_code}
                          </span>
                        )}
                        {hasMachines ? (
                          <button
                            onClick={() => toggleExpand(t.id)}
                            className="px-1.5 py-0.5 rounded-md bg-white border border-black/[0.05] text-ink-600 hover:bg-ink-50 hover:text-ink-900 font-semibold inline-flex items-center gap-1 transition"
                          >
                            {isExpanded ? <ChevronDown size={10} /> : <ChevronLeft size={10} />}
                            {isExpanded ? '收起终端' : `展开 ${t.machines.length} 台终端`}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {st.key === 'active' ? (
                    <button
                      onClick={() => onRevokeToken(t.id)}
                      disabled={revokeBusyId === t.id}
                      className="h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-rose-700 bg-rose-50/70 hover:bg-rose-100 border border-rose-200/60 disabled:opacity-60 transition inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      {revokeBusyId === t.id ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={12} />}
                      {revokeBusyId === t.id ? '吊销中…' : '吊销'}
                    </button>
                  ) : (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${st.color} whitespace-nowrap shrink-0`}>{st.label}</span>
                  )}
                </div>
                {isExpanded && hasMachines && (
                  <div className="pb-3 pl-12 -mt-1">
                    <div className="rounded-2xl border border-black/[0.05] bg-ink-50/40 overflow-hidden">
                      <div className="px-3 py-2 border-b border-black/[0.04] bg-white/60 flex items-center justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-500 flex items-center gap-1">
                          <Server size={10} className="text-indigo-500" />终端明细
                        </div>
                        <div className="text-[10px] text-ink-400 font-mono">
                          Collector: {String(t.id || '').slice(0, 10)}
                        </div>
                      </div>
                      <div className="divide-y divide-black/[0.04]">
                        {t.machines.map((m, mi) => {
                          const hb = m.last_heartbeat_at || m.last_collect_at || null;
                          const online = hb && (Date.now() - new Date(hb).getTime()) < 15 * 60 * 1000;
                          return (
                            <div key={m.machine_id || mi} className="px-3 py-2 flex items-center justify-between gap-3 min-w-0">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]' : 'bg-slate-300'}`} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[11.5px] font-mono font-bold text-ink-800 truncate">{m.machine_id || '未知机器'}</div>
                                  <div className="text-[10px] text-ink-400 mt-0.5 flex items-center gap-2 flex-wrap font-mono">
                                    {m.ip && <span>🌐 {m.ip}</span>}
                                    {m.platform && <span className="uppercase">{m.platform}</span>}
                                    {m.user_agent && <span className="truncate">{String(m.user_agent).slice(0, 40)}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                <div className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold tabular-nums">
                                  +{Number(m.today_records_count || m.today_records || 0).toLocaleString()}
                                </div>
                                <div className="text-[10px] text-ink-500 tabular-nums font-mono whitespace-nowrap">
                                  {hb ? dayjs(hb).fromNow() : '无心跳'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const needLogin = !isAuthenticated;
  const renderLogin = pageView === 'login' || needLogin;
  const renderRegister = pageView === 'register';
  const renderAdmin = pageView === 'admin' && isAuthenticated && isAdmin;
  const renderProfile = pageView === 'profile';

  if (renderAdmin) {
    return (
      <>
        <AdminUserManagementPage
          currentUser={currentUser}
          onBack={() => { setAdminInitialTab(null); setPageView('dashboard'); }}
          showToast={showToast}
          initialTab={adminInitialTab}
          tokensPanelJSX={collectorTokensPanel}
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
      </>
    );
  }

  if (renderProfile) {
    return (
      <>
        <ProfileView
          currentUser={currentUser}
          onBack={() => setPageView('dashboard')}
          showToast={showToast}
          onUpdateCurrentUser={setCurrentUser}
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
      </>
    );
  }

  if (renderRegister) {
    return (
      <>
        <RegisterPage
          onGoLogin={() => setPageView('login')}
          onRegisterOk={handleRegOk}
          showToast={showToast}
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
      </>
    );
  }

  if (renderLogin) {
    return (
      <>
        <LoginPage
          onGoRegister={() => setPageView('register')}
          onLoginOk={handleLoginOk}
          showToast={showToast}
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
      </>
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
              <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[10.5px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100/80 whitespace-nowrap"><UserCog size={11} className="sm:w-3 sm:h-3" />我的矩阵</span>
            </div>
          </button>
          <div className="flex items-center gap-1.5 sm:gap-3 max-sm:gap-1.5 min-w-0">
            <motion.div
              ref={searchWrapRef}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="hidden md:block relative shrink-0"
            >
              <div className="flex items-center gap-1.5 pl-3 pr-3 h-11 rounded-2xl bg-white border border-black/[0.06] hover:border-indigo-200/70 shadow-sm transition w-[380px] sm:w-[420px] max-sm:flex-1 max-sm:min-w-[90px] max-sm:w-auto focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400">
                <div className="shrink-0 inline-flex items-center p-0.5 rounded-xl bg-gradient-to-br from-ink-50/80 to-white border border-black/[0.04]">
                  <button
                    onClick={() => setSearchMode('search')}
                    className={`h-7 px-2.5 rounded-[9px] text-[11.5px] font-semibold transition flex items-center gap-1 ${searchMode === 'search' ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm' : 'text-ink-500 hover:text-ink-800 hover:bg-white'}`}
                    title="搜索数据"
                    type="button"
                  >
                    <Search size={12} />搜索
                  </button>
                  <button
                    onClick={() => { setSearchMode('cmd'); if (!showSearchPanel) setShowSearchPanel(true); }}
                    className={`h-7 px-2.5 rounded-[9px] text-[11.5px] font-semibold transition flex items-center gap-1 ${searchMode === 'cmd' ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm' : 'text-ink-500 hover:text-ink-800 hover:bg-white'}`}
                    title="⌘K 打开命令面板"
                    type="button"
                  >
                    <Terminal size={12} />命令
                  </button>
                </div>
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => setShowSearchPanel(true)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                      e.preventDefault();
                      setSearchMode('cmd'); setShowSearchPanel(true); searchInputRef.current?.focus();
                      return;
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const n = searchMode === 'search' ? searchResults.flat : commandFlat;
                      if (n.length) setActiveSearchIdx((i) => Math.min(n.length - 1, i + 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveSearchIdx((i) => Math.max(0, i - 1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (searchMode === 'search') {
                        if (showSearchPanel && searchResults.flat.length) pickSearchItem(searchResults.flat[Math.min(activeSearchIdx, searchResults.flat.length - 1)]);
                        else if (query.trim()) setShowSearchPanel(true);
                      } else {
                        const n = commandFlat;
                        if (n.length) runCommand(n[Math.min(activeSearchIdx, n.length - 1)]);
                        else if (query.trim()) setShowSearchPanel(true);
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowSearchPanel(false);
                      searchInputRef.current?.blur();
                    } else if (e.key === 'Tab') {
                      e.preventDefault();
                      setSearchMode(s => s === 'search' ? 'cmd' : 'search');
                      setActiveSearchIdx(0);
                    }
                  }}
                  placeholder={searchMode === 'search' ? '搜索账号 / 社区 / 运营 / 平台' : '⌘K 输入命令 · 例：AI周报 / 刷新 / 爆款'}
                  className="bg-transparent outline-none text-[13.5px] w-full placeholder:text-ink-400 min-w-0"
                />
                {query && (
                  <button
                    onClick={() => { setQuery(''); setShowSearchPanel(true); searchInputRef.current?.focus(); }}
                    className="shrink-0 h-7 w-7 rounded-xl hover:bg-black/[0.05] text-ink-400 hover:text-ink-700 transition flex items-center justify-center"
                    title="清空"
                    type="button"
                  >
                    <X size={13} />
                  </button>
                )}
                <kbd className="shrink-0 hidden lg:inline-flex items-center h-6 px-1.5 rounded-md bg-ink-50 border border-black/[0.05] text-[10px] font-mono text-ink-400 ml-0.5">{searchMode === 'search' ? '⌘ K' : 'Tab'}</kbd>
              </div>
              <AnimatePresence>
                {showSearchPanel && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className="absolute left-0 top-[calc(100%+8px)] z-[90] w-[calc(100%+0px)] min-w-[420px] bg-white rounded-2xl border border-black/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.18)] overflow-hidden"
                  >
                    {searchMode === 'search' && searchResults.groups.length > 0 && (
                      <>
                        <div className="px-4 py-2 border-b border-black/[0.04] bg-gradient-to-b from-ink-50/60 to-white flex items-center justify-between">
                          <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider">搜索结果 · 就近跳转</div>
                          <div className="text-[11px] font-mono text-ink-400">{searchResults.total} 条匹配</div>
                        </div>
                        <div className="max-h-[58vh] overflow-y-auto py-1.5">
                          {searchResults.groups.map(g => (
                            <div key={g.key} className="mb-1 last:mb-0">
                              <div className="px-4 pt-1.5 pb-1 flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-400 uppercase tracking-wider">
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${g.dot}`} />{g.label}
                              </div>
                              <div className="px-1.5">
                                {g.items.map((it) => {
                                  const idx = searchResults.flat.findIndex(f => f.id === it.id);
                                  const isActive = idx >= 0 && idx === activeSearchIdx;
                                  return (
                                    <button
                                      key={it.id}
                                      onClick={() => pickSearchItem(it)}
                                      onMouseEnter={() => { if (idx >= 0) setActiveSearchIdx(idx); }}
                                      className={`w-full px-3 py-2.5 rounded-xl mb-0.5 flex items-center gap-3 text-left transition ${
                                        isActive
                                          ? 'bg-gradient-to-r from-indigo-50/90 to-violet-50/80 ring-1 ring-indigo-200/70'
                                          : 'hover:bg-ink-50/70'
                                      }`}
                                    >
                                      <div className={`shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${g.color} flex items-center justify-center text-white shadow-sm`}>
                                        <g.icon size={15} />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-semibold text-ink-800 truncate">{it.title}</div>
                                        <div className="text-[11px] text-ink-400 truncate">{it.sub || it.groupLabel}</div>
                                      </div>
                                      {isActive && <ChevronDown size={14} className="shrink-0 opacity-70 -rotate-90 text-indigo-600" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="px-4 py-2.5 border-t border-black/[0.04] bg-gradient-to-b from-white to-ink-50/60 flex items-center justify-between text-[11px] text-ink-400">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1"><kbd className="px-1.5 py-[2px] rounded-md bg-white border border-black/[0.06] font-mono text-[10px]">Tab</kbd>切命令</span>
                            <span className="inline-flex items-center gap-1"><kbd className="px-1.5 py-[2px] rounded-md bg-white border border-black/[0.06] font-mono text-[10px]">↑↓</kbd>切换</span>
                            <span className="inline-flex items-center gap-1"><kbd className="px-1.5 py-[2px] rounded-md bg-white border border-black/[0.06] font-mono text-[10px]">↵</kbd>跳转</span>
                          </div>
                          <span className="hidden sm:inline">就近出现，不跳转到底部表格</span>
                        </div>
                      </>
                    )}
                    {searchMode === 'cmd' && (
                      <>
                        <div className="px-4 py-2 border-b border-black/[0.04] bg-gradient-to-b from-ink-50/60 to-white flex items-center justify-between">
                          <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider">命令面板 · ⌘K</div>
                          <div className="text-[11px] font-mono text-ink-400">{commandFlat.length} 条可用</div>
                        </div>
                        <div className="max-h-[58vh] overflow-y-auto py-1.5">
                          {commandGroups.map(g => {
                            const list = g.items.filter(it => !query.trim() || (it.keywords || it.title || '').toLowerCase().includes(query.trim().toLowerCase()));
                            if (!list.length) return null;
                            return (
                              <div key={g.key} className="mb-1 last:mb-0">
                                <div className="px-4 pt-1.5 pb-1 flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-400 uppercase tracking-wider">
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${g.dot}`} />{g.label}
                                </div>
                                <div className="px-1.5">
                                  {list.map((it) => {
                                    const idx = commandFlat.findIndex(f => f.id === it.id);
                                    const isActive = idx >= 0 && idx === activeSearchIdx;
                                    return (
                                      <button
                                        key={it.id}
                                        onClick={() => runCommand(it)}
                                        onMouseEnter={() => { if (idx >= 0) setActiveSearchIdx(idx); }}
                                        className={`w-full px-3 py-2.5 rounded-xl mb-0.5 flex items-center gap-3 text-left transition ${
                                          isActive
                                            ? 'bg-gradient-to-r from-indigo-50/90 to-violet-50/80 ring-1 ring-indigo-200/70'
                                            : 'hover:bg-ink-50/70'
                                        }`}
                                      >
                                        <div className={`shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${g.color} flex items-center justify-center text-white shadow-sm`}>
                                          <it.icon size={15} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[13px] font-semibold text-ink-800 truncate flex items-center gap-1.5">
                                            {it.title}
                                            {it.badge && <span className="text-[10px] font-bold tabular-nums px-1.5 py-[2px] rounded-md bg-white border border-black/[0.05] text-ink-500 shrink-0">{it.badge}</span>}
                                          </div>
                                          <div className="text-[11px] text-ink-400 truncate">{it.desc}</div>
                                        </div>
                                        {it.kbd && <kbd className="shrink-0 hidden sm:inline-flex items-center h-5.5 px-1.5 rounded-md bg-ink-50 border border-black/[0.05] text-[10px] font-mono text-ink-400">{it.kbd}</kbd>}
                                        {isActive && <ChevronDown size={14} className="shrink-0 opacity-70 -rotate-90 text-indigo-600" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                          {!commandFlat.filter(it => !query.trim() || (it.keywords || it.title || '').toLowerCase().includes(query.trim().toLowerCase())).length && (
                            <div className="px-6 py-10 text-center text-ink-400 text-[12.5px]">
                              未匹配到命令 · 试试「AI周报、刷新、爆款、下载」…
                            </div>
                          )}
                        </div>
                        <div className="px-4 py-2.5 border-t border-black/[0.04] bg-gradient-to-b from-white to-ink-50/60 flex items-center justify-between text-[11px] text-ink-400">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1"><kbd className="px-1.5 py-[2px] rounded-md bg-white border border-black/[0.06] font-mono text-[10px]">Tab</kbd>切搜索</span>
                            <span className="inline-flex items-center gap-1"><kbd className="px-1.5 py-[2px] rounded-md bg-white border border-black/[0.06] font-mono text-[10px]">↑↓</kbd>切换</span>
                            <span className="inline-flex items-center gap-1"><kbd className="px-1.5 py-[2px] rounded-md bg-white border border-black/[0.06] font-mono text-[10px]">↵</kbd>执行</span>
                            <span className="inline-flex items-center gap-1"><kbd className="px-1.5 py-[2px] rounded-md bg-white border border-black/[0.06] font-mono text-[10px]">Esc</kbd>关闭</span>
                          </div>
                          <span className="hidden sm:inline">收纳原来的 5 个按钮</span>
                        </div>
                      </>
                    )}
                    {searchMode === 'search' && searchResults.groups.length === 0 && (
                      <div className="px-6 py-8 text-center">
                        <div className="text-[12.5px] text-ink-400 mb-2">暂无匹配结果</div>
                        <button
                          onClick={() => { setSearchMode('cmd'); setActiveSearchIdx(0); }}
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-[12.5px] font-semibold shadow-sm hover:shadow-md transition"
                        >
                          <Terminal size={13} />切换到命令面板
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            {liveMode && (
              <motion.span
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="hidden sm:inline-flex items-center gap-1.5 text-[10.5px] sm:text-[11.5px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-full whitespace-nowrap shrink-0 shadow-sm border border-emerald-100/70"
              >
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500 opacity-70 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </span>
                <span className="hidden sm:inline">实时</span><span className="sm:hidden">Live</span>
              </motion.span>
            )}
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowViralHistory(true)}
              className="h-11 px-3 sm:px-3.5 max-sm:w-11 max-sm:px-0 rounded-2xl border border-black/[0.06] bg-gradient-to-br from-amber-50 to-rose-50 hover:from-amber-100 hover:to-rose-100 transition flex items-center gap-2 text-[13px] font-semibold text-amber-700 disabled:opacity-50 shadow-sm shrink-0"
              title="历史爆款 · 按诞生时间倒序"
            >
              <Flame size={15} className="text-amber-600 shrink-0" />
              <span className="hidden sm:inline">历史爆款</span>
              {viralHistory.length > 0 && <span className="text-[10.5px] font-bold tabular-nums px-1.5 py-[2px] rounded-md bg-white text-amber-700 border border-amber-100 min-w-[20px] text-center shadow-sm">{viralHistory.length}</span>}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowDownloads(true)}
              className="h-11 px-3 sm:px-3.5 max-sm:w-11 max-sm:px-0 rounded-2xl border border-black/[0.06] bg-gradient-to-br from-sky-500 to-blue-600 hover:brightness-110 transition flex items-center gap-2 text-[13px] font-semibold text-white disabled:opacity-50 shadow-sm shrink-0"
              title="下载数据采集插件"
            >
              <Download size={15} className="text-white shrink-0" />
              <span className="hidden sm:inline">下载插件</span>
            </motion.button>
            <UserSwitcher
              value={currentUid}
              users={data?.operators || []}
              onChange={setCurrentUid}
              currentUser={currentUser}
              isAdmin={isAdmin}
              onGoAdmin={() => setPageView('admin')}
              onLogout={doLogout}
              onProfile={() => { setPageView('profile'); }}
              onOpenCollector={() => {
                setPageView('profile');
              }}
              onClearAllData={handleClearAllData}
              onDeleteAccount={handleDeleteAccount}
            />
          </div>
        </div>
      </header>

      <main className="max-w-[1480px] mx-auto px-4 sm:px-6 py-5 sm:py-7">
        {showDownloads ? (
          <DownloadsPage onClose={() => setShowDownloads(false)} showToast={showToast} />
        ) : (
          <>
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

        {isAdmin && !effectiveScopeUid && Array.isArray(data?.operatorStats) && data.operatorStats.length > 1 && currentView !== 'platform' && (
          <motion.div
            variants={FADE_UP}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="mb-5 rounded-2xl border border-emerald-100/70 bg-gradient-to-br from-emerald-50/70 via-teal-50/50 to-sky-50/60 shadow-sm overflow-hidden"
          >
            <div className="px-4 sm:px-5 py-3.5 sm:py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Trophy size={14} className="text-emerald-700" /></div>
                  <div>
                    <h2 className="text-[15px] font-semibold text-ink-900 tracking-tight">运营绩效对比 · 排行榜</h2>
                    <p className="text-[11.5px] text-ink-500 mt-0.5">横向对比各运营的账号规模、内容产出与爆款率，点击行可切换到「个人绩效看板」</p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100/70 text-emerald-700">{data.operatorStats.length} 位运营</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...data.operatorStats]
                  .sort((a, b) => ((b.total_followers || 0) + (b.total_members || 0)) - ((a.total_followers || 0) + (a.total_members || 0)))
                  .map((op, i) => {
                    const rankColors = ['from-amber-400 to-orange-500', 'from-slate-400 to-slate-500', 'from-amber-700 to-amber-800', 'from-sky-400 to-indigo-400'];
                    const rc = rankColors[Math.min(i, rankColors.length - 1)];
                    return (
                      <motion.button
                        key={op.operator_uid || `op-${i}`}
                        variants={STAGGER}
                        whileHover={{ y: -2, scale: 1.008 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setCurrentUid(op.operator_uid)}
                        className="text-left rounded-2xl border border-black/[0.05] bg-white/80 hover:bg-white p-3 sm:p-3.5 flex items-start gap-3 shadow-sm transition"
                      >
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${rc} text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm`}>{i + 1}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-[13.5px] text-ink-900 truncate">{op.operator_name || op.operator_uid}</span>
                            {op.role === 'admin' && <span className="text-[9px] font-bold px-1.5 py-[1px] rounded bg-gradient-to-br from-amber-500 to-orange-600 text-white">ADMIN</span>}
                          </div>
                          <div className="text-[11px] text-ink-500 mb-2 flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>📊 账号 {(op.accounts_count || 0) + (op.communities_count || 0)}</span>
                            <span>👥 总覆盖 {formatShort((op.total_followers || 0) + (op.total_members || 0))}</span>
                            <span>💣 爆款率 {(op.bomb_rate || 0).toFixed ? (op.bomb_rate || 0).toFixed(1) : op.bomb_rate}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 w-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                              style={{ width: `${Math.min(100, ((((op.total_followers || 0) + (op.total_members || 0)) / (([...data.operatorStats].reduce((s, x) => Math.max(s, (x.total_followers || 0) + (x.total_members || 0)), 1) || 1))) * 100))}%` }} />
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {currentView !== 'platform' && (
            <motion.div key={viewKey} variants={STAGGER} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.24 }} className="space-y-4 sm:space-y-5">
              <motion.div variants={STAGGER} initial="hidden" whileInView="show" viewport={{ once: true }} className="flex flex-wrap items-start justify-between gap-3 mb-4 sm:mb-5">
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
                <motion.div variants={STAGGER} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 mb-5">
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
                  <motion.div variants={STAGGER} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 mb-5">
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

              {(() => {
                const cal = data?.post_frequency_calendar;
                const calDays = Array.isArray(cal?.days) ? cal.days : [];
                const calPlats = Array.isArray(cal?.platforms) ? cal.platforms : [];
                const calHours = Array.isArray(cal?.hourly_distribution) ? cal.hourly_distribution : [];
                if (calDays.length === 0 && calPlats.length === 0 && calHours.length === 0) return null;
                return <PostFrequencySection calendar={cal} />;
              })()}

              {(stockMonitorList.length > 0 || isAdmin) && (
                <motion.div variants={STAGGER} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.25 }} className="mb-6">
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-[#4263EB]/10 flex items-center justify-center"><PlatformLogo platformKeyOrName="stocktwits" size={14} /></div>
                      <h2 className="text-[15px] font-semibold text-ink-900 tracking-tight">Stocktwits · 股票情绪监测</h2>
                      <span className="text-[12px] text-ink-400">{stockMonitorList.length} 只股票</span>
                    </div>
                    {isAdmin && (
                      <button onClick={() => { setAdminInitialTab('stocks'); setPageView('admin'); }} className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:brightness-105 text-white text-[12.5px] font-semibold flex items-center gap-1.5 shadow-sm"><Plus size={13} />添加监控股票</button>
                    )}
                  </div>
                  {stockMonitorList.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stockMonitorList.map((r, idx) => <StocktwitsCard key={`st-${r.account || r.id}`} r={r} idx={idx} onOpenDetail={setDetailRecord} onNavigateOperator={navigateToOperator} />)}
                    </div>
                  ) : (
                    <motion.div variants={FADE_UP} className="rounded-2xl border border-dashed border-[#4263EB]/20 bg-[#4263EB]/[0.03] p-6 flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#4263EB]/10 flex items-center justify-center shrink-0"><TrendingUp size={22} className="text-[#4263EB]" /></div>
                      <div className="min-w-0 flex-1 text-center sm:text-left">
                        <div className="text-[14px] font-semibold text-ink-900">尚未添加任何股票到官方监控清单</div>
                        <div className="text-[12px] text-ink-500 mt-1">{isAdmin ? '点击右上角「+ 添加监控股票」按钮添加股票代码；采集插件持有人浏览对应 Stocktwits 页面≥3秒时，会自动回填情绪和最新帖子数据（严格方案 A：清单外股票一律禁止入库）。' : '请联系管理员添加需要监控的股票代码，清单内股票才会显示在这里。'}</div>
                      </div>
                      {!isAdmin && (
                        <button onClick={() => setShowDownloads(true)} className="h-9 px-3.5 rounded-xl bg-[#4263EB] hover:bg-[#3551c5] text-white text-[12.5px] font-semibold flex items-center gap-1.5 shrink-0"><Download size={13} />获取采集器</button>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {(redditMonitorList.length > 0 || isAdmin) && (
                <motion.div variants={STAGGER} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.25 }} className="mb-6">
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-[#FF4500]/10 flex items-center justify-center"><PlatformLogo platformKeyOrName="reddit" size={15} /></div>
                      <h2 className="text-[15px] font-semibold text-ink-900 tracking-tight">Reddit · 社区活跃度监测</h2>
                      <span className="text-[12px] text-ink-400">{redditMonitorList.length} 个 Subreddit</span>
                    </div>
                    {isAdmin && (
                      <button onClick={() => { setAdminInitialTab('communities'); setPageView('admin'); }} className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-rose-500 to-red-500 hover:brightness-105 text-white text-[12.5px] font-semibold flex items-center gap-1.5 shadow-sm"><Plus size={13} />添加监控社区</button>
                    )}
                  </div>
                  {redditMonitorList.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {redditMonitorList.map((r, idx) => <RedditCard key={`rd-${r.account || r.id}`} r={r} idx={idx} onOpenDetail={setDetailRecord} onNavigateOperator={navigateToOperator} />)}
                    </div>
                  ) : (
                    <motion.div variants={FADE_UP} className="rounded-2xl border border-dashed border-[#FF4500]/20 bg-[#FF4500]/[0.03] p-6 flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#FF4500]/10 flex items-center justify-center shrink-0"><MessageSquare size={22} className="text-[#FF4500]" /></div>
                      <div className="min-w-0 flex-1 text-center sm:text-left">
                        <div className="text-[14px] font-semibold text-ink-900">尚未添加任何 Reddit 社区到官方监控清单</div>
                        <div className="text-[12px] text-ink-500 mt-1">{isAdmin ? '点击右上角「+ 添加监控社区」按钮添加 Subreddit（社区），不是个人账号；采集插件持有人浏览对应 reddit.com/r/xxx 页面≥3秒时，会自动回填最新讨论与热度（严格方案 A：清单外社区一律禁止入库）。' : '请联系管理员添加需要监控的 Reddit 社区，清单内社区才会显示在这里。'}</div>
                      </div>
                      {!isAdmin && (
                        <button onClick={() => setShowDownloads(true)} className="h-9 px-3.5 rounded-xl bg-[#FF4500] hover:brightness-95 text-white text-[12.5px] font-semibold flex items-center gap-1.5 shrink-0"><Download size={13} />获取采集器</button>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}

              <motion.div variants={STAGGER} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
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
                  <div className="h-[290px] sm:h-[340px]">
                    {loading && !data ? (
                      <div className="h-full flex items-center justify-center"><RefreshCw size={20} className="animate-spin text-ink-300" /></div>
                    ) : (() => {
                      const rawPie = scopeDerivedCharts ? scopeDerivedCharts.platformTraffic : (data?.platformTraffic || []);
                      const merged = {};
                      for (const p of rawPie || []) {
                        const pkey = p.key || p.platform;
                        const key = pkey && PLATFORM_META[pkey] ? pkey : Object.keys(PLATFORM_META).find(k => PLATFORM_META[k].name === p.name);
                        if (!key) continue;
                        const meta = PLATFORM_META[key];
                        if (!merged[key]) merged[key] = { key, name: meta.name, value: 0, color: meta.color };
                        merged[key].value += Number(p.value || 0);
                      }
                      for (const meta of Object.values(PLATFORM_META)) {
                        if (!merged[meta.key]) merged[meta.key] = { key: meta.key, name: meta.name, value: 0, color: meta.color };
                      }
                      const normalized = Object.values(merged).sort((a, b) => (b.value || 0) - (a.value || 0));
                      return <TrafficPie data={normalized} activeName={activePie} setActiveName={setActivePie} onNavigatePlatform={navigateToPlatform} />;
                    })()}
                  </div>
                </motion.div>
              </motion.div>

              <motion.div variants={FADE_UP} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} data-role="records-table-wrap">
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
        </>
        )}
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
            dismissViralAlertForever(activeViralAlert);
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
