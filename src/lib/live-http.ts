import { NextResponse } from "next/server";
import { AssessmentError } from "@/lib/assessment";
import { ClinicError } from "@/lib/live-clinic";
export const liveHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};
export function liveJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: liveHeaders });
}
export function liveFailure(error: unknown) {
  if (error instanceof ClinicError || error instanceof AssessmentError)
    return liveJson(
      { ok: false, code: error.code, message: error.message },
      error.status,
    );
  console.error("live clinic request failed");
  return liveJson(
    {
      ok: false,
      code: "unavailable",
      message:
        "The clinic could not confirm this update. Keep this page open and retry the same action.",
    },
    503,
  );
}
export async function boundedJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ClinicError(
      415,
      "content_type",
      "Please use the clinic controls.",
    );
  if (
    request.headers.get("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new ClinicError(
      415,
      "encoding",
      "Compressed requests are not accepted.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new ClinicError(400, "empty", "The request is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0,
    expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel();
  }, 5000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new ClinicError(413, "size", "That request is too large.");
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
      "The request took too long. Please retry the same action.",
    );
  let result;
  try {
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ClinicError(400, "json", "The request could not be read.");
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new ClinicError(400, "json", "The request could not be read.");
  return result;
}
