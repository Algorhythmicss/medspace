"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";

type Result = {
  id: string;
  fileNumber: number;
  name: string;
  phone: string | null;
  sex: string | null;
  ageYears: number | null;
  conditions: string[];
  lastVisit: string | null;
};

function relDay(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days < 45) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus only where a keyboard exists; on a phone it would throw the
    // on-screen keyboard up the moment the app opens.
    if (window.matchMedia("(min-width: 1024px)").matches) inputRef.current?.focus();
  }, []);

  // ⌘K / Ctrl-K jumps to search from anywhere, and Escape releases it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setResults(data.patients);
      } catch {
        // aborted or offline — keep last results
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink3"
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) {
              router.push(`/patients/${results[0].id}`);
            }
          }}
          placeholder="Name, phone, or file no."
          inputMode="search"
          className="field ring-focus t-bodyL !bg-surface !py-3 !pl-11 !pr-14"
        />
        {loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink3">
            …
          </span>
        ) : (
          <span className="kbd pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 lg:block">
            ⌘K
          </span>
        )}
      </div>

      {results.length > 0 && (
        <div className="rows card mt-2 overflow-hidden shadow-[var(--lift-lg)]">
          {results.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              prefetch
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-opacity active:opacity-60"
            >
              <div className="min-w-0">
                <div className="t-bodyL truncate">
                  {p.name}
                  <span className="t-cap ml-2 text-ink3">#{p.fileNumber}</span>
                </div>
                <div className="t-cap truncate text-ink3">
                  {[
                    [p.ageYears, p.sex].filter(Boolean).join(" "),
                    p.conditions.join(", "),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="t-micro shrink-0 text-right text-ink3">
                {p.lastVisit ? <>last {relDay(p.lastVisit)}</> : "new"}
              </div>
            </Link>
          ))}
        </div>
      )}

      {q.trim() && !loading && results.length === 0 && (
        <p className="mt-3 text-center text-[15px] text-ink2">
          No match.{" "}
          <Link href="/patients/new" className="font-medium text-peri">
            Add new patient
          </Link>
        </p>
      )}
    </div>
  );
}
