---
title: Deletion and Retention Policy
shortTitle: Deletion and retention
description: How long Prosewire Cloud keeps account, content, analytics, security, and request records.
summary: Workspace data stays while the workspace is active. Verified closure requests remove live customer data on a defined schedule, subject to narrow legal and security exceptions.
order: 4
effectiveDate: September 3, 2026
---

This policy applies to Prosewire Cloud. A self-hosted operator chooses its own database, backups, logs, and retention schedule. The open source defaults do not create a retention service for independent deployments.

"Delete" means removal from the active service. Data may remain for a limited time in protected backups and records that law requires us to keep. "Anonymize" means changing data so it is no longer reasonably linked to a person.

## Retention schedule

| Data | Normal retention |
| --- | --- |
| Account, membership, workspace, publication, and content records | While the account or workspace is active |
| Post revisions and redirects | While their publication exists, because they preserve editorial history and public URLs |
| Raw reader view events | 365 days from the event on Cloud |
| Aggregated analytics that no longer identify a reader | May be kept after raw events are deleted |
| Sessions | Until expiry, sign-out, password reset, account disablement, or deletion |
| Pending invitations | Until accepted, rejected, canceled, expired, or the workspace is deleted |
| Audit and security records | While the workspace is active and up to 12 months after closure, unless a longer period is needed for an active investigation or claim |
| Transactional email delivery records | Up to 90 days after successful delivery or final failure |
| Support and data-request records | Three years after closure of the request |
| Contracts, invoices, tax, and payment records | The period required by applicable accounting and tax law |
| Protected backups | Removed through the backup rotation no later than 90 days after deletion from the active service |

We may keep a narrow record of a deletion, consent withdrawal, suppression request, legal hold, or abuse decision when needed to honor the request or establish compliance. We minimize that record and do not restore deleted data to active use from a backup unless recovery from a service-wide failure requires it. If restoration occurs, we reapply pending deletions.

## Delete a post or publication

Archiving a post is not deletion. It removes the post from public Prosewire readers while preserving revisions, redirects, and audit history.

Workspace users should export needed content before requesting deletion. Prosewire Cloud does not currently provide a complete self-service workspace-deletion workflow. An owner must use the [Data request procedure](/legal/data-requests/). We verify ownership and warn other owners when appropriate before deleting a workspace.

Deletion of a publication removes its posts, revisions, categories, authors, snippets, API keys, redirects, and raw view events from the active database. Public copies held by search engines, archives, feed readers, downstream sites, or other third parties are outside our control.

## Close an account or workspace

After a verified closure request and any required waiting period, we will remove the covered customer data from the active service within 30 days. We may first suspend access to prevent new writes. A legal hold, payment dispute, security investigation, or law may require us to retain a limited subset for longer. We will explain the category and reason unless law prevents it.

Deleting one user's account does not necessarily delete an organization's workspace or content. Content and audit records may remain under the organization's control, with the departed user's direct identifier removed or detached where the data model allows.

## Failed payment or inactive accounts

If paid service is introduced, a signed order or plan notice will state any grace period. We will give the workspace owner a reasonable chance to export content before deletion, unless law, security, or abuse makes access unsafe.

We do not delete an active free workspace solely because it is inactive unless we first give at least 30 days' notice to its current owner email.

## Legal holds and disputes

We may pause deletion for data reasonably needed to comply with law, preserve evidence, resolve a dispute, prevent fraud, or enforce the Terms. Access stays limited to that purpose. We delete or anonymize the held data when the reason ends.

## Request deletion

Follow the [Data request procedure](/legal/data-requests/). A workspace request should come from a current owner and name the workspace and publications. Do not email credentials or export files.
