// CardCallgraphPanel — v2.6 inline callgraph viewer for PR cards.
//
// This file is the lazy-loaded entry chunk for the engine. The heavy
// engine code + WASM grammars are dynamic-imported inside the effect
// so they stay out of the initial bundle.

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  cardId: number;
  githubUrl: string;
  onClose: () => void;
}

type PhaseTag = 'init' | 'meta' | 'files' | 'parse' | 'graph' | 'render' | 'done' | 'error';

export default function CardCallgraphPanel({ cardId, githubUrl, onClose }: Props) {
  const [phase, setPhase] = useState<PhaseTag>('init');
  const [progressMsg, setProgressMsg] = useState<string>('Loading engine…');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  void cardId;

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPhase('init');
        setProgressMsg('Loading engine…');
        const engine = await import('../../lib/callmap-engine');
        if (cancelled) return;

        const result = await engine.buildPrCallgraph(githubUrl, (p) => {
          if (cancelled) return;
          setPhase(p.phase as PhaseTag);
          const counter = p.current != null && p.total != null ? ` (${p.current}/${p.total})` : '';
          setProgressMsg(`${p.message}${counter}`);
        });
        if (cancelled) return;

        setPhase('render');
        setProgressMsg('Rendering…');
        if (containerRef.current) {
          engine.renderInto(containerRef.current, result);
        }
        setStats(
          `${result.stats.filesScanned} files · ` +
          `${result.functions.length} nodes (` +
          `+${result.stats.added} ~${result.stats.changed} -${result.stats.removed}) · ` +
          `${result.edges.length} edges`,
        );
        setPhase('done');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[callgraph] failed:', err);
        if (cancelled) return;
        setError((err as Error).message);
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [githubUrl]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-bg flex flex-col"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft bg-surface">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-sm">Callgraph</span>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-text-muted font-mono truncate hover:text-accent"
          >
            {githubUrl.replace('https://github.com/', '')}
          </a>
        </div>
        <div className="flex items-center gap-3">
          {stats && (
            <span className="text-xs text-text-muted font-mono hidden md:inline">{stats}</span>
          )}
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative overflow-auto">
        {phase !== 'done' && phase !== 'error' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-2 z-10 bg-bg/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Spinner />
              <span>{progressMsg}</span>
            </div>
          </div>
        )}
        {phase === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="surface p-4 rounded-md border border-error/30 max-w-md text-center">
              <div className="text-sm text-error mb-1 font-semibold">Failed to render callgraph</div>
              <div className="text-xs text-text-muted">{error}</div>
            </div>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin text-accent" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.25" />
      <path d="M21 12 A9 9 0 0 0 12 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
