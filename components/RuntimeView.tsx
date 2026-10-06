'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, RotateCw, Square, Play, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api-client';

export default function RuntimeView({domain}:{domain:string}){
  const [status,setStatus]=useState<any>(null);
  const [logs,setLogs]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const refresh=useCallback(async()=>{if(!domain)return;try{const r:any=await api.listSites();const s=(r.sites||[]).find((x:any)=>x.domain===domain);setStatus(s||null);setError(null)}catch(e){setError(e instanceof Error?e.message:'Unable to load runtime status')}},[domain]);
  useEffect(()=>{refresh()},[refresh]);

  const action=async(name:string)=>{setBusy(true);try{await api.siteAction(domain,name);await refresh()}catch(e){setError(e instanceof Error?e.message:'Runtime action failed')}finally{setBusy(false)}};
  const loadLogs=()=>setLogs('Live log streaming is available through the authenticated agent endpoint. Open the Logs view to attach the stream.');

  if(!domain)return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Select a site to inspect its runtime.</div>;
  return <div className="space-y-5">
    {error&&<div className="rounded-xl border border-rose-900 bg-rose-950/30 p-3 text-sm text-rose-300">{error}</div>}
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400"/><h2 className="font-semibold">{domain}</h2></div><p className="text-xs text-slate-400 mt-1">Live runtime controls through the typed agent. Arbitrary shell execution is disabled.</p></div>
        <div className="flex gap-2">
          <button disabled={busy} onClick={()=>action('start')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs"><Play className="inline w-3 h-3 mr-1"/>Start</button>
          <button disabled={busy} onClick={()=>action('stop')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs"><Square className="inline w-3 h-3 mr-1"/>Stop</button>
          <button disabled={busy} onClick={()=>action('restart')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs"><RotateCw className="inline w-3 h-3 mr-1"/>Restart</button>
        </div>
      </div>
      {status&&<div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">{[['State',status.status],['Health',status.health_status],['CPU',`${Number(status.cpu_percent||0).toFixed(1)}%`],['RAM',`${Number(status.memory_usage_mb||0).toFixed(0)} / ${Number(status.memory_limit_mb||0).toFixed(0)} MB`],['PIDs',status.pids_current||0]].map(([k,v])=><div key={String(k)} className="rounded-xl bg-slate-950 border border-slate-800 p-3"><div className="text-[10px] uppercase text-slate-500">{k}</div><div className="text-sm mt-1 text-slate-200">{String(v)}</div></div>)}</div>}
    </section>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-4 h-4 text-cyan-400"/><h3 className="font-semibold">Runtime security</h3></div>
      <div className="grid sm:grid-cols-3 gap-3 text-xs text-slate-300"><div className="rounded-lg bg-slate-950 p-3">Read-only root filesystem</div><div className="rounded-lg bg-slate-950 p-3">No-new-privileges + dropped caps</div><div className="rounded-lg bg-slate-950 p-3">Dedicated tenant network</div></div>
      <button onClick={loadLogs} className="mt-4 text-xs text-cyan-300 hover:text-cyan-200">Refresh runtime log connection</button>
      {logs&&<pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-black p-4 text-xs text-slate-300 whitespace-pre-wrap">{logs}</pre>}
    </section>
  </div>;
}
