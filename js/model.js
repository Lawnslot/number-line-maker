/* ============================================================
   model.js — 数直線ドキュメントのデータ構造と既定値
   ------------------------------------------------------------
   設計の中核（要件 v0.3 §2）:
     目盛りは「等間隔」が基本。位置は値に比例する。
     見た目の自由度は「目盛りごとにラベル／目盛り線を出し分ける」で確保し、
     自由配置（ドラッグで任意の位置）は作らない。

   単位系: 内部の長さはすべて mm。描画時にそのまま SVG のユーザー単位として使う。
   ============================================================ */

/** 用紙サイズ（mm）。サイズ感プレビュー用。 */
export const PAPERS = {
  a4p: { label: 'A4 縦', w: 210, h: 297 },
  a4l: { label: 'A4 横', w: 297, h: 210 },
  b5p: { label: 'B5 縦', w: 182, h: 257 },
  b5l: { label: 'B5 横', w: 257, h: 182 },
};

/** ラベルの種類 */
export const LABEL_MODES = {
  auto: '自動（数字）',
  none: 'なし',
  text: '文字',
  fraction: '分数',
  box: '□（穴埋め）',
};

/** 1本の数直線（軸）の既定値 */
export function defaultAxis(over = {}) {
  return {
    // --- 等間隔の素 ---
    tickCount: 10,      // 目盛りの区間数（目盛り線は 0〜tickCount の tickCount+1 本）
    tickStep: 8,        // 1目盛りの幅 (mm)
    start: 0,           // 目盛り0の値
    valueStep: 1,       // 1目盛りあたりの値
    labelEvery: 1,      // 何目盛りごとに数字を出すか（0で自動ラベルなし）
    labelPrefix: '',    // 数字の前に付ける文字
    labelSuffix: '',    // ★数字の後ろに付ける文字（「万」「億」「cm」など）
    suffixSkipZero: true, // 0 には付けない（「0万」ではなく「0」にする）

    // --- 目盛りの見た目 ---
    midEvery: 5,        // 中くらいの目盛りを何個ごとに出すか（0で無効）
    majorEvery: 10,     // 長い目盛りを何個ごとに出すか（0で無効）
    lenMinor: 2.0,      // 最小目盛りの長さ (mm)
    lenMid: 3.2,
    lenMajor: 4.6,
    tickSide: 'up',     // 'up' | 'down' | 'both' ★既定は「上に伸びる」（教科書の形）
    tickStyle: 'solid', // 'solid' | 'dashed'

    // --- 線 ---
    lineWidth: 0.5,     // (mm)
    color: '#000000',
    leadIn: 0,          // 目盛り0より左の余り (mm)
    leadOut: 8,         // 最終目盛りより右の余り (mm)
    endLeft: 'none',    // 'none' | 'arrow' | 'cap' | 'wave'
    endRight: 'none',   // 教科書の数直線は矢印なしで少し伸びて終わる

    // --- ラベル ---
    labelSide: 'up',    // 'up' | 'down'
    fontSize: 4.5,      // (mm)
    labelGap: 1.2,      // 目盛り先端からラベルまでの間隔 (mm)
    boxW: 9,            // □ の既定の幅 (mm)
    boxH: 7,
    boxDashed: false,
    pointerColor: '#8c8c8c',  // 引き出し矢印の色（教科書は灰色）

    // --- 単位欄（右端の "(kg)" など） ---
    unit: '',
    unitGap: 2.5,       // 線の端から単位までの間隔 (mm)

    // --- 目盛りごとの上書き: { [index]: {...} } ---
    ticks: {},

    ...over,
  };
}

/** 目盛り個別の上書き（未設定の項目は軸の既定に従う） */
export function defaultTickOverride(over = {}) {
  return {
    mode: 'auto',    // LABEL_MODES のキー
    text: '',        // mode='text'
    whole: '',       // mode='fraction' の整数部（帯分数）
    num: '',         // 分子
    den: '',         // 分母
    boxW: null,      // null なら軸の既定
    boxH: null,
    ruby: '',        // ふりがな
    tickShow: true,  // 目盛り線そのものを出すか
    lift: 0,         // ★ラベルを線から余分に離す距離 (mm)。0 なら通常どおり
    pointer: false,  // ★離した位置から目盛りへ矢印を引く（教科書の「□↓」の形）
    ...over,
  };
}

