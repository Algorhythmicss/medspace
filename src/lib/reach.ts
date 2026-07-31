import { relDay } from "@/lib/format";

// Does the WhatsApp channel actually work for this patient?
//
// The follow-up loop is the product's wedge, and it runs entirely over a link
// the doctor sends. So the question that matters per patient is not "did we
// message them" but "do they ever open it" — the field evidence is that reach,
// not sending, is the binding constraint (SPRINT India: 17% acknowledged
// receipt; 99DOTS: 33% ever used it). A patient who has been sent the link
// twice and never opened it needs a phone call, not a third link.
//
// Deterministic and pure, like memory.ts — no LLM, testable, and the same
// answer on the chart, the follow-up list and any later report.

export type ReachState =
  | "never" // link never sent
  | "waiting" // sent recently, no open yet — normal, give it time
  | "opened" // they have opened it at least once
  | "silent"; // sent enough, long enough ago, still nothing

export type PlanReach = {
  state: ReachState;
  label: string;
  tone: "ok" | "warn" | "muted";
  /** WhatsApp is not reaching this patient — phone them instead. */
  callFirst: boolean;
};

/** Sent this many times with no open at all — stop sending, start calling. */
const SILENT_AFTER_SENDS = 2;
/** Or a single send this old with no open. */
const SILENT_AFTER_DAYS = 3;

export type ReachInput = {
  planShareCount: number;
  planSharedAt: Date | null;
  planOpenCount: number;
  planLastOpenedAt: Date | null;
};

export function planReach(p: ReachInput, now = new Date()): PlanReach {
  if (p.planOpenCount > 0) {
    return {
      state: "opened",
      label: p.planLastOpenedAt
        ? `Opened ${relDay(p.planLastOpenedAt, now)}`
        : "Opened",
      tone: "ok",
      callFirst: false,
    };
  }

  if (p.planShareCount === 0 || !p.planSharedAt) {
    return {
      state: "never",
      label: "Link not sent yet",
      tone: "muted",
      callFirst: false,
    };
  }

  const days = Math.floor(
    (now.getTime() - p.planSharedAt.getTime()) / 86400000
  );
  const silent =
    p.planShareCount >= SILENT_AFTER_SENDS || days >= SILENT_AFTER_DAYS;

  if (silent) {
    return {
      state: "silent",
      label:
        p.planShareCount > 1
          ? `Sent ${p.planShareCount}× · never opened`
          : `Sent ${relDay(p.planSharedAt, now)} · never opened`,
      tone: "warn",
      callFirst: true,
    };
  }

  return {
    state: "waiting",
    label: `Sent ${relDay(p.planSharedAt, now)} · not opened yet`,
    tone: "muted",
    callFirst: false,
  };
}
