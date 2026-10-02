/* ============================================================
   drive.mjs — 本物のマウス・キーボード操作で画面を動かす（開発用）
   ------------------------------------------------------------
   tools/make3.html は element.dispatchEvent で「イベントを直接投げる」ため、
   pointerdown・フォーカス移動・重なり（別の要素に隠れて押せない）を再現できない。
   これは Chrome DevTools Protocol で **OS が送るのと同じ入力** を送る。
   「人が実際に触ると作れない」問題を見つけるためのもの。

   使い方:
     node tools/drive.mjs <シナリオ.mjs> [出力フォルダ]
   ============================================================ */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1400, height = 900, downloadDir = null } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = join(tmpdir(), `nlm-drive-${Date.now()}`);
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--hide-scrollbars', '--no-first-run', 'about:blank',
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch { /* まだ起動中 */ }
    await sleep(100);
  }
  if (!target) throw new Error('Chrome に接続できない');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  let seq = 0;
  const waiting = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(`${d.text} ${d.exception?.description || ''}`.trim());
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    waiting.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  if (downloadDir) {
    mkdirSync(downloadDir, { recursive: true });
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  }

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };

  /** セレクタの要素の「画面上の中心」と、そこに実際に居る要素（重なり検出用） */
  const locate = async (sel) => ev(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      x, y, w: r.width, h: r.height,
      visible: r.width > 0 && r.height > 0,
      hitSelf: !!top && (top === el || el.contains(top) || top.contains(el)),
      topDesc: top ? (top.tagName + (top.id ? '#' + top.id : '') + (top.className && top.className.baseVal === undefined ? '.' + String(top.className).split(' ').join('.') : '')) : 'none',
    };
  })()`);

  const api = {
    errors,
    ev,
    async goto(url) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) {
        if (await ev(`document.readyState === 'complete' && !!document.querySelector('.tick-hit')`).catch(() => false)) break;
        await sleep(100);
      }
      await sleep(150);
    },
    /** 本物のクリック。押そうとした場所に別の要素が被っていたら報告する */
    async click(sel, { quiet = false } = {}) {
      const p = await locate(sel);
      if (!p) throw new Error(`見つからない: ${sel}`);
      if (!p.visible) throw new Error(`画面に出ていない: ${sel}`);
      const blocked = !p.hitSelf;
      if (blocked && !quiet) console.log(`   ⚠ ${sel} の上に別の要素が被っている → ${p.topDesc}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await sleep(120);
      return { blocked, ...p };
    },
    /** 欄をクリック → 全選択 → 1文字ずつ打つ（人の入力と同じ途中経過を通る） */
    async type(sel, text) {
      await api.click(sel);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
      await sleep(60);
      for (const ch of String(text)) {
        await send('Input.insertText', { text: ch });
        await sleep(25);
      }
      await sleep(120);
    },
    async select(sel, value) {
      await ev(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); s.value = ${JSON.stringify(String(value))};
        s.dispatchEvent(new Event('input', {bubbles:true})); s.dispatchEvent(new Event('change', {bubbles:true})); })()`);
      await sleep(120);
    },
    async key(key, code = key, vk = 0) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
      await sleep(100);
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    sleep,
    async close() {
      try { ws.close(); } catch { /* */ }
      proc.kill();
      await sleep(300);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* */ }
    },
  };
  return api;
}

/* 単体実行: node tools/drive.mjs シナリオ.mjs [出力フォルダ] */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = process.argv[2];
  const out = resolve(process.argv[3] || join(tmpdir(), 'nlm-drive-out'));
  if (!scenario) { console.error('使い方: node tools/drive.mjs <シナリオ.mjs> [出力フォルダ]'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const mod = await import(pathToFileURL(resolve(scenario)).href);
  const b = await launch({ downloadDir: out });
  let code = 0;
  try {
    await mod.default(b, out);
  } catch (e) {
    console.log('✗ 途中で止まった: ' + e.message);
    await b.shot(join(out, 'ERROR.png')).catch(() => {});
    code = 1;
  }
  if (b.errors.length) { console.log('--- 画面で出たエラー ---'); b.errors.forEach((e) => console.log('  ' + e)); code = 1; }
  await b.close();
  process.exit(code);
}
