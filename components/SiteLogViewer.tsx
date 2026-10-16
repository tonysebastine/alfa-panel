'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal, Search, Pause, Play, Download, Wifi, WifiOff } from 'lucide-react';
import { streamLogs } from '@/lib/api-client';

type SiteLogViewerProps = { domain: string; initialType?: 'tomcat' | 'python' };
type ConnectionState = 'connecting' | 'connected' | 'disconnected';

function SiteLogViewerInstance({ domain }: SiteLogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState('');
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const controller = new AbortController();

    void streamLogs(
      domain,
      (line) => {
        if (controller.signal.aborted) return;
        setConnection('connected');
        if (!pausedRef.current) setLogs((current) => [...current.slice(-999), line]);
      },
      controller.signal,
    )
      .then(() => {
        if (!controller.signal.aborted) setConnection('disconnected');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || (cause instanceof Error && cause.name === 'AbortError')) return;
        setError(cause instanceof Error ? cause.message : 'Log stream disconnected');
        setConnection('disconnected');
      });

    return () => {
      controller.abort();
    };
  }, [domain]);

  const filtered = useMemo(
    () => logs.filter((line) => !query || line.toLowerCase().includes(query.toLowerCase())),
    [logs, query],
  );

  const download = () => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${domain}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const isConnected = connection === 'connected';

  return (
    <div className="flex h-[540px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 font-mono text-xs">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950 p-3">
        <Terminal className="h-4 w-4 text-emerald-400" />
        <strong>{domain}</strong>
        <span className={isConnected ? 'text-emerald-400' : 'text-amber-400'} aria-live="polite">
          {connection === 'connected' ? (
            <><Wifi className="mr-1 inline h-3 w-3" />Live</>
          ) : connection === 'connecting' ? (
            'Connecting…'
          ) : (
            <><WifiOff className="mr-1 inline h-3 w-3" />Disconnected</>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3 w-3 text-slate-500" />
            <input aria-label="Filter logs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter logs" className="rounded border border-slate-800 bg-slate-900 px-7 py-1.5" />
          </div>
          <button aria-label={paused ? 'Resume log stream' : 'Pause log stream'} onClick={() => setPaused((value) => !value)} className="rounded border border-slate-700 px-2 py-1.5">
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </button>
          <button aria-label="Download logs" onClick={download} className="rounded border border-slate-700 px-2 py-1.5">
            <Download className="h-3 w-3" />
          </button>
        </div>
      </div>
      {error && <div role="alert" className="bg-rose-950/30 p-2 text-rose-300">{error}</div>}
      <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-slate-300">{filtered.join('\n')}</pre>
    </div>
  );
}

export const SiteLogViewer: React.FC<SiteLogViewerProps> = (props) => (
  <SiteLogViewerInstance key={props.domain} {...props} />
);
