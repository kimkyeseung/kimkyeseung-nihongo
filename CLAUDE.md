# 김계승 일본어 — 프로젝트 가이드

Chrome Canary의 온디바이스 AI(Prompt API, `window.LanguageModel`)를 활용한 개인용 일본어 학습 웹앱.
서버 없이 순수 프론트엔드로 동작한다. 전체 스펙은 [japanese_app_prompt_1.md](japanese_app_prompt_1.md) 참고.

## 기술 스택
- React + TypeScript + Tailwind CSS, 빌드 도구는 Vite
- 라우팅: react-router-dom
- 상태 관리: Zustand 또는 Context API — localStorage/IndexedDB와 동기화하는 커스텀 훅으로 감싸서 사용
- 애니메이션: Framer Motion (페이지 전환, 카드 스와이프, confetti 등)
- 로마자→히라가나: `wanakana` 패키지
- 패키지 매니저: npm

## 개발 순서
1. 변경 사항 작성
2. 타입체크: `npm run typecheck` (또는 `tsc --noEmit`)
3. 빌드: `npm run build`
4. 브라우저(Chrome Canary, `chrome://flags`에서 Prompt API 활성화)에서 직접 동작 확인

## 핵심 규칙 (이 프로젝트 고유)
- **LLM은 생성형 작업에만 사용한다**: 회화 응답, 예문 생성, 작문 첨삭. 사전 뜻풀이·읽기·
  JLPT 급수·한자 정보처럼 "정답이 정해진 정보"는 절대 LLM으로 생성하지 말고
  `src/data/`의 정적 JSON(JMDict/KANJIDIC/KanjiVG 가공본)에서 조회한다.
- 동사 て형 등 규칙 기반 활용형은 LLM이 아니라 직접 구현한 변환 함수로 계산한다.
- `window.LanguageModel` 사용 전 반드시 `'LanguageModel' in window`로 가드하고,
  미지원 시 안내 화면을 보여준다.
- LLM 세션은 커스텀 훅으로 생성/재사용/`destroy()`를 관리하고, 불필요한 세션은 즉시
  destroy한다. 스트리밍이 가능하면 `promptStreaming()`을 우선 사용한다.
  **페이지는 `useAiModel`만 쓴다** — 그 아래에서 Chrome 내장 Prompt API(`useLanguageModel`)와
  Gemma 4(`useGemmaSession`)를 갈아끼운다. 페이지에서 둘 중 하나를 직접 부르지 말 것.
- 외부 데이터셋(JMDict, KANJIDIC2, KanjiVG, Tatoeba)은 전부 CC BY-SA/CC-BY 라이선스이므로
  정보 페이지와 README에 출처를 표기해야 한다.
- 대용량 사전 데이터는 IndexedDB, 가벼운 사용자 상태(단어장, 스트릭/XP)는 localStorage에 저장한다.
  GB 단위 바이너리(Gemma 모델 파일)만 예외적으로 OPFS에 둔다 — "대문/Gemma 4" 노트 참고.

## 타입 컨벤션
- `interface`보다 필요한 곳엔 명시적 타입 사용 (예: `WordEntry`, `KanjiEntry`)
- JLPT 급수처럼 값이 고정된 경우 `enum` 대신 문자열 리터럴 유니온 사용
  (예: `'N5' | 'N4' | 'N3' | 'N2' | 'N1'`)

## 디자인 톤
듀오링고 스타일 카툰풍, 아동 친화적(큰 글씨/큰 터치 영역/둥근 모서리). 컬러는
`--color-primary` 등 CSS 변수로 관리. 상세 가이드는 스펙 문서의 "디자인/UI 스타일 가이드" 참고.

## 프로젝트 구조
```
src/router.tsx     react-router-dom 라우트 정의 (완료)
src/components/    Layout(AnimatedOutlet로 페이지 전환, 상단바에 GamificationBar 포함),
                     KanjiStrokeOrder, KanjiDetailSheet, WordbookCard, FuriganaText, WritingDiff,
                     BadgeSheet, BadgeWatcher(뱃지 신규 획득 감지), Confetti, LoadingMascot,
                     PromptApiUnsupportedNotice(LLM 페이지 공용 안내 화면),
                     PromptApiOnboardingDialog(첫 접속 시 1회 안내 모달),
                     ProgressBar(공용 진행률 바) + AssetLoadingBar(대문 학습 데이터 프리로드) +
                     GemmaModelCard(대문 Gemma 4 모델 다운로드/엔진 선택) +
                     SpeakButton(문장/단어 끝 발음 재생 버튼) +
                     KanaDetailDialog(오십음도 글자 상세)
src/pages/         스펙의 7개 페이지 전부 완료(오십음도·한자·사전·단어상세·단어장·회화·작문)
                     + AboutPage(정보/출처, 하단 네비게이션 밖) + HomePage(대문 `/`)
src/hooks/         useJapaneseSpeech, useDebouncedValue, useLanguageModel,
                     useAssetPreload, useGemmaModel 완료
src/lib/           정적 데이터 조회 헬퍼(kanji.ts, kanjivg.ts, dictionary.ts, srs.ts) +
                     furigana.ts(LLM 응답에 사전 후리가나 오버레이) + diff.ts(문자 단위 LCS diff) +
                     conversationPrompts.ts + writingCorrection.ts(첨삭 프롬프트/응답 파싱) +
                     xpRewards.ts(행동별 XP 값) + badges.ts(뱃지 정의) +
                     preloadAssets.ts(대문 프리로드) + gemmaModel.ts/gemmaEngine.ts(Gemma 4) +
                     speechText.ts(TTS에 넘기기 전 일본어만 남기는 전처리) +
                     kanaWords.ts(오십음도 글자별 대표 단어 조회)
src/stores/        Zustand 스토어:
                     kanjiProgressStore·wordbookStore·recentSearchesStore·gamificationStore·
                     aiEngineStore (전부 localStorage persist) · confettiStore(휘발성, persist 안 함)
src/data/          정적 데이터(dictionary.json, kanji.json, kanjivg.json, pos-tags.json,
                     kana-words.json, gojuon.ts) — 완료
public/            favicon.svg, icons.svg, hero.png(대문 그림 1536×1024)
src/types/         WordEntry, KanjiEntry, JlptLevel, LanguageModel API 타입, opfs.ts(move 선언) — 완료
scripts/data/      src/data/*.json을 만드는 다운로드·가공 스크립트 (완료, scripts/data/README.md 참고)
```

