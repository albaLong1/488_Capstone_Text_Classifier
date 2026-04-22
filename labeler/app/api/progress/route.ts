import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [{ count: totalComplaints }, labelsRes] = await Promise.all([
    supabase.from('complaints').select('*', { count: 'exact', head: true }),
    supabase.from('labels').select('complaint_id, labeler_name'),
  ]);

  const labels = labelsRes.data ?? [];

  const labelersPerComplaint = new Map<number, Set<string>>();
  const perLabeler: Record<string, number> = {};
  for (const l of labels) {
    if (!labelersPerComplaint.has(l.complaint_id)) {
      labelersPerComplaint.set(l.complaint_id, new Set());
    }
    labelersPerComplaint.get(l.complaint_id)!.add(l.labeler_name);
    perLabeler[l.labeler_name] = (perLabeler[l.labeler_name] ?? 0) + 1;
  }

  let completeComplaints = 0;
  for (const set of labelersPerComplaint.values()) {
    if (set.size >= 3) completeComplaints++;
  }

  return NextResponse.json({
    totalComplaints: totalComplaints ?? 0,
    completeComplaints,
    totalLabels: labels.length,
    perLabeler,
  });
}
