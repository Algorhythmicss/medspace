"use client";
import { useState } from "react";
import { copyText } from "@/lib/clipboard";
export default function QueueTicket({ entryId }: { entryId: string }) {
  const [ticket, setTicket] = useState<{ url: string; qr: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  async function open() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/live/ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId, commandId: crypto.randomUUID() }),
          signal: AbortSignal.timeout(15000),
        }),
        result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || "Could not create the queue link. Try again.",
        );
      setTicket(result);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not create the queue link.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        className="t-cap inline-flex min-h-11 items-center font-semibold text-peri"
        disabled={busy}
        onClick={() => (ticket ? setTicket(null) : void open())}
      >
        {busy
          ? "Preparing queue link…"
          : ticket
            ? "Hide queue link"
            : "Share queue link"}
      </button>
      {ticket ? (
        <div className="rounded-xl border border-hairline p-3">
          <p className="t-cap text-ink2">
            Ask this patient to scan their queue ticket.
          </p>
          {/* This generated QR is private, local data; do not send it through the image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ticket.qr}
            alt="Patient queue ticket QR code"
            width={220}
            height={220}
            className="mx-auto my-2"
          />
          <p className="t-micro text-ink3">
            Queue only · expires in 24 hours. The doctor shares the private care
            plan separately. Check the patient before copying or sharing.
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-3 w-full"
            onClick={async () => setCopied(await copyText(ticket.url))}
          >
            {copied ? "Queue link copied" : "Copy queue link"}
          </button>
          <input
            readOnly
            value={ticket.url}
            aria-label="Patient queue link"
            className="field mt-2 w-full text-sm"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="t-cap mt-2 text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
