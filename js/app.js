// OP本：进货发票付款记录
import * as db from './db.js';
import { toImages, makeAvatar } from './photo.js';
import { $, h, today, daysSince, cnDate, shortDate, monthKey, cnMonth, topDate, money, bigMoney, parseAmount, normName, keyName } from './util.js';

const VERSION = '1.5.1';

// ---------- 图标（与到期提醒同风格：24 网格细线） ----------
const IC = {
  tabUnpaid: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/>',
  tabSup: '<path d="M4 9.5V19h16V9.5"/><path d="M3 9.5L4.8 5h14.4L21 9.5c0 1.4-1.1 2.3-2.4 2.3s-2.4-.9-2.4-2.3c0 1.4-1.1 2.3-2.4 2.3S11.4 10.9 11.4 9.5c0 1.4-1.1 2.3-2.4 2.3S6.6 10.9 6.6 9.5c0 1.4-1.1 2.3-2.4 2.3"/><path d="M10 19v-4.5h4V19"/>',
  tabPaid: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16.2 9.6"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  camera: '<path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  photo: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 15.5l-4.5-4.5-8.5 8.5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5h10L18 7M9.5 7V4.5h5V7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>'
};
const ic = (n, s = 22, w = 1.6) => `<svg class="ico" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;
document.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = ic(el.dataset.ic, el.dataset.ic === 'add' ? 22 : 24, el.dataset.ic === 'add' ? 2.2 : 1.6); });

// ---------- 状态 ----------
const S = {
  user: null, shopIds: [], shopId: null, shop: null, me: { uid: '', name: '' },
  sups: {}, unpaid: [], avatars: {}, meta: { pending: false, fromCache: true }, ready: { sups: false, unpaid: false },
  paidN: 60
};
let unsubs = [];         // 店铺级监听
let viewUnsub = null;     // 当前页面的监听
let screenShown = '';

function show(name) {
  screenShown = name;
  ['boot', 'login', 'msg', 'app'].forEach(n => { $('s-' + n).hidden = n !== name; });
}
function msg(title, text, btns = []) {
  $('msg-title').textContent = title;
  $('msg-text').innerHTML = text;
  const b = $('msg-btns'); b.innerHTML = '';
  btns.forEach(x => {
    const el = document.createElement(x.href ? 'a' : 'button');
    el.className = 'btn block ' + (x.primary ? 'primary' : '');
    el.textContent = x.label;
    if (x.href) el.href = x.href; else el.onclick = x.fn;
    b.appendChild(el);
  });
  show('msg');
}

// ---------- toast / 弹层 / 看大图 ----------
let toastEl = null, toastTimer = null;
function toast(m, opt = {}) {
  toastEl && toastEl.remove(); clearTimeout(toastTimer);
  const t = document.createElement('div');
  t.className = 'toast' + (opt.err ? ' err' : '');
  t.innerHTML = `<span>${h(m)}</span>${opt.undo ? '<button>撤销</button>' : ''}`;
  if (opt.undo) t.querySelector('button').onclick = () => { t.remove(); opt.undo(); };
  document.body.appendChild(t); toastEl = t;
  toastTimer = setTimeout(() => t.remove(), opt.undo ? 6000 : opt.err ? 3500 : 2000);
}
const fail = e => { console.error(e); toast(errText(e), { err: true }); };
function errText(e) {
  const c = e && e.code || '';
  if (c.includes('permission-denied')) return '没有权限：请确认已在店铺日账里是「管理员」，并更新了数据库规则';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found') return '邮箱或密码不对';
  if (c === 'auth/email-already-in-use') return '这个邮箱已经注册过，直接登录';
  if (c === 'auth/weak-password') return '密码至少 6 位';
  if (c === 'auth/invalid-email') return '邮箱格式不对';
  if (c === 'auth/unauthorized-domain') return '网址还没加到 Firebase 授权域名';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
  if (c === 'op/google-in-pwa') return '主屏幕版里 Google 登录不稳定：请用邮箱登录（第一次点「忘记密码」给你的 Gmail 设个密码）';
  if (c === 'auth/network-request-failed') return '网络不通，稍后再试';
  return (e && e.message) || '出错了，再试一次';
}
let sheetEl = null;
function sheet(html, bind) {
  closeSheet();
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet-bg"></div><div class="sheet">${html}</div>`;
  w.querySelector('.sheet-bg').onclick = closeSheet;
  document.body.appendChild(w); sheetEl = w;
  bind && bind(w.querySelector('.sheet'));
}
function closeSheet() { sheetEl && sheetEl.remove(); sheetEl = null; }
function confirmSheet(title, sub, okLabel, danger) {
  return new Promise(res => {
    sheet(`<h3>${h(title)}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}<div class="btns"><button class="btn" data-a="no">取消</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="ok">${h(okLabel)}</button></div>`, s => {
      s.querySelector('[data-a=no]').onclick = () => { closeSheet(); res(false); };
      s.querySelector('[data-a=ok]').onclick = () => { closeSheet(); res(true); };
    });
  });
}
async function viewer(pidOrImg) {
  const v = document.createElement('div');
  v.className = 'viewer';
  v.innerHTML = '<button class="close">×</button><div class="muted">加载中…</div>';
  v.onclick = e => { if (e.target === v || e.target.classList.contains('close')) v.remove(); };
  document.body.appendChild(v);
  const img = pidOrImg.startsWith('data:') ? pidOrImg : await db.getPhoto(S.shopId, pidOrImg);
  if (!v.isConnected) return;
  v.querySelector('div').outerHTML = img ? `<img src="${img}" alt="">` : '<div class="muted">照片读不到（可能还没同步）</div>';
  const im = v.querySelector('img'); if (im) im.onclick = () => v.remove();
}

// ---------- 主题 ----------
function setTheme(t) {
  try { if (t) localStorage.setItem('theme', t); else localStorage.removeItem('theme'); } catch (e) {}
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
const curTheme = () => { try { return localStorage.getItem('theme') || ''; } catch (e) { return ''; } };

// ---------- 启动 ----------
db.init();
if ('serviceWorker' in navigator && !db.EMU) navigator.serviceWorker.register('sw.js').catch(() => {});

let registerMode = false;
$('btn-google').onclick = () => db.loginGoogle().catch(e => { const t = errText(e); if (t) toast(t, { err: true }); });
$('lnk-register').onclick = () => {
  registerMode = !registerMode;
  $('btn-login').textContent = registerMode ? '注册并登录' : '登录';
  $('lnk-register').textContent = registerMode ? '已有账号？登录' : '没有账号？注册';
};
$('btn-login').onclick = async () => {
  const email = $('in-email').value, pw = $('in-pw').value;
  if (!email || !pw) return toast('请填邮箱和密码');
  const b = $('btn-login'); b.disabled = true;
  try { await (registerMode ? db.registerEmail(email, pw) : db.loginEmail(email, pw)); }
  catch (e) { const t = errText(e); if (t) toast(t, { err: true }); }
  b.disabled = false;
};
$('lnk-forgot').onclick = async () => {
  const email = $('in-email').value;
  if (!email) return toast('先在上面填邮箱');
  try { await db.resetPassword(email); toast('重置密码邮件已发送，请查收'); } catch (e) { toast(errText(e), { err: true }); }
};

const RIZHANG = '../dianpu-rizhang/';
function stopShop() { unsubs.forEach(u => u()); unsubs = []; stopView(); }
function stopView() { if (viewUnsub) { viewUnsub(); viewUnsub = null; } }

db.onUser(async u => {
  stopShop();
  S.user = u; firstData = true;
  if (!u) { show('login'); return; }
  show('boot');
  let r;
  try { r = await db.myShops(u.uid); }
  catch (e) { msg('连不上数据库', '检查一下网络，然后重新打开。', [{ label: '重试', primary: true, fn: () => location.reload() }]); return; }
  S.shopIds = r.ids;
  let saved = null; try { saved = localStorage.getItem('opben.shop'); } catch (e) {}
  const sid = r.ids.includes(saved) ? saved : r.current;
  if (!sid) {
    msg('还没加入店铺', 'OP本 和「店铺日账」共用店铺和成员账号。<br>请先在店铺日账里新建店铺，或用邀请码加入。<br><span class="small">当前账号：' + h(u.email || '') + '</span>',
      [{ label: '打开店铺日账', primary: true, href: RIZHANG }, { label: '我已加入，刷新', fn: () => location.reload() }, { label: '换个账号', fn: () => db.logout() }]);
    return;
  }
  openShop(sid);
});

function openShop(sid) {
  stopShop();
  S.shopId = sid; S.shop = null; S.sups = {}; S.avatars = {}; S.unpaid = []; S.ready = { sups: false, unpaid: false };
  try { localStorage.setItem('opben.shop', sid); } catch (e) {}
  const onErr = e => {
    if (e && (e.code === 'permission-denied' || e.code === 'not-found')) noAccess();
    else console.error(e);
  };
  unsubs.push(db.watchShop(sid, shop => {
    S.shop = shop;
    const uid = S.user.uid, m = (shop.members || {})[uid] || {};
    if (!(shop.memberIds || []).includes(uid)) return noAccess();
    if (shop.owner !== uid && m.role === 'staff') return noAccess(true);
    S.me = { uid, name: m.name || (S.user.email || '').split('@')[0] || '我' };
    drawMembers(); drawProfile();
    if (unsubs.length === 1) startData(sid, onErr);
  }, onErr));
}
function startData(sid, onErr) {
  unsubs.push(db.watchAvatars(sid, m => { S.avatars = m; avatarsChanged(); }));
  unsubs.push(db.watchSuppliers(sid, m => { S.sups = m; S.ready.sups = true; dataChanged(); }, onErr));
  unsubs.push(db.watchUnpaid(sid, (list, meta) => { S.unpaid = list; S.meta = meta; S.ready.unpaid = true; dataChanged(); }, onErr));
}
function noAccess(isStaff) {
  stopShop();
  const name = S.shop && S.shop.name ? '「' + h(S.shop.name) + '」' : '这家店';
  if (isStaff) {
    msg('需要「管理员」权限', '你在' + name + '是「店员」，看不到进货付款。<br>请店主在 店铺日账 → 店铺 里把你改成「管理员」。',
      [{ label: '我已改好，刷新', primary: true, fn: () => location.reload() }, { label: '打开店铺日账', href: RIZHANG }, { label: '换个账号', fn: () => db.logout() }]);
  } else {
    msg('打不开这家店', '可能是数据库规则还没更新，或者你已不在' + name + '里。<br>按「使用说明」第 2 步更新规则后再刷新。',
      [{ label: '刷新', primary: true, fn: () => location.reload() }, { label: '换个账号', fn: () => db.logout() }]);
  }
}

let firstData = true;
function dataChanged() {
  if (!S.ready.sups || !S.ready.unpaid) return;
  if (screenShown !== 'app') { show('app'); }
  if (firstData) { firstData = false; route(); return; }
  if (cur && cur.live) cur.render();
  else { updateSync(); if (location.hash.startsWith('#/me')) drawProfile(); }
}

// ---------- 修改记录的文字 ----------
const LG = (action, text, ref) => ({ me: S.me, action, text, ref: ref || '' });
const invDesc = (supN, amount, no) => `${supN} ${money(amount)} lei${no ? '（No. ' + no + '）' : ''}`;

// ---------- 计算 ----------
const supName = (id, fallback) => (S.sups[id] && S.sups[id].name) || fallback || '（未知供应商）';
const supDays = id => (S.sups[id] && S.sups[id].days) || 30;
// 状态：expired 超期 / soon 快到（还剩 ≤5 天）/ ok
function level(inv) {
  const d = daysSince(inv.date), lim = supDays(inv.supplierId);
  if (d > lim) return 'expired';
  if (d >= lim - 5) return 'soon';
  return '';
}
function groups() {
  const g = {};
  S.unpaid.forEach(i => {
    const k = i.supplierId;
    (g[k] = g[k] || { id: k, name: supName(k, i.supplierName), list: [], sum: 0, over: 0, oldest: 0 }).list.push(i);
  });
  return Object.values(g).map(x => {
    x.list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    x.sum = oweOf(x.list);
    x.over = x.list.filter(i => level(i) === 'expired').length;
    x.oldest = daysSince(x.list[0].date);
    x.lv = x.over ? 'expired' : x.list.some(i => level(i) === 'soon') ? 'soon' : '';
    return x;
  }).sort((a, b) => (b.over - a.over) || (b.oldest - a.oldest));
}
const sumOf = l => l.reduce((s, i) => s + i.amount, 0);
const oweOf = l => l.reduce((s, i) => s + (i.owe != null ? i.owe : i.amount), 0); // 还欠多少（现金付了一部分的按剩下的算）
// 已付的每一笔：OP 整张付清算一笔；现金每次付的算一笔
function payEvents(invs) {
  const ev = [];
  invs.forEach(inv => {
    if (inv.cashPays && inv.cashPays.length) {
      let done = 0;
      inv.cashPays.forEach((p, n) => {
        done += p.amt;
        ev.push({ inv, amount: p.amt, date: p.date, by: p.by, method: 'cash', n: n + 1, cnt: inv.cashPays.length,
          left: Math.max(0, Math.round((inv.amount - done) * 100) / 100), final: inv.paid && n === inv.cashPays.length - 1 });
      });
    } else if (inv.paid) {
      ev.push({ inv, amount: inv.amount, date: inv.paidDate, by: inv.paidBy, method: inv.method, n: 1, cnt: 1, left: 0, final: true });
    }
  });
  return ev.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.inv.date.localeCompare(a.inv.date));
}

