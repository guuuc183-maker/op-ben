// 照片压缩：摆正方向 → 缩放 → JPEG，控制在约 300KB 以内，直接存进数据库（免费，不用 Firebase Storage）
const LIMIT = 900000; // base64 字符数上限（数据库单条约 1MB）

async function decode(file) {
  if (globalThis.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
  }
  return await new Promise((res, rej) => {
    const u = URL.createObjectURL(file), i = new Image();
    i.onload = () => { URL.revokeObjectURL(u); res(i); };
    i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('这张照片打不开，换一张试试')); };
    i.src = u;
  });
}
function draw(img, max, q) {
  const w = img.width || img.naturalWidth, hgt = img.height || img.naturalHeight, k = Math.min(1, max / Math.max(w, hgt));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hgt * k));
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
// 发票要看清字：先试 1600px，太大就逐步降
export async function compress(file) {
  if (file.type && !/^image\//.test(file.type)) throw new Error('请选照片文件');
  const img = await decode(file);
  const tries = [[1600, .7], [1400, .62], [1200, .55], [1000, .5], [800, .45]];
  let out = '';
  for (const [m, q] of tries) { out = draw(img, m, q); if (out.length < LIMIT * 0.3) break; }
  img.close && img.close();
  if (out.length >= LIMIT) throw new Error('照片太大了，换一张试试');
  return out;
}
