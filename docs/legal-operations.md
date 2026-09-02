# Legal operations runbook

This runbook turns the public legal pages into maintainer tasks. It covers
Prosewire Cloud only. A self-hosted operator owns these processes for its
deployment.

The public contacts are:

- `legal@prosewire.com` for legal notices and DPA requests;
- `privacy@prosewire.com` for privacy, deletion, subprocessor, and data-location
  requests;
- `security@prosewire.com` for vulnerabilities and security incidents;
- `abuse@prosewire.com` for acceptable-use reports and appeals; and
- `copyright@prosewire.com` for notices and counter-notices.

Each address must redirect to a monitored inbox protected with multifactor
authentication. Test every redirect from an external account at least once each
quarter and record the result.

## Business sales gate

Do not accept payment or Customer Personal Data from a business customer until
all applicable items below are complete:

- Record the Cloud provider's full legal name, postal address, establishment
  country, and signing authority in the order form.
- Record the customer's legal name, address, controller or processor role,
  signatory, workspace, and processing countries.
- Confirm the live application, database, Redis, backup, log, and support-access
  regions. Put any contractual residency promise in the order form.
- Sign and retain the current DPAs for Railway and any other subprocessor.
- Identify the production SMTP provider before it handles customer addresses.
  Add it to the public subprocessor list and send the required advance notice.
- Complete an EEA transfer assessment and Module 2 or Module 3 EU SCCs when
  required. Complete the UK Addendum for a restricted UK transfer.
- Confirm that active-data and backup deletion can meet the published 30-day and
  90-day limits. Run and record a restore test that reapplies pending deletions.
- Send the customer the Terms, DPA, subprocessor list, data-location disclosure,
  and security page. Store proof of acceptance with the order.

The public DPA can govern ordinary processing, but it is not a completed
international transfer instrument. The mandatory party details, selections,
annexes, and signatures must be completed for each restricted transfer.

## Request register

Create one restricted record for every privacy, deletion, copyright, abuse, and
security request. Record:

- a unique request ID;
- received and acknowledged times;
- requester and verified authority;
- category, scope, workspace, and publications;
- applicable deadline and legal hold status;
- searches, decisions, exports, deletions, and reviewers;
- response and closure times; and
- the deletion date for extra identity-verification material.

Do not put passwords, session cookies, management keys, exploit files, or full
content exports in this register.

## Data request procedure

1. Acknowledge the request and assign an owner. Target seven days for
   acknowledgement and 30 days for completion unless applicable law is shorter.
2. Decide whether Prosewire is controller or processor. Forward a customer-data
   request to the workspace owner and assist under the DPA.
3. Verify identity through the account email or another proportionate method.
   Verify an agent's authority separately.
4. Fix the scope before searching. Include account, membership, invitations,
   content, revisions, sessions, audit records, view events, email outbox,
   workflow records, support records, and backups where applicable.
5. Check for another person's data, legal privilege, security risk, legal holds,
   and statutory exceptions. Record each exclusion.
6. Review an export before release and use a secure delivery method.
7. Record the response, appeal route, and retention decision. Delete extra
   verification files when the request closes.

## Workspace and account deletion

Workspace deletion does not have a complete dashboard workflow. Until it does,
only a maintainer may perform a verified request, with a second person reviewing
the exact identifiers and scope before the destructive operation.

1. Verify that the requester is a current workspace owner. List every affected
   publication and warn any other current owner when law and safety allow it.
2. Offer the versioned JSON or CSV export and record whether the owner accepted
   or declined it.
3. Check billing, disputes, abuse investigations, and legal holds. Isolate only
   the records that need extended retention.
4. Resolve the exact production environment, database, workspace ID, publication
   IDs, and account IDs with read-only queries. Never identify deletion targets
   with a name fragment, broad pattern, or unresolved environment variable.
5. Stop or reject new writes for the target during deletion. Capture row counts
   for affected tables and review foreign-key behavior before the transaction.
