import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { isIP } from "node:net";
import { createSecureContext } from "node:tls";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

type Verdict = "clean" | "infected" | "unavailable";
type Scenario = { env?: Record<string, string | undefined>; reply?: string[]; timeout?: boolean; connectionError?: boolean; throwConnect?: boolean; source?: string };
const originalSource = readFileSync("src/lib/assessment-scanner.ts", "utf8");

async function run(scenario: Scenario, bytes = new Uint8Array([1, 2, 3])) {
  const writes: Buffer[] = [];
  const connections: Array<{ encrypted: boolean; options: Record<string, unknown> }> = [];
  let contextOptions: Parameters<typeof createSecureContext>[0];
  const sandboxModule = { exports: {} as { scanAssessmentBytes: (value: Uint8Array) => Promise<Verdict> } };
  const connect = (encrypted: boolean) => (options: Record<string, unknown>, ready: () => void) => {
    connections.push({ encrypted, options });
    if (scenario.throwConnect) throw new Error("SYNTHETIC connection exception");
    class FakeSocket extends EventEmitter {
      destroyed = false;
      write(value: string | Uint8Array) {
        const buffer = Buffer.from(value); writes.push(buffer);
        if (buffer.length === 4 && buffer.equals(Buffer.alloc(4))) queueMicrotask(() => {
          for (const reply of scenario.reply || ["stream: OK\0"]) if (!this.destroyed) this.emit("data", Buffer.from(reply));
        });
        return true;
      }
      destroy() { this.destroyed = true; this.emit("close"); return this; }
    }
    const socket = new FakeSocket();
    queueMicrotask(() => { if (!socket.destroyed) { if (scenario.connectionError) socket.emit("error", new Error("SYNTHETIC transport failure")); else ready(); } });
    return socket;
  };
  const output = transpileModule(scenario.source || originalSource, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  runInNewContext(output, {
    module: sandboxModule, exports: sandboxModule.exports, Buffer, process: { env: scenario.env || {} },
    setTimeout: (callback: () => void, delay: number) => {
      assert.equal(delay, 6000);
      const timer = { cancelled: false };
      if (scenario.timeout) queueMicrotask(() => { if (!timer.cancelled) callback(); });
      return timer;
    },
    clearTimeout: (timer: { cancelled: boolean }) => { timer.cancelled = true; },
    require: (name: string) => {
      if (name === "node:net") return { connect: connect(false), isIP };
      if (name === "node:tls") return { connect: connect(true), createSecureContext: (options: Parameters<typeof createSecureContext>[0]) => { contextOptions = options; return createSecureContext(options); } };
      throw new Error(`Unexpected scanner dependency: ${name}`);
    },
  });
  const verdict = await sandboxModule.exports.scanAssessmentBytes(bytes);
  return { verdict, connections, writes, contextOptions };
}

async function main() {
  let checks = 0;
  const check = async (name: string, test: () => Promise<unknown>) => { await test(); checks += 1; console.log(`PASS ${name}`); };
  const local = { MEDSPACE_CLAMAV_HOST: "127.0.0.1" };
  const remote = { MEDSPACE_CLAMAV_HOST: "scanner.synthetic.invalid", MEDSPACE_CLAMAV_TLS: "true" };
  const directory = mkdtempSync(join(tmpdir(), "medspace-scanner-cert-"));
  try {
    const generated = spawnSync("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=synthetic-scanner-client", "-keyout", join(directory, "client.key"), "-out", join(directory, "client.crt")], { stdio: "ignore", timeout: 10000 });
    assert.equal(generated.status, 0, "Synthetic TLS fixture generation must succeed");
    const cert = readFileSync(join(directory, "client.crt"), "utf8"), key = readFileSync(join(directory, "client.key"), "utf8");
    const authenticated = { ...remote, MEDSPACE_CLAMAV_CLIENT_CERT: cert, MEDSPACE_CLAMAV_CLIENT_KEY: key, MEDSPACE_CLAMAV_CA_CERT: cert };
    await check("missing scanner, invalid port and remote plaintext send no bytes", async () => {
      for (const env of [{}, { ...local, MEDSPACE_CLAMAV_PORT: "0" }, { ...local, MEDSPACE_CLAMAV_PORT: "65536" }, { ...local, MEDSPACE_CLAMAV_PORT: "invalid" }, { MEDSPACE_CLAMAV_HOST: remote.MEDSPACE_CLAMAV_HOST }]) {
        const result = await run({ env }); assert.equal(result.verdict, "unavailable"); assert.equal(result.connections.length, 0);
      }
    });
    await check("remote TLS without a client identity sends no document bytes", async () => {
      const result = await run({ env: remote }); assert.equal(result.verdict, "unavailable"); assert.equal(result.writes.length, 0); assert.equal(result.connections.length, 0);
    });
    await check("partial, malformed and oversized client credentials fail before connection", async () => {
      for (const env of [{ ...remote, MEDSPACE_CLAMAV_CLIENT_CERT: cert }, { ...authenticated, MEDSPACE_CLAMAV_CLIENT_KEY: "invalid" }, { ...authenticated, MEDSPACE_CLAMAV_CLIENT_KEY: "x".repeat(65537) }]) {
        const result = await run({ env }); assert.equal(result.verdict, "unavailable"); assert.equal(result.connections.length, 0);
      }
    });
    await check("remote mTLS retains hostname and certificate verification", async () => {
      const result = await run({ env: authenticated }); assert.equal(result.verdict, "clean");
      assert.equal(result.connections[0].encrypted, true); assert.equal(result.connections[0].options.rejectUnauthorized, true);
      assert.equal(result.connections[0].options.servername, remote.MEDSPACE_CLAMAV_HOST); assert(result.connections[0].options.secureContext);
      assert.equal(result.contextOptions?.cert, cert); assert.equal(result.contextOptions?.key, key); assert.equal(result.contextOptions?.ca, cert);
    });
    await check("loopback development keeps bounded INSTREAM framing", async () => {
      const result = await run({ env: local }); assert.equal(result.verdict, "clean"); assert.equal(result.connections[0].encrypted, false);
      assert.equal(Buffer.concat(result.writes).toString("hex"), Buffer.concat([Buffer.from("zINSTREAM\0"), Buffer.from([0, 0, 0, 3, 1, 2, 3]), Buffer.alloc(4)]).toString("hex"));
    });
    await check("TLS to an IP never sends an invalid IP SNI name", async () => {
      const result = await run({ env: { ...local, MEDSPACE_CLAMAV_TLS: "true" } }); assert.equal(result.verdict, "clean"); assert.equal(result.connections[0].options.servername, undefined); assert.equal(result.connections[0].options.rejectUnauthorized, true);
    });
    await check("empty and over-limit scan requests open no connection", async () => {
      for (const bytes of [new Uint8Array(), new Uint8Array(4 * 1024 * 1024 + 1)]) { const result = await run({ env: local }, bytes); assert.equal(result.verdict, "unavailable"); assert.equal(result.connections.length, 0); }
    });
    await check("fragmented exact clean and infected receipts are distinguished", async () => {
      assert.equal((await run({ env: local, reply: ["stream: ", "OK\0"] })).verdict, "clean");
      assert.equal((await run({ env: local, reply: ["stream: Synthetic-Test FOUND\0"] })).verdict, "infected");
    });
    await check("errors, extra receipts and oversized replies cannot become clean", async () => {
      for (const reply of ["stream: unexpected ERROR\0", "stream: OK\0extra", "x".repeat(2049) + "\0", "stream: OKAY\0"]) assert.equal((await run({ env: local, reply: [reply] })).verdict, "unavailable");
    });
    await check("timeouts and connection failures fail closed", async () => {
      for (const scenario of [{ timeout: true }, { connectionError: true }, { throwConnect: true }]) assert.equal((await run({ env: local, ...scenario })).verdict, "unavailable");
    });
    await check("client-identity omission mutation is detected", async () => {
      const guard = 'if (!local && (!cert || !key)) return "unavailable";'; assert(originalSource.includes(guard));
      const mutant = originalSource.replace(guard, "");
      const oracle = async (source: string) => assert.equal((await run({ env: remote, source })).connections.length, 0);
      await oracle(originalSource); await assert.rejects(() => oracle(mutant), assert.AssertionError);
    });
    console.log(`ALL PASS: ${checks} socket-isolated scanner transport checks; no real handshake or network scan claimed`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