하단 네비게이션 경로 7개 전부 완료: `/gojuon`(기본) · `/dictionary`(+`/dictionary/:id`) · `/kanji` ·
`/wordbook` · `/conversation` · `/writing`. 스펙 문서(japanese_app_prompt_1.md)의 페이지 구성은
전부 최소 기능으로 구현됨. 추가로 `/about`(정보/출처 페이지, 헤더의 ⓘ 아이콘으로 진입,
하단 네비게이션에는 없음) 완료. 남은 건 다듬기(번들 최적화 등)와 QA.

## 정보/출처 페이지 (`/about`) 구현 노트
- 스펙의 "정보 페이지 및 README에 데이터 출처/라이선스 명시" 요구사항을 [AboutPage.tsx](src/pages/AboutPage.tsx)와
  루트 [README.md](README.md) 양쪽에 구현했다 — 내용은 같은 출처 목록이지만 표현 방식만 다름
  (앱 안 카드 UI vs 마크다운 표). 출처가 하나라도 바뀌면 **양쪽 다** 갱신할 것, 그리고
  `scripts/data/README.md`(가공 스크립트 문서)까지 셋이 같은 출처 정보를 담고 있으니 함께 확인할 것.
- `/about`은 하단 네비게이션 7개 항목에 포함되지 않는다 — 스펙에 없는 페이지라 헤더에 작은
  ⓘ 아이콘 링크로만 노출했다. 비슷하게 "설정"처럼 주요 학습 흐름이 아닌 페이지를 추가할 땐
  하단 네비게이션에 욱여넣지 말고 헤더 아이콘 패턴을 따를 것.

## 게이미피케이션 구현 노트
- `useGamificationStore.recordProgress(xp)` 하나로 XP 지급과 스트릭(연속 학습일) 갱신을 같이
  처리한다. 날짜는 로컬 타임존 기준 `YYYY-MM-DD` 문자열로 비교하며, 같은 날 여러 번 호출해도
  스트릭은 하루에 한 번만 올라간다(오늘 처음 호출 시 +1, 이미 오늘 기록했으면 유지, 하루 이상
  건너뛰면 1로 리셋). XP는 호출할 때마다 계속 쌓인다.
- XP 지급 시점은 "명확한 학습 완료 행동"에만 건다 — 토글을 껐다 켰다 하며 중복 지급되지
  않도록 항상 "아직 안 된 상태 → 되는 상태로 바뀔 때"만 지급한다(예: 한자 학습완료 토글,
  단어장 추가 토글 모두 off→on 전환 시에만 `recordProgress` 호출, on→off에는 호출 안 함).
  새로운 토글형 액션에 XP를 달 때도 이 규칙을 따를 것.
- 행동별 XP 값은 `src/lib/xpRewards.ts` 한 곳에 모아뒀다 — 밸런스 조정 시 여기만 고치면 된다.
- 뱃지(`src/lib/badges.ts`)는 "unlocked" 여부를 별도로 저장하지 않고, xp/스트릭/단어장
  개수/한자 학습 개수로부터 매번 즉석에서 계산한다(`BadgeSheet.tsx`). 조건이 전부 "누적치
  ≥ 기준값"이라 되돌아갈 일이 없어 이 방식이 저장소 동기화 걱정 없이 가장 단순하다.
  뱃지를 추가할 땐 `BadgeContext`에 새 필드를 늘리기보다, 최대한 기존 4개 지표(xp/streak/
  wordbookCount/kanjiLearnedCount)로 표현할 수 있는지 먼저 고민할 것.
- 상단바(`Layout.tsx`)의 `GamificationBar`를 탭하면 `BadgeSheet`가 열린다 — 스펙의 "상단바에
  표시"를 스트릭/XP 숫자로, 뱃지는 탭해서 보는 상세 뷰로 구현했다.

## 대문 페이지(`/`) 구현 노트
- `/`는 예전엔 `/gojuon`으로 리다이렉트했지만 지금은 `HomePage`(대문)다. 헤더·하단 네비게이션이
  없는 전체 화면이라 **Layout 밖**에 두고, 나머지 라우트는 path 없는 레이아웃 라우트로 감쌌다
  (`router.tsx`). 대문으로 돌아가는 길은 `Layout.tsx`의 헤더 로고 링크뿐 — `/about`과 같은
  "스펙에 없는 페이지는 하단 네비에 넣지 않는다" 규칙을 따른다.
- HomePage만 `lazy()`가 아니라 정적 import다. 첫 화면이라 청크 왕복을 한 번 더 하면 손해고,
  이 페이지가 쓰는 큰 데이터는 전부 동적 import 뒤에 있어서 진입 청크는 그대로 가볍다
  (빌드 기준 461KB/gzip 148KB — 대문 추가 전 445KB에서 거의 안 늘었다).
- **히어로 이미지**: `public/hero.png`의 배경색이 페이지 배경과 **정확히 같은 `#faf4e4`**라서
  테두리·둥근 모서리 없이 여백 바깥까지 꽉 채워도 경계가 안 보인다. 그림을 바꾸면 이 색부터
  맞출 것 — 안 맞으면 네모난 경계가 그대로 드러난다.
- **학습 데이터 프리로드**(`preloadAssets.ts`): 사용자가 소개 글을 읽는 동안 kanji/dictionary/
  kanjivg 청크를 순서대로 미리 당겨와 `AssetLoadingBar`에 진행률을 보여준다. 진행률 가중치는
  항목 수가 아니라 **실제 파일 크기(바이트)**다 — 1/n로 나누면 2.9MB짜리 사전에서 바가 한참
  멈춘 것처럼 보인다. 한 항목이 실패해도 나머지는 계속 받고 바는 끝까지 차오른다(실패는 ⚠️로
  따로 표시). 대문 그림은 학습 데이터가 아니므로 이 목록에 넣지 않는다.
- 로딩이 안 끝나도 CTA를 눌러 앱으로 넘어갈 수 있다 — 못 받은 데이터는 그 페이지에서 평소대로
  다시 받으므로 막을 이유가 없다.

