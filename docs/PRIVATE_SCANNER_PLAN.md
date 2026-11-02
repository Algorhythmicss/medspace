# Private assessment scanner: decision needed

Prepared 2 November 2026. No hosted scanner has been provisioned or paid for. Answers and rewritten photos work; supported documents remain private and cannot be downloaded until a private scan passes. The isolated hosted suite verified this quarantine behavior, including an unavailable scanner retry.

Use an existing clinic-authorized server with at least 4 GiB RAM if available. Otherwise, one concrete hosting option is a 4 GB Linux Amazon Lightsail instance at **$24/month before applicable taxes**, with bundled storage and transfer. Availability, account access, region and final checkout price must be confirmed before ordering. There is no AWS CLI credential or authorized existing scanner endpoint available in this workspace. Hetzner's cheaper 4 GB CX23 is another candidate, but its public capacity page currently marks it unavailable; no provisioning claim is made.

Sources checked on 2 November 2026:

- ClamAV recommends at least 3 GiB RAM and prefers 4 GiB: https://docs.clamav.net/manual/Installing/Docker.html
- Lightsail 4 GB Linux public-IPv4 bundle: https://aws.amazon.com/lightsail/pricing/
- Hetzner capacity: https://www.hetzner.com/cloud/cost-optimized/

## Proposed deployment

Vercel streams only the selected assessment's bytes over authenticated TLS to a clinic-controlled scanner gateway. ClamAV runs on the server's internal network, with no public port 3310, persistent signature updates, bounded scan sizes/time/concurrency, and encrypted/unscannable/limit-exceeding content rejected. The gateway must authenticate the MedSpace app, for example with mutual TLS; server-only TLS is insufficient to make an Internet endpoint private. The earlier released client verifies the server certificate but does not present a client certificate. The locally prepared client/gateway integration described below must therefore be deployed and verified before an Internet-exposed scanner can be activated.

Keep uploaded documents in the existing private database storage. The scanner receives bytes for the scan without a patient identity or filename. The prepared gateway logs no submitted content; the actual ClamAV temporary workspace and log configuration still need verification on the approved host. A scanner outage, expired/mismatched certificate, malformed receipt or scan failure leaves the document quarantined. No public scanning API is proposed.

Local follow-up code at `0416993` now presents and validates a client identity for remote TLS, and supplies an INSTREAM-only, certificate-pinned gateway under `ops/scanner/`. Offline transport, parser, resource-policy and legacy-download tests pass. This source is not deployed, and no real gateway/engine handshake is claimed. The earlier live client still must not be pointed at an Internet-facing scanner without the client/gateway authentication rollout and acceptance checks. See `ASSESSMENT_OPERATIONS.md` for exact evidence and access limits.

## Acceptance before production activation

1. Prepare and locally test the gateway, certificate validation/client authentication and resource limits on the selected host configuration.
2. Verify real ClamAV clean-document and EICAR controls, including whole-submission rejection without storing a clean accompanying photo or answers.
3. Repeat on the protected synthetic hosted project, including clean authorized download, cross-patient/role denial, scanner outage and invalid-certificate quarantine.
4. Review the selected provider/region and recurring cost, configure the approved production endpoint/secrets, and verify a bounded synthetic acceptance target. Do not use real records as fixtures or release existing quarantined documents automatically.

Needed to proceed: the existing server/scanner details, or approval of a specific provider/region and recurring budget plus account access. No production secrets, documents or clinical records should be pasted into chat.
