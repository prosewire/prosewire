---
title: Data Location Disclosure
shortTitle: Data location
description: Where Prosewire website and Cloud data may be stored, processed, and transferred.
summary: Prosewire Cloud does not currently promise country-specific residency. Customers with a residency requirement need a signed order before using Cloud for covered data.
order: 6
effectiveDate: September 3, 2026
---

This disclosure covers infrastructure selected by Prosewire for its website and hosted Cloud service. A self-hosted operator chooses its own database, queue, mail service, backups, and regions.

## Current location commitment

Prosewire Cloud does not currently give customers a contractual choice of storage region or promise that personal data will remain in one country. Do not use Cloud for data subject to a localization or residency requirement unless a signed order names the approved region and transfer terms.

The location from which a page responds is not proof of where all records, logs, support access, or backups reside. Network routing and edge locations can change per request.

## Processing by service

| Service | Hosting model | Location disclosure |
| --- | --- | --- |
| `prosewire.com`, documentation, and legal pages | Static assets on Cloudflare | Requests may be served and logged on Cloudflare's global network. Prosewire has not committed to a Cloudflare Customer Metadata Boundary |
| `cloud.prosewire.com` application and customer data | Railway infrastructure | The primary service uses a Railway deployment region selected by Prosewire. Railway and its subprocessors may process operational, security, and support data in other countries |
| Protected backups | Infrastructure backup systems | Backups may be stored or replicated outside the live service region and follow the deletion window in the [retention policy](/legal/deletion-retention/) |
| Managed invitation email | Not approved for business use | A named SMTP provider and its processing locations must be published before this feature handles business customer addresses |
| A customer-controlled domain or integration | The customer's providers | The customer chooses the destination and is responsible for its location and transfer rules |

The current providers and their roles are on the [Subprocessors page](/legal/subprocessors/). Railway's published region list includes locations in the United States, the Netherlands, and Singapore, but that list does not give a Prosewire customer a residency commitment.

## Access from other countries

Authorized maintainers may access Cloud data from their working location to support the service, investigate a security event, or answer a customer request. Access must use authenticated administrative controls and be limited to the task.

Public content is available wherever a reader or downstream service requests it. Search engines, archives, feeds, embeds, and customer integrations may copy public content to other countries.

## International transfer safeguards

We use provider contracts and access controls for international processing. If a business customer's transfer requires the European Commission Standard Contractual Clauses, the UK Addendum, or another transfer instrument, the parties must complete that instrument before the customer sends covered data to Cloud. The [DPA](/legal/dpa/) explains how to request it.

No statement on this page is an adequacy decision or a promise that a particular transfer mechanism fits a customer's use. The customer remains responsible for its transfer assessment and legal basis.

## Changes and region requests

We will update this page before offering a new contractual storage region. A change to a location used by a subprocessor follows the notice process in the DPA when required.

Email [privacy@prosewire.com](mailto:privacy@prosewire.com) with "Data location" in the subject before putting residency-bound data in Cloud.
