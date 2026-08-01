// Emits the demo panel as plain SQL so it can be loaded into a remote Postgres
// without needing a direct connection string. Deterministic ids keep re-runs
// idempotent. Usage: npx tsx scripts/seed-sql.ts > /tmp/seed.sql
import { subDays, subYears, addDays } from "date-fns";

const now = new Date();
const out: string[] = [];
const q = (s: string | null | undefined) =>
  s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
const t = (d: Date | null | undefined) => (d == null ? "NULL" : `'${d.toISOString()}'`);
const n = (v: number | null | undefined) => (v == null ? "NULL" : String(v));

// wipe then rebuild
out.push(
  `DELETE FROM "QueueEntry"; DELETE FROM "PatientAccess"; DELETE FROM "CarePlanTask"; DELETE FROM "Observation"; DELETE FROM "PrescriptionItem"; DELETE FROM "Prescription"; DELETE FROM "Report"; DELETE FROM "Visit"; DELETE FROM "Condition"; DELETE FROM "Allergy"; DELETE FROM "Patient"; DELETE FROM "Drug"; DELETE FROM "Clinic";`
);

out.push(
  `INSERT INTO "Clinic" ("id","clinicName","doctorName","regNumber","degrees","phone","address") VALUES ('clinic',${q("Shri Krishna Clinic")},${q("Dr. A. K. Verma")},${q("MCI-45821")},${q("MBBS, MD (Medicine)")},${q("+91 98450 12345")},${q("12, Market Road, Lucknow")});`
);

const FORMULARY: Array<[string, string | null, string | null, string | null, number]> = [
  ["Tab Metformin 500mg", "1-0-1", "30 days", "after food", 40],
  ["Tab Metformin 1000mg", "1-0-1", "30 days", "after food", 25],
  ["Tab Glimepiride 1mg", "1-0-0", "30 days", "before breakfast", 18],
  ["Tab Glimepiride 2mg", "1-0-0", "30 days", "before breakfast", 15],
  ["Tab Sitagliptin 100mg", "1-0-0", "30 days", null, 8],
  ["Tab Telmisartan 40mg", "1-0-0", "30 days", null, 35],
  ["Tab Telmisartan 80mg", "1-0-0", "30 days", null, 12],
  ["Tab Amlodipine 5mg", "0-0-1", "30 days", null, 30],
  ["Tab Atorvastatin 10mg", "0-0-1", "30 days", "at bedtime", 28],
  ["Tab Atorvastatin 20mg", "0-0-1", "30 days", "at bedtime", 14],
  ["Tab Rosuvastatin 10mg", "0-0-1", "30 days", "at bedtime", 9],
  ["Tab Aspirin 75mg", "0-1-0", "30 days", "after lunch", 16],
  ["Tab Clopidogrel 75mg", "0-1-0", "30 days", "after food", 10],
  ["Tab Thyroxine 50mcg", "1-0-0", "30 days", "empty stomach", 12],
  ["Tab Thyroxine 75mcg", "1-0-0", "30 days", "empty stomach", 7],
  ["Tab Pantoprazole 40mg", "1-0-0", "14 days", "before breakfast", 45],
  ["Tab Rabeprazole 20mg", "1-0-0", "14 days", "before breakfast", 15],
  ["Tab Paracetamol 650mg", "1-1-1", "5 days", "after food, if fever", 60],
  ["Tab Azithromycin 500mg", "1-0-0", "3 days", "after food", 22],
  ["Tab Amoxicillin-Clav 625mg", "1-0-1", "5 days", "after food", 20],
  ["Tab Cetirizine 10mg", "0-0-1", "5 days", null, 33],
  ["Tab Montelukast-Levocetirizine", "0-0-1", "10 days", null, 14],
  ["Syp Ambroxol 100ml", "1-1-1", "5 days", "2 tsp", 11],
  ["Inh Budesonide-Formoterol 200", "1-0-1", "30 days", "rinse mouth after use", 6],
  ["Inh Salbutamol 100mcg", "SOS", "30 days", "2 puffs when breathless", 8],
  ["Tab Metoprolol 25mg", "1-0-1", "30 days", null, 9],
  ["Tab Losartan 50mg", "1-0-0", "30 days", null, 13],
  ["Cap Omega-3", "0-1-0", "30 days", "after food", 4],
  ["Tab Calcium + Vit D3", "0-1-0", "30 days", "after food", 17],
  ["Tab Folic Acid 5mg", "1-0-0", "30 days", null, 5],
  ["Tab Ondansetron 4mg", "SOS", "3 days", "if vomiting", 12],
  ["Tab Domperidone 10mg", "1-0-1", "5 days", "before food", 10],
  ["Tab Diclofenac 50mg", "1-0-1", "5 days", "after food", 19],
  ["Gel Diclofenac topical", "1-0-1", "10 days", "local application", 7],
  ["Tab Vitamin B12 1500mcg", "1-0-0", "30 days", null, 9],
];
FORMULARY.forEach(([name, f, d, i, u], idx) => {
  out.push(
    `INSERT INTO "Drug" ("id","name","defaultFrequency","defaultDuration","defaultInstructions","useCount") VALUES (${q(`drug${idx}`)},${q(name)},${q(f)},${q(d)},${q(i)},${u});`
  );
});

