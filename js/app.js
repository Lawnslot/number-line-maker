/* ============================================================
   app.js — 画面の組み立てとイベント
   ------------------------------------------------------------
   方針（2026-10-01 本人指摘で全面改修）:
   ・左の設定バーをやめ、縦一列「基本バー → プレビュー → 書き出し」にする
     （1つずつ作る前提。プレビューは中身の高さだけで、余白を作らない）
   ・目盛りの編集は、クリックした目盛りの「すぐそば」に小さな窓を出す
   ・細かい設定は「詳しい設定」を開いたときだけ見せる
   ============================================================ */

import {
  PAPERS, PRESETS, defaultDoc, defaultAxis, fmtValue, normalizeDoc,
  tickOf, setTick, applySync, cloneDoc,
} from './model.js?v=6';
import { render, renderPage } from './render.js?v=6';
import { toPNGBlob, toSVGString, toThumbnail, download, safeName, mmToPx } from './export.js?v=6';
import { storage } from './storage.js?v=6';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- 状態 ---------- */
let doc = defaultDoc();
let curId = null;      // ライブラリ上のID（未保存なら null）
let axIdx = 0;         // 編集中の軸
let sel = null;        // 選択中の目盛り {ai, i}
let zoom = null;   // null = 画面の幅に合わせる（目盛りを押しやすい大きさにする）
let zoomNow = 1;   // いま実際に掛かっている倍率

const preview = $('#preview');
const pagePreview = $('#pagePreview');
const pop = $('#tickPop');

/* 全軸でそろえる対象のキー */
const SYNC_KEYS = new Set(['tickCount', 'tickStep', 'leadIn', 'leadOut']);
/* doc 側で数値として扱うキー */
const DOC_NUM = new Set(['axisGap', 'padT', 'padR', 'padB', 'padL', 'dpi', 'paperMargin']);

/* ---------- 小物 ---------- */

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 1900);
}

function readControl(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number') {
    if (el.value === '') return null;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : 0;
  }
  return el.value;
}

function writeControl(el, v) {
  if (el.type === 'checkbox') el.checked = !!v;
  else if (document.activeElement !== el) el.value = (v == null ? '' : v);
}

const axis = () => doc.axes[axIdx];

/* ---------- 描画と反映 ---------- */

let saveTimer = null;

function refresh({ skipPanel = false } = {}) {
  applySync(doc);
  if (axIdx >= doc.axes.length) axIdx = doc.axes.length - 1;
  if (sel && (sel.ai >= doc.axes.length || sel.i > doc.axes[sel.ai].tickCount)) sel = null;

  // プレビュー（中身の大きさだけ使う）
  const vb = render(doc, preview, { interactive: true, selected: sel });
  preview.classList.toggle('checker', $('#chkChecker').checked);
  const PX_PER_MM = 96 / 25.4;
  const avail = $('#previewWrap').clientWidth - 36;
  const fit = Math.max(0.5, Math.min(2.2, avail / (vb.w * PX_PER_MM)));
  zoomNow = zoom ?? fit;
  preview.style.width = `${(vb.w * zoomNow).toFixed(2)}mm`;
  preview.style.height = 'auto';

  $('#sizeInfo').textContent =
    `出力 ${vb.w.toFixed(1)}×${vb.h.toFixed(1)}mm / ${mmToPx(vb.w, doc.dpi)}×${mmToPx(vb.h, doc.dpi)}px（${doc.dpi}dpi）`;

  // 用紙サイズ感（「詳しい設定」を開いているときだけ描く。隠れた svg は getBBox できない）
  if (pagePreview.offsetParent) {
    const paper = PAPERS[doc.paper] || PAPERS.a4p;
    const info = renderPage(doc, pagePreview, paper);
    $('#pageInfo').textContent =
      `${paper.label}の本文幅(${info.bodyW}mm)に対して ${Math.round(info.ratio * 100)}%` +
      (info.ratio > 1 ? '　← 本文幅より広い' : '');
  }

  if (!skipPanel) syncPanel();
  $('#zoomInfo').textContent = `${Math.round(zoomNow * 100)}%`;
  $('#btnZoomFit').disabled = (zoom === null);

  // 編集窓を目盛りのそばへ。
  // ★requestAnimationFrame は画面が前面にないと発火しないことがあるので同期で呼ぶ
  //   （2026-10-01: これが原因で「編集窓が開かない」ことがあった）
  placePop();

  // 自動保存（リロード事故よけ）
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    storage.saveCurrent({ doc, curId, axIdx, name: $('#docName').value, unitName: $('#docUnit').value });
  }, 400);
}

