import { createHash } from "node:crypto";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { ASSESSMENT_FILE_BYTES, ASSESSMENT_FILE_LIMIT, ASSESSMENT_TOTAL_BYTES, AssessmentError } from "@/lib/assessment";
import { assessmentUploadWorker } from "@/lib/assessment-upload-worker";
import { scanAssessmentBytes } from "@/lib/assessment-scanner";

const packageRequire = process.getBuiltinModule("module").createRequire(join(process.cwd(), "package.json"));
const extensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "tif", "tiff", "pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf", "txt"]);

export type AssessmentRawFile = { name: string; mime: string; bytes: Uint8Array<ArrayBuffer> };
type InspectedFile = { kind: string; mime: string; extension: string; inputMime: string; bytes: Uint8Array; error?: boolean };
export type PreparedAssessmentFile = {
  name: string;
  mime: string;
  size: number;
  sha256: string;
  data: Uint8Array<ArrayBuffer>;
  scanStatus: "rewritten" | "clean" | "quarantined";
  scannedAt: Date | null;
};

export function safeAssessmentFilename(name: string): { name: string; extension: string } {
  if (!name || name.length > 200 || /[\/:\\\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(name) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) {
    throw new AssessmentError(400, "filename", "Please rename that file without folders or hidden characters.");
  }
  const normalized = name.normalize("NFC").trim();
  const dot = normalized.lastIndexOf(".");
  const extension = normalized.slice(dot + 1).toLowerCase();
  if (dot < 1 || !extensions.has(extension)) {
    throw new AssessmentError(415, "format", "Use a photo, PDF, Word, Excel, PowerPoint, OpenDocument, RTF or plain-text file. Scripts, executables and archives are not accepted.");
  }
  const stem = normalized.slice(0, dot).replace(/[^\p{L}\p{N} ._()-]/gu, "_").replace(/^[. ]+|[. ]+$/g, "").slice(0, 100) || "medical-record";
  return { name: `${stem}.${extension}`, extension };
}

export async function assessmentRawFiles(form: FormData): Promise<AssessmentRawFile[]> {
  const entries = form.getAll("files");
  if (entries.length > ASSESSMENT_FILE_LIMIT) throw new AssessmentError(400, "file_count", "Attach no more than three files.");
  const files: AssessmentRawFile[] = [];
  let total = 0;
  for (const entry of entries) {
    if (!(entry instanceof File)) throw new AssessmentError(400, "file", "Choose a file using the attachment control.");
    if (!entry.name && entry.size === 0) continue;
    safeAssessmentFilename(entry.name);
    if (!entry.size || entry.size > ASSESSMENT_FILE_BYTES) throw new AssessmentError(413, "file_size", "Each file must be between 1 byte and 2 MB.");
    total += entry.size;
    if (total > ASSESSMENT_TOTAL_BYTES) throw new AssessmentError(413, "total_size", "The combined attachments must be no larger than 3 MB.");
    files.push({ name: entry.name, mime: entry.type.toLowerCase(), bytes: new Uint8Array(await entry.arrayBuffer()) });
  }
  return files;
}

async function inspectFile(file: AssessmentRawFile) {
  const { name, extension } = safeAssessmentFilename(file.name);
  const result = await new Promise<InspectedFile>((resolve, reject) => {
    let completed = false;
    let worker: Worker | undefined;
    const finish = (value?: InspectedFile) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      void worker?.terminate();
      if (!value || value.error) reject(new AssessmentError(415, "file_content", "That file is unsupported, damaged or does not match its format. Try a single-page photo or export it as a PDF."));
      else resolve(value);
    };
    const timer = setTimeout(() => finish(), 5000);
    try {
      worker = new Worker(assessmentUploadWorker, {
        eval: true,
        resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
        workerData: {
          bytes: file.bytes,
          extension,
          limit: ASSESSMENT_FILE_BYTES,
          fileTypeModule: packageRequire.resolve("file-type"),
          sharpModule: packageRequire.resolve("sharp"),
        },
      });
      worker.once("message", (value) => finish(value));
      worker.once("error", () => finish());
      worker.once("exit", () => finish());
    } catch {
      finish();
    }
  });
  const aliases = result.inputMime === "application/rtf" ? ["text/rtf", "application/rtf"] : [result.inputMime];
  if (file.mime && file.mime !== "application/octet-stream" && !aliases.includes(file.mime)) {
    throw new AssessmentError(415, "mime", "The file contents do not match its declared type. Please export it again.");
  }
  const stem = name.slice(0, name.lastIndexOf("."));
  return { ...result, name: `${stem}.${result.extension}`, bytes: new Uint8Array(result.bytes) };
}

export async function prepareAssessmentFiles(files: AssessmentRawFile[]): Promise<PreparedAssessmentFile[]> {
  const prepared: PreparedAssessmentFile[] = [];
  let total = 0;
  for (const file of files) {
    const inspected = await inspectFile(file);
    const scan = inspected.kind === "image" ? null : await scanAssessmentBytes(inspected.bytes);
    if (scan === "infected") throw new AssessmentError(422, "malware", "A file failed its safety scan. Nothing was submitted. Remove it and try again.");
    total += inspected.bytes.length;
    if (total > ASSESSMENT_TOTAL_BYTES) throw new AssessmentError(413, "total_size", "The processed attachments exceed 3 MB. Choose smaller files.");
    prepared.push({
      name: inspected.name,
      mime: inspected.mime,
      size: inspected.bytes.length,
      data: inspected.bytes,
      sha256: createHash("sha256").update(inspected.bytes).digest("hex"),
      scanStatus: inspected.kind === "image" ? "rewritten" : scan === "clean" ? "clean" : "quarantined",
      scannedAt: scan === "clean" ? new Date() : null,
    });
  }
  return prepared;
}
