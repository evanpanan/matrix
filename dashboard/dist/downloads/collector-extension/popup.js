/* Matrix Collector · popup.js */

const $ = (s) => document.querySelector(s);
const fmt = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (d.toString() === 'Invalid Date') return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};
const statePill = $('#statePill');
const stateText = $('#stateText');
const queueBadge = $('#queueBadge');
const opSelect = $('#opSelect');
const machineName = $('#machineName');
const machineId = $('#machineId');
const serverUrl = $('#serverUrl');
const webhook = $('#webhook');
const errorBox = $('#errorBox');

function setStatus(level, text) {
  stateText.textContent = text;
  if (level === 'ok') {
    statePill.className = 'pill bg-emerald-50 text-emerald-700';
    statePill.querySelector('.dot').style.background = '#10b981';
  } else if (level === 'warn') {
    statePill.className = 'pill bg-amber-50 text-amber-700';
    statePill.querySelector('.dot').style.background = '#f59e0b';
  } else {
    statePill.className = 'pill bg-rose-50 text-rose-700';
    statePill.querySelector('.dot').style.background = '#f43f5e';
  }
}

async function refreshStatus() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'MATRIX_GET_STATUS' });
    if (!r || !r.ok) throw new Error('status_fetch_failed');
    const cfg = r.config || {};
    const st = r.status || {};
    opSelect.innerHTML = '';
    (cfg.operators || []).forEach(op => {
      const o = document.createElement('option');
      o.value = op.operator_uid;
      o.textContent = `${op.operator_name}${op.role === 'admin' ? ' · 管理员' : ''}`;
      if (op.operator_uid === cfg.operator_uid) o.selected = true;
      opSelect.appendChild(o);
    });
    machineName.value = cfg.machine_name || '';
    machineId.value = cfg.machine_id || '';
    serverUrl.value = cfg.server_url || '';
    webhook.value = cfg.webhook_url || '';
    queueBadge.textContent = String(r.queue_length || 0);
    $('#lastHb').textContent = fmt(st.last_hb_at);
    $('#lastFlush').textContent = fmt(st.last_flush_at);
    $('#lastCollect').textContent = fmt(st.last_collect_at);
    $('#connStatus').textContent = st.heartbeat === 'ok' ? '已连接' : (st.heartbeat === 'pending' ? '未检查' : '连接失败');
    if (st.last_error) {
      errorBox.classList.remove('hidden');
      errorBox.textContent = st.last_error;
    } else {
      errorBox.classList.add('hidden');
    }
    if (st.heartbeat === 'ok' && st.collect !== 'error') setStatus('ok', '正在采集');
    else if (st.heartbeat === 'pending' && !st.last_error) setStatus('warn', '初始化中');
    else setStatus('bad', '异常 · 检查配置');
  } catch (e) {
    setStatus('bad', 'Service Worker 未就绪');
    errorBox.classList.remove('hidden');
    errorBox.textContent = e && e.message ? e.message : String(e);
  }
}

$('#saveBtn').addEventListener('click', async () => {
  const patch = {
    operator_uid: opSelect.value,
    operator_name: (opSelect.options[opSelect.selectedIndex]?.textContent || '').replace(/\s·.*$/, ''),
    machine_name: machineName.value.trim() || `运营 - ${navigator.platform || 'Browser'}`,
    server_url: serverUrl.value.trim() || 'http://localhost:8000',
    webhook_url: webhook.value.trim(),
  };
  await chrome.runtime.sendMessage({ type: 'MATRIX_SET_CONFIG', patch });
  await refreshStatus();
  const pill = document.createElement('div');
  pill.className = 'fixed top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[12px] px-3 py-1.5 rounded-full shadow-lg z-50';
  pill.textContent = '✓ 配置已保存';
  document.body.appendChild(pill);
  setTimeout(() => pill.remove(), 1200);
});

$('#triggerBtn').addEventListener('click', async () => {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'MATRIX_TRIGGER_CURRENT' });
    if (r && r.ok) {
      alert(`当前页已触发采集 ✅\n\n预计 1 秒后会完成解析并入队列，稍后点击【立即同步全部】即可上报。`);
    } else {
      alert(`当前页无法采集：${(r && r.error) || '请打开目标平台页面后再采集（例如小红书创作者中心 / X 个人主页 / 抖音创作者中心）'}`);
    }
  } catch (e) {
    alert(`采集失败：${e && e.message ? e.message : String(e)}`);
  }
  setTimeout(refreshStatus, 1500);
});

$('#flushBtn').addEventListener('click', async () => {
  const btn = $('#flushBtn');
  btn.disabled = true;
  const oldHTML = btn.innerHTML;
  btn.innerHTML = '<span class="inline-flex items-center gap-1.5"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>同步中…</span>';
  try {
    const r = await chrome.runtime.sendMessage({ type: 'MATRIX_FLUSH' });
    await chrome.runtime.sendMessage({ type: 'MATRIX_HEARTBEAT' });
    await refreshStatus();
    if (r && r.ok) {
      alert(`✅ 同步完成：本次发送 ${r.sent} 条，剩余待同步 ${r.response && r.response.pending !== undefined ? r.response.pending : queueBadge.textContent} 条`);
    } else {
      alert(`⚠️ 同步失败：${(r && r.error) || '未知错误'}\n\n请检查后端服务地址是否正确，以及后端是否已启动。`);
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHTML;
  }
});

refreshStatus();
setInterval(refreshStatus, 3000);
