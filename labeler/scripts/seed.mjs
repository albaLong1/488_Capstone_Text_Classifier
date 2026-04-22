import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const csvPath = resolve(__dirname, '..', '..', 'data', 'mortgage_holdout_1000.csv');

console.log(`Reading ${csvPath}`);
const csv = readFileSync(csvPath, 'utf8');
const rows = parse(csv, { columns: true, skip_empty_lines: true });
console.log(`Parsed ${rows.length} rows`);

const records = rows.map((r) => ({
  id: Number(r.complaint_id),
  date_received: r.date_received,
  issue: r.issue,
  sub_issue: r.sub_issue,
  complaint_what_happened: r.complaint_what_happened,
}));

const supabase = createClient(url, key, { auth: { persistSession: false } });

const CHUNK = 500;
for (let i = 0; i < records.length; i += CHUNK) {
  const chunk = records.slice(i, i + CHUNK);
  const { error } = await supabase
    .from('complaints')
    .upsert(chunk, { onConflict: 'id' });
  if (error) {
    console.error('Upsert failed:', error);
    process.exit(1);
  }
  console.log(`Upserted ${Math.min(i + CHUNK, records.length)} / ${records.length}`);
}

console.log('Seed complete.');
