import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

if (!process.argv.includes('--yes')) {
  console.error('Refusing to run without --yes.');
  console.error('This will DELETE ALL ROWS from `labels` and `complaints`.');
  console.error('Re-run as: npm run reset -- --yes');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function countRows(table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`Failed to count ${table}:`, error);
    process.exit(1);
  }
  return count ?? 0;
}

async function deleteAll(table) {
  const { error } = await supabase.from(table).delete().gte('id', 0);
  if (error) {
    console.error(`Failed to delete from ${table}:`, error);
    process.exit(1);
  }
}

const labelsBefore = await countRows('labels');
const complaintsBefore = await countRows('complaints');
console.log(`Before: labels=${labelsBefore}, complaints=${complaintsBefore}`);

await deleteAll('labels');
await deleteAll('complaints');

const labelsAfter = await countRows('labels');
const complaintsAfter = await countRows('complaints');
console.log(`After:  labels=${labelsAfter}, complaints=${complaintsAfter}`);
console.log('Reset complete. Run `npm run seed` to reload complaints.');
