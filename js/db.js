// OP本 数据层：共用「店铺日账」的 Firebase 项目和店铺成员
// 数据放在 shops/{店铺ID}/ 下面：opSuppliers 供应商、opInvoices 发票、opPhotos 照片
import { firebaseConfig } from './config.js';
import {
  initializeApp,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  deleteField, serverTimestamp, query, where, orderBy, limit,
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged,
  connectFirestoreEmulator, connectAuthEmulator
} from './firebase.js';

// 仅本机测试：http://localhost/?emu 连 Firebase 模拟器
const EMU = location.hostname === 'localhost' && new URLSearchParams(location.search).has('emu');
let db, auth;

export function init() {
  const app = initializeApp(EMU ? { apiKey: 'demo', projectId: 'demo-zhangfang', authDomain: 'localhost' } : firebaseConfig);
  try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { db = initializeFirestore(app, {}); }
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver
  });
  if (EMU) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  getRedirectResult(auth).catch(() => {});
}

// ---------- 登录（和店铺日账同一套账号） ----------
export const onUser = cb => onAuthStateChanged(auth, cb);
export async function loginGoogle() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  // 主屏幕 App（iPhone）里跳转式登录会报 missing initial state，所以不跳转，提示改用邮箱
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (!standalone && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) await signInWithRedirect(auth, p);
    else if (standalone && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw Object.assign(new Error('google-in-pwa'), { code: 'op/google-in-pwa' });
    else throw e;
  }
}
export const loginEmail = (email, pw) => signInWithEmailAndPassword(auth, email.trim(), pw);
export const registerEmail = (email, pw) => createUserWithEmailAndPassword(auth, email.trim(), pw);
export const resetPassword = email => sendPasswordResetEmail(auth, email.trim());
export const logout = () => signOut(auth);

// ---------- 店铺（只读：店铺在「店铺日账」里建和管理） ----------
export async function myShops(uid) {
  const s = await getDoc(doc(db, 'users', uid));
  if (!s.exists()) return { ids: [], current: null };
  const d = s.data();
  const ids = d.shopIds || (d.shopId ? [d.shopId] : []);
  return { ids, current: ids.includes(d.current) ? d.current : ids[0] || null };
}
export function watchShop(shopId, cb, onErr) {
  return onSnapshot(doc(db, 'shops', shopId), s => {
    if (!s.exists()) { if (!s.metadata.fromCache) onErr({ code: 'not-found' }); return; }
    cb(Object.assign({ id: s.id }, s.data()));
  }, onErr);
}
// ---------- 头像 / 店铺 logo（和店铺日账共用：shops/{id}/avatars/{uid}，店铺 logo 存在 _shop） ----------
export function watchAvatars(shopId, cb) {
  return onSnapshot(collection(db, 'shops', shopId, 'avatars'), s => {
    const m = {}; s.forEach(d => { if (d.data().img) m[d.id] = d.data().img; }); cb(m);
  }, () => cb({}));
}
export function setAvatar(shopIds, uid, img) {
  const b = writeBatch(db);
  shopIds.forEach(id => b.set(doc(db, 'shops', id, 'avatars', uid), { img, at: serverTimestamp() }));
  return b.commit();
}

// ---------- 修改记录（只能新增，谁都改不了、删不了） ----------
// lg = { me: {uid, name}, action, text, ref }
const logCol = sid => collection(db, 'shops', sid, 'opLogs');
function addLog(b, sid, lg) {
  if (!lg) return;
  b.set(doc(logCol(sid)), {
    action: lg.action, text: String(lg.text || '').slice(0, 300), ref: lg.ref || '',
    by: (lg.me && lg.me.name || '').slice(0, 40), uid: lg.me.uid, at: serverTimestamp()
  });
}
export function watchLogs(sid, n, cb, onErr) {
  return onSnapshot(query(logCol(sid), orderBy('at', 'desc'), limit(n)), s => cb(s.docs.map(d => {
    const x = d.data();
    return Object.assign({ id: d.id }, x, { at: x.at && x.at.toMillis ? x.at.toMillis() : Date.now() });
  })), onErr);
}

// 店主改成员身份：manager = 家人（能看 OP本），staff = 店员
export function setRole(shopId, uid, role, lg) {
  const b = writeBatch(db);
  b.update(doc(db, 'shops', shopId), { ['members.' + uid + '.role']: role });
  addLog(b, shopId, lg);
  return b.commit();
}
export const getShop = id => getDoc(doc(db, 'shops', id)).then(s => s.exists() ? Object.assign({ id: s.id }, s.data()) : null).catch(() => null);

// ---------- 供应商 ----------
const supCol = sid => collection(db, 'shops', sid, 'opSuppliers');
export function watchSuppliers(sid, cb, onErr) {
  return onSnapshot(supCol(sid), s => {
    const m = {};
    s.forEach(d => { const x = d.data(); m[d.id] = { id: d.id, name: x.name || '', days: x.days || 30, used: x.usedAt && x.usedAt.toMillis ? x.usedAt.toMillis() : 0 }; });
    cb(m);
  }, onErr);
}
export function newSupplierId(sid) { return doc(supCol(sid)).id; }
export function updateSupplier(sid, id, data, lg) {
  const b = writeBatch(db); b.update(doc(supCol(sid), id), data); addLog(b, sid, lg); return b.commit();
}
export function deleteSupplier(sid, id, lg) {
  const b = writeBatch(db); b.delete(doc(supCol(sid), id)); addLog(b, sid, lg); return b.commit();
}

