<div align="center" style="padding:16px">
  <img src="public/contentfill.png" alt="Contentfill" width="320" />
</div>

<h3 align="center">A local admin UI for bulk Contentful schema and content migrations. Built with Next.js + Tailwind.</h3>

---

**Contents** &nbsp;·&nbsp; [💡 Why?](#-why) &nbsp;·&nbsp; [✨ What it does](#-what-it-does) &nbsp;·&nbsp; [🔍 How it works](#-how-it-works) &nbsp;·&nbsp; [🛠 Setup](#-setup) &nbsp;·&nbsp; [📋 Workflows](#-workflows) &nbsp;·&nbsp; [🗄 Cache & Refresh](#-cache--refresh) &nbsp;·&nbsp; [⚙️ Transforms](#️-available-transforms) &nbsp;·&nbsp; [🔒 Security](#-security)

---

## 💡 Why?

Contentful's web UI is designed for editing individual entries and content types one at a time. When you need to **add or remove a field across dozens of content types**, or **backfill a field on thousands of entries** using a derivable value (e.g. generating slugs from titles), the UI offers no path forward — you're left writing one-off scripts, running them blind, and hoping you didn't miss anything.

The [Content Management API (CMA)](https://www.contentful.com/developers/docs/references/content-management-api/) can do all of this, but it has its own friction: rate limits to respect, a mandatory two-phase process for deleting fields, bulk-action endpoints that aren't obvious to find, and no dry-run concept built in. There are third-party migration tools ([Contentful CLI migrations](https://github.com/contentful/contentful-cli), [contentful-migrate](https://github.com/deluan/contentful-migrate)) but they're code-first and schema-version-oriented — not well suited to ad-hoc data backfills or one-off field cleanups where you want to *see* what will change before committing.

Contentfill fills that gap: a minimal, opinionated UI that wraps the CMA with preview-first workflows, sensible batching, and clear feedback at every step.

---

## ✨ What it does

**Update Entries** — pick a content type, target field, and transform; get a dry-run preview of every proposed change before anything is written; manually override any proposed value; apply and publish in bulk.

**Add Field** — add a new field to one or more content types at once, with a dry-run preview of conflicts.

**Delete Field** — remove a field from one or more content types via Contentful's required two-phase process (omit → remove), with a live progress indicator.

The environment the app is pointed at is shown in the header badge so you always know what you're operating on.

---


## 🔍 How it works

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React / Next.js client)                           │
│                                                             │
│  ConfigStep → PreviewStep → ApplyStep                       │
│       │             │            │                          │
│       └─────────────┴────────────┘                          │
│                     │  fetch()                              │
└─────────────────────┼───────────────────────────────────────┘
                      │  HTTP (same host)
┌─────────────────────▼───────────────────────────────────────┐
│  Next.js API Routes  (server — CMA token never leaves here) │
│                                                             │
│  GET  /api/content-types   ── cached, tag-invalidated       │
│  POST /api/preview         ── dry-run, zero writes          │
│  POST /api/apply           ── bulk update + publish         │
│  POST /api/schema-apply    ── add field to N content types  │
│  POST /api/schema-delete   ── phase 1: omit / phase 2: remove│
└─────────────────────┬───────────────────────────────────────┘
                      │  contentful-management SDK
┌─────────────────────▼───────────────────────────────────────┐
│  Contentful CMA  (api.contentful.com)                       │
│                                                             │
│  getContentTypes / getEntries  ←── read                     │
│  entry.update() + bulkPublish  ←── write (batched)          │
│  contentType.update() + publish ←── schema mutations        │
└─────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **Preview before write** — all compute happens in `/api/preview` (pure transforms, zero CMA writes). The client shows the full diff and blocks apply if there are unresolved errors.
- **Batching** — entries are fetched with `sys.id[in]` (up to 200/call), updates run at concurrency 4, and publishes use the [Bulk Actions API](https://www.contentful.com/developers/docs/references/content-management-api/#/reference/bulk-actions) (up to 100/call) with a per-entry fallback.
- **Two-phase field deletion** — the CMA [rejects single-step field removal](https://www.contentful.com/developers/docs/references/content-management-api/#/reference/content-types/content-type/delete-a-field) to prevent accidental data loss. Phase 1 sets `omitted: true` (hides from delivery API, keeps data); phase 2 removes the field entirely.
- **Targeted cache invalidation** — after a schema mutation, the API returns the updated content type shape from the in-memory publish result. The client patches only those types in its cache — no full reload, no extra API calls.

**Relevant docs:**
- [Content Management API reference](https://www.contentful.com/developers/docs/references/content-management-api/)
- [contentful-management.js SDK](https://github.com/contentful/contentful-management.js)
- [Bulk Actions API](https://www.contentful.com/developers/docs/references/content-management-api/#/reference/bulk-actions)
- [Field omission / deletion](https://www.contentful.com/developers/docs/references/content-management-api/#/reference/content-types/content-type/delete-a-field)
- [Rate limits](https://www.contentful.com/developers/docs/references/content-management-api/#/introduction/api-rate-limits)

---

## 🛠 Setup

### 1. Get a Contentful Management Token

Contentful dashboard → **Settings → API keys → Content management tokens → Generate personal token**

This is a write-access token — keep it out of git.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
CONTENTFUL_MANAGEMENT_TOKEN=your_cma_token
CONTENTFUL_SPACE_ID=your_space_id
CONTENTFUL_ENVIRONMENT=master            # or staging, sandbox, etc.
```

> **Tip:** Run against a non-production environment first (`staging`, `sandbox`) to validate before touching `master`.

### 3. Install and run

```bash
npm install -g pnpm   # if you don't have pnpm
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 📋 Workflows

### Update Entries

1. **Select a content type**
2. **Select target field** — the field that will be written to
3. **Select a transform** and configure its options (source field, word limit, etc.)
4. **Set locale** (default `en-US`) and whether to skip entries that already have a value
5. Click **Generate preview →** — fetches all entries and computes proposed changes
6. Review the table: **current value → proposed value** per entry
   - Filter by All / Errors / Warnings / Clean
   - Search by source field value, entry ID, or proposed value
   - Entries with **errors** are blocked; click into the Proposed cell to fix manually
   - Entry IDs link directly to the entry in Contentful
7. Click **Apply** — updates and publishes in bulk; failures are reported individually

### Add Field

1. Select one or more content types (grouped, with search and bulk-select)
2. Define the new field: ID, name, type, required, localized
3. Preview shows which types will receive the field and which would conflict
4. Apply — adds and publishes the field; results link to each updated content type in Contentful

After applying, the app patches only the affected content types in its local cache — no full reload needed.

### Delete Field

1. Select one or more content types
2. Pick the field to delete (dropdown shows all fields present across selected types, with a count badge)
3. Preview shows the current field shape for each type, with the target field highlighted in red
4. Apply runs Contentful's required two-phase deletion:
   - **Phase 1** — marks field as `omitted` (hides from API, preserves data)
   - **Phase 2** — removes field from schema (permanent)

   A progress indicator shows which phase is running. Do not navigate away during deletion.

---

## 🗄 Cache & Refresh

Content type schemas are cached server-side (1 hour TTL) and client-side in `sessionStorage`. After any schema mutation (add or delete field), the app automatically patches only the affected types in both caches — no extra API calls.

To force a full refresh from Contentful (e.g. after a change made outside this tool), click the **↻ Refresh** button next to the workflow tabs.

---

## ⚙️ Available transforms

| ID | Label | Notes |
|----|-------|-------|
| `slugify` | Generate slug from text field | Derives a URL-safe slug from a source field. Skips entries with an existing slug. Non-alphanumeric characters (including hyphens) become word separators. Auto-deduplicates. Flags unresolvable collisions as errors. |
| `copy-field` | Copy field value | Copies one field's value to another. Optionally skips entries that already have a value. |

### Adding a transform

1. Copy `lib/transforms/_template.ts` to `lib/transforms/your-transform.ts` and fill in the TODOs — the file has step-by-step comments for every required and optional field
2. Register it in `lib/transforms/index.ts`:
   ```ts
   import { myTransform } from './your-transform';
   const _registered = [..., myTransform];
   ```

The transform will automatically appear in the UI dropdown.

**If a transform fails to load** (missing required fields, wrong types, duplicate ID), it appears in the UI as a non-selectable broken entry with the specific error, so you can fix it without restarting anything except the server. A `console.error` is also logged at startup. `apply()` errors are caught per-entry and shown as blocking errors in the preview. `validateBatch()` errors surface as per-entry warnings so the preview still loads.

---

## 🔒 Security

- The CMA token is **server-side only** — it never leaves the API routes
- For local dev, no additional auth is needed (localhost is the protection)
- To deploy to a shared/public URL: set `ADMIN_SECRET=some_strong_value` in your deployment environment. The UI will prompt for this value before making any API calls.

---

## 🌐 Locale

Default locale is `en-US`. Change it in Step 1 options if your space uses a different primary locale.
