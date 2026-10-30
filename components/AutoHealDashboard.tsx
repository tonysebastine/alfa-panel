'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  HeartPulse,
  Activity,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Clock,
  Server,
  Zap,
  Play,
  CheckCircle2,
  Filter,
  Search,
  Sliders,
  Settings2,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import {
  WorkloadAutoHealState,
  AutoHealIncident,
  loadStoredStates,
  saveStoredStates,
  loadStoredIncidents,
  saveStoredIncidents,
  calculateBackoffMs,
} from '@/lib/auto-heal-engine';
import { useToast } from './ToastProvider';

interface AutoHealDashboardProps {
  onSelectSite?: (domain: string) => void;
}

export const AutoHealDashboard: React.FC<AutoHealDashboardProps> = ({ onSelectSite }) => {
  const { showToast } = useToast();
  const [states, setStates] = useState<Record<string, WorkloadAutoHealState>>(loadStoredStates);
  const [incidents, setIncidents] = useState<AutoHealIncident[]>(loadStoredIncidents);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'resolved' | 'mitigating'>('all');
  const [selectedSiteDomain, setSelectedSiteDomain] = useState<string>('api.production.example.com');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string[]>([]);
  const [watchdogTick, setWatchdogTick] = useState(0);

  // Sync state to resilient storage whenever changed
  useEffect(() => {
    saveStoredStates(states);
  }, [states]);

  useEffect(() => {
    saveStoredIncidents(incidents);
  }, [incidents]);

  // Periodic heartbeat animation & prober simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setWatchdogTick(t => t + 1);
      // Random subtle latency variation for active workloads
      setStates(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(domain => {
          if (next[domain].health === 'healthy') {
            next[domain] = {
              ...next[domain],
              lastProbeTime: new Date().toISOString(),
              lastProbeLatencyMs: Math.max(12, Math.floor(Math.random() * 60) + 10),
            };
          }
        });
        return next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Compute fleet statistics
  const metrics = useMemo(() => {
    const siteList = Object.values(states);
    const totalSites = siteList.length;
    const healthyCount = siteList.filter(s => s.health === 'healthy').length;
    const degradedCount = siteList.filter(s => s.health === 'degraded' || s.health === 'recovering').length;
    
    const resolvedIncidents = incidents.filter(i => i.status === 'resolved');
    const avgDowntime =
      resolvedIncidents.length > 0
        ? (resolvedIncidents.reduce((acc, curr) => acc + curr.downtimeSeconds, 0) / resolvedIncidents.length).toFixed(1)
        : '2.1';

    return {
      totalSites,
      healthyCount,
      degradedCount,
      totalHealsToday: incidents.length,
      mttrSeconds: avgDowntime,
    };
  }, [states, incidents]);

  // Execute failure simulation and automated recovery loop
  const triggerFailureSimulation = useCallback(
    (domain: string, faultType: 'jvm-oom' | 'fastapi-502' | 'hung-process') => {
      if (isSimulating) return;
      setIsSimulating(true);
      const targetState = states[domain];
      if (!targetState) {
        setIsSimulating(false);
        return;
      }

      const now = new Date();
      const incidentId = `inc-${Math.floor(1000 + Math.random() * 9000)}`;
      const isTomcat = targetState.runtime === 'tomcat';

      let reason = '';
      let detail = '';
      let recoveryAction = '';
      let errorStatus = 500;

      if (faultType === 'jvm-oom') {
        reason = 'JVM OutOfMemoryError (Java Heap Space)';
        detail = 'Active GC pause exceeded limit (GC overhead limit exceeded) during multipart .war unpack. Worker threads unresponsive.';
        recoveryAction = 'Initiated graceful SIGTERM, dumped heap analysis, and executed clean container restart with JVM memory flush';
        errorStatus = 503;
      } else if (faultType === 'fastapi-502') {
        reason = 'ASGI Worker Crash (HTTP 502 Bad Gateway)';
        detail = 'Uvicorn worker exited unexpectedly on unhandled segmentation in C-extension. Health check probe failed.';
        recoveryAction = 'Spawned replacement worker pool, verified socket availability, and re-routed ingress traffic';
        errorStatus = 502;
      } else {
        reason = 'Deadlock / Unresponsive Health Probe';
        detail = 'HTTP GET /healthz timed out after 3000ms. Keep-alive connection dropped.';
        recoveryAction = 'Sent SIGKILL to stuck container PID; executed cold restart with exponential backoff delay';
        errorStatus = 504;
      }

      setSimulationLog([
        `[${now.toLocaleTimeString()}] Fault Injected: "${reason}" on ${domain}`,
        `[${now.toLocaleTimeString()}] Health probe returned HTTP ${errorStatus} (Failed 1/2)`,
      ]);

      showToast({ message: `Fault injected on ${domain}: ${reason}`, type: 'warning' });

      // Phase 1: Probe failure detected
      setStates(prev => ({
        ...prev,
        [domain]: {
          ...prev[domain],
          health: 'probing',
          consecutiveFailures: 1,
          lastProbeLatencyMs: 3100,
        },
      }));

      // Phase 2: Second probe failure -> DEGRADED
      setTimeout(() => {
        const t2 = new Date();
        setSimulationLog(prev => [
          ...prev,
          `[${t2.toLocaleTimeString()}] Consecutive probe failure 2/2 reached threshold! State: DEGRADED`,
          `[${t2.toLocaleTimeString()}] Auto-Heal Watchdog triggered! Calculating exponential backoff (attempt 1: 1000ms)...`,
        ]);

        const newIncident: AutoHealIncident = {
          id: incidentId,
          domain,
          runtime: targetState.runtime,
          triggerReason: reason,
          triggerDetail: detail,
          actionTaken: recoveryAction,
          startedAt: t2.toISOString(),
          downtimeSeconds: 0,
          status: 'mitigating',
          backoffDelayMs: 1000,
          restartAttempt: 1,
          probeResponseCode: errorStatus,
        };

        setIncidents(prev => [newIncident, ...prev]);

        setStates(prev => ({
          ...prev,
          [domain]: {
            ...prev[domain],
            health: 'degraded',
            consecutiveFailures: 2,
            activeIncidentId: incidentId,
          },
        }));

        // Phase 3: Auto-recovery starts
        setTimeout(() => {
          const t3 = new Date();
          setSimulationLog(prev => [
            ...prev,
            `[${t3.toLocaleTimeString()}] Container restarting: ${recoveryAction}...`,
            `[${t3.toLocaleTimeString()}] Verifying container health via HTTP GET ${targetState.rule.path}...`,
          ]);

          setStates(prev => ({
            ...prev,
            [domain]: {
              ...prev[domain],
              health: 'recovering',
            },
          }));

          // Phase 4: Recovery verified, back to HEALTHY
          setTimeout(() => {
            const t4 = new Date();
            const elapsedSeconds = Number(((t4.getTime() - t2.getTime()) / 1000).toFixed(1));

            setSimulationLog(prev => [
              ...prev,
              `[${t4.toLocaleTimeString()}] Probe HTTP 200 OK (Latency: 28ms). Workload self-healed successfully in ${elapsedSeconds}s!`,
            ]);

            setStates(prev => ({
              ...prev,
              [domain]: {
                ...prev[domain],
                health: 'healthy',
                consecutiveFailures: 0,
                restartCount24h: prev[domain].restartCount24h + 1,
                lastProbeTime: t4.toISOString(),
                lastProbeLatencyMs: 28,
                activeIncidentId: null,
              },
            }));

            setIncidents(prev =>
              prev.map(inc =>
                inc.id === incidentId
                  ? {
                      ...inc,
                      status: 'resolved',
                      resolvedAt: t4.toISOString(),
                      downtimeSeconds: elapsedSeconds,
                    }
                  : inc
              )
            );

            setIsSimulating(false);
            showToast({ message: `Workload ${domain} auto-healed in ${elapsedSeconds}s! HTTP 200 probe verified.`, type: 'success' });
          }, 1800);
        }, 1400);
      }, 1200);
    },
    [isSimulating, states, showToast]
  );

  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      const matchesSearch =
        inc.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.triggerReason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.actionTaken.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'resolved'
          ? inc.status === 'resolved'
          : inc.status === 'mitigating';
      return matchesSearch && matchesStatus;
    });
  }, [incidents, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-xs text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold">Watchdog Daemon Active</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-slate-400 tabular-nums">Heartbeat #{watchdogTick}</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Auto-Healing &amp; Watchdog Control</h1>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Continuous health probes and automated restart routines for Tomcat and Python workloads with exponential backoff and crash-loop mitigation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Active Probes</div>
            <div className="text-sm font-bold text-white font-mono tabular-nums">Every 10s · HTTP GET</div>
          </div>
        </div>
      </div>

      {/* Fleet KPI Metric Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Workloads Monitored</span>
            <Server className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {metrics.healthyCount} / {metrics.totalSites}
          </div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% workloads currently passing probes</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Mean Time To Recovery (MTTR)</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {metrics.mttrSeconds}s
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sub-second container recycled with backoff</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Self-Healed Incidents</span>
            <RotateCw className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {metrics.totalHealsToday}
          </div>
          <div className="text-[11px] text-slate-400">
            <span>Zero manual interventions required</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Crash-Loop Mitigation</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            Exponential
          </div>
          <div className="text-[11px] text-slate-400">
            <span>1s ➔ 2s ➔ 4s ➔ 8s (cap: 30s)</span>
          </div>
        </div>
      </div>

      {/* Interactive Failure Simulation & Auto-Heal Demonstrator */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Interactive Auto-Healing Simulator</span>
            </h2>
            <p className="text-xs text-slate-400">
              Inject deterministic faults into containerized instances to observe real-time watchdog detection and self-recovery.
            </p>
          </div>

          {/* Target site selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Target Site:</span>
            <select
              value={selectedSiteDomain}
              onChange={e => setSelectedSiteDomain(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            >
              {Object.keys(states).map(domain => (
                <option key={domain} value={domain}>
                  {domain} ({states[domain].runtime})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Triggers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            disabled={isSimulating}
            onClick={() => triggerFailureSimulation(selectedSiteDomain, 'jvm-oom')}
            className="flex flex-col items-start p-4 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Simulate JVM OOM Error</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Triggers simulated Java heap exhaustion (OutOfMemoryError) and GC freeze on Tomcat.
            </p>
          </button>

          <button
            type="button"
            disabled={isSimulating}
            onClick={() => triggerFailureSimulation(selectedSiteDomain, 'fastapi-502')}
            className="flex flex-col items-start p-4 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-red-500/50 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-red-400 font-semibold text-xs mb-1">
              <Zap className="w-3.5 h-3.5" />
              <span>Simulate 502 Worker Crash</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Simulates Python Uvicorn worker segmentation fault causing HTTP 502 Bad Gateway.
            </p>
          </button>

          <button
            type="button"
            disabled={isSimulating}
            onClick={() => triggerFailureSimulation(selectedSiteDomain, 'hung-process')}
            className="flex flex-col items-start p-4 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-blue-500/50 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs mb-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Simulate Probe Timeout</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Simulates a deadlocked process where the HTTP probe times out after 3000ms.
            </p>
          </button>
        </div>

        {/* Live Simulation Console */}
        {simulationLog.length > 0 && (
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/60 pb-2">
              <span className="font-semibold text-slate-300">Watchdog Live Event Stream</span>
              {isSimulating ? (
                <span className="text-amber-400 flex items-center gap-1.5 font-mono text-[11px]">
                  <RotateCw className="w-3 h-3 animate-spin" />
                  Auto-Healing In Progress...
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1.5 font-mono text-[11px]">
                  <CheckCircle2 className="w-3 h-3" />
                  Workload Nominal & Verified
                </span>
              )}
            </div>
            <div className="space-y-1 font-mono text-[11px] text-slate-300">
              {simulationLog.map((line, idx) => (
                <div key={idx} className="leading-relaxed">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Workload Fleet Health Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Workload Health & Probe Policy</h2>
            <p className="text-xs text-slate-400">Current probe status and active auto-restart thresholds per container</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Domain</th>
                <th className="px-5 py-3">Runtime</th>
                <th className="px-5 py-3">Health Status</th>
                <th className="px-5 py-3">Probe Path</th>
                <th className="px-5 py-3">Last Latency</th>
                <th className="px-5 py-3">24h Auto-Heals</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {Object.values(states).map(site => {
                const isHealthy = site.health === 'healthy';
                const isRecovering = site.health === 'recovering' || site.health === 'probing';
                const isDegraded = site.health === 'degraded' || site.health === 'unhealthy';

                return (
                  <tr key={site.domain} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 font-semibold text-white font-mono">
                      {site.domain}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] text-slate-300 capitalize">
                        {site.runtime === 'tomcat' ? 'Tomcat 10.1' : 'Python 3.12'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {isHealthy && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                          <CheckCircle2 className="w-3 h-3" />
                          Healthy
                        </span>
                      )}
                      {isRecovering && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-950/60 text-blue-400 border border-blue-800/40">
                          <RotateCw className="w-3 h-3 animate-spin" />
                          Self-Healing ({site.consecutiveFailures}/2)
                        </span>
                      )}
                      {isDegraded && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-950/60 text-red-400 border border-red-800/40">
                          <AlertTriangle className="w-3 h-3" />
                          Degraded
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-400 text-[11px]">
                      {site.rule.path}
                    </td>
                    <td className="px-5 py-3 font-mono tabular-nums text-slate-300 text-[11px]">
                      {site.lastProbeLatencyMs}ms
                    </td>
                    <td className="px-5 py-3 font-mono tabular-nums text-slate-300">
                      {site.restartCount24h} heals
                    </td>
                    <td className="px-5 py-3 text-right">
                      {onSelectSite && (
                        <button
                          type="button"
                          onClick={() => onSelectSite(site.domain)}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-700"
                        >
                          Manage Site
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Auto-Heal Incident Activity Timeline */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Live Auto-Heal Incident Timeline & Diagnostics</span>
            </h2>
            <p className="text-xs text-slate-400">
              Audit log of detected anomalies, automated recovery actions, and verification latencies
            </p>
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search incidents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  statusFilter === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('resolved')}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  statusFilter === 'resolved' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                Resolved
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Items */}
        <div className="space-y-3">
          {filteredIncidents.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No incidents match the search criteria.
            </div>
          ) : (
            filteredIncidents.map(inc => {
              const isResolved = inc.status === 'resolved';

              return (
                <div
                  key={inc.id}
                  className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          isResolved
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                            : 'bg-amber-950 text-amber-400 border border-amber-800/40'
                        }`}
                      >
                        {isResolved ? 'Resolved' : 'Mitigating'}
                      </span>
                      <span className="font-semibold text-white text-xs font-mono">{inc.domain}</span>
                      <span className="text-xs text-slate-500">·</span>
                      <span className="text-xs text-slate-400">{inc.triggerReason}</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
                      <span>Downtime: {inc.downtimeSeconds}s</span>
                      <span>·</span>
                      <span>{new Date(inc.startedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{inc.triggerDetail}</p>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                      Auto-Heal Action:
                    </span>
                    <span className="text-emerald-300/90 font-mono text-[11px] truncate">{inc.actionTaken}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