// ---------- 路由 ----------
let cur = null;
window.addEventListener('hashchange', route);
function route() {
  if (screenShown !== 'app') return;
  stopView(); closeSheet();
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const q = new URLSearchParams(qs || '');
  const p = path.split('/').filter(Boolean);
  let tab = 'home';
  if (!p.length) cur = { live: true, render: home };
  else if (p[0] === 'new') { tab = 'new'; cur = { render: () => form(null, q.get('s')) }; }
  else if (p[0] === 'edit') { tab = ''; cur = { render: () => form(p[1]) }; }
  else if (p[0] === 'inv') { tab = ''; cur = { render: () => detail(p[1]) }; }
  else if (p[0] === 'sup' && p[1]) { tab = 'sup'; cur = { render: () => supDetail(p[1]) }; }
  else if (p[0] === 'sup') { tab = 'sup'; cur = { live: true, render: supList }; }
  else if (p[0] === 'paid') { tab = 'paid'; cur = { render: paidView }; }
  else if (p[0] === 'me') { tab = 'me'; cur = { render: settings }; }
  else { location.hash = '#/'; return; }
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  cur.render();
}
const view = () => $('view');
// 在本 App 里跳转过才用「返回」，否则（比如直接打开的链接）回到上一级
let navved = false;
window.addEventListener('hashchange', () => { navved = true; });
const back = (fallback = '#/') => { if (navved) history.back(); else location.hash = fallback; };

function syncPill() {
  const off = !navigator.onLine;
  if (S.meta.pending) return `<span class="sync wait" id="sync"><i></i>${off ? '离线·待同步' : '同步中'}</span>`;
  if (off) return '<span class="sync off" id="sync"><i></i>离线</span>';
  return '<span class="sync" id="sync"><i></i>已同步</span>';
}
function updateSync() {
  const s = $('sync'); if (s) s.outerHTML = syncPill();
  const d = $('syncdot'); if (d) { const st = syncState(); d.className = 'syncdot ' + st.c; d.title = st.t; }
  const t = $('pf-sync'); if (t) t.textContent = syncState().t;
}
window.addEventListener('online', updateSync); window.addEventListener('offline', updateSync);

// 头像：有照片显示照片，没有显示名字首字
function face(uid, name, cls = '') {
  const img = S.avatars[uid];
  return `<span class="mav ${cls}">${img ? `<img src="${img}" alt="">` : initial(name || '?')}</span>`;
}
const memberName = uid => ((S.shop && S.shop.members || {})[uid] || {}).name || '';
function syncState() {
  if (!navigator.onLine) return { t: S.meta.pending ? '离线·待同步' : '离线', c: 'warn' };
  if (S.meta.pending) return { t: '同步中', c: 'warn' };
  return { t: '已同步', c: 'ok' };
}
// 和店铺日账一样的顶栏：左边我的头像，中间店铺 logo + 店名，右边同步小圆点
function topNav() {
  const logo = S.avatars._shop, st = syncState();
  return `<header class="topnav">
    <a class="avatar" href="#/me" aria-label="我">${S.avatars[S.me.uid] ? `<img src="${S.avatars[S.me.uid]}" alt="">` : initial(S.me.name)}</a>
    <a class="shopchip" href="#/me">${logo ? `<img class="slogo" src="${logo}" alt="">` : ''}<span>${h(S.shop ? S.shop.name : 'OP本')}</span></a>
    <span class="syncdot ${st.c}" id="syncdot" title="${st.t}"></span>
  </header>`;
}
function avatarsChanged() {
  if (!cur) return;
  if (cur.live) return cur.render();
  if (location.hash.startsWith('#/me')) { drawProfile(); drawMembers(); drawLogs(); }
}

function topBar(title, { micro = '', backTo = null, right = '' } = {}) {
  return `<header class="top">${backTo !== null ? `<button class="icon-btn" data-back>${ic('back', 20, 2)}</button>` : ''}
    <div class="grow">${micro ? `<span class="micro">${micro}</span>` : ''}<h1 class="ell">${title}</h1></div>${right}</header>`;
}
function bindBack(fallback) { const b = view().querySelector('[data-back]'); if (b) b.onclick = () => back(fallback); }
const initial = s => h((normName(s)[0] || '?').toUpperCase());

