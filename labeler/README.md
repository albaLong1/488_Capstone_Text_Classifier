# Mortgage Complaint Labeler

A small Next.js + Supabase web app for your 6-person team to manually classify the 1,000 mortgage complaints in `data/mortgage_holdout_1000.csv`.

Each complaint needs **3 different labelers**. Each labeler picks **1 or 2** `complaint_category` slugs (same slug twice is deduped; max 2 distinct). UI copy: prefer 1, use 2 if unsure.

| Slug | Meaning |
|------|---------|
| `improper_charges` | Category 1 — financial / dollar dispute |
| `improper_process` | Category 2 — procedural / admin (incl. “none clearly fit”) |
| `deceptive_discriminatory` | Category 3 — deception / discrimination |

A complaint is complete once 3 distinct people have labeled it. The CSV encodes each labeler’s picks as slugs **joined with `;`**. When all three are in, **`category_consensus`** lists any slug that **at least two** labelers included (same rule as the old multi-tag unfairness consensus).

### Upgrading from single-slug `complaint_category` (text) to 1–2 slugs (text[])

If your `labels` table still has `complaint_category` as a single `text` column, run **`schema_migrate_category_text_to_array.sql`** once in the SQL Editor (it truncates `labels`). New projects should use the current **`schema.sql`**.

### Clearing labels or upgrading an old Supabase database

- **Reset all submitted labels** (keep complaint rows so you do not need to re-seed):
  1. **Supabase Dashboard → SQL Editor → New query**, run:
     ```sql
     truncate table labels restart identity;
     ```
     That removes every label and resets the `labels` id sequence.
  2. **Or from your machine** (same `SUPABASE_*` vars as seeding — usually `labeler/.env.local`; if yours are only in the repo root `.env`, use the second command):
     ```bash
     cd labeler
     npm run clear-labels
     # or:
     node --env-file=../.env scripts/clear-labels.mjs
     ```
     This deletes all rows in `labels` (complaints are unchanged).
- **Old schema** (columns `unfairness_type`, `justice_violation`, `severity`): run  
  `schema_migrate_to_complaint_category.sql` once. It truncates labels, drops the old columns, and adds `complaint_category`.
- **Never run the migration** on a database that was already created from the current `schema.sql` (you would get a duplicate column error). For those DBs, use `truncate` only to wipe labels.

---

## 1. Create the Supabase project (free)

1. Go to <https://supabase.com> and create a project.
2. In the dashboard, open **SQL Editor** and paste the contents of `schema.sql`. Run it. This creates the `complaints` and `labels` tables and the `get_next_complaint()` function.
3. Open **Project Settings → API** and grab:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **`service_role` key** (under "Project API keys" — the *secret* one, NOT the `anon` key)

   The service role key bypasses row-level security, which is what this app needs since there's no per-user auth. It's used **only server-side**. Never commit it.

## 2. Local setup

```bash
cd labeler
cp .env.local.example .env.local
```

Edit `.env.local`:

```
SUPABASE_URL=https://YOURPROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...         # service_role key from step 1
ADMIN_PASSWORD=pick-anything-you-want    # gates the /admin export page
```

Install and seed:

```bash
npm install
npm run seed        # uploads all 1000 complaints from ../data/mortgage_holdout_1000.csv
npm run dev         # opens on http://localhost:3000
```

Visit `http://localhost:3000`, enter a name, and you should see your first complaint.

## 3. Deploy to Vercel

1. Push this repo to GitHub (you already have it — Vercel will pick up the `labeler/` subdirectory).
2. Go to <https://vercel.com>, **Add New → Project**, import the repo.
3. Under **Root Directory**, select `labeler`.
4. Framework preset: **Next.js** (auto-detected).
5. Add **Environment Variables** (same 3 keys as `.env.local`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
6. Deploy. Send your friends the `*.vercel.app` URL.

## 4. Using it

- Friends visit the URL, type their name, start labeling. Their name is saved in `localStorage` so they don't re-enter it.
- The **Skip** button fetches a different random complaint without saving anything.
- You can see progress any time at `/admin` (enter your `ADMIN_PASSWORD` to download the CSV).
- When everyone is done, hit `/admin`, download **human_category_labels.csv** — label-only export (see below).

## Export format (`human_category_labels.csv`)

Separate from the original holdout CSV: **no** `date_received`, **no** issue text, **no** narrative — only ids and what raters submitted.

One row per complaint in the database, columns:

```
complaint_id,
rater_1_name, rater_1_category_slugs, rater_1_submitted_at,
rater_2_name, rater_2_category_slugs, rater_2_submitted_at,
rater_3_name, rater_3_category_slugs, rater_3_submitted_at,
consensus_category_slugs, three_raters_complete
```

- `rater_*_category_slugs`: one slug or two, sorted, separated by `;`.
- `consensus_category_slugs`: slugs that **≥2** raters included; `;`-joined. Empty until `three_raters_complete` is `true`.
- `rater_*_submitted_at`: ISO timestamp from the database (blank if that slot has no label yet).
- Missing rater slots are blank; `three_raters_complete` is `true` only when three distinct raters have submitted.

## Rules enforced by the backend

- A single person cannot label the same complaint twice (unique constraint).
- The API refuses a 4th label on any complaint.
- The "next complaint" endpoint only returns complaints the current labeler has NOT yet seen, and that have fewer than 3 labels.

## Troubleshooting

- **Seed fails with "relation complaints does not exist"** — you didn't run `schema.sql` yet.
- **`/api/next` returns 500** — check that the `get_next_complaint` SQL function was created (re-run `schema.sql`).
- **Labelers see the same complaint** — that's fine, complaints need 3 labelers. A given person will never see the same complaint twice.
