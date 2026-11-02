import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { createServer } from "node:tls";
import { instreamGuard } from "./instream.mjs";

const port = Number(process.env.MEDSPACE_SCANNER_PORT || "3311");
const upstreamPort = Number(process.env.MEDSPACE_SCANNER_UPSTREAM_PORT || "3310");
const fingerprint = (process.env.MEDSPACE_SCANNER_CLIENT_SHA256 || "").replaceAll(":", "").toUpperCase();
if (!/^[A-F0-9]{64}$/.test(fingerprint) || ![port, upstreamPort].every((value) => Number.isInteger(value) && value >= 1024 && value <= 65535) || port === upstreamPort) throw new Error("Scanner gateway configuration is incomplete");
const requiredFile = (name) => {
  const path = process.env[name];
  if (!path) throw new Error("Scanner TLS identity files are required");
  const value = readFileSync(path);
  if (!value.length || value.length > 65536) throw new Error("Scanner TLS identity file size is invalid");
  return value;
};
let active = 0;
const server = createServer({
  key: requiredFile("MEDSPACE_SCANNER_SERVER_KEY"),
  cert: requiredFile("MEDSPACE_SCANNER_SERVER_CERT"),
  ca: requiredFile("MEDSPACE_SCANNER_CLIENT_CA"),
  requestCert: true,
  rejectUnauthorized: true,
  minVersion: "TLSv1.3",
  handshakeTimeout: 5000,
}, (client) => {
  const peer = (client.getPeerCertificate().fingerprint256 || "").replaceAll(":", "").toUpperCase();
  if (!client.authorized || peer !== fingerprint || active >= 2) { client.destroy(); return; }
  active += 1;
  let finished = false, response = "";
  const upstream = connect({ host: "127.0.0.1", port: upstreamPort });
  const finish = () => {
    if (finished) return;
    finished = true; clearTimeout(deadline); active -= 1; upstream.destroy(); client.destroy();
  };
  const deadline = setTimeout(finish, 5500);
  const guard = instreamGuard((bytes) => { upstream.write(bytes); });
  client.on("data", (bytes) => { if (finished) return; try { guard.push(bytes); } catch { finish(); } });
  client.on("error", finish); client.on("close", finish);
  upstream.on("error", finish);
  upstream.on("close", () => { if (!finished && !response) finish(); });
  upstream.on("data", (bytes) => {
    if (finished) return;
    if (!guard.complete) { finish(); return; }
    response += bytes.toString("utf8");
    if (response.length > 2048) { finish(); return; }
    if (!response.includes("\0") && !response.includes("\n")) return;
    const verdict = response.replace(/\0|\r|\n/g, "");
    if (verdict !== "stream: OK" && !/^stream: .+ FOUND$/.test(verdict)) { finish(); return; }
    client.end(`${verdict}\0`, finish);
  });
});
server.maxConnections = 8;
server.on("tlsClientError", () => {});
server.on("error", () => { console.error("Scanner gateway could not accept connections"); process.exitCode = 1; });
server.listen(port, process.env.MEDSPACE_SCANNER_BIND || "127.0.0.1");
