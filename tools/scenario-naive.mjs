/* 「何も知らない人」が、ご依頼の2本を作って保存するまでを本物の入力でなぞる。
   数は教科書どおり（1000000 / 90000000 / 100000000）をそのまま打つ。 */
import { join } from 'node:path';

const URL0 = process.env.NLM_URL || 'http://localhost:8777/index.html';

export default async function (b, out) {
  const step = async (name, fn) => {
    process.stdout.write(`・${name} … `);
    await fn();
    console.log('ok');
  };
  const state = () => b.ev(`(() => {
    const t = [...document.querySelectorAll('#preview .art text')].map(e => e.textContent);
    return { labels: t, boxes: document.querySelectorAll('#preview .art rect[fill=none]').length,
             arrows: document.querySelectorAll('#preview .art polygon').length,
             size: document.getElementById('sizeInfo').textContent,
             pop: !document.getElementById('tickPop').hidden };
  })()`);

  await b.goto(URL0);
  await b.shot(join(out, '00_起動.png'));

  /* ===== ① 0〜100万、30万と80万を問う ===== */
  console.log('\n【① 0〜100万】');
  await step('新規', async () => {
    await b.ev(`window.confirm = () => true`);
    await b.click('#btnNew');
  });
  await step('はじめの数 0', () => b.type('[data-ax=start]', '0'));
  await step('おわりの数 1000000', () => b.type('#endValue', '1000000'));
  await step('目盛りの数 10', () => b.type('[data-ax=tickCount]', '10'));
  console.log('   →', JSON.stringify(await state()));
  await b.shot(join(out, '11_数値を入れた直後.png'));
  await step('数字を出すところ → 5目盛りごと', () => b.select('#labelEverySel', '5'));

  await step('30万の目盛りをクリック', () => b.click('.tick-hit[data-i="3"]'));
  console.log('   → 編集窓:', (await state()).pop ? '開いた' : '★開かない');
  await b.shot(join(out, '12_目盛りをクリック.png'));
  await step('□ を押す', () => b.click('#modeSeg button[data-m=box]'));
  await step('80万の目盛りをクリック', () => b.click('.tick-hit[data-i="8"]'));
  await step('□ を押す', () => b.click('#modeSeg button[data-m=box]'));
  await step('窓の外をクリックして閉じる', () => b.click('#docName'));
  console.log('   →', JSON.stringify(await state()));
  await b.shot(join(out, '13_①できあがり.png'));

  await step('作品名を入れて保存', async () => {
    await b.type('#docName', '大きい数① 0〜100万（30万・80万を問う）');
    await b.type('#docUnit', '大きい数');
    await b.click('#btnSave');
    await b.sleep(500);
  });
  await step('透過PNGで書き出す', async () => { await b.click('#btnPNG'); await b.sleep(900); });

  /* ===== ② 9000万〜1億、10目盛り、3つ問う ===== */
  console.log('\n【② 9000万〜1億】');
  await step('新規', () => b.click('#btnNew'));
  await step('おわりの数 100000000（先に打つ）', () => b.type('#endValue', '100000000'));
  await step('はじめの数 90000000', () => b.type('[data-ax=start]', '90000000'));
  await step('目盛りの数 10', () => b.type('[data-ax=tickCount]', '10'));
  console.log('   →', JSON.stringify(await state()));
  await b.shot(join(out, '21_数値を入れた直後.png'));
  await step('数字を出すところ → 両はしだけ', () => b.select('#labelEverySel', 'ends'));

  for (const i of [3, 6, 9]) {
    await step(`目盛り${i}をクリック → □ → 矢印でさす`, async () => {
      await b.click(`.tick-hit[data-i="${i}"]`);
      await b.click('#modeSeg button[data-m=box]');
      await b.click('[data-tick=pointer]');
    });
  }
  await step('窓の外をクリックして閉じる', () => b.click('#docName'));
  console.log('   →', JSON.stringify(await state()));
  await b.shot(join(out, '22_②できあがり.png'));

  await step('作品名を入れて保存', async () => {
    await b.type('#docName', '大きい数② 9000万〜1億（3つ問う）');
    await b.type('#docUnit', '大きい数');
    await b.click('#btnSave');
    await b.sleep(500);
  });
  await step('透過PNGで書き出す', async () => { await b.click('#btnPNG'); await b.sleep(900); });

  await step('ライブラリを開く', () => b.click('#btnLib'));
  const lib = await b.ev(`[...document.querySelectorAll('.libcard .meta b')].map(e => e.textContent)`);
  console.log('   → ライブラリ:', JSON.stringify(lib));
  await b.shot(join(out, '30_ライブラリ.png'));

  // 作った2本を取り出す（サムネイルは受け取る側で作り直すので外す）
  const items = await b.ev(`(() => JSON.parse(localStorage.getItem('nlm.library.v1') || '[]')
    .sort((x, y) => x.createdAt - y.createdAt)
    .map(({ name, unitName, doc }) => ({ name, unitName, doc })))()`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(out, 'made.json'), JSON.stringify(items));
  console.log('   → 取り出した作品:', items.map((i) => i.name).join(' / '));
}
