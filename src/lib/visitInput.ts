export type VisitItemInput = {
  drugName: string;
  frequency: string;
  duration?: string;
  instructions?: string;
};

export type VisitInput = {
  commandId?: string;
  photoInstructions?: string;
  requestProgressPhotos?: boolean;
  patientId: string;
  complaint?: string;
  diagnosis?: string;
  vitals?: {
    bpSys?: number;
    bpDia?: number;
    pulse?: number;
    weight?: number;
    tempF?: number;
  };
  items: VisitItemInput[];
  advice?: string;
  followUpInDays?: number;
  labTasks: string[];
};

export type NormalizedVisitInput = {
  commandId?: string;
  photoInstructions?: string;
  patientId: string;
  complaint: string | null;
  diagnosis: string | null;
  vitals: NonNullable<VisitInput["vitals"]>;
  items: VisitItemInput[];
  advice: string | null;
  followUpInDays: number | null;
  labTasks: string[];
};

const clean = (value: unknown, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

function optionalMeasurement(
  value: unknown,
  min: number,
  max: number,
): number | undefined | null {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

export function normalizeVisitInput(
  input: VisitInput,
): { ok: true; value: NormalizedVisitInput } | { ok: false; error: string } {
  const patientId = clean(input?.patientId, 80);
  if (!patientId) return { ok: false, error: "Patient not found." };

  const rawVitals = input?.vitals ?? {};
  const vitals = {
    bpSys: optionalMeasurement(rawVitals.bpSys, 40, 300),
    bpDia: optionalMeasurement(rawVitals.bpDia, 20, 200),
    pulse: optionalMeasurement(rawVitals.pulse, 20, 300),
    weight: optionalMeasurement(rawVitals.weight, 1, 500),
    tempF: optionalMeasurement(rawVitals.tempF, 80, 115),
  };
  if (Object.values(vitals).some((value) => value === null)) {
    return { ok: false, error: "Check the vital measurements before saving." };
  }

  const items = (Array.isArray(input?.items) ? input.items : [])
    .slice(0, 24)
    .map((item) => ({
      drugName: clean(item?.drugName, 180),
      frequency: clean(item?.frequency, 40) || "OD",
      duration: clean(item?.duration, 80) || undefined,
      instructions: clean(item?.instructions, 240) || undefined,
    }))
    .filter((item) => item.drugName.length > 0);

  const seenLabs = new Set<string>();
  const labTasks = (Array.isArray(input?.labTasks) ? input.labTasks : [])
    .slice(0, 20)
    .map((task) => clean(task, 120))
    .filter((task) => {
      if (!task) return false;
      const key = task.toLocaleLowerCase("en-IN");
      if (seenLabs.has(key)) return false;
      seenLabs.add(key);
      return true;
    });

  const followUp = Number(input?.followUpInDays);
  const followUpInDays =
    Number.isInteger(followUp) && followUp >= 1 && followUp <= 365
      ? followUp
      : null;
  const photoInstructions = clean(input.photoInstructions, 500);
  if (input.requestProgressPhotos && !photoInstructions)
    return {
      ok: false,
      error: "Add instructions for the requested progress photos.",
    };
  if (photoInstructions && !followUpInDays)
    return {
      ok: false,
      error: "Choose a follow-up before requesting progress photos.",
    };
  if (
    input.commandId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.commandId,
    )
  )
    return { ok: false, error: "Reload the visit form before saving." };

  return {
    ok: true,
    value: {
      ...(input.commandId ? { commandId: input.commandId } : {}),
      ...(photoInstructions ? { photoInstructions } : {}),
      patientId,
      complaint: clean(input?.complaint, 2000) || null,
      diagnosis: clean(input?.diagnosis, 2000) || null,
      vitals: {
        bpSys: vitals.bpSys ?? undefined,
        bpDia: vitals.bpDia ?? undefined,
        pulse: vitals.pulse ?? undefined,
        weight: vitals.weight ?? undefined,
        tempF: vitals.tempF ?? undefined,
      },
      items,
      advice: clean(input?.advice, 4000) || null,
      followUpInDays,
      labTasks,
    },
  };
}
