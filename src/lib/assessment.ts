export const ASSESSMENT_VERSION = 1;
export const ASSESSMENT_ANSWER_LIMIT = 2000;
export const ASSESSMENT_FILE_LIMIT = 3;
export const ASSESSMENT_FILE_BYTES = 2 * 1024 * 1024;
export const ASSESSMENT_TOTAL_BYTES = 3 * 1024 * 1024;
export const ASSESSMENT_BODY_BYTES = ASSESSMENT_TOTAL_BYTES + 64 * 1024;
export const ASSESSMENT_STORAGE_BYTES = 24 * 1024 * 1024;
export const ASSESSMENT_PENDING_LIMIT = 3;
export const ASSESSMENT_DAILY_LIMIT = 3;
export const ASSESSMENT_HOURLY_ATTEMPTS = 12;

export const ASSESSMENT_QUESTIONS = {
  en: [
    { key: "concern", label: "What would you like to discuss with the doctor?", hint: "Describe your main concern in your own words." },
    { key: "duration", label: "When did it start, and what has changed?", hint: "Include how long it has been happening and any changes you have noticed." },
    { key: "context", label: "What medicines, allergies or past conditions should the doctor know about?", hint: "Include anything relevant. You can write ‘none’ or ‘not sure’." },
  ],
  hi: [
    { key: "concern", label: "आप डॉक्टर से किस बारे में बात करना चाहते हैं?", hint: "अपनी मुख्य परेशानी अपने शब्दों में बताएँ।" },
    { key: "duration", label: "यह कब शुरू हुआ और क्या बदलाव आया है?", hint: "कितने समय से है और आपको क्या बदलाव महसूस हुए हैं, बताएँ।" },
    { key: "context", label: "डॉक्टर को किन दवाइयों, एलर्जी या पुरानी बीमारियों के बारे में जानना चाहिए?", hint: "ज़रूरी जानकारी दें। आप ‘कोई नहीं’ या ‘पता नहीं’ भी लिख सकते हैं।" },
  ],
} as const;

export const ASSESSMENT_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.avif,.tif,.tiff,.pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.rtf,.txt";

export type AssessmentAnswers = { concern: string; duration: string; context: string };
export type AssessmentFileSummary = { id: string; name: string; scanStatus: string };
export type AssessmentSummary = AssessmentAnswers & {
  id: string;
  status: string;
  createdAt: string;
  files: AssessmentFileSummary[];
};

export class AssessmentError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "AssessmentError";
  }
}

export function assessmentAnswers(form: FormData): AssessmentAnswers {
  const answers = {} as AssessmentAnswers;
  for (const { key } of ASSESSMENT_QUESTIONS.en) {
    const values = form.getAll(key);
    const value = values[0];
    if (values.length !== 1 || typeof value !== "string") {
      throw new AssessmentError(400, "answers", "Please answer all three questions.");
    }
    const normalized = value.normalize("NFC").trim();
    if (!normalized || normalized.length > ASSESSMENT_ANSWER_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(normalized)) {
      throw new AssessmentError(400, "answers", "Each answer must be between 1 and 2,000 characters, without hidden control characters.");
    }
    answers[key] = normalized;
  }
  return answers;
}

export function downloadableAssessmentFile(status: string): boolean {
  return status === "rewritten" || status === "clean";
}
