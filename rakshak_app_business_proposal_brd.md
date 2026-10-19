# Business Analysis & Process Proposal: Rakshak App

**Project Title:** Rakshak — Smart QR Patrol Monitoring & Incident Management System

**Document Type:** Business Requirements & Process Specification (BRD / FRS) & Implementation Plan

**Prepared For:** Client Management, Security Operations Head, IT Manager

**Version:** 1.1

## Document Control & Approval

| Version | Date | Author | Description | Status | 
| ----- | ----- | ----- | ----- | ----- | 
| 1.0 | October 2026 | Business Analysis Team | Initial Business Process & Requirements Proposal incorporating SLA Escalation & Anti-Spoofing Rules | Reviewed | 
| 1.1 | October 2026 | Business Analysis Team | Added Detailed 12-Week Phase-Wise Development Plan, Team Structure, and Client Dependencies | Pending Client Review | 

## 1. Executive Summary & Business Objectives

### 1.1 Business Problem (As-Is State)

Manual security patrol logging (paper registers or legacy guard tour batons) suffers from delayed reporting, lack of visual verification, inability to confirm physical guard presence in real time, and slow escalation during critical on-site emergencies.

### 1.2 Proposed Solution (To-Be State)

**Rakshak** is an integrated security operations platform consisting of two role-specific applications backed by a unified cloud engine:

1. **Guard Mobile App:** Designed for security personnel on patrol duty to scan checkpoint QR codes, capture live visual proof (Selfie + Location Photo), record GPS and timestamps automatically, and log priority-classified incidents (with full offline resilience).

2. **Admin Web Dashboard:** Designed for Security Officers, Site Supervisors, and Management to configure sites/checkpoints, receive automated priority-based alerts, track SLA acknowledgments, and export audit-ready compliance reports.

### 1.3 Core Business Objectives

* **100% Verifiable Presence:** Enforce multi-factor checkpoint verification combining QR Code Scan + Live Guard Selfie + Live Location Photo + Automated GPS & Server-Validated Timestamp.

* **Zero Data Loss in Dead Zones:** Enable full offline patrol and incident logging in basements and remote perimeters with automated background synchronization.

* **SLA-Driven Incident Escalation:** Automate multi-channel alerts (Email, SMS, WhatsApp) based on incident severity (P1 to P4) with time-bound acknowledgment tracking.

* **Audit-Ready Compliance:** Generate tamper-proof shift reports, missed-checkpoint exception logs, and incident audit trails exportable in PDF and Excel formats.

## 2. Stakeholder & Role-Based Access Matrix

Access across the Rakshak platform is strictly segregated by user role:

| Role | Platform Access | Core Responsibilities & Permissions | 
| ----- | ----- | ----- | 
| **Security Guard** | Mobile App (Android / iOS) | Authenticate shift; view assigned route; scan checkpoint QR codes; capture live selfies and location photos; log remarks; submit P1–P4 incidents; operate offline. **Restricted from viewing other guards' data or historical site reports.** | 
| **Site Supervisor** | Admin Web Dashboard (Site-Scoped) | Monitor live patrol status for assigned site; receive P2/P3 alerts; acknowledge and update incident status; review missed checkpoints and shift summaries. | 
| **Site Manager** | Admin Web Dashboard (Site-Level) | Full visibility into site patrol and incident reports; primary recipient for P1/P2 alerts; export PDF/Excel reports; manage site guard shift rosters. | 
| **System Admin / Security Officer** | Admin Web Dashboard (Global) | Master configuration across all sites; create/edit checkpoints and generate printable QR codes; configure email/SMS distribution lists and escalation SLA timers. | 

## 3. End-to-End Business Process Flows

### 3.1 Process 1: Standard Patrol Round Execution

1. **Shift Authentication:** Guard logs in via Unique Guard ID + Password or Registered Mobile Number + OTP. The system validates the active shift schedule and loads the assigned Site and Patrol Route.

2. **Round Initiation:** Guard taps **"Start Patrol Round."** The app records the `Round_Start_Time` and displays the list of assigned checkpoints (configurable per route as either *Strict Sequence* or *Free-Form Order*).