/** ドキュメント全体の既定値 */
export function defaultDoc(over = {}) {
  return {
    schema: 1,
    name: '',
    unitName: '',            // 単元名（絞り込み用）
    memo: '',

    padT: 3, padR: 3, padB: 3, padL: 3,   // 書き出し余白 (mm)
    dpi: 300,

    axisGap: 16,             // 線と線の距離 (mm)
    joinLeft: true,          // 左端(0)を縦の実線でつなぐ
    connectors: [],          // 縦の破線を引く目盛り番号の配列
    syncTicks: true,         // 全軸で目盛り幅・目盛り数をそろえる

    paper: 'a4p',            // サイズ感プレビューの用紙
    paperMargin: 20,         // 本文領域の余白 (mm)

    axes: [defaultAxis()],

    ...over,
  };
}

/* ---------- 便利関数 ---------- */

/** 目盛り i の値 */
export function tickValue(axis, i) {
  return axis.start + axis.valueStep * i;
}

/** 浮動小数の誤差を落として文字列化（0.30000000000000004 → "0.3"） */
export function fmtNum(v) {
  const r = Math.round(v * 1e8) / 1e8;
  if (Object.is(r, -0)) return '0';
  return String(r);
}

/** 目盛り i の階層（'major' | 'mid' | 'minor'） */
export function tickLevel(axis, i) {
  if (axis.majorEvery > 0 && i % axis.majorEvery === 0) return 'major';
  if (axis.midEvery > 0 && i % axis.midEvery === 0) return 'mid';
  return 'minor';
}

/** 目盛り i の長さ (mm) */
export function tickLength(axis, i) {
  const lv = tickLevel(axis, i);
  return lv === 'major' ? axis.lenMajor : lv === 'mid' ? axis.lenMid : axis.lenMinor;
}

/** 目盛り i の上書き設定（なければ既定） */
export function tickOf(axis, i) {
  return axis.ticks[i] ? defaultTickOverride(axis.ticks[i]) : defaultTickOverride();
}

/** 目盛り i の上書きを書き込む（既定と同じなら削除して軽く保つ） */
export function setTick(axis, i, patch) {
  const cur = tickOf(axis, i);
  const next = { ...cur, ...patch };
  const def = defaultTickOverride();
  const differs = Object.keys(def).some((k) => String(next[k] ?? '') !== String(def[k] ?? ''));
  if (differs) axis.ticks[i] = next;
  else delete axis.ticks[i];
}

/** 軸の線の長さ (mm) */
export function axisLineLength(axis) {
  return axis.leadIn + axis.tickStep * axis.tickCount + axis.leadOut;
}

/** syncTicks が ON のとき、軸0の目盛り幾何を全軸へ揃える */
export function applySync(doc) {
  if (!doc.syncTicks || doc.axes.length < 2) return;
  const a0 = doc.axes[0];
  for (let i = 1; i < doc.axes.length; i++) {
    const a = doc.axes[i];
    a.tickCount = a0.tickCount;
    a.tickStep = a0.tickStep;
    a.leadIn = a0.leadIn;
    a.leadOut = a0.leadOut;
  }
}

