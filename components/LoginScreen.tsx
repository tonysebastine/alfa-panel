'use client';

import React, { FormEvent, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { login } from '@/lib/api-client';

export default function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [totpCode,setTotpCode]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  async function submit(e:FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    try { await login(username,password,totpCode); onAuthenticated(); }
    catch(err) { setError(err instanceof Error ? err.message : 'Authentication failed'); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><LockKeyhole className="w-5 h-5"/></div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg">alfa-panel</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Under Development
                </span>
              </div>
              <p className="text-xs text-slate-400">Secure control plane</p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <input aria-label="Username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 outline-none focus:border-emerald-500"/>
          <input aria-label="Password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 outline-none focus:border-emerald-500"/>
          <input aria-label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totpCode} onChange={e=>setTotpCode(e.target.value.replace(/\D/g,''))} placeholder="6-digit authenticator code" className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 outline-none focus:border-emerald-500"/>
        </div>
        {error && <div role="alert" className="rounded-xl border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</div>}
        <button disabled={busy} className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-2.5">{busy?'Signing in…':'Sign in securely'}</button>
        <p className="text-[11px] text-slate-500 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0"/> MFA is required. Access tokens are short-lived and refresh sessions are rotated.</p>
      </form>
    </main>
  );
}
