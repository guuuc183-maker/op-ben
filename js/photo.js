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
const isPdf = f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));

// PDF 发票（如 e-Factura）：每页转成一张图片，最多 maxPages 页。pdf.js 只在第一次选 PDF 时才加载
let pdfLib = null;
async function loadPdf() {
  if (!pdfLib) {
    pdfLib = await import('./pdfjs/pdf.min.mjs');
    pdfLib.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfLib;
}
async function pdfToImages(file, maxPages) {
  const lib = await loadPdf();
  const task = lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    standardFontDataUrl: new URL('./pdfjs/standard_fonts/', import.meta.url).href
  });
  const doc = await task.promise;
  const out = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 2000 / Math.max(v1.width, v1.height) }); // 先画大一点，缩小后字更清楚
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: x, canvas: c, viewport: vp }).promise;
      // 压缩：从 1600 开始，太大就缩
      let url = '';
      for (const [m, q] of [[1600, .72], [1400, .65], [1200, .58], [1000, .5]]) {
        url = draw(c, m, q); if (url.length < LIMIT * 0.3) break;
      }
      out.push(url);
      page.cleanup();
    }
  } finally { task.destroy(); }
  return { images: out, total: doc.numPages };
}

// 选的文件 → 图片数组（照片 1 张；PDF 每页 1 张），最多 room 张
export async function toImages(file, room) {
  if (isPdf(file)) {
    const r = await pdfToImages(file, room);
    return { images: r.images, skipped: Math.max(0, r.total - r.images.length) };
  }
  return { images: [await compress(file)], skipped: 0 };
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

// 头像 / logo：裁成正方形 192px，小 JPEG（和店铺日账一样）
export async function makeAvatar(file) {
  if (file.type && !/^image\//.test(file.type)) throw new Error('请选照片');
  const img = await decode(file);
  const w = img.width || img.naturalWidth, hh = img.height || img.naturalHeight, sq = Math.min(w, hh), N = 192;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, N, N);
  x.drawImage(img, (w - sq) / 2, (hh - sq) / 2, sq, sq, 0, 0, N, N);
  img.close && img.close();
  for (const q of [0.82, 0.7, 0.55, 0.4]) { const out = c.toDataURL('image/jpeg', q); if (out.length < 38000) return out; }
  throw new Error('图片太大');
}
