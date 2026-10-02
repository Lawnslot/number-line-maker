/* いろいろな種類の数直線を「初めての人の手順」で作ってみる（本物の入力）。
   それぞれ何手で作れたかを数える。手数が多いものは人に勧められない。 */
import { join } from 'node:path';

const URL0 = process.env.NLM_URL || 'http://localhost:8777/index.html';

export default async function (b, out) {
  let ops = 0;
  const type = async (sel, v) => { ops++; await b.type(sel, v); };
  const click = async (sel) => { ops++; return b.click(sel); };
  const pick = async (sel, v) => { ops++; await b.select(sel, v); };
  const labels = () => b.ev(`[...document.querySelectorAll('#preview .art > text, #preview .art > g')]
    .map(e => e.tagName === 'text' ? e.textContent : [...e.querySelectorAll('text')].map(t => t.textContent).join('/'))
    .filter(Boolean).join('  ')`);
  const overlap = () => b.ev(`(() => {
    const rs = [...document.querySelectorAll('#preview .art text, #preview .art rect')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
    let n = 0;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], c = rs[j];
      if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) n++;
    }
    return n;
  })()`);
  const done = async (name, file) => {
    const ov = await overlap();
    console.log(`  ${ops}手 ／ 重なり ${ov}か所${ov ? ' ★' : ''} ／ ${await labels()}`);
    await b.shot(join(out, file));
    ops = 0;
  };
  const fresh = async () => { await b.click('#btnNew'); };

  await b.goto(URL0);
  await b.ev(`window.confirm = () => true`);
  await b.shot(join(out, 'k0_起動した画面.png'));

  console.log('【整数】0〜20、5のところを問う');
  await fresh();
  await type('#endValue', '20'); await type('[data-ax=tickCount]', '20');
  await click('.tick-hit[data-i="5"]'); await click('#modeSeg button[data-m=box]');
  await b.key('Escape', 'Escape', 27);
  await done('整数', 'k1_整数.png');

  console.log('【小数】0〜1 を10等分、0.7 を問う');
  await fresh();
  await type('#endValue', '1'); await type('[data-ax=tickCount]', '10');
  await click('.tick-hit[data-i="7"]'); await click('#modeSeg button[data-m=box]');
  await b.key('Escape', 'Escape', 27);
  await done('小数', 'k2_小数.png');

  console.log('【小数】2.5〜2.6 を10等分（0.01きざみ）');
  await fresh();
  await type('[data-ax=start]', '2.5'); await type('#endValue', '2.6'); await type('[data-ax=tickCount]', '10');
  await done('小数0.01', 'k3_小数001.png');

  console.log('【分数】0〜2 を 1/5 ずつ、1と2/5 を問う');
  await fresh();
  await type('#endValue', '2'); await type('[data-ax=tickCount]', '10');
  await pick('[data-ax=notation]', 'mixed');
  await click('.tick-hit[data-i="7"]'); await click('#modeSeg button[data-m=box]');
  await b.key('Escape', 'Escape', 27);
  await done('分数', 'k4_分数.png');

  console.log('【分数】0〜1 を3等分（割り切れない数）→ 案内が出るか');
  await fresh();
  await type('#endValue', '1'); await type('[data-ax=tickCount]', '3');
  console.log('  案内:', await b.ev(`document.querySelector('#stepHint .warn')?.textContent || '（なし）'`));
  await pick('[data-ax=notation]', 'mixed');
  await done('分数3等分', 'k5_分数3等分.png');

  console.log('【2本】比例数直線: 上 0〜800（円）、下 0〜4（m）、4目盛り、x と □');
  await fresh();
  await click('#shapeSeg button[data-n="2"]');
  await type('#endValue', '800'); await type('[data-ax=tickCount]', '4');
  await click('#axisTabs button:nth-child(2)');
  await type('#endValue', '4');
  await click('.tick-hit[data-ai="0"][data-i="3"]'); await click('#modeSeg button[data-m=box]');
  await b.key('Escape', 'Escape', 27);
  await done('2本', 'k6_2本.png');

  console.log('【編集窓】右はしの目盛りを押しても画面からはみ出さないか');
  await b.click('.tick-hit[data-ai="1"][data-i="4"]');
  const pr = await b.ev(`(() => { const r = document.getElementById('tickPop').getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight }; })()`);
  console.log('  ', pr.left >= 0 && pr.right <= pr.vw && pr.top >= 0 && pr.bottom <= pr.vh ? '画面内に収まっている' : '★はみ出している', JSON.stringify(pr));
  await b.shot(join(out, 'k7_編集窓.png'));
  await b.key('Escape', 'Escape', 27);

  console.log('【詳しい設定】右のパネルを開く');
  await b.click('#btnMore');
  await b.shot(join(out, 'k8_詳しい設定.png'));
  await b.click('#btnMore');
  await b.click('#btnTheme');
  await b.shot(join(out, 'k9_明るい画面.png'));
  await b.click('#btnTheme');
}
