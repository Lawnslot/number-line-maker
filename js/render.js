/* ============================================================
   render.js — ドキュメント → SVG の描画
   ------------------------------------------------------------
   ・長さの単位はすべて mm（SVG のユーザー単位 = mm として扱う）
   ・分数・ルビは MathJax 等を使わず、text と line を自前で配置して組む
     （SVG を <img> 経由でラスタライズするとき、外部リソースが読めないため）
   ・背景は一切塗らない（＝透過PNGを担保する）
   ============================================================ */

import { tickValue, fmtNum, tickLevel, tickLength, tickOf, axisLineLength } from './model.js';

const NS = 'http://www.w3.org/2000/svg';

/* 教科書体を優先する。Windows 10+ は UD デジタル教科書体、Mac は游教科書体を持つ。
   OS 搭載フォントはラスタライズ時も使えるが、Webフォント(@font-face)は使えない。 */
export const FONT_STACK =
  '"UD Digi Kyokasho NK-R","UD デジタル教科書体 NK-R","YuKyokasho Yoko","游教科書体",' +
  '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif';

/* ---------- 小さなヘルパー ---------- */

function E(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

function txt(s, x, y, size, fill) {
  return E('text', { x: r(x), y: r(y), 'font-size': r(size), 'text-anchor': 'middle', fill }, String(s ?? ''));
}

const r = (n) => Math.round(n * 1000) / 1000;

/** 文字幅のおおよその見積り（分数の横線の長さを決めるのに使う） */
function estW(s, fs) {
  let w = 0;
  for (const ch of String(s ?? '')) w += /[\x20-\x7E]/.test(ch) ? 0.56 : 1.0;
  return w * fs;
}

/* ---------- ラベルの解決と寸法 ---------- */

/** 目盛り i に実際に出すラベルを決める */
function resolveLabel(a, i) {
  const ov = tickOf(a, i);
  const lift = Math.max(0, Number(ov.lift) || 0);
  const common = { ruby: ov.ruby, lift, pointer: !!ov.pointer && lift > 0 };
  switch (ov.mode) {
    case 'none':
      return { mode: 'none' };
    case 'text':
      return { mode: 'text', text: ov.text, ...common };
    case 'fraction':
      return { mode: 'fraction', whole: ov.whole, num: ov.num, den: ov.den, ...common };
    case 'box':
      return { mode: 'box', boxW: ov.boxW ?? a.boxW, boxH: ov.boxH ?? a.boxH, ...common };
    default: // 'auto'
      if (a.labelEvery > 0 && i % a.labelEvery === 0) {
        return { mode: 'text', text: autoText(a, i), ...common };
      }
      return { mode: 'none' };
  }
}

/** 自動ラベルの文字列（「50」＋「万」＝「50万」。0 には付けない設定あり） */
function autoText(a, i) {
  const v = tickValue(a, i);
  const body = fmtNum(v);
  if (a.suffixSkipZero && v === 0) return body;
  return (a.labelPrefix || '') + body + (a.labelSuffix || '');
}

/** ラベル1つ分の高さ（mm）。labelBlock() と必ず一致させること */
function blockHeight(spec, a) {
  if (spec.mode === 'none') return 0;
  const fs = a.fontSize;
  // 引き出し（線から離す距離）はラベルの外側に積む
  let h = spec.ruby ? fs * 0.62 * 1.15 : 0;
  if (spec.mode === 'box') h += Number(spec.boxH);
  else if (spec.mode === 'fraction') h += fs * 2.25;
  else h += fs * 1.0;
  return h + (Number(spec.lift) || 0);
}

/** ラベル1つを描く。返り値の node は「上端が y=0・中心が x=0」に組まれている */
function labelBlock(spec, a) {
  const fs = a.fontSize;
  const g = E('g');
  let y = 0;

  if (spec.ruby) {
    const rfs = fs * 0.62;
    g.appendChild(txt(spec.ruby, 0, y + rfs * 0.86, rfs, a.color));
    y += rfs * 1.15;
  }

  if (spec.mode === 'box') {
    const w = Number(spec.boxW), h = Number(spec.boxH);
    const rect = E('rect', {
      x: r(-w / 2), y: r(y), width: r(w), height: r(h),
      fill: 'none', stroke: a.color, 'stroke-width': r(Math.max(a.lineWidth * 0.8, 0.2)),
    });
    if (a.boxDashed) rect.setAttribute('stroke-dasharray', '1.3 1.0');
    g.appendChild(rect);
    y += h;

  } else if (spec.mode === 'fraction') {
    const num = String(spec.num ?? ''), den = String(spec.den ?? '');
    const whole = String(spec.whole ?? '').trim();
    const ffs = fs * 0.92;
    const barW = Math.max(estW(num, ffs), estW(den, ffs)) + ffs * 0.34;
    const wW = whole ? estW(whole, fs) + fs * 0.12 : 0;
    const left = -(wW + barW) / 2;
    const barY = y + fs * 1.06;
    const fcx = left + wW + barW / 2;

    if (whole) g.appendChild(txt(whole, left + wW / 2, barY + fs * 0.36, fs, a.color));
    g.appendChild(txt(num, fcx, y + ffs * 0.92, ffs, a.color));
    g.appendChild(E('line', {
      x1: r(fcx - barW / 2), y1: r(barY), x2: r(fcx + barW / 2), y2: r(barY),
      stroke: a.color, 'stroke-width': r(Math.max(a.lineWidth * 0.7, 0.22)), 'stroke-linecap': 'round',
    }));
    g.appendChild(txt(den, fcx, barY + ffs * 1.0, ffs, a.color));
    y += fs * 2.25;

  } else {
    g.appendChild(txt(spec.text, 0, y + fs * 0.86, fs, a.color));
    y += fs * 1.0;
  }

  return { node: g, h: y };
}

/* ---------- 軸の寸法 ---------- */

/** その軸で出る可能性のある目盛りの最大長（ラベルの高さを揃えるために使う） */
function maxTickLen(a) {
  let m = a.lenMinor;
  if (a.midEvery > 0) m = Math.max(m, a.lenMid);
  if (a.majorEvery > 0) m = Math.max(m, a.lenMajor);
  return m;
}

/** 軸の上下方向の広がり（線を y=0 としたときの上側／下側の高さ） */
export function axisExtents(a) {
  const mt = maxTickLen(a);
  const up = (a.tickSide === 'up' || a.tickSide === 'both') ? mt : 0;
  const down = (a.tickSide === 'down' || a.tickSide === 'both') ? mt : 0;

  let lh = 0;
  for (let i = 0; i <= a.tickCount; i++) lh = Math.max(lh, blockHeight(resolveLabel(a, i), a));

  let above = up, below = down;
  if (a.labelSide === 'up') above = up + a.labelGap + lh;
  else below = down + a.labelGap + lh;

  const half = a.fontSize * 0.6;   // 単位欄のぶん最低限確保
  return { above: Math.max(above, half), below: Math.max(below, half), up, down, labelH: lh };
}

/* ---------- 端の処理 ---------- */

function endMark(g, kind, x, y, dir, a) {
  if (kind === 'arrow') {
    const L = a.fontSize * 0.85, W = a.fontSize * 0.5;
    g.appendChild(E('polygon', {
      points: `${r(x)},${r(y)} ${r(x - dir * L)},${r(y - W / 2)} ${r(x - dir * L)},${r(y + W / 2)}`,
      fill: a.color,
    }));
  } else if (kind === 'cap') {
    const h = a.fontSize * 0.55;
    g.appendChild(E('line', {
      x1: r(x), y1: r(y - h), x2: r(x), y2: r(y + h),
      stroke: a.color, 'stroke-width': r(a.lineWidth),
    }));
  } else if (kind === 'wave') {
    // 省略を表す二重斜線
    const h = a.fontSize * 0.75, s = a.fontSize * 0.3;
    for (const off of [-s * 0.95, s * 0.95]) {
      g.appendChild(E('path', {
        d: `M ${r(x + off - s * 0.55)} ${r(y + h / 2)} L ${r(x + off + s * 0.55)} ${r(y - h / 2)}`,
        stroke: a.color, 'stroke-width': r(Math.max(a.lineWidth * 0.9, 0.22)),
        fill: 'none', 'stroke-linecap': 'round',
      }));
    }
  }
}

/** 引き出した□から目盛りへ向かう矢印（教科書の「□↓」の形） */
function pointerArrow(g, x, yFrom, yTo, a) {
  const fs = a.fontSize;
  const w = fs * 0.22, hw = fs * 0.5, hl = fs * 0.55;
  const dir = yTo > yFrom ? 1 : -1;
  const base = yTo - dir * hl;
  const pts = [
    [x - w / 2, yFrom], [x + w / 2, yFrom], [x + w / 2, base], [x + hw / 2, base],
    [x, yTo], [x - hw / 2, base], [x - w / 2, base],
  ];
  g.appendChild(E('polygon', {
    points: pts.map((p) => `${r(p[0])},${r(p[1])}`).join(' '),
    fill: a.pointerColor || '#8c8c8c',
  }));
}

/* ---------- 軸1本を描く ---------- */

function drawAxis(g, a, y) {
  const len = axisLineLength(a);
  const ex = axisExtents(a);

  // 本線
  g.appendChild(E('line', {
    x1: 0, y1: r(y), x2: r(len), y2: r(y),
    stroke: a.color, 'stroke-width': r(a.lineWidth), 'stroke-linecap': 'butt',
  }));
  endMark(g, a.endLeft, 0, y, -1, a);
  endMark(g, a.endRight, len, y, 1, a);

  // 目盛りとラベル
  for (let i = 0; i <= a.tickCount; i++) {
    const x = a.leadIn + i * a.tickStep;
    const ov = tickOf(a, i);

    if (ov.tickShow !== false) {
      const L = tickLength(a, i);
      const y1 = (a.tickSide === 'down') ? y : y - L;
      const y2 = (a.tickSide === 'up') ? y : y + L;
      const t = E('line', {
        x1: r(x), y1: r(y1), x2: r(x), y2: r(y2),
        stroke: a.color, 'stroke-width': r(Math.max(a.lineWidth * 0.85, 0.18)),
      });
      if (a.tickStyle === 'dashed') t.setAttribute('stroke-dasharray', '0.9 0.7');
      g.appendChild(t);
    }

    const spec = resolveLabel(a, i);
    if (spec.mode !== 'none') {
      const { node, h } = labelBlock(spec, a);
      const lift = Number(spec.lift) || 0;
      const up = (a.labelSide === 'up');
      const top = up
        ? y - ex.up - a.labelGap - lift - h
        : y + ex.down + a.labelGap + lift;
      node.setAttribute('transform', `translate(${r(x)},${r(top)})`);
      g.appendChild(node);

      if (spec.pointer) {
        const tipGap = 0.4;
        if (up) pointerArrow(g, x, top + h + 0.3, y - ex.up - tipGap, a);
        else pointerArrow(g, x, top - 0.3, y + ex.down + tipGap, a);
      }
    }
  }

  // 単位欄（右端）
  if (a.unit) {
    g.appendChild(E('text', {
      x: r(len + a.unitGap), y: r(y + a.fontSize * 0.36),
      'font-size': r(a.fontSize), 'text-anchor': 'start', fill: a.color,
    }, `(${a.unit})`));
  }
}

/* ---------- 全体を組み立てる ---------- */

/** 作品本体の <g> と各軸の y 座標を返す */
export function buildArt(doc) {
  const g = E('g', { class: 'art' });
  const ext = doc.axes.map(axisExtents);

  // 軸の y 座標。指定した間隔を基本にしつつ、ラベルが重なる場合は押し広げる
  const ys = [];
  for (let i = 0; i < doc.axes.length; i++) {
    if (i === 0) { ys.push(ext[0].above); continue; }
    const need = ext[i - 1].below + ext[i].above + 2;
    ys.push(ys[i - 1] + Math.max(doc.axisGap, need));
  }

  // 連結線は先に描いて下に敷く
  if (doc.axes.length > 1) {
    const a0 = doc.axes[0], yT = ys[0], yB = ys[ys.length - 1];
    if (doc.joinLeft) {
      g.appendChild(E('line', {
        x1: r(a0.leadIn), y1: r(yT), x2: r(a0.leadIn), y2: r(yB),
        stroke: a0.color, 'stroke-width': r(a0.lineWidth),
      }));
    }
    for (const idx of doc.connectors) {
      const i = Number(idx);
      if (!Number.isFinite(i)) continue;
      const x = a0.leadIn + i * a0.tickStep;
      g.appendChild(E('line', {
        x1: r(x), y1: r(yT), x2: r(x), y2: r(yB),
        stroke: a0.color, 'stroke-width': r(Math.max(a0.lineWidth * 0.65, 0.18)),
        'stroke-dasharray': '1.6 1.3',
      }));
    }
  }

  doc.axes.forEach((a, i) => drawAxis(g, a, ys[i]));
  return { g, ys, ext };
}

/** 目盛りクリック用の当たり判定（本体の寸法に影響させないため別グループにする） */
function buildHits(doc, ys, ext, selected) {
  const g = E('g', { class: 'hits' });
  doc.axes.forEach((a, ai) => {
    const e = ext[ai];
    for (let i = 0; i <= a.tickCount; i++) {
      const x = a.leadIn + i * a.tickStep;
      const w = Math.max(a.tickStep, 2.2);
      const rect = E('rect', {
        x: r(x - w / 2), y: r(ys[ai] - e.above - 1),
        width: r(w), height: r(e.above + e.below + 2),
        fill: 'transparent', class: 'tick-hit',
      });
      rect.dataset.ai = String(ai);
      rect.dataset.i = String(i);
      if (selected && selected.ai === ai && selected.i === i) {
        rect.setAttribute('fill', 'rgba(37,99,235,.12)');
        rect.setAttribute('stroke', '#2563eb');
        rect.setAttribute('stroke-width', '0.25');
      }
      g.appendChild(rect);
    }
  });
  return g;
}

/* ---------- 公開: プレビューへ描画 ---------- */

/**
 * doc を svgEl に描画し、viewBox（= 書き出される領域, mm）を返す。
 * svgEl は画面に表示されている必要がある（getBBox のため）。
 */
export function render(doc, svgEl, { interactive = true, selected = null } = {}) {
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const style = document.createElementNS(NS, 'style');
  style.textContent = `text{font-family:${FONT_STACK};}`;
  svgEl.appendChild(style);

  const { g, ys, ext } = buildArt(doc);
  svgEl.appendChild(g);

  const bb = g.getBBox();
  const vb = {
    x: bb.x - doc.padL,
    y: bb.y - doc.padT,
    w: bb.width + doc.padL + doc.padR,
    h: bb.height + doc.padT + doc.padB,
  };
  svgEl.setAttribute('xmlns', NS);
  svgEl.setAttribute('viewBox', `${r(vb.x)} ${r(vb.y)} ${r(vb.w)} ${r(vb.h)}`);
  svgEl.setAttribute('width', `${r(vb.w)}mm`);
  svgEl.setAttribute('height', `${r(vb.h)}mm`);

  if (interactive) svgEl.appendChild(buildHits(doc, ys, ext, selected));

  return vb;
}

/* ---------- 公開: 用紙サイズ感プレビュー ---------- */

/**
 * 用紙の上に実寸で置いた姿を描く（あくまで参考表示。合わせる機能は作らない）
 * 返り値: { ratio: 本文幅に対する占有率, artW, artH }
 */
export function renderPage(doc, svgEl, paper) {
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const style = document.createElementNS(NS, 'style');
  style.textContent = `text{font-family:${FONT_STACK};}`;
  svgEl.appendChild(style);

  const m = doc.paperMargin;
  svgEl.setAttribute('viewBox', `-3 -3 ${paper.w + 6} ${paper.h + 6}`);

  // 用紙
  svgEl.appendChild(E('rect', {
    x: 0, y: 0, width: paper.w, height: paper.h,
    fill: '#ffffff', stroke: '#b4b8c0', 'stroke-width': 0.5,
  }));
  // 本文領域の目安
  svgEl.appendChild(E('rect', {
    x: m, y: m, width: paper.w - m * 2, height: paper.h - m * 2,
    fill: 'none', stroke: '#d8dbe2', 'stroke-width': 0.35, 'stroke-dasharray': '2 2',
  }));

  const { g } = buildArt(doc);
  svgEl.appendChild(g);
  const bb = g.getBBox();
  g.setAttribute('transform', `translate(${r(m - bb.x + doc.padL)},${r(m - bb.y + doc.padT)})`);

  const artW = bb.width + doc.padL + doc.padR;
  const artH = bb.height + doc.padT + doc.padB;
  const bodyW = paper.w - m * 2;

  // はみ出しは「参考」として薄く示すだけ（警告は出さない）
  if (artW > bodyW) {
    svgEl.appendChild(E('line', {
      x1: paper.w - m, y1: m - 3, x2: paper.w - m, y2: m + artH + 3,
      stroke: '#f0a0a0', 'stroke-width': 0.5,
    }));
  }

  return { ratio: artW / bodyW, artW, artH, bodyW };
}
