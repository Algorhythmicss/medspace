export const assessmentUploadWorker = String.raw`
const { parentPort, workerData } = require("node:worker_threads");

async function run() {
  const { fileTypeFromBuffer } = await import(workerData.fileTypeModule);
  const bytes = new Uint8Array(workerData.bytes);
  const detected = await fileTypeFromBuffer(bytes);
  const extension = workerData.extension;
  const images = new Map([
    ["jpg", ["jpg", "jpeg"]], ["png", ["png"]], ["webp", ["webp"]],
    ["gif", ["gif"]], ["avif", ["avif"]], ["tif", ["tif", "tiff"]],
  ]);
  const documents = new Set(["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf"]);
  if (detected && images.has(detected.ext) && images.get(detected.ext).includes(extension)) {
    const { default: sharp } = await import(workerData.sharpModule);
    sharp.cache(false);
    sharp.concurrency(1);
    const image = sharp(bytes, { limitInputPixels: 16000000, failOn: "warning", animated: true }).timeout({ seconds: 3 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages || 1) !== 1) throw new Error("image");
    const output = await image.rotate().webp({ lossless: true, effort: 2 }).toBuffer();
    if (!output.length || output.length > workerData.limit) throw new Error("size");
    parentPort.postMessage({ kind: "image", mime: "image/webp", extension: "webp", inputMime: detected.mime, bytes: output });
    return;
  }
  if (detected && documents.has(detected.ext) && extension === detected.ext) {
    parentPort.postMessage({ kind: "document", mime: detected.mime, extension, inputMime: detected.mime, bytes });
    return;
  }
  if (!detected && extension === "txt") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text) || /<\s*\/?\s*(?:html|script|svg|iframe|object|embed|!doctype)\b/i.test(text)) throw new Error("text");
    parentPort.postMessage({ kind: "document", mime: "text/plain", extension, inputMime: "text/plain", bytes });
    return;
  }
  throw new Error("format");
}

run().catch(() => parentPort.postMessage({ error: true }));
`;
