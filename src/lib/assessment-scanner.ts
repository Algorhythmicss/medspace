import { connect as connectTcp, isIP, type Socket } from "node:net";
import { connect as connectTls, createSecureContext } from "node:tls";

export type ScanVerdict = "clean" | "infected" | "unavailable";

export async function scanAssessmentBytes(bytes: Uint8Array): Promise<ScanVerdict> {
  const host = process.env.MEDSPACE_CLAMAV_HOST;
  const port = Number(process.env.MEDSPACE_CLAMAV_PORT || "3310");
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return "unavailable";
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!local && process.env.MEDSPACE_CLAMAV_TLS !== "true") return "unavailable";
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) return "unavailable";
  const cert = process.env.MEDSPACE_CLAMAV_CLIENT_CERT;
  const key = process.env.MEDSPACE_CLAMAV_CLIENT_KEY;
  const ca = process.env.MEDSPACE_CLAMAV_CA_CERT;
  if (!local && (!cert || !key)) return "unavailable";
  if (!!cert !== !!key || [cert, key, ca].some((value) => value && value.length > 65536)) return "unavailable";
  let secureContext: ReturnType<typeof createSecureContext> | undefined;
  if (process.env.MEDSPACE_CLAMAV_TLS === "true") {
    try {
      secureContext = createSecureContext({ cert, key, ca });
    } catch {
      return "unavailable";
    }
  }

  return new Promise((resolve) => {
    let socket: Socket;
    let finished = false;
    let reply = "";
    const finish = (verdict: ScanVerdict) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve(verdict);
    };
    const timer = setTimeout(() => finish("unavailable"), 6000);
    const send = () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
        const chunk = bytes.subarray(offset, offset + 64 * 1024);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    };
    try {
      socket = process.env.MEDSPACE_CLAMAV_TLS === "true"
        ? connectTls({ host, port, servername: isIP(host) ? undefined : host, rejectUnauthorized: true, secureContext }, send)
        : connectTcp({ host, port }, send);
      socket.on("error", () => finish("unavailable"));
      socket.on("data", (chunk: Buffer) => {
        reply += chunk.toString("utf8");
        if (reply.length > 2048) return finish("unavailable");
        if (!reply.includes("\0") && !reply.includes("\n")) return;
        const result = reply.replace(/\0|\r|\n/g, "");
        if (result === "stream: OK") finish("clean");
        else if (/^stream: .+ FOUND$/.test(result)) finish("infected");
        else finish("unavailable");
      });
      socket.on("close", () => finish("unavailable"));
    } catch {
      finish("unavailable");
    }
  });
}
