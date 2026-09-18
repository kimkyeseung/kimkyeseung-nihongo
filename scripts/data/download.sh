#!/usr/bin/env bash
# 원본 데이터 소스 5종을 scripts/data/.cache/ 에 다운로드한다.
# 특정 릴리즈 태그에 고정되어 있으므로, 최신 데이터로 갱신하려면
# 아래 URL의 릴리즈 태그를 각 저장소의 최신 릴리즈로 교체할 것.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .cache

echo "[1/5] JMDict_Extended (사전 + JLPT급수 + 후리가나 + 피치액센트) 다운로드..."
curl -sL "https://github.com/Bluskyo/JMDict_Extended/releases/download/1.4.1-auto-release-2026-09-08/jmdictExtended-2026-09-08.json.tar.gz" -o .cache/jmdictExtended.json.tar.gz
tar -xzf .cache/jmdictExtended.json.tar.gz -C .cache
mv .cache/jmdictExtended-2026-09-08.json .cache/jmdictExtended.json
rm .cache/jmdictExtended.json.tar.gz

echo "[2/5] KANJIDIC2 영문판 (한자 음독/훈독/뜻/획수) 다운로드..."
curl -sL "https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260914172325/kanjidic2-en-3.6.2%2B20260914172325.json.tgz" -o .cache/kanjidic2-en.json.tgz
tar -xzf .cache/kanjidic2-en.json.tgz -C .cache
mv .cache/kanjidic2-en-3.6.2.json .cache/kanjidic2-en.json
rm .cache/kanjidic2-en.json.tgz

echo "[3/5] JLPT 한자 급수 목록 (N1~N5) 다운로드..."
curl -sL "https://raw.githubusercontent.com/AnchorI/jlpt-kanji-dictionary/main/jlpt-kanji.json" -o .cache/jlpt-kanji.json

echo "[4/5] KanjiVG (한자 획순 벡터 경로) 다운로드..."
curl -sL "https://github.com/KanjiVG/kanjivg/releases/download/r20250816/kanjivg-20250816.xml.gz" -o .cache/kanjivg.xml.gz
gunzip -f .cache/kanjivg.xml.gz

echo "[5/5] 한국어 위키낱말사전의 일본어 표제어 (한국어 뜻풀이) 다운로드..."
# kaikki.org가 한국어판 위키낱말사전 덤프를 기계가 읽을 수 있게 가공해둔 것.
# JMdict에는 한국어판이 아예 없어서(dut/eng/fre/ger/hun/rus/slv/spa/swe뿐) 이쪽을 쓴다.
curl -sL "https://kaikki.org/kowiktionary/%EC%9D%BC%EB%B3%B8%EC%96%B4/kaikki.org-dictionary-%EC%9D%BC%EB%B3%B8%EC%96%B4.jsonl" -o .cache/ko-wiktionary-ja.jsonl

echo "완료: scripts/data/.cache/ 에 원본 데이터 준비됨."
echo "다음 단계: node scripts/data/build-dictionary.mjs && node scripts/data/build-kanji.mjs && node scripts/data/build-kanjivg.mjs"
