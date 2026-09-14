# 프로젝트: 김계승 일본어 (Chrome 내장 AI 기반 일본어 학습 웹앱)

- 서비스 출시용이 아닌 개인 프로젝트이며, 앱 이름은 **"김계승 일본어"**로 한다.
  - 브라우저 탭 타이틀(`<title>`)에 "김계승 일본어"로 표시
  - 상단 헤더/네비게이션 바에 로고 대신 텍스트 또는 마스코트+텍스트 조합으로 앱 이름 표시
    (디자인 가이드의 카툰풍 톤에 맞는 손글씨/라운드 폰트 활용)
  - README 및 정보 페이지에도 프로젝트명으로 사용

## 목표
Chrome Canary의 내장 온디바이스 AI(Prompt API, window.LanguageModel)를 활용한
일본어 학습 웹앱. 서버 없이 순수 프론트엔드(HTML/CSS/JS)로 동작하며, 생성형 작업만
로컬 LLM으로 처리하고 사전/JLPT급수/한자 데이터는 아래 명시된 공개 데이터셋을
가공한 정적 JSON으로 관리한다 (LLM이 사전적 사실을 지어내지 않도록).

## 기술 스택 / 제약
- **React + TypeScript + Tailwind CSS**, 빌드 도구는 Vite 사용
- 라우팅: react-router-dom으로 페이지(회화/오십음도/사전/단어상세/단어장/한자/작문) 전환
- 상태 관리: 페이지 간 공유 상태(단어장, 그룹, SRS 진도, 스트릭/XP)는 Zustand 또는
  Context API로 관리, localStorage/IndexedDB와 동기화하는 커스텀 훅으로 감싸서 사용
- 애니메이션: Framer Motion 적극 활용 (페이지 전환, 버튼 피드백, 카드 스와이프,
  confetti 축하 효과 등 디자인 가이드의 애니메이션 요구사항 구현에 사용)
- 단어장 스와이프 카드: Framer Motion의 drag 기능 또는 `react-tinder-card` 라이브러리 활용
- Tailwind 설정(`tailwind.config`)에 디자인 가이드의 컬러 팔레트를 테마로 등록
  (`colors.primary`, `colors.warning` 등) 및 커스텀 애니메이션(keyframes) 등록
- LLM 연동(Chrome Prompt API):
  - `window.LanguageModel.availability()`로 지원 여부 확인, 미지원 시 안내 화면 표시
  - `window.LanguageModel.create({ systemPrompt, temperature, topK, monitor })`를
    감싸는 커스텀 훅(예: `useLanguageModel`)으로 세션 생성/재사용/destroy 관리
  - 모델 다운로드 진행률은 monitor의 downloadprogress 이벤트로 프로그레스 바 표시
  - `session.promptStreaming()` 권장 (스트리밍 응답)
  - LLM은 "생성형" 작업(회화 응답, 예문 생성, 작문 첨삭)에만 사용. 사전 뜻풀이·읽기·
    JLPT급수·한자 정보 등 "정답이 정해진 정보"는 절대 LLM으로 생성하지 말고 아래
    정적 데이터에서 조회할 것
- 데이터 타입: 사전/한자/JLPT 데이터 구조를 TypeScript interface로 정의
  (예: `interface WordEntry { word: string; reading: string; meaning: string;
  jlptLevel: 'N5'|'N4'|'N3'|'N2'|'N1'; pos: string; ... }`)
- 데이터 저장: localStorage 또는 IndexedDB (단어장, 그룹, SRS 진도, 대화 기록) —
  대용량 사전 데이터 조회는 IndexedDB, 가벼운 사용자 상태는 localStorage 권장
