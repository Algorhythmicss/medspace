// Doctors write "1-0-1". Patients do not read "1-0-1".
//
// Translating the notation is one of the highest-leverage things the patient
// view does: the adherence research found roughly half of Indian chronic
// patients are non-adherent, and dosing confusion is a documented cause.

const SLOTS = ["Morning", "Afternoon", "Night"] as const;

export function plainFrequency(frequency: string): string {
  const f = frequency.trim().toUpperCase();
  if (f === "SOS") return "Only when needed";
  if (f === "OD") return "Once a day";
  if (f === "BD") return "Twice a day";
  if (f === "TDS" || f === "TID") return "Three times a day";

  const parts = f.split("-");
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const taken = parts
      .map((p, i) => (Number(p) > 0 ? SLOTS[i] : null))
      .filter(Boolean) as string[];
    if (taken.length === 0) return frequency;
    if (taken.length === 3) return "Morning, afternoon and night";
    // sentence case, not Title Case — "Morning and night" reads as language
    const [first, ...rest] = taken;
    return [first, ...rest.map((t) => t.toLowerCase())].join(" and ");
  }
  return frequency;
}

/** "after food" → "After food" — instructions are stored lowercase. */
export function plainInstruction(instruction: string | null): string | null {
  if (!instruction) return null;
  return instruction.charAt(0).toUpperCase() + instruction.slice(1);
}
