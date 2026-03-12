# Contentful Admin

A local admin UI for bulk Contentful field migrations. Built with Next.js + Tailwind.

## What it does

- Pick a **content type**, **target field**, and **transform**
- Get a **dry-run preview** of every proposed change before anything is written
- **Manually override** any entry's proposed value inline
- **Apply** — updates and publishes each entry, reports failures individually

## Setup

### 1. Get a Contentful Management Token

Contentful dashboard → **Settings → API keys → Content Management Tokens → Generate personal token**

This is a write-access token — keep it out of git.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
CONTENTFUL_MANAGEMENT_TOKEN=your_cma_token
CONTENTFUL_SPACE_ID=your_space_id        # same as NEXT_PUBLIC_SPACE_ID in canopy
CONTENTFUL_ENVIRONMENT=master            # or staging, sandbox, etc.
```

> **Tip:** Run against a non-production environment first (`staging`, `sandbox`) to validate before touching `master`.

### 3. Install and run

```bash
# Install pnpm if you don't have it
npm install -g pnpm

pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

### Step 1 — Configure

1. **Select a content type** — all types in your space are shown as radio buttons
2. **Select target field** — the field that will be written to
3. **Select a transform** — see [Available transforms](#available-transforms) below
4. **Configure transform options** — e.g. source field, word limit
5. **Options** — locale (default `en-US`) and whether to skip entries that already have a value

Click **Generate preview →** — the app fetches all entries and computes proposed changes. This may take a few seconds for large content types.

### Step 2 — Preview & Review

- A table shows **current value → proposed value** for every entry being changed
- **Filter** by All / Errors / Warnings / Clean using the radio buttons
- **Search** by label, entry ID, or proposed value
- Entries with **errors** are highlighted red and blocked from applying
- Click into any **Proposed value** cell to edit it manually (useful for resolving collisions)
- The apply button shows how many entries will actually be written

### Step 3 — Results

- Summary of succeeded / failed entries
- Failed entries show the specific Contentful API error
- Expand the success list to see all updated entry IDs

---

## Available transforms

| ID | Label | Notes |
|----|-------|-------|
| `slugify` | Generate slug from text field | Derives a URL-safe slug from a source field. Skips entries with an existing slug. Auto-deduplicates with `-2`, `-3` suffixes. Flags unresolvable collisions as errors. |
| `copy-field` | Copy field value | Copies one field's value to another. Optionally skips entries that already have a value. |

### Adding a new transform

1. Create `lib/transforms/your-transform.ts` implementing the `Transform<TConfig>` interface
2. Add it to the registry in `lib/transforms/index.ts`

It will automatically appear in the UI dropdown. See `lib/transforms/types.ts` for the full interface and `lib/transforms/slugify.ts` for a reference implementation.

---

## Security

- The CMA token is **server-side only** — it never leaves the API routes
- For local dev, no additional auth is needed (localhost is the protection)
- To deploy to a shared/public URL: set `ADMIN_SECRET=some_strong_value` in your deployment env. The UI will require this value before making any API calls.

---

## Locale

Default locale is `en-US`. Change it in Step 1 options if your space uses a different primary locale. Multi-locale support (applying to multiple locales in one pass) is a planned extension.
