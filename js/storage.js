/* ============================================================
   storage.js — 保存層（作品ライブラリ）
   ------------------------------------------------------------
   ★ 要件 v0.3 F-85/F-86
     ・v1 の保存先はブラウザの localStorage のみ
     ・vault（Obsidian）にはこのアプリの JSON を置かない
     ・将来は専用DBへ移す可能性がある → ★このファイルだけを差し替えれば
       済むように、他のコードから保存の実装を隠す。
       そのため全ての関数を async（Promise を返す）にしてある。
   ============================================================ */

const KEY_LIB = 'nlm.library.v1';
const KEY_CUR = 'nlm.current.v1';

function readLib() {
  try {
    const raw = localStorage.getItem(KEY_LIB);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLib(arr) {
  localStorage.setItem(KEY_LIB, JSON.stringify(arr));
}

/** 衝突しない ID。将来 DB に移すときも主キーとしてそのまま使える */
function newId() {
  return 'nl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export const storage = {
  /** 一覧（新しい順）。doc は含めず軽く返す */
  async list() {
    return readLib()
      .map(({ id, name, unitName, memo, thumb, updatedAt, createdAt }) =>
        ({ id, name, unitName, memo, thumb, updatedAt, createdAt }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  /** 1件取得（doc を含む） */
  async get(id) {
    return readLib().find((r) => r.id === id) || null;
  },

  /**
   * 保存。id があれば上書き、なければ新規採番して返す。
   * @returns {Promise<string>} id
   */
  async save({ id, name, unitName, memo, doc, thumb }) {
    const lib = readLib();
    const now = Date.now();
    const i = id ? lib.findIndex((r) => r.id === id) : -1;

    if (i >= 0) {
      lib[i] = { ...lib[i], name, unitName, memo, doc, thumb, updatedAt: now };
      writeLib(lib);
      return lib[i].id;
    }
    const rec = { id: newId(), name, unitName, memo, doc, thumb, createdAt: now, updatedAt: now };
    lib.push(rec);
    writeLib(lib);
    return rec.id;
  },

  async remove(id) {
    writeLib(readLib().filter((r) => r.id !== id));
  },

  /** 編集中の状態（リロード事故よけ・F-84） */
  async saveCurrent(state) {
    try { localStorage.setItem(KEY_CUR, JSON.stringify(state)); } catch { /* 容量超過は黙って諦める */ }
  },

  async loadCurrent() {
    try {
      const raw = localStorage.getItem(KEY_CUR);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /** 端末の引っ越し・バックアップ用（F-87）。置き場は vault 外 */
  async exportAll() {
    return JSON.stringify({ app: 'number-line-maker', schema: 1, items: readLib() }, null, 2);
  },

  /** @returns {Promise<number>} 取り込んだ件数 */
  async importAll(json, { replace = false } = {}) {
    const data = JSON.parse(json);
    const items = Array.isArray(data) ? data : (data.items || []);
    if (!Array.isArray(items)) throw new Error('形式が違います');
    const lib = replace ? [] : readLib();
    const have = new Set(lib.map((r) => r.id));
    let n = 0;
    for (const it of items) {
      if (!it || !it.doc) continue;
      const rec = { ...it, id: (it.id && !have.has(it.id)) ? it.id : newId() };
      lib.push(rec);
      have.add(rec.id);
      n++;
    }
    writeLib(lib);
    return n;
  },

  /** localStorage の使用量の目安（バイト） */
  async usage() {
    const lib = localStorage.getItem(KEY_LIB) || '';
    const cur = localStorage.getItem(KEY_CUR) || '';
    return { bytes: (lib.length + cur.length) * 2, count: readLib().length };
  },
};
