import Link from "next/link";

import { appConfig } from "@/config/app";

const CONTACT_EMAIL = "hanjunhee0421@gmail.com";

/**
 * /privacy — real, reachable route. Every claim below was checked against
 * the actual code before writing (STEP audit, see session notes):
 * types/index.ts (Trip/ItineraryItem fields), features/participant/
 * participantService.ts (nickname/preference/secret-hash storage),
 * lib/participantSession.ts (localStorage only, no cookies), config/env.ts
 * (the exact 4 external services this app ever calls — Firebase, Kakao,
 * TourAPI/KMA via data.go.kr, OpenAI), features/replan/explanation +
 * features/journey/narrativeFacts + features/miniGuide/miniGuideFacts (what
 * the LLM actually receives — never a participant name/nickname), the repo
 * for `navigator.geolocation` (zero hits — no GPS anywhere), package.json
 * and the repo for any analytics/tracking dependency (none), and
 * firestore.rules (the real current access-control state). Nothing here is
 * invented; unresolved items are named as unresolved rather than guessed —
 * see the closing note and the session's own report.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand hover:underline">
        ← {appConfig.name}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">개인정보처리방침</h1>
      <p className="mt-1 text-sm text-ink-muted">시행일: 2026년 9월 16일</p>

      <div className="mt-8 flex flex-col gap-7 text-sm leading-relaxed text-ink">
        <Section title="1. 처리하는 개인정보 항목 및 목적">
          <p>서비스는 다음 정보를 실제로 처리합니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">여행 일정 정보</strong> — 여행 제목, 목적지, 날짜,
              일정별 장소명·주소·좌표·시간. 여행을 만들고 표시하기 위해 필요합니다.
            </li>
            <li>
              <strong className="text-ink">참여자 닉네임과 선호도</strong> — 여행 참여자가 직접
              입력하는 닉네임과 1~10 척도의 관심사 응답(예: 자연, 음식, 액티비티 등). 참여자별
              취향을 반영해 여행 경험을 설명하기 위해 사용되며, 실명·이메일·전화번호는 수집하지
              않습니다.
            </li>
            <li>
              <strong className="text-ink">참여자 인증 정보</strong> — 참여자가 본인의 입력을
              나중에 다시 수정할 수 있도록 발급되는 인증 토큰. 서버에는 이 토큰을 그대로
              저장하지 않고 해시(hash)된 값만 저장하며, 원문 토큰은 이용자의 브라우저에만
              존재합니다(3번 항목 참고).
            </li>
            <li>
              <strong className="text-ink">출발 위치 정보</strong> — Re:Plan 화면에서 이용자가
              &ldquo;출발지&rdquo;로 직접 검색·선택하거나, 이미 완료 처리한 일정의 장소
              좌표를 재사용하는 값. 실제 이동 경로·시간을 계산하기 위해 일시적으로
              사용됩니다. 브라우저의 위치 권한(GPS)을 요청하거나 백그라운드로 위치를 추적하는
              기능은 없습니다.
            </li>
            <li>
              <strong className="text-ink">사전 선택 장소</strong> — 여행 생성 과정에서
              이용자가 미리 골라 둔 장소 목록(있는 경우).
            </li>
          </ul>
        </Section>

        <Section title="2. 위치정보 처리">
          <p>
            서비스는 이용자의 기기 GPS나 브라우저 위치 권한을 요청하지 않습니다(코드에
            위치정보 API 사용 이력이 없음을 확인했습니다). 위치 관련 정보는 오직 이용자가
            직접 입력하거나 선택한 &ldquo;장소&rdquo;의 좌표뿐이며, 이는 실제 이동 경로·시간을
            계산해 화면에 보여주는 목적에만 사용됩니다. 별도의 위치 이력 데이터베이스에
            축적·추적되지 않습니다.
          </p>
        </Section>

        <Section title="3. 개인정보의 보관 및 삭제">
          <p>
            여행 일정과 참여자 정보는 Google Firebase(Firestore)에 저장되며, 이용자가 삭제를
            요청하지 않는 한 계속 보관됩니다. 현재 서비스에는 자동 삭제·자동 만료 기능이
            구현되어 있지 않습니다.
          </p>
          <p className="mt-2">
            여행 전체 또는 참여자 정보를 스스로 삭제할 수 있는 버튼은 현재 앱 화면에 없습니다.
            삭제를 원하시면 아래 이메일로 삭제하려는 여행 링크(또는 여행 식별자)를 알려주시면,
            운영자가 저장소에서 직접 확인 후 삭제합니다. &ldquo;즉시 삭제&rdquo;나
            &ldquo;24시간/30일 이내 자동 삭제&rdquo;와 같은 처리 기한은 정해져 있지 않으며,
            운영자가 개인적으로 처리하는 절차임을 안내드립니다.
          </p>
          <p className="mt-2">
            삭제 요청:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mt-2">
            참여자 인증 토큰(원문)은 이용자의 브라우저 저장소에만 있으므로, 브라우저 저장
            데이터를 직접 삭제하면 해당 기기에서 더 이상 자신의 참여 기록을 수정할 수 없게
            됩니다(서버의 여행 데이터 자체가 삭제되는 것은 아닙니다).
          </p>
        </Section>

        <Section title="4. 여행 링크 기반 접근 구조에 대한 안내">
          <p>
            서비스는 회원가입 없이, 임의의 문자열로 된 여행 식별자가 포함된 링크로 여행에
            접근하는 방식을 사용합니다. 이 식별자는 짧은 문자열이지만 무작위로 생성되어
            추측하기 매우 어렵도록 설계되어 있습니다. 다만 링크 자체가 접근 권한을 대신하므로,
            링크가 의도치 않게 공개되면 제3자가 해당 여행 정보를 열람할 수 있습니다.
          </p>
          <p className="mt-2">
            또한 현재 여행 일정 데이터(제목·목적지·날짜·장소 등)에 대한 서버 접근 규칙은 별도의
            인증 단계를 아직 두고 있지 않아, 여행 식별자를 모르더라도 데이터 조회가 기술적으로
            가능한 구조적 한계가 있습니다(참여자 닉네임·선호도·인증 토큰이 저장되는 영역은
            서버에서만 접근 가능하도록 별도로 차단되어 있습니다). 이 부분은 서비스가 계속
            개선해 나가야 할 항목으로 인식하고 있습니다.
          </p>
        </Section>

        <Section title="5. 개인정보 처리를 위해 연동하는 외부 서비스">
          <p>
            서비스는 아래 4개 외부 서비스를 이용해 실제 장소·이동·날씨·설명 정보를 처리합니다.
            전달되는 값은 장소명·좌표·거리·시간 등 일정 관련 정보이며, 참여자의 닉네임이나
            개인 식별 정보를 함께 전달하지 않습니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">Kakao(카카오, 카카오 주식회사)</strong> — 장소 검색
              및 실제 이동 경로·시간 계산. 검색어(장소명)와 좌표를 전달합니다. 국내 사업자.
            </li>
            <li>
              <strong className="text-ink">한국관광공사 TourAPI / 기상청(공공데이터포털,
              data.go.kr)</strong> — 관광지 정보·이미지, 실제 단기예보. 지역 코드와 좌표를
              전달합니다. 국내 공공기관.
            </li>
            <li>
              <strong className="text-ink">OpenAI(api.openai.com)</strong> — 이미 결정된 일정
              변경 사실(장소명, 주소, 실제 이동 거리·시간, 그룹이 중시하는 여행 경험의 익명
              집계 정보 등)을 자연어 설명 문장으로 바꾸는 용도로만 사용됩니다. 장소 선택이나
              점수 계산 자체에는 관여하지 않습니다. 미국 소재 사업자이며, 이 부분은 아래
              &ldquo;6. 국외 이전&rdquo;에 해당합니다.
            </li>
            <li>
              <strong className="text-ink">Google Firebase(Google LLC/Google Cloud)</strong> —
              여행·참여자 데이터의 저장소(Firestore) 및 서버 인증(Admin SDK) 인프라.
            </li>
          </ul>
          <p className="mt-2">
            위 서비스들은 이용자와 직접 계약관계를 맺는 &ldquo;제3자 제공&rdquo;이 아니라,
            서비스 운영자가 기능을 제공하기 위해 이용하는 처리 도구(위탁)에 가깝습니다. 다만
            정확한 법적 분류(제3자 제공/처리위탁 구분)는 각 서비스의 이용약관에 따라 달라질 수
            있어, 필요 시 법률 검토를 권장합니다. 각 서비스의 자체 개인정보 처리방침은 해당
            서비스의 공식 웹사이트에서 확인할 수 있습니다.
          </p>
        </Section>

        <Section title="6. 국외 이전">
          <p>
            AI 설명 기능에 사용되는 OpenAI(api.openai.com)는 미국에 소재한 사업자로, 위
            5번 항목에 기재된 정보(참여자 개인 식별 정보 제외)가 미국으로 이전되어 처리됩니다.
          </p>
          <p className="mt-2">
            Firebase(Google)의 실제 데이터 저장 위치(리전)는 이 코드만으로는 확인할 수
            없었습니다 — Firebase 콘솔의 프로젝트 설정에서 운영자가 직접 확인해야 하는
            사항입니다. 확인 전까지는 국외 이전 여부를 &ldquo;없음&rdquo;으로 단정하지
            않습니다.
          </p>
        </Section>

        <Section title="7. 쿠키 및 자동 수집 정보">
          <p>
            서비스는 별도의 쿠키나 방문자 분석(애널리틱스) 도구를 사용하지 않습니다(코드와
            의존성 목록을 확인했습니다). 브라우저 저장소는 참여자 인증 정보를 기기에 남기는
            localStorage만 사용하며, 이는 광고나 추적 목적이 아닙니다.
          </p>
          <p className="mt-2">
            다만 서비스가 배포되어 있는 호스팅 플랫폼(Vercel)은 일반적인 웹 서비스와 마찬가지로
            요청 처리 과정에서 접속 IP, 요청 시각 등 기술적 로그를 자체적으로 남길 수 있습니다.
            이는 서비스 코드가 직접 만드는 로그가 아니라 호스팅 플랫폼 자체의 운영 정책에 따른
            것으로, 구체적인 보관 기간은 확인되지 않았습니다.
          </p>
        </Section>

        <Section title="8. 안전성 확보 조치">
          <p>현재 코드에서 확인되는 조치는 다음과 같습니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>참여자 인증 토큰은 평문으로 저장하지 않고 해시(SHA-256)된 값만 저장</li>
            <li>참여자 관련 데이터(닉네임·선호도·인증정보)는 서버(Admin SDK)에서만 접근 가능하도록 클라이언트 직접 접근 차단</li>
            <li>비용이 발생하는 요청(장소 검색, Re:Plan, AI 설명 등)에 대한 반복 호출 제한(요청 속도 제한)</li>
          </ul>
          <p className="mt-2">
            그 외 암호화 전송(HTTPS)은 Vercel 호스팅 환경의 기본 제공 사항에 따르며, 이 항목에
            명시되지 않은 추가적인 보안 인증(예: ISMS)은 적용되어 있지 않습니다.
          </p>
        </Section>

        <Section title="9. 이용자의 권리 및 행사 방법, 문의처">
          <p>
            이용자(및 여행 참여자)는 본인이 입력한 여행 선호도를 참여 링크를 통해 언제든 다시
            열람·수정할 수 있습니다. 그 외 본인 정보의 열람·정정·삭제를 원하시면 아래 이메일로
            문의해 주세요. 운영자가 요청 대상과 권한을 확인한 뒤 처리합니다.
          </p>
          <p className="mt-2">
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mt-2">
            현재 서비스는 개인이 운영하는 소규모 프로젝트로, 별도의 개인정보 보호책임자를
            공식적으로 지정했는지는 확인되지 않았습니다. 위 이메일은 운영자 본인이 직접
            확인하는 연락처입니다.
          </p>
        </Section>

        <Section title="10. 방침의 변경">
          이 방침이 변경되는 경우 이 페이지를 통해 변경 사항과 새로운 시행일을 안내합니다.
        </Section>
      </div>

      <p className="mt-10 text-xs text-ink-muted">
        이 방침은 서비스의 실제 코드와 구조를 확인한 내용을 바탕으로 작성되었으며, 법률 자문을
        대체하지 않습니다. Firebase의 실제 데이터 처리 리전, 사업자등록 여부, 개인정보
        보호책임자 지정 의무 해당 여부는 운영자의 추가 확인 또는 법률 검토가 필요한 사항으로
        남아 있습니다.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-medium text-ink">{title}</h2>
      <div className="text-ink-muted">{children}</div>
    </section>
  );
}
