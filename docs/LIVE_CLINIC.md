# Live clinic flow — 3 November 2026

## Authorized scope

The founder requested live staff check-in, doctor updates, private patient queue number/position and conservative ETA, a doctor-controlled average consultation time, assigned follow-up progress photos, and doctor-recorded audio shared with the patient. Keep the interface minimal. Finish independently and test doctor, patient and staff together in three separate browser sessions.

Paid private malware scanning is explicitly deferred due to budget. Keep document quarantine and add no paid service or new provider. Use the existing app/database architecture. Patient-reported photos and answers stay distinct from clinician findings. Audio defaults to a short doctor message/instructions, previewed and explicitly shared; continuous consultation recording is not selected.

## Product contract

- Reception can explicitly issue a private queue-only QR/link valid for 24 hours and tied to one arrival and patient-link version. Its signed kind cannot open the clinical care plan, upload photos or fetch voice messages. Existing care links retain their clinical access; the doctor shares those separately.
- Staff can find/register and check in a patient, record permitted vitals, and remove a waiting arrival. They cannot call/start/finish consultations, read clinical answers, listen to doctor messages or change time settings.
- Each arrival gets a stable daily number. Position is live, separate from that number. Duplicate clicks/retries cannot create another patient or active arrival. Rejoining goes to the end; cancellation never reuses a number. A called/active consultation can cross midnight. Returning it to waiting after midnight creates a new arrival with today’s number, preserving the previous arrival history.
- One doctor can call or consult one patient at a time. Actions use authoritative transactional state; stale/conflicting actions are rejected visibly. Completing the visit advances the queue atomically with the existing prescription/task writes.
- The doctor controls average consultation minutes and clinic pause/resume. A conservative estimate includes a buffer and the current consultation, is rounded outward, visibly approximate and withdrawn when paused or stale. It is not an appointment, guarantee or clinical urgency ranking. No estimate appears until the doctor sets an average.
- Patient queue data contains only their own number, state, position and aggregate people ahead. Other patient identities, notes, photos and messages are excluded at the server boundary.
- Open care plans and charts refresh their server-rendered prescription/intake content when their own care fingerprint changes. Doctor home summaries refresh when queue membership/stages change. Visible role pages refresh from the same server state, pause polling when hidden and refresh on focus. Failed updates display a stale/offline state; they never fabricate queue progress or preserve a confident ETA. Lost mutation responses retain the same command ID for safe retry.
- Progress photos are enabled only by an explicit doctor request attached to a follow-up. Accept bounded verified still images and rewrite them before storage; no documents, video or AI interpretation. Patients see submission/review status. Doctors review the original patient-reported evidence. Closure/quotas/revocation are enforced server-side.
- The doctor can record a short message, stop, preview, discard, then explicitly share with the named patient. Permission denial, unavailable hardware/codec, interruption, over-limit audio and failed upload have clear recovery. Stop microphone tracks on leaving the recorder. Never record automatically or label a draft as sent.
- Shared audio is private to the doctor and owning patient, with source/time retained. Draft recordings are not exposed. Staff and other patients cannot fetch any media. Existing patient-link revocation also revokes media access.

## Required edge cases and verification

Exercise duplicate registration/check-in, concurrent doctor calls, stale commands, a committed action with a lost response, cancellation/rejoin, no active patient, pause/resume, average changes, overrun, midnight and yesterday's waiting entries, missing average, delayed/out-of-order polling, hidden tabs, offline recovery, revoked/wrong-kind links and role-swapped credentials.

Verify assigned/unassigned photos, caps, corrupt/spoofed/animated/oversized inputs, duplicate uploads, closed/completed follow-up, review status and cross-patient denial. Verify real browser recording with synthetic microphone input, preview/discard/share, metadata/size/type bounds, patient playback, permission denial and wrong-owner/staff access.

Run the full staff → doctor → patient journey concurrently in three isolated browser contexts, including a return/follow-up journey and phone layouts. Use only disposable local or the already approved isolated synthetic hosted target. Apply additive schema changes there first; never use clinical records as fixtures. Before any production publication, verify the exact schema/build/native-worker packaging and deployed SHA/alias, and check bounded logs. Physical device and clinician acceptance remain separate proof levels.
