# Mortgage Complaint Labeler

A small Next.js + Supabase web app for your 6-person team to manually classify the 1,000 mortgage complaints in `data/mortgage_holdout_1000.csv`.

Each complaint needs **3 different labelers**. Every labeler tags 3 dimensions:

1. **Unfairness type** — Unaware of charge / Excessive charge / Delay / Unethical Collections / None-Other
2. **Justice violation** — Distributive / Procedural / Interactional
3. **Severity** — Low / Medium / High

A complaint is marked complete once 3 distinct people have labeled it (9 labels total). The final CSV export gives you every labeler's tags side by side plus a majority-vote consensus column per dimension.

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
- When everyone is done, hit `/admin`, download `labeled_mortgage_holdout.csv`, and you have your full labeled dataset.

## Export format

The CSV has one row per complaint with columns:

```
complaint_id, date_received, issue, sub_issue, complaint_what_happened,
labeler_1_name, labeler_1_unfairness, labeler_1_justice, labeler_1_severity,
labeler_2_name, labeler_2_unfairness, labeler_2_justice, labeler_2_severity,
labeler_3_name, labeler_3_unfairness, labeler_3_justice, labeler_3_severity,
unfairness_consensus, justice_consensus, severity_consensus, is_complete
```

- Columns for missing labelers are blank if a row isn't complete yet.
- `*_consensus` is the majority vote across the three labelers, or `tie` if no single value wins. Only set when `is_complete = true`.

## Rules enforced by the backend

- A single person cannot label the same complaint twice (unique constraint).
- The API refuses a 4th label on any complaint.
- The "next complaint" endpoint only returns complaints the current labeler has NOT yet seen, and that have fewer than 3 labels.

## Troubleshooting

- **Seed fails with "relation complaints does not exist"** — you didn't run `schema.sql` yet.
- **`/api/next` returns 500** — check that the `get_next_complaint` SQL function was created (re-run `schema.sql`).
- **Labelers see the same complaint** — that's fine, complaints need 3 labelers. A given person will never see the same complaint twice.
