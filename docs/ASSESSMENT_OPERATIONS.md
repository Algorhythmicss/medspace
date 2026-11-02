# Assessment operational readiness

## Status and authorization

The user requested completion of the remaining Git, scanning, hosted acceptance, iPhone, recovery and legacy-upload work on 2 November 2026, and specifically allowed iOS Simulator testing. This does not supply a spending cap, an approved new patient-data recipient or a clinician endorsement. No paid host, branch, key, production restore, retention purge or clinical fixture has been created during this preparation.

The working release checkout is `/Users/mac/Medspace/tmp/patient-assessment-release-20261102`. The original dirty checkout and its demo project link are preserved. The last recorded live commit remains `e0db7acb7aecc8320d703e9407aa6f8e9e371548`; the new operational changes are not pushed or deployed. Local checks, mocked transport tests, actual PostgreSQL behavior, a fresh build, hosted acceptance and clinical outcomes must remain separate claims.

Current access findings:

- GitHub's connected app still requires reauthentication. Vercel is not confirmed connected, terminal outbound/loopback networking is blocked, and Safari control is unavailable. Do not disconnect the existing Git link while unable to verify or restore it.
- Xcode and iOS 26.5 Simulator device definitions are installed, including iPhone 17/17 Pro. `simctl` cannot connect to CoreSimulatorService in this session, and Simulator UI control is not approved. No simulator test has passed; no device was reset or erased.
- The local Docker socket is inaccessible. Existing local preview port 3002 is still listening, but this session cannot make loopback requests or run the database/container suites.
- Supabase's approved connector can read the original project metadata. The original project reports ACTIVE_HEALTHY, the organization reports Pro, and no development branches exist. These are management observations, not authenticated Vercel runtime or backup-restore proof.

## Legacy upload fixes prepared locally

The old report download trusted the stored MIME label and rendered selected types inline. The preparation removes that path: new report/history attachments use the shared signature/extension/MIME validation and bounded image worker before any report write. Photos become metadata-free WebP; executable/script/archive inputs are rejected. Legacy input remains capped at 4 MiB, with the image worker's 2 MiB output and 16-million-pixel limits. The initial assessment's separate 2 MiB/file and 3 MiB combined limits are unchanged.

Every legacy download is doctor-authenticated before querying file bytes, reinspects the exact stored snapshot and privately rescans documents on every read. Only rewritten images or clean document scans return bytes. Other verdicts or unsupported old files stay unavailable. Responses are opaque attachments with no-store, nosniff, sandbox CSP, CORP and XFO, never inline rendering. There is no persistent legacy scan verdict that could be mistaken for a fresh scan. Existing stored files are not deleted, rewritten in place or backfilled by this change; unsupported/unsafe old attachments may become inaccessible after deployment.

Report creation, observations, lab-task completion and patient update now share one transaction. Patient-row locks serialize the eight-pending-record quota and merge boundary; patient link versions and the staff's still-waiting queue entry are checked under transaction locks. Patient/staff submissions cannot self-mark verified. History and initial assessment share the existing 12-attempt/hour patient budget. Rejected attachments are checked before opening a write transaction. Real PostgreSQL concurrency/rollback tests have been added to the strictly loopback `medspace_assessment_test` suite and remain unrun in this restricted session.

Worker dependencies are explicitly traced for Node server routes because legacy uploads also run through server actions. Release gates must test actual traces for the assessment API, legacy file API, patient plan, doctor report form and staff intake page. Do not substitute the old artifact's successful packaging receipt for a fresh build of these sources. The broader include may increase function packages; inspect their actual size before release.

## Private scanner deployment