// ---------- 首页：未付 ----------
function invRow(i, { showSup = false, payBtn = true } = {}) {
  const d = daysSince(i.date), lv = level(i);
  const sub = [shortDate(i.date), i.no ? 'No. ' + h(i.no) : '', i.note ? h(i.note) : ''].filter(Boolean).join(' · ');
  return `<div class="inv" data-inv="${i.id}">
    <div class="meta">${showSup ? `<b class="ell">${h(supName(i.supplierId, i.supplierName))}</b>` : ''}<small>${sub}${i.invPh.length ? `<span class="ph-dot">${ic('photo', 13, 1.8)}</span>` : ''}${i.pending ? '<span class="pend">待同步</span>' : ''}</small>
    ${showSup ? '' : `<em class="days ${lv}">${d} 天</em>`}</div>
    <div class="amt"><span class="num">${money(i.owe != null ? i.owe : i.amount)}</span><small>${i.paidSum ? `<span class="partial">原 ${money(i.amount)} · 已付 ${money(i.paidSum)}</span> ` : ''}${methodTag(i.method)}${showSup ? ` <span class="${lv}">${d} 天</span>` : ''}</small></div>
    ${payBtn ? `<button class="pay-btn" data-pay="${i.id}"><i class="circ"></i>${i.method === 'cash' ? '付现金' : '标为已付'}</button>` : ''}
  </div>`;
}
// 已付发票的行：绿色勾 + 付款日期，金额变灰
function paidRow(i, showSup) {
  const sub = showSup
    ? `开票 ${shortDate(i.date)}${i.no ? ' · No. ' + h(i.no) : ''}`
    : `开票 ${shortDate(i.date)}${i.no ? ' · No. ' + h(i.no) : ''} · ${daysSince(i.date, i.paidDate)} 天后付`;
  return `<div class="inv paid" data-inv="${i.id}">
    <span class="okmark">${ic('check', 16, 2.6)}</span>
    <div class="meta">${showSup ? `<b class="ell">${h(supName(i.supplierId, i.supplierName))}</b>` : ''}<small>${sub}${i.payPh.length || i.invPh.length ? `<span class="ph-dot">${ic('photo', 13, 1.8)}</span>` : ''}</small></div>
    <div class="amt"><span class="num">${money(i.amount)}</span><small class="safe">${methodTag(i.method)} ✓ ${shortDate(i.paidDate)}</small></div></div>`;
}
const METHOD = { cash: '现金', op: 'OP' };
const methodTag = m => `<span class="mtag ${m}">${METHOD[m] || 'OP'}</span>`;
// 现金 / OP 分开合计
// 现金 / OP 分开合计；val 默认按还欠的算（已付事件传 e => e.amount）
function splitSum(list, val = i => (i.owe != null ? i.owe : i.amount)) {
  let c = 0, o = 0;
  list.forEach(i => { if (i.method === 'cash') c += val(i); else o += val(i); });
  return { cash: c, op: o, all: c + o };
}
const splitLine = (sp) => `<div class="split"><span>${methodTag('op')} ${money(sp.op)}</span><span>${methodTag('cash')} ${money(sp.cash)}</span></div>`;
// 现金 / OP 选择（seg）
const methodSeg = (cur, id) => `<div class="seg" id="${id}"><button type="button" data-m="op" class="${cur === 'op' ? 'on' : ''}">OP 转账</button><button type="button" data-m="cash" class="${cur === 'cash' ? 'on' : ''}">现金</button></div>`;
function bindSeg(root, id, onChange) {
  const box = root.querySelector('#' + id); if (!box) return;
  box.querySelectorAll('button').forEach(b => b.onclick = () => { box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); onChange(b.dataset.m); });
}
// 每家：欠 OP / 欠现金（只有一种时只显示那一种）
function grpSplit(list) {
  const sp = splitSum(list);
  return `<div class="gsplit">${sp.op ? `<span>${methodTag('op')} ${money(sp.op)}</span>` : ''}${sp.cash ? `<span>${methodTag('cash')} ${money(sp.cash)}</span>` : ''}</div>`;
}
// 已付的一笔：OP 整张 / 现金某一次
function evRow(e, showSup) {
  const i = e.inv;
  const what = e.method === 'cash'
    ? (e.cnt > 1 || !e.final ? `现金第 ${e.n} 笔 · ${e.left ? '剩 ' + money(e.left) : '付清'}` : '现金付清')
    : `${daysSince(i.date, e.date)} 天后付`;
  const sub = `开票 ${shortDate(i.date)}${i.no ? ' · No. ' + h(i.no) : ''} · ${what}`;
  return `<div class="inv paid ${e.final ? '' : 'part'}" data-inv="${i.id}">
    <span class="okmark">${ic(e.final ? 'check' : 'undo', 16, 2.6)}</span>
    <div class="meta">${showSup ? `<b class="ell">${h(supName(i.supplierId, i.supplierName))}</b>` : ''}<small>${sub}</small></div>
    <div class="amt"><span class="num">${money(e.amount)}</span><small class="safe">${methodTag(e.method)} ✓ ${shortDate(e.date)}</small></div></div>`;
}
const secHead = (kind, title, right) => `<div class="month"><b><i class="sdot ${kind}"></i>${title}</b><span>${right}</span></div>`;

function bindInvRows(root) {
  root.querySelectorAll('[data-inv]').forEach(r => r.onclick = e => {
    if (e.target.closest('[data-pay]')) return;
    location.hash = '#/inv/' + r.dataset.inv;
  });
  root.querySelectorAll('[data-pay]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const inv = S.unpaid.find(x => x.id === b.dataset.pay);
    if (inv) (inv.method === 'cash' ? cashFlow : payFlow)(inv);
  });
}
function home() {
  const gs = groups(), total = oweOf(S.unpaid), over = gs.reduce((s, g) => s + g.over, 0), sp = splitSum(S.unpaid);
  let html = topNav() + `<div class="pagehead"><span class="micro">${topDate()}</span><h1>未付</h1></div>`;
  if (!S.unpaid.length) {
    html += `<div class="card empty-state enter">
      <div class="big-ok">${ic('check', 44, 2)}</div>
      <h2>全部付清了</h2><p>${Object.keys(S.sups).length ? '没有没打 OP 的发票' : '收到供应商发票后，点下面「记发票」'}</p>
      <a class="btn primary cta" href="#/new">${ic('add', 18, 2.2)} 记一张发票</a></div>`;
    view().innerHTML = html; return;
  }
  html += `<section class="card hero enter">
    <span class="micro">未付总额（OP + 现金）</span>
    <div class="total">${bigMoney(total)}<em>lei</em></div>
    <div class="kpis two">
      <div class="kpi"><span class="num op">${money(sp.op)}</span><small>${methodTag('op')} 未付</small></div>
      <div class="kpi"><span class="num cash">${money(sp.cash)}</span><small>${methodTag('cash')} 未付</small></div>
    </div>
    <p class="hero-foot">${S.unpaid.length} 笔 · ${gs.length} 家供应商${over ? ` · <span class="expired">${over} 笔超期</span>` : ''}</p></section>`;
  gs.forEach((g, n) => {
    html += `<section class="card grp ${g.over ? 'bad' : ''} enter" style="--i:${n + 1}">
      <a class="grp-h" href="#/sup/${g.id}">
        <span class="ic ${g.lv === 'expired' ? 'bad' : g.lv === 'soon' ? 'mid' : ''}">${initial(g.name)}</span>
        <div class="grow"><b class="ell">${h(g.name)}</b><small>${g.list.length} 笔 · 最久 <span class="${g.lv}">${g.oldest} 天</span>${g.over ? ` · <span class="expired">${g.over} 笔超期</span>` : ''}</small></div>
        <div class="amt"><span class="num">${money(g.sum)}</span><span>lei</span></div>
      </a>
      ${grpSplit(g.list)}
      ${g.list.map(i => invRow(i)).join('')}
    </section>`;
  });
  html += `<p class="hint">超过供应商设定的天数会标红（默认 30 天，在「供应商」里改）</p>`;
  view().innerHTML = html;
  bindInvRows(view());
}

// ---------- 标记已付 ----------
function payFlow(inv) {
  let photos = [];
  const method = inv.method;
  const name = supName(inv.supplierId, inv.supplierName);
  sheet(`<h3>确认已还（${METHOD[method]}）</h3>
    <p class="sub">${h(name)} · <b class="num" style="font-size:17px">${money(inv.amount)}</b> lei${inv.no ? ' · No. ' + h(inv.no) : ''}</p>
    <div class="form">
      <label>付款日期<input type="date" id="pd" value="${today()}" max="${today()}"></label>
      <span class="lbl">付款截图 / 收据（可不加）</span>
      <div class="phs" id="pph"></div>
    </div>
    <button class="btn ok block" id="pok" style="margin-top:16px">${ic('check', 20, 2.2)} 已付</button>`, s => {
    const box = s.querySelector('#pph');
    const draw = () => photoGrid(box, { list: photos.map(p => ({ img: p.img, id: p.id })), max: 2, onAdd: imgs => { imgs.forEach(img => photos.push({ id: db.newPhotoId(S.shopId), img })); draw(); }, onDel: id => { photos = photos.filter(p => p.id !== id); draw(); } });
    draw();
    s.querySelector('#pok').onclick = () => {
      const pd = s.querySelector('#pd').value || today();
      if (pd < inv.date) return toast('付款日期不能早于开票日期');
      closeSheet();
      photos.forEach(p => db.cachePhoto(p.id, p.img));
      const row = document.querySelector(`[data-inv="${inv.id}"]`); if (row) row.classList.add('leaving');
      db.markPaid(S.shopId, inv.id, pd, S.me.name, photos, LG('pay', `已付（${METHOD[method]}）${invDesc(name, inv.amount, inv.no)}，付款日期 ${cnDate(pd, true)}${photos.length ? '，附截图' : ''}`, inv.id), method).catch(fail);
      toast(`已付（${METHOD[method]}）${money(inv.amount)} lei · ${name}`, { undo: () => db.unmarkPaid(S.shopId, Object.assign({}, inv, { payPh: photos.map(p => p.id) }), LG('unpay', `撤销已付 ${invDesc(name, inv.amount, inv.no)}`, inv.id)).then(() => toast('已撤销')).catch(fail) });
    };
  });
}

