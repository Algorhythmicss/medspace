import assert from "node:assert/strict";
import { checkLiveAssessment } from "./check-live-assessment.mjs";

let checks = 0;
async function check(name, test) { await test(); checks += 1; console.log(`PASS ${name}`); }
const privateHeaders = { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store, max-age=0", "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'", "Cross-Origin-Resource-Policy": "same-origin", "X-Frame-Options": "DENY" };
function responses(alter = () => {}) {
  const calls = [];
  return { calls, fetch: async (url, options) => {
    calls.push({ url, options });
    const response = { status: url.endsWith("/welcome") ? 200 : options.method === "POST" ? 401 : 404, headers: { ...privateHeaders } };
    alter(response, url);
    return new Response("SYNTHETIC RESPONSE", response);
  } };
}

await check("monitor sends only fixed unauthenticated, bounded probes", async () => {
  const fake = responses(); const result = await checkLiveAssessment("https://synthetic.invalid", fake.fetch);
  assert.equal(result.ok, true); assert.equal(result.checks.length, 3); assert.equal(fake.calls.length, 3);
  for (const { options } of fake.calls) { assert.equal(options.redirect, "manual"); assert(options.signal); assert(!options.headers?.Authorization); assert(!options.headers?.Cookie); assert(!options.body); }
});
await check("credentials, signed paths, query strings and plaintext origins are rejected", async () => {
  for (const origin of ["https://user:secret@synthetic.invalid", "https://synthetic.invalid/p/token", "https://synthetic.invalid/?token=secret", "https://synthetic.invalid/#secret", "http://synthetic.invalid"]) {
    const fake = responses(); await assert.rejects(() => checkLiveAssessment(origin, fake.fetch)); assert.equal(fake.calls.length, 0);
  }
});
await check("service failures and login redirects cannot pass as availability", async () => {
  for (const status of [302, 403, 500, 503]) await assert.rejects(() => checkLiveAssessment("https://synthetic.invalid", responses((response) => { response.status = status; }).fetch));
});
await check("cacheable private denials fail the monitor", async () => {
  await assert.rejects(() => checkLiveAssessment("https://synthetic.invalid", responses((response) => { response.headers["Cache-Control"] = "public, max-age=3600"; }).fetch));
});
await check("missing file sandbox protections fail the monitor", async () => {
  await assert.rejects(() => checkLiveAssessment("https://synthetic.invalid", responses((response) => { delete response.headers["Content-Security-Policy"]; }).fetch));
});
await check("network failure remains failure rather than a false healthy state", async () => {
  await assert.rejects(() => checkLiveAssessment("https://synthetic.invalid", async () => { throw new Error("SYNTHETIC network failure"); }));
});
console.log(`ALL PASS: ${checks} offline public-monitor controls; no live uptime check claimed`);
