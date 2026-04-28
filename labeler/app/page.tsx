'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  COMPLAINT_CATEGORY_OPTIONS,
  MAX_COMPLAINT_CATEGORY_PICKS,
} from '@/lib/options';

type Complaint = {
  id: number;
  issue: string | null;
  sub_issue: string | null;
  complaint_what_happened: string | null;
  label_count: number;
};

type Progress = {
  totalComplaints: number;
  completeComplaints: number;
  totalLabels: number;
  perLabeler: Record<string, number>;
};

export default function Home() {
  const [name, setName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<number[]>([]);

  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('labeler_name');
    if (saved) setName(saved);
  }, []);

  const fetchNext = useCallback(async (activeName: string, skipList: number[]) => {
    setLoading(true);
    setError(null);
    setCategories([]);
    try {
      const nextUrl = new URL('/api/next', window.location.origin);
      nextUrl.searchParams.set('name', activeName);
      if (skipList.length) nextUrl.searchParams.set('skip', skipList.join(','));
      const [nextRes, progRes] = await Promise.all([
        fetch(nextUrl.toString(), { cache: 'no-store' }),
        fetch('/api/progress', { cache: 'no-store' }),
      ]);
      if (!nextRes.ok) {
        const errBody = await nextRes.json().catch(() => ({} as { error?: string; hint?: string }));
        const msg = [errBody.error, errBody.hint].filter(Boolean).join(' — ');
        throw new Error(msg || `next failed (${nextRes.status})`);
      }
      if (!progRes.ok) {
        const errBody = await progRes.json().catch(() => ({} as { error?: string }));
        throw new Error(errBody.error || `progress failed (${progRes.status})`);
      }
      const nextData = await nextRes.json();
      const progData: Progress = await progRes.json();
      setProgress(progData);
      if (nextData.complaint) {
        setComplaint({
          ...nextData.complaint,
          complaint_what_happened: highlightText(nextData.complaint!.complaint_what_happened),
        });
        setDone(false);
      } else {
        setComplaint(null);
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (name) void fetchNext(name, []);
  }, [name, fetchNext]);

  function toggleCategory(value: string) {
    setCategories((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      if (prev.length >= MAX_COMPLAINT_CATEGORY_PICKS) return prev;
      return [...prev, value];
    });
  }

  async function submit() {
    if (!complaint || !name || categories.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          complaint_id: complaint.id,
          labeler_name: name,
          complaint_category: categories,
        }),
      });
      if (!res.ok && res.status !== 409) {
        const body = await res.json().catch(() => ({ error: '' }));
        throw new Error(body.error || `submit failed (${res.status})`);
      }
      await fetchNext(name, skipped);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'submit failed');
      setLoading(false);
    }
  }

  function signIn() {
    const clean = nameInput.trim();
    if (!clean) return;
    localStorage.setItem('labeler_name', clean);
    setName(clean);
  }

  function signOut() {
    localStorage.removeItem('labeler_name');
    setName(null);
    setComplaint(null);
    setProgress(null);
    setDone(false);
    setSkipped([]);
  }

  function skipCurrent() {
    if (!name) return;
    const nextSkipped = complaint ? [...skipped, complaint.id] : skipped;
    if (complaint) setSkipped(nextSkipped);
    void fetchNext(name, nextSkipped);
  }

  function highlightText(str: string | string[] | null | undefined): React.ReactNode {
    const keywords = ['Deceit', 'Fraud', 'Legal', 'Serious'];

    if (!str || str === 'No narrative') return 'No narrative';

    const text = Array.isArray(str) ? str.join(' ') : String(str);

    const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const dollarPattern = `\\$\\d+(?:\\.\\d+)?`;
    const keywordRegex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const dollarRegex = new RegExp(`(${dollarPattern})`);
    const combinedRegex = new RegExp(`(${[dollarPattern, ...escaped].join('|')})`, 'gi');

    return text.split(combinedRegex).map((part, i) => {
      if (dollarRegex.test(part))
        return (
          <span key={i} style={{ backgroundColor: 'yellow', fontWeight: 'bold' }}>
            {part}
          </span>
        );
      if (keywordRegex.test(part))
        return (
          <span key={i} style={{ backgroundColor: 'red', fontWeight: 'bold', color: 'white' }}>
            {part}
          </span>
        );
      return part;
    });
  }

  if (!name) {
    return (
      <div className="container">
        <h1>Mortgage Complaint Labeler</h1>
        <p>
          Enter your first name to start. Each complaint needs 3 different labelers; each person
          picks 1–2 category slugs below.
        </p>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') signIn();
          }}
          placeholder="Your name"
          autoFocus
        />
        <button onClick={signIn} disabled={!nameInput.trim()}>
          Start
        </button>
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
          Fully labeled{' '}
          <strong>
            {progress?.completeComplaints ?? '…'} / {progress?.totalComplaints ?? '…'}
          </strong>
        </span>
        <span>
          Your labels <strong>{progress?.perLabeler?.[name] ?? 0}</strong>
        </span>
        <span className="spacer" />
        <Link href="/history" className="link" style={{ color: '#0645ad', textDecoration: 'underline' }}>
          My labels
        </Link>
        <Link href="/game" className="link" style={{ color: '#0645ad', textDecoration: 'underline' }}>
          🎮 Break
        </Link>
        <button onClick={signOut} className="link">
          Sign out
        </button>
      </header>

      {error && <div className="error">{error}</div>}

      {done && !complaint && (
        <>
          <h1>You&apos;re all done!</h1>
          <p>There are no complaints left for you to label. Thanks!</p>
        </>
      )}

      {complaint && (
        <>
          <div className="complaint">
            <div className="meta">
              <strong>ID:</strong> {complaint.id}
              {complaint.issue ? (
                <>
                  {' '}
                  · <strong>Issue:</strong> {complaint.issue}
                </>
              ) : null}
              {complaint.sub_issue ? (
                <>
                  {' '}
                  · <strong>Sub-issue:</strong> {complaint.sub_issue}
                </>
              ) : null}{' '}
              · <strong>Labels so far:</strong> {complaint.label_count}/3
            </div>
            <div className="text">{complaint.complaint_what_happened || 'No narrative'}</div>
          </div>

          <p className="hint" style={{ marginBottom: 12, maxWidth: 720 }}>
            Choose <strong>1</strong> preferably; choose <strong>2</strong> if unsure. At most{' '}
            {MAX_COMPLAINT_CATEGORY_PICKS} selections.
          </p>

          <fieldset disabled={loading}>
            <legend>Categories</legend>
            {COMPLAINT_CATEGORY_OPTIONS.map((o) => (
              <label key={o.value} style={{ display: 'block', marginBottom: 10 }}>
                <input
                  type="checkbox"
                  name="complaint_category"
                  value={o.value}
                  checked={categories.includes(o.value)}
                  disabled={categories.length >= MAX_COMPLAINT_CATEGORY_PICKS && !categories.includes(o.value)}
                  onChange={() => toggleCategory(o.value)}
                />
                <code style={{ marginRight: 8 }}>{o.value}</code>
                <span>{o.meaning}</span>
              </label>
            ))}
          </fieldset>

          <div className="actions">
            <button onClick={submit} disabled={loading || categories.length === 0}>
              Submit & next
            </button>
            <button onClick={skipCurrent} disabled={loading} className="secondary">
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
