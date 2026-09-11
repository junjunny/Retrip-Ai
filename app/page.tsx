import Image from "next/image";
import Link from "next/link";

/**
 * Landing page (STEP 15 — travel-first redesign). The first thing a visitor
 * sees is the destination, not the technology: one strong photograph, a
 * short line of Korean copy, one CTA. "AI" is never the headline here — see
 * STYLESEED.md.
 */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas">
      <div className="relative h-[58svh] min-h-80 w-full overflow-hidden sm:h-[64svh]">
        <Image
          src="/hero-haeundae.jpg"
          alt="해운대 해수욕장과 부산 도심의 풍경"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/10 to-black/10" />
        {/* KOGL Type 1 attribution (사진 제공: 부산광역시) — required by the license this photo is used under. */}
        <p className="absolute right-2 bottom-2 text-[10px] text-white/70">사진 제공: 부산광역시</p>
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 px-6 pb-10 pt-2 text-center sm:pt-4">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">Re:Trip</h1>
        <p className="max-w-xs text-lg leading-snug text-ink-muted">
          계획이 달라져도
          <br />
          여행은 계속되니까.
        </p>

        <Link
          href="/trip/create"
          className="mt-4 flex min-h-14 w-full max-w-xs items-center justify-center rounded-2xl bg-brand px-6 text-lg font-medium text-brand-ink transition-opacity active:opacity-80"
        >
          여행 시작하기
        </Link>
        <a href="#how-it-works" className="text-sm text-ink-muted underline-offset-4 hover:text-brand hover:underline">
          먼저 둘러보기 ↓
        </a>
      </div>

      <section id="how-it-works" className="flex flex-col gap-8 px-6 py-14 sm:px-10">
        <Step
          n="1"
          title="여행을 계획하세요"
          body="목적지와 날짜, 가고 싶은 곳을 정리하면 여행 일정이 만들어져요."
        />
        <Step
          n="2"
          title="여행 중엔 그대로 즐기세요"
          body="일정표와 지도를 보면서 계획한 대로 움직이면 돼요."
        />
        <Step
          n="3"
          title="달라지면, 다시 계획해요"
          body="날씨나 시간이 달라졌다면 Re:Plan을 눌러 남은 일정만 다시 살펴봐요. 적용은 항상 직접 선택해요."
        />
      </section>
    </main>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <span className="shrink-0 text-2xl font-semibold text-brand/60 tabular-nums">{n}</span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-ink">{title}</h2>
        <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
      </div>
    </div>
  );
}
