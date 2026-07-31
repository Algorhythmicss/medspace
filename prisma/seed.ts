import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { subDays, subYears, addDays } from "date-fns";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const now = new Date();

const FORMULARY: Array<{
  name: string;
  defaultFrequency?: string;
  defaultDuration?: string;
  defaultInstructions?: string;
  useCount?: number;
}> = [
  { name: "Tab Metformin 500mg", defaultFrequency: "1-0-1", defaultDuration: "30 days", defaultInstructions: "after food", useCount: 40 },
  { name: "Tab Metformin 1000mg", defaultFrequency: "1-0-1", defaultDuration: "30 days", defaultInstructions: "after food", useCount: 25 },
  { name: "Tab Glimepiride 1mg", defaultFrequency: "1-0-0", defaultDuration: "30 days", defaultInstructions: "before breakfast", useCount: 18 },
  { name: "Tab Glimepiride 2mg", defaultFrequency: "1-0-0", defaultDuration: "30 days", defaultInstructions: "before breakfast", useCount: 15 },
  { name: "Tab Sitagliptin 100mg", defaultFrequency: "1-0-0", defaultDuration: "30 days", useCount: 8 },
  { name: "Tab Telmisartan 40mg", defaultFrequency: "1-0-0", defaultDuration: "30 days", useCount: 35 },
  { name: "Tab Telmisartan 80mg", defaultFrequency: "1-0-0", defaultDuration: "30 days", useCount: 12 },
  { name: "Tab Amlodipine 5mg", defaultFrequency: "0-0-1", defaultDuration: "30 days", useCount: 30 },
  { name: "Tab Atorvastatin 10mg", defaultFrequency: "0-0-1", defaultDuration: "30 days", defaultInstructions: "at bedtime", useCount: 28 },
  { name: "Tab Atorvastatin 20mg", defaultFrequency: "0-0-1", defaultDuration: "30 days", defaultInstructions: "at bedtime", useCount: 14 },
  { name: "Tab Rosuvastatin 10mg", defaultFrequency: "0-0-1", defaultDuration: "30 days", defaultInstructions: "at bedtime", useCount: 9 },
  { name: "Tab Aspirin 75mg", defaultFrequency: "0-1-0", defaultDuration: "30 days", defaultInstructions: "after lunch", useCount: 16 },
  { name: "Tab Clopidogrel 75mg", defaultFrequency: "0-1-0", defaultDuration: "30 days", defaultInstructions: "after food", useCount: 10 },
  { name: "Tab Thyroxine 50mcg", defaultFrequency: "1-0-0", defaultDuration: "30 days", defaultInstructions: "empty stomach", useCount: 12 },
  { name: "Tab Thyroxine 75mcg", defaultFrequency: "1-0-0", defaultDuration: "30 days", defaultInstructions: "empty stomach", useCount: 7 },
  { name: "Tab Pantoprazole 40mg", defaultFrequency: "1-0-0", defaultDuration: "14 days", defaultInstructions: "before breakfast", useCount: 45 },
  { name: "Tab Rabeprazole 20mg", defaultFrequency: "1-0-0", defaultDuration: "14 days", defaultInstructions: "before breakfast", useCount: 15 },
  { name: "Tab Paracetamol 650mg", defaultFrequency: "1-1-1", defaultDuration: "5 days", defaultInstructions: "after food, if fever", useCount: 60 },
  { name: "Tab Azithromycin 500mg", defaultFrequency: "1-0-0", defaultDuration: "3 days", defaultInstructions: "after food", useCount: 22 },
  { name: "Tab Amoxicillin-Clav 625mg", defaultFrequency: "1-0-1", defaultDuration: "5 days", defaultInstructions: "after food", useCount: 20 },
  { name: "Tab Cetirizine 10mg", defaultFrequency: "0-0-1", defaultDuration: "5 days", useCount: 33 },
  { name: "Tab Montelukast-Levocetirizine", defaultFrequency: "0-0-1", defaultDuration: "10 days", useCount: 14 },
  { name: "Syp Ambroxol 100ml", defaultFrequency: "1-1-1", defaultDuration: "5 days", defaultInstructions: "2 tsp", useCount: 11 },
  { name: "Inh Budesonide-Formoterol 200", defaultFrequency: "1-0-1", defaultDuration: "30 days", defaultInstructions: "rinse mouth after use", useCount: 6 },
  { name: "Inh Salbutamol 100mcg", defaultFrequency: "SOS", defaultDuration: "30 days", defaultInstructions: "2 puffs when breathless", useCount: 8 },
  { name: "Tab Metoprolol 25mg", defaultFrequency: "1-0-1", defaultDuration: "30 days", useCount: 9 },
  { name: "Tab Losartan 50mg", defaultFrequency: "1-0-0", defaultDuration: "30 days", useCount: 13 },
  { name: "Cap Omega-3", defaultFrequency: "0-1-0", defaultDuration: "30 days", defaultInstructions: "after food", useCount: 4 },
  { name: "Tab Calcium + Vit D3", defaultFrequency: "0-1-0", defaultDuration: "30 days", defaultInstructions: "after food", useCount: 17 },
  { name: "Tab Folic Acid 5mg", defaultFrequency: "1-0-0", defaultDuration: "30 days", useCount: 5 },
  { name: "Tab Ondansetron 4mg", defaultFrequency: "SOS", defaultDuration: "3 days", defaultInstructions: "if vomiting", useCount: 12 },
  { name: "Tab Domperidone 10mg", defaultFrequency: "1-0-1", defaultDuration: "5 days", defaultInstructions: "before food", useCount: 10 },
  { name: "Tab Diclofenac 50mg", defaultFrequency: "1-0-1", defaultDuration: "5 days", defaultInstructions: "after food", useCount: 19 },
  { name: "Gel Diclofenac topical", defaultFrequency: "1-0-1", defaultDuration: "10 days", defaultInstructions: "local application", useCount: 7 },
  { name: "Tab Vitamin B12 1500mcg", defaultFrequency: "1-0-0", defaultDuration: "30 days", useCount: 9 },
];

