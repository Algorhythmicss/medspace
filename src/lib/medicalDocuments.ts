export const MEDICAL_DOCUMENT_KINDS = ["sick_leave", "fitness", "referral", "other"] as const;
export type MedicalDocumentKind = (typeof MEDICAL_DOCUMENT_KINDS)[number];

export type MedicalDocumentInput = {
  patientId: string;
  visitId?: string;
  kind: string;
  title: string;
  body: string;
  recipient?: string;
  validFrom?: string;
  validUntil?: string;
};

export type NormalizedMedicalDocument = {
  patientId: string;
  visitId: string | null;
  kind: MedicalDocumentKind;
  title: string;
  body: string;
  recipient: string | null;
  validFrom: string | null;
  validUntil: string | null;
};

export const MEDICAL_DOCUMENT_LABELS: Record<MedicalDocumentKind, string> = {
  sick_leave: "Sick leave certificate",
  fitness: "Fitness certificate",
  referral: "Referral letter",
  other: "Medical letter",
};

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeMedicalDocument(
  input: MedicalDocumentInput
): { ok: true; value: NormalizedMedicalDocument } | { ok: false; error: string } {
  const patientId = clean(input.patientId, 80);
  const kind = MEDICAL_DOCUMENT_KINDS.includes(input.kind as MedicalDocumentKind)
    ? (input.kind as MedicalDocumentKind)
    : null;
  const title = clean(input.title, 160);
  const body = clean(input.body, 5000);
  const validFrom = DATE_ONLY.test(input.validFrom ?? "") ? input.validFrom! : null;
  const validUntil = DATE_ONLY.test(input.validUntil ?? "") ? input.validUntil! : null;

  if (!patientId) return { ok: false, error: "Patient not found." };
  if (!kind) return { ok: false, error: "Choose a valid document type." };
  if (!title) return { ok: false, error: "Add a document title." };
  if (body.length < 20) return { ok: false, error: "Add the wording the doctor is certifying." };
  if ((kind === "sick_leave" || kind === "fitness") && !validFrom) {
    return { ok: false, error: "Choose the date this certificate starts." };
  }
  if (validFrom && validUntil && validUntil < validFrom) {
    return { ok: false, error: "The end date cannot be before the start date." };
  }

  return {
    ok: true,
    value: {
      patientId,
      visitId: clean(input.visitId, 80) || null,
      kind,
      title,
      body,
      recipient: clean(input.recipient, 240) || null,
      validFrom,
      validUntil,
    },
  };
}

export function documentDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function medicalDocumentDraft(input: {
  kind: MedicalDocumentKind;
  patientName: string;
  clinicName: string;
  examinedOn: string;
  validFrom: string;
  validUntil: string;
  complaint?: string | null;
  diagnosis?: string | null;
}) {
  const { kind, patientName, clinicName, examinedOn } = input;

  if (kind === "sick_leave") {
    return `${patientName} was examined at ${clinicName} on ${examinedOn}. Based on the clinical assessment, rest is advised for the period stated below.`;
  }
  if (kind === "fitness") {
    return `${patientName} was examined at ${clinicName} on ${examinedOn} and is clinically fit to resume regular duties from the date stated below.`;
  }
  if (kind === "referral") {
    const context = [input.complaint, input.diagnosis].filter(Boolean).join(". ");
    return `Dear Doctor,\n\nPlease assess ${patientName}${context ? `, who was seen for ${context}` : ""}.\n\nReason for referral: [add reason and relevant findings].`;
  }
  return `This is to certify that ${patientName} was examined at ${clinicName} on ${examinedOn}.\n\n[Add the medical statement here.]`;
}
