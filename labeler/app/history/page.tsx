'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { COMPLAINT_CATEGORY_OPTIONS, categoryTitle } from '@/lib/options';

type MyLabel = {
  id: number;
  complaint_id: number;
  complaint_category: string[] | string;
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

  const meaningBySlug = useMemo((): Map<string, string> => {
    return new Map(COMPLAINT_CATEGORY_OPTIONS.map((o) => [o.value, o.meaning]));
  }, []);

  function formatCategories(c: string[] | string): string {
    const tags = Array.isArray(c) ? c : c ? [c] : [];
    return tags
      .map((slug) => {
        const title = categoryTitle(slug);
        const m = meaningBySlug.get(slug);
        return m ? `${title} — ${m}` : title;
      })
      .join(' · ');
  }

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
                  {' '}
                  · <strong>Issue:</strong> {l.complaints.issue}
                </>
              ) : null}
              {l.complaints?.sub_issue ? (
                <>
                  {' '}
                  · <strong>Sub-issue:</strong> {l.complaints.sub_issue}
                </>
              ) : null}{' '}
              · <strong>Labeled:</strong> {new Date(l.created_at).toLocaleString()}
            </div>
            <div className="text">{preview || '(no narrative)'}</div>
            {narrative.length > 300 && (
              <button className="link" onClick={() => setExpandedId(expanded ? null : l.id)}>
                {expanded ? 'Show less' : 'Show full narrative'}
              </button>
            )}
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
              <div>
                <strong>Categories:</strong> {formatCategories(l.complaint_category)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