async function main() {
  // idempotent re-seed
  await db.carePlanTask.deleteMany();
  await db.observation.deleteMany();
  await db.prescriptionItem.deleteMany();
  await db.prescription.deleteMany();
  await db.report.deleteMany();
  await db.visit.deleteMany();
  await db.condition.deleteMany();
  await db.allergy.deleteMany();
  await db.patient.deleteMany();
  await db.drug.deleteMany();
  await db.clinic.deleteMany();

  await db.clinic.create({
    data: {
      id: "clinic",
      clinicName: "Shri Krishna Clinic",
      doctorName: "Dr. A. K. Verma",
      degrees: "MBBS, MD (Medicine)",
      regNumber: "MCI-45821",
      phone: "+91 98XXXXXX21",
      address: "12, Market Road, Lucknow",
    },
  });

  await db.drug.createMany({ data: FORMULARY });

  // ---------- Patient 1: Ramesh Gupta — worsening T2DM, overdue follow-up ----------
  const ramesh = await db.patient.create({
    data: {
      fileNumber: 101,
      name: "Ramesh Gupta",
      phone: "9876543101",
      sex: "M",
      ageYears: 58,
      address: "Aliganj, Lucknow",
      stickyNote: "Prefers Hindi. Usually comes with son Ankit.",
      conditions: {
        create: [
          { name: "Type 2 Diabetes", status: "active", since: subYears(now, 8) },
          { name: "Hypertension", status: "active", since: subYears(now, 6) },
        ],
      },
    },
  });

  const rameshRx = [
    { drugName: "Tab Metformin 1000mg", frequency: "1-0-1", duration: "45 days", instructions: "after food" },
    { drugName: "Tab Glimepiride 2mg", frequency: "1-0-0", duration: "45 days", instructions: "before breakfast" },
    { drugName: "Tab Telmisartan 40mg", frequency: "1-0-0", duration: "45 days" },
    { drugName: "Tab Atorvastatin 10mg", frequency: "0-0-1", duration: "45 days", instructions: "at bedtime" },
  ];

  // visit history ~every 6-7 weeks; HbA1c worsening 7.1 -> 7.9
  const rameshVisits: Array<{ daysAgo: number; hba1c?: number; sys: number; dia: number; wt: number; complaint: string }> = [
    { daysAgo: 320, hba1c: 7.1, sys: 138, dia: 88, wt: 78, complaint: "Routine diabetes review" },
    { daysAgo: 272, sys: 142, dia: 90, wt: 78.5, complaint: "Refill, generally well" },
    { daysAgo: 224, hba1c: 7.4, sys: 140, dia: 88, wt: 79, complaint: "Routine review, sugar reports" },
    { daysAgo: 176, sys: 136, dia: 86, wt: 79.5, complaint: "Refill" },
    { daysAgo: 128, hba1c: 7.6, sys: 144, dia: 92, wt: 80, complaint: "Review with reports, missed walks" },
    { daysAgo: 80, sys: 146, dia: 92, wt: 80.5, complaint: "Refill, occasional giddiness" },
    { daysAgo: 42, hba1c: 7.9, sys: 148, dia: 94, wt: 81, complaint: "Tingling in both feet since 2 weeks" },
  ];

  let lastRameshVisit: string | null = null;
  for (const v of rameshVisits) {
    const visit = await db.visit.create({
      data: {
        patientId: ramesh.id,
        visitDate: subDays(now, v.daysAgo),
        complaint: v.complaint,
        diagnosis: "T2DM with HTN" + (v.daysAgo === 42 ? "; ? early peripheral neuropathy" : ""),
        followUpDate: addDays(subDays(now, v.daysAgo), 45),
        prescription: {
          create: {
            advice: "Diet control. 30 min walk daily. Avoid sweets.",
            items: { create: rameshRx.map((r, i) => ({ ...r, sortOrder: i })) },
          },
        },
        observations: {
          create: [
            { patientId: ramesh.id, type: "BP_SYS", value: v.sys, unit: "mmHg", measuredAt: subDays(now, v.daysAgo) },
            { patientId: ramesh.id, type: "BP_DIA", value: v.dia, unit: "mmHg", measuredAt: subDays(now, v.daysAgo) },
            { patientId: ramesh.id, type: "WEIGHT", value: v.wt, unit: "kg", measuredAt: subDays(now, v.daysAgo) },
            ...(v.hba1c
              ? [{ patientId: ramesh.id, type: "HBA1C", value: v.hba1c, unit: "%", measuredAt: subDays(now, v.daysAgo), source: "lab" }]
              : []),
          ],
        },
      },
    });
    lastRameshVisit = visit.id;
  }

  await db.carePlanTask.createMany({
    data: [
      {
        patientId: ramesh.id,
        visitId: lastRameshVisit,
        kind: "LAB_TEST",
        title: "Lipid profile + KFT",
        dueDate: subDays(now, 28),
        status: "pending",
      },
      {
        patientId: ramesh.id,
        visitId: lastRameshVisit,
        kind: "FOLLOW_UP",
        title: "Diabetes review with reports",
        dueDate: addDays(subDays(now, 42), 45), // 3 days from now... actually due soon
        status: "pending",
      },
    ],
  });

  // ---------- Patient 2: Sunita Sharma — hypothyroid + HTN, improving ----------
  const sunita = await db.patient.create({
    data: {
      fileNumber: 102,
      name: "Sunita Sharma",
      phone: "9876543102",
      sex: "F",
      ageYears: 49,
      conditions: {
        create: [
          { name: "Hypothyroidism", status: "active", since: subYears(now, 3) },
          { name: "Hypertension", status: "active", since: subYears(now, 2) },
        ],
      },
    },
  });
  const sunitaData: Array<{ daysAgo: number; tsh?: number; sys: number; dia: number }> = [
    { daysAgo: 200, tsh: 8.2, sys: 138, dia: 88 },
    { daysAgo: 110, tsh: 5.6, sys: 134, dia: 86 },
    { daysAgo: 25, tsh: 3.8, sys: 128, dia: 82 },
  ];
  let lastSunitaVisit: string | null = null;
  for (const v of sunitaData) {
    const visit = await db.visit.create({
      data: {
        patientId: sunita.id,
        visitDate: subDays(now, v.daysAgo),
        complaint: "Thyroid review",
        diagnosis: "Hypothyroidism, HTN",
        followUpDate: addDays(subDays(now, v.daysAgo), 90),
        prescription: {
          create: {
            items: {
              create: [
                { drugName: "Tab Thyroxine 75mcg", frequency: "1-0-0", duration: "90 days", instructions: "empty stomach", sortOrder: 0 },
                { drugName: "Tab Amlodipine 5mg", frequency: "0-0-1", duration: "90 days", sortOrder: 1 },
              ],
            },
          },
        },
        observations: {
          create: [
            { patientId: sunita.id, type: "BP_SYS", value: v.sys, unit: "mmHg", measuredAt: subDays(now, v.daysAgo) },
            { patientId: sunita.id, type: "BP_DIA", value: v.dia, unit: "mmHg", measuredAt: subDays(now, v.daysAgo) },
            ...(v.tsh ? [{ patientId: sunita.id, type: "TSH", value: v.tsh, unit: "mIU/L", measuredAt: subDays(now, v.daysAgo), source: "lab" }] : []),
          ],
        },
      },
    });
    lastSunitaVisit = visit.id;
  }
  await db.carePlanTask.create({
    data: {
      patientId: sunita.id,
      visitId: lastSunitaVisit,
      kind: "LAB_TEST",
      title: "Repeat TSH before next visit",
      dueDate: addDays(now, 55),
      status: "pending",
    },
  });
  await db.report.create({
    data: {
      patientId: sunita.id,
      title: "Thyrocare thyroid profile",
      kind: "lab",
      reportDate: subDays(now, 25),
      summary: "TSH 3.8 — normalising on 75mcg",
    },
  });

  // ---------- Patient 3: Abdul Karim — T2DM + CKD, long overdue (defection risk) ----------
  const abdul = await db.patient.create({
    data: {
      fileNumber: 103,
      name: "Abdul Karim",
      phone: "9876543103",
      sex: "M",
      ageYears: 66,
      stickyNote: "Hard of hearing — speak up. Daughter Farida manages meds.",
      conditions: {
        create: [
          { name: "Type 2 Diabetes", status: "active", since: subYears(now, 12) },
          { name: "CKD Stage 2", status: "active", since: subYears(now, 1) },
        ],
      },
      allergies: { create: [{ substance: "Sulfa drugs", reaction: "rash" }] },
    },
  });
  const abdulData: Array<{ daysAgo: number; creat: number; hba1c?: number }> = [
    { daysAgo: 300, creat: 1.1, hba1c: 7.8 },
    { daysAgo: 180, creat: 1.25 },
    { daysAgo: 75, creat: 1.4, hba1c: 8.1 },
  ];
  let lastAbdulVisit: string | null = null;
  for (const v of abdulData) {
    const visit = await db.visit.create({
      data: {
        patientId: abdul.id,
        visitDate: subDays(now, v.daysAgo),
        complaint: "Diabetes review",
        diagnosis: "T2DM with diabetic nephropathy",
        followUpDate: addDays(subDays(now, v.daysAgo), 45),
        prescription: {
          create: {
            advice: "Low salt, low protein diet. Avoid painkillers.",
            items: {
              create: [
                { drugName: "Tab Metformin 500mg", frequency: "1-0-1", duration: "45 days", instructions: "after food", sortOrder: 0 },
                { drugName: "Tab Sitagliptin 100mg", frequency: "1-0-0", duration: "45 days", sortOrder: 1 },
                { drugName: "Tab Telmisartan 40mg", frequency: "1-0-0", duration: "45 days", sortOrder: 2 },
              ],
            },
          },
        },
        observations: {
          create: [
            { patientId: abdul.id, type: "CREATININE", value: v.creat, unit: "mg/dL", measuredAt: subDays(now, v.daysAgo), source: "lab" },
            ...(v.hba1c ? [{ patientId: abdul.id, type: "HBA1C", value: v.hba1c, unit: "%", measuredAt: subDays(now, v.daysAgo), source: "lab" }] : []),
          ],
        },
      },
    });
    lastAbdulVisit = visit.id;
  }
  await db.carePlanTask.createMany({
    data: [
      { patientId: abdul.id, visitId: lastAbdulVisit, kind: "FOLLOW_UP", title: "Diabetes + kidney review", dueDate: subDays(now, 30), status: "pending" },
      { patientId: abdul.id, visitId: lastAbdulVisit, kind: "LAB_TEST", title: "KFT + urine ACR", dueDate: subDays(now, 35), status: "pending" },
    ],
  });

  // ---------- Patient 4: Priya Nair — asthma, episodic ----------
  const priya = await db.patient.create({
    data: {
      fileNumber: 104,
      name: "Priya Nair",
      phone: "9876543104",
      sex: "F",
      ageYears: 34,
      conditions: { create: [{ name: "Bronchial Asthma", status: "active", since: subYears(now, 10) }] },
    },
  });
  await db.visit.create({
    data: {
      patientId: priya.id,
      visitDate: subDays(now, 12),
      complaint: "Wheezing at night since 3 days, seasonal",
      diagnosis: "Asthma exacerbation, mild",
      prescription: {
        create: {
          items: {
            create: [
              { drugName: "Inh Budesonide-Formoterol 200", frequency: "1-0-1", duration: "30 days", instructions: "rinse mouth after use", sortOrder: 0 },
              { drugName: "Inh Salbutamol 100mcg", frequency: "SOS", duration: "30 days", instructions: "2 puffs when breathless", sortOrder: 1 },
              { drugName: "Tab Montelukast-Levocetirizine", frequency: "0-0-1", duration: "15 days", sortOrder: 2 },
            ],
          },
        },
      },
    },
  });

  // ---------- Patient 5: Mohan Das — post-MI, due next week ----------
  const mohan = await db.patient.create({
    data: {
      fileNumber: 105,
      name: "Mohan Das",
      phone: "9876543105",
      sex: "M",
      ageYears: 71,
      conditions: {
        create: [
          { name: "CAD — post MI (2024)", status: "active", since: subYears(now, 2) },
          { name: "Hypertension", status: "active", since: subYears(now, 9) },
        ],
      },
    },
  });
  await db.report.create({
    data: {
      patientId: mohan.id,
      title: "ECG — City Diagnostics",
      kind: "other",
      reportDate: subDays(now, 2),
      summary: "Sinus rhythm, no new changes",
    },
  });
  const mohanVisit = await db.visit.create({
    data: {
      patientId: mohan.id,
      visitDate: subDays(now, 23),
      complaint: "Cardiac review, no chest pain",
      diagnosis: "CAD post-MI, stable",
      followUpDate: addDays(now, 7),
      prescription: {
        create: {
          items: {
            create: [
              { drugName: "Tab Aspirin 75mg", frequency: "0-1-0", duration: "30 days", instructions: "after lunch", sortOrder: 0 },
              { drugName: "Tab Clopidogrel 75mg", frequency: "0-1-0", duration: "30 days", instructions: "after food", sortOrder: 1 },
              { drugName: "Tab Atorvastatin 20mg", frequency: "0-0-1", duration: "30 days", instructions: "at bedtime", sortOrder: 2 },
              { drugName: "Tab Metoprolol 25mg", frequency: "1-0-1", duration: "30 days", sortOrder: 3 },
            ],
          },
        },
      },
      observations: {
        create: [
          { patientId: mohan.id, type: "BP_SYS", value: 126, unit: "mmHg", measuredAt: subDays(now, 23) },
          { patientId: mohan.id, type: "BP_DIA", value: 78, unit: "mmHg", measuredAt: subDays(now, 23) },
        ],
      },
    },
  });
  await db.carePlanTask.create({
    data: { patientId: mohan.id, visitId: mohanVisit.id, kind: "OTHER", title: "Repeat ECG at next visit", dueDate: addDays(now, 7), status: "pending" },
  });

  // ---------- Patient 6: Kavita Joshi — new patient, simple ----------
  const kavita = await db.patient.create({
    data: {
      fileNumber: 106,
      name: "Kavita Joshi",
      phone: "9876543106",
      sex: "F",
      ageYears: 42,
      stickyNote: "Works night shifts — prefers evening appointments. Anxious about gastric symptoms.",
    },
  });
  await db.visit.create({
    data: {
      patientId: kavita.id,
      visitDate: subDays(now, 6),
      complaint: "Burning in upper abdomen after meals, 2 weeks",
      diagnosis: "Dyspepsia",
      prescription: {
        create: {
          advice: "Avoid spicy food, tea on empty stomach. Small frequent meals.",
          items: {
            create: [
              { drugName: "Tab Pantoprazole 40mg", frequency: "1-0-0", duration: "14 days", instructions: "before breakfast", sortOrder: 0 },
              { drugName: "Tab Domperidone 10mg", frequency: "1-0-1", duration: "7 days", instructions: "before food", sortOrder: 1 },
            ],
          },
        },
      },
    },
  });

  // ---------- Patient 7: Rajiv Menon — uncontrolled HTN, missed follow-up ----------
  const rajiv = await db.patient.create({
    data: {
      fileNumber: 107,
      name: "Rajiv Menon",
      phone: "9876543107",
      sex: "M",
      ageYears: 55,
      conditions: { create: [{ name: "Hypertension", status: "active", since: subYears(now, 4) }] },
    },
  });
  const rajivData: Array<{ daysAgo: number; sys: number; dia: number }> = [
    { daysAgo: 150, sys: 148, dia: 94 },
    { daysAgo: 95, sys: 152, dia: 96 },
    { daysAgo: 50, sys: 158, dia: 98 },
  ];
  let lastRajivVisit: string | null = null;
  for (const v of rajivData) {
    const visit = await db.visit.create({
      data: {
        patientId: rajiv.id,
        visitDate: subDays(now, v.daysAgo),
        complaint: "BP review",
        diagnosis: "Hypertension, suboptimal control",
        followUpDate: addDays(subDays(now, v.daysAgo), 30),
        prescription: {
          create: {
            advice: "Salt < 5g/day. Regular walks. Home BP diary.",
            items: {
              create: [
                { drugName: "Tab Telmisartan 80mg", frequency: "1-0-0", duration: "30 days", sortOrder: 0 },
                { drugName: "Tab Amlodipine 5mg", frequency: "0-0-1", duration: "30 days", sortOrder: 1 },
              ],
            },
          },
        },
        observations: {
          create: [
            { patientId: rajiv.id, type: "BP_SYS", value: v.sys, unit: "mmHg", measuredAt: subDays(now, v.daysAgo) },
            { patientId: rajiv.id, type: "BP_DIA", value: v.dia, unit: "mmHg", measuredAt: subDays(now, v.daysAgo) },
          ],
        },
      },
    });
    lastRajivVisit = visit.id;
  }
  await db.carePlanTask.createMany({
    data: [
      { patientId: rajiv.id, visitId: lastRajivVisit, kind: "FOLLOW_UP", title: "BP review — meds may need up-titration", dueDate: subDays(now, 20), status: "pending" },
      { patientId: rajiv.id, visitId: lastRajivVisit, kind: "LAB_TEST", title: "KFT + electrolytes + home BP diary", dueDate: subDays(now, 25), status: "pending" },
    ],
  });

  // ---------- Patient 8: Lakshmi Devi — controlled T2DM, due today ----------
  const lakshmi = await db.patient.create({
    data: {
      fileNumber: 108,
      name: "Lakshmi Devi",
      phone: "9876543108",
      sex: "F",
      ageYears: 63,
      conditions: { create: [{ name: "Type 2 Diabetes", status: "active", since: subYears(now, 5) }] },
    },
  });
  const lakshmiData: Array<{ daysAgo: number; hba1c: number }> = [
    { daysAgo: 270, hba1c: 7.0 },
    { daysAgo: 180, hba1c: 6.9 },
    { daysAgo: 90, hba1c: 6.8 },
  ];
  let lastLakshmiVisit: string | null = null;
  for (const v of lakshmiData) {
    const visit = await db.visit.create({
      data: {
        patientId: lakshmi.id,
        visitDate: subDays(now, v.daysAgo),
        complaint: "Diabetes review",
        diagnosis: "T2DM, well controlled",
        followUpDate: addDays(subDays(now, v.daysAgo), 90),
        prescription: {
          create: {
            items: {
              create: [
                { drugName: "Tab Metformin 500mg", frequency: "1-0-1", duration: "90 days", instructions: "after food", sortOrder: 0 },
              ],
            },
          },
        },
        observations: {
          create: [
            { patientId: lakshmi.id, type: "HBA1C", value: v.hba1c, unit: "%", measuredAt: subDays(now, v.daysAgo), source: "lab" },
          ],
        },
      },
    });
    lastLakshmiVisit = visit.id;
  }
  await db.carePlanTask.create({
    data: { patientId: lakshmi.id, visitId: lastLakshmiVisit, kind: "FOLLOW_UP", title: "Quarterly diabetes review", dueDate: now, status: "pending" },
  });

  const counts = {
    patients: await db.patient.count(),
    visits: await db.visit.count(),
    observations: await db.observation.count(),
    tasks: await db.carePlanTask.count(),
    drugs: await db.drug.count(),
  };
  console.log("Seeded:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
