"use client";

import { Share2 } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** Invite link + copy (and native share where available) for a trip. */
export function InviteLink({ tripId }: { tripId: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Browser-only value: real URL on the client, "" during SSR/first paint.
  const url = useSyncExternalStore(
    noop,
    () => `${window.location.origin}/trip/${tripId}/join`,
    () => "",
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (http, permissions) — select the text so the user
      // can copy manually
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          readOnly
          value={url}
          aria-label="초대 링크"
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface-alt px-3 py-2 text-sm text-ink-muted"
        />
        <button
          type="button"
          onClick={copy}
          className="min-h-11 shrink-0 rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      {canShare && (
        <button
          type="button"
          onClick={() =>
            navigator.share({ title: "여행에 참여해주세요", url }).catch(() => {})
          }
          className="flex min-h-11 items-center gap-1.5 self-start text-sm text-ink-muted"
        >
          <Share2 className="size-3.5" aria-hidden />
          공유하기
        </button>
      )}
    </div>
  );
}
