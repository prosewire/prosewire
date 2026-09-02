---
title: Security and Incident Response
shortTitle: Security
description: How to report a vulnerability and how Prosewire handles security incidents and personal data breaches.
summary: Report security issues privately. Prosewire triages, contains, investigates, recovers, and notifies affected Cloud customers when their data is involved.
order: 7
effectiveDate: September 3, 2026
---

This page covers reports about Prosewire code, packages, container images, release systems, the website, and Prosewire Cloud. The repository [Security Policy](https://github.com/prosewire/prosewire/security/policy) identifies the supported release line.

## Security contact

Email [security@prosewire.com](mailto:security@prosewire.com) with "Security report" in the subject. In the first message, include:

- the affected URL, package, version, image, or commit;
- steps that reproduce the issue without exposing another person's data;
- the likely impact; and
- a safe way to contact you.

Do not send credentials, management keys, personal data, or weaponized exploit files by ordinary email. Ask for a secure transfer channel first. Do not open a public GitHub issue for an undisclosed vulnerability.

We aim to acknowledge a report within three business days. This is a target, not a response-time agreement or bug-bounty offer.

## Safe research

Use only accounts and content you own or have written permission to test. Stop if you access another person's data or cause service degradation. Do not use denial of service, social engineering, spam, destructive testing, persistence, or automated traffic that affects other users.

Give us reasonable time to investigate and release a fix before public disclosure. We will not pursue a good-faith researcher for accidental, limited access that follows these rules and is reported promptly, but we cannot authorize activity against a third-party system.

## Current safeguards

The Cloud service uses HTTPS, server-side authorization, workspace and publication boundaries, expiring sessions, hashed management keys, and audit records for management actions. Public content rendering sanitizes rich content. Production secrets are configured outside source control, and sensitive configuration values use redacted types in application logs.

The service separates draft, scheduled, published, and archived content at public query boundaries. Required database, audit, and background writes are awaited. Providers apply their own physical and infrastructure controls.

These measures reduce risk but do not make the service immune from compromise. Prosewire does not currently claim a SOC 2 or ISO 27001 certification. No signed service level or disaster recovery commitment applies unless an order form states one.

## Customer responsibilities

Customers must protect user accounts and keys, grant the least role needed, remove departed members, keep integration packages current, maintain lawful backups or exports, and report suspected compromise. A self-hosted operator is also responsible for TLS, database and Redis security, SMTP, patching, access logs, backup tests, and incident response for its deployment.

## Incident and breach process

The following process applies when Prosewire learns of an event that may compromise Cloud confidentiality, integrity, or availability.

### 1. Intake and triage

The responder records the report time, source, affected service, indicators, and a working severity. A report involving active unauthorized access, exposed credentials, unpublished content, or customer personal data receives urgent handling.

### 2. Containment

The responder limits access, isolates affected components, revokes or rotates exposed credentials, preserves relevant evidence, and keeps required services offline when continued operation would increase harm.

### 3. Investigation

The investigation builds a timeline and determines the affected systems, workspaces, data categories, people, duration, and likely consequences. Prosewire consults relevant infrastructure providers and keeps a written incident record.

### 4. Customer and authority notice

If Prosewire becomes aware of a breach of customer personal data, it will notify the affected business customer without undue delay. The operational target for an initial notice is 48 hours after awareness, even if the investigation is incomplete.

The notice will include available information about the nature of the event, affected data and people, likely consequences, contact point, containment, and recommended customer action. We will send material updates as facts develop. A customer remains responsible for notices to its users and regulators when it acts as controller. We will not contact its data subjects directly unless the customer instructs us or law requires it.

When Prosewire acts as controller, it will make any required regulator or individual notice within the period set by applicable law.

### 5. Recovery and review

Prosewire validates the fix, restores service in stages, watches for recurrence, and documents corrective work. After a material incident, the maintainer records the root cause, response gaps, and owners for follow-up actions. Public disclosure will avoid customer-identifying detail unless disclosure is authorized or required.

## Service incidents that are not personal data breaches

An outage, failed job, or software bug is not automatically a personal data breach. We still investigate integrity and availability incidents and will tell affected customers when they need information to protect their content or integrations.
