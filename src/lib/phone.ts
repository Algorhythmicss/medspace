// WhatsApp is the delivery channel this whole product leans on, so a
// malformed number must fail loudly (no button) rather than quietly producing
// a wa.me link that opens to "phone number shared via url is invalid".
//
// Found in the wild: a clinic phone stored as "+91 98XXXXXX21" stripped down
// to "919821" and produced https://wa.me/91919821.

const IN_COUNTRY = "91";

/** Digits only, country code removed, or null when it isn't a usable mobile. */
export function normaliseIndianMobile(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 12 && d.startsWith(IN_COUNTRY)) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  // Indian mobiles are 10 digits starting 6-9. Anything else is a landline,
  // a placeholder, or mistyped — and must not become a WhatsApp link.
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return d;
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
