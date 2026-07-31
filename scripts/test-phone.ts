// A malformed number must produce NO link rather than a broken one. The bug
// this guards: a clinic phone stored as "+91 98XXXXXX21" stripped to "919821"
// and shipped https://wa.me/91919821 into a patient's WhatsApp.
import { waLink, telLink, normaliseIndianMobile } from "../src/lib/phone";

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

console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