3. **Checkpoint Verification Loop:** At each physical checkpoint, the guard performs a mandatory 4-step capture:

   * **Step A (QR Scan):** Scans the physical QR plate using the in-app scanner.

   * **Step B (Identity Proof):** Captures a live selfie using the front camera.

   * **Step C (Location Proof):** Captures a live photograph of the checkpoint area using the rear camera.

   * **Step D (Auto-Metadata & Remarks):** The app automatically tags device GPS coordinates, accuracy radius, and timestamp, while allowing optional text or voice-to-text remarks.

4. **Round Closure & Exception Handling:**

   * **Standard Completion:** Once $100\%$ of assigned checkpoints are scanned, the round automatically transitions to `Completed` and records `Round_End_Time`.

   * **Early Termination / Skipped Checkpoint:** If a checkpoint is inaccessible (e.g., locked room, maintenance hazard), the guard selects **"Skip Checkpoint / End Round Early"** and must select a predefined reason code plus a mandatory remark. Unscanned points are flagged as `Missed Checkpoint` in the management report.

   * **Auto-Expiry:** Any round left open past the shift end-time plus a $30\text{-minute}$ grace buffer is auto-closed by the server with remaining checkpoints marked `Missed`.

### 3.2 Process 2: Indoor GPS Drift & Anti-Spoofing Validation Flow

To balance strict security with real-world indoor/basement signal limitations, the system applies a **Soft-Flag Validation Process**:

1. **QR Scan Triggered:** Guard scans the checkpoint QR code.

2. **Metadata Capture:** App captures live device GPS coordinates, GPS accuracy radius, and monotonic hardware uptime clock delta.

3. **Distance Evaluation (Live GPS vs. Master Checkpoint Coordinates):**

   * **Condition A (Distance** $\le 50\text{ m}$ **and High Accuracy):** Marked as `Verified (Green)`.

   * **Condition B (Distance** $> 50\text{ m}$ **/ GPS Drift):** Marked as `Scanned - GPS Variance Flagged (Amber)`.

   * **Condition C (No GPS Signal / Basement Checkpoint):** Marked as `Scanned - Indoor/No GPS (Amber)`.

4. **Business Rule:** The app **never blocks** a guard from completing a scan due to weak indoor GPS. Instead, it records the scan and highlights the variance on the Admin Dashboard so supervisors can verify physical presence using the live selfie and location photo.

### 3.3 Process 3: Incident Reporting & Priority Escalation Matrix

When a guard encounters an anomaly, they can trigger an **Incident Report** from any screen (inside or outside an active patrol round).

#### Priority Classification & SLA Escalation Matrix

| Priority | Severity Level | Real-World Examples | Immediate Notification Channels | Target Recipients | Escalation & Acknowledgment SLA | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| **P1** | **Critical / Emergency** | Fire, break-in, medical emergency, violence | Instant Email + SMS + WhatsApp Alert | Site Manager + Senior Management + Control Room | Must be acknowledged within $10\text{ mins}$. Triggers repeat alert at $10\text{ mins}$ if unacknowledged. | 
| **P2** | **High** | Suspicious person, perimeter breach, major equipment damage | Instant Email + SMS/WhatsApp Alert | Site Manager + Site Supervisor | Must be acknowledged within $30\text{ mins}$. Auto-escalates to Senior Management if unacknowledged after $30\text{ mins}$. | 
| **P3** | **Medium** | Minor rule violation, unlocked door, unattended package | Instant Email Alert | Site Supervisor | Logged as `Open` in Dashboard; must be reviewed before shift closure. | 
| **P4** | **Low** | Housekeeping issue, burnt-out bulb, minor observation | Consolidated Daily Digest Email ($08:00\text{ AM}$ daily) | Site Supervisor / Facility Team | Included in daily summary batch. Suppressed if $0$ P4 incidents occurred in the prior $24\text{ hours}$. | 

#### Incident Lifecycle States (Admin Dashboard)

Every reported incident tracks through three auditable states:

1. **Open:** Logged by guard; alerts dispatched according to priority rules.

2. **Acknowledged:** Supervisor or Manager clicks **"Acknowledge"** via the dashboard or email quick-link (stops the SLA escalation timer and logs responder name + timestamp).

3. **Resolved / Closed:** Responder enters mandatory resolution notes and closes the incident ticket.

### 3.4 Process 4: Offline Mode & Emergency Fallback Protocol