function showStepHint(a) {
  const mm = Math.round(a.tickStep * a.tickCount * 10) / 10;
  $('#stepHint').textContent =
    `1目盛り = ${fmtValue(a, a.valueStep)}${a.labelSuffix || ''}　／　` +
    `${fmtValue(a, a.start)} から ${fmtValue(a, a.start + a.valueStep * a.tickCount)} まで　／　線の長さ ${mm}mm`;
}

function syncPanel() {
  const a = axis();
  const n = doc.axes.length;

  // 形
  $$('#shapeSeg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === n));
  $('#multiCard').hidden = n < 2;
  $('#connWrap').hidden = n < 2;

  // 軸タブ（2本以上のときだけ）
  const tabs = $('#axisTabs');
  tabs.hidden = n < 2;
  tabs.innerHTML = '';
  if (n >= 2) {
    doc.axes.forEach((ax, i) => {
      const b = document.createElement('button');
      const name = (n === 2) ? (i === 0 ? '上の線' : '下の線') : `${i + 1}本目`;
      b.textContent = name + (ax.unit ? `（${ax.unit}）` : '');
      if (i === axIdx) b.classList.add('on');
      b.onclick = () => { axIdx = i; sel = null; refresh(); };
      tabs.appendChild(b);
    });
    if (n < 6) {
      const add = document.createElement('button');
      add.textContent = '＋';
      add.className = 'ghost';
      add.title = '数直線を増やす';
      add.onclick = () => { addAxis(); axIdx = doc.axes.length - 1; sel = null; refresh(); };
      tabs.appendChild(add);
    }
  }

  // おわりの数（はじめ・目盛りの数から 1目盛りの値を逆算して表示）
  writeControl($('#endValue'), String(Math.round((a.start + a.valueStep * a.tickCount) * 1e8) / 1e8));
  showStepHint(a);

  // 数字を出す間隔（一覧にない値なら足す）
  const les = $('#labelEverySel');
  if (![...les.options].some((o) => o.value === String(a.labelEvery))) {
    const o = document.createElement('option');
    o.value = String(a.labelEvery);
    o.textContent = `${a.labelEvery}目盛りごと`;
    les.appendChild(o);
  }
  writeControl(les, String(a.labelEvery));

  // 選択式ボタン（向き・位置）
  $$('[data-seg-ax]').forEach((seg) => {
    const k = seg.dataset.segAx;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === a[k]));
  });

  // 軸・全体の各項目
  $$('[data-ax]').forEach((el) => writeControl(el, a[el.dataset.ax]));
  $$('[data-doc]').forEach((el) => writeControl(el, doc[el.dataset.doc]));

  // 縦の破線チップ
  const chips = $('#connList');
  chips.innerHTML = '';
  if (!doc.connectors.length) {
    const s = document.createElement('span');
    s.className = 'none';
    s.textContent = 'なし';
    chips.appendChild(s);
  } else {
    [...doc.connectors].sort((x, y) => x - y).forEach((i) => {
      const s = document.createElement('span');
      s.textContent = `第${i}目盛り ×`;
      s.title = 'クリックで削除';
      s.style.cursor = 'pointer';
      s.onclick = () => { doc.connectors = doc.connectors.filter((v) => v !== i); refresh(); };
      chips.appendChild(s);
    });
  }

  // 編集窓の中身
  if (sel) {
    const av = doc.axes[sel.ai];
    const ov = tickOf(av, sel.i);
    const who = n > 1 ? `${n === 2 ? (sel.ai === 0 ? '上の線' : '下の線') : `${sel.ai + 1}本目`}・` : '';
    $('#tickWho').textContent =
      `${who}${fmtValue(av, av.start + av.valueStep * sel.i)}${av.labelSuffix || ''} の目盛り`;
    pop.dataset.mode = ov.mode;
    $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === ov.mode));
    $$('[data-seg-tick]').forEach((seg) => {
      const k = seg.dataset.segTick;
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (ov[k] || 'auto')));
    });
    $$('[data-tick]').forEach((el) => writeControl(el, ov[el.dataset.tick]));
    $('#tickConnector').checked = doc.connectors.includes(sel.i);
  }
}

