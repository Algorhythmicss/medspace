"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, UserPlus, Plus, Check } from "lucide-react";
import { searchPatientsForQueue, addToQueue, staffRegisterAndQueue } from "@/app/actions";

type Result = {
  id: string;
  name: string;
  fileNumber: number;
  phone: string | null;
  ageYears: number | null;
  sex: string | null;
};

const ageSex = (p: Result) => [p.ageYears, p.sex].filter(Boolean).join(" ");

// The front-desk intake: find an existing patient and add them to today's
// queue, or register a walk-in on the spot. No clinical data is ever shown or
// touched — this is who arrived, not why.
export default function QueueDesk() {
  const [mode, setMode] = useState<"search" | "new">("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [note, setNote] = useState("");
  const [dupes, setDupes] = useState<Result[]>([]); // existing records on this phone
  const [added, setAdded] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [pending, start] = useTransition();

  // One debounced, latest-wins searcher for both the search box and the
  // new-patient phone check. Debounce keeps us from firing a server action on
  // every keystroke (which serialized and raced — the "find works sometimes"
  // bug); the seq guard drops any answer that a newer query has superseded.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function runSearch(
    query: string,
    apply: (r: Result[]) => void,
    setWorking?: (working: boolean) => void,
    setFailed?: (failed: boolean) => void
  ) {
    if (timer.current) clearTimeout(timer.current);
    const mine = ++seq.current;
    if (!query.trim()) {
      apply([]);
      setWorking?.(false);
      setFailed?.(false);
      return;
    }
    setWorking?.(true);
    setFailed?.(false);
    timer.current = setTimeout(async () => {
      try {
        const r = await searchPatientsForQueue(query);
        if (mine === seq.current) apply(r);
      } catch {
        if (mine === seq.current) {
          apply([]);
          setFailed?.(true);
        }
      } finally {
        if (mine === seq.current) setWorking?.(false);
      }
    }, 180);
  }

  function onSearch(v: string) {
    setQ(v);
    runSearch(v, setResults, setSearching, setSearchFailed);
  }

  function onPhone(v: string) {
    setPhone(v);
    const digits = v.replace(/\D/g, "");
    // only look once it's enough of a number to be a real match, not "9"
    runSearch(digits.length >= 6 ? digits : "", setDupes);
  }

  function flash(who: string) {
    setAdded(who);
    setTimeout(() => setAdded(null), 2500);
  }

  function resetNew() {
    setName("");
    setPhone("");
    setAge("");
    setSex("");
    setNote("");
    setDupes([]);
  }

  function add(p: Result) {
    start(async () => {
      await addToQueue(p.id, note.trim() || undefined);
      flash(p.name);
      setQ("");
      setResults([]);
      resetNew();
      setMode("search");
    });
  }

  function register(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("phone", phone.trim());
    fd.set("age", age.trim());
    fd.set("sex", sex);
    fd.set("note", note.trim());
    start(async () => {
      await staffRegisterAndQueue(fd);
      flash(name.trim());
      resetNew();
      setMode("search");
    });
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("search")}
          data-on={mode === "search"}
          className="chip inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px]"
        >
          <Search size={14} strokeWidth={2.2} /> Find patient
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          data-on={mode === "new"}
          className="chip inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px]"
        >
          <UserPlus size={14} strokeWidth={2.2} /> New patient
        </button>
      </div>

      {mode === "search" ? (
        <div>
          <input
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search name, phone, or file no."
            autoFocus
            className="field ring-focus w-full"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for visit (optional)"
            className="field ring-focus mt-2 w-full"
          />
          {searching && (
            <p className="t-cap mt-2 px-1 text-ink3">Looking for a match…</p>
          )}
          {q.trim() && !searching && searchFailed && (
            <div className="t-cap mt-2 flex items-center justify-between gap-3 rounded-2xl bg-buttersoft px-4 py-3 text-butter">
              <span>Couldn’t check patient records. Check the connection.</span>
              <button
                type="button"
                onClick={() => runSearch(q, setResults, setSearching, setSearchFailed)}
                className="shrink-0 font-semibold text-peri active:opacity-60"
              >
                Try again
              </button>
            </div>
          )}
          {q.trim() && !searching && !searchFailed && results.length === 0 ? (
            <button
              onClick={() => {
                setName(q.trim());
                setQ("");
                setResults([]);
                setMode("new");
              }}
              className="mt-2 flex w-full items-center gap-2 rounded-2xl border border-dashed border-hairline px-4 py-3 text-left text-ink3 active:bg-sunk"
            >
              <UserPlus size={15} className="shrink-0 text-peri" />
              <span className="t-cap">
                No match. Register <span className="font-semibold text-ink2">{q.trim()}</span> as a new patient
              </span>
            </button>
          ) : (
            results.length > 0 && (
              <div className="appear rows mt-2 overflow-hidden rounded-2xl border border-hairline">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => add(p)}
                    disabled={pending}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-sunk disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="t-body block truncate">{p.name}</span>
                      <span className="t-micro text-ink3">
                        #{p.fileNumber}
                        {ageSex(p) ? ` · ${ageSex(p)}` : ""}
                        {p.phone ? ` · ${p.phone}` : ""}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-peri">
                      <Plus size={16} strokeWidth={2.6} /> Add
                    </span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      ) : (
        <form onSubmit={register} className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Patient name"
            autoFocus
            className="field ring-focus w-full"
          />
          <input
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="Phone number"
            inputMode="tel"
            className="field ring-focus w-full"
          />

          {/* Same number already on file — almost always the same person or a
              family member sharing the handset. Offer to add the existing record
              so a second, empty history doesn't get started by accident. */}
          {dupes.length > 0 && (
            <div className="appear rounded-2xl bg-buttersoft p-2.5">
              <p className="t-micro mb-1.5 px-1 font-semibold text-butter">
                Already on this number — add them instead of a duplicate
              </p>
              <div className="rows overflow-hidden rounded-xl bg-surface">
                {dupes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => add(m)}
                    disabled={pending}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left active:bg-sunk disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="t-body block truncate">{m.name}</span>
                      <span className="t-micro text-ink3">
                        #{m.fileNumber}
                        {ageSex(m) ? ` · ${ageSex(m)}` : ""}
                      </span>
                    </span>
                    <span className="t-cap shrink-0 font-semibold text-peri">Add to queue</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Age"
              inputMode="numeric"
              className="field ring-focus w-full"
            />
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className="field ring-focus w-full appearance-none"
            >
              <option value="">Sex</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for visit (optional)"
            className="field ring-focus w-full"
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="btn btn-primary w-full py-3 disabled:opacity-50"
          >
            {dupes.length > 0 ? "Different person — register new" : "Register & add to queue"}
          </button>
        </form>
      )}

      {added && (
        <p className="t-cap mt-2.5 inline-flex items-center gap-1.5 text-jade">
          <Check size={14} strokeWidth={2.4} /> {added} added to the queue.
        </p>
      )}
    </div>
  );
}