// ---------- 付现金（可以分几次付） ----------
function cashFlow(inv) {
  let photos = [];
  const name = supName(inv.supplierId, inv.supplierName), owe = inv.owe;
  sheet(`<h3>付现金</h3>
    <p class="sub">${h(name)}${inv.no ? ' · No. ' + h(inv.no) : ''}<br>发票 ${money(inv.amount)} lei${inv.paidSum ? ` · 已付 ${money(inv.paidSum)}` : ''} · <b>未付 ${money(owe)} lei</b></p>
    <div class="form">
      <label>这次付了多少（lei）<input id="ca" class="amt-in" inputmode="decimal" value="${money(owe)}"></label>
      <p class="hint-l" id="caHint" style="margin-top:-8px;margin-bottom:12px"></p>
      <label>付款日期<input type="date" id="cd" value="${today()}" max="${today()}"></label>
      <span class="lbl">收据照片（可不加）</span>
      <div class="phs" id="cph"></div>
    </div>
    <button class="btn ok block" id="cok" style="margin-top:16px">${ic('check', 20, 2.2)} 付了</button>`, s => {
    const ca = s.querySelector('#ca'), hint = s.querySelector('#caHint');
    const show = () => {
      const v = parseAmount(ca.value);
      if (isNaN(v) || v <= 0) { hint.className = 'hint-l warn'; hint.textContent = '金额格式不对'; return; }
      if (v > owe + 0.005) { hint.className = 'hint-l warn'; hint.textContent = `不能超过未付的 ${money(owe)} lei`; return; }
      hint.className = 'hint-l';
      hint.innerHTML = v >= owe - 0.005 ? '= 全部还清，这张变成已付' : `付 <b>${money(v)}</b>，剩 <b>${money(owe - v)}</b> lei 未付`;
    };
    ca.oninput = show; show();
    ca.onfocus = () => ca.select();
    const box = s.querySelector('#cph');
    const draw = () => photoGrid(box, { list: photos.map(p => ({ img: p.img, id: p.id })), max: 2, onAdd: imgs => { imgs.forEach(img => photos.push({ id: db.newPhotoId(S.shopId), img })); draw(); }, onDel: id => { photos = photos.filter(p => p.id !== id); draw(); } });
    draw();
    s.querySelector('#cok').onclick = () => {
      const v = parseAmount(ca.value), cd = s.querySelector('#cd').value || today();
      if (isNaN(v) || v <= 0) return toast('请填付了多少');
      if (v > owe + 0.005) return toast(`不能超过未付的 ${money(owe)} lei`);
      if (cd < inv.date) return toast('付款日期不能早于开票日期');
      closeSheet();
      const amt = Math.min(v, owe), left = Math.round((owe - amt) * 100) / 100;
      const pays = inv.cashPays.concat([{ amt, date: cd, by: S.me.name }]);
      photos.forEach(p => db.cachePhoto(p.id, p.img));
      if (!left) { const row = document.querySelector(`[data-inv="${inv.id}"]`); if (row) row.classList.add('leaving'); }
      const newPh = inv.payPh.concat(photos.map(p => p.id)).slice(-4);
      db.setCashPays(S.shopId, inv, pays, { photos, by: S.me.name,
        lg: LG('pay', `付现金 ${money(amt)} lei · ${name}${inv.no ? '（No. ' + inv.no + '）' : ''}，${cnDate(cd, true)}；${left ? `剩 ${money(left)} 未付` : '已付清'}`, inv.id) }).catch(fail);
      toast(left ? `付了 ${money(amt)}，剩 ${money(left)} lei 未付 · ${name}` : `已付清 ${money(inv.amount)} lei · ${name}`, { undo: () =>
        db.setCashPays(S.shopId, Object.assign({}, inv, { payPh: newPh }), inv.cashPays, { keepPh: inv.payPh,
          lg: LG('unpay', `撤销付现金 ${money(amt)} lei · ${name}`, inv.id) }).then(() => toast('已撤销')).catch(fail) });
    };
  });
}

// ---------- 照片格 ----------
// list: [{id, img?}]（img 没有就从数据库读）
function photoGrid(box, { list, max, onAdd, onDel, readonly }) {
  box.innerHTML = list.map(p => `<div class="ph" data-ph="${p.id}">${p.img ? `<img src="${p.img}" alt="">` : '<span class="spin">…</span>'}${readonly ? '' : `<button class="x" data-del="${p.id}" type="button">×</button>`}</div>`).join('')
    + (!readonly && list.length < max ? `<label class="ph add">${ic('camera', 24)}<span>拍照/PDF</span><input type="file" accept="image/*,application/pdf,.pdf"></label>` : '');
  list.forEach(p => {
    const el = box.querySelector(`[data-ph="${p.id}"]`);
    el.onclick = e => { if (e.target.closest('[data-del]')) return; viewer(p.img || p.id); };
    if (!p.img) db.getPhoto(S.shopId, p.id).then(img => { if (img && el.isConnected) el.querySelector('.spin').outerHTML = `<img src="${img}" alt="">`; else if (el.isConnected) el.querySelector('.spin').textContent = '未同步'; });
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = e => { e.stopPropagation(); onDel(b.dataset.del); });
  const inp = box.querySelector('input[type=file]');
  if (inp) inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const lab = inp.closest('.ph'); lab.innerHTML = '<span class="spin">处理中…</span>';
    try {
      const r = await toImages(f, max - list.length);
      if (r.skipped) toast(`PDF 只存了前 ${r.images.length} 页（最多 ${max} 张）`);
      onAdd(r.images);
    } catch (e) {
      console.error(e);
      toast(/pdf/i.test(f.type || f.name) ? '这个 PDF 打不开，换成截图试试' : (e.message || '照片处理失败'), { err: true });
      photoGrid(box, { list, max, onAdd, onDel });
    }
  };
}