/* 編集窓を、選んだ目盛りのすぐ下に出す */
function placePop() {
  if (!sel) { pop.hidden = true; return; }
  const hit = preview.querySelector(`.tick-hit[data-ai="${sel.ai}"][data-i="${sel.i}"]`);
  if (!hit) { pop.hidden = true; return; }
  pop.hidden = false;
  const card = $('#previewCard').getBoundingClientRect();
  const hr = hit.getBoundingClientRect();
  let x = hr.left + hr.width / 2 - card.left - pop.offsetWidth / 2;
  x = Math.max(8, Math.min(x, card.width - pop.offsetWidth - 8));
  pop.style.left = `${x}px`;
  pop.style.top = `${hr.bottom - card.top + 8}px`;
}

/* ---------- 入力のバインド ---------- */

document.addEventListener('input', (ev) => {
  const el = ev.target;

  if (el.dataset.doc) {
    const k = el.dataset.doc;
    let v = readControl(el);
    if (DOC_NUM.has(k)) v = Number(v) || 0;
    doc[k] = v;
    refresh({ skipPanel: true });
    return;
  }

  if (el.dataset.ax) {
    const k = el.dataset.ax;
    const v = readControl(el);
    // 打っている途中の「空」や 0 は取り込まない（目盛りが消えたり、線が崩れたりするため）
    if (el.type === 'number' && v === null) return;
    if ((k === 'tickCount' || k === 'tickStep') && !(v > 0)) return;

    const targets = (doc.syncTicks && SYNC_KEYS.has(k)) ? doc.axes : [axis()];
    for (const a of targets) {
      // ★「おわりの数」は動かさない。はじめの数・目盛りの数を変えたら、1目盛りの値のほうを計算し直す
      //   （以前は 1目盛りの値を固定していたので、目盛りの数を変えると おわりの数 が勝手に変わった）
      const end = a.start + a.valueStep * a.tickCount;
      a[k] = (k === 'tickCount') ? Math.floor(v) : v;
      if ((k === 'start' || k === 'tickCount') && a.tickCount > 0) a.valueStep = (end - a.start) / a.tickCount;
    }
    refresh({ skipPanel: true });
    showStepHint(axis());
    if (k === 'labelSuffix' || k === 'unit' || k === 'kanji') syncPanel();
    return;
  }

  if (el.dataset.tick && sel) {
    const k = el.dataset.tick;
    let v = readControl(el);
    if ((k === 'boxW' || k === 'boxH') && (v === null || v === '')) v = null;
    if (k === 'lift' && v === null) v = 0;
    setTick(doc.axes[sel.ai], sel.i, { [k]: v });
    // 「矢印でさす」をONにしたとき、まだ引き出していなければ 7mm 引き出す
    if (k === 'pointer' && v && !tickOf(doc.axes[sel.ai], sel.i).lift) {
      setTick(doc.axes[sel.ai], sel.i, { lift: 7 });
    }
    refresh();
  }
});

/* 編集窓: 出す位置（上／下）の切り替え */
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-seg-tick] button');
  if (!b || !sel) return;
  setTick(doc.axes[sel.ai], sel.i, { [b.parentElement.dataset.segTick]: b.dataset.v });
  refresh();
});

/* 「記号で問う」＝ 数字の反対側に文字＋矢印を一発で用意する */
$('#btnMark').onclick = () => {
  if (!sel) return;
  const a = doc.axes[sel.ai];
  const opposite = a.labelSide === 'up' ? 'down' : 'up';
  const used = new Set(Object.values(a.ticks).map((t) => t && t.text).filter(Boolean));
  const next = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ'].find((c) => !used.has(c)) || 'ア';
  setTick(a, sel.i, { mode: 'text', text: next, side: opposite, pointer: true, lift: 6 });
  refresh();
  const inp = pop.querySelector('[data-tick=text]');
  if (inp) { inp.focus(); inp.select(); }
};

/* 編集窓: 出すものの切り替え */
$('#modeSeg').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || !sel) return;
  setTick(doc.axes[sel.ai], sel.i, { mode: b.dataset.m });
  refresh();
  const first = pop.querySelector(b.dataset.m === 'fraction' ? '[data-tick=num]' : '[data-tick=text]');
  if (first && (b.dataset.m === 'text' || b.dataset.m === 'fraction')) { first.focus(); first.select(); }
});

