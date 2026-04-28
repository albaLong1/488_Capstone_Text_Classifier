import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name')?.trim();
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('labels')
    .select(
      'id, complaint_id, complaint_category, created_at, complaints(issue, sub_issue, complaint_what_happened)',
    )
    .eq('labeler_name', name)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ labels: data ?? [] });
}