## Gemma 4 엔진 구현 노트
- **전제**: Chrome Prompt API는 모델을 고를 수 없다. `LanguageModel.create()`에 모델 선택
  파라미터가 없고 브라우저가 들고 있는 모델을 쓴다. 그래서 "Prompt API의 모델을 Gemma로
  교체"는 불가능하고, **WebGPU 위에서 도는 별도 엔진(LiteRT-LM)을 두 번째 선택지로 추가**하는
  구조로 만들었다. 이 구분을 잊고 Prompt API에 모델 옵션을 넘기려 하지 말 것.
- `@litert-lm/core`(Google 공식, `google-ai-edge/LiteRT-LM`)를 쓴다. 모델은 Hugging Face의
  `litert-community/gemma-4-E2B-it-litert-lm` / `gemma-4-E2B-it-web.litertlm`,
  **정확히 2,008,432,640 바이트**. 공개 파일이라 토큰이 필요 없고 CORS도 열려 있다(확인함).
- 구성: 모델 다운로드 + OPFS 캐시(`gemmaModel.ts`), 엔진 어댑터(`gemmaEngine.ts`), 대문 카드
  UI(`GemmaModelCard.tsx`), 엔진 선택 스토어(`aiEngineStore.ts`), 세션 훅(`useGemmaSession.ts`),
  그리고 두 엔진을 갈아끼우는 창구(`useAiModel.ts`).
- `useAiModel`은 훅 규칙상 `useLanguageModel`과 `useGemmaSession`을 **항상 둘 다 호출**하고
  결과만 골라서 돌려준다. 쓰지 않는 쪽은 비용이 없다 — Prompt API는 첫 `prompt()` 때 지연
  생성이고, Gemma는 `enabled=false`면 OPFS 확인조차 하지 않는다. 조건부로 훅을 부르지 말 것.
- **Gemma를 골랐는데 못 쓰는 경우**(모델 없음 / WebGPU 없음)는 `GemmaEngineNotice`로 안내한다.
  `PromptApiUnsupportedNotice`를 재사용하면 "브라우저가 Prompt API를 지원하지 않는다"는 엉뚱한
  안내가 되므로 따로 뒀다 — 이건 "LLM 화면은 안내 컴포넌트를 재사용할 것" 규칙의 예외다.
  대신 되돌아갈 길("Chrome 내장 AI로 전환" 버튼)을 항상 같이 준다.
- **아직 실제 추론은 검증하지 못했다**: 2GB 다운로드 + WebGPU 실행이 필요해서, 지금까지 확인한
  건 다운로드 배관(진행률·OPFS 기록·취소 정리), 엔진 전환 UI, Prompt API 경로 무회귀까지다.
  모델을 실제로 받은 뒤 `createGemmaSession()` 응답 품질과 `maxNumTokens: 4096` 설정이
  회화 맥락에 충분한지 확인할 것.
- 진행률은 LiteRT-LM이 제공하지 않는다(`Engine.create`에 progress 콜백 없음). 그래서
  `downloadModel()`이 직접 `fetch` 응답 스트림의 바이트를 세고, 받은 조각은 **메모리에 쌓지 않고
  바로 OPFS로 흘려보낸다** — 2GB를 통째로 들고 있으면 탭이 죽는다.
- 받다 만 파일은 `*.part`로 쓰다가 **다 받은 뒤에만** `move()`로 최종 이름을 붙인다. 읽을 때도
  크기가 정확히 맞는지 확인하고 안 맞으면 지운다 — 끊긴 다운로드가 완성본 행세를 못 하게.
  (`FileSystemFileHandle.move()`는 TS 기본 타입에 없어서 `src/types/opfs.ts`에 선언해뒀다.)
- 엔진은 앱 전체에서 **하나만** 둔다(모듈 레벨 Promise). 모델 2GB를 GPU에 올리는 비용 때문이고,
  시나리오별 세션은 그 엔진에서 파생되는 `Conversation`으로 만든다(만들고 지우는 비용이 싸다).
- `@litert-lm/core`는 WASM 런타임을 기본적으로 **jsDelivr CDN**에서 받는다(변종 하나 21~34MB).
  자체 호스팅하려면 `node_modules/@litert-lm/core/wasm/`(4개 합쳐 107MB)을 public/에 복사하고
  `gemmaEngine.ts`의 `LITERT_WASM_PATH`에 경로를 넣으면 된다. 저장소 무게 vs 외부 CDN 의존의
  트레이드오프라 아직 CDN 기본값을 쓰고 있다.
- 2GB짜리라 **절대 자동으로 받지 않는다** — 대문에서 버튼을 누르는 것이 곧 동의다. 새로 큰
  애셋을 받는 기능을 추가할 때도 이 규칙을 따를 것.

## 회화 페이지 구현 노트
- `useLanguageModel(systemPrompt)` 훅이 `window.LanguageModel` 전체를 감싼다: 마운트 시
  `'LanguageModel' in window`로 동기 가드 후 `availability()` 확인, 세션은 첫 프롬프트 때
  지연 생성, `systemPrompt`가 바뀌면(시나리오/레벨 변경) 이전 세션을 destroy. `monitor`의
  `downloadprogress`로 모델 다운로드 진행률을 노출한다. 새 LLM 기능(작문 첨삭 등)에서도
  이 훅을 그대로 재사용할 것 — `window.LanguageModel`을 직접 호출하지 말 것.
- "문법 교정 보기"는 회화용 세션과 별도로 `useLanguageModel("")`를 하나 더 띄워, 사용자의
  마지막 입력만 담은 프롬프트(`buildCorrectionPrompt`)를 단발성 `prompt()`로 보낸다 —
  회화 세션의 롤플레이 맥락을 오염시키지 않기 위해 세션을 분리했다.
