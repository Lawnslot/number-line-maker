/* ============================================================
   app.js — 画面の組み立てとイベント
   ------------------------------------------------------------
   状態は doc（ドキュメント）1つに集約し、変更があれば refresh() で
   「同期 → 描画 → パネルへ反映 → 自動保存」を通す。
   ============================================================ */

import {
  PAPERS, PRESETS, defaultDoc, defaultAxis, defaultTickOverride,
  tickOf, setTick, applySync, cloneDoc,
} from './model.js';
import { render, renderPage } from './render.js';
import { toPNGBlob, toSVGString, toThumbnail, download, safeName, mmToPx } from './export.js';
import { storage } from './storage.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- 状態 ---------- */
let doc = defaultDoc();
let curId = null;      // ライブラリ上のID（未保存なら null）
let axIdx = 0;         // 編集中の軸
let sel = null;        // 選択中の目盛り {ai, i}
let zoom = 1;

const preview = $('#preview');
const pagePreview = $('#pagePreview');

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

  // プレビュー
  const vb = render(doc, preview, { interactive: true, selected: sel });
  preview.style.width = `${(vb.w * zoom).toFixed(2)}mm`;
  preview.style.height = 'auto';

  // 大きさの表示
  $('#sizeInfo').textContent =
    `${vb.w.toFixed(1)} × ${vb.h.toFixed(1)} mm  /  ${mmToPx(vb.w, doc.dpi)} × ${mmToPx(vb.h, doc.dpi)} px`;

  // 用紙サイズ感
  const paper = PAPERS[doc.paper] || PAPERS.a4p;
  const info = renderPage(doc, pagePreview, paper);
  $('#pageInfo').textContent =
    `${paper.label}の本文幅(${info.bodyW}mm)に対して ${Math.round(info.ratio * 100)}%` +
    (info.ratio > 1 ? '　← 本文幅より広い' : '');

  if (!skipPanel) syncPanel();
  $('#zoomInfo').textContent = `${Math.round(zoom * 100)}%`;

  // 自動保存（リロード事故よけ）
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    storage.saveCurrent({ doc, curId, axIdx, name: $('#docName').value, unitName: $('#docUnit').value });
  }, 400);
}

