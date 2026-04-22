'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { JUSTICE_OPTIONS, SEVERITY_OPTIONS, UNFAIRNESS_OPTIONS } from '@/lib/options';

type MyLabel = {
  id: number;
  complaint_id: number;
  unfairness_type: string;
  justice_violation: string;
  severity: string;
  created_at: string;
  complaints: {
    issue: string | null;
    sub_issue: string | null;
    complaint_what_happened: string | null;
  } | null;
};

export default function History() {
  const [name, setName] = useState<string | null>(null);
  const [labels, setLabels] = useState<MyLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const lookup = useMemo(() => {
    const mk = (opts: readonly { value: string; label: string }[]) =>
      new Map(opts.map((o) => [o.value, o.label]));
    return {
      unfairness: mk(UNFAIRNESS_OPTIONS),
      justice: mk(JUSTICE_OPTIONS),
      severity: mk(SEVERITY_OPTIONS),
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('labeler_name');
    setName(saved);
  }, []);

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    setError(null);
    fetch(`/api/mine?name=${encodeURIComponent(name)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`request failed (${r.status})`);
        return r.json();
      })
      .then((d) => setLabels(d.labels ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'failed to load'))
      .finally(() => setLoading(false));
  }, [name]);

  if (!name) {
    return (
      <div className="container">
        <p>
          Sign in first on the <Link href="/">home page</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="topbar">
        <span>
          Labeler <strong>{name}</strong>
        </span>
        <span>
          You have labeled <strong>{labels.length}</strong> complaints
        </span>
        <span className="spacer" />
        <Link href="/">← Back to labeling</Link>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <p>Loading…</p>}
      {!loading && labels.length === 0 && <p>You haven&apos;t labeled anything yet.</p>}

      {labels.map((l) => {
        const narrative = l.complaints?.complaint_what_happened ?? '';
        const expanded = expandedId === l.id;
        const preview =
          !expanded && narrative.length > 300 ? narrative.slice(0, 300) + '…' : narrative;
        return (
          <div key={l.id} className="complaint">
            <div className="meta">
              <strong>ID:</strong> {l.complaint_id}
              {l.complaints?.issue ? (
                <>
                  {' '}· <strong>Issue:</strong> {l.complaints.issue}
                </>
              ) : null}
              {l.complaints?.sub_issue ? (
                <>
                  {' '}· <strong>Sub-issue:</strong> {l.complaints.sub_issue}
                </>
              ) : null}
              {' '}· <strong>Labeled:</strong> {new Date(l.created_at).toLocaleString()}
            </div>
            <div className="text">{preview || '(no narrative)'}</div>
            {narrative.length > 300 && (
              <button
                className="link"
                onClick={() => setExpandedId(expanded ? null : l.id)}
              >
                {expanded ? 'Show less' : 'Show full narrative'}
              </button>
            )}
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
              <div>
                <strong>Unfairness:</strong>{' '}
                {lookup.unfairness.get(l.unfairness_type) ?? l.unfairness_type}
              </div>
              <div>
                <strong>Justice:</strong>{' '}
                {lookup.justice.get(l.justice_violation) ?? l.justice_violation}
              </div>
              <div>
                <strong>Severity:</strong>{' '}
                {lookup.severity.get(l.severity) ?? l.severity}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
