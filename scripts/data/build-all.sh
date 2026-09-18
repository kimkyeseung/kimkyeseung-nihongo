#!/usr/bin/env bash
# scripts/data/.cache/의 원본 데이터를 가공해 src/data/*.json을 전부 생성한다.
# 먼저 bash scripts/data/download.sh 로 원본 데이터를 받아둘 것.
set -euo pipefail
cd "$(dirname "$0")"

node build-dictionary.mjs
node build-kanji.mjs
node build-kanjivg.mjs
node build-kana-words.mjs