1. **Local Encrypted Queue:** When network connectivity drops below threshold, the app automatically switches to **Offline Mode** (indicated by a persistent status banner). All QR scans, compressed photos, GPS tags, and timestamps are stored in an encrypted local SQLite database.

2. **Critical Offline Safety Rule (P1/P2 Emergency Override):**

   * If a guard submits a **P1 or P2 incident while the device is offline**, the app saves the report locally **and immediately displays a full-screen high-contrast warning prompt**:

     > *"NO NETWORK CONNECTION: Digital alert is queued and cannot be sent immediately. Please contact the Control Room / Site Manager immediately via Two-Way Radio or Direct Phone Call."*

   * A direct **"Call Site Manager"** dialer button is presented on the screen.

3. **Auto-Sync on Reconnection:** As soon as cellular or Wi-Fi connectivity is restored, a background sync service transmits queued patrol scans and incidents in chronological order, triggering any pending email/SMS notifications with a `[Delayed Sync - Captured Offline at HH:MM]` indicator.

## 4. Functional Requirements Specification (FRS)

### 4.1 Module 1: Guard Mobile App

* **FR-G01 (Authentication):** Support login via Guard ID + Password or Phone Number + OTP. Bind session to active shift and assigned site.

* **FR-G02 (Route Visibility):** Display assigned patrol rounds, total checkpoints, completed count, and pending checkpoints.

* **FR-G03 (In-App Camera Enforcement):** Restrict all selfie, checkpoint, and incident photo/video captures strictly to the live in-app camera API. **Gallery and file-picker uploads must be completely disabled** to prevent photo reuse or spoofing.

* **FR-G04 (Image Optimization & Watermarking):** Automatically compress and resize captured photos on-device to $300\text{--}500\text{ KB}$ with burned-in metadata watermarks (Guard ID, Checkpoint Name, Timestamp, GPS) prior to storage/upload.

* **FR-G05 (Tamper-Proof Timekeeping):** Record both device wall-clock time and device monotonic boot-uptime delta at each scan to detect manual phone clock manipulation while offline.

* **FR-G06 (Incident Logging):** Allow guards to log an incident with Description, Priority (P1–P4), optional live Photos/Short Video, and auto-captured GPS + Timestamp.

### 4.2 Module 2: Admin Web Dashboard

* **FR-A01 (Patrol Compliance Reports):** View and filter patrol rounds by Date Range, Site, Shift, Guard, and Completion Status (`Completed`, `Partial / Missed Checkpoints`, `Auto-Closed`).

* **FR-A02 (Checkpoint Drill-Down):** View individual scan records containing QR Serial Number, Checkpoint Name, Scan Time, clickable Google Maps link, side-by-side Selfie + Location Photo preview, GPS accuracy status, and guard remarks.

* **FR-A03 (Incident Management Console):** Search, filter, and manage P1–P4 incidents by site, priority, guard, date, and lifecycle status (`Open`, `Acknowledged`, `Resolved`).

* **FR-A04 (Export Engine):** One-click export of filtered Patrol Reports and Incident Logs into formatted **PDF** (with embedded photo thumbnails) and **Excel/CSV** formats.

* **FR-A05 (Master Configuration & QR Generator):**

  * Add/Edit/Deactivate Sites, Shifts, Checkpoints (with reference latitude/longitude), and Guard profiles.

  * Built-in **QR Code Generator** that creates unique signed QR payloads per checkpoint and exports printable PDF sheets (displaying Site Name, Checkpoint Name, and QR Serial Number).

  * Configurable per-site email/phone distribution lists and escalation SLA timers for P1–P4 alerts.

## 5. Data Dictionary

### 5.1 Checkpoint Scan Record

