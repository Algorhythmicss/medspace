// WhatsApp is the delivery channel this whole product leans on, so a
// malformed number must fail loudly (no button) rather than quietly producing
// a wa.me link that opens to "phone number shared via url is invalid".
//
// Found in the wild: a clinic phone stored as "+91 98XXXXXX21" stripped down
// to "919821" and produced https://wa.me/91919821.

const IN_COUNTRY = "91";

/** Strip formatting, the country code, and a trunk 0 — without judging whether
 *  what's left is a valid mobile. Shared by every other function here so the
 *  stored form, the search term, and the wa.me link can never disagree. */
function bareDigits(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 12 && d.startsWith(IN_COUNTRY)) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

/** Digits only, country code removed, or null when it isn't a usable mobile. */
export function normaliseIndianMobile(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = bareDigits(phone);
  // Indian mobiles are 10 digits starting 6-9. Anything else is a landline,
  // a placeholder, or mistyped — and must not become a WhatsApp link.
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return d;
}

/** The form a phone must be STORED in.
 *
 *  Phones used to be stored exactly as typed, which quietly broke the two things
 *  that matter most: searching by phone, and spotting that a walk-in already has
 *  a record. "+91 98765 43101" and "9876543101" are one patient, but no substring
 *  match relates them — so the front desk starts a second, empty history and the
 *  memory card, the whole point of the product, shows half a life.
 *
 *  A real mobile is canonicalised to 10 digits. Anything else — a landline, a
 *  partial number, a foreign number — is kept as typed rather than dropped: it is
 *  still the only way to reach that patient, even if it can't be a WhatsApp link. */
export function storablePhone(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  return normaliseIndianMobile(raw) ?? raw;
}

/** A phone-shaped search query reduced to the digits worth matching against
 *  stored numbers, so a doctor pasting "+91 98765-43101" finds "9876543101".
 *  Null when the query holds no digits (a name search — skip the phone clause). */
export function phoneQuery(q: string): string | null {
  return bareDigits(q) || null;
}

export function waLink(phone: string | null | undefined, text?: string): string | null {
  const d = normaliseIndianMobile(phone);
  if (!d) return null;
  const base = `https://wa.me/${IN_COUNTRY}${d}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function telLink(phone: string | null | undefined): string | null {
  const d = normaliseIndianMobile(phone);
  return d ? `tel:+${IN_COUNTRY}${d}` : null;
}