type Rx = { drugName: string; frequency: string; duration?: string; instructions?: string };

let seq = 0;
const id = (p: string) => `${p}${++seq}`;

function patient(o: {
  key: string;
  fileNumber: number;
  name: string;
  phone: string;
  sex: string;
  age: number;
  address?: string;
  sticky?: string;
}) {
  out.push(
    `INSERT INTO "Patient" ("id","fileNumber","name","phone","sex","ageYears","address","stickyNote","createdAt","updatedAt") VALUES (${q(o.key)},${o.fileNumber},${q(o.name)},${q(o.phone)},${q(o.sex)},${o.age},${q(o.address)},${q(o.sticky)},${t(now)},${t(now)});`
  );
  return o.key;
}

function condition(pid: string, name: string, sinceYears: number) {
  out.push(
    `INSERT INTO "Condition" ("id","patientId","name","status","since","createdAt") VALUES (${q(id("c"))},${q(pid)},${q(name)},'active',${t(subYears(now, sinceYears))},${t(now)});`
  );
}

function allergy(pid: string, substance: string, reaction?: string) {
  out.push(
    `INSERT INTO "Allergy" ("id","patientId","substance","reaction") VALUES (${q(id("a"))},${q(pid)},${q(substance)},${q(reaction)});`
  );
}

function visit(o: {
  pid: string;
  daysAgo: number;
  complaint: string;
  diagnosis?: string;
  followUpInDays?: number;
  rx?: Rx[];
  advice?: string;
  obs?: Array<[string, number, string, string?]>;
}) {
  const vid = id("v");
  const date = subDays(now, o.daysAgo);
  const fu = o.followUpInDays != null ? addDays(date, o.followUpInDays) : null;
  out.push(
    `INSERT INTO "Visit" ("id","patientId","visitDate","complaint","diagnosis","followUpDate","createdAt") VALUES (${q(vid)},${q(o.pid)},${t(date)},${q(o.complaint)},${q(o.diagnosis)},${t(fu)},${t(date)});`
  );
  if (o.rx && o.rx.length > 0) {
    const prid = id("pr");
    out.push(
      `INSERT INTO "Prescription" ("id","visitId","advice","createdAt") VALUES (${q(prid)},${q(vid)},${q(o.advice)},${t(date)});`
    );
    o.rx.forEach((r, i) => {
      out.push(
        `INSERT INTO "PrescriptionItem" ("id","prescriptionId","sortOrder","drugName","frequency","duration","instructions") VALUES (${q(id("pi"))},${q(prid)},${i},${q(r.drugName)},${q(r.frequency)},${q(r.duration)},${q(r.instructions)});`
      );
    });
  }
  for (const [type, value, unit, source] of o.obs ?? []) {
    out.push(
      `INSERT INTO "Observation" ("id","patientId","visitId","type","value","unit","measuredAt","source") VALUES (${q(id("o"))},${q(o.pid)},${q(vid)},${q(type)},${value},${q(unit)},${t(date)},${q(source ?? "clinic")});`
    );
  }
  return vid;
}

function task(o: {
  pid: string;
  vid?: string;
  kind: string;
  title: string;
  dueInDays: number;
}) {
  out.push(
    `INSERT INTO "CarePlanTask" ("id","patientId","visitId","kind","title","dueDate","status","createdAt") VALUES (${q(id("t"))},${q(o.pid)},${o.vid ? q(o.vid) : "NULL"},${q(o.kind)},${q(o.title)},${t(addDays(now, o.dueInDays))},'pending',${t(now)});`
  );
}

