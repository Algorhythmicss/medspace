"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { searchPatientsForQueue } from "@/app/actions";
import { useClinicState } from "./useClinicState";
import QueueVitals from "@/components/QueueVitals";
import QueueTicket from "./QueueTicket";
import { useCareRefresh } from "./useCareRefresh";
import type { QueueItem } from "@/lib/live-clinic";

type Match = Awaited<ReturnType<typeof searchPatientsForQueue>>[number];
function CheckIn({
  disabled,
  submit,
}: {
  disabled: boolean;
  submit: (kind: string, value: Record<string, unknown>) => Promise<unknown>;
}) {
  const [mode, setMode] = useState<"search" | "new">("search"),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<Match[]>([]),
    [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      searchPatientsForQueue(query)
        .then((value) => {
          if (!cancelled) setMatches(value);
        })
        .catch(() => {
          if (!cancelled)
            setMessage("Could not search. Check the connection and try again.");
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      cancelled = true;
    };
  }, [query]);
  async function add(patientId: string) {
    const value = await submit("check_in", { patientId });
    if (value) {
      setQuery("");
      setMatches([]);
      setMessage("Checked in. Their queue number is shown below.");
    }
  }
  return (
    <div className="card p-4">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          className="chip"
          data-on={mode === "search"}
          onClick={() => setMode("search")}
        >
          Find patient
        </button>
        <button
          type="button"
          className="chip"
          data-on={mode === "new"}
          onClick={() => setMode("new")}
        >
          New patient
        </button>
      </div>
      {mode === "search" ? (
        <div>
          <label className="t-cap block">
            Find by name, phone or file number
            <input
              className="field mt-1 w-full"
              value={query}
              disabled={disabled}
              onChange={(event) => {
                setQuery(event.target.value);
                setMatches([]);
                setMessage("");
              }}
            />
          </label>
          <ul className="mt-2 divide-y divide-hairline">
            {matches.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  disabled={disabled}
                  className="flex min-h-12 w-full items-center justify-between gap-3 text-left disabled:opacity-50"
                  onClick={() => void add(patient.id)}
                >
                  <span>
                    {patient.name}
                    <span className="t-micro block text-ink3">
                      File {patient.fileNumber}
                      {patient.phone ? ` · ${patient.phone}` : ""}
                    </span>
                  </span>
                  <span className="t-cap font-semibold text-peri">
                    Check in
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {query.trim() && !matches.length ? (
            <p className="t-micro mt-2 text-ink3">
              No match yet. You can register a new patient.
            </p>
          ) : null}
        </div>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget,
              values = new FormData(form);
            const result = await submit("register", {
              name: String(values.get("name") || ""),
              phone: String(values.get("phone") || ""),
              ageYears: String(values.get("ageYears") || ""),
              sex: String(values.get("sex") || ""),
              confirmDifferentPerson:
                values.get("confirmDifferentPerson") === "on",
            });
            if (result) {
              form.reset();
              setMode("search");
              setMessage(
                "Registered and checked in. Their queue number is shown below.",
              );
            }
          }}
        >
          <fieldset
            disabled={disabled}
            className="space-y-2 disabled:opacity-50"
          >
            <label className="t-cap block">
              Patient name
              <input
                name="name"
                required
                maxLength={120}
                className="field mt-1 w-full"
              />
            </label>
            <label className="t-cap block">
              Phone (optional)
              <input
                name="phone"
                maxLength={40}
                inputMode="tel"
                className="field mt-1 w-full"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="t-cap">
                Age (optional)
                <input
                  name="ageYears"
                  type="number"
                  min={0}
                  max={130}
                  className="field mt-1 w-full"
                />
              </label>
              <label className="t-cap">
                Sex (optional)
                <select name="sex" className="field mt-1 w-full">
                  <option value="">Not recorded</option>
                  <option value="F">Female</option>
                  <option value="M">Male</option>
                  <option value="O">Other</option>
                </select>
              </label>
            </div>
            <button className="btn btn-primary w-full">
              Register & check in
            </button>
          </fieldset>
          <label className="t-micro mt-3 flex items-start gap-2 text-ink3">
            <input
              type="checkbox"
              name="confirmDifferentPerson"
              disabled={disabled}
            />
            <span>
              If this phone is already on file, I checked that this is a
              different person sharing it.
            </span>
          </label>
        </form>
      )}
      {message ? (
        <p role="status" className="t-cap mt-3 text-jade">
          {message}
        </p>
      ) : null}
    </div>
  );
}
function AverageForm({
  average,
  disabled,
  save,
}: {
  average: number | null;
  disabled: boolean;
  save: (value: number) => void;
}) {
  const [value, setValue] = useState(average?.toString() ?? "");
  return (
    <details className="mt-3 border-t border-hairline pt-3">
      <summary className="t-cap cursor-pointer font-semibold text-ink2">
        Queue settings
        {average ? ` · ${average} min average` : " · set consultation time"}
      </summary>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save(Number(value));
        }}
      >
        <label className="t-cap flex-1">
          Average consultation time (minutes)
          <input
            type="number"
            required
            min={1}
            max={240}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="field mt-1 w-full"
            disabled={disabled}
          />
        </label>
        <button className="btn btn-secondary" disabled={disabled}>
          Save average
        </button>
        <p className="t-micro w-full text-ink3">
          Patient estimates include a buffer. They can change when a
          consultation runs longer.
        </p>
      </form>
    </details>
  );
}
export default function LiveQueue({ role }: { role: "doctor" | "staff" }) {
  const live = useClinicState(role);
  const entries = live.data?.entries ?? [],
    active = entries.find((entry) => entry.status !== "waiting"),
    waiting = entries.filter((entry) => entry.status === "waiting");
  const disabled = live.busy || Boolean(live.pending);
  useCareRefresh(
    role === "doctor" && live.data
      ? entries.map((entry) => `${entry.id}:${entry.status}`).join("|")
      : undefined,
  );
  async function action(kind: string, entry: QueueItem) {
    await live.mutate(kind, { entryId: entry.id, revision: entry.revision });
  }
  return (
    <section aria-labelledby="live-queue-heading" className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="live-queue-heading" className="t-head">
              Live queue
            </h2>
            <p className="t-micro mt-1 text-ink3" role="status">
              {live.stale
                ? "Updates paused — last saved state"
                : live.data
                  ? `${waiting.length} waiting · updates every few seconds`
                  : "Loading the clinic queue…"}
            </p>
          </div>
          {role === "doctor" && live.data ? (
            <button
              className="btn btn-secondary"
              disabled={disabled}
              onClick={() =>
                void live.mutate("settings", {
                  paused: !live.data!.settings.paused,
                })
              }
            >
              {live.data.settings.paused ? "Resume queue" : "Pause queue"}
            </button>
          ) : null}
        </div>
        {live.data?.settings.paused ? (
          <p className="t-cap mt-3 rounded-xl bg-buttersoft p-3 text-butter">
            Queue paused. Patients keep their places; time estimates are hidden.
          </p>
        ) : null}
        {role === "doctor" && live.data ? (
          <AverageForm
            key={live.data.settings.averageMinutes ?? "unset"}
            average={live.data.settings.averageMinutes}
            disabled={disabled}
            save={(averageMinutes) =>
              void live.mutate("settings", { averageMinutes })
            }
          />
        ) : null}
        {live.error ? (
          <p role="alert" className="t-cap mt-3 text-coral">
            {live.error}
          </p>
        ) : null}
        {live.pending ? (
          <div className="mt-3 rounded-xl bg-buttersoft p-3">
            <p className="t-cap">
              This action is not yet confirmed. Retry it before making another
              change.
            </p>
            <button
              className="btn btn-secondary mt-2"
              disabled={live.busy}
              onClick={() => void live.retry()}
            >
              Retry unconfirmed action
            </button>
          </div>
        ) : null}
      </div>
      {role === "staff" ? (
        <CheckIn disabled={disabled} submit={live.mutate} />
      ) : (
        <details className="card p-4">
          <summary className="t-cap cursor-pointer font-semibold text-peri">
            Check in a patient
          </summary>
          <div className="mt-3">
            <CheckIn disabled={disabled} submit={live.mutate} />
          </div>
        </details>
      )}
      {active ? (
        <div className="card border border-peri/25 p-4">
          <p className="label">
            {active.status === "called" ? "Called" : "With the doctor"}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="t-title text-peri">{active.number ?? "—"}</span>
            <span className="t-head">{active.name}</span>
          </div>
          <QueueTicket key={active.id} entryId={active.id} />
          {role === "doctor" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {active.status === "called" ? (
                <button
                  className="btn btn-primary"
                  disabled={disabled || live.data?.settings.paused}
                  onClick={() => void action("start", active)}
                >
                  Start consultation
                </button>
              ) : (
                <Link
                  href={`/patients/${active.patientId}/visit/new`}
                  className="btn btn-primary"
                >
                  Open consultation
                </Link>
              )}
              <Link
                href={`/patients/${active.patientId}`}
                className="btn btn-secondary"
              >
                Patient file
              </Link>
              <button
                className="t-cap min-h-11 px-3 text-ink3"
                disabled={disabled}
                onClick={() => {
                  if (
                    confirm(
                      "Return this patient to the end of the waiting list? Their number stays the same today. After midnight they receive a new daily number.",
                    )
                  )
                    void action("return", active);
                }}
              >
                Return to waiting
              </button>
            </div>
          ) : (
            <p className="t-cap mt-2 text-ink3">
              The doctor controls this consultation.
            </p>
          )}
        </div>
      ) : null}
      <div>
        <h3 className="label mb-2 px-1">Waiting · {waiting.length}</h3>
        {live.data && !waiting.length ? (
          <p className="card p-5 text-ink3">No one is waiting.</p>
        ) : null}
        <ol className="space-y-2">
          {waiting.map((entry, index) => (
            <li key={entry.id} className="card p-4">
              <div className="flex items-start gap-3">
                <span className="t-num flex h-10 min-w-10 items-center justify-center rounded-xl bg-perisoft px-2 text-peri">
                  {entry.number ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="t-head break-words">{entry.name}</p>
                  <p className="t-micro mt-1 text-ink3">
                    {index === 0 ? "Next waiting" : "Waiting"} · File{" "}
                    {entry.fileNumber}
                    {entry.vitalsReady ? " · Vitals ready" : ""}
                  </p>
                  {role === "doctor" && (entry.assessmentsToReview || 0) > 0 ? (
                    <Link
                      className="t-cap mt-1 inline-flex min-h-11 items-center text-peri"
                      href={`/patients/${entry.patientId}#assessment-review`}
                    >
                      {entry.assessmentsToReview} assessment
                      {entry.assessmentsToReview === 1 ? "" : "s"} to review
                    </Link>
                  ) : null}
                  {role === "doctor" && (entry.photosToReview || 0) > 0 ? (
                    <Link
                      className="t-cap mt-1 inline-flex min-h-11 items-center text-peri"
                      href={`/patients/${entry.patientId}#progress-photos`}
                    >
                      {entry.photosToReview} progress photo
                      {entry.photosToReview === 1 ? "" : "s"} to review
                    </Link>
                  ) : null}
                </div>
              </div>
              {entry.vitals ? (
                <QueueVitals
                  entryId={entry.id}
                  vitals={entry.vitals}
                  revision={entry.revision}
                />
              ) : null}
              <QueueTicket entryId={entry.id} />
              <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
                {role === "doctor" ? (
                  <>
                    <button
                      className="btn btn-primary"
                      disabled={
                        disabled ||
                        Boolean(active) ||
                        live.data?.settings.paused
                      }
                      onClick={() => void action("call", entry)}
                    >
                      Call patient
                    </button>
                    <Link
                      className="btn btn-secondary"
                      href={`/patients/${entry.patientId}`}
                    >
                      Patient file
                    </Link>
                  </>
                ) : (
                  <Link
                    className="btn btn-secondary"
                    href={`/queue/intake/${entry.patientId}`}
                  >
                    Add history
                  </Link>
                )}
                <button
                  className="t-cap min-h-11 px-3 text-ink3"
                  disabled={disabled}
                  onClick={() => {
                    if (
                      confirm(
                        "Remove this arrival from the queue? Their number will not be reused.",
                      )
                    )
                      void action("cancel", entry);
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
