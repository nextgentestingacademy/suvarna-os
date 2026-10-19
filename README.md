# SUVARNA — Jewellery Business OS

Multi-tenant SaaS platform engineered specifically for jewellery retailers in India. Built with Next.js 15 (App Router), TypeScript, Prisma ORM, PostgreSQL, Better Auth, and Tailwind CSS.

---

## 1. Architecture & Design Principles

- **Multi-Tenant Isolation**: Business data is segregated by Tenant (`Organization`). Access is resolved and verified server-side through `SecurityContext`. Browser-supplied tenant IDs are never trusted as proof of authorization.
- **Identity & Memberships**: A single `User` identity can belong to multiple jewellery businesses via `Member` records with distinct roles (`OWNER`, `MANAGER`, `ACCOUNTANT`, `SALES_STAFF`).
- **Branch-Aware Data Scoping**: Staff permissions and showroom data are explicitly mapped per branch (`MembershipBranchAccess`).
- **Decimal Precision**: All metal weights (3 decimal places, e.g. `0.001 g`) and monetary amounts are computed using `decimal.js` to eliminate binary floating-point errors.
- **Privacy-Safe Auditing**: Sensitive keys (passwords, tokens, secrets, PAN) are automatically redacted before audit logs are persisted.

---

## 2. Prerequisites & Environment Setup

### Prerequisites
- **Node.js**: v20+ or v24+ (`v24.11.1` verified)
- **npm**: v10+ (`11.6.2` verified)
- **Git**: v2.40+

### Step 1: Managed Cloud Database Setup (Neon)
1. Sign up or log in at [https://neon.tech](https://neon.tech).
2. Create a new project named `suvarna-dev`. Select the **Asia-Pacific (Mumbai - ap-south-1)** region for lowest latency to Indian retail stores.
3. In the project dashboard, locate the **Connection Details** card.
4. Enable **Connection Pooling** (PgBouncer).
5. Copy the connection strings:
   - **Pooled connection string** (port `6543` / `-pooler` domain) -> `DATABASE_URL`
   - **Direct connection string** (port `5432`) -> `DIRECT_URL`

### Step 2: Configure Environment Variables
Copy the template file to `.env`:
```bash
cp .env.example .env
```
Edit `.env` with your editor and paste your Neon connection strings:
```env
DATABASE_URL="postgresql://user:password@ep-sample-pooler.ap-south-1.aws.neon.tech/suvarna_dev?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:password@ep-sample.ap-south-1.aws.neon.tech/suvarna_dev?sslmode=require"
BETTER_AUTH_SECRET="generate-a-random-32-byte-hex-secret-in-production"
BETTER_AUTH_URL="http://localhost:3000"
```
*(Note: `.env` is strictly gitignored. Never commit real credentials or secrets).*

---

## 3. Database Migration & Seeding

### Apply Migrations
Run the tracked migration against your configured PostgreSQL database:
```bash
npx prisma migrate dev
```

### Seed Development Data
Populate fictional development personas and sample branches:
```bash
npm run prisma:seed
```
*Seed script creates:*
- **Tenant 1**: `Suvarna Jewellers Mumbai` (`suvarna-mumbai`)
  - **Branches**: `Fort Main Showroom` (Main), `Navi Mumbai Studio`
  - **Personas**:
    - `owner@suvarna.test` (Role: `OWNER`, all branches)
    - `manager@suvarna.test` (Role: `MANAGER`, Fort branch)
    - `accountant@suvarna.test` (Role: `ACCOUNTANT`, all branches)
    - `sales@suvarna.test` (Role: `SALES_STAFF`, Fort branch only)
- **Tenant 2**: `Kalyan Test Jewellers` (`kalyan-test`)
  - Isolated tenant with `Thane Store` and `owner@kalyan.test` (used to verify cross-tenant rejection).

*(Safety: `prisma/seed.ts` contains an explicit check preventing execution in `production`).*

---

## 4. Running Tests & Development

### Automated Test Suite (Vitest)
Run the unit and integration test suite:
```bash
npm test
```
*Current test coverage (15 tests passing):*
- `tests/unit/decimal.test.ts`: 3-decimal gram weights, pure gold conversion, Indian Numbering System formatting, and 3% GST (1.5% CGST + 1.5% SGST).
- `tests/unit/rbac.test.ts`: Role permission matrix validation and branch-scoping assertions.
- `tests/unit/audit.test.ts`: Verification of automatic redaction for sensitive keys (passwords, tokens, PAN).
- `tests/integration/security-context.test.ts`: Rejection of cross-tenant access attempts and unauthorized branch access.

### Production Build
Verify Next.js compilation:
```bash
npm run build
```

### Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application status.

---

## 5. Reference Materials (Preserved Baseline)
- `suvarna_jewellery_business_os_full_prototype.html`: Complete interactive prototype demonstrating dual UI personas (Customer Experience vs Jeweller Workspace) and brand aesthetic.
- `Suvarna_Product_Overview_for_Jewellers.docx` & `.pdf`: Platform concept, roadmap, and AI integration specifications.
