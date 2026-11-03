"use client";
import { useRef, useState } from "react";
import { etaLabel, type PhotoRequest } from "@/lib/live-clinic";
import { useClinicState } from "./useClinicState";
import PrivateMedia from "./PrivateMedia";
import { useCareRefresh } from "./useCareRefresh";

function ProgressUpload({
  request,
  planToken,
  refresh,
}: {
  request: PhotoRequest;
  planToken?: string;
  refresh: () => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const command = useRef(""),
    input = useRef<HTMLInputElement | null>(null);
  async function submit() {
    setBusy(true);
    setError("");
    if (!command.current) command.current = crypto.randomUUID();
    const form = new FormData();
    form.set("requestId", request.id);
    form.set("commandId", command.current);
    form.set("consent", consent ? "yes" : "no");
    for (const file of files) form.append("files", file);
    try {
      const headers: Record<string, string> = planToken
          ? { Authorization: `Bearer ${planToken}` }
          : {},
        response = await fetch("/api/live/photos", {
          method: "POST",
          headers,
          body: form,
          signal: AbortSignal.timeout(20000),
        }),
        result = await response.json();
      if (!response.ok) {
        if (response.status < 500) command.current = "";
        throw new Error(
          result.message || "The photos could not be confirmed as sent.",
        );
      }
      setFiles([]);
      setConsent(false);
      command.current = "";
      if (input.current) input.current.value = "";
      setMessage(
        result.result?.duplicatesSkipped
          ? "These photos were already received. They were not added twice."
          : "Photos received. They are waiting for the doctor to review.",
      );
      await refresh();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not confirm the upload. Keep the photos selected and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  const left = request.maximumPhotos - request.files.length;
  return (
    <article className="card p-4">
      <h3 className="t-head">Progress photos for your follow-up</h3>
      {request.dueAt ? (
        <p className="t-micro mt-1 text-ink3">
          Follow-up ·{" "}
          {new Date(request.dueAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </p>
      ) : null}
      <p className="t-cap mt-3 whitespace-pre-wrap break-words text-ink2">
        {request.instructions}
      </p>
      <p className="t-micro mt-2 text-ink3">
        Your photos are patient-reported and need doctor review.
      </p>
      {request.files.length ? (
        <ul className="mt-3 space-y-2">
          {request.files.map((file) => (
            <li key={file.id} className="rounded-xl border border-hairline p-3">
              <p className="t-cap break-words">{file.name}</p>
              <p className="t-micro text-ink3">
                {file.reviewedAt
                  ? "Reviewed by the doctor"
                  : "Waiting for doctor review"}
              </p>
              <PrivateMedia media={file} planToken={planToken} patient />
            </li>
          ))}
        </ul>
      ) : null}
      {request.status === "open" && left > 0 ? (
        <form
          className="mt-4 border-t border-hairline pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="t-cap block">
            Add progress photos
            <input
              ref={input}
              className="mt-2 block w-full text-sm"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff"
              multiple
              required
              disabled={busy}
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                command.current = "";
                setMessage("");
                setError("");
              }}
            />
          </label>
          <p className="t-micro mt-2 text-ink3">
            {left} photo{left === 1 ? "" : "s"} remaining · 2 MB each, 3 MB
            together. JPEG, PNG and other still photos; export HEIC first.
          </p>
          <label className="t-cap mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              required
              checked={consent}
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1"
            />
            <span>
              These are my progress photos and I want the doctor to review them.
            </span>
          </label>
          <button
            className="btn btn-primary mt-3 w-full"
            disabled={busy || !files.length || !consent}
          >
            {busy ? "Sending photos…" : "Send progress photos"}
          </button>
        </form>
      ) : (
        <p className="t-cap mt-3 text-ink3">
          {request.status === "closed"
            ? "The doctor has closed this photo request."
            : "All requested photos have been received."}
        </p>
      )}
      {error ? (
        <p role="alert" className="t-cap mt-3 text-coral">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="t-cap mt-3 text-jade">
          {message}
        </p>
      ) : null}
    </article>
  );
}
export default function LivePatient({
  patientId,
  planToken,
  ticketOnly = false,
}: {
  patientId: string;
  planToken?: string;
  ticketOnly?: boolean;
}) {
  const live = useClinicState(
      `patient:${patientId}`,
      planToken,
      ticketOnly ? "/api/live/ticket" : "/api/live?view=patient",
    ),
    queue = live.data?.patientQueue,
    entry = queue?.entry;
  useCareRefresh(ticketOnly ? undefined : live.data?.contentVersion);
  const status =
    entry?.status === "expired"
      ? "This arrival belongs to an earlier clinic day"
      : entry?.status === "called"
        ? "The doctor has called you"
        : entry?.status === "in_consultation"
          ? "You’re with the doctor"
          : entry?.status === "completed" || entry?.status === "seen"
            ? "Your visit is complete"
            : entry?.status === "cancelled"
              ? "This arrival was removed from the queue"
              : entry
                ? "You’re checked in"
                : "You’re not in today’s queue";
  return (
    <div className="my-5 space-y-4">
      <section className="card p-4" aria-labelledby="patient-queue-heading">
        <h2 id="patient-queue-heading" className="t-head">
          Your place in the queue
        </h2>
        {live.data ? (
          <>
            <p className="t-cap mt-2 text-ink2" role="status">
              {status}
            </p>
            {entry && queue?.position ? (
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <p className="t-micro text-ink3">Your number</p>
                  <p className="t-title mt-1 text-peri">
                    {entry.number ?? "Awaiting number"}
                  </p>
                  <p className="t-cap mt-1 text-ink3">
                    Position {queue.position}
                    {queue.ahead
                      ? ` · ${queue.ahead} ${queue.ahead === 1 ? "person" : "people"} ahead`
                      : ""}
                  </p>
                </div>
                {entry.status === "waiting" ? (
                  <div className="text-right">
                    <p className="t-micro text-ink3">Estimated wait</p>
                    <p className="t-head mt-1">
                      {live.stale
                        ? "Updating…"
                        : live.data.settings.paused
                          ? "Queue paused"
                          : !live.data.settings.averageMinutes
                            ? "Not set yet"
                            : etaLabel(queue.estimateMinutes)}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : !entry ? (
              <p className="t-cap mt-2 text-ink3">
                Reception checks you in when you arrive at the clinic.
              </p>
            ) : null}
            {entry?.status === "expired" ? (
              <p className="t-cap mt-2 text-ink3">
                Ask reception to check you in and share today’s queue ticket.
              </p>
            ) : null}
            {entry?.status === "waiting" ? (
              <p className="t-micro mt-3 text-ink3">
                {live.data.settings.paused
                  ? "Your place is saved. The clinic will resume updates when it is ready."
                  : "Estimates include extra time and can change. Your number stays the same as your position moves."}
              </p>
            ) : null}
            <p className="t-micro mt-3 text-ink3">
              {live.stale
                ? "Connection interrupted. The last saved position may be out of date."
                : "Updates every few seconds while this page is open."}
            </p>
          </>
        ) : (
          <p className="t-cap mt-2 text-ink3">
            {live.error || "Checking the clinic queue…"}
          </p>
        )}
        {live.data && live.error ? (
          <p role="alert" className="t-cap mt-2 text-coral">
            {live.error}
          </p>
        ) : null}
      </section>
      {live.data?.photoRequests?.map((request) => (
        <ProgressUpload
          key={request.id}
          request={request}
          planToken={planToken}
          refresh={live.refresh}
        />
      ))}
      {live.data?.messages?.length ? (
        <section className="card p-4">
          <h2 className="t-head">Messages from your doctor</h2>
          <ul className="mt-3 divide-y divide-hairline">
            {live.data.messages.map((message) => (
              <li key={message.id} className="py-3">
                <p className="t-cap">
                  Voice message ·{" "}
                  {new Date(
                    message.sharedAt || message.createdAt,
                  ).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                <PrivateMedia media={message} planToken={planToken} patient />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