// ---------- 记发票 / 改发票 ----------
function form(editId, presetSup) {
  const editing = editId ? (S.unpaid.find(x => x.id === editId) || null) : null;
  if (editId && !editing) {
    // 已付的发票：从数据库读一次
    view().innerHTML = topBar('改发票', { backTo: '' }) + '<div class="card empty-state">加载中…</div>';
    bindBack('#/');
    viewUnsub = db.watchInvoice(S.shopId, editId, inv => {
      stopView();
      if (!inv) { view().innerHTML = topBar('改发票', { backTo: '' }) + '<div class="card empty-state">这张发票已删除</div>'; bindBack('#/'); return; }
      formRender(inv);
    }, fail);
    return;
  }
  formRender(editing, presetSup);
}
function formRender(inv, presetSup, pendingSup) {
  const isEdit = !!inv;
  const pre = presetSup && (S.sups[presetSup] || (pendingSup && pendingSup.id === presetSup ? pendingSup : null));
  const st = {
    pendingSup: pendingSup || null,
    supId: inv ? inv.supplierId : (pre ? pre.id : ''),
    supText: inv ? supName(inv.supplierId, inv.supplierName) : (pre ? pre.name : ''),
    photos: (inv ? inv.invPh : []).map(id => ({ id })), added: [], removed: []
  };
  // 供应商名单每次都取最新的（刚保存的新供应商也要算进去）
  const supsNow = () => Object.values(S.sups).sort((a, b) => (b.used - a.used) || a.name.localeCompare(b.name));
  view().innerHTML = topBar(isEdit ? '改发票' : '记发票', { backTo: isEdit ? '' : null, micro: isEdit ? '' : '收到发票先记下，选 OP 还是现金，付完再点已付' }) + `
  <form class="card form enter" id="f" autocomplete="off" novalidate>
    <label>供应商<input id="sup" placeholder="输入或选择供应商" maxlength="60" value="${h(st.supText)}"></label>
    <div class="chips" id="supChips"></div>
    <p class="hint-l" id="supHint"></p>
    <label class="inline-n" style="margin:12px 0 0">开票超过 <input id="days" type="number" inputmode="numeric" min="1" max="999" value="30"> 天没付就标红</label>
    <p class="hint-l" id="daysHint" style="margin-bottom:4px"></p>
    <label style="margin-top:12px">金额（lei）<input id="amt" class="amt-in" inputmode="decimal" placeholder="0,00" value="${inv ? h(money(inv.amount)) : ''}"></label>
    <p class="hint-l" id="amtHint" style="margin-top:-8px;margin-bottom:12px"></p>
    <div class="two">
      <label>开票日期<input type="date" id="date" value="${inv ? inv.date : today()}" max="${today()}"></label>
      <label>发票号<input id="no" placeholder="可不填" maxlength="40" value="${inv ? h(inv.no) : ''}" autocapitalize="characters"></label>
    </div>
    ${methodSeg(inv ? inv.method : 'op', 'kind')}
    ${inv && inv.paid ? `<label style="margin-top:12px">付款日期<input type="date" id="paidDate" value="${inv.paidDate || today()}" max="${today()}"></label>` : ''}
    <div style="height:14px"></div>
    <span class="lbl">发票照片（拍照或选 PDF）</span>
    <div class="phs" id="phs"></div>
    <label style="margin-top:14px">备注<textarea id="note" maxlength="200" placeholder="可不填">${inv ? h(inv.note) : ''}</textarea></label>
  </form>
  <div class="stack">
    <button class="btn primary block" id="save">${isEdit ? '保存修改' : '保存'}</button>
    ${isEdit ? '' : '<button class="btn block" id="saveMore">保存，再记一张</button>'}
  </div>`;
  bindBack('#/');
  const f = view();
  const supIn = f.querySelector('#sup'), chips = f.querySelector('#supChips'), supHint = f.querySelector('#supHint');
  const amtIn = f.querySelector('#amt'), amtHint = f.querySelector('#amtHint');
  const daysIn = f.querySelector('#days'), daysHint = f.querySelector('#daysHint');
  let daysTouched = false, lastSupForDays = null;
  daysIn.oninput = () => { daysTouched = true; showDays(); };
  // 标红天数：选到之前的供应商就带出它的设置；新供应商默认 30
  const showDays = () => {
    const m = matchSup();
    const key = m ? m.id : '';
    if (key !== lastSupForDays) { lastSupForDays = key; if (!daysTouched || m) { daysIn.value = m ? (m.days || 30) : 30; daysTouched = false; } }
    const d = parseInt(daysIn.value, 10);
    daysHint.className = 'hint-l';
    if (!(d >= 1 && d <= 999)) { daysHint.className = 'hint-l warn'; daysHint.textContent = '填 1 到 999 天'; }
    else if (m && d !== (m.days || 30)) { daysHint.className = 'hint-l warn'; daysHint.textContent = `这家原来是 ${m.days || 30} 天，保存后改成 ${d} 天（这家所有发票都按新天数）`; }
    else if (m) daysHint.textContent = `这家之前设的是 ${m.days || 30} 天`;
    else daysHint.textContent = '新供应商，以后记这家会自动带出这个天数';
  };

  const matchSup = () => {
    const k = keyName(supIn.value);
    if (!k) return null;
    // 先认当前选中的那家，再按名字（不分大小写）找
    if (st.supId && S.sups[st.supId] && keyName(S.sups[st.supId].name) === k) return S.sups[st.supId];
    if (st.pendingSup && keyName(st.pendingSup.name) === k) return st.pendingSup;
    return supsNow().find(s => keyName(s.name) === k) || null;
  };
  const drawChips = () => {
    const k = keyName(supIn.value);
    const m = matchSup();
    st.supId = m ? m.id : '';
    const sups = supsNow();
    let list = sups;
    if (k && !m) list = sups.filter(s => keyName(s.name).includes(k));
    chips.innerHTML = list.slice(0, k && !m ? 20 : 12).map(s => `<button type="button" data-s="${s.id}" class="${s.id === st.supId ? 'on' : ''}">${h(s.name)}</button>`).join('');
    chips.querySelectorAll('button').forEach(b => b.onclick = () => { supIn.value = S.sups[b.dataset.s].name; supIn.classList.remove('bad'); drawChips(); amtIn.focus(); });
    supHint.className = 'hint-l';
    if (!supsNow().length && !k) supHint.textContent = '第一次输入的供应商会自动记住，下次直接点选';
    else if (k && !m) { supHint.className = 'hint-l new'; supHint.textContent = '新供应商「' + normName(supIn.value) + '」，保存后自动记住'; }
    else supHint.textContent = '';
    showDays();
  };
  supIn.oninput = drawChips; drawChips();

  const showAmt = () => {
    const v = parseAmount(amtIn.value);
    amtHint.className = 'hint-l';
    if (!amtIn.value.trim()) amtHint.textContent = '';
    else if (isNaN(v)) { amtHint.className = 'hint-l warn'; amtHint.textContent = '金额格式不对'; }
    else amtHint.innerHTML = '= <b>' + money(v) + '</b> lei';
  };
  amtIn.oninput = () => { amtIn.classList.remove('bad'); showAmt(); }; showAmt();

  // 欠的是 OP 还是现金
  let method = inv ? inv.method : 'op';
  bindSeg(f, 'kind', m => { method = m; });
  const phBox = f.querySelector('#phs');
  const drawPh = () => photoGrid(phBox, {
    list: st.photos, max: 4,
    onAdd: imgs => { imgs.forEach(img => { const p = { id: db.newPhotoId(S.shopId), img }; st.photos.push(p); st.added.push(p); }); drawPh(); },
    onDel: id => { st.photos = st.photos.filter(p => p.id !== id); if (st.added.some(p => p.id === id)) st.added = st.added.filter(p => p.id !== id); else st.removed.push(id); drawPh(); }
  });
  drawPh();

  const save = async more => {
    let name = normName(supIn.value);
    if (!name) { supIn.classList.add('bad'); supIn.focus(); return toast('请填供应商'); }
    const amount = parseAmount(amtIn.value);
    if (isNaN(amount) || amount <= 0) { amtIn.classList.add('bad'); amtIn.focus(); return toast('请填正确的金额'); }
    const date = f.querySelector('#date').value;
    if (!date) return toast('请选开票日期');
    if (date > today()) return toast('开票日期不能是以后的日子');
    const no = f.querySelector('#no').value.trim();
    const note = f.querySelector('#note').value.trim();
    const m = matchSup();
    if (m) name = m.name; // 用已存的写法（大小写）
    let newSupplier = null, supplierId = m ? m.id : null;
    const days = parseInt(daysIn.value, 10);
    if (!(days >= 1 && days <= 999)) { daysIn.classList.add('bad'); daysIn.focus(); return toast('标红天数填 1 到 999'); }
    if (!supplierId) { supplierId = db.newSupplierId(S.shopId); newSupplier = { id: supplierId, name, days }; }
    const supDays = !newSupplier && days !== ((m && m.days) || 30) ? days : null;

    // 同一家供应商同一个发票号 → 提醒可能重复
    if (no && (!inv || inv.no !== no || inv.supplierId !== supplierId)) {
      const dup = S.unpaid.find(x => x.no === no && x.supplierId === supplierId && (!inv || x.id !== inv.id))
        || (navigator.onLine ? (await db.findByNo(S.shopId, no)).find(x => x.supplierId === supplierId && (!inv || x.id !== inv.id)) : null);
      if (dup && !(await confirmSheet('发票号重复了', `${h(name)} 的 No. ${h(no)} 已经记过（${money(dup.amount)} lei，${dup.paid ? '已付' : '未付'}）。还要再记一次吗？`, '仍然保存'))) return;
    }

    const paid = !!(inv && inv.paid);
    let paidDate = null, paidBy = '';
    if (paid) {
      paidDate = (f.querySelector('#paidDate') || {}).value || inv.paidDate || today();
      paidBy = inv.paidBy || S.me.name;
      if (paidDate < date) return toast('付款日期不能早于开票日期');
    }
    const data = {
      supplierId, supplierName: name, no, amount, date, note, paid,
      by: inv ? (inv.by || S.me.name) : S.me.name,
      invPh: st.photos.map(p => p.id), payPh: inv ? inv.payPh : [], payMethod: method,
      cashPays: inv ? inv.cashPays : [], partial: inv ? inv.partial : false
    };
    if (paid) { data.paidDate = paidDate; data.paidBy = paidBy; }
    if (inv && inv.cashPays.length) {
      if (method !== 'cash') return toast('这张已经付过现金，不能改成 OP');
      if (amount < inv.paidSum - 0.005) return toast(`已经付了 ${money(inv.paidSum)}，金额不能比这个少`);
      const done = inv.paidSum >= amount - 0.005;
      if (done && !inv.paid) { data.paid = true; data.paidDate = inv.cashPays[inv.cashPays.length - 1].date; data.paidBy = inv.cashPays[inv.cashPays.length - 1].by; data.partial = false; }
      if (!done && inv.paid) { data.paid = false; delete data.paidDate; delete data.paidBy; data.partial = true; }
    }
    if (!inv) data.createdAt = db.serverNow();
    const id = inv ? inv.id : db.newInvoiceId(S.shopId);
    st.added.forEach(p => db.cachePhoto(p.id, p.img));
    let log;
    if (!inv) {
      log = LG('add', `记发票 ${invDesc(name, amount, no)}，开票 ${cnDate(date, true)}，${METHOD[method]}${newSupplier ? `；新供应商，超 ${days} 天标红` : ''}${supDays ? `；标红天数 ${(m && m.days) || 30} → ${days} 天` : ''}`, id);
    } else {
      const ch = [];
      const oldSup = supName(inv.supplierId, inv.supplierName);
      if (inv.supplierId !== supplierId) ch.push(`供应商 ${oldSup} → ${name}`);
      if (Math.abs(inv.amount - amount) > 0.001) ch.push(`金额 ${money(inv.amount)} → ${money(amount)}`);
      if (inv.date !== date) ch.push(`开票日期 ${cnDate(inv.date, true)} → ${cnDate(date, true)}`);
      if (inv.no !== no) ch.push(`发票号 ${inv.no || '空'} → ${no || '空'}`);
      if (inv.note !== note) ch.push(`备注 ${inv.note || '空'} → ${note || '空'}`);
      if (inv.method !== method) ch.push(`${METHOD[inv.method]} → ${METHOD[method]}`);
      if (paid && inv.paidDate !== paidDate) ch.push(`付款日期 ${cnDate(inv.paidDate, true)} → ${cnDate(paidDate, true)}`);
      if (st.added.length) ch.push(`加了 ${st.added.length} 张照片`);
      if (st.removed.length) ch.push(`删了 ${st.removed.length} 张照片`);
      if (supDays) ch.push(`${name} 标红天数 ${(m && m.days) || 30} → ${days} 天`);
      log = LG('edit', `改发票 ${invDesc(oldSup, inv.amount, inv.no)}：${ch.length ? ch.join('；') : '没有改动'}`, id);
    }
    db.saveInvoice(S.shopId, id, data, { newSupplier, supDays, photos: st.added, removePhotos: st.removed, log }).catch(fail);
    // 离线也能马上看到：不等服务器
    if (more) { toast(`已记 ${METHOD[method]} ${money(amount)} lei · ${name}`); formRender(null, supplierId, newSupplier ? { id: supplierId, name, days, used: Date.now() } : null); setTimeout(() => { const a = view().querySelector('#amt'); a && a.focus(); }, 50); }
    else if (inv) { toast('已保存'); back('#/'); }
    else { toast(`已记 ${METHOD[method]} ${money(amount)} lei · ${name}`); location.hash = '#/'; }
  };
  f.querySelector('#save').onclick = () => save(false);
  const sm = f.querySelector('#saveMore'); if (sm) sm.onclick = () => save(true);
  f.querySelector('#f').onsubmit = e => { e.preventDefault(); save(false); };
}