| Field Name | Data Type | Capture Source | Validation / Business Rule | 
| ----- | ----- | ----- | ----- | 
| `Scan_ID` | UUID | Auto (App) | Unique primary key generated offline or online | 
| `Round_ID` | UUID | Auto (App) | Links checkpoint scan to parent patrol round | 
| `Guard_ID` & `Guard_Name` | String | Authenticated Session | Mapped from active login token | 
| `Site_ID` & `Shift_ID` | String | Master Assignment | Mapped from guard's shift roster | 
| `Checkpoint_ID` / `QR_Serial` | String | QR Scanner SDK | Must match active site's registered QR codes | 
| `Captured_At_Device` | ISO Timestamp | Auto (Monotonic Validated) | Validated against server time delta upon sync | 
| `Synced_At_Server` | ISO Timestamp | Auto (Backend) | Distinguishes real-time vs. offline-synced scans | 
| `GPS_Coordinates` | Lat / Long + Accuracy ($\text{m}$) | Phone Location API | Flagged if distance from master checkpoint $> 50\text{ m}$ | 
| `Selfie_Image_URL` | Cloud Storage URL | Live Front Camera | Compressed JPEG ($\le 500\text{ KB}$), gallery blocked | 
| `Location_Image_URL` | Cloud Storage URL | Live Rear Camera | Compressed JPEG ($\le 500\text{ KB}$), gallery blocked | 
| `Scan_Status` | Enum | System Logic | `Verified`, `Scanned_GPS_Variance`, `Scanned_No_GPS`, `Missed` | 
| `Guard_Remarks` | Text ($500\text{ chars}$) | Guard Input | Optional for normal scan; mandatory if skipped | 

### 5.2 Incident Report Record

| Field Name | Data Type | Capture Source | Validation / Business Rule | 
| ----- | ----- | ----- | ----- | 
| `Incident_ID` | UUID | Auto (App) | Unique ticket reference ID | 
| `Priority_Level` | Enum | Guard Selection | `P1`, `P2`, `P3`, `P4` | 
| `Description` | Text ($1000\text{ chars}$) | Guard Input | Mandatory text or voice-to-text description | 
| `Media_URLs` | Array of URLs | Live Camera | Up to 4 compressed photos or 1 short video clip | 
| `GPS_Coordinates` | Lat / Long | Phone Location API | Auto-captured at time of incident creation | 
| `Incident_Status` | Enum | System / Admin | `Open`, `Acknowledged`, `Resolved` | 
| `Acknowledged_By` & `At` | String + Timestamp | Admin Action | Recorded when supervisor/manager acknowledges alert | 
| `Resolution_Notes` | Text ($1000\text{ chars}$) | Admin Input | Mandatory to transition status to `Resolved` | 

## 6. Recommended System Architecture & Tech Stack

| Layer | Recommended Technology | Rationale for IT Manager | 
| ----- | ----- | ----- | 
| **Guard Mobile App** | **Flutter** or **React Native** (Android primary, iOS ready) | Single codebase, native hardware access for fast QR scanning, camera lock, background sync, and SQLite offline storage. | 
| **Admin Web Dashboard** | **React.js / Next.js** (Responsive Web) | Optimized for wide data tables, side-by-side photo verification, QR sheet printing, and PDF/Excel generation on desktop and mobile browsers. | 
| **Backend & API** | **Node.js (NestJS)** or **Python (FastAPI / Django)** | Scalable REST APIs with background job queues (BullMQ / Celery) for SLA escalation timers and $08:00\text{ AM}$ P4 daily digest scheduling. | 
| **Database** | **PostgreSQL** (with PostGIS extension) | Relational integrity for shift/checkpoint mapping and built-in spatial queries for $50\text{ m}$ GPS geofence distance calculations. | 
| **Media Storage** | **AWS S3** or **Google Cloud Storage** | Cost-effective object storage with lifecycle policies (e.g., auto-archive patrol photos to cold storage after $90\text{ days}$ to optimize cloud costs). | 
| **Alert Gateways** | **SendGrid / AWS SES** (Email) + **Twilio / Gupshup** (SMS & WhatsApp) | Reliable transactional delivery with webhook tracking for delivery confirmation and DLT compliance. | 
| **Mapping Service** | **Google Maps Platform API** | Displays guard scan coordinates vs. actual checkpoint pins on the Admin Dashboard. | 

## 7. Project Deliverables & Resource Plan

### 7.1 Expected Deliverables

1. **Guard Mobile Application** (Android APK / Play Store build + iOS build if required)

2. **Responsive Admin Web Dashboard** (Hosted on cloud with SSL security)

3. **Master QR Code Generation & Printable Sheet Utility** (Built into Admin Portal)

4. **Automated Multi-Channel Alert Engine** (Email + SMS/WhatsApp integration)

5. **User Manuals** (Illustrated PDF guides for Guards and Admin/Supervisors)

6. **Live Training & Handover Session** (For Security Officers, Site Managers, and IT team)

### 7.2 Recommended Team Structure & Allocation

