import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type LabelRow = {
  complaint_id: number;
  labeler_name: string;
  unfairness_type: string[];
  justice_violation: string;
  severity: string;
  created_at: string;
};

type ComplaintRow = {
  id: number;
  date_received: string | null;
  issue: string | null;
  sub_issue: string | null;
  complaint_what_happened: string | null;
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const password = url.searchParams.get('password') ?? '';
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || password !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [{ data: complaints, error: cErr }, { data: labels, error: lErr }] = await Promise.all([
    supabase
      .from('complaints')
      .select('id, date_received, issue, sub_issue, complaint_what_happened')
      .order('id'),
    supabase
      .from('labels')
      .select('complaint_id, labeler_name, unfairness_type, justice_violation, severity, created_at')
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
    'date_received',
    'issue',
    'sub_issue',
    'complaint_what_happened',
    'labeler_1_name',
    'labeler_1_unfairness',
    'labeler_1_justice',
    'labeler_1_severity',
    'labeler_2_name',
    'labeler_2_unfairness',
    'labeler_2_justice',
    'labeler_2_severity',
    'labeler_3_name',
    'labeler_3_unfairness',
    'labeler_3_justice',
    'labeler_3_severity',
    'unfairness_consensus',
    'justice_consensus',
    'severity_consensus',
    'is_complete',
  ];

  const majority = (values: (string | undefined)[]): string => {
    const counts = new Map<string, number>();
    for (const v of values) {
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    let tied = false;
    for (const [v, c] of counts) {
      if (c > bestCount) {
        best = v;
        bestCount = c;
        tied = false;
      } else if (c === bestCount) {
        tied = true;
      }
    }
    if (!best) return '';
    return tied ? 'tie' : best;
  };

  // For multi-label unfairness: a tag is in the "consensus" if >=2 of 3
  // labelers picked it. Returns tags semicolon-joined (stable order).
  const multiConsensus = (perLabeler: string[][]): string => {
    const counts = new Map<string, number>();
    for (const tags of perLabeler) {
      for (const t of new Set(tags)) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    const agreed: string[] = [];
    for (const [t, c] of counts) if (c >= 2) agreed.push(t);
    return agreed.sort().join(';');
  };

  const lines: string[] = [headers.join(',')];
  for (const c of (complaints ?? []) as ComplaintRow[]) {
    const ls = (byId.get(c.id) ?? []).slice(0, 3);
    const complete = ls.length >= 3;
    const row: unknown[] = [
      c.id,
      c.date_received,
      c.issue,
      c.sub_issue,
      c.complaint_what_happened,
    ];
    for (let i = 0; i < 3; i++) {
      const l = ls[i];
      const tags = Array.isArray(l?.unfairness_type) ? l!.unfairness_type : [];
      row.push(
        l?.labeler_name ?? '',
        tags.slice().sort().join(';'),
        l?.justice_violation ?? '',
        l?.severity ?? '',
      );
    }
    if (complete) {
      row.push(
        multiConsensus(ls.map((l) => (Array.isArray(l.unfairness_type) ? l.unfairness_type : []))),
        majority(ls.map((l) => l.justice_violation)),
        majority(ls.map((l) => l.severity)),
      );
    } else {
      row.push('', '', '');
    }
    row.push(complete ? 'true' : 'false');
    lines.push(row.map(csvEscape).join(','));
  }

  return new NextResponse(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="labeled_mortgage_holdout.csv"',
    },
  });
}
