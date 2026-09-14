# 김계승 일본어

Chrome Canary의 온디바이스 AI(Prompt API, `window.LanguageModel`)를 활용한 개인용 일본어
학습 웹앱. 서버 없이 순수 프론트엔드로 동작하며, 사전 뜻풀이·읽기·JLPT 급수·한자 정보 같은
"정답이 정해진 정보"는 AI가 만들지 않고 공개 데이터셋을 가공한 정적 JSON에서만 가져온다.

개인 학습용 프로젝트이며 서비스 출시용이 아니다.

## 실행 방법

```bash
npm install
npm run dev
```

회화 연습·작문 첨삭 기능은 Chrome의 온디바이스 AI(Prompt API)가 필요하다:

1. [Chrome Canary](https://www.google.com/chrome/canary/) 설치 (또는 Prompt API를 지원하는
   최신 Chrome)
2. `chrome://flags`에서 Prompt API 관련 플래그를 켜고 브라우저 재시작
3. Prompt API가 없어도 오십음도·사전·한자·단어장 등 다른 기능은 그대로 사용 가능

기타 스크립트:

```bash
npm run typecheck  # 타입 체크
npm run lint       # oxlint
npm run build      # 프로덕션 빌드
```

## 기술 스택

React + TypeScript + Vite + Tailwind CSS, react-router-dom, Zustand(localStorage persist),
Framer Motion, WanaKana(로마자→히라가나 변환).

## 페이지 구성

오십음도 · 사전 · 단어 상세 · 단어장(스와이프 카드 + SRS) · 한자(획순 애니메이션) · 회화 연습
(LLM 롤플레이) · 작문 첨삭(LLM 첨삭 + diff 하이라이트). 앱 안의 정보(ⓘ) 페이지에서도 아래
출처를 확인할 수 있다.

## 데이터 출처 및 라이선스

| 데이터 | 출처 | 라이선스 |
|---|---|---|
| 사전 뜻풀이·읽기·JLPT 급수·후리가나 | [Bluskyo/JMDict_Extended](https://github.com/Bluskyo/JMDict_Extended) (JMDict 기반) | CC BY-SA (EDRDG) |
| 한자 음독·훈독·뜻·획수 | [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified)의 KANJIDIC2 JSON | CC BY-SA (EDRDG) |
| 한자 JLPT 급수 매칭 | [AnchorI/jlpt-kanji-dictionary](https://github.com/AnchorI/jlpt-kanji-dictionary) | 원 저장소 라이선스 참고 |
| 한자 획순 벡터 경로 | [KanjiVG](https://github.com/KanjiVG/kanjivg) | CC BY-SA 3.0 |

가공 스크립트와 상세 스키마는 [scripts/data/README.md](scripts/data/README.md)에 있다.

## 프로젝트 문서

개발자를 위한 상세 규칙과 구현 노트는 [CLAUDE.md](CLAUDE.md)에 정리되어 있다.