function syncPanel() {
  // 軸タブ
  const tabs = $('#axisTabs');
  tabs.innerHTML = '';
  doc.axes.forEach((a, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1}本目${a.unit ? `（${a.unit}）` : ''}`;
    if (i === axIdx) b.classList.add('on');
    b.onclick = () => { axIdx = i; sel = null; refresh(); };
    tabs.appendChild(b);
  });
  $('#btnDelAxis').disabled = doc.axes.length <= 1;

  // 軸の各項目
  const a = axis();
  $$('[data-ax]').forEach((el) => writeControl(el, a[el.dataset.ax]));

  // 全体
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

  // 選択中の目盛り
  const body = $('#tickBody');
  if (!sel) {
    body.classList.add('disabled');
    body.dataset.mode = '';
    $('#tickWho').textContent = 'プレビューの目盛りをクリック';
  } else {
    body.classList.remove('disabled');
    const ov = tickOf(doc.axes[sel.ai], sel.i);
    $('#tickWho').textContent = `${sel.ai + 1}本目 / 第${sel.i}目盛り`;
    body.dataset.mode = ov.mode;
    $$('[data-tick]').forEach((el) => writeControl(el, ov[el.dataset.tick]));
    $('#tickConnector').checked = doc.connectors.includes(sel.i);
    $('#tickConnector').disabled = doc.axes.length < 2;
  }
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
    if (k === 'syncTicks' || k === 'joinLeft') syncPanel();
    return;
  }

  if (el.dataset.ax) {
    const k = el.dataset.ax;
    const v = readControl(el);
    if (doc.syncTicks && SYNC_KEYS.has(k)) doc.axes.forEach((a) => { a[k] = v; });
    else axis()[k] = v;
    refresh({ skipPanel: true });
    if (k === 'unit') syncPanel();
    return;
  }

  if (el.dataset.tick && sel) {
    const k = el.dataset.tick;
    let v = readControl(el);
    if ((k === 'boxW' || k === 'boxH') && (v === null || v === '')) v = null;
    setTick(doc.axes[sel.ai], sel.i, { [k]: v });
    if (k === 'mode') { $('#tickBody').dataset.mode = v; refresh(); }
    else refresh({ skipPanel: true });
  }
});

/* 目盛りクリックで選択 */
preview.addEventListener('click', (ev) => {
  const hit = ev.target.closest('.tick-hit');
  if (!hit) return;
  sel = { ai: Number(hit.dataset.ai), i: Number(hit.dataset.i) };
  axIdx = sel.ai;
  refresh();
  $('#tickSec').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

/* 軸の増減 */
$('#btnAddAxis').onclick = () => {
  const base = doc.axes[doc.axes.length - 1];
  const a = defaultAxis({
    tickCount: base.tickCount, tickStep: base.tickStep,
    leadIn: base.leadIn, leadOut: base.leadOut,
    fontSize: base.fontSize, lineWidth: base.lineWidth,
    labelSide: 'down', tickSide: 'down',
  });
  if (doc.axes.length === 1) {   // 1本 → 2本: 比例数直線の形にそろえる
    doc.axes[0].labelSide = 'up';
    doc.axes[0].tickSide = 'up';
  }
  doc.axes.push(a);
  axIdx = doc.axes.length - 1;
  sel = null;
  refresh();
};

$('#btnDelAxis').onclick = () => {
  if (doc.axes.length <= 1) return;
  doc.axes.splice(axIdx, 1);
  axIdx = Math.max(0, axIdx - 1);
  sel = null;
  refresh();
};

/* 表示 */
$('#chkChecker').onchange = (e) => $('#previewWrap').classList.toggle('checker', e.target.checked);
$('#btnZoomIn').onclick = () => { zoom = Math.min(6, zoom * 1.25); refresh({ skipPanel: true }); };
$('#btnZoomOut').onclick = () => { zoom = Math.max(0.2, zoom / 1.25); refresh({ skipPanel: true }); };
$('#btnZoomReset').onclick = () => { zoom = 1; refresh({ skipPanel: true }); };

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

$('#docName').oninput = () => refresh({ skipPanel: true });
$('#docUnit').oninput = () => refresh({ skipPanel: true });

async function saveWork({ asNew = false } = {}) {
  const name = $('#docName').value.trim() || '名前のない数直線';
  const thumb = await toThumbnail(preview, 240);
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
  toast('保存しました');
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

/* ---------- よく使う型 ---------- */

const presetSel = $('#presetSel');
for (const [k, p] of Object.entries(PRESETS)) {
  const o = document.createElement('option');
  o.value = k; o.textContent = p.label;
  presetSel.appendChild(o);
}
presetSel.onchange = () => {
  const p = PRESETS[presetSel.value];
  if (!p) return;
  doc = p.make();
  curId = null; axIdx = 0; sel = null;
  refresh();
  presetSel.value = '';
  toast(`「${p.label}」を読み込みました`);
};

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
      doc = { ...defaultDoc(), ...cloneDoc(rec.doc) };
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

/* ---------- 起動 ---------- */

(async function boot() {
  // ?preset=ratio2 のように指定すると、その型で開く（動作確認・共有用）
  const q = new URLSearchParams(location.search);
  if (q.get('preset') && PRESETS[q.get('preset')]) {
    doc = PRESETS[q.get('preset')].make();
    refresh();
    return;
  }

  const saved = await storage.loadCurrent();
  if (saved && saved.doc) {
    doc = { ...defaultDoc(), ...saved.doc };
    curId = saved.curId ?? null;
    axIdx = saved.axIdx ?? 0;
    $('#docName').value = saved.name || '';
    $('#docUnit').value = saved.unitName || '';
  } else {
    doc = PRESETS.basic10.make();
  }
  refresh();
})();
