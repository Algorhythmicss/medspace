import { createHash } from "node:crypto";
import type { ClinicTx } from "@/lib/live-clinic-server";
// A private invalidation fingerprint, not clinical content or an access credential.
// One database round trip lets open charts/plans refresh when their own care changes.
export async function careContentVersion(
  client: Pick<ClinicTx, "$queryRaw">,
  patientId: string,
) {
  const rows = await client.$queryRaw<Array<{ content: unknown }>>`
    SELECT jsonb_build_object(
      'visit',(SELECT id FROM "Visit" WHERE "patientId"=${patientId} ORDER BY "createdAt" DESC,id DESC LIMIT 1),
      'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,title,"dueDate") ORDER BY id),'[]'::jsonb) FROM "CarePlanTask" WHERE "patientId"=${patientId} AND status='pending'),
      'assessments',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,status,"reviewedAt") ORDER BY id),'[]'::jsonb) FROM (SELECT id,status,"reviewedAt" FROM "InitialAssessment" WHERE "patientId"=${patientId} ORDER BY "createdAt" DESC,id DESC LIMIT 5) recent),
      'history',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM "Report" WHERE "patientId"=${patientId} AND "reviewStatus"='pending'),
      'reportVersion',(SELECT jsonb_build_array(count(*),max("createdAt")) FROM "Report" WHERE "patientId"=${patientId}),
      'reading',(SELECT jsonb_build_array(id,"measuredAt",value) FROM "Observation" WHERE "patientId"=${patientId} ORDER BY "measuredAt" DESC,id DESC LIMIT 1)
    ) AS content`;
  return createHash("sha256")
    .update(JSON.stringify(rows[0].content))
    .digest("hex");
}
