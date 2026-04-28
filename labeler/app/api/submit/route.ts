import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizeComplaintCategories } from '@/lib/options';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const complaint_id = Number(body.complaint_id);
  const labeler_name = typeof body.labeler_name === 'string' ? body.labeler_name.trim() : '';
  const complaint_category = normalizeComplaintCategories(body.complaint_category);

  if (!Number.isFinite(complaint_id) || !labeler_name || !complaint_category) {
    return NextResponse.json({ error: 'missing or invalid fields' }, { status: 400 });
  }

  const { count } = await supabase
    .from('labels')
    .select('*', { count: 'exact', head: true })
    .eq('complaint_id', complaint_id);

  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: 'complaint already has 3 labels' }, { status: 409 });
  }

  const { error } = await supabase.from('labels').insert({
    complaint_id,
    labeler_name,
    complaint_category,
  });

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
