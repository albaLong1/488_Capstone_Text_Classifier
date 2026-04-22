'use client';

import { useEffect, useState } from 'react';

type Progress = {
  totalComplaints: number;
  completeComplaints: number;
  totalLabels: number;
  perLabeler: Record<string, number>;
};

export default function Admin() {
  const [password, setPassword] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    fetch('/api/progress', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setProgress)
      .catch(() => {});
  }, []);

  return (
    <div className="container">
      <h1>Admin — progress & export</h1>

      {progress && (
        <>
          <p>
            <strong>{progress.completeComplaints}</strong> of{' '}
            <strong>{progress.totalComplaints}</strong> complaints fully labeled.{' '}
            <strong>{progress.totalLabels}</strong> labels total.
          </p>
          <h2>Labels per person</h2>
          <ul>
            {Object.entries(progress.perLabeler)
              .sort((a, b) => b[1] - a[1])
              .map(([n, c]) => (
                <li key={n}>
                  <strong>{n}</strong>: {c}
                </li>
              ))}
            {Object.keys(progress.perLabeler).length === 0 && <li>(no labels yet)</li>}
          </ul>
        </>
      )}

      <h2 style={{ marginTop: 24 }}>Export CSV</h2>
      <p>The CSV contains every complaint plus each labeler&apos;s three tags. Rows with 3 labelers include a majority-vote consensus column per dimension.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Admin password"
      />{' '}
      {password ? (
        <a
          href={`/api/export?password=${encodeURIComponent(password)}`}
          className="button"
          download
        >
          Download CSV
        </a>
      ) : (
        <span className="button disabled">Download CSV</span>
      )}
    </div>
  );
}
