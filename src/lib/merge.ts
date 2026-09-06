import { db } from "@/lib/db";

// Merging two records for the same person. Everything clinical moves to the
// keeper — nothing is discarded, because a lost visit is a lost memory. The
// duplicate row is deleted only after its children have been reparented.
export async function mergePatients(keeperId: string, duplicateId: string) {
  if (keeperId === duplicateId) throw new Error("cannot merge a record into itself");

  const [keeper, duplicate] = await Promise.all([
    db.patient.findUnique({ where: { id: keeperId } }),
    db.patient.findUnique({
      where: { id: duplicateId },
      include: { conditions: true, allergies: true },
    }),
  ]);
  if (!keeper || !duplicate) throw new Error("both records must exist");

  const keeperConditions = await db.condition.findMany({ where: { patientId: keeperId } });
  const keeperAllergies = await db.allergy.findMany({ where: { patientId: keeperId } });
  const keeperAccess = await db.patientAccess.findMany({ where: { patientId: keeperId } });
  const norm = (s: string) => s.trim().toLowerCase();
  const haveCondition = new Set(keeperConditions.map((c) => norm(c.name)));
  const haveAllergy = new Set(keeperAllergies.map((a) => norm(a.substance)));
  // A shared family Google account bound to both records is exactly what merge
  // exists to clean up, so reparenting it wholesale would trip the composite
  // unique and abort the transaction. Dedupe like conditions/allergies.
  const haveIdentity = new Set(keeperAccess.map((a) => `${a.provider}:${a.providerUserId}`));
  const duplicateAccess = await db.patientAccess.findMany({ where: { patientId: duplicateId } });

  await db.$transaction(async (tx) => {
    // clinical history: move wholesale
    await tx.visit.updateMany({ where: { patientId: duplicateId }, data: { patientId: keeperId } });
    await tx.observation.updateMany({ where: { patientId: duplicateId }, data: { patientId: keeperId } });
    await tx.report.updateMany({ where: { patientId: duplicateId }, data: { patientId: keeperId } });
    await tx.carePlanTask.updateMany({ where: { patientId: duplicateId }, data: { patientId: keeperId } });
    await tx.medicalDocument.updateMany({
      where: { patientId: duplicateId },
      data: { patientId: keeperId },
    });

    // problem list / allergies: move only what the keeper lacks, so the
    // merged chart doesn't list "Type 2 Diabetes" twice
    for (const c of duplicate.conditions) {
      if (haveCondition.has(norm(c.name))) {
        await tx.condition.delete({ where: { id: c.id } });
      } else {
        await tx.condition.update({ where: { id: c.id }, data: { patientId: keeperId } });
      }
    }
    for (const a of duplicate.allergies) {
      if (haveAllergy.has(norm(a.substance))) {
        await tx.allergy.delete({ where: { id: a.id } });
      } else {
        await tx.allergy.update({ where: { id: a.id }, data: { patientId: keeperId } });
      }
    }
    // linked Google accounts: move only identities the keeper doesn't already
    // have, so the unique (provider, providerUserId, patientId) never collides
    for (const a of duplicateAccess) {
      if (haveIdentity.has(`${a.provider}:${a.providerUserId}`)) {
        await tx.patientAccess.delete({ where: { id: a.id } });
      } else {
        await tx.patientAccess.update({ where: { id: a.id }, data: { patientId: keeperId } });
      }
    }

    // front-desk queue: move the duplicate's entries onto the keeper — the
    // Cascade on the patient row would otherwise delete a waiting walk-in the
    // moment we merge — then collapse a double check-in to the earliest arrival.
    await tx.queueEntry.updateMany({ where: { patientId: duplicateId }, data: { patientId: keeperId } });
    const waiting = await tx.queueEntry.findMany({
      where: { patientId: keeperId, status: "waiting" },
      orderBy: { arrivedAt: "asc" },
      select: { id: true },
    });
    if (waiting.length > 1) {
      await tx.queueEntry.deleteMany({ where: { id: { in: waiting.slice(1).map((e) => e.id) } } });
    }

    // demographics: never overwrite the keeper, only fill its blanks
    const notes = [keeper.stickyNote, duplicate.stickyNote].filter(Boolean) as string[];
    // plan engagement is cumulative for the same person: sum the counters, keep
    // the widest open window, and carry the more recent follow-up reply as an
    // intact (kind, at) pair — so a merge never silently loses that the patient
    // opened their plan or answered "not coming".
    const earliest = (a: Date | null, b: Date | null) => (a && b ? (a < b ? a : b) : a ?? b);
    const latest = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : a ?? b);
    const replyFromDup =
      !!duplicate.planReplyAt && (!keeper.planReplyAt || duplicate.planReplyAt > keeper.planReplyAt);
    await tx.patient.update({
      where: { id: keeperId },
      data: {
        phone: keeper.phone ?? duplicate.phone,
        sex: keeper.sex ?? duplicate.sex,
        dob: keeper.dob ?? duplicate.dob,
        ageYears: keeper.ageYears ?? duplicate.ageYears,
        address: keeper.address ?? duplicate.address,
        abhaId: keeper.abhaId ?? duplicate.abhaId,
        reportedMedications: keeper.reportedMedications ?? duplicate.reportedMedications,
        historyUpdatedAt: latest(keeper.historyUpdatedAt, duplicate.historyUpdatedAt),
        stickyNote: notes.length > 0 ? [...new Set(notes)].join(" · ") : null,
        planFirstOpenedAt: earliest(keeper.planFirstOpenedAt, duplicate.planFirstOpenedAt),
        planLastOpenedAt: latest(keeper.planLastOpenedAt, duplicate.planLastOpenedAt),
        planOpenCount: keeper.planOpenCount + duplicate.planOpenCount,
        planSharedAt: latest(keeper.planSharedAt, duplicate.planSharedAt),
        planShareCount: keeper.planShareCount + duplicate.planShareCount,
        planReplyAt: replyFromDup ? duplicate.planReplyAt : keeper.planReplyAt,
        planReplyKind: replyFromDup ? duplicate.planReplyKind : keeper.planReplyKind,
        updatedAt: new Date(),
      },
    });

    await tx.patient.delete({ where: { id: duplicateId } });
  });

  return keeperId;
}
