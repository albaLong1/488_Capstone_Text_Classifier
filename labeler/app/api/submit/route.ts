import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { VALID_JUSTICE, VALID_SEVERITY, VALID_UNFAIRNESS } from '@/lib/options';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const complaint_id = Number(body.complaint_id);
  const labeler_name = typeof body.labeler_name === 'string' ? body.labeler_name.trim() : '';
  const unfairnessRaw = body.unfairness_type;
  const justice_violation = body.justice_violation;
  const severity = body.severity;

  const unfairness_type = Array.isArray(unfairnessRaw)
    ? Array.from(new Set(unfairnessRaw.filter((v) => typeof v === 'string')))
    : [];

  if (
    !Number.isFinite(complaint_id) ||
    !labeler_name ||
    unfairness_type.length === 0 ||
    unfairness_type.some((v) => !VALID_UNFAIRNESS.has(v)) ||
    !VALID_JUSTICE.has(justice_violation) ||
    !VALID_SEVERITY.has(severity)
  ) {
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
    unfairness_type,
    justice_violation,
    severity,
  });

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
