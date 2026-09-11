import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Cpu, Server, AlertOctagon, BellRing, Check,
  Globe2, MonitorDot, Save, Send, Fingerprint, Wifi, WifiOff,
  MessageSquare, Users as UsersIcon, Hash, ShieldCheck,
} from 'lucide-react';
import { sanitizeUrl } from './lib/api.js';

dayjs.extend(relativeTime);

const FADE_UP = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
};

function timeFromNow(iso) {
  if (!iso) return '—';
  return dayjs(iso).fromNow();
}

const WEBHOOK_FIELDS = [
  {
    key: 'feishu',
    label: '飞书群机器人 Webhook',
    placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx',
    icon: MessageSquare,
    color: '#3370FF',
  },
  {
    key: 'wecom',
    label: '企业微信 Webhook',
    placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx',
    icon: UsersIcon,
    color: '#07C160',
  },
  {
    key: 'telegram',
    label: 'Telegram Bot Webhook',
    placeholder: 'https://api.telegram.org/bot123456:ABC/sendMessage',
    icon: Hash,
    color: '#229ED9',
  },
];

const TRIGGER_FIELDS = [
  { key: 'viral_post', label: '诞生爆款内容（互动量 > 5K）', hint: '当作品互动率进入全站前 12% 且曝光>阈值' },
  { key: 'abnormal_count', label: '账号 / 社区掉线或异常数 ≥ 2', hint: '包含心跳超时、数据为 0、登录态失效等场景' },
];