Raw ClamAV TCP must never be exposed to the Internet: it has no built-in transport authentication. See [ClamAV's warning](https://docs.clamav.net/manual/Usage/Scanning.html). The prepared Node 24 gateway in `ops/scanner/` adds certificate-verified mutual TLS, an exact client certificate fingerprint, TLS 1.3 minimum, an eight-connection ceiling, two active scans, a 5.5-second deadline and an INSTREAM-only protocol parser. It bounds total bytes, chunk sizes, frame counts and replies; administrative commands and incomplete uploads cannot return a clean result. Gateway tests isolate sockets; they do not establish a real TLS handshake, ClamAV deployment or production service capacity.

Choose and approve the private host, region, data-processing terms and monthly cap before provisioning. It must support a persistent ClamAV process and raw TCP/mTLS ingress. No public reputation/upload scanning service is used. Keep the raw daemon bound only to `127.0.0.1:3310`, not a public interface. Configure supported daemon limits for file size, total decompressed work, archive recursion/files and scan time; exceeded/encrypted/unscannable inputs must produce an alert/error, not a clean skip. Verify the daemon's current options before deployment. Keep signatures updated, monitor their freshness and give temporary extraction files a private, bounded, preferably memory-backed workspace. Gateway and engine memory budgets are separate.

`config.example` is a template, not a runnable identity. Supply a dedicated client CA and leaf certificate/key; the server must have a matching server identity whose SAN covers the approved scanner hostname. Pin the application client's SHA-256 certificate fingerprint. Keep CA private keys offline, server leaf keys on the scanner host and only the app client leaf key in the application's approved secret store. Never commit identities, put keys in chat or use the same identity for unrelated clients. Restrict TLS key file ownership to the service account and validate the provided systemd template on the actual host before enabling it. The default gateway bind is loopback; public/private ingress must be an explicit approved deployment choice.

Set the app's `MEDSPACE_CLAMAV_HOST`, `MEDSPACE_CLAMAV_PORT`, `MEDSPACE_CLAMAV_TLS=true`, `MEDSPACE_CLAMAV_CLIENT_CERT` and `MEDSPACE_CLAMAV_CLIENT_KEY`; set `MEDSPACE_CLAMAV_CA_CERT` for the private server CA. Remote scans fail before sending bytes if the client identity is absent/invalid. `MEDSPACE_REQUIRE_PRIVATE_SCANNER=true` makes missing endpoint configuration fail the deployment preflight once the service is operational. `scripts/check-private-scanner.ts` must distinguish synthetic clean content from EICAR using the real private service before documents are treated as available. An unconfigured endpoint prints an explicit SKIP and leaves documents locked; it is not a passing scanner integration test.

## Monitoring

`node scripts/check-live-assessment.mjs https://APPROVED-ORIGIN` checks the public entry, anonymous assessment denial and anonymous file denial, with bounded requests and private-response headers. It sends no credentials, patient links, files or clinical records. Its offline tests reject cacheable denials, missing sandbox headers, redirects, service failures and credential-bearing origins. It does not prove database connectivity or a successful patient workflow.

Run this after a verified deployment and then from approved monitoring infrastructure. Scheduling, alert delivery, native Vercel error alerts and private scanner freshness monitoring are not yet configured. Keep tokens and patient paths out of monitoring/log drains. Inspect bounded, deployment-specific error and 5xx counts, not unrestricted clinical logs. Agree alert ownership and fallback with the clinic rather than asserting an uptime guarantee.

## Retention, backups and recovery

No automatic deletion is enabled. A dismissal is not a deletion, and a hard upload quota is not a retention policy. The older six-month cost assumption is not an approved medical-record retention rule. Before any purge, the clinic must approve retention categories, legal holds, correction/deletion handling, notification, audit evidence and backup expiry; obtain appropriate professional advice rather than deriving a legal duration from product costing.

The original organization currently reports Pro. Supabase documents daily managed backups and seven-day access for Pro, but an actual available snapshot and successful restore have not been verified here: [database backups](https://supabase.com/docs/guides/platform/backups). Current attachment bytes are in Postgres, not a Storage bucket. If files move to object storage, a database backup does not itself back up those object bytes. Do not enable paid PITR, additional copies or a new export destination without the quoted cost and data-transfer approval. Do not put a production database URL into local tooling or export clinical records as test fixtures.

Recovery objectives and evidence are still required:

1. Name the backup owner and approve maximum acceptable data loss and recovery time; no RPO/RTO is promised before measurement.
2. Inspect actual managed backup timestamps and access restrictions through the original project's approved dashboard/account.
3. Build a separately credentialed, approved synthetic target, take its backup, restore to another isolated target and verify answer/file hashes, ownership, RLS, scan locks, link versions and merge preservation. Record the elapsed time and achieved recovery point. This proves the synthetic mechanism, not restoration of clinical production.
4. A clinical restore is a separately approved incident operation, not an acceptance-test shortcut. Keep restored patient routes offline until post-backup revocations and account bindings are reconciled. Old snapshots can resurrect revoked bindings/link versions. Rotate patient and clinic signing secrets as an explicitly approved recovery operation before serving restored data. The assessment feature flag alone does not disable care-plan access.
5. Managed daily backups do not preserve custom-role passwords; plan fresh credentials on an isolated restore. Keep secrets separate from encrypted backup evidence and test recovery without reusing production credentials.

## iOS and patient acceptance

Simulator testing is useful for a first Safari layout, keyboard, file-control, reload and error-state pass, not a replacement for all hardware checks: [Apple release testing guidance](https://developer.apple.com/documentation/xcode/testing-a-release-build). Do not report Chrome viewport emulation as an iOS Simulator run. Current session access must be restored before attempting the installed Simulator; do not erase device data or reset Xcode as a workaround.

On the approved isolated app and separate synthetic accounts, verify all three answers, consent, multiple photo/document choices, limits, unsupported HEIC/animated/oversized input, readable errors, retry/idempotency, reload persistence, own versus other-patient access and doctor review without automatic fact promotion. Include fresh patient/doctor/staff sessions, a real clean/infected private scan control, blocked documents during scanner outage, 375/390px and landscape layouts, keyboard overlap and Hindi copy. Capture the actual device/runtime, source SHA, deployment ID, screenshots and network/error receipts without patient data. A final physical-iPhone check must cover the native photo/camera/library path and real-device memory/performance.

The fixed version-1 prompts remain: concern; onset/change; relevant medicines/allergies/past conditions. They allow “none”/“not sure,” identify answers as patient-reported and state the form is not monitored for urgent help. This is retained product wording, not a clinically validated questionnaire, diagnosis or clinician endorsement. Patient/clinician usability confirmation remains human acceptance work.

## Fresh security-advisor observation

The original project's security advisor reports 20 INFO findings for RLS enabled with no policies, which is this app's intended deny-all posture. Do not add permissive policies to silence them. It also reports one WARN for disabled leaked-password protection. The app uses Google as an identity provider, so review the actual enabled Auth providers and either disable unused password entry or enable appropriate password protection before adding password accounts. The warning has not been silently marked fixed: [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No Auth setting was changed in this preparation.
