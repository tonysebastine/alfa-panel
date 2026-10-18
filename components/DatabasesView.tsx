'use client';

import React, { useEffect, useState } from 'react';
import {
  Database,
  Plus,
  Play,
  Square,
  RotateCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Server,
  Cloud,
  Layers,
  Key,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api-client';

interface DatabaseItem {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'redis' | 'mongodb';
  mode: 'local' | 'remote';
  host: string;
  port: number;
  user: string;
  status: 'running' | 'stopped' | 'connected' | 'error';
  version?: string;
  databaseName?: string;
  createdAt: string;
}

export const DatabasesView: React.FC = () => {
  const [dbs, setDbs] = useState<DatabaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; text: string; success: boolean } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'postgresql' as 'postgresql' | 'mysql' | 'redis' | 'mongodb',
    mode: 'local' as 'local' | 'remote',
    host: '127.0.0.1',
    port: '5432',
    user: 'postgres',
    password: '',
    databaseName: 'production_db',
    version: 'PostgreSQL 16',
  });

  const loadDatabases = async () => {
    try {
      setLoading(true);
      const res = await api.databases();
      setDbs(res.databases || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch databases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatabases();
  }, []);

  const handleTypeChange = (type: 'postgresql' | 'mysql' | 'redis' | 'mongodb') => {
    const defaultPorts = {
      postgresql: '5432',
      mysql: '3306',
      redis: '6379',
      mongodb: '27017',
    };
    const defaultUsers = {
      postgresql: 'postgres',
      mysql: 'root',
      redis: 'default',
      mongodb: 'admin',
    };
    const defaultVersions = {
      postgresql: 'PostgreSQL 16',
      mysql: 'MySQL 8.0',
      redis: 'Redis 7.2',
      mongodb: 'MongoDB 7.0',
    };
    setForm(prev => ({
      ...prev,
      type,
      port: defaultPorts[type],
      user: defaultUsers[type],
      version: defaultVersions[type],
    }));
  };

  const handleModeChange = (mode: 'local' | 'remote') => {
    setForm(prev => ({
      ...prev,
      mode,
      host: mode === 'local' ? '127.0.0.1' : 'db.external-host.com',
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api.createDatabase({
        ...form,
        port: Number(form.port),
      });
      setIsModalOpen(false);
      setForm({
        name: '',
        type: 'postgresql',
        mode: 'local',
        host: '127.0.0.1',
        port: '5432',
        user: 'postgres',
        password: '',
        databaseName: 'production_db',
        version: 'PostgreSQL 16',
      });
      loadDatabases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Database creation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    try {
      await api.databaseAction(id, action);
      setActionMsg({ id, text: `Successfully executed ${action}`, success: true });
      setTimeout(() => setActionMsg(null), 3000);
      loadDatabases();
    } catch (err) {
      setActionMsg({ id, text: err instanceof Error ? err.message : `${action} failed`, success: false });
    }
  };

  const handleTestConnection = async (id: string) => {
    try {
      const res = await api.testDatabaseConnection(id);
      setActionMsg({ id, text: res.message || 'Connection test passed (latency < 5ms)', success: true });
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err) {
      setActionMsg({ id, text: err instanceof Error ? err.message : 'Connection test failed', success: false });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove database "${name}"?`)) return;
    try {
      await api.deleteDatabase(id);
      loadDatabases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold">
              Data Persistence &amp; Caching
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Active Management
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Databases &amp; Storage Clusters</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Provision local containerized databases or connect external remote database clusters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDatabases}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Refresh database list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/10"
          >
            <Plus className="w-4 h-4" />
            <span>Add Database</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Database Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dbs.map(db => (
          <div
            key={db.id}
            className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      db.type === 'postgresql'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : db.type === 'mysql'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : db.type === 'redis'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">{db.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-mono text-slate-400 uppercase">{db.type}</span>
                      <span className="text-slate-600">•</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          db.mode === 'local'
                            ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                            : 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                        }`}
                      >
                        {db.mode === 'local' ? 'Local Container' : 'Remote Cluster'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      db.status === 'running' || db.status === 'connected'
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-slate-500'
                    }`}
                  />
                  <span className="text-xs font-mono text-slate-400 capitalize">{db.status}</span>
                </div>
              </div>

              {/* Specs & Connection Parameters */}
              <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5 font-mono text-xs text-slate-400">
                <div className="flex justify-between">
                  <span className="text-slate-500">Host / Endpoint:</span>
                  <span className="text-slate-200 truncate max-w-[170px]" title={db.host}>
                    {db.host}:{db.port}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">User / Identity:</span>
                  <span className="text-slate-200">{db.user}</span>
                </div>
                {db.databaseName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Database Name:</span>
                    <span className="text-emerald-300 font-semibold">{db.databaseName}</span>
                  </div>
                )}
                {db.version && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Engine Version:</span>
                    <span className="text-slate-300">{db.version}</span>
                  </div>
                )}
              </div>

              {actionMsg && actionMsg.id === db.id && (
                <div
                  className={`mt-2 p-2 rounded-lg text-xs font-mono flex items-center gap-1.5 ${
                    actionMsg.success
                      ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-900'
                      : 'bg-rose-950/50 text-rose-300 border border-rose-900'
                  }`}
                >
                  {actionMsg.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  <span>{actionMsg.text}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {db.mode === 'local' && (
                  <>
                    <button
                      onClick={() => handleAction(db.id, 'start')}
                      className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-400 hover:text-emerald-300 transition-colors"
                      title="Start Container"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleAction(db.id, 'stop')}
                      className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-400 hover:text-amber-300 transition-colors"
                      title="Stop Container"
                    >
                      <Square className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleAction(db.id, 'restart')}
                      className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-cyan-400 hover:text-cyan-300 transition-colors"
                      title="Restart Container"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleTestConnection(db.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-mono transition-colors flex items-center gap-1"
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Test Connection</span>
                </button>
              </div>

              <button
                onClick={() => handleDelete(db.id, db.name)}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950/50 border border-slate-800 hover:border-rose-900 text-slate-500 hover:text-rose-400 transition-colors"
                title="Remove Database"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        {dbs.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center border border-dashed border-slate-800 rounded-2xl p-8 space-y-3">
            <Database className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="font-bold text-white text-base">No Databases Configured</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Provision an isolated containerized database (PostgreSQL, MySQL, Redis) or link an existing remote cluster.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
            >
              Add First Database
            </button>
          </div>
        )}
      </div>

      {/* Provision / Connect Database Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Add Database Instance</h3>
                  <p className="text-xs text-slate-400 font-mono">Select engine and deployment topology</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Deployment Mode Switcher */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Deployment Topology</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleModeChange('local')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      form.mode === 'local'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Server className="w-4 h-4" />
                    <span>Local Container</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('remote')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      form.mode === 'remote'
                        ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Cloud className="w-4 h-4" />
                    <span>Remote / External DB</span>
                  </button>
                </div>
              </div>

              {/* Engine Type */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Database Engine</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['postgresql', 'mysql', 'redis', 'mongodb'] as const).map(engine => (
                    <button
                      key={engine}
                      type="button"
                      onClick={() => handleTypeChange(engine)}
                      className={`p-2 rounded-xl border text-xs font-mono font-bold capitalize transition-all ${
                        form.type === engine
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {engine === 'postgresql' ? 'Postgres' : engine}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name & Identifier */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Instance Display Name</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Analytics Postgres or Cache Redis"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              {/* Host & Port */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    {form.mode === 'local' ? 'Internal Network Bind' : 'Remote Host / Endpoint'}
                  </label>
                  <input
                    required
                    value={form.host}
                    onChange={e => setForm({ ...form, host: e.target.value })}
                    disabled={form.mode === 'local'}
                    placeholder="e.g. db.customer.aws.internal"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Port</label>
                  <input
                    required
                    type="number"
                    value={form.port}
                    onChange={e => setForm({ ...form, port: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* User, Password & Database Name */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Database User</label>
                  <input
                    value={form.user}
                    onChange={e => setForm({ ...form, user: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Credentials (Password)</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {form.type !== 'redis' && (
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Default Database Name</label>
                  <input
                    value={form.databaseName}
                    onChange={e => setForm({ ...form, databaseName: e.target.value })}
                    placeholder="e.g. production_db"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs"
                >
                  {busy ? 'Configuring…' : form.mode === 'local' ? 'Provision Local Container' : 'Connect Remote Database'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
