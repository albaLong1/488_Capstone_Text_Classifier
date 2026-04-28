import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const EXPORT_FILENAME = 'human_category_labels.csv';

type LabelRow = {
  complaint_id: number;
  labeler_name: string;
  complaint_category: string[] | string;
  created_at: string;
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function categoryTags(c: string[] | string | null | undefined): string[] {
  if (Array.isArray(c)) return c.filter((x): x is string => typeof x === 'string');
  if (typeof c === 'string' && c) return [c];
  return [];
}

function categoryCell(c: string[] | string | null | undefined): string {
  return categoryTags(c)
    .slice()
    .sort()
    .join(';');
}

/** Slugs that at least two of three raters included in their pick. */
function multiConsensus(perRater: string[][]): string {
  const counts = new Map<string, number>();
  for (const tags of perRater) {
    for (const t of new Set(tags)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const agreed: string[] = [];
  for (const [t, n] of counts) if (n >= 2) agreed.push(t);
  return agreed.sort().join(';');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const password = url.searchParams.get('password') ?? '';
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || password !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [{ data: complaints, error: cErr }, { data: labels, error: lErr }] = await Promise.all([
    supabase.from('complaints').select('id').order('id'),
    supabase
      .from('labels')
      .select('complaint_id, labeler_name, complaint_category, created_at')
      .order('created_at', { ascending: true }),
  ]);

  if (cErr || lErr) {
    return NextResponse.json(
      { error: (cErr ?? lErr)?.message ?? 'query failed' },
      { status: 500 },
    );
  }

  const byId = new Map<number, LabelRow[]>();
  for (const l of (labels ?? []) as LabelRow[]) {
    if (!byId.has(l.complaint_id)) byId.set(l.complaint_id, []);
    byId.get(l.complaint_id)!.push(l);
  }

  const headers = [
    'complaint_id',
    'rater_1_name',
    'rater_1_category_slugs',
    'rater_1_submitted_at',
    'rater_2_name',
    'rater_2_category_slugs',
    'rater_2_submitted_at',
    'rater_3_name',
    'rater_3_category_slugs',
    'rater_3_submitted_at',
    'consensus_category_slugs',
    'three_raters_complete',
  ];

  const lines: string[] = [headers.join(',')];
  for (const c of complaints ?? []) {
    const id = Number((c as { id: number }).id);
    const ls = (byId.get(id) ?? []).slice(0, 3);
    const complete = ls.length >= 3;
    const row: unknown[] = [id];
    for (let i = 0; i < 3; i++) {
      const l = ls[i];
      row.push(
        l?.labeler_name ?? '',
        categoryCell(l?.complaint_category),
        l?.created_at ?? '',
      );
    }
    if (complete) {
      row.push(multiConsensus(ls.map((l) => categoryTags(l.complaint_category))));
    } else {
      row.push('');
    }
    row.push(complete ? 'true' : 'false');
    lines.push(row.map(csvEscape).join(','));
  }

  return new NextResponse(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${EXPORT_FILENAME}"`,
    },
  });
}
