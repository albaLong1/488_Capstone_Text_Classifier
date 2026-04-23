'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type GameState = 'idle' | 'playing' | 'done';

const ROUND_SECONDS = 30;

export default function Game() {
  const [state, setState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [targetPos, setTargetPos] = useState({ x: 50, y: 50 });
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    const saved = Number(localStorage.getItem('game_high_score') ?? '0');
    if (Number.isFinite(saved)) setHighScore(saved);
  }, []);

  useEffect(() => {
    if (state !== 'playing') return;
    const tick = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(tick);
          setState('done');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [state]);

  useEffect(() => {
    if (state !== 'done') return;
    setHighScore((prev) => {
      const next = Math.max(prev, score);
      localStorage.setItem('game_high_score', String(next));
      return next;
    });
  }, [state, score]);

  function randomPos() {
    return {
      x: 8 + Math.random() * 84,
      y: 8 + Math.random() * 84,
    };
  }

  function start() {
    setScore(0);
    setTimeLeft(ROUND_SECONDS);
    setTargetPos(randomPos());
    setState('playing');
  }

  function hit(e: React.MouseEvent) {
    e.stopPropagation();
    setScore((s) => s + 1);
    setTargetPos(randomPos());
  }

  return (
    <div className="container">
      <header className="topbar">
        <span>🎮 Quick break — House Hunt</span>
        <span className="spacer" />
        <Link
          href="/"
          className="link"
          style={{ color: '#0645ad', textDecoration: 'underline' }}
        >
          ← Back to labeling
        </Link>
      </header>

      {state === 'idle' && (
        <>
          <h1>Click the 🏠</h1>
          <p>
            Click the house as many times as you can in{' '}
            <strong>{ROUND_SECONDS} seconds</strong>. It moves every time you hit it.
          </p>
          <p>
            High score: <strong>{highScore}</strong>
          </p>
          <button onClick={start}>Start</button>
        </>
      )}

      {state === 'playing' && (
        <>
          <header className="topbar">
            <span>
              Time <strong>{timeLeft}s</strong>
            </span>
            <span>
              Score <strong>{score}</strong>
            </span>
            <span>
              Best <strong>{highScore}</strong>
            </span>
          </header>
          <div
            style={{
              position: 'relative',
              height: 460,
              background: '#fff',
              border: '1px solid #e4e6eb',
              borderRadius: 8,
              overflow: 'hidden',
              userSelect: 'none',
            }}
          >
            <button
              onClick={hit}
              style={{
                position: 'absolute',
                left: `${targetPos.x}%`,
                top: `${targetPos.y}%`,
                transform: 'translate(-50%, -50%)',
                width: 52,
                height: 52,
                fontSize: 38,
                lineHeight: '52px',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'left 80ms linear, top 80ms linear',
              }}
              aria-label="Click the house"
            >
              🏠
            </button>
          </div>
        </>
      )}

      {state === 'done' && (
        <>
          <h1>Time&apos;s up!</h1>
          <p>
            You scored <strong>{score}</strong>
            {score > 0 && score === highScore && score > 0 ? ' — new high score!' : ''}
          </p>
          <p>
            High score: <strong>{highScore}</strong>
          </p>
          <div className="actions">
            <button onClick={start}>Play again</button>
            <Link href="/" className="button secondary">
              Back to labeling
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