function MachineCard({ machine, onRemind, onToast }) {
  const online = machine.status === 'online';
  const [reminding, setReminding] = useState(false);
  const opAvatarColor = ['#6366f1,#8b5cf6', '#10b981,#14b8a6', '#f59e0b,#ef4444'][
    ['李运营', '王运营', '赵运营'].indexOf(machine.operator_name) === -1
      ? 0
      : ['李运营', '王运营', '赵运营'].indexOf(machine.operator_name)
  ] || '#6366f1,#8b5cf6';
  const [a, b] = opAvatarColor.split(',');
  return (
    <motion.div
      variants={FADE_UP}
      className={`rounded-2xl border bg-white shadow-card p-4 transition relative overflow-hidden ${online ? 'border-black/[0.04]' : 'border-rose-200/70 bg-gradient-to-br from-rose-50/70 to-white'}`}
    >
      {!online && (
        <div className="absolute top-0 right-0 h-20 w-20 -mt-8 -mr-8 rounded-full bg-rose-400/10 blur-2xl" />
      )}
      <div className="flex items-start justify-between gap-3 relative">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
            style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
          >
            {online
              ? <Server size={18} className="text-white" />
              : <AlertOctagon size={18} className="text-white" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-ink-900 tracking-tight truncate">{machine.machine_name}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500">
              <span className="inline-flex items-center gap-1">
                <Fingerprint size={11} />
                绑定 {machine.fingerprint_browser_count} 个指纹浏览器实例
              </span>
              <span className="inline-flex items-center gap-1">
                <MonitorDot size={11} className={online ? 'text-emerald-500' : 'text-rose-500'} />
                {online ? '在线运行中' : '已掉线'} · 最后心跳：{timeFromNow(machine.last_heartbeat_iso)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            title={online ? '网络在线' : '无心跳'}
            className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]' : 'bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.18)] animate-pulse'}`}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {online ? <><Wifi size={11} /> 网络延迟 18ms · 健康</> : <><WifiOff size={11} /> 采集数据可能延迟</>}
        </div>
        {!online ? (
          <button
            type="button"
            onClick={() => {
              setReminding(true);
              setTimeout(() => setReminding(false), 1500);
              onRemind?.(machine);
            }}
            className={`h-9 px-3 rounded-xl transition text-[12.5px] font-semibold flex items-center gap-1.5 shrink-0 ${reminding ? 'bg-emerald-600 text-white' : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/70'}`}
          >
            {reminding ? <><Check size={13} /> 已提醒</> : <><BellRing size={13} /> 一键提醒运营</>}
          </button>
        ) : (
          <div className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-400">
            <ShieldCheck size={11} /> 无需操作
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function CollectorHealthModal({ open, onClose, collectorMachines = [], onToast = () => {} }) {
  const [tab, setTab] = useState('nodes');
  const [cfg, setCfg] = useState({
    urls: { feishu: '', wecom: '', telegram: '' },
    triggers: { viral_post: true, abnormal_count: true },
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [invalidUrls, setInvalidUrls] = useState({});

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem('matrix_webhook_cfg');
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          setCfg({
            urls: { feishu: '', wecom: '', telegram: '', ...(p.urls || {}) },
            triggers: { viral_post: true, abnormal_count: true, ...(p.triggers || {}) },
          });
        }
      }
    } catch (e) {}
  }, [open]);

  const validUrl = (u) => {
    const s = String(u || '').trim();
    if (!s) return true;
    return sanitizeUrl(s) !== '#';
  };

  const onlineCount = useMemo(() => collectorMachines.filter(m => m.status === 'online').length, [collectorMachines]);

  const handleSave = () => {
    const bad = {};
    WEBHOOK_FIELDS.forEach(f => {
      const u = cfg.urls[f.key];
      if (u && !validUrl(u)) bad[f.key] = true;
    });
    setInvalidUrls(bad);
    if (Object.keys(bad).length) {
      onToast('⚠️ Webhook URL 仅允许 https:// 协议，请修正后保存', 'warn');
      return;
    }
    setSaving(true);
    setTimeout(() => {
      localStorage.setItem('matrix_webhook_cfg', JSON.stringify(cfg));
      setSaving(false);
      onToast('✅ 告警配置已保存', 'ok');
    }, 500);
  };

  const handleTest = () => {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      const targets = WEBHOOK_FIELDS.filter(f => cfg.urls[f.key] && validUrl(cfg.urls[f.key])).map(f => f.label.split(' ')[0]);
      if (!targets.length) {
        onToast('⚠️ 请先配置至少一个 Webhook URL', 'warn');
        return;
      }
      onToast(`📨 测试消息已发送 → ${targets.join('、')}，请到客户端确认`, 'ok');
    }, 700);
  };

  const handleRemind = (m) => {
    const name = m.operator_name || m.machine_name.split('-')[0];
    onToast(`🔔 已提醒 ${name} 检查设备 ${m.machine_name} 的指纹浏览器状态`, 'ok');
  };

  if (!open) return null;

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
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{ width: 'min(96vw, 68rem)' }}
            className="max-h-[88vh] overflow-hidden rounded-3xl bg-[#fafafa] shadow-[0_40px_120px_rgba(0,0,0,0.22)] border border-black/[0.06] flex flex-col"
          >
          <motion.div
            variants={FADE_UP}
            initial="hidden"
            animate="show"
            className="px-5 sm:px-6 py-4 sm:py-4.5 border-b border-black/[0.04] bg-white/70 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 max-sm:w-11 max-sm:h-11 rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-500 to-emerald-500 flex items-center justify-center shadow-inner shadow-sky-900/30 shrink-0">
                  <Cpu size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] sm:text-[15px] font-bold tracking-tight text-ink-900">
                    采集节点 & 告警配置
                  </div>
                  <div className="text-[11.5px] text-ink-500 mt-0.5 truncate">
                    节点 {collectorMachines.length} · 在线 {onlineCount} · 掉线 {collectorMachines.length - onlineCount} · Webhook 支持飞书 / 企微 / Telegram
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                title="关闭"
                className="h-9 w-9 max-sm:h-11 max-sm:w-11 rounded-xl border border-black/[0.06] bg-white hover:bg-ink-50 hover:text-ink-800 text-ink-500 transition flex items-center justify-center shrink-0"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-4 inline-flex rounded-xl bg-ink-50/70 p-1 gap-1">
              <button
                type="button"
                onClick={() => setTab('nodes')}
                className={`px-3.5 sm:px-4 h-9 rounded-lg text-[12.5px] font-semibold transition flex items-center gap-1.5 ${tab === 'nodes' ? 'bg-white text-ink-900 shadow-sm border border-black/[0.04]' : 'text-ink-500 hover:text-ink-800'}`}
              >
                <Server size={13} /> 采集节点
                <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-full ${tab === 'nodes' ? 'bg-indigo-50 text-indigo-700' : 'bg-black/[0.04] text-ink-500'}`}>{collectorMachines.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('webhook')}
                className={`px-3.5 sm:px-4 h-9 rounded-lg text-[12.5px] font-semibold transition flex items-center gap-1.5 ${tab === 'webhook' ? 'bg-white text-ink-900 shadow-sm border border-black/[0.04]' : 'text-ink-500 hover:text-ink-800'}`}
              >
                <BellRing size={13} /> 告警配置
              </button>
            </div>
          </motion.div>

          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {tab === 'nodes' ? (
                <motion.div
                  key="nodes"
                  variants={FADE_UP}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, y: 4 }}
                  className="p-4 sm:p-6"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {collectorMachines.map((m, i) => (
                      <MachineCard
                        key={m.machine_id}
                        machine={m}
                        onRemind={handleRemind}
                        onToast={onToast}
                      />
                    ))}
                  </div>
                  {!collectorMachines.length && (
                    <div className="text-center text-ink-400 text-sm py-20">暂无节点数据</div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="webhook"
                  variants={FADE_UP}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, y: 4 }}
                  className="p-4 sm:p-6 max-w-[780px] mx-auto"
                >
                  <div className="rounded-2xl border border-black/[0.04] bg-white shadow-card p-5 sm:p-6 space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                          <Globe2 size={13} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-[14.5px] font-bold text-ink-900 tracking-tight">Webhook URL 配置</h3>
                          <p className="text-[11.5px] text-ink-500 mt-0.5">仅允许 https:// 协议，可单独或组合配置多个 IM 通道。</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {WEBHOOK_FIELDS.map(f => {
                          const Icon = f.icon;
                          const bad = invalidUrls[f.key];
                          return (
                            <label key={f.key} className="block">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0" style={{ background: `${f.color}15`, color: f.color }}>
                                  <Icon size={12} />
                                </span>
                                <span className="text-[12.5px] font-semibold text-ink-800">{f.label}</span>
                              </div>
                              <input
                                type="url"
                                spellCheck={false}
                                autoComplete="off"
                                value={cfg.urls[f.key] || ''}
                                onChange={e => {
                                  setCfg(c => ({ ...c, urls: { ...c.urls, [f.key]: e.target.value } }));
                                  if (invalidUrls[f.key]) setInvalidUrls(prev => ({ ...prev, [f.key]: false }));
                                }}
                                placeholder={f.placeholder}
                                className={`w-full h-10 px-3 rounded-xl border bg-white text-[13px] text-ink-800 placeholder:text-ink-300 transition focus:outline-none focus:ring-2 focus:ring-indigo-400/40 ${bad ? 'border-rose-300 bg-rose-50/50 focus:ring-rose-300/40' : 'border-black/[0.06] focus:border-indigo-400/50'}`}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center">
                          <BellRing size={13} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-[14.5px] font-bold text-ink-900 tracking-tight">触发条件</h3>
                          <p className="text-[11.5px] text-ink-500 mt-0.5">至少选择 1 项才会推送有效事件。</p>
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        {TRIGGER_FIELDS.map(tg => (
                          <label
                            key={tg.key}
                            className="flex items-start gap-3 p-3 rounded-xl border border-black/[0.04] bg-ink-50/40 hover:bg-ink-50 transition cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={!!cfg.triggers[tg.key]}
                              onChange={e => setCfg(c => ({ ...c, triggers: { ...c.triggers, [tg.key]: e.target.checked } }))}
                              className="mt-0.5 h-4 w-4 accent-indigo-600 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-ink-800">{tg.label}</div>
                              <div className="text-[11.5px] text-ink-500 mt-0.5">{tg.hint}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleTest}
                        disabled={testing}
                        className={`h-10 max-sm:h-11 px-4 sm:px-4 rounded-xl transition text-[13px] font-semibold flex items-center gap-1.5 border ${testing ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700'}`}
                      >
                        <Send size={13} /> {testing ? '发送中…' : '测试发送'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className={`h-10 max-sm:h-11 px-4 sm:px-5 rounded-xl transition text-[13px] font-semibold flex items-center gap-1.5 shadow-sm ${saving ? 'bg-emerald-600 text-white' : 'bg-gradient-to-br from-indigo-600 to-violet-600 hover:brightness-110 text-white'}`}
                      >
                        <Save size={13} /> {saving ? '已保存' : '保存配置'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </motion.div>
        </div>
      </>
    </AnimatePresence>
  );
}