6. Delete the workspace in one controlled database transaction. Confirm cascades
   for publications, posts, revisions, redirects, categories, authors, snippets,
   API keys, view events, membership, and invitations. Remove or minimize orphaned
   audit and email records that contain personal data.
7. Delete a user account only after checking membership in other workspaces.
   Revoke sessions and connected authentication accounts.
8. Verify that public and management endpoints no longer return the data. Record
   completion in the request register without copying deleted content into it.
9. Add the request ID and affected identifiers to the protected backup-deletion
   ledger. If a backup is restored within 90 days, reapply the deletion before
   returning the service to normal use.
10. Send completion notice within 30 days of the verified request. Record any
    narrow legal hold and its review date.

## Retention review

Run a monthly review until every published maximum has automated enforcement.
Record counts before and after cleanup.

- Confirm the worker removed raw view events older than 365 days.
- Remove successful or finally failed email delivery records older than 90 days.
- Remove or anonymize audit and security records more than 12 months past
  workspace closure unless a documented hold applies.
- Remove closed support and request records after three years unless law or a
  claim requires longer retention.
- Confirm deleted active data has left backups within 90 days.
- Review every legal hold at least every 90 days and release it when its reason
  ends.

## Security incident and breach procedure

### Intake and severity

Open an incident record immediately. Capture the report, timestamps, affected
service, reporter contact, indicators, and working severity. Treat active access,
exposed credentials, unpublished content, or customer personal data as urgent.

Name one incident lead and one communications owner. Use a separate secure
channel if normal email or production access may be compromised.

### Containment and evidence

- Isolate affected services or accounts.
- Revoke sessions and rotate exposed credentials through the provider's secret
  mechanism.
- Preserve relevant logs, deployment identifiers, database records, and provider
  notices with a clear timeline and access record.
- Do not place credentials or unnecessary personal data in chat, tickets, or a
  public issue.
- Contact the relevant subprocessor security team and preserve its case number.

### Investigation

Determine the first unauthorized access, last known activity, attack method,
affected systems, workspace and publication IDs, data categories, approximate
people and record counts, countries, and likely consequences. Distinguish a
service incident from a personal data breach and record the reason.

### Notification

When Customer Personal Data is breached, notify the affected business customer
without undue delay. Target an initial notice within 48 hours after awareness.
Do not wait for a complete investigation.

Include the incident time, discovery time, current facts, affected categories and
counts, likely effects, containment, recommended action, contact, and time of the
next update. Mark uncertain facts as preliminary. Keep copies of every notice and
update.

When Prosewire is controller, identify each applicable authority and individual
deadline. For processing subject to the GDPR, the controller's authority notice
may be due within 72 hours after awareness. Escalate to qualified counsel rather
than assuming an exception.

### Recovery and review

Validate the fix, restore in stages, watch for recurrence, and reapply any
deletions after a backup restoration. For a material incident, complete a written
review with root cause, response timeline, what went well, gaps, corrective
owners, and due dates. Update code, controls, policies, and customer guidance
where the facts require it.

## Subprocessor change procedure

Before a new provider receives Customer Personal Data:

1. Review its security terms, privacy terms, DPA, subprocessors, transfer
   mechanism, breach promise, deletion terms, and processing locations.
2. Sign and retain the required agreement.
3. Update the public subprocessor and data-location pages.
4. Email business workspace owners at least 15 days before processing starts.
5. Record objections and resolve an alternative or termination before the change.

An urgent security replacement may use shorter notice. Record why the urgency
made advance notice impractical and notify customers as soon as possible.

## Copyright and abuse requests

Check that a copyright notice contains every item listed on the public Copyright
page. Preserve the original, forward it only as needed, record access changes,
and track any counter-notice and court deadline. Do not treat an allegation as a
final infringement finding without considering the response.

For abuse, record the exact URL, applicable AUP provision, evidence, severity,
action, customer notice, and appeal. Use the narrowest action that stops the harm.
Urgent safety reports may require law-enforcement or specialist advice.
