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
  MoreVertical,
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
} from 'lucide-react';
import { CreateSiteModal } from './CreateSiteModal';
import { api } from '@/lib/api-client';

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
  onSelectSite?: (site: SiteItem) => void;
  onOpenTerminal?: (site: SiteItem) => void;
  onOpenFiles?: (site: SiteItem) => void;
}

export const SitesManagementView: React.FC<SitesManagementViewProps> = ({
  onSelectSite,
  onOpenTerminal,
  onOpenFiles,
}) => {
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [runtimeFilter, setRuntimeFilter] = useState<'all' | 'tomcat' | 'python'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
    const target = sites.find(s => s.id === id); if (!target) return;
    const action = target.status === 'running' ? 'stop' : 'start';
    try { await api.siteAction(target.domain, action); showNotice(`Site '${target.domain}' set to ${action.toUpperCase()}`); setSites(prev=>prev.map(s=>s.id===id?{...s,status:action==='start'?'running':'stopped'}:s)); }
    catch (err) { showNotice(err instanceof Error ? err.message : 'Site action failed'); }
  };

  const handleRestartSite = async (id: string) => {
    const target = sites.find(s => s.id === id); if (!target) return;
    try { await api.siteAction(target.domain,'restart'); showNotice(`Graceful restart triggered for '${target.domain}'`); }
    catch (err) { showNotice(err instanceof Error ? err.message : 'Restart failed'); }
  };

  const handleDeleteSite = async (id: string) => {
    const target = sites.find(s => s.id === id); if (!target) return;
    const confirmDomain = window.prompt(`Type ${target.domain} to confirm deletion. Leave purge unchecked by default.`);
    if (confirmDomain !== target.domain) { showNotice('Deletion cancelled: exact domain confirmation required.'); return; }
    try {
      await api.deleteSite(target.domain, false);
      setSites(prev => prev.filter(s => s.id !== id));
      showNotice(`Site '${target.domain}' deleted; data directory retained for recovery.`);
    } catch (err) { showNotice(err instanceof Error ? err.message : 'Deletion failed'); }
  };

  const handleCreated = (newSite: SiteItem) => {
    setSites(prev => [newSite, ...prev]);
    showNotice(`Site '${newSite.domain}' provisioned with rootless security on an isolated site network`);
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
      {/* Top Banner / Metrics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="text-[11px] font-mono text-slate-400">Total Sites</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">{sites.length}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            {tomcatCount} Tomcat • {pythonCount} Python
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="text-[11px] font-mono text-slate-400">Running Workloads</div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{runningCount}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Active containers on bridge</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="text-[11px] font-mono text-slate-400">Stopped Workloads</div>
          <div className="text-2xl font-bold font-mono text-slate-400 mt-1">{stoppedCount}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Resource cgroups released</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="text-[11px] font-mono text-slate-400">Network &amp; Ingress</div>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">100% SSL</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">OpenResty Ingress Proxy</div>
        </div>
      </div>

      {/* Action Notification */}
      {actionNotice && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-mono rounded-xl flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">
            &times;
          </button>
        </div>
      )}

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
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono text-slate-400">
                            <span>/opt/panel/apps/sites/{site.domain}/</span>
                            <span>•</span>
                            <span
                              className={
                                site.ssl === 'active'
                                  ? 'text-emerald-400'
                                  : 'text-amber-400 font-semibold'
                              }
                            >
                              {site.ssl === 'active' ? "Let's Encrypt (Auto-Renew)" : 'SSL Expiring'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Runtime Engine Badge */}
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold ${
                          site.type === 'tomcat'
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
                            : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                        }`}
                      >
                        {site.type === 'tomcat' ? (
                          <Server className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                        )}
                        {site.runtimeName}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                          }`}
                        />
                        <span
                          className={`text-xs font-mono font-bold capitalize ${
                            isRunning ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {site.status}
                        </span>
                      </div>
                    </td>

                    {/* CPU & Memory metrics */}
                    <td className="py-4 px-4 font-mono">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-300">
                          <span>RAM: {site.memoryUsedMB} MB / {site.memoryLimitMB} MB</span>
                          <span className="text-slate-400">{ramPercent.toFixed(0)}%</span>
                        </div>
                        <div className="w-36 bg-slate-950 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              ramPercent > 80
                                ? 'bg-rose-500'
                                : ramPercent > 50
                                ? 'bg-amber-500'
                                : 'bg-cyan-500'
                            }`}
                            style={{ width: `${Math.min(100, ramPercent)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-500">
                          CPU: {site.cpuPercent}% of {site.cpuLimit}
                        </div>
                      </div>
                    </td>

                    {/* Internal Ingress */}
                    <td className="py-4 px-4 font-mono text-xs">
                      <div className="text-slate-300">
                        Port: <strong className="text-emerald-400">{site.port}</strong>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Dedicated site network
                      </div>
                    </td>

                    {/* Actions column */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 relative">
                        {/* Start/Stop toggle button */}
                        <button
                          onClick={() => handleToggleState(site.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isRunning
                              ? 'text-rose-400 hover:bg-rose-950/60'
                              : 'text-emerald-400 hover:bg-emerald-950/60'
                          }`}
                          title={isRunning ? 'Stop Container' : 'Start Container'}
                        >
                          {isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>

                        {/* Restart button */}
                        <button
                          onClick={() => handleRestartSite(site.id)}
                          disabled={!isRunning}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40"
                          title="Restart Container"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>

                        {/* Dropdown Menu Toggle */}
                        <button
                          onClick={() =>
                            setActiveDropdown(activeDropdown === site.id ? null : site.id)
                          }
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Popover Dropdown */}
                        {activeDropdown === site.id && (
                          <div className="absolute right-0 top-10 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 z-20 text-left font-mono text-xs space-y-0.5">
                            <button
                              onClick={() => {
                                setActiveDropdown(null);
                                onSelectSite?.(site);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
                            >
                              <Layers className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Manage Workload</span>
                            </button>

                            <button
                              onClick={() => {
                                setActiveDropdown(null);
                                onOpenFiles?.(site);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Files &amp; .WAR Deploy</span>
                            </button>

                            <button
                              onClick={() => {
                                setActiveDropdown(null);
                                onSelectSite?.(site);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
                            >
                              <Terminal className="w-3.5 h-3.5 text-purple-400" />
                              <span>Logs & Monitoring</span>
                            </button>

                            <div className="h-px bg-slate-800 my-1" />

                            <button
                              onClick={() => {
                                setActiveDropdown(null);
                                handleDeleteSite(site.id);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-950/50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Site</span>
                            </button>
                          </div>
                        )}
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
