# Suvarna Jeweller Workspace — Pilot Acceptance Pack & Readiness Checklist

**Document Version:** 1.0.0
**Baseline Git Checkpoint:** `4f71ac3` (`main`)
**Target Environment:** Suvarna Jeweller OS (Multi-Tenant SaaS)
**Primary Pilot Profile:** Single / Multi-Branch Indian Retail Jeweller (e.g., Kalyan Test Jewellers / Thane & Fort Branches)
**Verification Suite:** Automated End-to-End Suite (`tests/e2e/pilot-jeweller-workflow.spec.ts`) & Diagnostic Operational Audits

---

## 1. Executive Summary & Scope

The Suvarna Jeweller Workspace has completed development and testing across core retail POS, multi-tender collections, bank reconciliation, operational reporting, and General Ledger financial statement generation.

This document serves as the **Pilot Readiness Pack and Acceptance Checklist** required before transitioning an operational jewellery business from evaluation/synthetic testing into a controlled live pilot. It establishes:
1. **Pilot Entry Criteria (Go / No-Go Prerequisites)**: Mandatory operational, technical, and governance conditions before real customer or financial data is entered.
2. **Acceptance Verification Matrix**: Detailed domain-by-domain checklist with explicit observable pass criteria and verification statuses (`Pass`, `Fail`, `Not Tested`, `Not Applicable`).
3. **Capability Disclosures & Known Boundaries**: Transparent differentiation between fully implemented features and unverified/unimplemented capabilities (such as customer return UI or automated live rate feeds).
4. **Decision Blockers**: High-priority decisions required from business stakeholders before live deployment.

---

## 2. Pilot Entry Criteria (Go / No-Go Prerequisites)

Prior to entering live jewellery inventory, real customer profiles, or actual banking transactions, the following mandatory conditions must be verified and signed off:

| ID | Criterion Category | Minimum Entry Requirement | Verification Method | Status |
|---|---|---|---|---|
| **EC-01** | **Access Control & Credentials** | All staff accounts configured with unique emails and strong passwords. No shared admin credentials. Default seed passwords rotated. | Database inspect / Auth login audit | **Required Pre-Flight** |
| **EC-02** | **Role-Based Access Control** | Staff assigned strictly according to duty (`SALES_STAFF` cannot view GL reports or re-open reconciliations; `ACCOUNTANT` cannot alter inventory stock; `MANAGER` / `OWNER` restricted to authorized branches). | Multi-role session audit | **Required Pre-Flight** |
| **EC-03** | **Statutory & Business Rules** | 3% GST rate (HSN 7113) verified for intra-state (CGST 1.5% + SGST 1.5%) and inter-state (IGST 3%). Mandatory Rule 114B PAN validation active for transactions exceeding ₹2,00,000. | Billing test voucher check | **Required Pre-Flight** |
| **EC-04** | **Daily Bullion Pricing Process** | Standard Operating Procedure (SOP) established for Store Manager to review and enter daily indicative bullion benchmark rates (24K and 22K per gram) before opening showroom POS. | Manager SOP sign-off | **Required Pre-Flight** |
| **EC-05** | **Customer Data Privacy** | Customer telephone numbers and addresses treated with confidentiality. Explicit consent collected before SMS/WhatsApp communication. No plain-text PAN sharing. | Store policy sign-off | **Required Pre-Flight** |
| **EC-06** | **Opening Balance Formulation** | Ledger opening balances (Cash in Hand, Bank Accounts, Inventory Asset Value, Capital/Equity) finalized. Acknowledgement that un-vouchered pre-ledger invoices will display data-completeness disclosures. | Accounting sign-off | **Required Pre-Flight** |
| **EC-07** | **Backup & Point-in-Time Recovery** | Automated daily database snapshots configured on the production database (e.g., Neon PostgreSQL). Tested manual restore procedure to a staging database verified within 30 minutes. | DevOps restore drill | **Required Pre-Flight** |
| **EC-08** | **Incident & Support Escalation** | Direct technical support hotline, escalation SLA (Critical: < 1 hour, Major: < 4 hours), and bug report channel configured and communicated to store manager. | Contact card distribution | **Required Pre-Flight** |

---

## 3. Pilot Acceptance Checklist

### Status Legend
- **`Pass`**: Functionality fully implemented, verified via automated E2E tests (`tests/e2e/pilot-jeweller-workflow.spec.ts`) and manual operational checks.
- **`Fail`**: Implemented feature failing defined pass criteria.
- **`Not Tested`**: Feature implemented in code/backend but requires physical hardware integration (e.g., physical ESC/POS receipt printer or barcode gun) or live environment testing.
- **`Not Applicable`**: Capability not implemented in the current software build (e.g., UI for sales returns) or out of scope for this pilot phase.

---

### Module A: Business & Branch Setup

