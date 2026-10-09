import type { ReactNode } from "react";
import { Link } from "react-router-dom";

// 이 문서는 **밖으로 나가는 요청을 전부** 적는 자리다. 외부 스크립트·API를 새로 붙이면
// (index.html의 <script>, fetch 대상 도메인, 새 브라우저 API) 여기와 /about 소개문, README
// 첫 문단을 같이 고칠 것 — 셋이 어긋나면 "기기를 벗어나지 않는다"가 거짓말이 된다.
const EFFECTIVE_DATE = "2026년 10월 10일";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-bold text-gray-500">{title}</h3>
      <div className="mt-2 flex flex-col gap-2 rounded-2xl border-2 border-gray-100 bg-white p-3 text-sm text-gray-600">
        {children}
      </div>
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-info hover:underline">
      {children}
    </a>
  );
}

function PrivacyPage() {
  return (
    <div className="p-4 sm:p-6">
      <Link to="/about" className="text-info">
        ← 정보로 돌아가기
      </Link>

      <h2 className="mt-4 text-xl text-primary">개인정보 처리방침</h2>
      <p className="mt-1 text-xs text-gray-400">시행일: {EFFECTIVE_DATE}</p>

      <p className="mt-4 text-sm text-gray-600">
        김계승 일본어는 회원가입도 서버도 없는 웹앱입니다. 운영자는 여러분이 입력한 문장이나 학습
        기록을 받지 않으며, 볼 방법도 없습니다. 다만 광고·방문 통계·일부 기능을 위해 아래의 외부
        서비스에 요청이 오갑니다.
      </p>

      <Section title="이 기기 안에만 저장되는 것">
        <p>
          단어장, 연속 학습일·XP, 설정은 브라우저의 localStorage에, 학습 기록·선생님의 기억·선생님
          대화는 IndexedDB에, 내려받은 Gemma 모델·발음 판정 모델 파일은 브라우저 저장소(OPFS)에 저장됩니다. 어느
          것도 서버로 전송되지 않습니다.
        </p>
        <p>
          브라우저의 사이트 데이터를 지우면 함께 사라집니다. 지우기 전에{" "}
          <Link to="/about" className="text-info hover:underline">
            정보
          </Link>
          화면의 "내 학습 데이터 백업"으로 파일을 받아 둘 수 있고, 선생님의 기억은{" "}
          <Link to="/memory" className="text-info hover:underline">
            선생님의 기억
          </Link>
          화면에서 보고 지울 수 있습니다.
        </p>
      </Section>

      <Section title="광고 (Google AdSense)">
        <p>
          이 사이트는 Google AdSense 광고를 보여줍니다. Google과 광고 파트너는 쿠키와 기기 식별자를
          써서 광고를 보여주고, 성과를 측정하고, 이 사이트나 다른 사이트 방문 기록에 기반한 맞춤
          광고를 제공할 수 있습니다. 광고에는 여러분이 입력한 문장이나 학습 기록이 전달되지
          않습니다.
        </p>
        <p>
          맞춤 광고는{" "}
          <ExternalLink href="https://myadcenter.google.com/">Google 내 광고 센터</ExternalLink>
          에서 끌 수 있습니다. Google이 데이터를 어떻게 쓰는지는{" "}
          <ExternalLink href="https://policies.google.com/technologies/partner-sites">
            Google 파트너 사이트 정책
          </ExternalLink>
          에 나와 있습니다.
        </p>
      </Section>

      <Section title="방문 통계 (Vercel Web Analytics)">
        <p>
          어떤 페이지가 얼마나 방문되는지 세기 위해 Vercel Web Analytics를 씁니다. 쿠키를 쓰지
          않으며, 개인을 알아볼 수 없는 형태로 방문 수만 집계합니다.
        </p>
      </Section>

      <Section title="기능 때문에 외부로 가는 요청">
        <p>
          <b className="font-normal text-gray-700">오십음도 발음 게임</b> — 발음 판정 모델(약 190MB)을
          내려받았으면 판정을 기기 안에서 하고 목소리는 어디로도 보내지 않습니다. 모델 파일은 Hugging Face에서,
          실행 엔진(ONNX Runtime)은 jsDelivr에서 받습니다. 모델이 없으면 브라우저의 음성 인식을 쓰는데,
          Chrome은 이를 기기에서 처리하지 않고 목소리를 Google 서버로 보냅니다. 게임을 시작하지 않으면
          마이크를 쓰지 않습니다.
        </p>
        <p>
          <b className="font-normal text-gray-700">AI 기능</b> — 회화·작문·선생님의 AI는 기기 안에서
          돕니다(Chrome 내장 AI 또는 Gemma 4). Gemma 모델 파일은 Hugging Face에서, 실행 엔진은
          jsDelivr에서 내려받는데, 이때는 파일을 받는 요청만 가고 입력한 내용은 가지 않습니다.
        </p>
        <p>
          <b className="font-normal text-gray-700">글꼴</b> — 화면 글꼴을 Google Fonts에서
          불러옵니다.
        </p>
        <p className="text-xs text-gray-400">
          위 서비스들은 요청을 받으면서 IP 주소·브라우저 정보 같은 일반적인 접속 정보를 볼 수
          있습니다.
        </p>
      </Section>

      <Section title="아동">
        <p>이 서비스는 아동을 대상으로 하지 않으며, 누구에게서도 개인정보를 따로 수집하지 않습니다.</p>
      </Section>

      <Section title="문의">
        <p>
          개인정보에 관한 문의는{" "}
          <a href="mailto:kimkyeseung@gmail.com" className="text-info hover:underline">
            kimkyeseung@gmail.com
          </a>
          으로 보내 주세요.
        </p>
      </Section>

      <Section title="방침이 바뀌면">
        <p>
          외부 서비스를 새로 쓰거나 빼면 이 페이지를 고치고 위의 시행일을 바꿉니다.
        </p>
      </Section>
    </div>
  );
}

export default PrivacyPage;
