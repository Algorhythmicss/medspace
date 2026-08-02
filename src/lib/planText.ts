// Everything the patient plan says, in English and Hindi. The plan link is the
// follow-up loop's whole mechanism, and adherence dies on a screen the patient
// can't read — so the language they act on is a first-class part of the spec,
// not a nicety. The doctor sets a patient's language once (Patient.language);
// the patient can also flip it on the plan itself.

export type PlanLang = "en" | "hi";

export function toPlanLang(v: string | null | undefined): PlanLang {
  return v === "hi" ? "hi" : "en";
}

/** Translate a stored duration like "45 days" for display. Numbers stay. */
export function planDuration(duration: string, lang: PlanLang): string {
  if (lang !== "hi") return duration;
  return duration
    .replace(/\bdays?\b/gi, "दिन")
    .replace(/\bweeks?\b/gi, "सप्ताह")
    .replace(/\bmonths?\b/gi, "महीने");
}

type PlanText = {
  hello: (name: string) => string;
  careFrom: (doctor: string) => string;
  nextVisit: string;
  visitDue: string;
  // reply
  comingQ: string;
  replyComing: string;
  replyBooked: string;
  replyCant: string;
  replyThanks: string;
  // medicines
  medicines: string;
  forDuration: (d: string) => string;
  fromDoctor: string;
  // tests / reports
  testsTitle: string;
  testsSub: string;
  reports: string;
  // home reading
  homeTitle: string;
  homeSub: string;
  homeMetric: Record<"bp" | "sugar" | "weight", string>;
  save: string;
  saving: string;
  homeSaved: string;
  errInvalid: string;
  errExpired: string;
  errGeneric: string;
  // empty state
  nothingTitle: string;
  nothingSub: (doctor: string) => string;
  // google + contact
  signInTitle: string;
  signInBody: string;
  questions: string;
  call: string;
  privateNote: string;
};

export const PLAN_TEXT: Record<PlanLang, PlanText> = {
  en: {
    hello: (n) => `Hello, ${n}`,
    careFrom: (d) => `Your care plan from ${d}`,
    nextVisit: "Your next visit",
    visitDue: "Your visit is due",
    comingQ: "Are you coming for this visit?",
    replyComing: "I’ll come",
    replyBooked: "Already booked",
    replyCant: "Can’t come",
    replyThanks: "Thank you — the clinic has been told.",
    medicines: "Your medicines",
    forDuration: (d) => `for ${d}`,
    fromDoctor: "From your doctor",
    testsTitle: "Tests to get done",
    testsSub: "Please bring the reports to your visit",
    reports: "Reports on file",
    homeTitle: "Log a home reading",
    homeSub:
      "Taken your BP, sugar or weight at home? Add it here — your doctor sees it at your next visit.",
    homeMetric: { bp: "Blood pressure", sugar: "Blood sugar", weight: "Weight" },
    save: "Save",
    saving: "Saving…",
    homeSaved: "Saved — your doctor will see it.",
    errInvalid: "Please enter a valid number.",
    errExpired: "This link has expired.",
    errGeneric: "Couldn’t save — try again.",
    nothingTitle: "Nothing pending right now",
    nothingSub: (d) =>
      `When ${d} adds medicines, tests or a next visit, they will appear here.`,
    signInTitle: "Sign in for next time",
    signInBody:
      "Use your Google account and your plan opens on its own — no need to find this link again.",
    questions: "Questions about your care?",
    call: "Call",
    privateNote: "This page is private to you. Please don’t forward the link.",
  },
  hi: {
    hello: (n) => `नमस्ते, ${n}`,
    careFrom: (d) => `${d} की ओर से आपकी देखभाल योजना`,
    nextVisit: "आपकी अगली मुलाक़ात",
    visitDue: "आपकी मुलाक़ात बाकी है",
    comingQ: "क्या आप इस मुलाक़ात के लिए आ रहे हैं?",
    replyComing: "मैं आऊँगा",
    replyBooked: "बुक कर लिया है",
    replyCant: "नहीं आ सकते",
    replyThanks: "धन्यवाद — क्लिनिक को बता दिया गया है।",
    medicines: "आपकी दवाइयाँ",
    forDuration: (d) => `${d} के लिए`,
    fromDoctor: "आपके डॉक्टर की ओर से",
    testsTitle: "ये जाँचें करवानी हैं",
    testsSub: "कृपया रिपोर्ट अपनी मुलाक़ात पर लेकर आएँ",
    reports: "आपकी रिपोर्ट्स",
    homeTitle: "घर की रीडिंग दर्ज करें",
    homeSub:
      "घर पर बीपी, शुगर या वज़न लिया? यहाँ जोड़ें — अगली मुलाक़ात पर आपके डॉक्टर इसे देखेंगे।",
    homeMetric: { bp: "रक्तचाप (BP)", sugar: "शुगर", weight: "वज़न" },
    save: "सेव करें",
    saving: "सेव हो रहा है…",
    homeSaved: "सेव हो गया — आपके डॉक्टर देखेंगे।",
    errInvalid: "कृपया सही संख्या दर्ज करें।",
    errExpired: "यह लिंक समाप्त हो गया है।",
    errGeneric: "सेव नहीं हो सका — फिर से कोशिश करें।",
    nothingTitle: "अभी कुछ बाकी नहीं है",
    nothingSub: (d) =>
      `जब ${d} दवाइयाँ, जाँचें या अगली मुलाक़ात जोड़ेंगे, वे यहाँ दिखेंगी।`,
    signInTitle: "अगली बार के लिए साइन इन करें",
    signInBody:
      "अपने Google अकाउंट से साइन इन करें और आपकी योजना अपने आप खुलेगी — दोबारा यह लिंक ढूँढने की ज़रूरत नहीं।",
    questions: "अपनी देखभाल के बारे में कोई सवाल?",
    call: "कॉल करें",
    privateNote: "यह पेज केवल आपके लिए है। कृपया यह लिंक किसी और को न भेजें।",
  },
};
