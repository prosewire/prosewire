# Security policy

## Supported versions

Prosewire provides security fixes for the latest patch of the current minor
release. The current public release line is `0.2.x`; versions before `0.2.0`
are not supported. Unreleased fixes land on `main`, but `main` is not a stable
release channel.

| Version | Supported |
| --- | --- |
| Latest `0.2.x` patch | Yes |
| `< 0.2.0` | No |

This table will be updated when a newer release line replaces `0.2.x`.

## What to report

Report vulnerabilities in Prosewire application code, published npm packages,
container images, authentication or authorization boundaries, content
sanitization, and release infrastructure. General support requests and feature
proposals belong in GitHub issues and should not include secrets or private
customer data.

## Report a vulnerability privately

Email the maintainer at [security@prosewire.com](mailto:security@prosewire.com).
Do not include exploit details, credentials, or affected user data in a public
issue. Include the affected version or commit, reproduction steps, impact, and
any suggested mitigation. Encrypt especially sensitive attachments before
sending them and ask for a secure transfer channel in the initial message.

The maintainer will acknowledge the report, validate it, coordinate a fix, and
publish disclosure and upgrade guidance when affected artifacts are available.
Please allow time for a fix to reach supported packages or images before public
disclosure. This project does not offer a bug-bounty program or a guaranteed
response-time SLA.

The public [Security and Incident Response](https://prosewire.com/legal/security/)
page explains the Cloud breach process, customer-notification target, and safe
research boundaries. Maintainers use the
[legal operations runbook](docs/legal-operations.md) for incident records,
containment, investigation, notification, recovery, and review.
