# MedSpace workflows

## Original app live journey — 3 November 2026

1. Reception finds or registers the patient, confirms shared-phone duplicates, checks them in, records permitted vitals and shares their queue-only QR/link.
2. The patient opens the ticket to see only their number, position and approximate wait. The doctor's separate care link also shows this patient's live queue and existing intake.
3. The doctor configures average consultation time, pauses/resumes, reviews pending assessments/photos, calls one patient and starts the consultation. Reception cannot take clinical actions.
4. During the consultation the doctor records, stops, previews/discards and explicitly shares a short voice message with the named patient. The doctor completes the existing visit/Rx form and can request up to three still progress photos for the next follow-up.
5. Saving commits the visit, prescription/tasks, photo request and queue completion together. Retries reuse the same command ID. Other screens refresh from saved server state, including prescriptions on an already-open patient page and new intake on an already-open doctor chart.
6. The patient opens the separate private care plan for the shared message, approved instructions and assigned progress-photo upload. Only the doctor reviews those images. A return visit creates a new arrival; previous records and numbers remain.

Offline views visibly become stale. Hidden pages stop polling and refresh on focus. A consultation may cross Indian midnight; returning it to waiting after midnight allocates today's number. Documents stay quarantined without a private scanner. See [LIVE_CLINIC.md](LIVE_CLINIC.md) for authorization and failure behavior.

