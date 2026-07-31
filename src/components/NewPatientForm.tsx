"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPatient } from "@/app/actions";

type Match = { id: string; name: string; fileNumber: number; ageYears: number | null; sex: string | null };

const fieldCls =
  "w-full rounded-xl bg-sunk px-3.5 py-3 text-[17px] outline-none placeholder:text-ink2";

export default function NewPatientForm() {
  const [phone, setPhone] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);

  // One person, one memory: an existing record on this phone is almost always
  // the same patient (or a family member sharing the handset) — show it before
  // a second, empty history gets started.
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 6) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(digits)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setMatches(data.patients ?? []);
      } catch {
        // aborted or offline
      }
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [phone]);

  return (
    <>
      {matches.length > 0 && (
        <div className="mb-3 rounded-2xl bg-warnsoft p-3">
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-warn">
            Already on this number
          </p>
          <div className="rows overflow-hidden rounded-xl bg-surface">
            {matches.map((m) => (
              <Link
                key={m.id}
                href={`/patients/${m.id}`}
                className="flex items-center justify-between px-3 py-2.5 active:bg-black/5"
              >
                <span className="text-[15px]">
                  {m.name}
                  <span className="ml-2 text-[13px] text-ink2">
                    {[m.ageYears, m.sex].filter(Boolean).join(" ")}
                  </span>
                </span>
                <span className="text-[13px] font-medium text-primary">Open</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <form action={createPatient} className="space-y-2.5">
        <input name="name" required placeholder="Full name" className={fieldCls} />
        <input
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (WhatsApp)"
          inputMode="tel"
          className={fieldCls}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <input name="age" placeholder="Age" inputMode="numeric" className={fieldCls} />
          <select
            name="sex"
            defaultValue=""
            className="w-full appearance-none rounded-xl bg-sunk px-3.5 py-3 text-[17px] outline-none"
          >
            <option value="" disabled>
              Sex
            </option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </select>
        </div>
        <button
          type="submit"
          className="mt-2 w-full rounded-2xl bg-primary py-3.5 text-[17px] font-semibold text-white active:opacity-80"
        >
          Add patient
        </button>
      </form>
    </>
  );
}
