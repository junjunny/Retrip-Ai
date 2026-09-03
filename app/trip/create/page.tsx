import Link from "next/link";

import { TripCreateForm } from "@/components/trip/TripCreateForm";

/** /trip/create — enter trip basics + itinerary, then save to Firestore. */
export default function TripCreatePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Re:Trip AI
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">새 여행 만들기</h1>
      <p className="mt-1 text-sm text-zinc-500">
        여행 정보와 일정을 입력해주세요.
      </p>
      <div className="mt-6">
        <TripCreateForm />
      </div>
    </main>
  );
}