function report(o: {
  pid: string;
  title: string;
  kind: string;
  daysAgo: number;
  summary?: string;
}) {
  out.push(
    `INSERT INTO "Report" ("id","patientId","title","kind","reportDate","summary") VALUES (${q(id("r"))},${q(o.pid)},${q(o.title)},${q(o.kind)},${t(subDays(now, o.daysAgo))},${q(o.summary)});`
  );
}

// ---------- 1: Ramesh Gupta — worsening T2DM, overdue labs ----------
const ramesh = patient({
  key: "p101",
  fileNumber: 101,
  name: "Ramesh Gupta",
  phone: "9876543101",
  sex: "M",
  age: 58,
  address: "Aliganj, Lucknow",
  sticky: "Prefers Hindi. Usually comes with son Ankit.",
});
condition(ramesh, "Type 2 Diabetes", 8);
condition(ramesh, "Hypertension", 6);
const rameshRx: Rx[] = [
  { drugName: "Tab Metformin 1000mg", frequency: "1-0-1", duration: "45 days", instructions: "after food" },
  { drugName: "Tab Glimepiride 2mg", frequency: "1-0-0", duration: "45 days", instructions: "before breakfast" },
  { drugName: "Tab Telmisartan 40mg", frequency: "1-0-0", duration: "45 days" },
  { drugName: "Tab Atorvastatin 10mg", frequency: "0-0-1", duration: "45 days", instructions: "at bedtime" },
];
const rameshVisits: Array<[number, number | null, number, number, number, string]> = [
  [320, 7.1, 138, 88, 78, "Routine diabetes review"],
  [272, null, 142, 90, 78.5, "Refill, generally well"],
  [224, 7.4, 140, 88, 79, "Routine review, sugar reports"],
  [176, null, 136, 86, 79.5, "Refill"],
  [128, 7.6, 144, 92, 80, "Review with reports, missed walks"],
  [80, null, 146, 92, 80.5, "Refill, occasional giddiness"],
  [42, 7.9, 148, 94, 81, "Tingling in both feet since 2 weeks"],
];
let lastRameshVid = "";
for (const [daysAgo, hba1c, sys, dia, wt, complaint] of rameshVisits) {
  const obs: Array<[string, number, string, string?]> = [
    ["BP_SYS", sys, "mmHg"],
    ["BP_DIA", dia, "mmHg"],
    ["WEIGHT", wt, "kg"],
  ];
  if (hba1c != null) obs.push(["HBA1C", hba1c, "%", "lab"]);
  lastRameshVid = visit({
    pid: ramesh,
    daysAgo,
    complaint,
    diagnosis: "T2DM with HTN" + (daysAgo === 42 ? "; ? early peripheral neuropathy" : ""),
    followUpInDays: 45,
    rx: rameshRx,
    advice: "Diet control. 30 min walk daily. Avoid sweets.",
    obs,
  });
}
task({ pid: ramesh, vid: lastRameshVid, kind: "LAB_TEST", title: "Lipid profile + KFT", dueInDays: -28 });
task({ pid: ramesh, vid: lastRameshVid, kind: "FOLLOW_UP", title: "Diabetes review with reports", dueInDays: 3 });

// ---------- 2: Sunita Sharma — hypothyroid improving ----------
const sunita = patient({
  key: "p102",
  fileNumber: 102,
  name: "Sunita Sharma",
  phone: "9876543102",
  sex: "F",
  age: 49,
});
condition(sunita, "Hypothyroidism", 3);
condition(sunita, "Hypertension", 2);
const sunitaRx: Rx[] = [
  { drugName: "Tab Thyroxine 75mcg", frequency: "1-0-0", duration: "90 days", instructions: "empty stomach" },
  { drugName: "Tab Amlodipine 5mg", frequency: "0-0-1", duration: "90 days" },
];
let lastSunitaVid = "";
for (const [daysAgo, tsh, sys, dia] of [
  [200, 8.2, 138, 88],
  [110, 5.6, 134, 86],
  [25, 3.8, 128, 82],
] as Array<[number, number, number, number]>) {
  lastSunitaVid = visit({
    pid: sunita,
    daysAgo,
    complaint: "Thyroid review",
    diagnosis: "Hypothyroidism, HTN",
    followUpInDays: 90,
    rx: sunitaRx,
    obs: [
      ["BP_SYS", sys, "mmHg"],
      ["BP_DIA", dia, "mmHg"],
      ["TSH", tsh, "mIU/L", "lab"],
    ],
  });
}
task({ pid: sunita, vid: lastSunitaVid, kind: "LAB_TEST", title: "Repeat TSH before next visit", dueInDays: 55 });
report({ pid: sunita, title: "Thyrocare thyroid profile", kind: "lab", daysAgo: 25, summary: "TSH 3.8 — normalising on 75mcg" });

