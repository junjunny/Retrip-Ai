import Link from "next/link";

import { appConfig } from "@/config/app";

/**
 * /terms — real, reachable route (not a placeholder link). Content that
 * depends on business/legal facts we don't have (operator identity,
 * jurisdiction, effective date) is marked [입력 필요] rather than invented.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand hover:underline">
        ← {appConfig.name}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">이용약관</h1>
      <p className="mt-1 text-sm text-ink-muted">시행일: [입력 필요]</p>

      <div className="mt-8 flex flex-col gap-7 text-sm leading-relaxed text-ink">
        <Section title="제1조 (목적)">
          이 약관은 {appConfig.name}(이하 &ldquo;서비스&rdquo;)이 제공하는 여행 일정 관리 및
          재계획(Re:Plan) 기능의 이용과 관련하여 서비스와 이용자의 권리, 의무 및 책임사항을
          정하는 것을 목적으로 합니다.
        </Section>

        <Section title="제2조 (운영 주체)">
          <p>
            사업자 등록번호: [입력 필요] · 상호: [입력 필요] · 대표자: [입력 필요]
            <br />
            주소: [입력 필요] · 연락처: [입력 필요]
          </p>
        </Section>

        <Section title="제3조 (서비스의 내용)">
          <ul className="list-disc space-y-1 pl-5">
            <li>여행 일정(장소, 날짜, 시간) 생성 및 관리</li>
            <li>일행 초대 및 참여자별 여행 선호도 입력</li>
            <li>
              실제 이동 경로(Kakao Mobility), 실시간 날씨(기상청), 관광 정보(한국관광공사
              TourAPI)를 반영한 일정 재계획(Re:Plan) 제안 — 최종 적용 여부는 항상 이용자가
              직접 선택합니다.
            </li>
          </ul>
        </Section>

        <Section title="제4조 (계정 및 참여자 식별)">
          이 서비스는 별도의 회원가입 없이 동작합니다. 여행 참여자는 초대 링크를 통해
          참여하며, 브라우저에 저장된 식별 토큰으로 본인의 입력을 다시 수정할 수 있습니다.
          토큰은 서버에 해시(hash)된 형태로만 저장되며, 브라우저 저장소를 삭제하면 동일한
          참여 기록에 다시 접근할 수 없습니다.
        </Section>

        <Section title="제5조 (이용자의 의무)">
          이용자는 본인 또는 타인의 실제 여행 계획과 무관한 허위 정보를 등록하거나, 서비스가
          연동하는 외부 API(지도, 날씨, 관광정보)를 비정상적인 방법으로 대량 호출하는 등
          서비스 운영을 방해하는 행위를 해서는 안 됩니다.
        </Section>

        <Section title="제6조 (면책)">
          서비스가 제공하는 일정 재계획 제안은 실제 외부 데이터(날씨, 교통, 장소 정보)에
          근거하되, 해당 외부 데이터의 정확성·최신성까지 보증하지는 않습니다. 최종 여행
          결정과 그에 따른 책임은 이용자에게 있습니다.
        </Section>

        <Section title="제7조 (약관의 변경)">
          서비스 내용 변경 시 이 페이지를 통해 공지합니다. [변경 통지 방식 — 입력 필요]
        </Section>
      </div>

      <p className="mt-10 text-xs text-ink-muted">
        이 페이지는 실제 서비스 구조를 기준으로 작성되었으며, 사업자 정보 등 [입력 필요]로
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
