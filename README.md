# UnderAI — Document Comparison Tool

Insurance policy audit tool: compare issued policy PDFs against a placement slip using AI (Google Gemini), with real-time progress via Server-Sent Events.

## Stack

- **API:** TypeScript, Express, Drizzle ORM, PostgreSQL
- **Web:** Next.js 15, Tailwind CSS
- **AI:** Google Gemini (`gemini-2.0-flash`)

## Prerequisites

- Node.js 20+
- [Neon](https://neon.tech) Postgres (free tier) — or any PostgreSQL
- [Gemini API key](https://aistudio.google.com/apikey) (free tier)

Docker is **optional** (only if you prefer local Postgres via `docker compose`).

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Create a Neon database

1. Sign up at [neon.tech](https://neon.tech) and create a project.
2. In the Neon console, open **Connect** and copy the connection string.
3. Prefer the **pooled** connection string for this app.
4. Ensure the URL ends with `?sslmode=require` (add it if missing).

### 3. Environment

```bash
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — your Neon connection string
- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)
- `JWT_SECRET` — any long random string

Copy the same `.env` into the API folder (Drizzle CLI reads it there):

```bash
cp .env apps/api/.env
```

### 4. Database migrate & seed

```bash
npm run build -w @underai/shared
cd apps/api
npm run db:migrate
npm run db:seed
```

> Migrations are already in `apps/api/drizzle/`. You only need `npm run db:generate` if you change the schema.

### 5. Run dev servers

From repo root:

```bash
npm run dev
```

- API: http://localhost:4000
- Web: http://localhost:3000

### Demo login

| Email | Password |
|-------|----------|
| `broker@underai.io` | `password123` |

## Usage

1. Log in at http://localhost:3000/login
2. Upload a **placement slip** PDF (reference)
3. Upload one or more **issued policy** PDFs
4. Click **Run policy audit**
5. Watch live progress; review mismatches per policy

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | JWT login |
| POST | `/sessions` | Create session |
| POST | `/sessions/:id/reference` | Upload placement slip (versioned) |
| POST | `/sessions/:id/documents` | Upload policies |
| POST | `/sessions/:id/compare` | Start async job (`Idempotency-Key` optional) |
| GET | `/jobs/:id` | Job status, items, events |
| GET | `/jobs/:id/events` | SSE stream |

## Architecture

```
routes → controllers → services → repos
```

- **Structured extraction:** PDF → text → Gemini → normalized insurance JSON (Zod)
- **Comparison:** normalized slip vs policy → mismatch JSON (JSONB)
- **Async jobs:** immediate `jobId`, background processing, SSE progress
- **Idempotency:** file hash dedup on upload; compare key dedup on jobs
- **Retries:** up to 3 attempts on transient Gemini/network errors
- **Versioning:** each new slip upload increments `reference_versions.version`

## Project structure

```
apps/api/     Express backend
apps/web/     Next.js frontend (UnderAI theme)
packages/shared/  Zod schemas & types
```

## Optional: local Postgres with Docker

```bash
docker compose up -d
# DATABASE_URL=postgresql://underai:underai@localhost:5432/underai
```

## License

MIT — assignment/demo project.
