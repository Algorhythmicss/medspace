import {
  normalizePrescriptionSet,
  type PrescriptionSetInput,
} from "../src/lib/prescriptionSets";
import {
  medicalDocumentDraft,
  normalizeMedicalDocument,
} from "../src/lib/medicalDocuments";
import { normalizeVisitInput } from "../src/lib/visitInput";
import { latestVisitPerPatient } from "../src/lib/recentVisits";

function expect(condition: boolean, label: string) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else console.log(`ok: ${label}`);
}

const baseSet: PrescriptionSetInput = {
  name: "  DM Review  ",
  items: [
    {
      drugName: "  Tab Metformin 500mg ",
      frequency: "1-0-1",
      duration: "30 days",
      instructions: "after food",
    },
  ],
  advice: " Walk daily ",
  followUpInDays: 30,
  labTasks: ["HbA1c", "hba1c", "KFT"],
};
const set = normalizePrescriptionSet(baseSet);
expect(set.ok, "valid saved prescription set is accepted");
if (set.ok) {
  expect(set.value.name === "DM Review", "saved set name is trimmed");
  expect(set.value.nameKey === "dm review", "saved set gets a case-insensitive key");
  expect(set.value.items[0]?.drugName === "Tab Metformin 500mg", "medicine is normalized");
  expect(set.value.labTasks.join("|") === "HbA1c|KFT", "lab tasks deduplicate case-insensitively");
  expect(set.value.followUpInDays === 30, "valid follow-up timing is kept");
}

expect(
  !normalizePrescriptionSet({ name: "Empty", items: [] }).ok,
  "a set without medicine is rejected"
);
const tooLongFollowUp = normalizePrescriptionSet({ ...baseSet, followUpInDays: 900 });
expect(
  tooLongFollowUp.ok && tooLongFollowUp.value.followUpInDays === null,
  "unsafe follow-up timing is not stored"
);
const tooManyItems = normalizePrescriptionSet({
  ...baseSet,
  items: Array.from({ length: 20 }, (_, index) => ({
    drugName: `Drug ${index}`,
    frequency: "OD",
  })),
});
expect(tooManyItems.ok && tooManyItems.value.items.length === 12, "saved sets are capped at 12 medicines");

const certificate = normalizeMedicalDocument({
  patientId: "patient-1",
  visitId: "visit-1",
  kind: "sick_leave",
  title: "Sick leave certificate",
  body: "The patient was examined and advised rest.",
  validFrom: "2026-09-06",
  validUntil: "2026-09-08",
});
expect(certificate.ok, "valid sick-leave certificate is accepted");
expect(
  !normalizeMedicalDocument({
    patientId: "patient-1",
    kind: "sick_leave",
    title: "Sick leave certificate",
    body: "The patient was examined and advised rest.",
    validFrom: "2026-09-08",
    validUntil: "2026-09-06",
  }).ok,
  "certificate end date cannot precede start date"
);
expect(
  !normalizeMedicalDocument({
    patientId: "patient-1",
    kind: "prescription",
    title: "Wrong type",
    body: "This body is long enough to pass the body validation.",
  }).ok,
  "unknown document kind is rejected"
);
expect(
  !normalizeMedicalDocument({
    patientId: "patient-1",
    kind: "fitness",
    title: "Fitness certificate",
    body: "The patient was examined and is clinically fit.",
  }).ok,
  "fitness certificate requires an effective date"
);

const referral = medicalDocumentDraft({
  kind: "referral",
  patientName: "Ramesh Gupta",
  clinicName: "Clinic",
  examinedOn: "6 September 2026",
  validFrom: "",
  validUntil: "",
  complaint: "persistent cough",
  diagnosis: "further evaluation required",
});
expect(referral.includes("persistent cough"), "referral template uses reviewed visit context");
expect(referral.includes("[add reason"), "referral template requires doctor-authored reason");

const visit = normalizeVisitInput({
  patientId: " patient-1 ",
  complaint: "  Review after fever  ",
  diagnosis: " Viral syndrome ",
  vitals: { bpSys: 120, bpDia: 80, pulse: 72, weight: 65.5, tempF: 98.6 },
  items: [
    { drugName: " Paracetamol 500mg ", frequency: " SOS ", duration: " 3 days " },
  ],
  advice: " Hydration ",
  followUpInDays: 7,
  labTasks: ["CBC", "cbc", " CRP "],
});
expect(visit.ok, "valid visit payload is accepted");
if (visit.ok) {
  expect(visit.value.patientId === "patient-1", "visit patient id is normalized");
  expect(visit.value.items[0]?.drugName === "Paracetamol 500mg", "visit medicine is normalized");
  expect(visit.value.labTasks.join("|") === "CBC|CRP", "visit lab tasks deduplicate");
  expect(visit.value.vitals.weight === 65.5, "valid decimal vital is preserved");
}
expect(
  !normalizeVisitInput({
    patientId: "patient-1",
    vitals: { bpSys: 900 },
    items: [],
    labTasks: [],
  }).ok,
  "implausible visit vital is rejected"
);
const untrustedVisit = normalizeVisitInput({
  patientId: "patient-1",
  items: Array.from({ length: 30 }, (_, index) => ({
    drugName: `Medicine ${index}`,
    frequency: "OD",
  })),
  followUpInDays: 900,
  labTasks: Array.from({ length: 30 }, (_, index) => `Lab ${index}`),
});
expect(
  untrustedVisit.ok &&
    untrustedVisit.value.items.length === 24 &&
    untrustedVisit.value.labTasks.length === 20 &&
    untrustedVisit.value.followUpInDays === null,
  "untrusted visit arrays and follow-up timing are bounded"
);

const newestVisits = latestVisitPerPatient([
  { id: "new-a", patient: { id: "a" } },
  { id: "new-b", patient: { id: "b" } },
  { id: "old-a", patient: { id: "a" } },
]);
expect(
  newestVisits.map((item) => item.id).join("|") === "new-a|new-b",
  "recent-patient deduplication keeps each patient's newest visit"
);

console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
