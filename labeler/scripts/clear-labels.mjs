import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'From labeler/: use .env.local (see .env.local.example) or run:\n' +
      '  node --env-file=.env.local scripts/clear-labels.mjs\n' +
      '  node --env-file=../.env scripts/clear-labels.mjs   # if vars live in repo root .env',
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// PostgREST requires a filter on delete; this matches all positive ids.
const { error, count } = await supabase.from('labels').delete({ count: 'exact' }).gte('id', 0);

if (error) {
  console.error('Delete failed:', error.message);
  process.exit(1);
}

console.log(`Removed ${count ?? 'all'} row(s) from labels.`);
