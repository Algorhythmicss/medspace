export type QueueStatus =
  | "waiting"
  | "called"
  | "in_consultation"
  | "completed"
  | "cancelled"
  | "seen"
  | "expired";
export type QueueItem = {
  id: string;
  patientId: string;
  name: string;
  fileNumber: number;
  ageYears: number | null;
  sex: string | null;
  number: number | null;
  dayKey: string | null;
  status: QueueStatus;
  arrivedAt: string;
  queuedAt: string;
  calledAt: string | null;
  startedAt: string | null;
  revision: number;
  vitalsReady: boolean;
  assessmentsToReview?: number;
  photosToReview?: number;
  vitals?: {
    bpSys: number | null;
    bpDia: number | null;
    pulse: number | null;
    weight: number | null;
    tempF: number | null;
  };
};
export type LiveSettings = { averageMinutes: number | null; paused: boolean };
export type MediaItem = {
  id: string;
  kind: "progress_photo" | "doctor_audio";
  name: string;
  mime: string;
  size: number;
  durationMs: number | null;
  createdAt: string;
  reviewedAt: string | null;
  sharedAt: string | null;
};
export type PhotoRequest = {
  id: string;
  taskId: string | null;
  instructions: string;
  maximumPhotos: number;
  status: string;
  dueAt: string | null;
  files: MediaItem[];
};
export type PatientQueue = {
  entry: Pick<QueueItem, "id" | "number" | "dayKey" | "status"> | null;
  position: number | null;
  ahead: number | null;
  estimateMinutes: number | null;
};
export type ClinicSnapshot = {
  role: "doctor" | "staff" | "patient";
  revision: number;
  serverTime: string;
  contentVersion?: string;
  dayKey: string;
  settings: LiveSettings;
  entries?: QueueItem[];
  patientQueue?: PatientQueue;
  photoRequests?: PhotoRequest[];
  messages?: MediaItem[];
  care?: {
    patientId: string;
    patientName: string;
    photoRequests: PhotoRequest[];
    messages: MediaItem[];
    followups: Array<{ id: string; title: string; dueAt: string | null }>;
  };
};
export type ClinicActor =
  | { kind: "doctor" | "staff" }
  | { kind: "patient"; patientId: string; version: number };

export class ClinicError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const ACTIVE_QUEUE = ["waiting", "called", "in_consultation"] as const;
export function clinicDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function clinicDayStart(now = new Date()): Date {
  return new Date(`${clinicDay(now)}T00:00:00+05:30`);
}
export function isDoctorSlot(status: string) {
  return status === "called" || status === "in_consultation";
}
export function queueOrder(entries: QueueItem[]): QueueItem[] {
  const chosen = new Map<string, QueueItem>();
  for (const entry of entries) {
    const prior = chosen.get(entry.patientId);
    if (
      !prior ||
      (isDoctorSlot(entry.status) && !isDoctorSlot(prior.status)) ||
      (!isDoctorSlot(prior.status) &&
        entry.dayKey !== null &&
        prior.dayKey === null)
    )
      chosen.set(entry.patientId, entry);
  }
  const ordered = [...chosen.values()].sort(
    (a, b) =>
      Number(isDoctorSlot(b.status)) - Number(isDoctorSlot(a.status)) ||
      new Date(a.dayKey ? a.queuedAt : a.arrivedAt).getTime() -
        new Date(b.dayKey ? b.queuedAt : b.arrivedAt).getTime() ||
      a.id.localeCompare(b.id),
  );
  // A legacy duplicate arrival is still one person. Do not invent a second
  // place or change historical records just to render the live projection.
  const seen = new Set<string>();
  return ordered.filter((entry) => {
    if (seen.has(entry.patientId)) return false;
    seen.add(entry.patientId);
    return true;
  });
}
export function patientQueue(
  entries: QueueItem[],
  own: QueueItem | null,
  settings: LiveSettings,
  now = new Date(),
): PatientQueue {
  const entry = own
    ? { id: own.id, number: own.number, dayKey: own.dayKey, status: own.status }
    : null;
  const position = own
    ? entries.findIndex((item) => item.id === own.id) + 1
    : 0;
  if (!own || position === 0)
    return { entry, position: null, ahead: null, estimateMinutes: null };
  const ahead = position - 1;
  if (settings.paused || !settings.averageMinutes || own.status !== "waiting")
    return { entry, position, ahead, estimateMinutes: null };
  const average = settings.averageMinutes;
  const block = average + Math.max(5, Math.ceil(average * 0.5));
  let minutes = 0;
  for (const item of entries.slice(0, ahead)) {
    if (item.status === "in_consultation" && item.startedAt) {
      const elapsed = Math.max(
        0,
        (now.getTime() - new Date(item.startedAt).getTime()) / 60000,
      );
      minutes += Math.max(Math.ceil(average * 0.5), block - elapsed);
    } else minutes += block;
  }
  return {
    entry,
    position,
    ahead,
    estimateMinutes: Math.ceil(minutes / 5) * 5,
  };
}
export function etaLabel(minutes: number | null): string {
  if (minutes === null) return "Estimate unavailable";
  if (minutes === 0) return "You’re next";
  if (minutes >= 1440) return "Long wait — check with the clinic";
  return `About ${minutes} min`;
}
export function commandId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ClinicError(400, "command_id", "Reload this page and try again.");
  return value.toLowerCase();
}
// Existing SQL imports use short IDs; shape validation is not authorization.
export function recordId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value))
    throw new ClinicError(400, "record_id", "That record could not be found.");
  return value;
}
