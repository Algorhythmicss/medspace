// Doctors write "1-0-1". Patients do not read "1-0-1".
//
// Translating the notation is one of the highest-leverage things the patient
// view does: the adherence research found roughly half of Indian chronic
// patients are non-adherent, and dosing confusion is a documented cause. In
// Hindi it matters even more — many patients read Hindi far more comfortably
// than English, so the timing they act on has to be in their language.

import type { PlanLang } from "@/lib/planText";

const SLOTS: Record<PlanLang, [string, string, string]> = {
  en: ["Morning", "Afternoon", "Night"],
  hi: ["सुबह", "दोपहर", "रात"],
};

const FREQ_WORDS: Record<
  PlanLang,
  { sos: string; od: string; bd: string; tds: string; all: string; and: string }
> = {
  en: {
    sos: "Only when needed",
    od: "Once a day",
    bd: "Twice a day",
    tds: "Three times a day",
    all: "Morning, afternoon and night",
    and: "and",
  },
  hi: {
    sos: "ज़रूरत पड़ने पर",
    od: "दिन में एक बार",
    bd: "दिन में दो बार",
    tds: "दिन में तीन बार",
    all: "सुबह, दोपहर और रात",
    and: "और",
  },
};

export function plainFrequency(frequency: string, lang: PlanLang = "en"): string {
  const f = frequency.trim().toUpperCase();
  const w = FREQ_WORDS[lang];
  if (f === "SOS") return w.sos;
  if (f === "OD") return w.od;
  if (f === "BD") return w.bd;
  if (f === "TDS" || f === "TID") return w.tds;

  const parts = f.split("-");
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const slots = SLOTS[lang];
    const taken = parts
      .map((p, i) => (Number(p) > 0 ? slots[i] : null))
      .filter(Boolean) as string[];
    if (taken.length === 0) return frequency;
    if (taken.length === 3) return w.all;
    if (lang === "hi") return taken.join(` ${w.and} `); // Hindi doesn't lowercase
    // sentence case, not Title Case — "Morning and night" reads as language
    const [first, ...rest] = taken;
    return [first, ...rest.map((t) => t.toLowerCase())].join(` ${w.and} `);
  }
  return frequency;
}

// Free-text instructions are stored lowercase. The common ones translate; an
// uncommon custom instruction is left as written rather than mis-translated.
const INSTRUCTION_HI: Record<string, string> = {
  "after food": "खाने के बाद",
  "before food": "खाने से पहले",
  "after meals": "भोजन के बाद",
  "before meals": "भोजन से पहले",
  "after breakfast": "नाश्ते के बाद",
  "before breakfast": "नाश्ते से पहले",
  "at bedtime": "सोते समय",
  "empty stomach": "खाली पेट",
  "with water": "पानी के साथ",
  "with milk": "दूध के साथ",
};

export function plainInstruction(
  instruction: string | null,
  lang: PlanLang = "en"
): string | null {
  if (!instruction) return null;
  if (lang === "hi") {
    const hit = INSTRUCTION_HI[instruction.trim().toLowerCase()];
    if (hit) return hit;
    // unknown custom instruction — show as written rather than guess
  }
  return instruction.charAt(0).toUpperCase() + instruction.slice(1);
}
