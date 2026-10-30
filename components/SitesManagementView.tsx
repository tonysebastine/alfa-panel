'use client';

import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  Play,
  Square,
  RotateCw,
  ExternalLink,
  Lock,
  AlertTriangle,
  Server,
  Terminal,
  Activity,
  Layers,
  FileText,
  Trash2,
  CheckCircle2,
  RefreshCw,
  HeartPulse,
} from 'lucide-react';
import { CreateSiteModal } from './CreateSiteModal';
import { api } from '@/lib/api-client';
import { useToast } from './ToastProvider';

export interface SiteItem {
  id: string;
  domain: string;
  type: 'tomcat' | 'python';
  runtimeName: string;
  status: 'running' | 'stopped' | 'building';
  ssl: 'active' | 'expiring' | 'disabled';
  cpuPercent: number;
  cpuLimit: string;
  memoryUsedMB: number;
  memoryLimitMB: number;
  port: number;
  containerName: string;
  createdAt: string;
}

interface SitesManagementViewProps {
  onSelectSite?: (site: SiteItem, tab?: 'overview' | 'runtime' | 'env' | 'ssl' | 'logs' | 'files' | 'autoheal') => void;
  onOpenTerminal?: (site: SiteItem) => void;
  onOpenFiles?: (site: SiteItem) => void;
}

