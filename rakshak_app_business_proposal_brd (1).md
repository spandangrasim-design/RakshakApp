# Business Analysis & Process Proposal: Rakshak App

**Project Title:** Rakshak — Smart QR Patrol Monitoring & Incident Management System

**Document Type:** Business Requirements & Process Specification (BRD / FRS) & Implementation Plan

**Prepared For:** Client Management, Security Operations Head, IT Manager

**Version:** 1.3 (Finalized Tech Stack)

## 1. Executive Summary & Business Objectives

### 1.1 Business Problem (As-Is State)
Manual security patrol logging (paper registers or legacy guard tour batons) suffers from delayed reporting, lack of visual verification, inability to confirm physical guard presence in real time, and slow escalation during critical on-site emergencies.

### 1.2 Proposed Solution (To-Be State)
**Rakshak** is an integrated security operations platform consisting of two role-specific applications backed by a unified cloud engine:
1. **Guard Mobile App:** Designed for security personnel on patrol duty to scan checkpoint QR codes, capture live visual proof, record GPS automatically, and log priority-classified incidents (with full offline resilience).
2. **Admin Web Dashboard:** Designed for Security Officers and Management to configure sites, receive automated alerts, track SLA acknowledgments, and export audit-ready reports.

### 1.3 Core Business Objectives
* **100% Verifiable Presence:** Enforce multi-factor verification combining QR Scan + Live Selfie + Live Location Photo + Auto-GPS & Timestamp.
* **Zero Data Loss in Dead Zones:** Enable full offline patrol execution with automated background synchronization.
* **SLA-Driven Escalation:** Automate multi-channel alerts (Email, SMS, WhatsApp) based on incident severity (P1 to P4).

---

## 2. Locked-In Technology Stack & Languages

After architectural review, the system will utilize a highly optimized, serverless **Cloudflare + Supabase** stack. This guarantees ultra-low latency, zero data-egress fees, and seamless alignment with a $0 budget pilot phase.

| Module | Primary Language | Framework / Tool | Rationale |
| :--- | :--- | :--- | :--- |
| **Guard Mobile App** | **Dart** | **Flutter** | Single codebase for Android/iOS, native hardware camera lock, and robust SQLite offline DB support. |
| **Admin Web Dashboard** | **TypeScript** | **React.js** | Rich data tables, map integrations (Leaflet.js), and client-side PDF generation for QR code sheets. Hosted on **Cloudflare Pages**. |
| **Backend API (Serverless)**| **TypeScript** | **Cloudflare Workers (Hono.js)** | Runs on the Edge (0ms cold starts). Replaces traditional heavy servers. Extremely generous free tier. |
| **Database & Geofencing** | **SQL** (PL/pgSQL) | **Supabase (PostgreSQL + PostGIS)** | PostGIS is strictly required to calculate the 50-meter GPS drift validation accurately. |
| **Media Storage** | - | **Cloudflare R2** | Replaces AWS S3. Connects directly to Cloudflare Workers with **$0 egress (bandwidth) fees**. |

---

## 3. End-to-End Business Process Flows

### 3.1 Standard Patrol Round Execution
1. **Shift Authentication:** Guard logs in (Device binding established).
2. **Round Initiation:** Guard starts the patrol; app displays assigned checkpoints.
3. **Verification Loop (At each checkpoint):**
   * QR Scan -> Front Camera Selfie -> Rear Camera Location Photo -> Auto-GPS Capture.
4. **Exceptions:** If a checkpoint is inaccessible, Guard selects "Skip Checkpoint" with a mandatory reason code.

### 3.2 Anti-Spoofing & GPS Soft-Flag Logic
* **Soft-Flag Geofencing:** If a scan is >50 meters from the master checkpoint coordinates (or lacks GPS in a basement), the app *does not block the scan*. It flags the record as `GPS Variance Flagged` or `Indoor/No GPS` for Admin review.
* **Hardware Camera Lock:** Gallery uploads are strictly blocked.
* **Clock Tamper Detection:** Device monotonic uptime is logged alongside wall-clock time to detect manual phone clock rollback while offline.

### 3.3 Incident Reporting & SLA Escalation Matrix
| Priority | Severity | Offline Behavior | Target Recipients | SLA & Escalation Action (Via Cloudflare Cron) |
| :--- | :--- | :--- | :--- | :--- |
| **P1** | Critical | Red Warning Modal + Dialer Button | Manager + Mgmt + Control Room | Acknowledge in 10 mins. Repeats every 10 mins if open. |
| **P2** | High | Amber Warning Modal + Dialer Button | Manager + Supervisor | Acknowledge in 30 mins. Escalates to Mgmt if open. |
| **P3** | Medium | Queues Silently | Supervisor | Shift review required. |
| **P4** | Low | Queues Silently | Supervisor / Facility | Consolidated daily email digest at 08:00 AM. |