| Check ID | Functional Area | Verification Procedure | Observable Pass Criterion | Status |
|---|---|---|---|---|
| **A-01** | Multi-Tenant Isolation | Authenticate as tenant `kalyan-test` and attempt querying data belonging to `suvarna-mumbai`. | Queries return zero records from outside the authenticated tenant organization. Tenant ID enforced at Prisma middleware/service level. | **Pass** |
| **A-02** | Branch Hierarchy & GSTIN | Inspect organization settings for registered branches (e.g., Fort Main Showroom, Thane Store). | Each branch displays registered address, State Code (e.g., 27 for Maharashtra), and unique 15-character GSTIN. | **Pass** |
| **A-03** | Active Branch Context | Toggle between active branches in the navigation header. | Workspace re-scopes inventory, POS counters, and operational reports to the selected active branch context immediately. | **Pass** |

---

### Module B: Staff Roles & RBAC Permissions

| Check ID | Functional Area | Verification Procedure | Observable Pass Criterion | Status |
|---|---|---|---|---|
| **B-01** | Sales Staff Access Boundary | Log in as `SALES_STAFF` and attempt accessing `/reports/trial-balance` or `/reconciliation`. | UI redirects or displays 403 Forbidden. Sales staff only permitted access to POS, Catalogue lookup, and Customer Registration. | **Pass** |
| **B-02** | Accountant Permission Boundary | Log in as `ACCOUNTANT` and access Bank Reconciliation and Financial Reports. | Accountant can import bank statements, execute matching, and view General Ledger statements, but cannot sell inventory without POS assignment. | **Pass** |
| **B-03** | Owner / Manager Oversight | Log in as `OWNER` / `MANAGER`. | Full access across operational dashboards, inventory valuation, branch filters, and managerial overrides. | **Pass** |

---

### Module C: Jewellery Catalogue, Purity, Weights & Bullion Rates

| Check ID | Functional Area | Verification Procedure | Observable Pass Criterion | Status |
|---|---|---|---|---|
| **C-01** | Product & Ornament Creation | Create new jewellery piece (e.g., "22K Antique Temple Gold Choker"). Enter Gross Wt (25.000 g), Stone Wt (1.000 g), Net Wt (24.000 g). | System auto-computes Net Wt = Gross Wt - Stone Wt. Record persists with status `AVAILABLE`. | **Pass** |
| **C-02** | Serial Tagging & BIS HUID | Assign unique serial tag (e.g., `TAG-CHOKER-22K-001`) and 6-character alphanumeric BIS Hallmarking HUID (e.g., `HUID99`). | Tag uniqueness enforced per tenant; duplicate tag creation rejected with clear validation error. | **Pass** |
| **C-03** | Indicative Bullion Benchmarks | Review daily gold rates configured in Indicative Pricing service (24K ₹13,250/g, 22K ₹12,150/g benchmark). | Pricing service accurately derives metal value using purity percentage and net weight. Daily rates visibly displayed on dashboard. | **Pass** |

---

### Module D: Customer Registration & Data Privacy

| Check ID | Functional Area | Verification Procedure | Observable Pass Criterion | Status |
|---|---|---|---|---|
| **D-01** | Phone Deduplication & Normalization | Register customer with valid 10-digit Indian phone (e.g., `9820099999`). Attempt re-registering with formatted number `+91 98200 99999`. | System detects duplicate phone and promotes existing customer record without creating a redundant profile. | **Pass** |
| **D-02** | Mandatory PAN Validation (Rule 114B) | Build cart exceeding ₹2,00,000 gross value. Attempt checkout without valid 10-character PAN. | System blocks final invoice generation, indicating statutory requirement for customer PAN for transactions > ₹2,00,000. | **Pass** |
| **D-03** | Customer Privacy Protection | Check customer record access across non-authorized staff roles. | Contact details and purchase histories remain scoped to the tenant organization. Masking applied where configured. | **Pass** |

---

### Module E: POS Billing, Taxation, Multi-Tender & Stock Deduction