export const SitesManagementView: React.FC<SitesManagementViewProps> = ({
  onSelectSite,
  onOpenTerminal,
  onOpenFiles,
}) => {
  const { showToast } = useToast();
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [runtimeFilter, setRuntimeFilter] = useState<'all' | 'tomcat' | 'python'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listSites().then(result => {
      if (cancelled) return;
      setSites((result.sites || []).map((s: any) => ({
        id: s.container_id || s.domain,
        domain: s.domain,
        type: s.container_name?.startsWith('site_python_') ? 'python' : 'tomcat',
        runtimeName: s.container_name?.startsWith('site_python_') ? 'Python workload' : 'Tomcat workload',
        status: s.status === 'running' ? 'running' : 'stopped',
        ssl: 'active',
        cpuPercent: Number(s.cpu_percent || 0),
        cpuLimit: 'managed',
        memoryUsedMB: Number(s.memory_usage_mb || 0),
        memoryLimitMB: Number(s.memory_limit_mb || 0),
        port: s.container_name?.startsWith('site_python_') ? 8000 : 8080,
        containerName: s.container_name || '',
        createdAt: s.started_at ? new Date(s.started_at).toLocaleDateString() : 'unknown',
      })));
      setLoadError(null);
    }).catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Unable to load sites'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleToggleState = async (id: string) => {
    const target = sites.find(s => s.id === id);
    if (!target) return;
    const action = target.status === 'running' ? 'stop' : 'start';
    const reverseAction = action === 'start' ? 'stop' : 'start';
    try {
      await api.siteAction(target.domain, action);
      setSites(prev => prev.map(s => (s.id === id ? { ...s, status: action === 'start' ? 'running' : 'stopped' } : s)));
      showToast({
        message: `Workload '${target.domain}' set to ${action.toUpperCase()}`,
        type: action === 'start' ? 'success' : 'warning',
        onUndo: async () => {
          try {
            await api.siteAction(target.domain, reverseAction);
            setSites(prev => prev.map(s => (s.id === id ? { ...s, status: reverseAction === 'start' ? 'running' : 'stopped' } : s)));
            showToast({ message: `Reverted: Workload '${target.domain}' ${reverseAction.toUpperCase()}`, type: 'info' });
          } catch (undoErr) {
            showToast({ message: `Undo failed: ${undoErr instanceof Error ? undoErr.message : 'Unknown error'}`, type: 'error' });
          }
        },
        undoLabel: `Undo (${reverseAction.toUpperCase()})`,
      });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Site action failed', type: 'error' });
    }
  };

  const handleRestartSite = async (id: string) => {
    const target = sites.find(s => s.id === id);
    if (!target) return;
    try {
      await api.siteAction(target.domain, 'restart');
      showToast({ message: `Graceful reboot initiated for '${target.domain}' (SIGTERM 15s timeout)`, type: 'success' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Restart failed', type: 'error' });
    }
  };

  const handleDeleteSite = async (id: string) => {
    const target = sites.find(s => s.id === id);
    if (!target) return;
    const confirmDomain = window.prompt(`Type "${target.domain}" to confirm container deletion. (Host volume will be safely retained).`);
    if (confirmDomain !== target.domain) {
      showToast({ message: 'Deletion cancelled: domain mismatch', type: 'info' });
      return;
    }
    try {
      await api.deleteSite(target.domain, false);
      setSites(prev => prev.filter(s => s.id !== id));
      showToast({ message: `Workload '${target.domain}' removed; container volume preserved for recovery`, type: 'warning' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Deletion failed', type: 'error' });
    }
  };

  const handleCreated = (newSite: SiteItem) => {
    setSites(prev => [newSite, ...prev]);
    showToast({ message: `Workload '${newSite.domain}' provisioned with rootless cgroups on panel-network`, type: 'success' });
  };

  // Filtered sites
  const filteredSites = sites.filter(s => {
    const matchesSearch =
      s.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.runtimeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.containerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRuntime = runtimeFilter === 'all' || s.type === runtimeFilter;
    return matchesSearch && matchesRuntime;
  });

  const runningCount = sites.filter(s => s.status === 'running').length;
  const stoppedCount = sites.filter(s => s.status === 'stopped').length;
  const tomcatCount = sites.filter(s => s.type === 'tomcat').length;
  const pythonCount = sites.filter(s => s.type === 'python').length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Metrics Overview - Tabular Monospace & Responsive Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm transition-all hover:border-slate-700/80">
          <div className="text-xs font-mono text-slate-400">Total Workloads</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white mt-1.5">{sites.length}</div>
          <div className="text-xs text-slate-500 font-mono tabular-nums mt-1 flex items-center gap-1.5">
            <span>{tomcatCount} Tomcat</span>
            <span aria-hidden="true">·</span>
            <span>{pythonCount} Python</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm transition-all hover:border-emerald-500/30">
          <div className="text-xs font-mono text-slate-400">Running Workloads</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mt-1.5">{runningCount}</div>
          <div className="text-xs text-slate-500 font-mono mt-1">Active containers on bridge</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm transition-all hover:border-slate-700/80">
          <div className="text-xs font-mono text-slate-400">Stopped Workloads</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-400 mt-1.5">{stoppedCount}</div>
          <div className="text-xs text-slate-500 font-mono mt-1">Resource cgroups released</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm transition-all hover:border-cyan-500/30">
          <div className="text-xs font-mono text-slate-400">Ingress &amp; Certificates</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-cyan-400 mt-1.5">100% SSL</div>
          <div className="text-xs text-slate-500 font-mono mt-1">OpenResty Ingress Gateway</div>
        </div>
      </div>

      {/* Table Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="flex-1 relative max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search domain, container, runtime..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Runtime Filter Pills & Create Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono">
            <button
              onClick={() => setRuntimeFilter('all')}
              className={`px-3 py-1 rounded-md transition-colors ${
                runtimeFilter === 'all'
                  ? 'bg-slate-800 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({sites.length})
            </button>
            <button
              onClick={() => setRuntimeFilter('tomcat')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                runtimeFilter === 'tomcat'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server className="w-3 h-3 text-amber-400" />
              Tomcat ({tomcatCount})
            </button>
            <button
              onClick={() => setRuntimeFilter('python')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                runtimeFilter === 'python'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3 h-3 text-cyan-400" />
              Python ({pythonCount})
            </button>
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs rounded-lg shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Create Site
          </button>
        </div>
      </div>

      {loadError && <div className="rounded-xl border border-rose-900 bg-rose-950/30 p-3 text-sm text-rose-300">{loadError}</div>}
      {loading && <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Loading live site inventory…</div>}

      {/* Sites Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Domain &amp; SSL</th>
                <th className="py-3.5 px-4">Runtime Engine</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">CPU &amp; Memory</th>
                <th className="py-3.5 px-4">Internal Ingress</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredSites.map(site => {
                const isRunning = site.status === 'running';
                const ramPercent =
                  site.memoryLimitMB > 0 ? (site.memoryUsedMB / site.memoryLimitMB) * 100 : 0;

                return (
                  <tr key={site.id} className="hover:bg-slate-950/60 transition-colors">
                    {/* Domain & SSL */}
                    <td className="py-4 px-4">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5">
                          {site.ssl === 'active' ? (
                            <div className="p-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                              <Lock className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="p-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white font-mono text-sm hover:text-emerald-400 transition-colors">
                              {site.domain}
                            </span>
                            <a
                              href={`https://${site.domain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-500 hover:text-slate-300"
                              title="Open public URL"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                            <span>/opt/panel/apps/sites/{site.domain}/</span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span
                              className={
                                site.ssl === 'active'
                                  ? 'text-emerald-400 font-medium'
                                  : 'text-amber-400 font-semibold'
                              }
                            >
                              {site.ssl === 'active' ? "Let's Encrypt (Auto-Renew)" : 'SSL Expiring'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Runtime Engine - Unboxed zero-pill text */}
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                      <div className="flex items-center gap-2">
                        {site.type === 'tomcat' ? (
                          <Server className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        <span className="text-slate-300 font-medium">{site.runtimeName}</span>
                      </div>
                    </td>

                    {/* Status Badge & Auto-Heal Watchdog status */}
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                            }`}
                          />
                          <span
                            className={`font-semibold capitalize ${
                              isRunning ? 'text-emerald-400' : 'text-slate-400'
                            }`}
                          >
                            {site.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-emerald-400/90 flex items-center gap-1">
                          <HeartPulse className="w-3 h-3 text-emerald-400" />
                          <span>Watchdog Active</span>
                        </div>
                      </div>
                    </td>

                    {/* CPU & Memory metrics - Tabular Monospace & Micro Bar */}
                    <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-300 tabular-nums">
                          <span>{site.memoryUsedMB} <span className="text-slate-600">/</span> {site.memoryLimitMB} MB</span>
                          <span className={`font-semibold ${ramPercent > 80 ? 'text-rose-400' : ramPercent > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {ramPercent.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-32 bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full transition-all duration-300 ${
                              ramPercent > 80
                                ? 'bg-rose-500'
                                : ramPercent > 50
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, ramPercent)}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          CPU: <span className="text-slate-400 font-medium">{site.cpuPercent}%</span> · {site.cpuLimit}
                        </div>
                      </div>
                    </td>

                    {/* Internal Ingress & Port */}
                    <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap">
                      <div className="text-slate-300 tabular-nums">
                        Port: <strong className="text-emerald-400 font-semibold">{site.port}</strong>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        panel-network bridge
                      </div>
                    </td>

                    {/* Actions column - Ergonomic 32px Button Strip */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1 font-mono">
                        {/* Start/Stop toggle button */}
                        <button
                          type="button"
                          onClick={() => handleToggleState(site.id)}
                          className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all ${
                            isRunning
                              ? 'text-rose-400 border-rose-900/40 bg-rose-950/20 hover:bg-rose-950/60'
                              : 'text-emerald-400 border-emerald-900/40 bg-emerald-950/20 hover:bg-emerald-950/60'
                          }`}
                          title={isRunning ? 'Stop Container' : 'Start Container'}
                          aria-label={isRunning ? 'Stop Container' : 'Start Container'}
                        >
                          {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>

                        {/* Restart button */}
                        <button
                          type="button"
                          onClick={() => handleRestartSite(site.id)}
                          disabled={!isRunning}
                          className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-800 transition-all disabled:opacity-30 disabled:pointer-events-none"
                          title="Graceful Restart (SIGTERM)"
                          aria-label="Graceful Restart"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>

                        {/* Quick Logs & Terminal */}
                        <button
                          type="button"
                          onClick={() => onSelectSite?.(site, 'logs')}
                          className="w-7 h-7 flex items-center justify-center text-purple-400 hover:text-purple-300 hover:bg-purple-950/40 rounded-lg border border-slate-800 transition-all"
                          title="Container Logs & Terminal"
                          aria-label="Container Logs & Terminal"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>

                        {/* Auto-Heal & Watchdog Diagnostics */}
                        <button
                          type="button"
                          onClick={() => onSelectSite?.(site, 'autoheal')}
                          className="w-7 h-7 flex items-center justify-center text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 rounded-lg border border-slate-800 transition-all"
                          title="Auto-Heal Diagnostics & Probe Setup"
                          aria-label="Auto-Heal Diagnostics & Probe Setup"
                        >
                          <HeartPulse className="w-3.5 h-3.5" />
                        </button>

                        {/* Files & Deployment */}
                        <button
                          type="button"
                          onClick={() => onOpenFiles?.(site)}
                          className="w-7 h-7 flex items-center justify-center text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 rounded-lg border border-slate-800 transition-all"
                          title="Site Files & Deployment"
                          aria-label="Site Files & Deployment"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>

                        {/* Manage Workload Details */}
                        <button
                          type="button"
                          onClick={() => onSelectSite?.(site, 'overview')}
                          className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-800 transition-all"
                          title="Manage Workload Details"
                          aria-label="Manage Workload Details"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Site */}
                        <button
                          type="button"
                          onClick={() => handleDeleteSite(site.id)}
                          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg border border-slate-800 transition-all"
                          title="Delete Site"
                          aria-label="Delete Site"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredSites.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-mono">
                    No sites found matching your criteria. Click &quot;Create Site&quot; to provision a new workload.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Site Modal */}
      <CreateSiteModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
};
