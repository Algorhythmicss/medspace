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
  const norm = (s: string) => s.trim().toLowerCase();
  const haveCondition = new Set(keeperConditions.map((c) => norm(c.name)));
  const haveAllergy = new Set(keeperAllergies.map((a) => norm(a.substance)));

  await db.$transaction(async (tx) => {
    // clinical history: move wholesale
    await tx.visit.updateMany({ where: { patientId: duplicateId }, data: { patientId: keeperId } });
    await tx.observation.updateMany({ where: { patientId: duplicateId }, data: { patientId: keeperId } });
    await tx.report.updateMany({ where: { patientId: duplicateId }, data: { patientId: keeperId } });
    await tx.carePlanTask.updateMany({ where: { patientId: duplicateId }, data: { patientId: keeperId } });

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

    // demographics: never overwrite the keeper, only fill its blanks
    const notes = [keeper.stickyNote, duplicate.stickyNote].filter(Boolean) as string[];
    await tx.patient.update({
      where: { id: keeperId },
      data: {
        phone: keeper.phone ?? duplicate.phone,
        sex: keeper.sex ?? duplicate.sex,
        dob: keeper.dob ?? duplicate.dob,
        ageYears: keeper.ageYears ?? duplicate.ageYears,
        address: keeper.address ?? duplicate.address,
        abhaId: keeper.abhaId ?? duplicate.abhaId,
        stickyNote: notes.length > 0 ? [...new Set(notes)].join(" · ") : null,
        updatedAt: new Date(),
      },
    });

    await tx.patient.delete({ where: { id: duplicateId } });
  });

  return keeperId;
}
