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
    tickStep: 12,       // 1目盛りの幅 (mm)
    start: 0,           // 目盛り0の値
    valueStep: 1,       // 1目盛りあたりの値
    labelEvery: 'auto', // 数字を出す目盛り。'auto'=重ならない間隔を自動で選ぶ／'ends'=両はしだけ
                        //   ／数値=その個数ごと／0=出さない
    notation: 'kanji',  // ★数の書き方。'kanji'=ふつう（1万以上は 50万・1億 と書く）／'plain'=数字のまま
                        //   ／'mixed'=分数（帯分数）／'improper'=分数（仮分数）
    fracReduce: false,  // 分数を約分するか（数直線では同じ分母で並べることが多いので既定はしない）
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
    lineWidth: 0.8,     // (mm) 教科書の数直線は本線が太い
    color: '#000000',
    leadIn: 0,          // 目盛り0より左の余り (mm)
    leadOut: 4,         // 最終目盛りより右の余り (mm)
    endLeft: 'none',    // 'none' | 'arrow' | 'cap' | 'wave'
    endRight: 'none',   // 教科書の数直線は矢印なしで少し伸びて終わる

    // --- ラベル ---
    labelSide: 'up',    // 'up' | 'down'
    fontSize: 4.5,      // (mm)
    labelGap: 1.2,      // 目盛り先端からラベルまでの間隔 (mm)
    boxW: 14,           // □ の既定の幅 (mm) 4桁書ける大きさ
    boxH: 8,
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
    side: 'auto',    // ★'auto'=軸の設定に従う / 'up'=線の上 / 'down'=線の下
                     //   （数字は線の上、記号ア・イ・ウは線の下、という形を作るために要る）
    lift: 0,         // ★ラベルを線から余分に離す距離 (mm)。0 なら通常どおり
    pointer: false,  // ★離した位置から目盛りへ矢印を引く（教科書の「□↓」「↑イ」の形）
    ...over,
  };
}

