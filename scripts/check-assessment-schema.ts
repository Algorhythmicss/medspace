import assert from "node:assert/strict";
import { Client } from "pg";

const deadline = setTimeout(() => {
  console.error("FAIL assessment schema preflight: deadline exceeded");
  process.exit(1);
}, 20_000);

async function main() {
  const connectionString = process.env.DATABASE_URL;
  assert(connectionString, "DATABASE_URL must be supplied explicitly");
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, query_timeout: 10_000, statement_timeout: 10_000, application_name: "medspace_assessment_schema_check" });
  client.on("error", () => {
    console.error("FAIL assessment schema preflight: connection interrupted");
    process.exit(1);
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const tables = await client.query(`
      SELECT relation.relname AS name, relation.relrowsecurity AS rls,
        (SELECT count(*)::int FROM pg_policy policy WHERE policy.polrelid = relation.oid) AS policies,
        (SELECT count(*)::int FROM aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) privilege
          LEFT JOIN pg_roles role ON role.oid = privilege.grantee
          WHERE privilege.grantee = 0 OR role.rolname IN ('anon', 'authenticated')) AS exposed,
        EXISTS (SELECT 1 FROM pg_roles role WHERE role.rolname IN ('anon', 'authenticated')
          AND has_table_privilege(role.oid, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS effective_access,
        (SELECT count(*)::int FROM pg_constraint constraint_row WHERE constraint_row.conrelid = relation.oid AND constraint_row.contype = 'c') AS checks,
        (SELECT count(*)::int FROM pg_constraint constraint_row WHERE constraint_row.conrelid = relation.oid AND constraint_row.contype = 'f') AS foreign_keys,
        (SELECT count(*)::int FROM pg_index index_row WHERE index_row.indrelid = relation.oid) AS indexes
      FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
      ORDER BY relation.relname
    `, [["InitialAssessment", "AssessmentFile", "AssessmentUploadLimit"]]);
    assert.deepEqual(tables.rows, [
      { name: "AssessmentFile", rls: true, policies: 0, exposed: 0, effective_access: false, checks: 6, foreign_keys: 1, indexes: 2 },
      { name: "AssessmentUploadLimit", rls: true, policies: 0, exposed: 0, effective_access: false, checks: 1, foreign_keys: 1, indexes: 1 },
      { name: "InitialAssessment", rls: true, policies: 0, exposed: 0, effective_access: false, checks: 6, foreign_keys: 1, indexes: 3 },
    ]);
    const patient = await client.query(`SELECT count(*)::int AS columns FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Patient' AND is_nullable = 'NO'
      AND ((column_name = 'id' AND data_type = 'text') OR (column_name = 'linkVersion' AND data_type = 'integer'))`);
    assert.equal(patient.rows[0].columns, 2);
    await client.query("COMMIT");
    console.log("PASS read-only assessment schema preflight: three private tables, constraints, indexes and ownership columns");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "configuration_or_connection";
  console.error(`FAIL assessment schema preflight: ${/^[A-Z0-9_]{1,32}$/.test(code) ? code : "configuration_or_connection"}`);
  process.exitCode = 1;
}).finally(() => clearTimeout(deadline));
