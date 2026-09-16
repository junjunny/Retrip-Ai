import Link from "next/link";

import { appConfig } from "@/config/app";

/**
 * /privacy — real, reachable route. Every data-flow claim below matches how
 * this codebase actually works today (features/participant, features/trip,
 * lib/api/*, lib/participantSession.ts) — nothing here is invented. Facts
 * that depend on the operator's business identity are marked [입력 필요].
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand hover:underline">
        ← {appConfig.name}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">개인정보처리방침</h1>
      <p className="mt-1 text-sm text-ink-muted">시행일: [입력 필요]</p>

      <div className="mt-8 flex flex-col gap-7 text-sm leading-relaxed text-ink">
        <Section title="1. 수집하는 정보">
          <ul className="list-disc space-y-1 pl-5">
            <li>여행 정보: 여행 제목, 목적지, 날짜, 일정(장소명·주소·시간)</li>
            <li>
              참여자 정보: 닉네임, 여행 선호도(1~10 척도의 관심사 응답) — 실명, 이메일,
              전화번호는 수집하지 않습니다.
            </li>
            <li>
              위치 정보: 이용자가 재계획(Re:Plan) 화면에서 &ldquo;출발지&rdquo;로 직접
              선택하거나 브라우저 위치 권한을 직접 허용했을 때만 일시적으로 사용됩니다.
              백그라운드로 위치를 추적하지 않습니다.
            </li>
          </ul>
        </Section>

        <Section title="2. 정보의 저장">
          위 정보는 Google Firebase(Firestore)에 저장됩니다. 참여자 식별에 쓰이는 토큰은
          해시(hash)된 형태로만 저장되며, 원문 토큰은 이용자의 브라우저(localStorage)에만
          남습니다.
        </Section>

        <Section title="3. 제3자 API 연동">
          여행 일정을 실제 장소·이동 정보·날씨와 연결하기 위해 아래 외부 서비스를 호출합니다.
          이때 전달되는 값은 장소명·좌표 등 일정 관련 정보뿐이며, 참여자의 이름이나 개인
          식별 정보를 함께 전달하지 않습니다.
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Kakao 로컬/모빌리티 API — 장소 검색, 실제 이동 경로·시간 계산</li>
            <li>한국관광공사 TourAPI — 관광지 정보 및 이미지</li>
            <li>기상청(KMA) 단기예보 API — 실제 날씨 정보</li>
            <li>
              언어 모델(LLM) API — 이미 계산된 일정 변경 사실을 자연어 문장으로 설명하는
              용도로만 사용되며, 장소 선택이나 점수 계산에는 관여하지 않습니다.
            </li>
          </ul>
        </Section>

        <Section title="4. 정보의 보관 및 삭제">
          여행 데이터는 이용자가 서비스를 이용하는 동안 보관됩니다. 삭제 요청 방법:
          [입력 필요]. 보관 기간: [입력 필요].
        </Section>

        <Section title="5. 광고 및 분석 도구">
          현재 서비스에는 광고 트래킹이나 방문자 분석(애널리틱스) 스크립트가 포함되어
          있지 않습니다.
        </Section>

        <Section title="6. 이용자의 권리">
          이용자는 본인이 입력한 여행 선호도를 참여 링크를 통해 언제든 다시 확인·수정할 수
          있습니다. 그 밖의 열람·정정·삭제 요청 창구: [입력 필요]
        </Section>

        <Section title="7. 문의처">
          개인정보 관련 문의: [입력 필요]
        </Section>
      </div>

      <p className="mt-10 text-xs text-ink-muted">
        이 페이지는 실제 서비스 구조를 기준으로 작성되었으며, 사업자 연락처 등 [입력 필요]로
        표시된 항목은 서비스 운영 주체가 직접 채워야 합니다.
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
