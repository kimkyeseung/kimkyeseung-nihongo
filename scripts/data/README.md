# 데이터 소싱 파이프라인

일본어 사전/한자 학습 데이터를 공개 데이터셋에서 가공해 `src/data/`에 정적 JSON으로
내장하기 위한 스크립트. LLM이 사전적 사실(뜻/읽기/JLPT급수/한자 정보)을 지어내지
않도록, 이 데이터들은 전부 빌드 타임에 준비되고 앱은 조회만 한다.

## 사용법

```bash
bash scripts/data/download.sh   # 원본 데이터를 scripts/data/.cache/ 에 다운로드
bash scripts/data/build-all.sh  # .cache/ 를 가공해 src/data/*.json 생성
```

또는 개별 실행:

```bash
node scripts/data/build-dictionary.mjs
node scripts/data/build-kanji.mjs
node scripts/data/build-kanjivg.mjs   # build-kanji.mjs 이후에 실행할 것 (kanji.json 참조)
```

`scripts/data/.cache/`는 원본 다운로드 캐시로 용량이 크므로(약 190MB) git에 커밋하지
않는다(`.gitignore` 참고). `src/data/*.json`만 커밋 대상이다.

## 데이터 소스 및 라이선스

| 파일 | 소스 | 라이선스 |
|------|------|----------|
| `dictionary.json`, `pos-tags.json` | [Bluskyo/JMDict_Extended](https://github.com/Bluskyo/JMDict_Extended) (JMDict + JLPT 태그 + 후리가나 병합) | CC BY-SA (JMDict, EDRDG) |
| `kanji.json` (음독/훈독/뜻/획수) | [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified)의 KANJIDIC2 JSON 변환본 | CC BY-SA (KANJIDIC2, EDRDG) |
| `kanji.json` (JLPT 급수) | [AnchorI/jlpt-kanji-dictionary](https://github.com/AnchorI/jlpt-kanji-dictionary) | 원 저장소 라이선스 참고 |
| `kanjivg.json` (획순 경로) | [KanjiVG](https://github.com/KanjiVG/kanjivg) | CC BY-SA 3.0 |

앱의 정보/설정 페이지와 README에 아래와 같은 출처 표기가 필요하다:

> 사전 데이터: JMDict/KANJIDIC (EDRDG, CC BY-SA) · JLPT 태그: JMDict_Extended,
> AnchorI/jlpt-kanji-dictionary · 획순: KanjiVG (CC BY-SA 3.0)

`download.sh`의 URL은 2026-09-15 기준 각 저장소의 특정 릴리즈 태그에 고정되어 있다.
최신 데이터로 갱신하려면 각 저장소의 최신 릴리즈 URL로 교체 후 재실행한다.

## 출력 스키마

### `dictionary.json` — JLPT 태그가 있는 단어만 (총 8,267개)

```ts
interface WordEntry {
  id: string;
  word: string;        // 표제어 (한자 표기 우선, 없으면 가나)
  reading: string;      // 히라가나 읽기
  jlptLevel: "N5" | "N4" | "N3" | "N2" | "N1";
  common: boolean;
  furigana: { ruby: string; rt: string }[] | null;
  pos: string[];        // 대표 품사 코드 (pos-tags.json에서 설명 조회)
  meaning: string;      // 대표 뜻 (목록 표시용)
  senses: { pos: string[]; glosses: string[] }[]; // 전체 의미 (상세 페이지용)
}
```

### `kanji.json` — JLPT 급수가 확인된 상용/JLPT 한자 (총 2,135자)

```ts
interface KanjiEntry {
  kanji: string;
  jlptLevel: "N5" | "N4" | "N3" | "N2" | "N1";
  strokeCount: number | null;
  grade: number | null;       // 일본 학년별 배정 학년 (해당 시)
  frequency: number | null;   // 사용 빈도 순위 (낮을수록 흔함)
  onyomi: string[];
  kunyomi: string[];
  meaning: string[];          // 영문 뜻
}
```

### `kanjivg.json` — 한자별 획순 SVG path 데이터

```ts
type KanjiVgData = Record<string, string[]>; // 한자 -> path d 문자열 배열 (필순 그대로)
```

모든 path는 KanjiVG 표준 캔버스 `viewBox="0 0 109 109"` 기준이다. 프론트엔드에서
`<path d={d} />`를 배열 순서대로(또는 stroke-dasharray 애니메이션으로 하나씩) 그리면
필순 애니메이션을 구현할 수 있다.

### `pos-tags.json`

`dictionary.json`에 실제로 등장하는 품사 코드만 담은 `{ code: "영문 설명" }` 맵.
