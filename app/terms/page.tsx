import Link from "next/link";

import { appConfig } from "@/config/app";

const CONTACT_EMAIL = "hanjunhee0421@gmail.com";

/**
 * /terms — real, reachable route, written to match what this codebase
 * actually does today (see app/privacy/page.tsx's doc comment for the same
 * audit). Not a substitute for legal review — see the closing note.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand hover:underline">
        ← {appConfig.name}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">이용약관</h1>
      <p className="mt-1 text-sm text-ink-muted">시행일: 2026년 9월 16일</p>

      <div className="mt-8 flex flex-col gap-7 text-sm leading-relaxed text-ink">
        <Section title="제1조 (목적)">
          이 약관은 {appConfig.name}(이하 &ldquo;서비스&rdquo;)이 제공하는 여행 일정 작성·관리
          및 Re:Plan(일정 재계획) 기능의 이용과 관련하여, 서비스와 이용자의 기본적인 권리·의무
          및 책임사항을 정하는 것을 목적으로 합니다.
        </Section>

        <Section title="제2조 (운영자 및 문의)">
          <p>
            서비스명: {appConfig.name}
            <br />
            운영자: 한준희 (개인 개발자 — 사업자등록 여부는 별도로 확인되지 않았습니다)
            <br />
            문의 이메일:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        <Section title="제3조 (서비스 내용)">
          서비스는 현재 다음 기능을 제공합니다.
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>여행 일정(장소·날짜·시간) 작성 및 관리</li>
            <li>여행 참여자 초대 및 참여자별 여행 선호도(1~10 척도) 입력</li>
            <li>실제 날씨(기상청)·이동 경로(Kakao Mobility)·관광 정보(한국관광공사)를 반영한 정보 제공</li>
            <li>
              이용자가 직접 실행하는 Re:Plan — 여행 중 상황 변화로 영향받는 일정만 다시
              살펴보는 변경안 미리보기(Preview) 및 최종 적용(Apply)/유지(Keep) 선택
            </li>
            <li>여행 진행 상태(현재/다음 일정) 확인</li>
          </ul>
          <p className="mt-2">
            위에 명시되지 않은 기능(예: 결제, 예약 대행, 회원 등급제)은 현재 제공되지 않습니다.
          </p>
        </Section>

        <Section title="제4조 (이용 방식 — 회원가입 없는 링크 기반 접근)">
          <p>
            서비스는 별도의 회원가입·로그인 절차 없이 이용할 수 있습니다. 여행을 만들면 임의의
            문자열로 된 여행 식별자(예: 8자리 코드)가 발급되고, 이 식별자가 포함된 주소(여행
            링크)를 아는 사람은 해당 여행 일정을 열람·참여할 수 있습니다.
          </p>
          <p className="mt-2">
            즉, 여행 링크 자체가 접근 권한을 대신합니다. 링크가 공개된 곳(예: 공개 채팅방,
            검색엔진에 노출되는 페이지 등)에 게시되면 의도하지 않은 제3자도 접근할 수 있으므로,
            이용자는 여행 링크를 신뢰할 수 있는 사람에게만 공유해야 합니다.
          </p>
          <p className="mt-2">
            참여자는 최초 참여 시 발급되는 인증 정보를 이용 중인 브라우저에 저장하여 본인의
            입력을 다시 수정할 수 있습니다. 브라우저 저장 데이터를 삭제하거나 다른 기기로
            접속하면 동일한 참여 기록으로 인식되지 않을 수 있습니다.
          </p>
        </Section>

        <Section title="제5조 (여행 데이터의 입력 및 책임)">
          <p>
            이용자가 입력하는 여행 제목, 일정, 장소, 참여자 닉네임, 선호도 등은 이용자 본인의
            책임 아래 작성됩니다. 다른 사람의 일정에 참여시키거나 다른 사람의 이름·선호도를
            대신 입력하는 경우, 해당 인물에게 사전에 알리고 필요한 동의를 받아야 합니다.
          </p>
        </Section>

        <Section title="제6조 (Re:Plan 기능의 성격)">
          <p>
            Re:Plan은 날씨·교통 등 상황 변화가 감지되었을 때, 영향을 받는 일정에 한해 대안을
            제시하는 기능입니다. 이 대안은 실시간 외부 정보(날씨, 이동 경로, 관광지 정보)에
            근거하지만, 서비스는 해당 외부 정보의 정확성·최신성·이용 가능 여부를 보장하지
            않습니다.
          </p>
          <p className="mt-2">
            Re:Plan이 제시하는 변경안은 항상 미리보기 형태로만 제공되며, 실제 일정 변경은
            이용자가 내용을 확인하고 직접 선택(적용 또는 유지)한 경우에만 이루어집니다. 서비스가
            임의로 또는 자동으로 일정을 변경하지 않습니다.
          </p>
        </Section>

        <Section title="제7조 (이용자 준수사항)">
          이용자는 다음 행위를 해서는 안 됩니다.
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>타인의 개인정보를 동의 없이 입력하거나 유출하는 행위</li>
            <li>여행 링크를 이용해 타인의 여행 일정에 무단으로 접근·수정하는 행위</li>
            <li>서비스가 연동하는 외부 API(지도, 날씨, 관광정보, AI)를 비정상적으로 대량 호출하는 등 정상적인 서비스 운영을 방해하는 행위</li>
          </ul>
        </Section>

        <Section title="제8조 (서비스 변경 및 중단)">
          서비스는 개인이 운영하는 프로젝트로, 점검, 외부 연동 서비스(Kakao, 한국관광공사,
          기상청, Firebase, AI 모델 제공사 등)의 장애·정책 변경, 그 밖의 운영상 사유로 사전
          고지 없이 기능의 일부 또는 전부가 일시적으로 제한되거나 중단될 수 있습니다.
        </Section>

        <Section title="제9조 (책임의 제한)">
          <p>
            서비스는 무료로 제공되는 개인 프로젝트이며, 실시간 외부 데이터(날씨·교통·관광 정보)의
            한계로 인해 실제 현장 상황과 차이가 발생할 수 있습니다. 이용자는 이를 감안하여 최종
            여행 결정을 스스로 판단·확인해야 하며, 이에 따른 책임은 이용자에게 있습니다.
          </p>
          <p className="mt-2">
            다만 운영자의 고의 또는 중과실로 인한 손해 등 관련 법령상 배제할 수 없는 책임까지
            면제하는 것은 아닙니다.
          </p>
        </Section>

        <Section title="제10조 (약관의 변경 및 문의)">
          <p>
            약관이 변경되는 경우 이 페이지를 통해 변경 사항과 시행일을 안내합니다. 약관에 관한
            문의는 아래 이메일로 받습니다.
          </p>
          <p className="mt-2">
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
      </div>

      <p className="mt-10 text-xs text-ink-muted">
        이 약관은 현재 서비스의 실제 구현을 기준으로 작성되었으며, 법률 자문을 대체하지
        않습니다. 사업자등록 여부 등 운영자의 법적 지위와 관련된 사항은 운영자의 추가 확인이
        필요합니다.
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