// ---------- 3: Abdul Karim — T2DM + CKD, long overdue ----------
const abdul = patient({
  key: "p103",
  fileNumber: 103,
  name: "Abdul Karim",
  phone: "9876543103",
  sex: "M",
  age: 66,
  sticky: "Hard of hearing — speak up. Daughter Farida manages meds.",
});
condition(abdul, "Type 2 Diabetes", 12);
condition(abdul, "CKD Stage 2", 1);
allergy(abdul, "Sulfa drugs", "rash");
const abdulRx: Rx[] = [
  { drugName: "Tab Metformin 500mg", frequency: "1-0-1", duration: "45 days", instructions: "after food" },
  { drugName: "Tab Sitagliptin 100mg", frequency: "1-0-0", duration: "45 days" },
  { drugName: "Tab Telmisartan 40mg", frequency: "1-0-0", duration: "45 days" },
];
let lastAbdulVid = "";
for (const [daysAgo, creat, hba1c] of [
  [300, 1.1, 7.8],
  [180, 1.25, null],
  [75, 1.4, 8.1],
] as Array<[number, number, number | null]>) {
  const obs: Array<[string, number, string, string?]> = [["CREATININE", creat, "mg/dL", "lab"]];
  if (hba1c != null) obs.push(["HBA1C", hba1c, "%", "lab"]);
  lastAbdulVid = visit({
    pid: abdul,
    daysAgo,
    complaint: "Diabetes review",
    diagnosis: "T2DM with diabetic nephropathy",
    followUpInDays: 45,
    rx: abdulRx,
    advice: "Low salt, low protein diet. Avoid painkillers.",
    obs,
  });
}
task({ pid: abdul, vid: lastAbdulVid, kind: "FOLLOW_UP", title: "Diabetes + kidney review", dueInDays: -30 });
task({ pid: abdul, vid: lastAbdulVid, kind: "LAB_TEST", title: "KFT + urine ACR", dueInDays: -35 });

// ---------- 4: Priya Nair — asthma ----------
const priya = patient({
  key: "p104",
  fileNumber: 104,
  name: "Priya Nair",
  phone: "9876543104",
  sex: "F",
  age: 34,
});
condition(priya, "Bronchial Asthma", 10);
visit({
  pid: priya,
  daysAgo: 12,
  complaint: "Wheezing at night since 3 days, seasonal",
  diagnosis: "Asthma exacerbation, mild",
  rx: [
    { drugName: "Inh Budesonide-Formoterol 200", frequency: "1-0-1", duration: "30 days", instructions: "rinse mouth after use" },
    { drugName: "Inh Salbutamol 100mcg", frequency: "SOS", duration: "30 days", instructions: "2 puffs when breathless" },
    { drugName: "Tab Montelukast-Levocetirizine", frequency: "0-0-1", duration: "15 days" },
  ],
});

