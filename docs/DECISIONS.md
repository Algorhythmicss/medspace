# MedSpace decisions

## Authorized live flow — 3 November 2026

The founder's explicit request supersedes the earlier prohibition on numbered arrival tickets and rough ETAs. This is a walk-in single-doctor queue. Use a stable daily number and a separate current position. ETA uses the configured average plus max(5 minutes, 50 percent) per person ahead, includes the current consultation with a nonzero overrun reserve and rounds up to five minutes. Hide ETA while paused, stale or unconfigured. No typical consultation time is invented from interviews.

Reception issues a 24-hour `queue` credential tied to one arrival and patient link version. It cannot authorize clinical records, media, Google binding or patient sessions. The doctor shares the separate private care plan. Use existing database storage with bounded uploads, worker parsing and deny-all RLS; add no paid service. Voice means a short doctor message with preview/share, not continuous consultation capture or transcription. Preserve collected media when the live feature is disabled or patients are merged.

