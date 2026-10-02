/* ============================================================
   export.js — 透過PNG / SVG の書き出し
   ------------------------------------------------------------
   透過の担保: canvas に背景を塗らず drawImage するだけにする。
   フォントの注意: SVG を <img> 経由でラスタライズすると Webフォント
   (@font-face) は読めない。OS 搭載フォント（教科書体など）は使える。
   ============================================================ */

const MM_PER_INCH = 25.4;

/** mm → px */
export function mmToPx(mm, dpi) {
  return Math.max(1, Math.round((mm / MM_PER_INCH) * dpi));
}

/** プレビューの <svg> を、書き出し用に整えた文字列にする */
export function toSVGString(svgEl, { dpi = null } = {}) {
  const clone = svgEl.cloneNode(true);

  // 当たり判定は書き出さない
  clone.querySelectorAll('.hits').forEach((n) => n.remove());
  // 画面表示用の拡大率・市松模様は書き出しに持ち込まない
  clone.removeAttribute('style');
  clone.removeAttribute('class');

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const vb = svgEl.getAttribute('viewBox').split(/\s+/).map(Number);
  if (dpi) {
    // ラスタライズ用: px で寸法を与える
    clone.setAttribute('width', String(mmToPx(vb[2], dpi)));
    clone.setAttribute('height', String(mmToPx(vb[3], dpi)));
  } else {
    // ベクタ書き出し用: mm のまま
    clone.setAttribute('width', `${vb[2]}mm`);
    clone.setAttribute('height', `${vb[3]}mm`);
  }

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

/** SVG 文字列を Image として読み込む */
function loadImage(svgStr) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * 背景透過PNG を作る
 * @param {SVGSVGElement} svgEl プレビューの svg
 * @param {number} dpi
 * @returns {Promise<Blob>}
 */
export async function toPNGBlob(svgEl, dpi) {
  const vb = svgEl.getAttribute('viewBox').split(/\s+/).map(Number);
  const w = mmToPx(vb[2], dpi);
  const h = mmToPx(vb[3], dpi);

  const img = await loadImage(toSVGString(svgEl, { dpi }));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // ★ 背景は塗らない（透過を保つ）
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** 一覧表示用の小さなサムネイル（dataURL）。白背景にして見やすくする */
export async function toThumbnail(svgEl, maxW = 200) {
  const vb = svgEl.getAttribute('viewBox').split(/\s+/).map(Number);
  const w = Math.max(1, Math.round(Math.min(maxW, vb[2] * 4)));
  const h = Math.max(1, Math.round((w / vb[2]) * vb[3]));
  // 幅 w px になる dpi を逆算して渡す
  const img = await loadImage(toSVGString(svgEl, { dpi: (w / vb[2]) * MM_PER_INCH }));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  // ★PNG(base64)だと1件20〜40KBになり localStorage(5MB) をすぐ圧迫する。
  // 白背景のサムネイルなので JPEG で十分（1件3〜6KB程度に収まる）。
  return canvas.toDataURL('image/jpeg', 0.7);
}

/** Blob / dataURL をダウンロードさせる */
export function download(data, filename) {
  const a = document.createElement('a');
  a.download = filename;
  a.href = (data instanceof Blob) ? URL.createObjectURL(data) : data;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (data instanceof Blob) setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** ファイル名に使えない文字を落とす */
export function safeName(s, fallback = '数直線') {
  const t = String(s || '').trim().replace(/[\\/:*?"<>|]/g, '_');
  return t || fallback;
}
