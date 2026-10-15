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
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, p);
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
export const updateSupplier = (sid, id, data) => updateDoc(doc(supCol(sid), id), data);
export const deleteSupplier = (sid, id) => deleteDoc(doc(supCol(sid), id));

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
    by: x.by || '', invPh: x.invPh || [], payPh: x.payPh || [],
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
export function saveInvoice(sid, id, data, { newSupplier, photos = [], removePhotos = [] } = {}) {
  const b = writeBatch(db);
  if (newSupplier) b.set(doc(supCol(sid), newSupplier.id), { name: newSupplier.name, days: newSupplier.days || 30, createdAt: serverTimestamp(), usedAt: serverTimestamp() });
  else b.update(doc(supCol(sid), data.supplierId), { usedAt: serverTimestamp() });
  photos.forEach(p => b.set(doc(phCol(sid), p.id), { img: p.img, at: serverTimestamp() }));
  removePhotos.forEach(pid => b.delete(doc(phCol(sid), pid)));
  b.set(doc(invCol(sid), id), Object.assign({}, data, { updatedAt: serverTimestamp() }));
  return b.commit();
}

// 标记已付 / 撤销已付
export function markPaid(sid, id, paidDate, paidBy, photos = []) {
  const b = writeBatch(db);
  photos.forEach(p => b.set(doc(phCol(sid), p.id), { img: p.img, at: serverTimestamp() }));
  const upd = { paid: true, paidDate, paidBy, updatedAt: serverTimestamp() };
  if (photos.length) upd.payPh = photos.map(p => p.id);
  b.update(doc(invCol(sid), id), upd);
  return b.commit();
}
export function unmarkPaid(sid, inv) {
  const b = writeBatch(db);
  (inv.payPh || []).forEach(pid => b.delete(doc(phCol(sid), pid)));
  b.update(doc(invCol(sid), inv.id), { paid: false, paidDate: deleteField(), paidBy: deleteField(), payPh: [], updatedAt: serverTimestamp() });
  return b.commit();
}
export function deleteInvoice(sid, inv) {
  const b = writeBatch(db);
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
