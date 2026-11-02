// Database behavior test for staged history review. Run only against the local
// Docker dev database after migrations; it creates and removes its own patient.
import "dotenv/config";
import { db } from "../src/lib/db";
import { reviewHistorySubmission } from "../src/lib/historyReview";
import { saveReport } from "../src/lib/reports";

function expect(condition: boolean, label: string) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else console.log(`ok: ${label}`);
}

async function main() {
  const max = await db.patient.aggregate({ _max: { fileNumber: true } });
  const patient = await db.patient.create({
    data: {
      fileNumber: (max._max.fileNumber ?? 100) + 1,
      name: "Onboarding Test Patient",
      reportedMedications: "Metformin 500mg",
      conditions: { create: { name: "Diabetes", status: "active" } },
    },
  });

  try {
    const acceptedReport = await saveReport({
      patientId: patient.id,
      title: "Patient supplied prescription",
      kind: "outside_rx",
      reportDate: new Date(),
      summary: "staged",
      values: [{ type: "HBA1C", value: 8.2 }],
      source: "patient",
      expectedLinkVersion: patient.linkVersion,
      reviewStatus: "pending",
      reportedConditions: "diabetes, Hypertension",
      reportedAllergies: "Sulfa",
      reportedMedications: "metformin 500mg\nAmlodipine 5mg",
    });

    expect(acceptedReport.reviewStatus === "pending", "patient history starts pending");
    expect(
      (await db.observation.count({ where: { patientId: patient.id, type: "HBA1C" } })) === 0,
      "pending history cannot create a clinical trend"
    );
    expect(
      (await db.condition.count({ where: { patientId: patient.id } })) === 1,
      "pending conditions do not enter the chart"
    );

    const accepted = await reviewHistorySubmission(acceptedReport.id, "accept");
    expect(accepted.changed, "doctor acceptance changes the staged report once");
    const afterAccept = await db.patient.findUnique({
      where: { id: patient.id },
      include: { conditions: true, allergies: true, reports: true },
    });
    expect(
      afterAccept?.conditions.map((condition) => condition.name).sort().join("|") ===
        "Diabetes|Hypertension",
      "accept promotes only missing conditions"
    );
    expect(afterAccept?.allergies[0]?.substance === "Sulfa", "accept promotes allergies");
    expect(
      afterAccept?.reportedMedications === "Metformin 500mg\nAmlodipine 5mg",
      "accept merges reported medicines without overwriting"
    );
    expect(
      afterAccept?.reports.find((report) => report.id === acceptedReport.id)?.reviewStatus ===
        "verified",
      "accepted report becomes verified"
    );
    expect(afterAccept?.historyUpdatedAt != null, "accept marks baseline history ready");

    const secondDecision = await reviewHistorySubmission(
      acceptedReport.id,
      "dismiss",
      new Date()
    );
    expect(!secondDecision.changed, "a second decision cannot overwrite the first");

    await db.queueEntry.create({ data: { patientId: patient.id } });
    const dismissedReport = await saveReport({
      patientId: patient.id,
      title: "Unreliable recollection",
      kind: "other",
      reportDate: new Date(),
      values: [],
      source: "staff",
      reviewStatus: "pending",
      reportedConditions: "Asthma",
      reportedMedications: "Unknown tablet",
    });
    const dismissed = await reviewHistorySubmission(
      dismissedReport.id,
      "dismiss",
      new Date()
    );
    expect(dismissed.changed, "doctor can dismiss a separate staged report");
    const afterDismiss = await db.patient.findUnique({
      where: { id: patient.id },
      include: { conditions: true },
    });
    expect(
      !afterDismiss?.conditions.some((condition) => condition.name === "Asthma"),
      "dismiss never promotes staged conditions"
    );
    expect(
      !afterDismiss?.reportedMedications?.includes("Unknown tablet"),
      "dismiss never promotes staged medicines"
    );
  } finally {
    await db.patient.delete({ where: { id: patient.id } }).catch(() => {});
  }

  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}

main().finally(() => db.$disconnect());