// ---------- 发票详情 ----------
function detail(id) {
  view().innerHTML = topBar('发票', { backTo: '' }) + '<div class="card empty-state">加载中…</div>';
  bindBack('#/');
  viewUnsub = db.watchInvoice(S.shopId, id, inv => {
    if (!inv) { view().innerHTML = topBar('发票', { backTo: '' }) + '<div class="card empty-state">这张发票已删除</div>'; bindBack('#/'); return; }
    const name = supName(inv.supplierId, inv.supplierName);
    const d = daysSince(inv.date, inv.paid ? inv.paidDate : null), lv = inv.paid ? '' : level(inv);
    const pill = inv.paid
      ? `<span class="pill safe">${ic('check', 15, 2.4)} 已付${METHOD[inv.method]} · ${cnDate(inv.paidDate)}</span>`
      : inv.paidSum
        ? `<span class="pill ${lv || 'soon'}">未付 ${money(inv.owe)} · 已付 ${money(inv.paidSum)}</span>`
        : `<span class="pill ${lv || 'wait'}">未付 · 已 ${d} 天${lv === 'expired' ? '（超期）' : ''}</span>`;
    const isCash = inv.method === 'cash', pays = inv.cashPays;
    view().innerHTML = topBar(h(name), { backTo: '', right: `<button class="icon-btn" id="more">${ic('more', 22, 2)}</button>` }) + `
      <section class="card big-amt enter">
        <div class="who">${inv.no ? 'No. ' + h(inv.no) : '发票'}</div>
        <div class="total">${bigMoney(inv.amount)}<em>lei</em></div>
        ${pill}
      </section>
      <div class="actions enter" style="--i:1">
        ${isCash
          ? `${!inv.paid ? `<button class="btn ok" id="pay">${ic('check', 20, 2.2)} 付现金</button>` : ''}${pays.length ? `<button class="btn" id="undoLast">${ic('undo', 18, 2)} 撤销最后一笔</button>` : ''}`
          : inv.paid ? `<button class="btn" id="unpay">${ic('undo', 18, 2)} 撤销已付</button>` : `<button class="btn ok" id="pay">${ic('check', 20, 2.2)} 标记已付</button>`}
      </div>
      <section class="card kv enter" style="--i:2">
        <div><span>供应商</span><a href="#/sup/${inv.supplierId}"><b>${h(name)}</b></a></div>
        <div><span>开票日期</span><b>${cnDate(inv.date, true)}</b></div>
        ${inv.paid ? `<div><span>付款方式</span><b>${methodTag(inv.method)}</b></div><div><span>付款日期</span><b>${cnDate(inv.paidDate, true)}</b></div><div><span>开票到付款</span><b>${d} 天</b></div>` : `<div><span>标红天数</span><b>${supDays(inv.supplierId)} 天</b></div>`}
        <div><span>记录人</span><b>${h(inv.by || '—')}</b></div>
        ${inv.paid ? `<div><span>点已付的人</span><b>${h(inv.paidBy || '—')}</b></div>` : ''}
        ${inv.note ? `<div><span>备注</span><b>${h(inv.note)}</b></div>` : ''}
      </section>
      ${pays.length ? `<section class="card enter" style="--i:3"><span class="micro">现金付款记录 · 已付 ${money(inv.paidSum)} / ${money(inv.amount)}</span>
        <div class="pays">${pays.map((p, n) => `<div class="pay"><span class="pn">${n + 1}</span><div class="grow"><b>${cnDate(p.date, true)}</b><small>${h(p.by || '')}</small></div><span class="num">${money(p.amt)}</span></div>`).join('')}</div></section>` : ''}
      ${inv.invPh.length ? `<section class="card enter" style="--i:3"><span class="micro">发票照片</span><div class="phs" id="ip"></div></section>` : ''}
      ${inv.payPh.length ? `<section class="card enter" style="--i:4"><span class="micro">付款截图</span><div class="phs" id="pp"></div></section>` : ''}`;
    bindBack('#/');
    if (inv.invPh.length) photoGrid(view().querySelector('#ip'), { list: inv.invPh.map(id => ({ id })), readonly: true });
    if (inv.payPh.length) photoGrid(view().querySelector('#pp'), { list: inv.payPh.map(id => ({ id })), readonly: true });
    const pb = view().querySelector('#pay'); if (pb) pb.onclick = () => (isCash ? cashFlow : payFlow)(inv);
    const ul = view().querySelector('#undoLast');
    if (ul) ul.onclick = async () => {
      const last = pays[pays.length - 1];
      if (!(await confirmSheet('撤销最后一笔现金？', `${cnDate(last.date, true)} 付的 ${money(last.amt)} lei 会撤销，这张发票${inv.paid ? '回到未付' : '未付的会加回去'}。`, '撤销'))) return;
      db.setCashPays(S.shopId, inv, pays.slice(0, -1), { lg: LG('unpay', `撤销付现金 ${money(last.amt)} lei · ${name}${inv.no ? '（No. ' + inv.no + '）' : ''}（原 ${cnDate(last.date, true)} 付的）`, inv.id) })
        .then(() => toast('已撤销')).catch(fail);
    };
    const ub = view().querySelector('#unpay');
    if (ub) ub.onclick = async () => {
      if (!(await confirmSheet('撤销已付？', '这张发票会回到「未付」' + (inv.payPh.length ? '，付款截图会删除' : '') + '。', '撤销已付'))) return;
      db.unmarkPaid(S.shopId, inv, LG('unpay', `撤销已付 ${invDesc(name, inv.amount, inv.no)}（原付款日期 ${cnDate(inv.paidDate, true)}）`, inv.id)).then(() => toast('已撤销，回到未付')).catch(fail);
    };
    view().querySelector('#more').onclick = () => sheet(`<h3>${h(name)}</h3><p class="sub">${money(inv.amount)} lei${inv.no ? ' · No. ' + h(inv.no) : ''}</p>
      <div class="sheet-list"><button data-a="edit">${ic('edit', 20)} 修改</button><button data-a="del" class="danger">${ic('trash', 20)} 删除这张发票</button></div>`, s => {
      s.querySelector('[data-a=edit]').onclick = () => { closeSheet(); location.hash = '#/edit/' + inv.id; };
      s.querySelector('[data-a=del]').onclick = async () => {
        closeSheet();
        if (!(await confirmSheet('删除这张发票？', '删除后找不回来，照片也一起删除。', '删除', true))) return;
        stopView();
        db.deleteInvoice(S.shopId, inv, LG('delete', `删除发票 ${invDesc(name, inv.amount, inv.no)}，开票 ${cnDate(inv.date, true)}，${inv.paid ? '已付' : '未付'}`, inv.id)).catch(fail);
        toast('已删除'); back('#/');
      };
    });
  }, fail);
}

// ---------- 已付 ----------
function paidView() {
  let list = [], partial = [], extra = [], q = '', loading = true;
  view().innerHTML = topBar('已付', { micro: '已付的发票（OP 和现金），按付款日期' }) + `
    <div class="search">${ic('search', 18, 2)}<input id="q" type="search" placeholder="搜供应商、发票号、金额" autocomplete="off"></div>
    <div id="pl"></div>`;
  const qi = view().querySelector('#q'), box = view().querySelector('#pl');
  const draw = () => {
    const k = keyName(q);
    const seen = new Set(), all = [];
    list.concat(partial, extra).forEach(x => { if (!seen.has(x.id) && (x.paid || x.cashPays.length)) { seen.add(x.id); all.push(x); } });
    let rows = all;
    if (k) {
      const num = parseAmount(q);
      rows = all.filter(i => keyName(supName(i.supplierId, i.supplierName)).includes(k) || keyName(i.no).includes(k)
        || (!isNaN(num) && Math.abs(i.amount - num) < 0.005) || money(i.amount).includes(q.trim()) || keyName(i.note).includes(k));
    }
    if (loading && !rows.length) { box.innerHTML = '<div class="card empty-state">加载中…</div>'; return; }
    if (!rows.length) {
      box.innerHTML = `<div class="card empty-state"><p>${k ? '在最近的记录里没找到' : '还没有已付的发票'}</p>${k ? '<button class="btn" id="deep">按发票号查全部记录</button>' : ''}</div>`;
      const dp = box.querySelector('#deep');
      if (dp) dp.onclick = async () => { dp.disabled = true; dp.textContent = '查找中…'; extra = await db.findByNo(S.shopId, q.trim()); if (!extra.length) { dp.textContent = '没有这个发票号'; return; } draw(); };
      return;
    }
    const evs = payEvents(rows), months = {};
    evs.forEach(e => { (months[monthKey(e.date)] = months[monthKey(e.date)] || []).push(e); });
    const ev$ = e => e.amount, thisM = today().slice(0, 7), cm = splitSum(months[thisM] || [], ev$);
    box.innerHTML = (!k ? `<section class="card hero enter">
        <span class="micro">本月已付</span>
        <div class="total">${bigMoney(cm.all)}<em>lei</em></div>
        <div class="kpis">
          <div class="kpi sm"><span class="num">${money(cm.op)}</span><small>OP 转账</small></div>
          <div class="kpi sm"><span class="num">${money(cm.cash)}</span><small>现金</small></div>
          <div class="kpi"><span class="num">${(months[thisM] || []).length}</span><small>笔</small></div>
        </div></section>` : '')
      + Object.keys(months).sort().reverse().map(mk => `
      ${secHead('ok', cnMonth(mk) + ' 已付', `${months[mk].length} 笔 · ${money(splitSum(months[mk], ev$).all)} lei`)}
      ${splitLine(splitSum(months[mk], ev$))}
      <section class="card list">${months[mk].map(e => evRow(e, true)).join('')}</section>`).join('')
      + (!k && list.length >= S.paidN ? '<button class="btn block" id="moreP" style="margin-top:4px">加载更早的</button>' : '')
      + (k ? '<p class="hint">只在最近加载的记录里搜；查更早的发票号可清空后点「加载更早的」或按发票号查</p>' : '');
    bindInvRows(box);
    const mp = box.querySelector('#moreP');
    if (mp) mp.onclick = () => { S.paidN += 100; sub(); };
  };
  const sub = () => {
    stopView();
    const u1 = db.watchPaid(S.shopId, S.paidN, l => { list = l; loading = false; draw(); }, e => { loading = false; fail(e); draw(); });
    const u2 = db.watchPartial(S.shopId, l => { partial = l; draw(); }, () => {});
    viewUnsub = () => { u1(); u2(); };
  };
  qi.oninput = () => { q = qi.value; extra = []; draw(); };
  sub(); draw();
}