To deliver the Guard Mobile App and Admin Web Dashboard in parallel within $12\text{ weeks}$ across $6$ two-week Agile sprints, the following core project team is allocated:

| Role | Allocation | Primary Responsibility | 
| ----- | ----- | ----- | 
| **Project Manager / Business Analyst** | $50\%$ (Shared) | Sprint planning, client sign-offs, UAT coordination, and user manuals | 
| **UI/UX Designer** | $100\%$ (Weeks 1–3) | Wireframes, clickable Figma prototypes, and QR printable sheet templates | 
| **Backend & DevOps Engineer** | $100\%$ (Weeks 1–12) | PostgreSQL/PostGIS database, REST APIs, S3 storage, SLA cron queues, Email/SMS/WhatsApp webhooks | 
| **Mobile App Developer (Flutter / React Native)** | $100\%$ (Weeks 2–12) | Guard App, in-app camera lock, image watermarking/compression, GPS & monotonic clock validation, SQLite offline sync | 
| **Frontend Web Developer (React.js / Next.js)** | $100\%$ (Weeks 2–12) | Admin Dashboard, master configuration, QR code generator, live dashboards, PDF/Excel export engine | 
| **QA & Field Test Engineer** | $50\%$ (Weeks 1–5), $100\%$ (Weeks 6–12) | API testing, offline dead-zone testing, clock/GPS spoofing tests, and load testing | 

## 8. Detailed 12-Week Phase-Wise Development Plan

### 8.1 Master Project Roadmap (Weeks 1–12)

| Phase | Sprint | Timeline | Core Focus Area | Key Milestone / Sign-Off Gate | 
| ----- | ----- | ----- | ----- | ----- | 
| **Phase 1** | Sprint 1 | Weeks 1–2 | Discovery, Cloud Setup & UI/UX Prototyping | **Milestone 1:** Approved Figma UI/UX & Database Schema | 
| **Phase 2** | Sprint 2 & 3a | Weeks 3–5 | Core Backend, Auth, Master Config & QR Generator | **Milestone 2:** Admin Portal Staging Release & Printable QR Sheets | 
| **Phase 3** | Sprint 3b & 4 | Weeks 6–8 | Guard Mobile App, Anti-Spoofing & Offline Sync Engine | **Milestone 3:** Guard App Beta Build (Online + Offline Patrol Loop) | 
| **Phase 4** | Sprint 5 | Weeks 9–10 | Incident Engine, P1–P4 Escalations & Report Exports | **Milestone 4:** End-to-End Alerting & Reporting Complete | 
| **Phase 5** | Sprint 6 | Weeks 11–12 | On-Site Pilot Testing, Production Deployment & Training | **Milestone 5:** Production Go-Live & Staff Handover | 

### 8.2 Phase-by-Phase Execution Breakdown

#### Phase 1: Discovery, Architecture & UI/UX Design (Weeks 1–2)

**Objective:** Lock down all technical specifications, provision cloud infrastructure, initiate third-party messaging approvals, and finalize clickable UI designs.

* **Week 1: Architecture & Wireframing**

  * Finalize the Functional Requirements Specification (FRS) and API contract definitions (Swagger/OpenAPI).

  * Design the PostgreSQL database schema with PostGIS spatial extensions for checkpoint geofencing.

  * Create low-fidelity wireframes for the Guard App (Login, Patrol Route, 4-Step Checkpoint Capture, Offline Banner, Emergency Modal) and Admin Web Portal.

  * **Pre-requisite Initiation:** Register SMS/WhatsApp sender IDs and P1/P2 alert message templates (e.g., DLT & Meta WhatsApp Business API registration) so approvals clear before Phase 4.

* **Week 2: High-Fidelity UI/UX & DevOps Setup**

  * Deliver interactive high-fidelity Figma prototypes for client review and sign-off.

  * Set up Git repositories, CI/CD pipelines, and Development/Staging environments on AWS or Google Cloud.

  * Configure AWS S3 / Google Cloud Storage buckets with $90\text{-day}$ lifecycle archiving policies for patrol photos.

* **Phase 1 Deliverables & Exit Criteria:**

  * Signed-off Figma Prototype (Guard App + Admin Dashboard).

  * Approved Database ERD and REST API Documentation.

  * Live Dev/Staging server environment.

#### Phase 2: Core Backend & Master Admin Portal (Weeks 3–5)