| Check ID | Functional Area | Verification Procedure | Observable Pass Criterion | Status |
|---|---|---|---|---|
| **E-01** | Real-Time Barcode / Tag Scan | Input or scan tag `TAG-CHOKER-22K-001` into POS terminal. | Line item loads with item description, net weight, metal rate, making charges, and stone charges populated automatically. | **Pass** |
| **E-02** | Statutory GST Calculation (HSN 7113) | Verify tax computation for intra-state sale (Maharashtra to Maharashtra). | System computes exactly 3% total GST (1.5% CGST + 1.5% SGST) over taxable value. Inter-state sales compute 3% IGST. | **Pass** |
| **E-03** | Multi-Tender Split Payment | Tender invoice using ₹50,000 Cash, ₹1,00,000 UPI/QR, and remaining balance via Card. | Multiple payment records persist linked to single invoice; payment status updates to `PAID` once tender sum equals gross invoice value. | **Pass** |
| **E-04** | Sequential Branch Invoice Number | Confirm generated invoice number format. | Follows structured format: `INV/[BRANCH_CODE]/[FINANCIAL_YEAR]/[SEQUENCE]` (e.g., `INV/THANE/26-27/0001`). Gapless sequence maintained. | **Pass** |
| **E-05** | Inventory Status & Movement Post | Inspect ornament status and stock movement table immediately post-billing. | Ornament status switches from `AVAILABLE` to `SOLD`. A `StockMovement` row with type `SALE`, timestamp, and invoice reference is created. | **Pass** |
| **E-06** | A4 Tax Invoice Printing Layout | Open printable invoice view / browser print preview. | Invoice displays registered company details, GSTIN, HSN 7113, HUID, itemized gross/stone/net weights, rate, CGST/SGST breakdown, and customer signature block. | **Pass** |
| **E-07** | Physical Thermal Receipt Output | Send invoice to physical ESC/POS 3-inch (80mm) thermal roll printer. | Print readability, line truncation, barcode clarity, and cut command execution on target in-store hardware. | **Not Tested** *(Requires on-site physical hardware)* |

---

### Module F: Returns, Cancellations & Stock Corrections

| Check ID | Functional Area | Verification Procedure | Observable Pass Criterion | Status |
|---|---|---|---|---|
| **F-01** | Customer Sales Return & Credit Note | Customer returns sold ornament for refund or exchange against a credit note. | Dedicated Return / Credit Note UI to reverse invoice, issue credit, and restock ornament. | **Not Applicable** *(Backend `StockMovement` supports `RETURN`, but no end-user UI currently exists)* |
| **F-02** | Invoice Void / Cancellation | Cancel an erroneously generated invoice within the same business day. | Ability to void un-settled invoice, reinstate ornament status to `AVAILABLE`, and mark invoice as `CANCELLED`. | **Not Applicable** *(Not implemented in current UI; must be handled via manual inventory adjustment)* |
| **F-03** | Stock Audit Discrepancy Adjustment | Physical showroom stock audit reveals weight difference or damaged piece. | Manager executes stock adjustment movement with reason code. Ornament weight/status updated with audit log. | **Pass** *(Via inventory service adjustment API)* |

---

### Module G: Bank Statement Import & Reconciliation

| Check ID | Functional Area | Verification Procedure | Observable Pass Criterion | Status |
|---|---|---|---|---|
| **G-01** | Generic Bank CSV Import | Upload standard bank statement CSV (HDFC / ICICI / SBI format) with flexible date, reference, withdrawal, deposit columns. | System parses transactions without encoding errors, validates line counts, and previews un-reconciled bank lines. | **Pass** |
| **G-02** | Rule-Based Auto-Matching | Run automated reconciliation matching engine against recorded customer payments. | Rules A through F successfully match exact amount, UTR / reference number, and date window. Match status marked `RECONCILED`. | **Pass** |
| **G-03** | Settlement Voucher Posting | Execute settlement on matched bank transaction. | System automatically generates balanced double-entry journal voucher: Dr Bank Account (1040) / Cr Payment Clearing Account (1020). | **Pass** |
| **G-04** | Settlement Reversal | Select reconciled settlement and trigger "Reverse Match". | System revokes matched status, generates reversing journal entry, and restores both bank line and payment to un-reconciled state. | **Pass** |

---

### Module H: Financial Statements & Operational Reports

| Check ID | Functional Area | Verification Procedure | Observable Pass Criterion | Status |
|---|---|---|---|---|
| **H-01** | Sales Summary Report | Generate Sales Summary report filtered by date range and branch. | Accurately aggregates total invoice count, gross sales, taxable turnover, CGST, SGST, IGST, metal value, making charges, and discounts. | **Pass** |
| **H-02** | Payment Collections Register | Open Payment Collections report. | Itemizes customer collections by payment tender (Cash, UPI, Card, NEFT) alongside bank settlement clearing realization totals. | **Pass** |
| **H-03** | GST Outward Summary (GSTR-1 Format) | View GST Outward report categorized by B2B (with buyer GSTIN), B2C Large (> ₹2.5L inter-state), and B2C Small. | Taxable amounts and tax liabilities partitioned into correct statutory categories with total tax reconciled to sales ledger. | **Pass** |
| **H-04** | Inventory Valuation Report | Inspect inventory valuation breakdown across Gold, Silver, and Gemstones. | Valuation strictly based on fine gold content (Net Weight × Purity %) multiplied by benchmark bullion rate, with stone charges itemized. | **Pass** |
| **H-05** | General Ledger Trial Balance | Generate Trial Balance for current financial period. | All active nominal, real, and personal ledger accounts listed. Total Debits strictly equal Total Credits ($$Total Debit = Total Credit$$). | **Pass** |
| **H-06** | Profit & Loss Statement | View Profit & Loss report. | Revenue from Sales, Cost of Goods Sold, and Gross Profit calculated. Net Profit accurately transferred to Equity. | **Pass** |
| **H-07** | Balance Sheet & Integrity Disclosures | Inspect Balance Sheet when historical un-vouchered invoices exist. | Accounting equation balances ($$Assets = Liabilities + Equity$$). Prominent warning banner displayed indicating un-vouchered pre-ledger invoices if applicable. | **Pass** |
| **H-08** | CSV Data Export | Click "Export CSV" across all four operational reports. | Browser downloads valid, sanitized CSV files without formula injection risks (`=`, `+`, `-`, `@` escaped). | **Pass** |