// ---------- 5: Mohan Das — post-MI, ECG report waiting ----------
const mohan = patient({
  key: "p105",
  fileNumber: 105,
  name: "Mohan Das",
  phone: "9876543105",
  sex: "M",
  age: 71,
});
condition(mohan, "CAD — post MI (2024)", 2);
condition(mohan, "Hypertension", 9);
report({ pid: mohan, title: "ECG — City Diagnostics", kind: "other", daysAgo: 2, summary: "Sinus rhythm, no new changes" });
const mohanVid = visit({
  pid: mohan,
  daysAgo: 23,
  complaint: "Cardiac review, no chest pain",
  diagnosis: "CAD post-MI, stable",
  followUpInDays: 30,
  rx: [
    { drugName: "Tab Aspirin 75mg", frequency: "0-1-0", duration: "30 days", instructions: "after lunch" },
    { drugName: "Tab Clopidogrel 75mg", frequency: "0-1-0", duration: "30 days", instructions: "after food" },
    { drugName: "Tab Atorvastatin 20mg", frequency: "0-0-1", duration: "30 days", instructions: "at bedtime" },
    { drugName: "Tab Metoprolol 25mg", frequency: "1-0-1", duration: "30 days" },
  ],
  obs: [
    ["BP_SYS", 126, "mmHg"],
    ["BP_DIA", 78, "mmHg"],
  ],
});
task({ pid: mohan, vid: mohanVid, kind: "OTHER", title: "Repeat ECG at next visit", dueInDays: 7 });

// ---------- 6: Kavita Joshi — episodic ----------
const kavita = patient({
  key: "p106",
  fileNumber: 106,
  name: "Kavita Joshi",
  phone: "9876543106",
  sex: "F",
  age: 42,
  sticky: "Works night shifts — prefers evening appointments. Anxious about gastric symptoms.",
});
visit({
  pid: kavita,
  daysAgo: 6,
  complaint: "Burning in upper abdomen after meals, 2 weeks",
  diagnosis: "Dyspepsia",
  advice: "Avoid spicy food, tea on empty stomach. Small frequent meals.",
  rx: [
    { drugName: "Tab Pantoprazole 40mg", frequency: "1-0-0", duration: "14 days", instructions: "before breakfast" },
    { drugName: "Tab Domperidone 10mg", frequency: "1-0-1", duration: "7 days", instructions: "before food" },
  ],
});

// ---------- 7: Rajiv Menon — uncontrolled HTN, missed follow-up ----------
const rajiv = patient({
  key: "p107",
  fileNumber: 107,
  name: "Rajiv Menon",
  phone: "9876543107",
  sex: "M",
  age: 55,
});
condition(rajiv, "Hypertension", 4);
const rajivRx: Rx[] = [
  { drugName: "Tab Telmisartan 80mg", frequency: "1-0-0", duration: "30 days" },
  { drugName: "Tab Amlodipine 5mg", frequency: "0-0-1", duration: "30 days" },
];
let lastRajivVid = "";
for (const [daysAgo, sys, dia] of [
  [150, 148, 94],
  [95, 152, 96],
  [50, 158, 98],
] as Array<[number, number, number]>) {
  lastRajivVid = visit({
    pid: rajiv,
    daysAgo,
    complaint: "BP review",
    diagnosis: "Hypertension, suboptimal control",
    followUpInDays: 30,
    rx: rajivRx,
    advice: "Salt < 5g/day. Regular walks. Home BP diary.",
    obs: [
      ["BP_SYS", sys, "mmHg"],
      ["BP_DIA", dia, "mmHg"],
    ],
  });
}
task({ pid: rajiv, vid: lastRajivVid, kind: "FOLLOW_UP", title: "BP review — meds may need up-titration", dueInDays: -20 });
task({ pid: rajiv, vid: lastRajivVid, kind: "LAB_TEST", title: "KFT + electrolytes + home BP diary", dueInDays: -25 });

// ---------- 8: Lakshmi Devi — controlled T2DM, due today ----------
const lakshmi = patient({
  key: "p108",
  fileNumber: 108,
  name: "Lakshmi Devi",
  phone: "9876543108",
  sex: "F",
  age: 63,
});
condition(lakshmi, "Type 2 Diabetes", 5);
let lastLakshmiVid = "";
for (const [daysAgo, hba1c] of [
  [270, 7.0],
  [180, 6.9],
  [90, 6.8],
] as Array<[number, number]>) {
  lastLakshmiVid = visit({
    pid: lakshmi,
    daysAgo,
    complaint: "Diabetes review",
    diagnosis: "T2DM, well controlled",
    followUpInDays: 90,
    rx: [{ drugName: "Tab Metformin 500mg", frequency: "1-0-1", duration: "90 days", instructions: "after food" }],
    obs: [["HBA1C", hba1c, "%", "lab"]],
  });
}
task({ pid: lakshmi, vid: lastLakshmiVid, kind: "FOLLOW_UP", title: "Quarterly diabetes review", dueInDays: 0 });

console.log(out.join("\n"));