**Objective:** Build the administrative foundation so sites, shifts, guards, and physical QR checkpoints can be configured and printed ahead of field testing.

* **Week 3: Authentication, RBAC & Master CRUD APIs**

  * Develop JWT-based authentication supporting Guard ID + Password and Mobile Number + OTP.

  * Implement Role-Based Access Control (RBAC) separating Guard, Site Supervisor, Site Manager, and Global Admin permissions.

  * Build backend CRUD APIs for Sites, Shifts, Checkpoints (with reference Latitude/Longitude), and Guard Rosters.

* **Week 4: Admin Master Configuration UI & QR Code Generator**

  * Build the Admin Web Portal screens for managing sites, shifts, and guard-to-site mappings.

  * Develop the **Cryptographic QR Code Generator**: generates unique signed payloads per checkpoint (`Site_ID + Checkpoint_ID + Checksum`) to prevent unauthorized duplicate QR generation.

  * Build the **Printable QR Sheet Exporter** (PDF layout with Site Name, Checkpoint Name, and QR Serial Number ready for weatherproof printing).

* **Week 5: Notification Routing Configuration**

  * Build the Admin UI and APIs for configuring per-site Email/SMS/WhatsApp distribution lists.

  * Build the P1–P4 SLA rule configuration screen (setting acknowledgment timers for P1 at $10\text{ mins}$ and P2 at $30\text{ mins}$).

* **Phase 2 Deliverables & Exit Criteria:**

  * Functional Admin Web Portal on Staging.

  * Ability to create a site, onboard guards, assign shifts, and download printable checkpoint QR PDF sheets.

#### Phase 3: Guard Mobile App & Offline Sync Engine (Weeks 6–8)

**Objective:** Develop the Guard Mobile App with multi-factor checkpoint capture, anti-spoofing locks, and resilient offline storage.

* **Week 6: Guard App Core & 4-Step Checkpoint Capture**

  * Build Guard Login, Active Shift Summary, and Patrol Round Initiation screens.

  * Integrate native QR Scanner SDK with checksum validation against the assigned route.

  * Implement **In-App Camera Lock** (front camera for Selfie, rear camera for Location Photo) with gallery/file-picker access strictly disabled.

  * Build the on-device image processor to compress photos to $300\text{--}500\text{ KB}$ and burn in metadata watermarks (Guard ID, Checkpoint Name, Date/Time, GPS coordinates).

* **Week 7: Anti-Spoofing & Soft-Flag GPS Logic**

  * Implement live GPS capture and PostGIS distance calculation against master checkpoint coordinates.

  * Configure the **Soft-Flag Rule**: mark scans within $50\text{ m}$ as `Verified (Green)`, scans exceeding $50\text{ m}$ as `GPS Variance Flagged (Amber)`, and basement/no-signal scans as `Indoor/No GPS (Amber)` without blocking the guard's workflow.

  * Implement **Monotonic Boot-Clock Tracking** to capture device uptime alongside wall-clock time, flagging any manual clock tampering while offline.

  * Build the "Skip Checkpoint / End Round Early" exception flow with mandatory reason codes, plus the server-side cron job to auto-close unfinished rounds $30\text{ minutes}$ after shift end.

* **Week 8: Offline SQLite Queue & Auto-Sync Engine**

  * Architect the local encrypted SQLite storage layer for offline patrol rounds, queued photos, and scan logs.

  * Build the background network listener and idempotent sync worker: automatically uploads queued images to S3 and syncs scan JSON payloads in chronological order when connectivity returns, preventing duplicate entries.

* **Phase 3 Deliverables & Exit Criteria:**

  * Installable Android APK / iOS TestFlight build of the Guard App.

  * Verified offline patrol round execution that syncs automatically upon toggling Airplane Mode off.

#### Phase 4: Incident Engine, SLA Escalations & Reporting (Weeks 9–10)

**Objective:** Complete the P1–P4 incident workflow, multi-channel alerting with SLA escalation timers, and Admin compliance reporting with PDF/Excel exports.