/* 目盛りクリックで編集窓を開く */
preview.addEventListener('click', (ev) => {
  const hit = ev.target.closest('.tick-hit');
  if (!hit) return;
  sel = { ai: Number(hit.dataset.ai), i: Number(hit.dataset.i) };
  axIdx = sel.ai;
  refresh();
});

/* 編集窓を閉じる: ×・外側クリック・Escape */
function closePop() { if (sel) { sel = null; refresh(); } }
$('#popClose').onclick = closePop;
document.addEventListener('pointerdown', (ev) => {
  if (!sel) return;
  if (ev.target.closest('#tickPop') || ev.target.closest('.tick-hit')) return;
  closePop();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { closePop(); return; }
  if (!sel || /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
  if (ev.key === 'ArrowLeft' && sel.i > 0) { sel = { ...sel, i: sel.i - 1 }; refresh(); ev.preventDefault(); }
  if (ev.key === 'ArrowRight' && sel.i < doc.axes[sel.ai].tickCount) { sel = { ...sel, i: sel.i + 1 }; refresh(); ev.preventDefault(); }
});

/* 縦の破線 */
$('#tickConnector').addEventListener('change', (ev) => {
  if (!sel) return;
  if (ev.target.checked) {
    if (!doc.connectors.includes(sel.i)) doc.connectors.push(sel.i);
  } else {
    doc.connectors = doc.connectors.filter((v) => v !== sel.i);
  }
  refresh();
});

$('#btnTickReset').onclick = () => {
  if (!sel) return;
  delete doc.axes[sel.ai].ticks[sel.i];
  refresh();
};

/* 目盛りの長さを3つまとめて */
function scaleLens(f) {
  const a = axis();
  a.lenMinor = Math.max(0, Math.round(a.lenMinor * f * 100) / 100);
  a.lenMid = Math.max(0, Math.round(a.lenMid * f * 100) / 100);
  a.lenMajor = Math.max(0, Math.round(a.lenMajor * f * 100) / 100);
  refresh();
}
$('#btnLenUp').onclick = () => scaleLens(1.15);
$('#btnLenDown').onclick = () => scaleLens(1 / 1.15);

/* 形（1本 / 2本） */
function addAxis() {
  const base = doc.axes[doc.axes.length - 1];
  doc.axes.push(defaultAxis({
    tickCount: base.tickCount, tickStep: base.tickStep,
    leadIn: base.leadIn, leadOut: base.leadOut,
    fontSize: base.fontSize, lineWidth: base.lineWidth,
    labelSide: 'down', tickSide: 'down',
  }));
  if (doc.axes.length === 2) {   // 1本 → 2本: 比例数直線の形にそろえる
    doc.axes[0].labelSide = 'up';
    doc.axes[0].tickSide = 'up';
  }
}

$('#shapeSeg').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const n = Number(b.dataset.n);
  while (doc.axes.length > n) doc.axes.pop();
  while (doc.axes.length < n) addAxis();
  if (n === 1) { doc.axes[0].tickSide = 'up'; doc.axes[0].labelSide = 'up'; }
  axIdx = 0; sel = null;
  refresh();
});

/* 向き・位置の選択式ボタン */
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-seg-ax] button');
  if (!b) return;
  axis()[b.parentElement.dataset.segAx] = b.dataset.v;
  refresh();
});

/* おわりの数 → 1目盛りの値を逆算 */
$('#endValue').addEventListener('input', () => {
  const a = axis();
  const end = parseFloat($('#endValue').value);
  if (!Number.isFinite(end) || a.tickCount <= 0) return;
  a.valueStep = (end - a.start) / a.tickCount;
  refresh({ skipPanel: true });
  showStepHint(a);
});

/* 数字を出す間隔 */
$('#labelEverySel').addEventListener('change', () => {
  const v = $('#labelEverySel').value;
  axis().labelEvery = (v === 'auto' || v === 'ends') ? v : (Number(v) || 0);
  refresh();
});

/* 表示 */
$('#chkChecker').onchange = (e) => preview.classList.toggle('checker', e.target.checked);
$('#btnZoomIn').onclick = () => { zoom = Math.min(6, zoomNow * 1.25); refresh({ skipPanel: true }); };
$('#btnZoomOut').onclick = () => { zoom = Math.max(0.2, zoomNow / 1.25); refresh({ skipPanel: true }); };
$('#btnZoomFit').onclick = () => { zoom = null; refresh({ skipPanel: true }); };
window.addEventListener('resize', () => refresh({ skipPanel: true }));

