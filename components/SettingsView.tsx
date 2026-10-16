'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Users, ScrollText, Plus } from 'lucide-react';
import { api } from '@/lib/api-client';

type UserRecord = {
  id: string;
  username: string;
  role: string;
  enabled: boolean;
};

type AuditEvent = {
  id: string;
  timestamp: string | number;
  action: string;
  actor_id?: string;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function SettingsView() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', totp_secret: '', role: 'developer' });

  const readData = useCallback(async () => {
    const [userResponse, auditResponse] = await Promise.all([api.users(), api.audit()]);
    return {
      users: (userResponse.users || []) as UserRecord[],
      events: (auditResponse.events || []) as AuditEvent[],
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await readData();
      setUsers(data.users);
      setEvents(data.events);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to load settings'));
    }
  }, [readData]);

  useEffect(() => {
    let active = true;

    readData()
      .then((data) => {
        if (!active) return;
        setUsers(data.users);
        setEvents(data.events);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, 'Unable to load settings'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [readData]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createUser(form);
      setForm({ username: '', password: '', totp_secret: '', role: 'developer' });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause, 'User creation failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-900 bg-rose-950/30 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck className="text-emerald-400" />
          <div>
            <h2 className="font-semibold">Security posture</h2>
            <p className="text-xs text-slate-400">MFA, RBAC, durable sessions, protected secrets and typed agent operations.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          {['Per-site network isolation', 'Privileged Unix-socket agent', 'Protected MFA secrets'].map((item) => (
            <div key={item} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-emerald-300">{item}</div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-cyan-400" />
          <h2 className="font-semibold">Users &amp; roles</h2>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <input aria-label="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Username" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
          <input aria-label="Temporary password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Temporary password" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
          <input aria-label="TOTP secret" type="password" autoComplete="off" value={form.totp_secret} onChange={(event) => setForm({ ...form, totp_secret: event.target.value })} placeholder="TOTP secret" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
          <select aria-label="Role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
            <option value="viewer">Viewer</option>
            <option value="developer">Developer</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        <button disabled={busy} onClick={create} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
          <Plus className="mr-1 inline h-4 w-4" />{busy ? 'Creating…' : 'Create user'}
        </button>
        <div className="mt-4 divide-y divide-slate-800">
          {loading && <p className="py-3 text-xs text-slate-400">Loading users…</p>}
          {!loading && users.length === 0 && <p className="py-3 text-xs text-slate-400">No users to display.</p>}
          {users.map((user) => (
            <div key={user.id} className="flex justify-between py-3 text-sm">
              <span>{user.username}</span>
              <span className="text-slate-400">{user.role} · {user.enabled ? 'enabled' : 'disabled'}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-amber-400" />
          <h2 className="font-semibold">Recent audit events</h2>
        </div>
        <div className="max-h-72 space-y-2 overflow-auto">
          {loading && <p className="text-xs text-slate-400">Loading audit events…</p>}
          {!loading && events.length === 0 && <p className="text-xs text-slate-400">No audit events to display.</p>}
          {events.slice(0, 50).map((event) => (
            <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs">
              <span className="text-slate-500">{new Date(event.timestamp).toLocaleString()}</span>{' '}
              <span className="text-emerald-300">{event.action}</span>{' '}
              <span className="text-slate-400">{event.actor_id || 'system'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
