// 小工具：转义、日期、金额
export const $ = id => document.getElementById(id);
export const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = n => String(n).padStart(2, '0');
export const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const today = () => ymd(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
// 从开票日到今天（或到付款日）过了几天
export function daysSince(date, to) {
  if (!date) return 0;
  return Math.round((parse(to || today()) - parse(date)) / 86400000);
}
export function cnDate(s, withYear) {
  if (!s) return '';
  const d = parse(s), y = d.getFullYear();
  const md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
  return (withYear || y !== new Date().getFullYear()) ? y + '年' + md : md;
}
export const shortDate = s => { if (!s) return ''; const d = parse(s); const t = pad(d.getDate()) + '.' + pad(d.getMonth() + 1); return d.getFullYear() === new Date().getFullYear() ? t : t + '.' + String(d.getFullYear()).slice(2); };
export const monthKey = s => s ? s.slice(0, 7) : '';
export const cnMonth = k => { const [y, m] = k.split('-'); return (Number(y) === new Date().getFullYear() ? '' : y + '年') + Number(m) + '月'; };
export function topDate() {
  const d = new Date(), wk = '日一二三四五六'[d.getDay()];
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + wk;
}

// 金额：罗马尼亚写法 1.234,56
const NF = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
export const money = n => NF.format(Math.round((n || 0) * 100) / 100);
export const money0 = n => NF0.format(Math.round(n || 0));
// 大数字：整数部分 + 小数部分分开显示
export function bigMoney(n) {
  const s = money(n), i = s.lastIndexOf(',');
  return '<span class="num">' + s.slice(0, i) + '</span><small class="num">,' + s.slice(i + 1) + '</small>';
}
// 输入解析：支持 1234.5 / 1234,5 / 1.234,56 / 1,234.56 / 1 234,56
export function parseAmount(raw) {
  let s = String(raw || '').trim().replace(/\s|lei|ron/gi, '');
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) {
    const dec = lc > ld ? ',' : '.', th = dec === ',' ? '.' : ',';
    s = s.split(th).join('').replace(dec, '.');
  } else if (lc >= 0) {
    // 只有逗号：多个逗号 → 千分位；一个逗号 → 小数点
    const parts = s.split(',');
    s = parts.length > 2 ? parts.join('') : parts.join('.');
  } else if (ld >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) s = parts.join('');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100) / 100;
}
export const normName = s => String(s || '').trim().replace(/\s+/g, ' ');
export const keyName = s => normName(s).toLowerCase();
