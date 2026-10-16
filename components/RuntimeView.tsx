'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, RotateCw, Square, Play, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api-client';

type SiteStatus = {
  domain?: string;
  status?: string;
  health_status?: string;
  cpu_percent?: number;
  memory_usage_mb?: number;
  memory_limit_mb?: number;
  pids_current?: number;
  [key: string]: unknown;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function RuntimeView({ domain }: { domain: string }) {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const readStatus = useCallback(async (): Promise<SiteStatus | null> => {
    if (!domain) return null;
    const response = await api.listSites();
    return (response.sites || []).find((site: SiteStatus) => site.domain === domain) || null;
  }, [domain]);

  const refresh = useCallback(async () => {
    try {
      const site = await readStatus();
      setStatus(site);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to load runtime status'));
    }
  }, [readStatus]);

  useEffect(() => {
    let active = true;

    readStatus()
      .then((site) => {
        if (!active) return;
        setStatus(site);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, 'Unable to load runtime status'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [readStatus]);

  const action = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.siteAction(domain, name);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause, 'Runtime action failed'));
    } finally {
      setBusy(false);
    }
  };

  if (!domain) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
        Select a site to inspect its runtime.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-900 bg-rose-950/30 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h2 className="font-semibold">{domain}</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Runtime controls use the typed agent interface. Arbitrary shell execution is disabled.
            </p>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => action('start')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs disabled:opacity-50">
              <Play className="mr-1 inline h-3 w-3" /> Start
            </button>
            <button disabled={busy} onClick={() => action('stop')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs disabled:opacity-50">
              <Square className="mr-1 inline h-3 w-3" /> Stop
            </button>
            <button disabled={busy} onClick={() => action('restart')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs disabled:opacity-50">
              <RotateCw className="mr-1 inline h-3 w-3" /> Restart
            </button>
          </div>
        </div>
        {loading && <p className="mt-4 text-xs text-slate-400">Loading runtime status…</p>}
        {!loading && !status && !error && <p className="mt-4 text-xs text-slate-400">No runtime status is available for this site yet.</p>}
        {status && (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['State', status.status ?? 'unknown'],
              ['Health', status.health_status ?? 'unknown'],
              ['CPU', `${Number(status.cpu_percent || 0).toFixed(1)}%`],
              ['RAM', `${Number(status.memory_usage_mb || 0).toFixed(0)} / ${Number(status.memory_limit_mb || 0).toFixed(0)} MB`],
              ['PIDs', status.pids_current ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-[10px] uppercase text-slate-500">{label}</div>
                <div className="mt-1 text-sm text-slate-200">{String(value)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-400" />
          <h3 className="font-semibold">Runtime security</h3>
        </div>
        <div className="grid gap-3 text-xs text-slate-300 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-950 p-3">Read-only root filesystem</div>
          <div className="rounded-lg bg-slate-950 p-3">No-new-privileges + dropped capabilities</div>
          <div className="rounded-lg bg-slate-950 p-3">Dedicated tenant network</div>
        </div>
      </section>
    </div>
  );
}