/* 詳しい設定 */
$('#btnMore').onclick = () => {
  const p = $('#morePanel');
  p.hidden = !p.hidden;
  $('#btnMore').textContent = p.hidden ? '詳しい設定 ▾' : '詳しい設定 ▴';
  refresh();   // 用紙プレビューを描くため
};

/* ---------- 書き出し ---------- */

$('#btnPNG').onclick = async () => {
  const blob = await toPNGBlob(preview, doc.dpi);
  download(blob, `${safeName($('#docName').value)}.png`);
  toast('透過PNGを書き出しました');
};

$('#btnSVG').onclick = () => {
  const str = toSVGString(preview);
  download(new Blob([str], { type: 'image/svg+xml' }), `${safeName($('#docName').value)}.svg`);
  toast('SVGを書き出しました');
};

/* ---------- 作品（保存・複製・新規） ---------- */

async function saveWork({ asNew = false } = {}) {
  const name = $('#docName').value.trim() || '名前のない数直線';
  const thumb = await toThumbnail(preview, 200);
  const id = await storage.save({
    id: asNew ? null : curId,
    name, unitName: $('#docUnit').value.trim(), memo: doc.memo || '',
    doc: cloneDoc(doc), thumb,
  });
  curId = id;
  return id;
}

$('#btnSave').onclick = async () => {
  await saveWork();
  const u = await storage.usage();
  toast(`ライブラリに保存しました（全${u.count}件）。「ライブラリ」からいつでも開けます`);
};

$('#btnDup').onclick = async () => {
  $('#docName').value = ($('#docName').value.trim() || '数直線') + ' コピー';
  await saveWork({ asNew: true });
  toast('複製しました。数字を直して書き出せます');
  refresh();
};

$('#btnNew').onclick = () => {
  if (!confirm('新しく作り直します。保存していない変更は消えます。')) return;
  doc = defaultDoc();
  curId = null; axIdx = 0; sel = null;
  $('#docName').value = ''; $('#docUnit').value = '';
  refresh();
};

/* ---------- 型から始める（チップ） ---------- */

const chipsNav = $('#presetChips');
for (const p of Object.values(PRESETS)) {
  const b = document.createElement('button');
  b.textContent = p.label;
  b.onclick = () => {
    doc = p.make();
    curId = null; axIdx = 0; sel = null;
    refresh();
    toast(`「${p.label}」を読み込みました`);
  };
  chipsNav.appendChild(b);
}

/* ---------- 用紙 ---------- */

const paperSel = $('#paperSel');
for (const [k, p] of Object.entries(PAPERS)) {
  const o = document.createElement('option');
  o.value = k; o.textContent = p.label;
  paperSel.appendChild(o);
}

/* ---------- ライブラリ ---------- */

const libDlg = $('#libDlg');

async function renderLib() {
  const q = $('#libSearch').value.trim();
  const items = (await storage.list()).filter((r) =>
    !q || (r.name || '').includes(q) || (r.unitName || '').includes(q));

  const grid = $('#libGrid');
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<p class="hint">まだ保存された作品がありません。</p>';
  }
  for (const r of items) {
    const card = document.createElement('div');
    card.className = 'libcard';
    const d = new Date(r.updatedAt || 0);
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    card.innerHTML = `
      <div class="thumb">${r.thumb ? `<img alt="" src="${r.thumb}">` : ''}</div>
      <div class="meta"><b></b><small></small></div>
      <div class="acts">
        <button data-act="open">開く</button>
        <button data-act="dup">複製</button>
        <button data-act="del">削除</button>
      </div>`;
    card.querySelector('b').textContent = r.name || '(無題)';
    card.querySelector('small').textContent = `${r.unitName || '—'}　${stamp}`;

    card.querySelector('[data-act=open]').onclick = async () => {
      const rec = await storage.get(r.id);
      if (!rec) return;
      doc = normalizeDoc(cloneDoc(rec.doc));
      curId = rec.id; axIdx = 0; sel = null;
      $('#docName').value = rec.name || '';
      $('#docUnit').value = rec.unitName || '';
      libDlg.close();
      refresh();
      toast('開きました');
    };
    card.querySelector('[data-act=dup]').onclick = async () => {
      const rec = await storage.get(r.id);
      if (!rec) return;
      await storage.save({
        id: null, name: (rec.name || '数直線') + ' コピー',
        unitName: rec.unitName, memo: rec.memo, doc: rec.doc, thumb: rec.thumb,
      });
      renderLib();
      toast('複製しました');
    };
    card.querySelector('[data-act=del]').onclick = async () => {
      if (!confirm(`「${r.name}」を削除します。よろしいですか。`)) return;
      await storage.remove(r.id);
      if (curId === r.id) curId = null;
      renderLib();
    };
    grid.appendChild(card);
  }

  const u = await storage.usage();
  $('#libInfo').textContent =
    `${u.count}件・約${Math.round(u.bytes / 1024)}KB（ブラウザ内に保存。上限の目安5MB）`;
}

