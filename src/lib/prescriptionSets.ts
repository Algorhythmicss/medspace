export type PrescriptionSetItemInput = {
  drugName: string;
  frequency: string;
  duration?: string;
  instructions?: string;
};

export type PrescriptionSetInput = {
  name: string;
  items: PrescriptionSetItemInput[];
  advice?: string;
  followUpInDays?: number;
  labTasks?: string[];
};

export type NormalizedPrescriptionSet = {
  name: string;
  nameKey: string;
  items: PrescriptionSetItemInput[];
  advice: string | null;
  followUpInDays: number | null;
  labTasks: string[];
};

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export function normalizePrescriptionSet(
  input: PrescriptionSetInput
): { ok: true; value: NormalizedPrescriptionSet } | { ok: false; error: string } {
  const name = clean(input.name, 80);
  if (!name) return { ok: false, error: "Name this saved set first." };

  const items = (Array.isArray(input.items) ? input.items : [])
    .slice(0, 12)
    .map((item) => ({
      drugName: clean(item?.drugName, 180),
      frequency: clean(item?.frequency, 40) || "OD",
      duration: clean(item?.duration, 80) || undefined,
      instructions: clean(item?.instructions, 240) || undefined,
    }))
    .filter((item) => item.drugName.length > 0);

  if (items.length === 0) {
    return { ok: false, error: "Add at least one medicine before saving a set." };
  }

  const rawFollowUp = Number(input.followUpInDays);
  const followUpInDays =
    Number.isInteger(rawFollowUp) && rawFollowUp >= 1 && rawFollowUp <= 365
      ? rawFollowUp
      : null;
  const seenTasks = new Set<string>();
  const labTasks = (Array.isArray(input.labTasks) ? input.labTasks : [])
    .slice(0, 10)
    .map((task) => clean(task, 120))
    .filter((task) => {
      if (!task) return false;
      const key = task.toLocaleLowerCase("en-IN");
      if (seenTasks.has(key)) return false;
      seenTasks.add(key);
      return true;
    });

  return {
    ok: true,
    value: {
      name,
      nameKey: name.toLocaleLowerCase("en-IN"),
      items,
      advice: clean(input.advice, 1000) || null,
      followUpInDays,
      labTasks,
    },
  };
}
