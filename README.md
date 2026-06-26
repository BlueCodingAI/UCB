# Disha — Multilingual CAP Guidance Platform

> **दिशा** — your calm guide through the Maharashtra **Centralised Admission Process (CAP)**.
> A guidance & counselling support platform (EN / HI / MR) with an AI **chat + voice bot** whose
> answers come **strictly from an admin-managed knowledge base** (RAG). Disha is **not** the official
> admission portal — the [Maharashtra CET Cell](https://cetcell.mahacet.org) remains authoritative.

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | Next.js 15 (App Router) · TypeScript · Tailwind v4 · next-intl (EN/HI/MR) |
| Backend   | Node.js · Express · TypeScript · better-sqlite3 (SQLite, WAL) |
| AI / RAG  | OpenAI (chat + embeddings) · in-memory vector cache + SQLite FTS5 hybrid retrieval |
| Voice     | Sarvam AI — Saarika STT + Bulbul TTS (en-IN / hi-IN / mr-IN) |
| Payments  | Razorpay (INR) — order → checkout → webhook activation |

See [`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md) for the full architecture contract.

## Quick start

```bash
# 1. Install dependencies for both apps
npm run install:all

# 2. Configure environment
#    backend:  cp backend/.env.example backend/.env   (Windows: copy)
#    frontend: cp frontend/.env.example frontend/.env.local
#    Add your OPENAI_API_KEY, SARVAM_API_KEY, RAZORPAY_* when ready.
#    (Without keys the app still runs: dev-RAG fallback, voice/payments degrade gracefully.)

# 3. Create the database schema + seed plans, admin, sample KB & banner
npm run migrate
npm run seed

# 4. Run both apps (backend :4000, frontend :3000)
npm run dev
```

Open http://localhost:3000. The admin panel is at http://localhost:3000/admin
(default super admin: `admin@disha.local` / `Admin@12345` — change in `backend/.env`).

## Scripts (root)

- `npm run install:all` — install backend + frontend deps
- `npm run migrate` — apply the SQLite schema (idempotent)
- `npm run seed` — seed roles, plans, admin, app settings, a sample indexed KB doc & banner
- `npm run dev` — run backend + frontend together
- `npm run build` — production build of both
- `npm run typecheck` — type-check both apps

## Project layout

```
backend/   Express API — auth, chat (RAG), voice (Sarvam), KB+indexing,
           payments (Razorpay), profile, recommendations, counselling,
           notifications, banners, full admin panel. SQLite schema in
           src/db/schema.sql; background jobs via an in-process worker.
frontend/  Next.js app — marketing site, auth, user app (chat/voice/dashboard/
           next-steps/profile/counselling/notices/billing) and the admin panel.
           Design system in src/styles/globals.css.
docs/      project_detail.txt (requirement) + BUILD_SPEC.md (architecture).
```

## Notes

- **KB-only answers:** if a question isn't covered by the active knowledge base, the bot returns the
  mandated fallback in the user's language — it never answers from general knowledge.
- **Yearly CAP update:** tag new documents with the new `cap_year`, deactivate the old set, re-index.
- **Peak season:** WAL SQLite + in-memory vector cache + query/embedding/TTS caches + rate limits.

_Disha is an unofficial guidance tool. Always verify against the official CET Cell / CAP portals._
