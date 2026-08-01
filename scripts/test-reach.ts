// The reach rules decide whether the doctor sends another link or picks up the
// phone. Getting "silent" wrong in either direction is expensive: too eager and
// the doctor calls people who are fine, too slow and a patient quietly drops
// out of follow-up while the app keeps reporting messages as if they landed.
import { planReach, type ReachInput } from "../src/lib/reach";

function expect(cond: boolean, label: string) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exitCode = 1; }
  else console.log(`ok: ${label}`);
}

const NOW = new Date("2026-07-31T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

const base: ReachInput = {
  planShareCount: 0,
  planSharedAt: null,
  planOpenCount: 0,
  planLastOpenedAt: null,
};
const reach = (p: Partial<ReachInput>) => planReach({ ...base, ...p }, NOW);

// never sent
expect(reach({}).state === "never", "no share recorded reads as never sent");
expect(reach({}).callFirst === false, "never sent does not push the doctor to call");

// opened — the good case, and it wins over everything else
expect(
  reach({ planShareCount: 4, planSharedAt: daysAgo(9), planOpenCount: 1, planLastOpenedAt: daysAgo(8) }).state ===
    "opened",
  "a single open outranks any number of sends"
);
expect(
  reach({ planShareCount: 1, planSharedAt: daysAgo(2), planOpenCount: 3, planLastOpenedAt: daysAgo(1) }).label ===
    "Opened yesterday",
  "opened label carries the last open, not the send"
);
expect(
  reach({ planShareCount: 9, planSharedAt: daysAgo(9), planOpenCount: 2, planLastOpenedAt: daysAgo(1) }).callFirst ===
    false,
  "someone who opens links is never pushed to a phone call"
);

// waiting — sent once, recently, no open. Normal; say nothing alarming.
const waiting = reach({ planShareCount: 1, planSharedAt: daysAgo(1) });
expect(waiting.state === "waiting", "one send yesterday is still waiting, not silent");
expect(waiting.callFirst === false, "waiting does not trigger the call nudge");
expect(waiting.label === "Sent yesterday · not opened yet", "waiting label is factual, not alarming");
expect(reach({ planShareCount: 1, planSharedAt: daysAgo(0) }).state === "waiting", "sent today is waiting");

// silent — the case the whole feature exists for
expect(
  reach({ planShareCount: 2, planSharedAt: daysAgo(0) }).state === "silent",
  "a second send with no open is silent even if it was minutes ago"
);
expect(
  reach({ planShareCount: 1, planSharedAt: daysAgo(3) }).state === "silent",
  "one send, three days, no open is silent"
);
expect(reach({ planShareCount: 1, planSharedAt: daysAgo(2) }).state === "waiting", "two days is still inside the grace window");
expect(reach({ planShareCount: 3, planSharedAt: daysAgo(5) }).callFirst === true, "silent tells the doctor to call");
expect(
  reach({ planShareCount: 3, planSharedAt: daysAgo(5) }).label === "Sent 3× · never opened",
  "repeat sends are counted in the label so the waste is visible"
);
expect(
  reach({ planShareCount: 1, planSharedAt: daysAgo(6) }).label === "Sent 6d ago · never opened",
  "a single stale send reads as time, not a count of one"
);

// reply — stated intent overrides every open-based guess
expect(
  reach({ planReplyKind: "coming" }).reply === "coming" && reach({ planReplyKind: "coming" }).tone === "ok",
  "a 'coming' reply reads ok"
);
expect(
  reach({ planReplyKind: "booked" }).label === "Replied: already booked",
  "a 'booked' reply is labelled as booked"
);
expect(reach({ planReplyKind: "coming" }).callFirst === false, "a patient who says they're coming is not called");
expect(
  reach({ planReplyKind: "not_coming" }).callFirst === true && reach({ planReplyKind: "not_coming" }).tone === "warn",
  "a 'not coming' reply is the one that pushes a call"
);
// a reply beats even a silent send record
expect(
  reach({ planShareCount: 4, planSharedAt: daysAgo(5), planReplyKind: "coming" }).state === "opened",
  "an explicit reply overrides a silent send history"
);

// inconsistent data must not crash or claim a send happened
expect(reach({ planShareCount: 5, planSharedAt: null }).state === "never", "a count with no timestamp fails closed to never");
expect(
  reach({ planOpenCount: 2, planLastOpenedAt: null }).state === "opened",
  "an open with no timestamp still counts as opened"
);
expect(reach({ planOpenCount: 2, planLastOpenedAt: null }).label === "Opened", "…and drops the date rather than inventing one");

console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
