import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { instreamGuard, maximumBytes, maximumFrames } from "../ops/scanner/instream.mjs";

function frame(bytes) { const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); return Buffer.concat([length, bytes]); }
const command = Buffer.from("zINSTREAM\0"), ending = Buffer.alloc(4);
const packet = Buffer.concat([command, frame(Buffer.from("SYNTHETIC FILE")), ending]);
let checks = 0;
function check(name, test) { test(); checks += 1; console.log(`PASS ${name}`); }
check("valid INSTREAM survives every split boundary", () => {
  for (let split = 0; split <= packet.length; split += 1) {
    const writes = [], guard = instreamGuard((bytes) => writes.push(bytes));
    if (split) guard.push(packet.subarray(0, split));
    if (split < packet.length) guard.push(packet.subarray(split));
    assert(guard.complete); assert(Buffer.concat(writes).equals(packet));
  }
});
check("single-byte delivery preserves framing", () => {
  const writes = [], guard = instreamGuard((bytes) => writes.push(bytes));
  for (const byte of packet) guard.push(Buffer.from([byte]));
  assert(guard.complete); assert(Buffer.concat(writes).equals(packet));
});
check("administrative commands never reach ClamAV", () => {
  for (const input of ["zSHUTDOWN\0", "zVERSION\0garbage", "zRELOAD\0garbage", "nINSTREAM\n"]) {
    const writes = [], guard = instreamGuard((bytes) => writes.push(bytes));
    assert.throws(() => guard.push(Buffer.from(input))); assert.equal(writes.length, 0);
  }
});
check("oversized frames and signed-length confusion are rejected", () => {
  for (const length of [65537, 0xffffffff]) { const header = Buffer.alloc(4); header.writeUInt32BE(length); const guard = instreamGuard(() => {}); assert.throws(() => guard.push(Buffer.concat([command, header]))); }
});
check("aggregate content size cannot exceed four MiB", () => {
  const guard = instreamGuard(() => {}); guard.push(command);
  for (let offset = 0; offset < maximumBytes; offset += 65536) guard.push(frame(Buffer.alloc(65536)));
  assert.throws(() => guard.push(frame(Buffer.from([1]))));
});
check("tiny-frame CPU amplification is bounded", () => {
  const guard = instreamGuard(() => {}); guard.push(command);
  for (let index = 0; index < maximumFrames; index += 1) guard.push(frame(Buffer.from([1])));
  assert.throws(() => guard.push(frame(Buffer.from([1]))));
});
check("trailing and repeated commands never get forwarded", () => {
  const guard = instreamGuard(() => {}); assert.throws(() => guard.push(Buffer.concat([packet, Buffer.from("zSHUTDOWN\0")])));
  const completed = instreamGuard(() => {}); completed.push(packet); assert.throws(() => completed.push(command));
});
check("incomplete bodies cannot become completed scans", () => {
  const guard = instreamGuard(() => {}); guard.push(packet.subarray(0, -5)); assert.equal(guard.complete, false);
});
check("empty scans are rejected rather than reporting a clean file", () => {
  const guard = instreamGuard(() => {}); assert.throws(() => guard.push(Buffer.concat([command, ending])));
});

class FakeSocket extends EventEmitter {
  destroyed = false;
  writes = [];
  authorized = true;
  fingerprint = "AB".repeat(32);
  getPeerCertificate() { return { fingerprint256: this.fingerprint }; }
  write(bytes) { this.writes.push(Buffer.from(bytes)); return true; }
  end(bytes, callback) { this.write(bytes); callback?.(); return this; }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit("close"); } return this; }
}