$('#btnLib').onclick = () => { renderLib(); libDlg.showModal(); };
$('#btnLibClose').onclick = () => libDlg.close();
$('#libSearch').oninput = () => renderLib();

$('#btnLibExport').onclick = async () => {
  const json = await storage.exportAll();
  download(new Blob([json], { type: 'application/json' }), 'number-line-maker-library.json');
  toast('ライブラリを書き出しました');
};
$('#btnLibImport').onclick = () => $('#libFile').click();
$('#libFile').onchange = async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  try {
    const n = await storage.importAll(await f.text());
    renderLib();
    toast(`${n}件を読み込みました`);
  } catch (e) {
    alert('読み込めませんでした: ' + e.message);
  }
  ev.target.value = '';
};

/* ---------- リンクで作品を受け取る ---------- */

/**
 * URL の #import=… に入っている作品をライブラリへ保存する。
 * 別の端末・別の人へ「この数直線」を渡すための入口。同じ名前・同じ中身のものは二重に入れない。
 * @returns {Promise<number>} 新しく入れた件数（#import が無ければ -1）
 */
async function importFromHash() {
  const m = location.hash.match(/[#&]import=([^&]+)/);
  if (!m) return -1;
  let items;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    items = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    alert('リンクの中身を読めませんでした。');
    return 0;
  }
  history.replaceState(null, '', location.pathname + location.search);

  const have = await storage.list();
  let added = 0, lastId = null;
  for (const it of items) {
    if (!it || !it.doc) continue;
    const d = normalizeDoc(it.doc);
    const same = [];
    for (const h of have) if (h.name === it.name) same.push(await storage.get(h.id));
    const dup = same.find((r) => r && JSON.stringify(normalizeDoc(r.doc)) === JSON.stringify(d));
    if (dup) { lastId = dup.id; continue; }
    // サムネイルを作るために一度プレビューへ描く
    doc = d; axIdx = 0; sel = null;
    render(doc, preview, { interactive: false });
    const thumb = await toThumbnail(preview, 200);
    lastId = await storage.save({
      id: null, name: it.name || '名前のない数直線', unitName: it.unitName || '', memo: '', doc: cloneDoc(d), thumb,
    });
    added++;
  }
  if (lastId) {
    const rec = await storage.get(lastId);
    doc = normalizeDoc(cloneDoc(rec.doc));
    curId = rec.id; axIdx = 0; sel = null;
    $('#docName').value = rec.name || '';
    $('#docUnit').value = rec.unitName || '';
  }
  refresh();
  await renderLib();
  libDlg.showModal();
  const total = (await storage.usage()).count;
  toast(added ? `${added}件をライブラリに保存しました（全${total}件）` : 'すでにライブラリに入っています');
  document.title = `数直線メーカー（ライブラリ ${total}件）`;
  return added;
}

/* ---------- 起動 ---------- */

(async function boot() {
  // ?preset=oku2 で型から開く。&sel=5 で目盛りを選んだ状態にする（動作確認用）
  if (await importFromHash() >= 0) return;

  const q = new URLSearchParams(location.search);
  if (q.get('preset') && PRESETS[q.get('preset')]) {
    doc = PRESETS[q.get('preset')].make();
    if (q.get('sel') != null) sel = { ai: 0, i: Number(q.get('sel')) || 0 };
    refresh();
    return;
  }

  const saved = await storage.loadCurrent();
  if (saved && saved.doc) {
    doc = normalizeDoc(saved.doc);
    curId = saved.curId ?? null;
    axIdx = saved.axIdx ?? 0;
    $('#docName').value = saved.name || '';
    $('#docUnit').value = saved.unitName || '';
  } else {
    doc = PRESETS.basic10.make();
  }
  refresh();
})();
