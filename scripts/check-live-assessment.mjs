import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export async function checkLiveAssessment(value, fetchRequest = fetch) {
  const parsed = new URL(value);
  assert(parsed.protocol === "https:" && !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash, "Provide a credential-free HTTPS origin");
  const origin = parsed.origin;
  const probes = [
    { name: "public-entry", path: "/welcome", status: 200 },
    { name: "anonymous-assessment-denial", path: "/api/patient/assessment", status: 401, private: true, options: { method: "POST", headers: { Origin: origin } } },
    { name: "anonymous-file-denial", path: "/api/assessment-files/csynthetic00000000000000", status: 404, private: true, sandbox: true },
  ];
  const checks = [];
  for (const probe of probes) {
    const response = await fetchRequest(origin + probe.path, { ...probe.options, redirect: "manual", signal: AbortSignal.timeout(10000) });
    try {
      assert.equal(response.status, probe.status, probe.name);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", probe.name);
      if (probe.private) assert.match(response.headers.get("cache-control") || "", /private.*no-store/, probe.name);
      if (probe.sandbox) {
        assert.match(response.headers.get("content-security-policy") || "", /default-src 'none'; sandbox/);
        assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
        assert.equal(response.headers.get("x-frame-options"), "DENY");
      }
      checks.push({ name: probe.name, status: response.status });
    } finally {
      await response.body?.cancel();
    }
  }
  return { ok: true, scope: "public unauthenticated surface only; not a database or authenticated workflow health check", checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkLiveAssessment(process.argv[2] || "").then((result) => console.log(JSON.stringify(result))).catch(() => {
    console.error("FAIL public assessment health checks; inspect the deployment without disclosing patient data");
    process.exitCode = 1;
  });
}