---

## 4. Engineering Effort Estimation & Roadmap

Total estimated effort: **2,120 engineering hours** delivered over **12 Weeks (6 Sprints)**.

| Module | UI/UX | Backend | Mobile | Web Admin | QA / Field | BA / PM | Total Hours |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1. Discovery, Architecture & Prototyping | 120 | 60 | 20 | 20 | 30 | 50 | **300** |
| 2. Auth, RBAC & Master Config / QR Tool | 10 | 100 | 40 | 120 | 50 | 30 | **350** |
| 3. Guard App: Patrol Loop & Anti-Spoofing | 5 | 80 | 180 | 20 | 80 | 35 | **400** |
| 4. Offline SQLite Queue & Sync Engine | 0 | 70 | 120 | 10 | 60 | 20 | **280** |
| 5. Incident Engine & SLA Alerts | 5 | 100 | 60 | 110 | 60 | 35 | **370** |
| 6. Admin Reports & PDF/Excel Exports | 0 | 50 | 0 | 140 | 40 | 30 | **260** |
| 7. Field Pilot, Deploy & Training | 0 | 20 | 20 | 20 | 60 | 40 | **160** |
| **Total Hours** | **140** | **480** | **440** | **440** | **380** | **240** | **2,120** |

---

## 5. $0 Free-Tier Pilot & Testing Architecture

By utilizing the Cloudflare + Supabase ecosystem, the entire pilot phase (1-2 sites, up to 30 guards) runs with **zero infrastructure cost**:

| Component | Service Used | Free Quota / Limits |
| :--- | :--- | :--- |
| **Database & Auth** | Supabase (Free Tier) | 500 MB Storage + Built-in PostGIS |
| **Photo Storage & CDN** | Cloudflare R2 | 10 GB Storage / mo ($0 Egress Bandwidth) |
| **Backend API** | Cloudflare Workers | 100,000 Requests / day (0ms cold start) |
| **Admin Portal** | Cloudflare Pages | Unlimited bandwidth, 500 auto-builds / mo |
| **SLA Cron / Queue** | Cloudflare Cron Triggers | Runs backend checks every 10 mins for free |
| **Email Gateway** | Brevo / Resend | 3,000 to 9,000 free emails / mo |
| **WhatsApp Alerts** | Meta WhatsApp Sandbox | Free utility testing to 5 whitelisted numbers |
| **Map Interfaces** | OpenStreetMap + Leaflet.js | 100% Free / No API Key required |

**Testing Bypasses Implemented for $0 Cost:**
1. **SMS/DLT:** Email + WhatsApp Sandbox replaces Indian commercial SMS during testing.
2. **Apple Store Fees:** Field testing executed exclusively on Android hardware via direct APK.
3. **Storage Caps:** Auto-delete scripts will purge test photos older than 15 days from Cloudflare R2.

---

## 6. Production Cloud Cost Estimates (Standard 10-Site Deployment)

Switching from traditional AWS/GCP servers to a **Cloudflare Serverless architecture** drastically reduces production costs. Below is the monthly operating cost for 10 Sites (~18,000 scans and 36,000 photos per month):

| Infrastructure Component | Cloudflare + Supabase Stack | Monthly Estimate (USD) |
| :--- | :--- | :--- |
| **Compute & APIs** | Cloudflare Workers Paid Plan | $5 |
| **Database (PostGIS)** | Supabase Pro Plan (Up to 8GB) | $25 |
| **Media Storage & CDN** | Cloudflare R2 (Storage > 10GB) | $2 (No Egress Fees) |
| **Admin Web Hosting** | Cloudflare Pages | $0 (Included in Workers Plan) |
| **Email Gateway** | Resend / Brevo (Standard) | $15 |
| **SMS/WhatsApp Gateway** | Twilio / Gupshup (Utility Alerts) | $16 |
| **Monitoring & Uptime** | Cloudflare Analytics / Sentry | $0 |
| **Total Monthly Cost** | **Highly Optimized Serverless Stack** | **~$63 (~₹5,300)** |

*Note: The previous AWS/GCP estimates were ~$160/mo. The Cloudflare architecture saves roughly 60% on monthly overhead primarily by eliminating idle server costs and data bandwidth (egress) fees.*

---

## 7. Appendix: System Interfaces (OpenAPI Reference)

*(Note: A complete OpenAPI 3.0.3 specification YAML file has been generated separately for Postman import, outlining exact request/response schemas for `/auth/login`, `/guard/media/presigned-urls`, `/guard/patrols/sync`, `/incidents`, and `/admin/reports`.)*