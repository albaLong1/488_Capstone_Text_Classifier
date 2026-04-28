import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name')?.trim();
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const skipParam = url.searchParams.get('skip') ?? '';
  const skipIds = skipParam
    ? skipParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : [];

  const { data, error } = await supabase.rpc('get_next_complaint', {
    p_name: name,
    p_skip: skipIds,
  });
  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint:
          'If this mentions the function or relation: open Supabase → SQL Editor and run the full labeler/schema.sql (creates get_next_complaint and tables).',
      },
      { status: 500 },
    );
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return NextResponse.json({ complaint: null });

  return NextResponse.json({
    complaint: {
      id: Number(row.id),
      issue: row.issue,
      sub_issue: row.sub_issue,
      complaint_what_happened: row.complaint_what_happened,
      label_count: Number(row.label_count),
    },
  });
}
