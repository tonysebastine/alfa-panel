'use client';

import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Terminal,Search,Pause,Play,Download,Wifi,WifiOff} from 'lucide-react';
import {streamLogs} from '@/lib/api-client';

export const SiteLogViewer:React.FC<{domain:string;initialType?:'tomcat'|'python'}>=({domain})=>{
 const [logs,setLogs]=useState<string[]>([]),[paused,setPaused]=useState(false),[query,setQuery]=useState(''),[connected,setConnected]=useState(false),[error,setError]=useState<string|null>(null);
 const abort=useRef<AbortController|null>(null);const pausedRef=useRef(false);useEffect(()=>{pausedRef.current=paused},[paused]);
 useEffect(()=>{abort.current?.abort();const c=new AbortController();abort.current=c;setLogs([]);setError(null);setConnected(false);
   streamLogs(domain,line=>{if(!pausedRef.current)setLogs(v=>[...v.slice(-999),line])},c.signal).then(()=>setConnected(false)).catch(e=>{if(e?.name!=='AbortError'){setError(e?.message||'log stream disconnected')}}).finally(()=>setConnected(false));
   setConnected(true);return()=>c.abort();
 },[domain]);
 const filtered=useMemo(()=>logs.filter(x=>!query||x.toLowerCase().includes(query.toLowerCase())),[logs,query]);
 const download=()=>{const blob=new Blob([logs.join('\n')],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${domain}.log`;a.click();URL.revokeObjectURL(url)};
 return <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden font-mono text-xs flex flex-col h-[540px]">
  <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center gap-3">
   <Terminal className="w-4 h-4 text-emerald-400"/><strong>{domain}</strong>
   <span className={connected?'text-emerald-400':'text-amber-400'}>{connected?<><Wifi className="inline w-3 h-3 mr-1"/>live</>:<><WifiOff className="inline w-3 h-3 mr-1"/>disconnected</>}</span>
   <div className="ml-auto flex items-center gap-2"><div className="relative"><Search className="w-3 h-3 absolute left-2 top-2 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="filter logs" className="bg-slate-900 border border-slate-800 rounded px-7 py-1.5"/></div><button onClick={()=>setPaused(v=>!v)} className="border border-slate-700 rounded px-2 py-1.5">{paused?<Play className="w-3 h-3"/>:<Pause className="w-3 h-3"/>}</button><button onClick={download} className="border border-slate-700 rounded px-2 py-1.5"><Download className="w-3 h-3"/></button></div>
  </div>
  {error&&<div className="p-2 bg-rose-950/30 text-rose-300">{error}</div>}
  <pre className="flex-1 overflow-auto p-4 text-slate-300 whitespace-pre-wrap">{filtered.join('\n')}</pre>
 </div>
}