// ---------- 供应商 ----------
function supList() {
  const gs = {}; groups().forEach(g => { gs[g.id] = g; });
  const sups = Object.values(S.sups).sort((a, b) => ((gs[b.id] && gs[b.id].sum) || 0) - ((gs[a.id] && gs[a.id].sum) || 0) || a.name.localeCompare(b.name));
  let html = topBar('供应商', { micro: `${sups.length} 家` });
  if (!sups.length) html += `<div class="card empty-state"><p>还没有供应商。记第一张发票时输入名字，会自动保存到这里。</p><a class="btn primary cta" href="#/new">${ic('add', 18, 2.2)} 记发票</a></div>`;
  else html += `<section class="card list enter">${sups.map(s => {
    const g = gs[s.id];
    return `<a class="row" href="#/sup/${s.id}">
      <span class="ic ${g ? (g.lv === 'expired' ? 'bad' : g.lv === 'soon' ? 'mid' : '') : 'ok'}">${initial(s.name)}</span>
      <div class="grow"><b class="ell">${h(s.name)}</b><small>${g ? `${g.list.length} 笔未付${g.over ? ` · <span class="expired">${g.over} 笔超期</span>` : ''}` : '已付清'} · 超 ${s.days} 天标红</small>${g ? grpSplit(g.list).replace('gsplit', 'gsplit tight') : ''}</div>
      <div class="r">${g ? `<span class="num">${money(g.sum)}</span><small>lei 未付</small>` : `<small class="safe">${ic('check', 18, 2.2)}</small>`}</div>
      <span class="chev">${ic('chev', 18, 2)}</span></a>`;
  }).join('')}</section>`;
  view().innerHTML = html;
}

function supDetail(sid) {
  const s0 = S.sups[sid];
  if (!s0) { view().innerHTML = topBar('供应商', { backTo: '' }) + '<div class="card empty-state">找不到这家供应商</div>'; bindBack('#/sup'); return; }
  let all = null;
  const draw = () => {
    const s = S.sups[sid]; if (!s) { location.hash = '#/sup'; return; }
    const un = S.unpaid.filter(i => i.supplierId === sid).sort((a, b) => a.date.localeCompare(b.date));
    const evs = payEvents(all || []);
    const yr = String(new Date().getFullYear()), evYr = evs.filter(e => (e.date || '').startsWith(yr));
    const paidYear = splitSum(evYr, e => e.amount).all;
    view().innerHTML = topBar(h(s.name), { backTo: '', right: `<button class="icon-btn" id="more">${ic('more', 22, 2)}</button>` }) + `
      <section class="card hero enter">
        <span class="micro">这家未付（OP + 现金）</span>
        <div class="total">${bigMoney(oweOf(un))}<em>lei</em></div>
        ${un.length ? grpSplit(un).replace('gsplit', 'gsplit hero-sp') : ''}
        <div class="kpis">
          <div class="kpi"><span class="num">${un.length}</span><small>笔未付</small></div>
          <div class="kpi ${un.some(i => level(i) === 'expired') ? 'bad' : ''}"><span class="num">${un.length ? daysSince(un[0].date) : 0}</span><small>最久（天）</small></div>
          <div class="kpi"><span class="num">${s.days}</span><small>天后标红</small></div>
        </div>
      </section>
      <a class="btn primary block enter" href="#/new?s=${sid}" style="margin-bottom:12px;--i:1">${ic('add', 18, 2.2)} 给这家记发票</a>
      ${un.length ? secHead('un', '未付', `${un.length} 笔 · ${money(oweOf(un))} lei`) + `<section class="card list">${un.map(i => invRow(i)).join('')}</section>` : ''}
      ${secHead('ok', '已付', all === null ? '加载中…' : `${evs.length} 笔 · 今年 ${money(paidYear)} lei`)}
      ${evYr.length ? splitLine(splitSum(evYr, e => e.amount)) : ''}
      ${evs.length ? `<section class="card list">${evs.map(e => evRow(e, false)).join('')}</section>` : (all === null ? '' : '<div class="card empty-state"><p>还没有已付记录</p></div>')}`;
    bindBack('#/sup');
    bindInvRows(view());
    view().querySelector('#more').onclick = () => supMenu(s, (all || []).length + un.length);
  };
  cur.live = true; cur.render = draw;
  viewUnsub = db.watchBySupplier(S.shopId, sid, l => { all = l; draw(); }, fail);
  draw();
}
function supMenu(s, count) {
  sheet(`<h3>${h(s.name)}</h3>
    <div class="form" style="margin-top:12px">
      <label>名字<input id="sn" value="${h(s.name)}" maxlength="60"></label>
      <label class="inline-n">开票超过 <input id="sd" type="number" inputmode="numeric" min="1" max="999" value="${s.days}"> 天没付就标红</label>
    </div>
    <button class="btn primary block" id="ss">保存</button>
    <div class="sheet-list" style="margin-top:12px"><button class="danger" id="sx">${ic('trash', 20)} 删除这家供应商</button></div>`, el => {
    el.querySelector('#ss').onclick = () => {
      const name = normName(el.querySelector('#sn').value), days = parseInt(el.querySelector('#sd').value, 10);
      if (!name) return toast('名字不能空');
      if (!(days >= 1 && days <= 999)) return toast('天数填 1 到 999');
      if (Object.values(S.sups).some(x => x.id !== s.id && keyName(x.name) === keyName(name))) return toast('已经有同名的供应商了');
      closeSheet();
      const ch = [];
      if (name !== s.name) ch.push(`改名 ${s.name} → ${name}`);
      if (days !== s.days) ch.push(`标红天数 ${s.days} → ${days} 天`);
      if (!ch.length) return;
      db.updateSupplier(S.shopId, s.id, { name, days }, LG('sup', `供应商 ${s.name}：${ch.join('；')}`, s.id)).then(() => toast('已保存')).catch(fail);
    };
    el.querySelector('#sx').onclick = () => {
      if (count > 0) { closeSheet(); toast('这家还有 ' + count + ' 张发票，先删掉发票才能删供应商'); return; }
      closeSheet();
      confirmSheet('删除「' + s.name + '」？', '', '删除', true).then(ok => { if (!ok) return; db.deleteSupplier(S.shopId, s.id, LG('sup', `删除供应商 ${s.name}`, s.id)).catch(fail); toast('已删除'); location.hash = '#/sup'; });
    };
  });
}

// ---------- 成员 ----------
const ROLE = { owner: '店主', manager: '管理员', staff: '店员' };
function drawMembers() {
  const box = $('members'); if (!box || !S.shop) return;
  const shop = S.shop, isOwner = shop.owner === S.me.uid, mem = shop.members || {};
  const ids = (shop.memberIds || []).slice().sort((a, b) => (a === shop.owner ? -1 : b === shop.owner ? 1 : ((mem[a] || {}).joinedAt || 0) - ((mem[b] || {}).joinedAt || 0)));
  box.innerHTML = `<span class="micro">成员 · ${ids.length} 人</span>
    <div class="mems">${ids.map(uid => {
      const m = mem[uid] || {}, role = uid === shop.owner ? 'owner' : (m.role === 'staff' ? 'staff' : 'manager');
      const me = uid === S.me.uid ? '<em class="me">我</em>' : '';
      const ctl = isOwner && role !== 'owner'
        ? `<div class="seg mini" data-uid="${uid}"><button data-r="manager" class="${role === 'manager' ? 'on' : ''}">管理员</button><button data-r="staff" class="${role === 'staff' ? 'on' : ''}">店员</button></div>`
        : `<span class="role ${role}">${ROLE[role]}</span>`;
      return `<div class="mem">${face(uid, m.name)}<div class="grow"><b class="ell">${h(m.name || '（未命名）')}${me}</b><small>${role === 'staff' ? '看不到 OP本' : role === 'owner' ? '能管理成员' : '能看能改 OP本'}</small></div>${ctl}</div>`;
    }).join('')}</div>
    <p class="hint-l" style="margin-top:10px">${isOwner ? '「管理员」能看能改进货付款，「店员」只能在店铺日账记当天营业额。邀请新成员在店铺日账里发邀请码。' : '只有店主能改成员身份。'}</p>`;
  box.querySelectorAll('.seg.mini').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = async () => {
    const uid = seg.dataset.uid, role = b.dataset.r;
    if (b.classList.contains('on')) return;
    const name = (mem[uid] || {}).name || '这个人';
    if (role === 'staff' && !(await confirmSheet(`把「${name}」改成店员？`, '改成店员后，TA 就看不到 OP本 了（店铺日账只能记当天营业额）。', '改成店员'))) return;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    db.setRole(S.shopId, uid, role, LG('role', `把 ${name} 从${ROLE[role === 'staff' ? 'manager' : 'staff']}改成${ROLE[role]}`, uid)).then(() => toast(`「${name}」已改成${ROLE[role]}`)).catch(e => { fail(e); drawMembers(); });
  }));
}

