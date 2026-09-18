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

### `dictionary.json` — JLPT 태그가 있는 단어 + 조사(품사 `prt`, JLPT 태그 없어도 포함) (총 8,405개)

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
  koreanReading: string[];    // 한글 표기 한자음 (KANJIDIC2 korean_h, 예: "수")
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

### `kana-words.json` — 오십음도 글자별 대표 단어 (104자)

```ts
type KanaWords = Record<
  string, // 히라가나 (요음은 "きゃ"처럼 두 글자)
  {
    hiragana: KanaWord[]; // 그 히라가나로 시작하는 단어 (최대 5개, 좋은 순)
    katakana: KanaWord[]; // 그 가타카나로 시작하는 외래어(가타카나로만 쓰는 단어, 최대 5개)
  }
>;
interface KanaWord { id: string; word: string; reading: string; meaning: string; }
```

`dictionary.json`에서 뽑아온다(별도 원본 없음). 오십음도 페이지가 2.9MB짜리 사전 청크를
통째로 끌어오지 않도록 미리 작은 파일로 떠두는 것이 목적이다. 후보 정렬은
"흔히 쓰는 단어 > 명사 > 낮은 JLPT 급수 > 짧은 읽기" 순이고 같은 표기는 한 번만 담는다.
한 글자짜리 칸은 뒤에 작은 가나가 오는 단어를 제외한다(り의 예시로 りょこう가 뽑히면 안 되므로).
자동 선정이 어색한 소수의 글자는 `build-kana-words.mjs`의 `OVERRIDES`에 첫 단어의 id를
지정한다(나머지 자리는 그대로 자동). ん은 그 글자로 시작하는 단어가 없어 `match: "contains"`로
ん이 들어간 단어에서 고른다. 8자(ぢ·づ 등)는 사전에 후보가 없어 양쪽 다 빈 배열이며,
그 경우 UI에서 대표 단어 칸을 아예 그리지 않는다.

### `pos-tags.json`

`dictionary.json`에 실제로 등장하는 품사 코드만 담은 `{ code: "영문 설명" }` 맵.
