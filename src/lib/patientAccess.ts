import { db } from "@/lib/db";

// The Google-account → patient mapping. Server-only (imports db); never import
// from a client component.
//
// One Google account maps to MANY patients on purpose — one phone and one
// Google account per household is normal here. A binding is born "pending"
// because the plan link that authorised it is forwardable; only the doctor,
// on the chart, promotes it to "active", and only "active" bindings resolve a
// returning Google sign-in to a patient.

export type ResolvedPatient = {
  id: string;
  name: string;
  ageYears: number | null;
  sex: string | null;
  linkVersion: number;
};

/**
 * Record that a Google identity belongs to a patient. Idempotent via the
 * composite unique key. A re-bind only refreshes the email — it must NEVER
 * touch `status`, or a re-sign-in would silently re-activate a binding the
 * doctor revoked.
 */
export async function bindIdentity(input: {
  patientId: string;
  providerUserId: string;
  email: string | null;
}): Promise<void> {
  await db.patientAccess.upsert({
    where: {
      provider_providerUserId_patientId: {
        provider: "google",
        providerUserId: input.providerUserId,
        patientId: input.patientId,
      },
    },
    create: {
      patientId: input.patientId,
      provider: "google",
      providerUserId: input.providerUserId,
      email: input.email,
      status: "pending",
      boundVia: "plan_link",
    },
    update: { email: input.email },
  });
}

/**
 * The patients a returning Google account may open — ACTIVE bindings only.
 * Fails closed: an unknown identity returns [], never the whole panel.
 * Ordered most-recently-used first; note Postgres sorts NULLs first on DESC, so
 * `nulls: "last"` keeps a never-used binding from outranking a daily one.
 */
export async function patientsForIdentity(providerUserId: string): Promise<ResolvedPatient[]> {
  if (!providerUserId) return [];
  const rows = await db.patientAccess.findMany({
    where: { provider: "google", providerUserId, status: "active" },
    orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { boundAt: "asc" }],
    take: 8, // a Google account on >8 patients is link-harvesting, not a family
    select: {
      patient: {
        select: { id: true, name: true, ageYears: true, sex: true, linkVersion: true },
      },
    },
  });
  return rows.map((r) => r.patient);
}

/** Guard for the chooser: the selected patient must actually have an active
 *  binding to this identity, not merely be in the list the client was shown. */
export async function hasActiveAccess(providerUserId: string, patientId: string): Promise<boolean> {
  if (!providerUserId || !patientId) return false;
  const row = await db.patientAccess.findUnique({
    where: {
      provider_providerUserId_patientId: { provider: "google", providerUserId, patientId },
    },
    select: { status: true },
  });
  return row?.status === "active";
}

export async function touchIdentity(providerUserId: string, patientId: string): Promise<void> {
  await db.patientAccess
    .update({
      where: {
        provider_providerUserId_patientId: { provider: "google", providerUserId, patientId },
      },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // last-used is a nicety; never fail a sign-in over it
    });
}

/** Bindings on a patient's chart, for the doctor to confirm or remove. */
export async function accessForPatient(patientId: string) {
  return db.patientAccess.findMany({
    where: { patientId },
    orderBy: [{ status: "asc" }, { boundAt: "desc" }],
    select: {
      id: true,
      email: true,
      status: true,
      boundAt: true,
      confirmedAt: true,
      lastUsedAt: true,
    },
  });
}