- 후리가나는 LLM에게 만들게 하지 않는다. `src/lib/furigana.ts`의 `annotateFurigana`가
  `dictionary.json`에 이미 있는 단어만 그리디 최장일치로 찾아 후리가나를 입힌다
  (사전에 없는 단어/표현은 그냥 원문 그대로 — 이 프로젝트의 "사전적 사실은 LLM이 지어내지
  않는다" 규칙과 동일한 이유). `FuriganaText` 컴포넌트로 렌더링.
- **테스트 환경 참고**: 이 브라우저(미리보기)에는 실제로 `window.LanguageModel`이 존재하지만,
  실제 온디바이스 모델이 아니라 입력을 그대로 되돌려주는 스텁이다("On-device model is not
  available in Chromium, this API is just echoing back the input: ..."). 덕분에 실제 세션
  생성·스트리밍·후리가나 오버레이·문법 교정 흐름을 콘솔 에러 없이 end-to-end로 검증할 수
  있었지만, 실제 자연스러운 응답 품질은 Chrome Canary에서 별도로 확인해야 한다. 이 환경에
  `window.LanguageModel`이 있다 보니 아래 온보딩 다이얼로그도 정상적으로는 안 뜬다 —
  검증할 땐 `PromptApiOnboardingDialog.tsx`의 `show` 계산식을 잠깐 `true ||`로 강제한 뒤
  꼭 원복할 것 (실제로 이렇게 확인했음).

## Chrome 미지원 안내 다이얼로그 (`PromptApiOnboardingDialog`)
- 첫 접속 시 `window.LanguageModel` 자체가 없으면(=Prompt API 미지원 브라우저) 모달로
  Chrome Canary 다운로드 링크(`https://www.google.com/chrome/canary/`)와 안내를 보여준다.
  `localStorage`(`promptApiNoticeDismissed`)로 한 번 닫으면 다시 안 뜬다 — 회화/작문
  페이지에 항상 보이는 `PromptApiUnsupportedNotice`(인라인 안내)와는 역할이 다르다:
  이 다이얼로그는 "앱 켜자마자 한 번" 알려주는 용도, 인라인 안내는 "그 페이지에 실제로
  들어갈 때마다" 보여주는 용도라 **둘 다 유지할 것, 하나로 합치지 말 것**.
- 지원 여부 판단은 `src/lib/languageModel.ts`의 `isPromptApiSupported()` 하나로 통일했다
  (`useLanguageModel` 훅과 이 다이얼로그가 같이 씀) — 새로 지원 여부를 확인하는 코드가
  필요하면 이 함수를 재사용할 것, `'LanguageModel' in window`를 여기저기서 새로 쓰지 말 것.

## 작문 첨삭 페이지 구현 노트
- `useLanguageModel`을 그대로 재사용(회화 페이지와 동일 패턴). 모델에게 항상 고정된
  형식(`### 수정문` / `### 격식체` / `### 설명`)으로만 답하도록 프롬프트에 명시하고,
  `src/lib/writingCorrection.ts`의 `parseCorrectionResponse`가 정규식으로 각 섹션을 뽑는다.
  모델이 형식을 안 지켜도(예: 구형 모델, 스텁) 안 깨지도록 매치 실패 시 원문/전체 텍스트로
  폴백한다 — 새로 LLM에게 "정해진 형식으로 답하라"고 시키는 기능을 또 만들 때 이 폴백 패턴을
  따를 것.
- 원문/수정문 하이라이트는 LLM이 하지 않고 `src/lib/diff.ts`의 `diffChars`(문자 단위 LCS)로
  클라이언트에서 직접 계산한다 — 일본어는 띄어쓰기가 없어 단어 단위 대신 문자 단위로 diff한다.
- 브라우저 미지원 안내 화면은 `PromptApiUnsupportedNotice` 컴포넌트로 공용화했다 (회화
  페이지에서 추출). LLM을 쓰는 새 화면을 또 만들 때 이 컴포넌트를 재사용할 것 — 새로 만들지 말 것.

## WanaKana + React 통합 주의사항 (실제로 겪은 버그)
`bind(inputRef.current, { IMEMode: "toHiragana" })`로 로마자→히라가나 변환을 붙인 input에
**React의 `onChange` prop을 쓰면 안 된다.** WanaKana가 변환 후 발생시키는 `input` 이벤트를
React의 합성 이벤트 시스템이 IME 조합(composition) 관련 내부 처리 때문에 간헐적으로 놓친다
(재현 조건이 불규칙해서 콘솔 에러 없이 그냥 상태가 갱신 안 됨 — 디버깅 어려움).
반드시 `useEffect`에서 `inputRef.current.addEventListener("input", handler)`로 네이티브
리스너를 직접 붙이고 `e.target.value`를 읽어 state를 갱신할 것 (`DictionaryPage.tsx` 참고).
이후 wanakana를 쓰는 다른 입력(작문 페이지 등)에도 동일 패턴을 적용할 것.

## Framer Motion 드래그(스와이프 카드) 주의사항 (실제로 겪은 버그)
`drag="x"` + `onDragEnd`로 스와이프를 구현할 때, **같은 스와이프 제스처에 대해 `onDragEnd`가
두세 번 연달아 호출되는 경우가 있다** (환경에 따라 다름 — 트랙패드/일부 입력 장치에서 재현).
`onDragEnd` 핸들러 안에서 store 변경(추가/삭제)이나 `setState`를 그냥 실행하면, 중복 호출 때문에
같은 카드가 여러 번 처리되어 상태가 꼬인다 (예: 되돌리기용 스냅샷이 두 번째 호출에서 덮어써져
`null`이 되는 바람에 "실행 취소"가 항상 조용히 실패했던 버그가 있었음 — 콘솔 에러 없음).
**반드시 `useRef`로 "마지막으로 처리한 카드 id"를 기록해 같은 id의 중복 호출을 무시할 것**
(`WordbookPage.tsx`의 `lastHandledRef` 패턴 참고). state가 아니라 ref를 쓰는 이유는 배치/재렌더
타이밍과 무관하게 즉시 반영되어야 하기 때문.

## 폼 제출(Enter) 주의사항 (실제로 겪은 버그)
`<form onSubmit>` + Enter로 암묵적 제출에 의존하는 방식이 이 프로젝트 환경에서 간헐적으로
동작하지 않았다(그룹 이름 추가 인풋에서 재현). **`<form onSubmit>` 대신 인풋에 직접
`onKeyDown`을 붙여 `e.key === "Enter"`를 확인하는 방식을 표준으로 쓴다** (DictionaryPage의
검색창, WordbookPage의 그룹 추가 인풋 참고). 새 텍스트 인풋을 추가할 때도 이 패턴을 따를 것.

## React state 리셋 시점 주의사항 (실제로 겪은 버그)
그룹 필터가 바뀔 때만 복습 큐를 새로 만들고 싶은데, `useEffect`의 의존성 배열에 `entries`
(store에서 파생된 배열)를 넣으면 **스와이프해서 store가 바뀔 때마다도 큐가 리셋**되어 진행 중이던
복습 세션이 매번 날아가는 버그가 있었다. "prop이 바뀔 때만 로컬 상태를 초기화"하고 싶으면
`useEffect` + `setState` 조합보다 **`key` prop으로 컴포넌트를 통째로 리마운트시키고
`useState(() => ...)` lazy initializer로 마운트 시점 스냅샷을 만드는 패턴**이 더 안전하고
oxlint의 `react-hooks/exhaustive-deps` 경고도 피할 수 있다 (`ReviewDeck`을
`<ReviewDeck key={activeGroup} .../>`로 리마운트시키는 방식 참고).

## 헤더/하단 네비게이션 레이아웃 주의사항 (실제로 겪은 버그, 중요)
`Layout.tsx`의 루트를 `min-h-svh flex flex-col`로 하고 가운데 `<main>`을
`flex-1 overflow-y-auto`로만 주면, 콘텐츠가 뷰포트보다 긴 페이지(오십음도, 한자 목록 등)에서
**`main`이 내부 스크롤되지 않고 콘텐츠 높이만큼 계속 늘어나 버려서, 결과적으로 body 전체가
스크롤되며 하단 네비게이션 바가 화면 밖으로 밀려나 사라지는** 버그가 있었다(콘솔 에러 없이
조용히 발생 — 짧은 페이지에서는 안 보이다가 긴 페이지에서만 나타나서 발견이 늦었음).
flexbox의 잘 알려진 함정으로, flex 아이템은 기본적으로 `min-height: auto`라 `flex-1`을 줘도
내용물보다 작아지지 않는다. **고정 방법: 루트는 `min-h-svh`가 아니라 `h-svh`(고정 높이)로,
스크롤 영역인 `<main>`에는 `flex-1 overflow-y-auto`에 `min-h-0`을 반드시 추가한다.**
새로 풀스크린 레이아웃(헤더+스크롤 영역+하단바 구조)을 만들 때마다 이 패턴을 그대로 쓸 것.

## 오십음도 페이지 구현 노트
- 글자를 탭하면 `KanaDetailDialog`(사전의 `WordMeaningDialog`와 같은 바텀시트 패턴)가 열리면서
  발음도 같이 재생된다. 다이얼로그에는 큰 글자·로마자·발음 버튼, **반대쪽 문자**(히라가나를
  보고 있으면 가타카나를, 반대면 히라가나를), 대표 단어 최대 5개가 뜬다. 단어 줄을 누르면
  단어 상세로 가고, 그 옆 버튼으로 발음을 듣는다(링크 안에 버튼을 넣으면 안 되므로 나란히 둠).
- **대표 단어는 `src/data/kana-words.json`에서 읽는다** — 사전적 사실이라 LLM 금지고, 그렇다고
  `dictionary.ts`를 쓰면 2.9MB짜리 사전 청크가 오십음도(하단 네비 기본 진입 페이지)까지
  딸려온다. 그래서 `scripts/data/build-kana-words.mjs`가 dictionary.json에서 글자별로 5개씩
  미리 뽑아 58KB짜리 파일로 떨궈둔다(GojuonPage 청크 62KB/gzip 18KB). 오십음도에 사전 데이터가
  더 필요해지면 이 방식을 따를 것 — 런타임에 dictionary.json을 import하지 말 것.
  선정 규칙과 예외는 scripts/data/README.md 참고.
- 가타카나 모드에서는 외래어(カップ), 히라가나 모드에서는 고유어/한자어(角)를 보여준다.
  한쪽이 비면 다른 쪽으로 폴백하고, 둘 다 없는 8자(ぢ·づ 등)는 대표 단어 칸을 아예 안 그린다.
- **알려진 문제**(아직 안 고침): ① 탭할 때마다 `XP_REWARDS.gojuonPlayed`가 무조건 지급돼서
  연타하면 XP가 무한히 쌓인다 — 게이미피케이션 규칙("전환될 때만 지급")과 어긋나므로 가나
  학습 진도 스토어를 만들 때 "처음 들어본 글자"에만 주도록 함께 고칠 것. ② 375px 화면에서
  표가 9px 넘쳐 마지막 열이 잘린다(셀 최소폭 3.5rem / 행 레이블 2rem을 줄이면 된다).

## 발음 재생(TTS) 구현 노트
- 문장/단어 끝의 🔊 버튼은 전부 `SpeakButton` 하나다(내부에서 `useJapaneseSpeech` 사용).
  문장을 보여주는 새 화면에서 발음이 필요하면 이 컴포넌트를 재사용할 것 — 화면마다
  `useJapaneseSpeech`를 새로 부르지 말 것. 오십음도는 예외로 칸 자체를 탭하면 소리가
  나는 구조라 버튼을 따로 붙이지 않았다.
- 현재 붙어있는 곳: 단어 상세(표제어·LLM 예문), 단어 뜻 다이얼로그, 회화(AI 말풍선·내
  말풍선), 작문 첨삭(원문/수정문·비슷한 문장·응용 표현·더 정중한/친근한 표현).
- **한자 표기 대신 사전의 가나 읽기를 읽힌다**(단어 단위일 때). 음성 엔진이 한자를 다른
  음으로 읽는 경우가 있어서, `entry.reading`이 있으면 그걸 넘긴다.
- **화면 문자열을 그대로 읽히면 안 된다**: "비슷한 문장"처럼 `일본어 (한국어 번역)` 형식인
  항목이 있어서, `src/lib/speechText.ts`의 `toSpeechText()`가 한글이 든 괄호와 목록 불릿을
  걷어낸 뒤 발화한다. SpeakButton이 내부에서 항상 통과시키므로 호출부는 화면 문자열을
  그대로 넘기면 된다.
- **음성 고르기 (실제로 겪은 버그)**: 예전엔 `voices.find(v => v.lang === "ja-JP")`로 목록의
  첫 번째를 썼는데, macOS Ventura+ 의 ja-JP 목록은 캐릭터 목소리(Eddy·Flo·Grandma·Rocko…)가
  앞을 차지해서 **Kyoko가 아니라 Eddy가 선택되고 있었다**(발음이 과장되게 들리는 원인).
  지금은 `useJapaneseSpeech`의 `scoreVoice`가 캐릭터 목소리를 걸러내고
  O-ren/Hattori/Kyoko/Google 日本語 같은 표준 음성과 이름에 Premium/Enhanced/Siri가 붙은
  고품질 버전을 우선한다. **목록의 순서를 신뢰하지 말 것** — 기기마다 다르다.
  (사용자가 macOS 시스템 설정에서 고급 일본어 음성을 받아두면 자동으로 그쪽이 선택된다.)
- 속도는 0.95가 기본이다(0.85는 늘어져서 부자연스럽고 1.0은 학습자가 따라가기 빠르다).
  `speak(text, { rate })`로 호출부에서 바꿀 수 있다.
- 긴 문장은 `splitForSpeech`가 문장부호 단위로 끊어 큐에 넣는다 — Chrome이 긴 발화를
  15초쯤에서 잘라먹는 버그를 피하면서 문장 사이 호흡도 자연스러워진다. 너무 잘게 끊기면
  뚝뚝 끊겨 들려서 120자까지는 앞 조각에 이어 붙인다.
- 버튼 아이콘은 🗣️다. 🔊는 애플 이모지에서 회색이라 작게 쓰면 잘 안 보인다. 이모지를 바꿀 땐
  VS16(`️`)을 꼭 붙일 것 — 없으면 흑백 텍스트 글리프로 렌더될 수 있다.
- SpeechSynthesis 미지원 브라우저에서는 버튼이 아예 렌더링되지 않는다(안내 문구는
  오십음도처럼 페이지 단위로 한 번만 보여주는 쪽이 덜 시끄럽다).
- 재생에는 XP를 주지 않는다 — 버튼을 연타하면 무한히 쌓이기 때문. 오십음도의
  `XP_REWARDS.gojuonPlayed`는 "그날 오십음도를 공부했다"는 신호로 남겨둔 기존 동작이다.

## 애니메이션 디테일 구현 노트
스펙의 "애니메이션/트랜지션 (전반적으로 풍부하게 적용)" 요구사항을 아래처럼 구현했다:
- **페이지 전환**: `Layout.tsx`의 `AnimatedOutlet`이 `useOutlet()` + `useLocation().pathname`을
  키로 쓴 `motion.div`를 `AnimatePresence mode="wait"`로 감싼다. `<Outlet/>`을 직접 키잉하면
  안 되는 이유는 주석 참고 — react-router + framer-motion 조합의 정석 패턴.
- **confetti(정답/축하 효과)**: `useConfettiStore.celebrate()` 한 번 호출로 전역 confetti가
  터진다 (`Confetti.tsx`, `Layout.tsx`에 한 번만 마운트). 한자 학습완료, 단어장 "아는 단어"
  스와이프, 작문 첨삭 결과가 "수정할 부분 없음"일 때, 그리고 뱃지 신규 획득 시 호출한다.
  새로운 "정답/완료" 이벤트를 추가할 때도 `celebrate()`를 그대로 재사용할 것 — 새 confetti
  컴포넌트를 만들지 말 것.
- **오답/미흡 피드백(살짝 흔들림)**: CSS `animate-shake` 클래스(정적 엘리먼트용, 예: 작문
  첨삭 결과 카드)와, framer-motion으로 컨트롤되는 `x`/`rotate` 같은 모션값이 이미 걸려있는
  엘리먼트(예: `WordbookCard`)는 서로 방식이 다르다. **모션값이 이미 걸린 엘리먼트에는
  CSS 애니메이션 클래스를 섞어 쓰면 안 된다** (같은 `transform` 속성을 두 시스템이 동시에
  건드려서 깨진다) — 대신 `animate()` 함수(컴포넌트 prop이 아니라 `framer-motion`의 standalone
  함수)로 그 모션값 자체를 시퀀스로 움직인다 (`WordbookCard.tsx`의 왼쪽 스와이프 처리 참고).
- **뱃지 획득 연출**: `BadgeWatcher.tsx`가 항상 마운트되어 xp/스트릭/단어장/한자 학습 수를
  지켜보다가, 이전에 없던 뱃지 id가 생기면 `celebrate()` + 상단 토스트를 띄운다. `BadgeSheet`가
  열려있지 않아도 동작해야 하므로 `Layout.tsx`에 항상 마운트해둔 것 — 뱃지 관련 컴포넌트를
  조건부로만 마운트하지 말 것.
- **로딩 마스코트**: `LoadingMascot.tsx`(🗻가 위아래로 통통 튀는 애니메이션)를 회화 응답 대기,
  작문 첨삭 대기에 사용한다. LLM 응답을 기다리는 새 화면에서도 이걸 재사용할 것.
- 버튼 "눌리는" 3D 피드백은 새로 만들지 않고 기존 `.btn-press` CSS 클래스(index.css)를 계속
  쓴다 — 개별 버튼마다 framer-motion whileTap을 추가할 필요 없음.

## 번들 최적화 구현 노트
정적 데이터(dictionary.json 2.9MB, kanjivg.json 1.9MB, kanji.json 391KB)를 그냥 `import`하면
전부 하나의 진입 JS에 번들링돼서 `npm run build`가 5.7MB(gzip 1.6MB)짜리 단일 청크를
만들었다. 두 단계로 줄였다:
1. **라우트 단위 코드 스플리팅**: `router.tsx`에서 모든 페이지를 `lazy(() => import(...))`로
   불러온다. 특정 페이지에서만 쓰는 데이터(dictionary.ts, kanji.ts 등)는 그 페이지가 실제로
   방문되기 전까지 자동으로 다운로드되지 않는다 — 진입 청크가 445KB(gzip 142KB)로 줄었다
   (약 10배). `Layout.tsx`의 `AnimatedOutlet`이 lazy 컴포넌트를 렌더링하므로 반드시
   `<Suspense fallback={...}>`로 감싸야 한다(이미 되어 있음, `LoadingMascot` 재사용).
2. **kanjivg.json 자체를 한 번 더 지연 로드**: KanjiPage 청크만 해도 2.3MB(kanjivg 포함)라
   커서, `src/lib/kanjivg.ts`가 정적 import 대신 `import("../data/kanjivg.json")`을 모듈
   레벨 Promise로 캐싱하고 React 19의 `use()`로 읽는다(`useStrokes` 훅). 그 결과 한자
   그리드(KanjiPage, kanji.json만 필요)는 397KB로 가벼워지고, 획순 데이터(1.9MB)는 실제로
   `KanjiStrokeOrder`를 렌더링할 때만(=한자 상세를 열 때만) 로드된다. 호출부(`KanjiDetailSheet`)는
   `<Suspense>`로 감싸 로딩 중엔 `LoadingMascot`을 보여준다.

같은 패턴(정적 import 대신 동적 import + `use()` + Suspense)을 나중에 dictionary.json에도
적용할 수 있다 — 지금은 사전/단어장/회화/단어상세 여러 페이지가 공유해서 쓰다 보니 이미
하나의 공유 청크(2.9MB)로 자동 분리되어 있고, 그 이상 쪼개는 건 아직 안 했다. 정말 더 줄이고
싶어지면 dictionary.ts도 kanjivg.ts와 같은 방식으로 바꿀 것.

## 한자 페이지 구현 노트
- 획순 애니메이션은 `KanjiStrokeOrder`가 `kanjivg.json`의 path를 Framer Motion `motion.path`의
  `pathLength` 애니메이션으로 순서대로 그린다. 다시보기는 `key`를 바꿔 강제 리마운트하는 방식.
  KanjiVG 데이터가 없는 한자는 문자만 정적으로 표시하는 폴백이 있다.
  이 방식이 프로젝트 표준이므로, 나중에 사전 상세 페이지 등에서 획순을 다시 보여줄 때도
  `useStrokes`/`KanjiStrokeOrder`를 재사용할 것 — 새로 만들지 말 것 (`useStrokes`는 내부적으로
  kanjivg.json을 동적 import로 지연 로드하므로 반드시 `<Suspense>`로 감싼 곳에서만 쓸 것).
- "활용 단어"는 `src/lib/dictionary.ts`의 `findWordsContainingKanji`가 `dictionary.json`을
  한자 단위로 인덱싱해 조회한다(런타임 1회 인덱스 빌드, 이후 캐시).
- 학습 완료 상태는 `useKanjiProgressStore`(zustand `persist` 미들웨어)로 localStorage에 저장한다.
  단어장의 스와이프/마스터 상태도 같은 패턴(zustand persist)으로 만들 것.
- **한국 한자음 표기**: KANJIDIC2의 `korean_h`(한글 표기 한자음, 예: 水 → "수") 리딩을
  `koreanReading: string[]`로 `kanji.json`에 포함해뒀다 — 언어별로 파일이 나뉘는 건 KANJIDIC2의
  "뜻(meaning)"뿐이고 "읽기(reading)"는 `kanjidic2-en.json` 하나에 한국어/중국어/베트남어 표기가
  전부 들어있어서 별도 한국어판 데이터셋을 새로 받을 필요가 없었다(`scripts/data/build-kanji.mjs`
  참고). `KanjiDetailSheet`에서 음독/훈독 옆에 표시한다. 새로 한자 관련 다국어 표기가 필요해지면
  `readingMeaning.groups[0].readings`에서 `type`으로 먼저 걸러지는지 확인할 것(예: `pinyin`,
  `vietnam`도 이미 캐시에 있다).
- **학습 미완료 한자 테스트**: `KanjiPage`의 "미완료 한자 테스트" 버튼이 현재 급수에서 아직
  학습 완료로 표시하지 않은 한자만 모아 `KanjiQuizSheet`(4지선다 읽기 퀴즈)를 연다. 문제/오답
  보기는 `src/lib/kanjiQuiz.ts`의 `buildKanjiQuiz`가 전부 정적 데이터(`kanjiList`)에서만
  뽑는다 — 이 프로젝트 규칙상 사전적 사실(읽기)은 LLM이 지어내면 안 되기 때문에 퀴즈 문제
  생성에도 LLM을 쓰지 않는다. 버튼을 누를 때마다 문제를 새로 섞고 싶어서, `WordbookPage`의
  리마운트 패턴처럼 클릭할 때마다 증가하는 `quizSessionId`를 `KanjiQuizSheet`의 `key`로 써서
  내부 `useState(() => buildKanjiQuiz(pool))` lazy initializer가 매번 새로 실행되게 했다(같은
  pool이어도 매번 다시 섞임). 퀴즈 "완료" 시점(문제 하나하나가 아니라 전체 완주)에만
  `XP_REWARDS.kanjiQuizCompleted`를 지급한다 — 정답 여부와 무관하게 완주 자체를 보상한다.
  정답을 맞혔을 때만(`isCorrect`) "다음 문제"/"결과 보기" 버튼 옆에 "완료" 체크박스가 뜬다 —
  체크한 채로 다음으로 넘어가면 그 문제의 한자를 `useKanjiProgressStore.toggleLearned`로
  학습 완료 처리한다. 이때도 게이미피케이션 규칙(off→on 전환시에만 지급)을 그대로 따라
  `learned.includes(...)`를 먼저 확인한 뒤 `XP_REWARDS.kanjiLearned` + `celebrate()`를 호출한다
  (`KanjiDetailSheet`의 학습완료 토글과 동일 패턴). 체크박스 상태는 문제가 바뀔 때마다
  `handleNext`에서 리셋한다.
- **퀴즈 정답 읽기 선정 (실제로 겪은 버그, 2,135자 전수 검사로 확정)**: 처음엔 `kunyomi[0]`을
  그냥 정답으로 썼는데, 食의 첫 훈독이 KANJIDIC2 편집 순서상 "く.う"라서 훨씬 더 잘 알려진
  "た.べる"(食べる)가 보기에서 통째로 빠져 사용자가 "정답이 이상하다"고 보고했다 —
  **KANJIDIC2의 onyomi/kunyomi 배열 순서는 사전 편집 순서일 뿐 "가장 흔한 읽기" 순이 아니다.**
  `kanjiQuiz.ts`의 `primaryReading`은 `dictionary.json`의 `furigana`(JMDict_Extended가 실제
  단어에서 이 한자가 정확히 어떤 음으로 읽히는지 이미 분리해둔 필드, 예: "食べる" ->
  `[{ruby:"食", rt:"た"}, ...]`)를 근거로, 그 한자가 실제로 쓰인 단어들 중 하나에서 정답을
  고른다. `wordsContaining`의 단어 정렬 우선순위가 중요한데, **반드시 `common`(실제 흔히
  쓰이는 단어인지) 먼저, 그다음 JLPT 급수 낮은 순, 마지막에 `isPureForm`(이 한자로 시작하고
  나머지가 전부 히라가나인 단독 명사/동사 형태, 예: "人"/"食べる" — "外国人"/"食堂"처럼 다른
  한자가 섞인 복합어는 후순위) 순이어야 한다** — 이 순서를 잘못 두면 또 버그가 난다: JLPT나
  purity를 common보다 앞에 두면 "業"→"授業"(N5,흔함,ぎょう) 대신 "業"(N1,안흔함,ごう)가
  이기거나, "建設"(N3,흔함,ケン) 대신 "建て"(N5 태그지만 안흔한 단어)가 이겨버리는 식으로
  희귀하거나 부자연스러운 답이 나온다(직접 2,135자 전수 검사로 재현·확인함). 여기에 더해
  `soundsLike`로 탁음화/반탁음화(邦ホウ→連邦れん**ぽう**)·끝음절 촉음화(喫キツ→喫茶きっ**さ**)
  정도의 흔한 음운 변화까지 허용해 매칭 실패를 줄인다. 이래도 못 찾으면(2,135자 중 3자만
  해당 — 疾/閑/斑처럼 KANJIDIC2 목록에 아예 없는 희귀한 이독) `kunyomi[0]` 등으로 폴백한다.
  새로 "이 한자의 대표 읽기"가 필요한 기능을 또 만들 때도 KANJIDIC2 배열 순서를 그대로
  신뢰하지 말고 이 방식(`kanjiQuiz.ts`의 `primaryReading`/`wordsContaining` 재사용)을 쓸 것.

## 단어 상세 페이지 — 동사 て형 / 형용사 유형 구현 노트
- `src/lib/verbConjugation.ts`가 스펙의 "동사 て형은 LLM이 아니라 규칙 기반 변환 함수로
  계산" 규칙을 구현한다. `WordEntry.pos`(JMDict 품사 코드)로 동사 그룹을 판별한다:
  `v1`/`v1-s`/`vz` → 1단(ichidan, る만 떼고 て), `v5*` → 5단(godan, 어미별 활용:
  う·つ·る→って, く→いて, ぐ→いで, す→して, ぬ·ぶ·む→んで), `vk` → 来る(불규칙, 来て/きて),
  `vs`/`vs-i`/`vs-s`/`vs-c` → する류. **주의**: 5단 동사 중 `v5k-s`(行く/逝く 특수활용)는
  く 어미인데도 いて가 아니라 って가 된다 — 어미만 보고 기계적으로 매핑하면 안 되고 이
  태그를 반드시 예외 처리해야 한다.
- する류가 헷갈리는 지점: `vs` 태그는 "する를 붙일 수 있는 명사"라는 뜻이라 표제어 자체엔
  する가 안 붙어있다(예: "勉強" 단어 자체, する 없이). 반면 `vs-s`/`vs-i` 태그 중 일부는
  표제어에 이미 する가 붙어있다(예: "察する"). 그래서 `suruTeForm`은 항상 먼저
  `word.endsWith("する")`인지 확인해서 있으면 떼고, 없으면 그대로 뒤에 して를 붙인다 —
  둘 중 하나만 처리하면 "勉強して"나 "察して" 둘 중 하나가 깨진다(전체 사전 데이터로
  두 케이스 다 확인함).
- い형용사/な형용사 판별도 같은 파일의 `detectAdjectiveType`이 담당한다(`adj-i`/`adj-ix`/
  `adj-ku`/`adj-shiku` → い, `adj-na`/`adj-nari` → な). `WordDetailPage`에서 JLPT 배지
  옆에 뱃지로 표시하고, て형은 있을 때만(동사일 때만) 별도 카드로 보여준다 — 형용사엔
  당연히 て형 카드가 안 뜬다.
- `getVerbTeForm`은 `{ kanji, reading }`을 반환한다 — 한자 표기(`entry.word`)뿐 아니라
  히라가나 읽기(`entry.reading`)도 똑같은 활용 규칙 함수에 그대로 통과시켜 계산한다
  (동사는 항상 마지막 글자가 두 표기 모두에서 같은 가나이므로 어미 기반 규칙이 그대로
  통함 — 별도 히라가나 전용 로직을 만들 필요 없음). 단, "アップする"처럼 표제어 자체가
  가나뿐이라 `kanji === reading`이면 `reading`을 `null`로 둬서 UI에서 중복 표시하지
  않는다.
- 사전 데이터의 품사 칩(`n`, `vs`, `vt` 같은 JMDict 코드)은 원래 코드를 그대로 노출하고
  있었는데 사용자가 못 알아봐서, `src/lib/posTags.ts`의 `translatePos()`로 한글 라벨로
  바꿔 보여준다. `pos-tags.json`의 62개 코드 전부를 정적으로 매핑해뒀다(LLM 번역 아님 —
  품사 분류도 사전적 사실이라 이 프로젝트 규칙상 정적 데이터로 처리). `WordDetailPage`와
  `WordMeaningDialog` 둘 다 품사 칩을 그리므로, 새로 품사를 보여주는 화면을 또 만들 때도
  raw 코드를 그대로 쓰지 말고 이 함수를 재사용할 것.

## 데이터 파이프라인 (완료됨)
`src/data/`의 사전/한자/획순 JSON은 이미 생성되어 있다. 원본을 다시 받거나 갱신하려면:
```bash
bash scripts/data/download.sh && bash scripts/data/build-all.sh
```
각 파일의 스키마와 출처/라이선스는 [scripts/data/README.md](scripts/data/README.md)에 정리되어 있다.
