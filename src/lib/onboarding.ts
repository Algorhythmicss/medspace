export type HistoryReviewDecision = "accept" | "dismiss";

export type HistorySubmissionFields = {
  conditions: string;
  allergies: string;
  medications: string;
  note: string;
};

export function historySubmissionSummary(fields: HistorySubmissionFields) {
  return [
    fields.conditions ? `Known conditions: ${fields.conditions}` : "",
    fields.allergies ? `Allergies: ${fields.allergies}` : "",
    fields.medications ? `Current medicines: ${fields.medications}` : "",
    fields.note ? `Patient note: ${fields.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function historyTerms(value: string | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  return value
    .split(/[\n,;]+/)
    .map((term) => term.trim())
    .filter((term) => {
      if (!term) return false;
      const key = term.toLocaleLowerCase("en-IN");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

export function combinedMedicationHistory(existing: string | null, incoming: string | null) {
  const lines = [existing, incoming]
    .filter(Boolean)
    .flatMap((value) => value!.split("\n"))
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return lines
    .filter((line) => {
      const key = line.toLocaleLowerCase("en-IN");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n")
    .slice(0, 2500);
}

export function historyReviewPromotion(input: {
  decision: HistoryReviewDecision;
  existingConditions: string[];
  existingAllergies: string[];
  existingMedications: string | null;
  reportedConditions: string | null;
  reportedAllergies: string | null;
  reportedMedications: string | null;
}) {
  if (input.decision === "dismiss") {
    return {
      applied: false as const,
      conditionsToAdd: [] as string[],
      allergiesToAdd: [] as string[],
      medicationHistory: input.existingMedications,
    };
  }

  const conditionKeys = new Set(
    input.existingConditions.map((value) => value.trim().toLocaleLowerCase("en-IN"))
  );
  const allergyKeys = new Set(
    input.existingAllergies.map((value) => value.trim().toLocaleLowerCase("en-IN"))
  );
  return {
    applied: true as const,
    conditionsToAdd: historyTerms(input.reportedConditions).filter(
      (value) => !conditionKeys.has(value.toLocaleLowerCase("en-IN"))
    ),
    allergiesToAdd: historyTerms(input.reportedAllergies).filter(
      (value) => !allergyKeys.has(value.toLocaleLowerCase("en-IN"))
    ),
    medicationHistory: combinedMedicationHistory(
      input.existingMedications,
      input.reportedMedications
    ),
  };
}