/** ドキュメント全体の既定値 */
export function defaultDoc(over = {}) {
  return {
    schema: 2,
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

/** 大きい数を教科書の書き方にする: 500000 → 50万 / 90000000 → 9000万 / 100000000 → 1億 */
export function fmtKanji(v) {
  const r = Math.round(v * 1e8) / 1e8;
  if (!Number.isInteger(r) || Math.abs(r) < 10000) return fmtNum(r);
  let n = Math.abs(r);
  const cho = Math.floor(n / 1e12); n %= 1e12;
  const oku = Math.floor(n / 1e8); n %= 1e8;
  const man = Math.floor(n / 1e4);
  const rest = n % 1e4;
  return (r < 0 ? '-' : '') +
    (cho ? cho + '兆' : '') + (oku ? oku + '億' : '') + (man ? man + '万' : '') + (rest ? rest : '');
}

/** 数の書き方。古い作品（kanji: true/false しか持たない）も読めるようにする */
export function notationOf(axis) {
  return axis.notation || (axis.kanji === false ? 'plain' : 'kanji');
}

/** 軸の設定に合わせて数を文字にする（分数の書き方のときに分数にできない値もここへ来る） */
export function fmtValue(axis, v) {
  return notationOf(axis) === 'plain' ? fmtNum(v) : fmtKanji(v);
}

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** 分数の書き方が選ばれているか */
export function isFractionNotation(axis) {
  const n = notationOf(axis);
  return n === 'mixed' || n === 'improper';
}

/**
 * 分数で書くときの土台。はじめ・おわりが整数のときだけ分数にできる。
 * 例: 0〜2 を 10目盛り → 分母 5（1目盛り = 1/5）
 * @returns {{den:number, stepNum:number, startNum:number}|null}
 */
export function fractionBase(axis) {
  const n = Math.floor(Number(axis.tickCount) || 0);
  const s = Math.round(axis.start * 1e6) / 1e6;
  const e = Math.round((axis.start + axis.valueStep * n) * 1e6) / 1e6;
  if (n <= 0 || !Number.isInteger(s) || !Number.isInteger(e) || e === s) return null;
  const g = gcd(e - s, n);
  const den = n / g;
  return { den, stepNum: (e - s) / g, startNum: s * den };
}

/**
 * 目盛り i を分数にしたもの。整数になるところは { int }。
 * @returns {{int:number}|{whole:string,num:number,den:number}|null}
 */
export function tickFraction(axis, i) {
  const b = fractionBase(axis);
  if (!b) return null;
  let num = b.startNum + i * b.stepNum, den = b.den;
  if (num % den === 0) return { int: num / den };
  if (axis.fracReduce) { const k = gcd(num, den); num /= k; den /= k; }
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (notationOf(axis) === 'mixed' && abs > den) {
    return { whole: sign + Math.floor(abs / den), num: abs % den, den };
  }
  return { whole: sign, num: abs, den };
}

/** 目盛り i の値を、画面の説明文に使う1行の文字にする（例: 1と2/5） */
export function tickText(axis, i) {
  if (isFractionNotation(axis)) {
    const f = tickFraction(axis, i);
    if (f) return 'int' in f ? String(f.int) : `${f.whole ? f.whole + 'と' : ''}${f.num}/${f.den}`;
  }
  return fmtValue(axis, tickValue(axis, i));
}

/** 1目盛りの大きさを文字にする（例: 10万 / 0.1 / 1/5） */
export function stepText(axis) {
  if (isFractionNotation(axis)) {
    const b = fractionBase(axis);
    if (b) return b.den === 1 ? String(b.stepNum) : `${b.stepNum}/${b.den}`;
  }
  return fmtValue(axis, axis.valueStep);
}

/**
 * 保存されていた古い作品を今の形にそろえる。
 * schema 1 の作品は「9000 と打って、うしろに 万 を付ける」方式で作られているので、
 * 万・億の自動表記を切っておく（入れると「1万万」になる）。
 */
export function normalizeDoc(raw) {
  const old = (raw.schema || 1) < 2;
  const doc = { ...defaultDoc(), ...raw, schema: 2 };
  doc.axes = (raw.axes && raw.axes.length ? raw.axes : [defaultAxis()]).map((a) => {
    const ax = { ...defaultAxis(), ...a, ticks: { ...(a.ticks || {}) } };
    // 数の書き方: 古い作品は kanji（true/false）から決める。schema 1 は「数字のまま」
    if (a.notation === undefined) ax.notation = (old || a.kanji === false) ? 'plain' : 'kanji';
    delete ax.kanji;
    if (old && a.labelEvery === undefined) ax.labelEvery = 1;
    return ax;
  });
  doc.connectors = Array.isArray(raw.connectors) ? [...raw.connectors] : [];
  return doc;
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
    make: () => defaultDoc({ axes: [defaultAxis({ tickCount: 10, labelEvery: 1 })] }),
  },

  /* 教科書「大きい数」練習⑥ の3本。数は教科書どおりの大きさで入れてある
     （1000000 と入れれば「100万」、100000000 と入れれば「1億」と出る） */
  oku1: {
    label: '大きい数① 0〜100万',
    make: () => {
      const d = defaultDoc({
        axes: [defaultAxis({ tickCount: 10, start: 0, valueStep: 100000, labelEvery: 5 })],
      });
      setTick(d.axes[0], 3, { mode: 'box' });
      setTick(d.axes[0], 8, { mode: 'box' });
      return d;
    },
  },
  oku2: {
    label: '大きい数② 9000万〜1億',
    make: () => {
      const d = defaultDoc({
        axes: [defaultAxis({ tickCount: 10, start: 90000000, valueStep: 1000000, labelEvery: 'ends' })],
      });
      for (const i of [3, 6, 9]) setTick(d.axes[0], i, { mode: 'box', lift: 7, pointer: true });
      return d;
    },
  },
  oku3: {
    label: '大きい数③ 6000万〜1億（1億を問う）',
    make: () => {
      const d = defaultDoc({
        axes: [defaultAxis({
          tickCount: 40, tickStep: 3.6, start: 60000000, valueStep: 1000000, labelEvery: 10,
          midEvery: 5, majorEvery: 10, lenMinor: 1.8, lenMid: 2.4, lenMajor: 3.6,
          leadOut: 0, boxW: 17,
        })],
      });
      // ★右端の □ が 100000000（1億）を問う
      for (const i of [14, 27, 40]) setTick(d.axes[0], i, { mode: 'box', lift: 7, pointer: true });
      return d;
    },
  },

  mark: {
    label: '記号で問う（ア・イ・ウ）',
    make: () => {
      const d = defaultDoc({
        axes: [defaultAxis({
          tickCount: 75, tickStep: 2, start: 0, valueStep: 1000, notation: 'plain',
          labelEvery: 10, midEvery: 5, majorEvery: 10,
          lenMinor: 1.6, lenMid: 2.2, lenMajor: 3.2,
          fontSize: 3.6, leadOut: 0,
        })],
      });
      // 数字は線の上、記号は線の下から矢印でさす
      const marks = { 3: 'ア', 20: 'イ', 71: 'ウ' };
      for (const [i, t] of Object.entries(marks)) {
        setTick(d.axes[0], Number(i), { mode: 'text', text: t, side: 'down', lift: 6, pointer: true });
      }
      return d;
    },
  },

  decimal: {
    label: '0〜1（小数）',
    make: () => defaultDoc({ axes: [defaultAxis({ tickCount: 10, valueStep: 0.1, labelEvery: 1 })] }),
  },

  fraction: {
    label: '分数（0〜2・1/5ずつ）',
    make: () => defaultDoc({
      axes: [defaultAxis({ tickCount: 10, start: 0, valueStep: 0.2, notation: 'mixed', labelEvery: 1 })],
    }),
  },

  ratio2: {
    label: '比例数直線（2本）',
    make: () => {
      const d = defaultDoc({
        axisGap: 14, joinLeft: true, connectors: [1, 3],
        axes: [
          defaultAxis({
            tickCount: 4, tickStep: 22, labelEvery: 0, labelSide: 'up',
            tickSide: 'up', tickStyle: 'dashed', lenMinor: 2.4, lenMid: 2.4, lenMajor: 2.4,
            midEvery: 0, majorEvery: 0, leadOut: 10, unit: 'kg',
          }),
          defaultAxis({
            tickCount: 4, tickStep: 22, labelEvery: 0, labelSide: 'down',
            tickSide: 'down', tickStyle: 'dashed', lenMinor: 2.4, lenMid: 2.4, lenMajor: 2.4,
            midEvery: 0, majorEvery: 0, leadOut: 10, unit: 'm',
          }),
        ],
      });
      setTick(d.axes[0], 0, { mode: 'text', text: '0' });
      setTick(d.axes[0], 1, { mode: 'fraction', num: '5', den: '18' });
      setTick(d.axes[0], 2, { tickShow: false });
      setTick(d.axes[0], 3, { mode: 'text', text: 'x', ruby: 'エックス' });
      setTick(d.axes[0], 4, { tickShow: false });
      setTick(d.axes[1], 0, { mode: 'text', text: '0' });
      setTick(d.axes[1], 1, { mode: 'text', text: '1' });
      setTick(d.axes[1], 2, { tickShow: false });
      setTick(d.axes[1], 3, { mode: 'text', text: '3' });
      setTick(d.axes[1], 4, { tickShow: false });
      return d;
    },
  },
};
