import { differenceInDays, differenceInMonths, differenceInYears, format } from "date-fns";

export function relDay(date: Date, now = new Date()): string {
  const days = differenceInDays(now, date);
  if (days < 0) {
    const ahead = -days;
    if (ahead === 0) return "today";
    if (ahead === 1) return "tomorrow";
    return `in ${ahead}d`;
  }
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days}d ago`;
  const months = differenceInMonths(now, date);
  if (months < 12) return `${months}mo ago`;
  return `${differenceInYears(now, date)}y ago`;
}

export function overdueDays(due: Date, now = new Date()): number {
  return differenceInDays(now, due);
}

export function shortDate(date: Date): string {
  return format(date, "d MMM yyyy");
}

export function patientAgeSex(p: { dob: Date | null; ageYears: number | null; sex: string | null }): string {
  const age = p.dob ? differenceInYears(new Date(), p.dob) : p.ageYears;
  return [age != null ? `${age}` : null, p.sex].filter(Boolean).join(" ");
}
