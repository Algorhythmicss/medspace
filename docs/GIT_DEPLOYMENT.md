# Original-app Git deployment

## Target and current status

The intended connection is the existing private `Algorhythmicss/medspace` repository, production branch `main`, to Vercel project `medspace` (`prj_Onb1lZq2ooHK61jUCs5Le4uqrPUL`) in `ayushhhudd-9998s-projects` (`team_S0YB8RxcpPfM0jAPH6l3McvY`). The public clinic entry is `medspace-nu.vercel.app`. Do not connect or deploy through the original dirty checkout's `medspace-demo` project link.

The last recorded live release is commit `e0db7acb7aecc8320d703e9407aa6f8e9e371548`, deployment `dpl_4eHpoqJppX1Gfmh2RePqm7ZVtJTz`. This is a previous verified checkpoint, not a fresh live observation in the restricted session. The Git integration is not yet repaired. The earlier Vercel repository retrieval returned `incorrect_git_source_info`; that does not by itself prove which account authorization or GitHub App permission needs repair.

On 2 November 2026 the follow-up session could read local files but terminal requests to Vercel/GitHub failed, Safari control was unavailable, and the connected GitHub app required reauthentication. The Vercel app was offered as an approved account-access route, but its connection was not confirmed. No Git link, permission, secret, database record, production alias or live deployment was changed during this preparation.

## Versioned deployment checks

`vercel.json` preserves the previously verified read-only database preflight and Linux worker packaging checks for future Git-triggered builds, rather than relying on a one-off CLI build override. The order is configuration contract check, read-only schema/access check, production build/TypeScript, then trace-only packaging tests. A failed stage stops the build; no migration or seed command runs automatically. Existing schema must be applied and verified separately before publishing dependent code.

Automatic Git builds are configured for `main` only using the default-deny `**` pattern and exact `main` allow rule. The globstar also covers slash-separated feature branch names. Vercel deploys when any matching rule is true: [Git configuration](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled). File-based build commands are documented under [project configuration](https://vercel.com/docs/project-configuration/vercel-json#buildcommand).

These rules control build scheduling, not security-sensitive permissions: source changes can change them. Keep Git fork protection and deployment authentication enabled. Before enabling untrusted PRs or preview deployments, separate preview database credentials from production and use an explicitly authorized isolated synthetic target. Do not copy production credentials into repository files or test fixtures.

`scripts/test-deployment-config.ts` checks the exact local contract and rejects mutations removing default-deny scheduling, enabling preview branches, moving/omitting safety checks, bypassing failure with shell separators or embedding environment settings. These are local configuration checks, not proof that GitHub webhooks or automatic deployments work.

## Finish and verify the connection

1. Obtain approved access to the original Vercel team and GitHub account; verify project/repository IDs and current remote `main` before editing anything. Do not disconnect the existing project speculatively while access is unavailable.
2. Inspect the existing Vercel GitHub App installation and project Git settings. Restore only the existing recipient's access to this repository; do not grant all repositories, create a replacement project or add a deployment token as a workaround.
3. Reconnect the exact existing repository and production branch if the inspection shows that is required. Preserve environment settings, aliases, fork protection and uploaded records. A new or broader security-sensitive grant needs explicit approval.
4. Review and publish the prepared configuration with a normal fast-forward push after checking for remote changes. Never force-push or reset the unrelated dirty checkout.
5. Observe a deployment created by that Git push, not a direct CLI snapshot. Verify the actual pushed SHA, original project ID, build gates, READY state and primary alias. Run bounded public privacy/authorization/browser checks and deployment-scoped error-log checks again.

## What remains for assessment acceptance

- Private hosted malware scanning for document downloads, including approval of hosting, cost, data transfer and retention. Until then documents stay quarantined; no public scanning service is used.
- Positive hosted patient submission, persistence, authorized photo/file download and doctor review against an approved isolated synthetic target, without clinical fixtures.
- Physical iOS upload checks and patient/clinician review of the three questions and error/recovery states.
- Production retention, backup/restore, monitoring and broader legacy-upload review. The new assessment checks do not certify every upload path or clinical effectiveness.