// ---------- 发票 ----------
const invCol = sid => collection(db, 'shops', sid, 'opInvoices');
const phCol = sid => collection(db, 'shops', sid, 'opPhotos');
export const newInvoiceId = sid => doc(invCol(sid)).id;
export const newPhotoId = sid => doc(phCol(sid)).id;

function toInv(d) {
  const x = d.data();
  return {
    id: d.id, supplierId: x.supplierId, supplierName: x.supplierName || '', no: x.no || '', amount: x.amount || 0,
    date: x.date, note: x.note || '', paid: !!x.paid, paidDate: x.paidDate || null, paidBy: x.paidBy || '',
    by: x.by || '', invPh: x.invPh || [], payPh: x.payPh || [], method: x.payMethod === 'cash' ? 'cash' : 'op',
    pending: d.metadata.hasPendingWrites
  };
}
const toList = (s, cb) => cb(s.docs.map(toInv), { pending: s.metadata.hasPendingWrites, fromCache: s.metadata.fromCache });

// 所有未付（首页）
export function watchUnpaid(sid, cb, onErr) {
  return onSnapshot(query(invCol(sid), where('paid', '==', false)), { includeMetadataChanges: true }, s => toList(s, cb), onErr);
}
// 最近已付（按付款日期，新的在前）
export function watchPaid(sid, n, cb, onErr) {
  return onSnapshot(query(invCol(sid), where('paidDate', '>=', '2000-01-01'), orderBy('paidDate', 'desc'), limit(n)), s => toList(s, cb), onErr);
}
// 某家供应商的全部发票
export function watchBySupplier(sid, supId, cb, onErr) {
  return onSnapshot(query(invCol(sid), where('supplierId', '==', supId)), s => toList(s, cb), onErr);
}
// 按发票号查（全部历史）
export function findByNo(sid, no) {
  return new Promise(res => {
    const un = onSnapshot(query(invCol(sid), where('no', '==', no), limit(20)), s => { un(); res(s.docs.map(toInv)); }, () => res([]));
  });
}
export function watchInvoice(sid, id, cb, onErr) {
  return onSnapshot(doc(invCol(sid), id), s => cb(s.exists() ? toInv(s) : null), onErr);
}

// 保存发票（新建或修改）；supplier 是新供应商时一起建
// photos: [{id, img}] 新增照片
// supDays：老供应商的标红天数改了就一起更新
export function saveInvoice(sid, id, data, { newSupplier, supDays, photos = [], removePhotos = [], log } = {}) {
  const b = writeBatch(db);
  addLog(b, sid, log);
  if (newSupplier) b.set(doc(supCol(sid), newSupplier.id), { name: newSupplier.name, days: newSupplier.days || 30, createdAt: serverTimestamp(), usedAt: serverTimestamp() });
  else b.update(doc(supCol(sid), data.supplierId), supDays ? { usedAt: serverTimestamp(), days: supDays } : { usedAt: serverTimestamp() });
  photos.forEach(p => b.set(doc(phCol(sid), p.id), { img: p.img, at: serverTimestamp() }));
  removePhotos.forEach(pid => b.delete(doc(phCol(sid), pid)));
  b.set(doc(invCol(sid), id), Object.assign({}, data, { updatedAt: serverTimestamp() }));
  return b.commit();
}

// 标记已付 / 撤销已付
// method: 'cash' 现金 / 'op' 银行转账
export function markPaid(sid, id, paidDate, paidBy, photos = [], lg, method = 'op') {
  const b = writeBatch(db);
  addLog(b, sid, lg);
  photos.forEach(p => b.set(doc(phCol(sid), p.id), { img: p.img, at: serverTimestamp() }));
  const upd = { paid: true, paidDate, paidBy, payMethod: method === 'cash' ? 'cash' : 'op', updatedAt: serverTimestamp() };
  if (photos.length) upd.payPh = photos.map(p => p.id);
  b.update(doc(invCol(sid), id), upd);
  return b.commit();
}
export function unmarkPaid(sid, inv, lg) {
  const b = writeBatch(db);
  addLog(b, sid, lg);
  (inv.payPh || []).forEach(pid => b.delete(doc(phCol(sid), pid)));
  b.update(doc(invCol(sid), inv.id), { paid: false, paidDate: deleteField(), paidBy: deleteField(), payMethod: deleteField(), payPh: [], updatedAt: serverTimestamp() });
  return b.commit();
}
export function deleteInvoice(sid, inv, lg) {
  const b = writeBatch(db);
  addLog(b, sid, lg);
  [...(inv.invPh || []), ...(inv.payPh || [])].forEach(pid => b.delete(doc(phCol(sid), pid)));
  b.delete(doc(invCol(sid), inv.id));
  return b.commit();
}

// 照片：读一张（带内存缓存）
const phCache = {};
export function getPhoto(sid, pid) {
  if (phCache[pid]) return Promise.resolve(phCache[pid]);
  return getDoc(doc(phCol(sid), pid)).then(s => s.exists() ? (phCache[pid] = s.data().img) : null).catch(() => null);
}
export function cachePhoto(pid, img) { phCache[pid] = img; }

export function serverNow() { return serverTimestamp(); }
export { EMU };
