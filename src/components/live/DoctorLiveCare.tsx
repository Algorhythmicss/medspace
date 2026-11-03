"use client";
import { useState } from "react";
import { useClinicState } from "./useClinicState";
import DoctorRecorder from "./DoctorRecorder";
import PrivateMedia from "./PrivateMedia";
import { useCareRefresh } from "./useCareRefresh";
export default function DoctorLiveCare({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const live = useClinicState(
      `doctor:${patientId}`,
      undefined,
      `/api/live/patient/${patientId}`,
    ),
    care = live.data?.care,
    [instructions, setInstructions] = useState("");
  const disabled = live.busy || Boolean(live.pending);
  useCareRefresh(live.data?.contentVersion);
  return (
    <div id="progress-photos" className="scroll-mt-20 space-y-4">
      <DoctorRecorder
        key={patientId}
        patientId={patientId}
        patientName={patientName}
        onShared={live.refresh}
      />
      {live.error ? (
        <p role="alert" className="t-cap text-coral">
          {live.error}
        </p>
      ) : null}
      {live.pending ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={live.busy}
          onClick={() => void live.retry()}
        >
          Retry unconfirmed care update
        </button>
      ) : null}
      {care ? (
        <section className="card p-4">
          <h3 className="t-head">Follow-up progress photos</h3>
          {care.followups.filter(
            (task) =>
              !care.photoRequests.some((request) => request.taskId === task.id),
          ).length ? (
            <form
              className="mt-3 space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const result = await live.mutate("assign_photos", {
                  taskId: String(form.get("taskId")),
                  instructions,
                });
                if (result) setInstructions("");
              }}
            >
              <label className="t-cap block">
                Follow-up
                <select
                  name="taskId"
                  className="field mt-1 w-full"
                  disabled={disabled}
                >
                  {care.followups
                    .filter(
                      (task) =>
                        !care.photoRequests.some(
                          (request) => request.taskId === task.id,
                        ),
                    )
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.dueAt
                          ? new Date(task.dueAt).toLocaleDateString("en-IN")
                          : "Follow-up"}{" "}
                        · {task.title}
                      </option>
                    ))}
                </select>
              </label>
              <label className="t-cap block">
                What should the patient photograph?
                <textarea
                  required
                  maxLength={500}
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  disabled={disabled}
                  className="field mt-1 min-h-20 w-full"
                />
              </label>
              <button
                className="btn btn-secondary"
                disabled={disabled || !instructions.trim()}
              >
                Request progress photos
              </button>
              <p className="t-micro text-ink3">
                The patient can send up to three still photos through their
                private care plan.
              </p>
            </form>
          ) : !care.photoRequests.length ? (
            <p className="t-cap mt-2 text-ink3">
              Set a follow-up before requesting progress photos. You can also
              request them when saving the visit.
            </p>
          ) : null}
          <div className="mt-3 space-y-3">
            {care.photoRequests.map((request) => (
              <article
                key={request.id}
                className="rounded-xl border border-hairline p-3"
              >
                <p className="t-cap whitespace-pre-wrap break-words text-ink2">
                  {request.instructions}
                </p>
                <p className="t-micro mt-1 text-ink3">
                  {request.files.length} of {request.maximumPhotos} received ·{" "}
                  {request.status === "open" ? "Collecting photos" : "Closed"}
                </p>
                {request.files.map((file) => (
                  <div
                    key={file.id}
                    className="mt-3 border-t border-hairline pt-3"
                  >
                    <p className="t-cap break-words">{file.name}</p>
                    <p className="t-micro text-ink3">
                      Patient-reported ·{" "}
                      {file.reviewedAt ? "Reviewed" : "Awaiting review"}
                    </p>
                    <PrivateMedia media={file} />
                    {!file.reviewedAt ? (
                      <button
                        type="button"
                        className="btn btn-secondary mt-2"
                        disabled={disabled}
                        onClick={() =>
                          void live.mutate("review_photo", { mediaId: file.id })
                        }
                      >
                        Mark photo reviewed
                      </button>
                    ) : null}
                  </div>
                ))}
                {request.status === "open" ? (
                  <button
                    type="button"
                    className="t-cap mt-2 inline-flex min-h-11 items-center text-ink3"
                    disabled={disabled}
                    onClick={() => {
                      if (
                        confirm(
                          "Close this photo request? Received photos remain in the record.",
                        )
                      )
                        void live.mutate("close_photos", {
                          requestId: request.id,
                        });
                    }}
                  >
                    Stop collecting photos
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {care?.messages.length ? (
        <details className="card p-4">
          <summary className="t-cap cursor-pointer font-semibold text-ink2">
            Shared voice messages · {care.messages.length}
          </summary>
          {care.messages.map((message) => (
            <div
              key={message.id}
              className="mt-3 border-t border-hairline pt-3"
            >
              <p className="t-micro text-ink3">
                Shared{" "}
                {new Date(message.sharedAt || message.createdAt).toLocaleString(
                  "en-IN",
                )}
              </p>
              <PrivateMedia media={message} />
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}
