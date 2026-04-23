'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { JUSTICE_OPTIONS, SEVERITY_OPTIONS, UNFAIRNESS_OPTIONS } from '@/lib/options';

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

  const [unfairness, setUnfairness] = useState('');
  const [justice, setJustice] = useState('');
  const [severity, setSeverity] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('labeler_name');
    if (saved) setName(saved);
  }, []);

  const fetchNext = useCallback(async (activeName: string, skipList: number[]) => {
    setLoading(true);
    setError(null);
    setUnfairness('');
    setJustice('');
    setSeverity('');
    try {
      const nextUrl = new URL('/api/next', window.location.origin);
      nextUrl.searchParams.set('name', activeName);
      if (skipList.length) nextUrl.searchParams.set('skip', skipList.join(','));
      const [nextRes, progRes] = await Promise.all([
        fetch(nextUrl.toString(), { cache: 'no-store' }),
        fetch('/api/progress', { cache: 'no-store' }),
      ]);
      if (!nextRes.ok) throw new Error(`next failed (${nextRes.status})`);
      if (!progRes.ok) throw new Error(`progress failed (${progRes.status})`);
      const nextData = await nextRes.json();
      const progData: Progress = await progRes.json();
      setProgress(progData);
      if (nextData.complaint) {
        setComplaint(nextData.complaint);
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

  async function submit() {
    if (!complaint || !name || !unfairness || !justice || !severity) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          complaint_id: complaint.id,
          labeler_name: name,
          unfairness_type: unfairness,
          justice_violation: justice,
          severity,
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

  if (!name) {
    return (
      <div className="container">
        <h1>Mortgage Complaint Labeler</h1>
        <p>Enter your first name to start. Each complaint needs 3 different labelers, and everyone tags 3 dimensions per complaint.</p>
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
        <button onClick={signIn} disabled={!nameInput.trim()}>Start</button>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="topbar">
        <span>Labeler <strong>{name}</strong></span>
        <span>Fully labeled <strong>{progress?.completeComplaints ?? '…'} / {progress?.totalComplaints ?? '…'}</strong></span>
        <span>Your labels <strong>{progress?.perLabeler?.[name] ?? 0}</strong></span>
        <span className="spacer" />
        <Link href="/history" className="link" style={{ color: '#0645ad', textDecoration: 'underline' }}>My labels</Link>
        <Link href="/game" className="link" style={{ color: '#0645ad', textDecoration: 'underline' }}>🎮 Break</Link>
        <button onClick={signOut} className="link">Sign out</button>
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
              {complaint.issue ? <> · <strong>Issue:</strong> {complaint.issue}</> : null}
              {complaint.sub_issue ? <> · <strong>Sub-issue:</strong> {complaint.sub_issue}</> : null}
              {' '}· <strong>Labels so far:</strong> {complaint.label_count}/3
            </div>
            <div className="text">{complaint.complaint_what_happened || '(no narrative)'}</div>
          </div>

          <fieldset disabled={loading}>
            <legend>Unfairness type</legend>
            {UNFAIRNESS_OPTIONS.map((o) => (
              <label key={o.value}>
                <input
                  type="radio"
                  name="unfairness"
                  value={o.value}
                  checked={unfairness === o.value}
                  onChange={() => setUnfairness(o.value)}
                />
                <strong>{o.label}</strong>
                {o.hint && <span className="hint"> — {o.hint}</span>}
              </label>
            ))}
          </fieldset>

          <fieldset disabled={loading}>
            <legend>Justice violation</legend>
            {JUSTICE_OPTIONS.map((o) => (
              <label key={o.value}>
                <input
                  type="radio"
                  name="justice"
                  value={o.value}
                  checked={justice === o.value}
                  onChange={() => setJustice(o.value)}
                />
                <strong>{o.label}</strong>
                {o.hint && <span className="hint"> — {o.hint}</span>}
              </label>
            ))}
          </fieldset>

          <fieldset disabled={loading}>
            <legend>Severity</legend>
            {SEVERITY_OPTIONS.map((o) => (
              <label key={o.value}>
                <input
                  type="radio"
                  name="severity"
                  value={o.value}
                  checked={severity === o.value}
                  onChange={() => setSeverity(o.value)}
                />
                <strong>{o.label}</strong>
                {o.hint && <span className="hint"> — {o.hint}</span>}
              </label>
            ))}
          </fieldset>

          <div className="actions">
            <button
              onClick={submit}
              disabled={loading || !unfairness || !justice || !severity}
            >
              Submit & next
            </button>
            <button
              onClick={skipCurrent}
              disabled={loading}
              className="secondary"
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
