import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ClinicError } from "@/lib/live-clinic";
import {
  assessmentRawFiles,
  inspectAssessmentFile,
} from "@/lib/assessment-uploads";
import { careAudioWorker } from "@/lib/care-audio-worker";
export const CARE_FILE_BYTES = 2 * 1024 * 1024,
  CARE_TOTAL_BYTES = 3 * 1024 * 1024,
  CARE_PATIENT_BYTES = 20 * 1024 * 1024;
const packageRequire = process
  .getBuiltinModule("module")
  .createRequire(join(process.cwd(), "package.json"));
export async function boundedCareForm(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !/^multipart\/form-data;\s*boundary=/.test(contentType) ||
    contentType.length > 250
  )
    throw new ClinicError(
      415,
      "multipart",
      "Use the upload control to choose your files.",
    );
  if (
    request.headers.get("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new ClinicError(
      415,
      "encoding",
      "Compressed uploads are not accepted.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new ClinicError(400, "empty", "Choose a file first.");
  const chunks: Uint8Array[] = [];
  let size = 0,
    expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel();
  }, 15000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > CARE_TOTAL_BYTES + 128 * 1024) {
        await reader.cancel();
        throw new ClinicError(
          413,
          "size",
          "Upload no more than 3 MB at a time.",
        );
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (expired)
    throw new ClinicError(
      408,
      "timeout",
      "The upload took too long. Keep your files selected and try again.",
    );
  try {
    return await new Request("http://care.invalid", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: Buffer.concat(chunks),
    }).formData();
  } catch {
    throw new ClinicError(
      400,
      "multipart",
      "The upload could not be read. Choose your files again.",
    );
  }
}
export function formFields(form: FormData, allowed: string[]) {
  for (const name of form.keys())
    if (!allowed.includes(name))
      throw new ClinicError(
        400,
        "fields",
        "The upload contains an unexpected field.",
      );
  for (const name of allowed.filter((key) => key !== "files"))
    if (form.getAll(name).length > 1)
      throw new ClinicError(400, "fields", "The upload repeats a field.");
}
export async function progressPhotos(form: FormData) {
  const raw = await assessmentRawFiles(form);
  if (!raw.length)
    throw new ClinicError(400, "photos", "Choose at least one photo.");
  const files = [];
  let total = 0;
  for (const input of raw) {
    const file = await inspectAssessmentFile(input);
    if (file.kind !== "image")
      throw new ClinicError(
        415,
        "photos_only",
        "Progress updates accept still photos only. Export HEIC as JPEG or PNG.",
      );
    total += file.bytes.length;
    if (total > CARE_TOTAL_BYTES)
      throw new ClinicError(
        413,
        "size",
        "The processed photos exceed 3 MB. Choose smaller images.",
      );
    files.push({
      name: file.name,
      mime: "image/webp",
      size: file.bytes.length,
      data: file.bytes,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
    });
  }
  return {
    files,
    hash: createHash("sha256")
      .update(
        raw
          .map((file) => createHash("sha256").update(file.bytes).digest("hex"))
          .join(":"),
      )
      .digest("hex"),
  };
}
export async function doctorAudio(file: File, durationMs: number) {
  if (!file.size || file.size > CARE_FILE_BYTES)
    throw new ClinicError(
      413,
      "audio_size",
      "Keep the message under 2 MB and two minutes.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  type AudioInfo = { mime: string; durationMs: number; extension: string };
  type AudioFailure = { error: true; stage: string; code: string };
  const info = await new Promise<AudioInfo>((resolve, reject) => {
    let finished = false,
      worker: Worker | undefined,
      stage = "sniffer_resolution";
    const finish = (value: AudioInfo | AudioFailure) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker?.terminate();
      if ("error" in value) {
        const unavailable = [
          "ERR_PACKAGE_PATH_NOT_EXPORTED",
          "ERR_MODULE_NOT_FOUND",
          "MODULE_NOT_FOUND",
          "reference_error",
          "worker_error",
          "worker_timeout",
          "worker_exit",
        ].includes(value.code);
        if (process.env.MEDSPACE_LIVE_AUDIO_DIAGNOSTICS === "true")
          console.error("care_audio_check", {
            stage: value.stage,
            code: value.code,
          });
        reject(
          new ClinicError(
            unavailable ? 503 : 415,
            unavailable ? "audio_unavailable" : "audio_format",
            unavailable
              ? "Recording checks are temporarily unavailable. Keep this recording and retry."
              : "The recording could not be checked. Record a short new message using this page.",
          ),
        );
      } else resolve(value);
    };
    const failure = (error: unknown): AudioFailure => ({
      error: true,
      stage,
      code:
        error &&
        typeof error === "object" &&
        "code" in error &&
        /^(?:ERR_[A-Z_]+|MODULE_NOT_FOUND)$/.test(String(error.code))
          ? String(error.code)
          : "worker_error",
    });
    const timer = setTimeout(
      () => finish({ error: true, stage: "worker", code: "worker_timeout" }),
      5000,
    );
    try {
      const fileTypeModule = packageRequire.resolve("file-type");
      stage = "metadata_resolution";
      // Resolve the pinned import entry directly; require-only runtimes cannot
      // select the package’s module-sync export condition.
      const metadataModule = join(
        process.cwd(),
        "node_modules/music-metadata/lib/index.js",
      );
      stage = "worker";
      worker = new Worker(careAudioWorker, {
        eval: true,
        resourceLimits: {
          maxOldGenerationSizeMb: 64,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
        workerData: { bytes, durationMs, fileTypeModule, metadataModule },
      });
      worker.once("message", (value) => finish(value));
      worker.once("error", (error) => finish(failure(error)));
      worker.once("exit", () =>
        finish({ error: true, stage, code: "worker_exit" }),
      );
    } catch (error) {
      finish(failure(error));
    }
  });
  const suppliedMime = file.type.split(";")[0].trim().toLowerCase();
  if (
    suppliedMime &&
    suppliedMime !== info.mime &&
    suppliedMime !== "application/octet-stream"
  )
    throw new ClinicError(
      415,
      "audio_mime",
      "The recording does not match its declared audio type.",
    );
  return {
    ...info,
    name: `doctor-message.${info.extension}`,
    data: bytes,
    size: bytes.length,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}