/** 深いコピー（構造が素のオブジェクトと配列だけなので JSON で足りる） */
export function cloneDoc(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/* ---------- プリセット ---------- */

export const PRESETS = {
  basic10: {
    label: '0〜10（基本）',
    make: () => defaultDoc({
      axes: [defaultAxis({ tickCount: 10, tickStep: 12, labelEvery: 1, midEvery: 5, majorEvery: 10 })],
    }),
  },
  basic100: {
    label: '0〜100（10とび）',
    make: () => defaultDoc({
      axes: [defaultAxis({
        tickCount: 100, tickStep: 1.6, valueStep: 1, labelEvery: 10,
        midEvery: 5, majorEvery: 10, lenMinor: 1.4, lenMid: 2.4, lenMajor: 3.6,
      })],
    }),
  },
  decimal: {
    label: '0〜1（小数）',
    make: () => defaultDoc({
      axes: [defaultAxis({
        tickCount: 10, tickStep: 12, valueStep: 0.1, labelEvery: 1,
        midEvery: 5, majorEvery: 10,
      })],
    }),
  },
  oku1: {
    label: '0〜100万（大きい数・□あり）',
    make: () => {
      const d = defaultDoc({
        axes: [defaultAxis({
          tickCount: 11, tickStep: 13, start: 0, valueStep: 10,
          labelEvery: 5, labelSuffix: '万', midEvery: 0, majorEvery: 5,
          lenMinor: 2.6, lenMid: 2.6, lenMajor: 3.6,
          lineWidth: 0.8, leadOut: 0, boxW: 14, boxH: 8,
        })],
      });
      setTick(d.axes[0], 1, { mode: 'box' });
      setTick(d.axes[0], 7, { mode: 'box' });
      return d;
    },
  },
  oku2: {
    label: '9000万〜1億（引き出し□）',
    make: () => {
      const d = defaultDoc({
        axes: [defaultAxis({
          tickCount: 10, tickStep: 14, start: 9000, valueStep: 100,
          labelEvery: 10, labelSuffix: '万', suffixSkipZero: false,
          midEvery: 0, majorEvery: 10, lenMinor: 2.6, lenMid: 2.6, lenMajor: 3.6,
          lineWidth: 0.8, leadOut: 0, boxW: 16, boxH: 8,
        })],
      });
      setTick(d.axes[0], 10, { mode: 'text', text: '1億' });
      // 引き出した□から目盛りへ矢印を引く
      setTick(d.axes[0], 2, { mode: 'box', lift: 7, pointer: true });
      setTick(d.axes[0], 5, { mode: 'box', lift: 7, pointer: true });
      setTick(d.axes[0], 8, { mode: 'box', lift: 7, pointer: true });
      return d;
    },
  },
  ratio2: {
    label: '比例数直線（2本）',
    make: () => {
      const d = defaultDoc({
        axisGap: 14,
        joinLeft: true,
        connectors: [1, 3],
        axes: [
          defaultAxis({
            tickCount: 4, tickStep: 22, labelEvery: 0, labelSide: 'up',
            tickSide: 'up', tickStyle: 'dashed', lenMinor: 2.4, lenMid: 2.4, lenMajor: 2.4,
            midEvery: 0, majorEvery: 0, lineWidth: 0.8, leadOut: 10, unit: 'kg',
          }),
          defaultAxis({
            tickCount: 4, tickStep: 22, labelEvery: 0, labelSide: 'down',
            tickSide: 'down', tickStyle: 'dashed', lenMinor: 2.4, lenMid: 2.4, lenMajor: 2.4,
            midEvery: 0, majorEvery: 0, lineWidth: 0.8, leadOut: 10, unit: 'm',
          }),
        ],
      });
      // 上段: 0 / 5⁄18 / x（エックス）
      setTick(d.axes[0], 0, { mode: 'text', text: '0' });
      setTick(d.axes[0], 1, { mode: 'fraction', num: '5', den: '18' });
      setTick(d.axes[0], 2, { tickShow: false });
      setTick(d.axes[0], 3, { mode: 'text', text: 'x', ruby: 'エックス' });
      setTick(d.axes[0], 4, { tickShow: false });
      // 下段: 0 / 1 / 3
      setTick(d.axes[1], 0, { mode: 'text', text: '0' });
      setTick(d.axes[1], 1, { mode: 'text', text: '1' });
      setTick(d.axes[1], 2, { tickShow: false });
      setTick(d.axes[1], 3, { mode: 'text', text: '3' });
      setTick(d.axes[1], 4, { tickShow: false });
      return d;
    },
  },
};
