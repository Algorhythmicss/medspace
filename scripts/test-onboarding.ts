import {
  combinedMedicationHistory,
  historyReviewPromotion,
  historySubmissionSummary,
  historyTerms,
} from "../src/lib/onboarding";

function expect(condition: boolean, label: string) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else console.log(`ok: ${label}`);
}

const summary = historySubmissionSummary({
  conditions: "Diabetes",
  allergies: "Penicillin",
  medications: "Metformin 500mg",
  note: "Old prescription attached",
});
expect(summary.includes("Known conditions: Diabetes"), "submission summary labels conditions");
expect(summary.includes("Patient note: Old prescription attached"), "submission summary keeps context");

expect(
  historyTerms("Diabetes, diabetes; Hypertension\nHYPERTENSION").join("|") ===
    "Diabetes|Hypertension",
  "history terms deduplicate case-insensitively"
);

const dismissed = historyReviewPromotion({
  decision: "dismiss",
  existingConditions: ["Diabetes"],
  existingAllergies: ["Penicillin"],
  existingMedications: "Metformin 500mg",
  reportedConditions: "Hypertension",
  reportedAllergies: "Sulfa",
  reportedMedications: "Amlodipine 5mg",
});
expect(!dismissed.applied, "dismiss is explicitly non-promoting");
expect(dismissed.conditionsToAdd.length === 0, "dismiss adds no condition");
expect(dismissed.allergiesToAdd.length === 0, "dismiss adds no allergy");
expect(dismissed.medicationHistory === "Metformin 500mg", "dismiss preserves medication history");

const accepted = historyReviewPromotion({
  decision: "accept",
  existingConditions: ["Diabetes"],
  existingAllergies: ["Penicillin"],
  existingMedications: "Metformin 500mg",
  reportedConditions: "diabetes, Hypertension",
  reportedAllergies: "PENICILLIN; Sulfa",
  reportedMedications: "metformin 500mg\nAmlodipine 5mg",
});
expect(accepted.applied, "accept creates a promotion plan");
expect(accepted.conditionsToAdd.join("|") === "Hypertension", "accept adds only missing conditions");
expect(accepted.allergiesToAdd.join("|") === "Sulfa", "accept adds only missing allergies");
expect(
  accepted.medicationHistory === "Metformin 500mg\nAmlodipine 5mg",
  "accept appends medicines without overwriting or duplicating"
);

const manyTerms = Array.from({ length: 35 }, (_, index) => `Condition ${index}`).join(",");
expect(historyTerms(manyTerms).length === 30, "one submission can promote at most 30 terms");

const longMedication = "x".repeat(2600);
expect(
  combinedMedicationHistory(null, longMedication).length === 2500,
  "medication history stays inside the database bound"
);

console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