* **Week 9: Incident Logging, Offline Emergency Override & Alert Gateways**

  * Build the Guard App Incident Reporting flow (Description, Optional Live Photo/Video, Auto-GPS, P1–P4 Priority selector).

  * Build the **Offline P1/P2 Emergency Override Modal**: triggers a high-contrast warning with a one-tap cellular dialer button to call the Control Room/Site Manager if a P1 or P2 incident is filed without network coverage.

  * Integrate **SendGrid/AWS SES** (Email) and **Twilio/Gupshup** (SMS & WhatsApp) gateways for instant P1–P3 dispatches.

  * Configure the background job queue (BullMQ / Celery) for:

    * **P1 Escalation:** Repeat alert every $10\text{ minutes}$ until acknowledged.

    * **P2 Escalation:** Auto-escalate to Senior Management if unacknowledged after $30\text{ minutes}$.

    * **P4 Daily Digest:** Scheduled cron job at $08:00\text{ AM}$ daily per site (suppressed if $0$ P4 incidents).

* **Week 10: Admin Reporting Console, Incident Lifecycle & Exports**

  * Build the **Patrol Compliance Report Dashboard** with filters (Date, Site, Shift, Guard, Status) and checkpoint drill-down (Selfie + Location Photo side-by-side viewer and Google Maps pin view).

  * Build the **Incident Management Console** supporting lifecycle transitions (`Open` $\rightarrow$ `Acknowledged` $\rightarrow$ `Resolved` with mandatory closure notes) plus email quick-link acknowledgment.

  * Build the **PDF and Excel/CSV Export Engine** for both Patrol Reports (with embedded photo thumbnails) and Incident Logs.

* **Phase 4 Deliverables & Exit Criteria:**

  * Fully integrated Guard App and Admin Dashboard on Staging.

  * Verified end-to-end delivery of Email, SMS, and WhatsApp alerts and downloadable PDF/Excel compliance reports.

#### Phase 5: QA, Field Pilot Testing, Deployment & Handover (Weeks 11–12)

**Objective:** Validate the system under real-world physical site conditions, deploy to production, and train security staff and management.

* **Week 11: Comprehensive QA & On-Site Pilot Testing**

  * Conduct **Physical Pilot Testing** at $1$ client site for $3\text{--}5\text{ shifts}$: print and mount QR codes at actual checkpoints (including basements and dead zones).

  * Execute edge-case QA scenarios:

    * Scanning a QR code from another site or out of sequence.

    * Attempting to change the phone's time while offline in a basement.

    * Submitting a P1 incident in Airplane Mode and verifying the `[Delayed Sync]` email tag upon reconnection.

    * Verifying P2 auto-escalation after $30\text{ minutes}$ of non-acknowledgment.

  * Fix any pilot bugs and optimize battery/data consumption on guard devices.

* **Week 12: Production Deployment, Documentation & Training**

  * Provision Production Cloud Infrastructure (Database backups, SSL certificates, production API keys).

  * Publish the Guard App to the **Google Play Store** (and Apple App Store / Enterprise MDM if applicable) and deploy the Admin Web Dashboard to the client's production domain.

  * Deliver illustrated **User Manuals** (Guard Quick-Start Guide + Admin Operations Manual).

  * Conduct live training sessions for Security Guards (mobile app operation) and Security Officers/IT Managers (dashboard & master configuration).

* **Phase 5 Deliverables & Exit Criteria:**

  * Live Production System (Mobile App + Web Dashboard).

  * Signed-off UAT & Pilot Test Report.

  * Handover of source code, credentials, user manuals, and completed staff training.

## 9. Client Dependencies & Pre-Requisites Checklist

To prevent schedule slippage across the $12\text{-week}$ timeline, the following items are required from the client/IT Manager by the specified milestones:

| Dependency Item | Required By | Impact if Delayed | 
| ----- | ----- | ----- | 
| **Cloud Hosting & API Accounts** (AWS/GCP, Google Maps API Key, SendGrid/SES) | End of Week 1 | Delays staging server setup and GPS map rendering | 
| **SMS & WhatsApp Business API Verification** (DLT / Meta Business Manager) | End of Week 2 | Blocks live SMS/WhatsApp delivery testing in Week 9 | 
| **Google Play Console / Apple Developer Account** | End of Week 4 | Delays public/enterprise store release in Week 12 | 
| **Pilot Site Master Data** ($1\text{ Site}$, $10\text{--}15\text{ Checkpoint Names}$, $3\text{--}5\text{ Test Guards}$) | End of Week 8 | Delays physical QR printing and Week 11 field pilot | 