// ---------- 修改记录 ----------
const LOG_IC = { add: 'add', edit: 'edit', pay: 'check', unpay: 'undo', delete: 'trash', sup: 'tabSup', role: 'gear' };
const LOG_CLS = { pay: 'ok', delete: 'bad', unpay: 'mid' };
let logN = 30;
function fmtAt(ms) {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  const t = p(d.getHours()) + ':' + p(d.getMinutes());
  const ds = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  return (ds === today() ? '今天' : cnDate(ds)) + ' ' + t;
}
let lastLogs = null, logOpen = false;
function foldLogs() {
  const b = $('logs'), f = $('logFold'); if (!b || !f) return;
  b.hidden = !logOpen; f.classList.toggle('open', logOpen);
}
function watchLogBox() {
  stopView();
  viewUnsub = db.watchLogs(S.shopId, logN, list => { lastLogs = list; drawLogs(); },
    e => { const box = $('logs'); if (box) box.innerHTML = '<div class="empty">修改记录读不到：请按说明更新数据库规则</div>'; console.error(e); });
}
function drawLogs() {
    const list = lastLogs, box = $('logs'); if (!box || !list) return;
    const cnt = $('logCount'); if (cnt) cnt.textContent = list.length ? `最近 ${list.length >= logN ? logN + '+' : list.length} 条 · 点开看` : '还没有';
    if (!list.length) { box.innerHTML = '<div class="empty">还没有记录。之后每次记发票、改发票、点已付、删除、改供应商和成员，都会记在这里。</div>'; return; }
    box.innerHTML = list.map(x => `<div class="lg">
        <span class="lgface">${face(x.uid, x.by)}<i class="badge ${LOG_CLS[x.action] || ''}">${ic(LOG_IC[x.action] || 'edit', 11, 2.6)}</i></span>
        <div class="grow"><p>${h(x.text)}</p><small><b>${h(x.by || '?')}</b> · ${fmtAt(x.at)}</small></div>
      </div>`).join('')
      + (list.length >= logN ? '<button class="btn block" id="moreLog" style="margin-top:8px">查看更早的</button>' : '');
    const mb = $('moreLog'); if (mb) mb.onclick = () => { logN += 50; watchLogBox(); };
}

// 设置页头部：店铺 logo（店主能换）、店名、身份、三个小统计
function drawProfile() {
  const box = $('profile'); if (!box || !S.shop) return;
  const isOwner = S.shop.owner === S.me.uid, logo = S.avatars._shop;
  box.innerHTML = `
    <label class="bigavatar ${isOwner ? 'can' : ''}" id="logo-wrap"><span class="logo-in">${logo ? `<img src="${logo}" alt="">` : initial(S.shop.name)}</span>${isOwner ? `<i class="cam">${ic('camera', 14, 2.2)}</i><input type="file" id="in-logo" accept="image/*" hidden>` : ''}</label>
    <div class="pname">${h(S.shop.name)}</div>
    <div class="prole">我是${isOwner ? '店主' : '管理员'} · ${h(S.me.name)}</div>
    <div class="stats">
      <div><b>${(S.shop.memberIds || []).length}</b><span>成员</span></div>
      <div><b>${S.unpaid.length}</b><span>笔未付</span></div>
      <div><b id="pf-sync">${syncState().t}</b><span>状态</span></div>
    </div>`;
  const my = $('my-avatar');
  if (my) { my.outerHTML = `<span id="my-avatar">${face(S.me.uid, S.me.name, 'me')}</span>`; $('avatar-sub').textContent = S.avatars[S.me.uid] ? '点这里更换（店铺日账里也会一起换）' : '点这里上传照片'; }
  const inp = $('in-logo');
  if (inp) inp.onchange = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    const w = $('logo-wrap'); w.classList.add('busy');
    try {
      const img = await makeAvatar(f);
      S.avatars._shop = img; drawProfile();
      await db.setAvatar([S.shopId], '_shop', img);
      toast('店铺 logo 已更新');
    } catch (err) { toast('上传失败：' + errText(err), { err: true }); }
    const w2 = $('logo-wrap'); if (w2) w2.classList.remove('busy');
  };
}

// ---------- 设置 ----------
async function settings() {
  const t = curTheme();
  view().innerHTML = topNav() + `
    <section class="profile enter" id="profile"></section>
    <section class="card enter" style="--i:1">
      <label class="lrow" id="row-avatar"><span id="my-avatar"></span><span class="grow"><b>我的头像</b><small id="avatar-sub"></small></span><span class="chev">${ic('chev', 18, 2)}</span><input type="file" id="in-avatar" accept="image/*" hidden></label>
      <div class="lrow static"><span class="mav ghost">${ic('ext', 16, 2)}</span><span class="grow"><b>账号</b><small>${h(S.user.email || '')}</small></span></div>
      ${S.shopIds.length > 1 ? `<div class="lrow static"><span class="mav ghost">${ic('tabSup', 16, 2)}</span><span class="grow"><b>切换店铺</b></span><select class="inp" id="shopSel" style="width:auto;margin:0"></select></div>` : ''}
    </section>
    <section class="card enter" style="--i:1" id="members"></section>
    <section class="card enter" style="--i:1"><button class="fold" id="logFold"><span class="micro">修改记录</span><small id="logCount"></small><span class="chev">${ic('chev', 16, 2)}</span></button><div id="logs" class="logs" hidden><div class="empty">加载中…</div></div></section>
    <section class="card enter" style="--i:1">
      <span class="micro">外观</span>
      <div class="seg" id="theme" style="margin-top:8px"><button data-t="">跟随系统</button><button data-t="light">浅色</button><button data-t="dark">深色</button></div>
    </section>
    <section class="card enter" style="--i:2">
      <span class="micro">说明</span>
      <p class="small" style="color:var(--text2);line-height:1.7;margin:8px 0 0">· OP本 和店铺日账共用店铺和成员账号，店主和「管理员」都能记、都能改，「店员」看不到。<br>· 每家供应商的标红天数在「供应商」→ 点进去 → 右上角 ⋯ 修改。<br>· 没网也能记，有网自动同步。</p>
    </section>
    <a class="btn block enter" href="${RIZHANG}" style="margin-bottom:10px;--i:3">${ic('ext', 18, 2)} 打开店铺日账</a>
    <button class="btn block danger enter" id="lo" style="--i:4">退出登录</button>
    <p class="hint" id="ver">OP本 v${VERSION}</p>
    ${S.shop && S.shop.owner === S.me.uid ? `<details class="adv"><summary>高级</summary>
      <section class="card"><span class="micro">清空数据</span>
        <p class="small" style="color:var(--text2);line-height:1.6;margin:6px 0 12px">删除这家店 OP本 里的全部发票、供应商、照片和付款记录，删了找不回来。成员、头像、店铺 logo 和修改记录保留；店铺日账不受影响。</p>
        <button class="btn block danger" id="wipe">${ic('trash', 18, 2)} 清空全部数据</button>
      </section></details>` : ''}`;
  drawProfile();
  drawMembers();
  watchLogBox();
  $('logFold').onclick = () => { logOpen = !logOpen; foldLogs(); };
  foldLogs();
  // 上传我的头像（所有店都换）
  $('in-avatar').onchange = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    const row = $('row-avatar'); row.classList.add('busy');
    try {
      const img = await makeAvatar(f);
      S.avatars[S.me.uid] = img; avatarsChanged();
      await db.setAvatar(S.shopIds, S.me.uid, img);
      toast('头像已更新');
    } catch (err) { toast('上传失败：' + errText(err), { err: true }); }
    row.classList.remove('busy');
  };
  view().querySelectorAll('#theme button').forEach(b => {
    b.classList.toggle('on', b.dataset.t === t);
    b.onclick = () => { setTheme(b.dataset.t); settings(); };
  });
  const wipe = $('wipe');
  if (wipe) wipe.onclick = async () => {
    const n = S.unpaid.length;
    if (!(await confirmSheet('清空全部数据？', `会删掉全部发票（包括 ${n} 张未付）、供应商、照片和付款记录，删了找不回来。`, '继续', true))) return;
    const shopName = S.shop.name;
    const typed = await new Promise(res => sheet(`<h3>最后确认</h3><p class="sub">请输入店名「<b>${h(shopName)}</b>」确认清空</p>
      <div class="form"><input id="wn" autocomplete="off" placeholder="${h(shopName)}"></div>
      <div class="btns" style="margin-top:12px"><button class="btn" data-a="no">取消</button><button class="btn danger" data-a="ok">清空</button></div>`, sh => {
        sh.querySelector('[data-a=no]').onclick = () => { closeSheet(); res(null); };
        sh.querySelector('[data-a=ok]').onclick = () => { const v = sh.querySelector('#wn').value; closeSheet(); res(v); };
      }));
    if (typed == null) return;
    if (normName(typed).toLowerCase() !== normName(shopName).toLowerCase()) return toast('店名不对，没有清空', { err: true });
    wipe.disabled = true; wipe.textContent = '清空中…';
    try {
      const cnt = await db.clearAll(S.shopId, LG('delete', `清空了全部数据（发票、供应商、照片）`, ''));
      toast(`已清空（${cnt} 条）`); location.hash = '#/';
    } catch (e) { fail(e); wipe.disabled = false; wipe.textContent = '清空全部数据'; }
  };
  view().querySelector('#lo').onclick = async () => { if (await confirmSheet('退出登录？', '', '退出')) { try { localStorage.removeItem('opben.shop'); } catch (e) {} db.logout(); } };
  const sel = view().querySelector('#shopSel');
  if (sel) {
    const shops = await Promise.all(S.shopIds.map(id => db.getShop(id)));
    sel.innerHTML = shops.map((x, n) => x ? `<option value="${S.shopIds[n]}" ${S.shopIds[n] === S.shopId ? 'selected' : ''}>${h(x.name)}</option>` : '').join('');
    sel.onchange = () => { firstData = true; show('boot'); openShop(sel.value); location.hash = '#/'; };
  }
}
