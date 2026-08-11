// A malformed number must produce NO link rather than a broken one. The bug
// this guards: a clinic phone stored as "+91 98XXXXXX21" stripped to "919821"
// and shipped https://wa.me/91919821 into a patient's WhatsApp.
import {
  waLink,
  telLink,
  normaliseIndianMobile,
  storablePhone,
  phoneQuery,
} from "../src/lib/phone";

function expect(cond: boolean, label: string) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exitCode = 1; }
  else console.log(`ok: ${label}`);
}

expect(normaliseIndianMobile("9876543101") === "9876543101", "plain 10-digit mobile passes");
expect(normaliseIndianMobile("+91 98450 12345") === "9845012345", "spaced +91 form is normalised");
expect(normaliseIndianMobile("+919845012345") === "9845012345", "compact +91 form is normalised");
expect(normaliseIndianMobile("09845012345") === "9845012345", "leading trunk 0 is dropped");
expect(normaliseIndianMobile("0091 9845012345") === "9845012345", "00 international prefix is dropped");

expect(normaliseIndianMobile("+91 98XXXXXX21") === null, "masked placeholder is rejected (the real bug)");
expect(normaliseIndianMobile("12345") === null, "too short is rejected");
expect(normaliseIndianMobile("1234567890") === null, "landline-style leading 1 is rejected");
expect(normaliseIndianMobile("") === null, "empty is rejected");
expect(normaliseIndianMobile(null) === null, "null is rejected");

expect(waLink("+91 98XXXXXX21") === null, "no WhatsApp link from a masked number");
expect(waLink("9845012345") === "https://wa.me/919845012345", "clean wa.me link");
expect(
  waLink("9845012345", "hi there")?.includes("?text=hi%20there") === true,
  "message text is encoded into the link"
);
expect(telLink("+91 98XXXXXX21") === null, "no tel: link from a masked number");
expect(telLink("9845012345") === "tel:+919845012345", "clean tel: link");

// ── storablePhone: one patient, one representation ────────────────────────────
// The bug this guards: phones stored as typed, so "+91 98765 43101" and
// "9876543101" were two different patients as far as search and duplicate
// detection were concerned — and the second record starts an empty history.
expect(storablePhone("+91 98765 43101") === "9876543101", "formatted mobile is stored canonical");
expect(storablePhone("9876543101") === "9876543101", "already-canonical mobile is unchanged");
expect(storablePhone("  9876543101  ") === "9876543101", "surrounding space is trimmed");
expect(
  storablePhone("+91 98765 43101") === storablePhone("09876543101"),
  "two spellings of one number converge on one stored value"
);
// Not a mobile — but still the only way to reach this patient, so it must survive.
expect(storablePhone("0522-2345678") === "0522-2345678", "landline is kept as typed, not dropped");
expect(storablePhone("+1 415 555 0132") === "+1 415 555 0132", "foreign number is kept as typed");
expect(storablePhone("98765") === "98765", "partial number is kept rather than lost");
expect(storablePhone("") === null, "blank stores NULL, not an empty string");
expect(storablePhone("   ") === null, "whitespace-only stores NULL");
expect(storablePhone(null) === null, "null stays null");

// ── phoneQuery: a pasted number has to match a stored one ─────────────────────
expect(phoneQuery("+91 98765-43101") === "9876543101", "formatted query reduces to digits");
expect(phoneQuery("09876543101") === "9876543101", "trunk 0 stripped from a query");
expect(phoneQuery("98765") === "98765", "partial query stays a usable prefix");
expect(phoneQuery("Verma") === null, "a name query yields no phone term");
expect(phoneQuery("") === null, "an empty query yields no phone term");
// The round trip that matters: what the doctor pastes must find what was stored.
expect(
  storablePhone("+91 98765 43101")!.includes(phoneQuery("+91 98765-43101")!),
  "a pasted formatted number substring-matches the stored form"
);

console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
