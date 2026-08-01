"use client";

import { useState, useTransition } from "react";
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

// The front-desk intake: find an existing patient and add them to today's
// queue, or register a walk-in on the spot. No clinical data is ever shown or
// touched — this is who arrived, not why.
export default function QueueDesk() {
  const [mode, setMode] = useState<"search" | "new">("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onSearch(v: string) {
    setQ(v);
    if (!v.trim()) return setResults([]);
    setResults(await searchPatientsForQueue(v));
  }

  function flash(who: string) {
    setAdded(who);
    setTimeout(() => setAdded(null), 2500);
  }

  function add(p: Result) {
    start(async () => {
      await addToQueue(p.id, note.trim() || undefined);
      flash(p.name);
      setQ("");
      setResults([]);
      setNote("");
    });
  }

  function register(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("phone", phone.trim());
    fd.set("note", note.trim());
    start(async () => {
      await staffRegisterAndQueue(fd);
      flash(name.trim());
      setName("");
      setPhone("");
      setNote("");
      setMode("search");
    });
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setMode("search")}
          data-on={mode === "search"}
          className="chip inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px]"
        >
          <Search size={14} strokeWidth={2.2} /> Find patient
        </button>
        <button
          onClick={() => setMode("new")}
          data-on={mode === "new"}
          className="chip inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px]"
        >
          <UserPlus size={14} strokeWidth={2.2} /> New patient
        </button>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason for visit (optional)"
        className="field ring-focus mb-2 w-full"
      />

      {mode === "search" ? (
        <div>
          <input
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Name, phone, or file no."
            autoFocus
            className="field ring-focus w-full"
          />
          {results.length > 0 && (
            <div className="rows mt-2 overflow-hidden rounded-2xl border border-hairline">
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
                      {p.ageYears != null || p.sex ? ` · ${[p.ageYears, p.sex].filter(Boolean).join(" ")}` : ""}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </span>
                  </span>
                  <Plus size={18} strokeWidth={2.4} className="shrink-0 text-peri" />
                </button>
              ))}
            </div>
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
          <div className="flex gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              inputMode="tel"
              className="field ring-focus min-w-0 flex-1"
            />
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="btn btn-primary shrink-0 px-5 disabled:opacity-50"
            >
              Add
            </button>
          </div>
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
