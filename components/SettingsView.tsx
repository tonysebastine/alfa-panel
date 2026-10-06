'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Users, ScrollText, Plus } from 'lucide-react';
import { api } from '@/lib/api-client';

export default function SettingsView(){
  const [users,setUsers]=useState<any[]>([]);
  const [events,setEvents]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [form,setForm]=useState({username:'',password:'',totp_secret:'',role:'developer'});

  const load=useCallback(async()=>{try{const [u,a]=await Promise.all([api.users(),api.audit()]);setUsers(u.users||[]);setEvents(a.events||[]);setError(null)}catch(e){setError(e instanceof Error?e.message:'Unable to load settings')}},[]);
  useEffect(()=>{load()},[load]);

  const create=async()=>{setBusy(true);setError(null);try{await api.createUser(form);setForm({username:'',password:'',totp_secret:'',role:'developer'});await load()}catch(e){setError(e instanceof Error?e.message:'User creation failed')}finally{setBusy(false)}};

  return <div className="space-y-6">
    {error&&<div role="alert" className="rounded-xl border border-rose-900 bg-rose-950/30 p-3 text-sm text-rose-300">{error}</div>}
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-3 mb-4"><ShieldCheck className="text-emerald-400"/><div><h2 className="font-semibold">Security posture</h2><p className="text-xs text-slate-400">MFA, RBAC, durable sessions, encrypted secrets and typed agent operations.</p></div></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        {['Per-site network isolation','Privileged Unix-socket agent','Encrypted MFA secrets'].map(x=><div key={x} className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-emerald-300">{x}</div>)}
      </div>
    </section>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2 mb-4"><Users className="w-4 h-4 text-cyan-400"/><h2 className="font-semibold">Users & roles</h2></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} placeholder="Username" className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"/>
        <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Temporary password" className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"/>
        <input value={form.totp_secret} onChange={e=>setForm({...form,totp_secret:e.target.value})} placeholder="TOTP secret" className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"/>
        <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"><option>viewer</option><option>developer</option><option>admin</option><option>owner</option></select>
      </div>
      <button disabled={busy} onClick={create} className="rounded-lg bg-emerald-500 text-slate-950 px-4 py-2 text-sm font-semibold disabled:opacity-50"><Plus className="inline w-4 h-4 mr-1"/>{busy?'Creating…':'Create user'}</button>
      <div className="mt-4 divide-y divide-slate-800">{users.map(u=><div key={u.id} className="py-3 flex justify-between text-sm"><span>{u.username}</span><span className="text-slate-400">{u.role} · {u.enabled?'enabled':'disabled'}</span></div>)}</div>
    </section>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2 mb-4"><ScrollText className="w-4 h-4 text-amber-400"/><h2 className="font-semibold">Recent audit events</h2></div>
      <div className="max-h-72 overflow-auto space-y-2">{events.slice(0,50).map(e=><div key={e.id} className="rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs"><span className="text-slate-500">{new Date(e.timestamp).toLocaleString()}</span> <span className="text-emerald-300">{e.action}</span> <span className="text-slate-400">{e.actor_id||'system'}</span></div>)}</div>
    </section>
  </div>
}
