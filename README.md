# 김계승 일본어

브라우저 안에서 도는 온디바이스 AI를 활용한 개인용 일본어 학습 웹앱. 서버 없이 순수
프론트엔드로 동작하며, 사전 뜻풀이·읽기·JLPT 급수·한자 정보 같은 "정답이 정해진 정보"는
AI가 만들지 않고 공개 데이터셋을 가공한 정적 JSON에서만 가져온다. 입력한 문장은 어디로도
전송되지 않는다.

개인 학습용 프로젝트이며 서비스 출시용이 아니다.

## 실행 방법

```bash
npm install
npm run dev
```

기타 스크립트:

```bash
npm run typecheck  # 타입 체크
npm test           # vitest
npm run lint       # oxlint
npm run build      # 프로덕션 빌드
```

## AI 기능을 쓰려면

회화 연습·작문 첨삭·선생님에게 질문은 온디바이스 AI가 필요하다. **두 가지 방법이 있고,
브라우저에 맞는 쪽을 앱이 알아서 안내한다.**

1. **Chrome 내장 AI (Prompt API)** — 추가 다운로드 없음.
   [Chrome Canary](https://www.google.com/chrome/canary/)(또는 Prompt API를 지원하는 최신
   Chrome)에서 `chrome://flags`의 관련 플래그를 켜고 재시작한다. 크로미움 기반이어도
   Whale·Edge·Opera 등에는 구글이 모델을 배포하지 않아 동작하지 않는다.
2. **Gemma 4 직접 실행** — 대문에서 모델(약 2GB)을 내려받아 WebGPU로 돌린다. WebGPU를
   지원하는 브라우저라면 Chrome이 아니어도 된다(Safari 26+, Firefox 141+ 등에서 확인).
   한 번 받으면 브라우저에 저장되어 이후 오프라인으로 동작한다.

둘 다 안 되더라도 오십음도·사전·한자·단어장은 그대로 사용할 수 있다. 앱 안의
`/diagnostics`(자가진단) 페이지에서 지금 브라우저가 어느 쪽을 쓸 수 있는지 확인할 수 있다.

## 학습을 이어주는 것들

각 화면이 따로 놀지 않도록 아래가 밑에 깔려 있다. 전부 브라우저 안에만 저장된다.

- **학습 로드맵** — Pre-N5부터 N1까지 6단계 × 10단원. 대문의 "오늘의 학습" 카드가 지금 단원에서
  남은 한자·단어·문법을 짚어 해당 화면으로 보내준다. 진도는 학습 기록에서 계산하고
  ("이미 아는 내용이에요"로 건너뛸 수도 있다) 시작 단계는 처음에 한 번 물어본다.
- **선생님의 기억** — 취약한 한자, 어휘 수준, 마지막에 공부한 것을 기록에서 세어 선생님이
  설명 난이도를 맞추는 데 쓴다. 대화에서 나온 개인적인 사실(시험 일정·직업·공부 목적)은
  사용자가 수락해야 저장된다. `/memory`에서 언제든 보고 지울 수 있다.
- **날짜별 대화 기록** — 선생님과의 대화는 일기처럼 하루 단위로 쌓인다. 앱을 껐다 켜도 오늘
  대화는 이어지고, 지난 날짜는 읽기 전용이다.
- **문장에서 바로 조회** — 일본어 문장의 단어를 누르면 사전 뜻이, 문장에 든 문형에는 📘 칩이
  붙어 커리큘럼의 문법 설명이 펼쳐진다. 문장 옆 ⋮ 메뉴로 발음·복사·선생님에게 묻기를 할 수 있다.

## 기술 스택

React + TypeScript + Vite + Tailwind CSS, react-router-dom, Zustand(설정·학습 상태는
localStorage persist), IndexedDB(끝없이 쌓이는 학습 기록·기억·대화), Framer Motion,
WanaKana(로마자→히라가나 변환), react-markdown + remark-gfm(선생님 답변),
`@litert-lm/core`(Gemma 4 / WebGPU), vitest.

## 페이지 구성

오십음도 · 사전 · 단어 상세 · 단어장(스와이프 카드 + SRS) · 한자(획순 애니메이션 + 읽기 퀴즈) ·
회화 연습(LLM 롤플레이) · 작문 첨삭(LLM 첨삭 + diff 하이라이트) · 선생님(문법·표현 자유 질문).
그 밖에 대문, 학습 로드맵(`/curriculum`), 선생님의 기억(🧠 `/memory`), 정보(ⓘ) 페이지,
자가진단 페이지가 있다. 아래 출처는 정보 페이지에서도 확인할 수 있다.

## 데이터 출처 및 라이선스

| 데이터 | 출처 | 라이선스 |
|---|---|---|
| 사전 뜻풀이·읽기·JLPT 급수·후리가나 | [Bluskyo/JMDict_Extended](https://github.com/Bluskyo/JMDict_Extended) (JMDict 기반) | CC BY-SA (EDRDG) |
| 단어의 한국어 뜻풀이 | [한국어 위키낱말사전](https://kaikki.org/kowiktionary/) (kaikki.org 가공본) | CC BY-SA 3.0 |
| 한자 음독·훈독·뜻·획수 | [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified)의 KANJIDIC2 JSON | CC BY-SA (EDRDG) |
| 한자 JLPT 급수 매칭 | [AnchorI/jlpt-kanji-dictionary](https://github.com/AnchorI/jlpt-kanji-dictionary) | 원 저장소 라이선스 참고 |
| 한자 획순 벡터 경로 | [KanjiVG](https://github.com/KanjiVG/kanjivg) | CC BY-SA 3.0 |

가공 스크립트와 상세 스키마는 [scripts/data/README.md](scripts/data/README.md)에 있다.

학습 로드맵(`src/data/curriculum.json`)은 위 데이터셋이 아니라 **직접 정리한 자료**다.
급수별 언어능력 기준은 [JLPT 공식 요약](https://www.jlpt.jp/e/about/levelsummary.html)을,
문법 목록은 [jlptsensei](https://jlptsensei.com)를, 단어·한자 목표치는
[migaku의 JLPT 어휘 정리](https://migaku.com/blog/japanese/jlpt-vocabulary-lists)를 참고했다.
**목표치는 JLPT가 공식 발표하는 수치가 아니라 통용되는 추정치**이고, 문법도 각 급수의 핵심만
추린 것이라 실제 시험 범위는 더 넓다.

## 프로젝트 문서

개발자를 위한 상세 규칙과 구현 노트는 [CLAUDE.md](CLAUDE.md)에 정리되어 있다.