---

### Module I: Infrastructure, Backup, Disaster Recovery & Support

| Check ID | Functional Area | Verification Procedure | Observable Pass Criterion | Status |
|---|---|---|---|---|
| **I-01** | Database Snapshot & Point-in-Time Recovery | Verify automated Neon PostgreSQL snapshot schedule and execute test table export. | Daily automated backups active. Test restore confirms zero data corruption. | **Not Tested** *(Operational DevOps prerequisite before live data entry)* |
| **I-02** | System Incident Reporting Procedure | Test support contact mechanism (Help menu / WhatsApp support escalation link). | Escalation ticket or WhatsApp message reaches designated support engineer within defined SLA. | **Not Tested** *(Requires organization support configuration)* |

---

## 4. Pilot Decision Blockers & Operational Workarounds

The following open items require explicit business acknowledgement and operational sign-off from the jeweller leadership prior to commencing live operations:

### Blocker 1: Absence of Dedicated Sales Return / Exchange Front-End UI
- **Finding:** The application database and inventory service support `RETURN` and `ADJUSTMENT` movement types, but **no user-facing screen exists for processing customer sales returns, partial exchanges, or credit notes**.
- **Pilot Impact:** If a customer returns jewellery during the pilot, staff cannot generate an automated credit note or return invoice from the UI.
- **Recommended Workaround:**
  1. For initial pilot (2–4 weeks), limit sales to final sales without direct return workflows, OR
  2. Have the Store Manager execute a manual inventory adjustment via the backend inventory management tool to restock returned items, and record a manual refund journal entry.
  3. **Decision Required:** Does the business accept managing returns manually during the pilot phase?

### Blocker 2: Daily Bullion Rate Feed Integration
- **Finding:** Bullion benchmark rates (24K and 22K) are sourced from an indicative baseline configured in the system rather than a real-time live market ticker feed (e.g., IBJA).
- **Pilot Impact:** Retail prices will not fluctuate automatically with intraday MCX/IBJA market changes.
- **Recommended Workaround:**
  - Store Manager must perform a mandatory morning check-in to inspect and confirm the daily gold and silver rates in the Workspace settings prior to opening POS counters.
  - **Decision Required:** Formalize the morning gold rate sign-off procedure as part of daily store opening checklist.

### Blocker 3: Pre-Ledger Opening Balance Vouchers
- **Finding:** Generating Balance Sheet reports without an initial Opening Journal Entry causes pre-ledger historical payment receipts to display negative clearing asset balances, triggering the system's built-in financial completeness warning banners.
- **Pilot Impact:** Financial statements will correctly display statutory warnings until formal opening vouchers are posted.
- **Recommended Workaround:**
  - Engage the store's chartered accountant to enter a comprehensive Opening Balance Journal Voucher (debiting Opening Stock, Cash in Hand, Bank Accounts; crediting Partner Capital / Reserves) as Transaction #1 of the live tenant.
  - **Decision Required:** Provide signed Opening Trial Balance before relying on the workspace Balance Sheet for statutory filing.

---

## 5. Pilot Sign-Off & Acceptance Authority

| Stakeholder Role | Name / Title | Organization | Signature / Date | Recommendation |
|---|---|---|---|---|
| **Store Operations Lead** | ____________________ | Kalyan Test Jewellers / Retail Partner | ____________________ | [ ] Proceed to Pilot<br>[ ] Conditional<br>[ ] Reject |
| **Head of Accounting** | ____________________ | Retail Partner Finance | ____________________ | [ ] Proceed to Pilot<br>[ ] Conditional<br>[ ] Reject |
| **Technical Implementation Lead** | Antigravity AI Team | NextGen Workflow Automation | ____________________ | [ ] Ready for Pilot Deployment |

---
*Document automatically maintained within repository at [docs/pilot-acceptance-checklist.md](file:///e:/NextGen%20Workflow%20Automation/SaaS%20-%20Jeweler/docs/pilot-acceptance-checklist.md).*