- 로마자 → 히라가나 실시간 변환: [WanaKana](https://github.com/WaniKani/WanaKana)
  라이브러리(`wanakana` npm 패키지) 사용. `wanakana.bind(inputElement)`로 사전
  검색 input에 바인딩하면 알파벳 입력이 자동으로 히라가나로 변환됨
- 반응형 레이아웃 (모바일 대응)

## 데이터 소싱 (빌드 전 준비 단계)
아래 공개 데이터셋을 다운로드/가공해서 `data/` 폴더에 JSON으로 내장한다. 전부
CC BY-SA(또는 CC-BY) 라이선스이므로 앱의 "정보/설정" 페이지에 출처 표기를 넣을 것.

1. **단어 사전 + JLPT 급수 + 후리가나** (1순위 추천)
   - [Bluskyo/JMDict_Extended](https://github.com/Bluskyo/JMDict_Extended)
   - JMDict에 JLPT 급수·후리가나·피치 액센트까지 이미 병합되어 있어 가장 효율적
   - 용량이 크므로 JLPT N5~N1에 해당하는 항목만 우선 추출해 서브셋 JSON으로 축소
   - 대안(직접 병합이 필요할 경우):
     - 원본 사전: [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified/releases) (JMdict를 JSON으로 변환한 릴리즈)
     - JLPT 태그: [stephenmk/yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab) 또는
       [AnchorI/jlpt-kanji-dictionary](https://github.com/AnchorI/jlpt-kanji-dictionary)

2. **한자 (음독/훈독/뜻/획수)**
   - [KANJIDIC2](http://www.edrdg.org/wiki/index.php/KANJIDIC_Project) (EDRDG)
   - JLPT 급수별 한자 목록: [vakho10/jlpt-kanji](https://github.com/vakho10/jlpt-kanji) 등 커뮤니티 정리본과 매칭

3. **한자 획순(stroke order)**
   - [KanjiVG](https://github.com/KanjiVG/kanjivg) — SVG 벡터 획순 데이터, 획순 애니메이션에 사용

4. **예문 코퍼스 (선택, LLM 생성 예문 외 실제 예문도 병행하고 싶을 경우)**
   - [Tatoeba](https://tatoeba.org) — CC-BY 예문 코퍼스

- 출처 표기 예시(정보 페이지에 포함): "사전 데이터: JMDict/KANJIDIC (EDRDG, CC BY-SA) ·
  JLPT 태그: JMDict_Extended · 획순: KanjiVG (CC BY-SA)"

## 디자인/UI 스타일 가이드
듀오링고(Duolingo) 스타일의 만화 같고 발랄한 톤으로, 유아~초등학생이 쓰기 편하도록
전체적으로 크고 명확하게 디자인한다.

- **톤앤매너**: 카툰풍, 둥글둥글하고 통통 튀는 느낌. 딱딱한 각진 UI 지양
- **컬러 팔레트**: 채도 높은 밝은 색 위주 (예: 초록 `#58CC02`, 파랑 `#1CB0F6`,
  노랑 `#FFC800`, 주황 `#FF9600`, 빨강(오답용) `#FF4B4B`). 배경은 화이트/아주 옅은
  파스텔톤. 색상은 CSS 변수(`--color-primary` 등)로 관리해 테마 전환이 쉽도록 구성
- **타이포그래피**:
  - 한글: 둥글고 친근한 폰트 (Google Fonts의 "Jua", "Cafe24 Ssurround", "Do Hyeon" 등
    아동 친화적 라운드체 중 선택)
  - 일본어(히라가나/가타카나/한자): 가독성 좋은 라운드 폰트 (Google Fonts의
    "Kosugi Maru" 추천 — 아동용 학습 콘텐츠에 자주 쓰이는 둥글고 명확한 서체)
  - 폰트 크기 전체적으로 크게: body 기본 18~20px 이상, 버튼/제목은 더 크게,
    일본어 문자(한자/가나)는 24px 이상으로 크게 표시해 가독성 확보
  - 필요한 Google Fonts는 `<link>`로 로드
- **컴포넌트 스타일**:
  - 버튼: 큰 터치 영역(최소 48px 높이), 큰 border-radius(둥근 모서리), 아래쪽에
    입체감 있는 그림자(3D "눌리는" 버튼 느낌 — 듀오링고 특유의 하단 두꺼운 테두리
    + 클릭 시 눌리는 듯한 translateY 애니메이션)
  - 카드: 둥근 모서리, 부드러운 그림자, 호버/탭 시 살짝 확대(scale-up)되는 반응
  - 진행률 바: 두껍고 둥글게, 채워질 때 부드러운 애니메이션
- **애니메이션/트랜지션 (전반적으로 풍부하게 적용)**:
  - 페이지 전환: 슬라이드 또는 페이드 트랜지션
  - 버튼 클릭: bounce/scale 피드백 애니메이션
  - 정답/오답 피드백: 정답 시 confetti(색종이) 효과 + 캐릭터/이모지가 통통 튀는
    축하 애니메이션, 오답 시 살짝 흔들리는(shake) 피드백 (부정적 느낌은 과하지 않게)
  - 단어장 카드 스와이프: 카드가 자연스럽게 날아가듯 회전+이동하는 애니메이션
  - 로딩/LLM 응답 대기: 귀여운 캐릭터가 움직이는 로딩 인디케이터
  - 레벨업/학습 완료: 별/뱃지 획득 애니메이션, 화면 전체에 축하 효과
  - CSS keyframes + transition을 적극 활용 (라이브러리 없이 구현 가능한 선에서
    자연스럽고 통통 튀는 easing 사용, 예: cubic-bezier로 elastic한 느낌)
- **게이미피케이션 요소**: 연속 학습일(스트릭), 획득 포인트/XP, 뱃지 등을 상단바에
  표시해 동기부여 요소로 활용 (localStorage에 저장)
- **마스코트 캐릭터(선택)**: 귀여운 캐릭터(예: 후지산 정령, 동물 캐릭터 등)를
  SVG 또는 이모지 기반으로 간단히 만들어 로딩 중, 정답/오답 피드백, 빈 화면 상태 등에
  등장시켜 친근감을 높임
- **접근성/아동 친화 고려사항**: 버튼/터치 영역을 크게, 텍스트 대비(contrast) 충분히
  확보, 복잡한 메뉴 depth 지양(2단 이내), 아이콘 + 큰 글씨 라벨 병기

## 페이지 구성

### 1. 회화 연습 (Conversation)
- 시나리오 선택(카페 주문/길 묻기/자기소개/자유대화 등) + 레벨 선택(초급/중급/고급)에
  따라 systemPrompt 구성, LLM이 일본어로 롤플레이 응답
- 응답에 후리가나 표시 옵션 (정적 사전 데이터의 후리가나 필드 활용)
- "문법 교정 보기" 토글로 직전 사용자 입력에 대한 교정 포인트를 한국어로 표시

### 2. 오십음도 (Gojuon)
- 히라가나/가타카나 표를 정적으로 표시 (탁음/반탁음/요음 포함)
- 각 글자 클릭 시 발음 재생 (Web Speech API의 SpeechSynthesis, 일본어 음성 선택)

### 3. 사전 (Dictionary)
- 검색창에 한글 의미/히라가나/한자/로마자 등으로 검색 → 가공된 사전 JSON에서 매칭
  (인덱싱: 검색 성능을 위해 읽기/한자별 인덱스를 미리 구성하거나 IndexedDB 활용)
- **로마자 입력 지원**: 검색 input에 WanaKana를 바인딩해 알파벳(로마자) 입력 시
  실시간으로 히라가나로 자동 변환되도록 구현 (예: "nihongo" 입력 → "にほんご"로 변환).
  변환된 히라가나 기준으로 사전 검색 수행
- **자동완성**: input에 타이핑할 때마다(디바운스 적용) 입력값과 접두어/부분 매칭되는
  단어(읽기/한자/뜻 기준)를 최대 5~8개 정도 input 바로 아래 드롭다운 리스트로 표시
  - 각 항목은 단어+읽기+간단한 뜻을 함께 보여줌
  - 항목 클릭 시 검색어 확정 + 해당 단어 상세 페이지로 바로 이동
  - 키보드 방향키(↑/↓)로 항목 탐색, Enter로 선택 가능하도록 접근성 고려
  - 드롭다운 등장/사라짐에 디자인 가이드의 트랜지션(슬라이드/페이드) 적용
- 검색 결과 리스트 → 클릭 시 단어 상세 페이지로 이동
- 최근 검색어 기록

### 4. 단어 상세 페이지
- 단어, 읽기, 뜻, 품사 표시 (사전 JSON에서 조회)
- JLPT 급수 라벨(N1~N5) 표시 (JMDict_Extended 또는 병합한 JLPT 태그 데이터 기반)
- "예문 생성" 버튼: LLM으로 해당 단어 활용 예문 생성
  - 생성 후 "더 어려운 예문" / "더 쉬운 예문" 버튼: 직전 예문을 컨텍스트로 넘기고
    난이도를 올리거나 내려서 재생성하도록 프롬프트 구성
- 동사인 경우 て형 표시: LLM이 아니라 규칙 기반 활용 로직(사전의 품사 정보로
  동사 그룹을 판별 후 て형 변환 함수 적용)으로 직접 계산해서 표시
- "단어장에 추가" 버튼: localStorage/IndexedDB의 단어장 데이터에 추가, 그룹 선택 가능

### 5. 단어장 (My Wordbook)
- 카드 UI: 좌우 스와이프(포인터/터치 이벤트 + CSS transform, 틴더 스타일)
  - 오른쪽 스와이프: 단어장에 유지(마스터 표시 등)
  - 왼쪽 스와이프: 단어장에서 삭제
- 그룹(폴더/태그) 생성·관리 기능: 단어를 그룹별로 분류, 그룹 필터링해서 카드 학습
- 스와이프 결과를 SRS(간격 반복, SM-2 등) 진도에도 반영해 복습 우선순위 조정

### 6. 한자 공부 (Kanji)
- N1~N5 탭으로 구분, 각 탭은 해당 급수의 한자 목록(KANJIDIC2 + JLPT 매칭 데이터)을
  카드/리스트로 표시
- 한자별 음독/훈독, 대표 단어 예시 표시
- 획순: KanjiVG SVG 데이터를 순서대로 그려주는 애니메이션 또는 정적 획순 이미지
- 단어장과 유사하게 학습 완료 체크 기능

### 7. 작문 첨삭 (Writing Correction)
- 사용자가 일본어 문장 입력 → LLM이 한국어로 문법 오류/자연스러운 표현/격식체 판단 분석
- 원문 대비 수정 부분 하이라이트

## 비기능 요구사항
- Prompt API 미지원 브라우저를 위한 안내 화면 (필수)
- LLM 호출 시 로딩 인디케이터, 가능하면 스트리밍
- 세션 재사용 최소화, 불필요 시 destroy()
- 존재 여부 불확실한 API는 가드(`'LanguageModel' in window`) 후 사용
- 정적 데이터셋 용량이 클 경우 JLPT 급수 기준으로 서브셋을 우선 로드하고,
  전체 데이터는 필요 시 지연 로드(lazy load)
- 정적 데이터의 출처와 라이선스를 정보 페이지 및 README에 명시

## 산출물
- Vite + React + TypeScript 프로젝트 구조
  - `src/pages/` (Conversation, Gojuon, Dictionary, WordDetail, Wordbook, Kanji, Writing)
  - `src/components/` (공통 UI: Button, Card, ProgressBar, Mascot 등)
  - `src/hooks/` (`useLanguageModel`, `useWordbook`, `useSRS` 등)
  - `src/data/` (dictionary.json, kanji.json, jlpt-tags.json, kanjivg 등 정적 데이터
    + 원본 데이터를 가공하는 변환 스크립트)
  - `src/types/` (WordEntry, KanjiEntry 등 TypeScript 타입 정의)
  - `tailwind.config.ts`, `vite.config.ts`, `package.json`
- 실행 방법 안내(`npm install && npm run dev`, chrome://flags 설정 포함) 및
  데이터 출처/라이선스 안내(README)
