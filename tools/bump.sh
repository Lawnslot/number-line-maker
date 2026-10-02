#!/bin/sh
# 版番号（?v=N）を1つ上げる。GitHub Pages は10分キャッシュするため、
# 版番号を上げないと「新しい画面＋古いプログラム」が混ざって動かなくなる時間ができる。
#   使い方: sh tools/bump.sh   （公開する前に必ず1回）
cd "$(dirname "$0")/.." || exit 1
cur=$(grep -o 'app.js?v=[0-9]*' index.html | grep -o '[0-9]*$')
next=$((cur + 1))
sed -i '' -E "s/\\?v=[0-9]+/?v=${next}/g" index.html js/app.js js/render.js
sed -i '' -E "s/>v[0-9]+<\\/small>/>v${next}<\\/small>/" index.html
echo "v${cur} -> v${next}"
grep -c "?v=${next}" index.html js/app.js js/render.js
