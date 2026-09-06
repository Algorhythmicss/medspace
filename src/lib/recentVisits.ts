// The caller supplies visits newest-first. Keep the first row for each patient;
// Map construction from all pairs would silently replace it with an older row.
export function latestVisitPerPatient<T extends { patient: { id: string } }>(
  visits: T[],
  limit = 6
): T[] {
  if (limit <= 0) return [];
  const latest = new Map<string, T>();
  for (const visit of visits) {
    if (!latest.has(visit.patient.id)) latest.set(visit.patient.id, visit);
    if (latest.size === limit) break;
  }
  return [...latest.values()];
}
