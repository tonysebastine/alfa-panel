'use client';
import {useEffect,useState} from 'react';
import {Cpu,HardDrive,Activity,Shield} from 'lucide-react';
import {api} from '@/lib/api-client';

export const HostMetricsOverview=()=>{
 const [m,setM]=useState<any>(null),[rules,setRules]=useState<any[]>([]),[error,setError]=useState<string|null>(null),[port,setPort]=useState(''),[protocol,setProtocol]=useState('tcp'),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;const load=async()=>{try{const [metrics,fw]=await Promise.all([api.metrics(),api.firewall()]);if(alive){setM(metrics);setRules(fw.rules||[]);setError(null)}}catch(e){if(alive)setError(e instanceof Error?e.message:'Unable to load host telemetry')}};load();const t=setInterval(load,5000);return()=>{alive=false;clearInterval(t)}},[]);
 const apply=async(action:'allow'|'deny')=>{const n=Number(port);if(!Number.isInteger(n)||n<1||n>65535){setError('Port must be between 1 and 65535');return}setBusy(true);try{const p={port:n,protocol,comment:'ALFA managed'};if(action==='allow')await api.firewallAllow(p);else await api.firewallDeny(p);const fw=await api.firewall();setRules(fw.rules||[]);setPort('');setError(null)}catch(e){setError(e instanceof Error?e.message:'Firewall update failed')}finally{setBusy(false)}};
 const cards=m?[[Cpu,'CPU',m.cpu_percent.toFixed(1)+'%'],[HardDrive,'RAM',m.memory_percent.toFixed(1)+'%'],[HardDrive,'Disk',m.disk_percent.toFixed(1)+'%'],[Activity,'Uptime',m.uptime_human]]:[[Cpu,'CPU','—'],[HardDrive,'RAM','—'],[HardDrive,'Disk','—'],[Activity,'Uptime','—']];
 return <div className="space-y-5">
  {error&&<div className="rounded-xl border border-rose-900 bg-rose-950/30 p-3 text-sm text-rose-300">{error}</div>}
  <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
   <div className="flex items-center justify-between mb-4"><div><div className="text-xs uppercase tracking-widest text-emerald-400">Host telemetry</div><h2 className="font-bold">{m?.hostname||'Loading node…'}</h2><p className="text-xs text-slate-500">{m?.platform||''} · kernel {m?.kernel_version||''}</p></div><span className="text-xs text-emerald-400">live</span></div>
   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{cards.map(([Icon,label,value])=><div key={String(label)} className="rounded-xl bg-slate-950 border border-slate-800 p-4"><Icon className="w-4 h-4 text-cyan-400"/><div className="text-[10px] uppercase text-slate-500 mt-3">{label}</div><div className="text-xl font-mono mt-1">{String(value)}</div></div>)}</div>
  </section>
  <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5"><div className="flex items-center gap-2 mb-3"><Shield className="w-4 h-4 text-emerald-400"/><h3 className="font-semibold">Host firewall</h3><span className="text-xs text-slate-500">{rules.length} managed rules</span></div><div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="p-2">Port</th><th className="p-2">Protocol</th><th className="p-2">Action</th><th className="p-2">Source</th><th className="p-2">Comment</th></tr></thead><tbody>{rules.map(r=><tr key={r.id} className="border-t border-slate-800"><td className="p-2">{r.port}</td><td className="p-2">{r.protocol}</td><td className="p-2">{r.action}</td><td className="p-2">{r.from_ip}</td><td className="p-2">{r.comment}</td></tr>)}</tbody></table></div></section>
 </div>
}