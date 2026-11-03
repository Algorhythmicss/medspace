import assert from "node:assert/strict";
import { Client } from "pg";

const deadline = setTimeout(() => {
  console.error("FAIL live clinic schema preflight: deadline exceeded");
  process.exit(1);
}, 20_000);

async function main() {
  const connectionString = process.env.DATABASE_URL;
  assert(connectionString, "DATABASE_URL must be supplied explicitly");
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    application_name: "medspace_live_schema_check",
  });
  client.on("error", () => {
    console.error("FAIL live clinic schema preflight: connection interrupted");
    process.exit(1);
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const tables = await client.query(
      `
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
    `,
      [
        [
          "ClinicLiveSettings",
          "ClinicQueueDay",
          "LiveCommandReceipt",
          "ProgressPhotoRequest",
          "CareMedia",
        ],
      ],
    );
    assert.deepEqual(tables.rows, [
      {
        name: "CareMedia",
        rls: true,
        policies: 0,
        exposed: 0,
        effective_access: false,
        checks: 6,
        foreign_keys: 3,
        indexes: 4,
      },
      {
        name: "ClinicLiveSettings",
        rls: true,
        policies: 0,
        exposed: 0,
        effective_access: false,
        checks: 2,
        foreign_keys: 1,
        indexes: 1,
      },
      {
        name: "ClinicQueueDay",
        rls: true,
        policies: 0,
        exposed: 0,
        effective_access: false,
        checks: 2,
        foreign_keys: 0,
        indexes: 1,
      },
      {
        name: "LiveCommandReceipt",
        rls: true,
        policies: 0,
        exposed: 0,
        effective_access: false,
        checks: 1,
        foreign_keys: 0,
        indexes: 2,
      },
      {
        name: "ProgressPhotoRequest",
        rls: true,
        policies: 0,
        exposed: 0,
        effective_access: false,
        checks: 4,
        foreign_keys: 2,
        indexes: 3,
      },
    ]);
    const queue = await client.query(
      `SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='QueueEntry' AND indexname LIKE 'QueueEntry_%' ORDER BY indexname`,
    );
    for (const name of [
      "QueueEntry_live_number_unique",
      "QueueEntry_live_patient_unique",
      "QueueEntry_one_doctor_slot",
    ])
      assert(
        queue.rows.some(
          (row) =>
            row.indexname === name &&
            row.indexdef.includes("CREATE UNIQUE INDEX"),
        ),
        `Missing queue invariant: ${name}`,
      );
    const fields = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='QueueEntry' AND column_name=ANY($1::text[])`,
      [["dayKey", "number", "queuedAt", "calledAt", "startedAt", "revision"]],
    );
    assert.equal(fields.rowCount, 6);
    const patient =
      await client.query(`SELECT count(*)::int AS columns FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Patient' AND is_nullable = 'NO'
      AND ((column_name = 'id' AND data_type = 'text') OR (column_name = 'linkVersion' AND data_type = 'integer'))`);
    assert.equal(patient.rows[0].columns, 2);
    await client.query("COMMIT");
    console.log(
      "PASS read-only live clinic schema preflight: five private tables, constraints, indexes and ownership columns",
    );
  } finally {
    await client.end();
  }
}

main()
  .catch((error: unknown) => {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "configuration_or_connection";
    console.error(
      `FAIL live clinic schema preflight: ${/^[A-Z0-9_]{1,32}$/.test(code) ? code : "configuration_or_connection"}`,
    );
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(deadline));
