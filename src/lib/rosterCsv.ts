import { storablePhone } from "@/lib/phone";

export type RosterPatient = {
  rowNumber: number;
  name: string;
  phone: string;
  ageYears: number | null;
  sex: "M" | "F" | "O" | null;
  fileNumber: number | null;
};

export type RosterParseResult = {
  rows: RosterPatient[];
  skipped: number;
};

export type RosterPatientCreate = {
  name: string;
  phone: string | null;
  ageYears: number | null;
  sex: string | null;
  fileNumber: number;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  fullname: "name",
  patientname: "name",
  phone: "phone",
  mobile: "phone",
  mobilenumber: "phone",
  contact: "phone",
  contactnumber: "phone",
  age: "age",
  ageyears: "age",
  sex: "sex",
  gender: "sex",
  filenumber: "fileNumber",
  file: "fileNumber",
  patientid: "fileNumber",
  opdnumber: "fileNumber",
  opdno: "fileNumber",
};

const normalHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function positiveInt(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function sexValue(value: string): RosterPatient["sex"] {
  const sex = value.trim().toLowerCase();
  if (sex === "m" || sex === "male") return "M";
  if (sex === "f" || sex === "female") return "F";
  if (sex === "o" || sex === "other" || sex === "non-binary") return "O";
  return null;
}

export function parsePatientRoster(text: string): RosterParseResult {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error("empty_csv");

  const columns = new Map<string, number>();
  table[0].forEach((header, index) => {
    const canonical = HEADER_ALIASES[normalHeader(header)];
    if (canonical && !columns.has(canonical)) columns.set(canonical, index);
  });
  const nameColumn = columns.get("name");
  if (nameColumn == null) throw new Error("missing_name_column");

  const value = (row: string[], key: string) => {
    const index = columns.get(key);
    return index == null ? "" : (row[index] ?? "").trim();
  };

  const rows: RosterPatient[] = [];
  let skipped = 0;
  table.slice(1).forEach((row, index) => {
    const name = (row[nameColumn] ?? "").trim();
    if (!name) {
      if (row.some((cell) => cell.trim())) skipped++;
      return;
    }
    const ageRaw = value(row, "age");
    const age = positiveInt(ageRaw);
    rows.push({
      rowNumber: index + 2,
      name: name.slice(0, 160),
      phone: value(row, "phone").slice(0, 40),
      ageYears: age != null && age <= 120 ? age : null,
      sex: sexValue(value(row, "sex")),
      fileNumber: positiveInt(value(row, "fileNumber")),
    });
  });

  return { rows, skipped };
}

function normalizedRows(rows: RosterPatient[]) {
  return rows.map((row) => ({ ...row, phone: storablePhone(row.phone) }));
}

export function rosterLookupKeys(rows: RosterPatient[]) {
  const normalized = normalizedRows(rows);
  return {
    phones: [...new Set(normalized.map((row) => row.phone).filter(Boolean))] as string[],
    fileNumbers: [
      ...new Set(normalized.map((row) => row.fileNumber).filter((value) => value != null)),
    ] as number[],
  };
}

export function prepareRosterImport(input: {
  rows: RosterPatient[];
  existingPhones: Array<string | null>;
  existingFileNumbers: number[];
  maxFileNumber: number | null;
  initiallySkipped?: number;
}): { data: RosterPatientCreate[]; skipped: number } {
  const usedPhones = new Set(input.existingPhones.filter(Boolean));
  const usedFiles = new Set(input.existingFileNumbers);
  let nextFile = (input.maxFileNumber ?? 100) + 1;
  let skipped = input.initiallySkipped ?? 0;
  const data: RosterPatientCreate[] = [];

  for (const row of normalizedRows(input.rows)) {
    if (row.phone && usedPhones.has(row.phone)) {
      skipped++;
      continue;
    }
    let fileNumber = row.fileNumber;
    if (!fileNumber || usedFiles.has(fileNumber)) {
      while (usedFiles.has(nextFile)) nextFile++;
      fileNumber = nextFile++;
    }
    usedFiles.add(fileNumber);
    if (row.phone) usedPhones.add(row.phone);
    data.push({
      name: row.name,
      phone: row.phone,
      ageYears: row.ageYears,
      sex: row.sex,
      fileNumber,
    });
  }

  return { data, skipped };
}
