// Shared between server (reports.ts) and client (ReportForm) — keep this
// module free of server-only imports (db, fs).

// Lab metrics the quick-entry chips offer. `type` matches Observation.type and
// the memory engine's METRIC_LABELS where trends are wanted.
// `aliases`: lowercase tokens that identify this metric in free-text lab-task
// titles ("Lipid profile + KFT", "Repeat TSH") so an incoming value can
// complete the matching pending order.
export const REPORT_METRICS: Array<{
  type: string;
  label: string;
  unit: string;
  aliases: string[];
}> = [
  { type: "HBA1C", label: "HbA1c", unit: "%", aliases: ["hba1c"] },
  { type: "FBS", label: "FBS", unit: "mg/dL", aliases: ["fbs", "sugar"] },
  { type: "PPBS", label: "PPBS", unit: "mg/dL", aliases: ["ppbs", "sugar"] },
  { type: "LDL", label: "LDL", unit: "mg/dL", aliases: ["ldl", "lipid"] },
  { type: "HDL", label: "HDL", unit: "mg/dL", aliases: ["hdl", "lipid"] },
  { type: "TG", label: "Triglycerides", unit: "mg/dL", aliases: ["triglycerides", "lipid"] },
  { type: "CREATININE", label: "Creatinine", unit: "mg/dL", aliases: ["creatinine", "kft", "rft"] },
  { type: "TSH", label: "TSH", unit: "mIU/L", aliases: ["tsh", "thyroid"] },
  { type: "HB", label: "Hemoglobin", unit: "g/dL", aliases: ["hemoglobin", "cbc"] },
  { type: "VITD", label: "Vitamin D", unit: "ng/mL", aliases: ["vitamin", "vitd"] },
  { type: "B12", label: "Vitamin B12", unit: "pg/mL", aliases: ["b12"] },
];