function gateway() {
  const state = { options: null, accept: null, upstream: [], deadlines: [], server: new EventEmitter() };
  state.server.listen = (port, host) => { state.binding = { port, host }; };
  const source = ts.transpileModule(readFileSync("ops/scanner/server.mjs", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, {
    exports: {}, Buffer,
    console: { error: () => {} },
    process: { env: { MEDSPACE_SCANNER_CLIENT_SHA256: "AB".repeat(32), MEDSPACE_SCANNER_SERVER_KEY: "synthetic.key", MEDSPACE_SCANNER_SERVER_CERT: "synthetic.crt", MEDSPACE_SCANNER_CLIENT_CA: "synthetic-ca.crt" } },
    setTimeout: (callback, delay) => { assert.equal(delay, 5500); const timer = { callback, cancelled: false }; state.deadlines.push(timer); return timer; },
    clearTimeout: (timer) => { timer.cancelled = true; },
    require: (name) => {
      if (name === "node:fs") return { readFileSync: () => Buffer.from("SYNTHETIC TLS MATERIAL") };
      if (name === "node:net") return { connect: (options) => { assert.equal(options.host, "127.0.0.1"); const socket = new FakeSocket(); state.upstream.push(socket); return socket; } };
      if (name === "node:tls") return { createServer: (options, accept) => { state.options = options; state.accept = accept; return state.server; } };
      if (name === "./instream.mjs") return { instreamGuard };
      throw new Error(`Unexpected gateway dependency: ${name}`);
    },
  });
  return state;
}

check("gateway requires mTLS, pinned identity and a loopback-only default bind", () => {
  const state = gateway();
  assert.equal(state.options.requestCert, true); assert.equal(state.options.rejectUnauthorized, true); assert.equal(state.options.minVersion, "TLSv1.3");
  assert.equal(state.options.handshakeTimeout, 5000); assert.equal(state.server.maxConnections, 8); assert.equal(state.binding.host, "127.0.0.1");
  for (const client of [Object.assign(new FakeSocket(), { authorized: false }), Object.assign(new FakeSocket(), { fingerprint: "CD".repeat(32) })]) { state.accept(client); assert(client.destroyed); }
  assert.equal(state.upstream.length, 0);
});
check("gateway bounds concurrency and frees timed-out work", () => {
  const state = gateway(), first = new FakeSocket(), second = new FakeSocket(), third = new FakeSocket();
  state.accept(first); state.accept(second); state.accept(third); assert(third.destroyed); assert.equal(state.upstream.length, 2);
  state.deadlines[0].callback(); assert(first.destroyed); assert(state.upstream[0].destroyed);
  state.accept(new FakeSocket()); assert.equal(state.upstream.length, 3);
});
check("authenticated clients cannot issue ClamAV administrative commands", () => {
  const state = gateway(), client = new FakeSocket(); state.accept(client); client.emit("data", Buffer.from("zSHUTDOWN\0"));
  assert(client.destroyed); assert(state.upstream[0].destroyed); assert.equal(state.upstream[0].writes.length, 0);
});
check("premature scanner receipts never unlock an unfinished upload", () => {
  const state = gateway(), client = new FakeSocket(); state.accept(client); state.upstream[0].emit("data", Buffer.from("stream: OK\0"));
  assert(client.destroyed); assert.equal(client.writes.length, 0);
});
check("a complete scan returns only the bounded daemon verdict", () => {
  const state = gateway(), client = new FakeSocket(); state.accept(client); client.emit("data", packet);
  assert(Buffer.concat(state.upstream[0].writes).equals(packet)); state.upstream[0].emit("data", Buffer.from("stream: OK\0"));
  assert.equal(Buffer.concat(client.writes).toString(), "stream: OK\0"); assert(client.destroyed); assert(state.deadlines[0].cancelled);
});
check("malformed and oversized daemon replies are not sent to clients", () => {
  for (const reply of ["stream: unexpected ERROR\0", "x".repeat(2049) + "\0"]) {
    const state = gateway(), client = new FakeSocket(); state.accept(client); client.emit("data", packet); state.upstream[0].emit("data", Buffer.from(reply));
    assert(client.destroyed); assert.equal(client.writes.length, 0);
  }
});
console.log(`ALL PASS: ${checks} offline gateway framing checks; hosted TLS/ClamAV integration remains separate`);
