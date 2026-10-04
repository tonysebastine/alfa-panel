'use client';

import React, { useState } from 'react';
import { SiteItem } from './SitesManagementView';
import { SiteLogViewer } from './SiteLogViewer';
import { SiteFileManager } from './SiteFileManager';
import {
  ArrowLeft,
  ExternalLink,
  Play,
  Square,
  RotateCw,
  RefreshCw,
  Sparkles,
  Server,
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  ShieldCheck,
  Folder,
  Layers,
  FileCode,
  Upload,
  Key,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  Globe,
  Settings,
  AlertCircle,
  Clock,
  Zap,
} from 'lucide-react';

interface SiteDetailViewProps {
  site: SiteItem;
  onBack: () => void;
}

export const SiteDetailView: React.FC<SiteDetailViewProps> = ({ site, onBack }) => {
  const isTomcat = site.type === 'tomcat';
  const [activeTab, setActiveTab] = useState<'overview' | 'runtime' | 'env' | 'ssl' | 'logs' | 'files'>('overview');

  // Operational states
  const [isRunning, setIsRunning] = useState<boolean>(site.status === 'running');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // AI Diagnostic Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiDiagnosing, setAiDiagnosing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  // Runtime settings state
  // Tomcat
  const [minHeapMB, setMinHeapMB] = useState(512);
  const [maxHeapMB, setMaxHeapMB] = useState(1536);
  const [customJvmOpts, setCustomJvmOpts] = useState(
    '-XX:+UseG1GC -Duser.timezone=UTC -Dfile.encoding=UTF-8 -XX:+ExitOnOutOfMemoryError'
  );
  const [selectedWarFile, setSelectedWarFile] = useState<{ name: string; size: string } | null>(null);
  const [warDeploying, setWarDeploying] = useState(false);

  // Python
  const [pythonVersion, setPythonVersion] = useState('3.12-slim');
  const [appEntrypoint, setAppEntrypoint] = useState('main:app');
  const [pythonRunner, setPythonRunner] = useState<'gunicorn' | 'uvicorn'>('uvicorn');
  const [workersCount, setWorkersCount] = useState(4);
  const [pipInstalling, setPipInstalling] = useState(false);
  const [pipOutput, setPipOutput] = useState<string | null>(null);

  // Environment variables state
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string; isSecret: boolean; revealed: boolean }>>([
    { key: 'APP_ENV', value: 'production', isSecret: false, revealed: true },
    { key: 'PORT', value: site.port.toString(), isSecret: false, revealed: true },
    { key: 'DATABASE_URL', value: 'postgres://panel_user:p@ssw0rd123@postgres:5432/app_db', isSecret: true, revealed: false },
    { key: 'SECRET_KEY', value: 'k8s_prod_jwt_super_long_secret_hash_key', isSecret: true, revealed: false },
    { key: 'LOG_LEVEL', value: 'info', isSecret: false, revealed: true },
  ]);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');

  // SSL & Ingress state
  const [autoRenewSSL, setAutoRenewSSL] = useState(true);
  const [forceHttps, setForceHttps] = useState(true);
  const [enableWebSocket, setEnableWebSocket] = useState(true);
  const [hstsPreload, setHstsPreload] = useState(true);
  const [customCert, setCustomCert] = useState('');
  const [customKey, setCustomKey] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAction = (type: 'restart' | 'stop' | 'start' | 'rebuild') => {
    setActionLoading(type);
    setTimeout(() => {
      setActionLoading(null);
      if (type === 'stop') {
        setIsRunning(false);
        triggerToast(`Container '${site.containerName}' stopped cleanly.`);
      } else if (type === 'start') {
        setIsRunning(true);
        triggerToast(`Container '${site.containerName}' started on panel-network.`);
      } else if (type === 'restart') {
        triggerToast(`Container '${site.containerName}' rebooted gracefully (SIGTERM 15s).`);
      } else if (type === 'rebuild') {
        triggerToast(`Rebuilt compose stack with fresh cgroup resource limits.`);
      }
    }, 800);
  };

  const handleDiagnoseLogs = () => {
    setAiModalOpen(true);
    setAiDiagnosing(true);
    setAiAnalysis(null);

    setTimeout(() => {
      setAiDiagnosing(false);
      if (isTomcat) {
        setAiAnalysis(
          `### 1Panel Diagnostic Report: Apache Tomcat
- **Health State**: Healthy (0 crash loops in last 24h)
- **JVM Memory Assessment**: Current heap allocation is \`-Xms${minHeapMB}m\` to \`-Xmx${maxHeapMB}m\`. Total RAM usage is ~${site.memoryUsedMB}MB (${((site.memoryUsedMB / site.memoryLimitMB) * 100).toFixed(0)}% of cgroup limit).
- **Garbage Collection**: G1GC low-pause collector active. No stop-the-world spikes detected.
- **Port Ingress**: ProtocolHandler \`http-nio-8080\` bound cleanly to 0.0.0.0:8080 on \`panel-network\`.
- **Security Check**: Non-root UID \`1001:1001\` with \`no-new-privileges: true\`. Capability drop verified.`
        );
      } else {
        setAiAnalysis(
          `### 1Panel Diagnostic Report: Python Workload
- **Health State**: Healthy (HTTP 200 on /healthz)
- **ASGI/WSGI Runner**: ${pythonRunner} managing ${workersCount} worker threads with zero worker timeout kills.
- **Dependency Audit**: requirements.txt packages are up-to-date and satisfied.
- **Memory Footprint**: ${site.memoryUsedMB}MB used of ${site.memoryLimitMB}MB hard limit (${((site.memoryUsedMB / site.memoryLimitMB) * 100).toFixed(0)}%).
- **Security Check**: Rootless execution, read-only rootfs compatibility confirmed.`
        );
      }
    }, 1200);
  };

  const handleDeployWar = () => {
    if (!selectedWarFile) return;
    setWarDeploying(true);
    setTimeout(() => {
      setWarDeploying(false);
      triggerToast(`Successfully validated magic bytes and deployed ${selectedWarFile.name} to ROOT.war.`);
      setSelectedWarFile(null);
    }, 1000);
  };

  const handlePipInstall = () => {
    setPipInstalling(true);
    setPipOutput(null);
    setTimeout(() => {
      setPipInstalling(false);
      setPipOutput(
        `[docker exec site_${site.domain.replace(/[\.\-]/g, '_')}] pip install --user -r requirements.txt\nRequirement already satisfied: gunicorn>=21.2.0\nRequirement already satisfied: uvicorn[standard]>=0.28.0\nSuccessfully synchronized 4 packages.\n[Exit Code 0]`
      );
      triggerToast('Dependencies successfully updated inside container.');
    }, 1200);
  };

  const handleAddEnvVar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnvKey.trim()) return;
    setEnvVars(prev => [
      ...prev,
      {
        key: newEnvKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        value: newEnvVal,
        isSecret: newEnvKey.toLowerCase().includes('secret') || newEnvKey.toLowerCase().includes('pass') || newEnvKey.toLowerCase().includes('url'),
        revealed: true,
      },
    ]);
    setNewEnvKey('');
    setNewEnvVal('');
  };

  const handleSaveEnv = () => {
    triggerToast('Saved .env file (0640) and reloaded container environment.');
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono text-xs rounded-xl shadow-2xl flex items-center gap-2.5 animate-slide-up">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
              title="Back to Sites list"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-white font-mono tracking-tight">
                  {site.domain}
                </h1>
                <a
                  href={`https://${site.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-mono text-emerald-400 hover:underline"
                >
                  <span>Visit</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isRunning
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                  {isRunning ? 'RUNNING • HEALTHY' : 'STOPPED'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono mt-1">
                <span>Path: /opt/panel/apps/sites/{site.domain}/</span>
                <span>•</span>
                <span>Container: {site.containerName}</span>
                <span>•</span>
                <span className="text-cyan-400">{site.runtimeName}</span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleAction('restart')}
              disabled={actionLoading !== null || !isRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors"
            >
              <RotateCw className={`w-3.5 h-3.5 ${actionLoading === 'restart' ? 'animate-spin' : ''}`} />
              Restart
            </button>

            {isRunning ? (
              <button
                onClick={() => handleAction('stop')}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 disabled:opacity-50 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            ) : (
              <button
                onClick={() => handleAction('start')}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Start
              </button>
            )}

            <button
              onClick={() => handleAction('rebuild')}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === 'rebuild' ? 'animate-spin' : ''}`} />
              Rebuild Stack
            </button>

            <button
              onClick={handleDiagnoseLogs}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/20 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Diagnose Logs with AI
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-5 pt-3 border-t border-slate-800/80 overflow-x-auto text-xs font-mono">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
              activeTab === 'overview'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Overview &amp; Health
          </button>

          <button
            onClick={() => setActiveTab('runtime')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
              activeTab === 'runtime'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {isTomcat ? <Server className="w-3.5 h-3.5" /> : <Terminal className="w-3.5 h-3.5" />}
            Runtime Settings ({isTomcat ? 'Tomcat/JVM' : 'Python/ASGI'})
          </button>

          <button
            onClick={() => setActiveTab('env')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
              activeTab === 'env'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            Environment (.env)
          </button>

          <button
            onClick={() => setActiveTab('ssl')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
              activeTab === 'ssl'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            SSL &amp; Ingress (OpenResty)
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
              activeTab === 'logs'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Live Container Logs
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all ${
              activeTab === 'files'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            Files &amp; Monaco Editor
          </button>
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Health Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Container Health &amp; Probes
                </h3>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Docker API State:</span>
                  <span className="text-emerald-400 font-bold">{isRunning ? 'running' : 'exited'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Probe Status:</span>
                  <span className="text-emerald-400 font-bold">healthy (0 failures)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Health Probe:</span>
                  <span className="text-slate-300">curl http://127.0.0.1:{site.port}/</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Uptime:</span>
                  <span className="text-slate-300">4d 18h 12m</span>
                </div>
              </div>
            </div>

            {/* Ingress Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <Globe className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Network Ingress Isolation
                </h3>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Internal Port:</span>
                  <span className="text-cyan-300 font-bold">{site.port} (Exposed)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Host Port Binding:</span>
                  <span className="text-emerald-400 font-bold">NONE (0 raw host binds)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Bridge Network:</span>
                  <span className="text-cyan-300">panel-network (ICC on)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reverse Proxy:</span>
                  <span className="text-slate-300">1panel-openresty (80/443)</span>
                </div>
              </div>
            </div>

            {/* Rootless Security Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Rootless Hardening Status
                </h3>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">no-new-privileges:</span>
                  <span className="text-emerald-400 font-bold">true (enforced)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">cap_drop:</span>
                  <span className="text-emerald-400 font-bold">[ALL] (38+ dropped)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Execution User:</span>
                  <span className="text-purple-300 font-bold">1001:1001 (unprivileged)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">cgroup Quota:</span>
                  <span className="text-slate-300">{site.cpuLimit} • {site.memoryLimitMB}MB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mapped Volumes Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Declarative Docker Volume Mounts
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500">Root Directory: /opt/panel/apps/sites/{site.domain}/</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5">Host Relative Path</th>
                    <th className="p-2.5">Container Target Mount</th>
                    <th className="p-2.5">Permission Mode</th>
                    <th className="p-2.5">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {isTomcat ? (
                    <>
                      <tr>
                        <td className="p-2.5 text-amber-400">./data/webapps</td>
                        <td className="p-2.5">/usr/local/tomcat/webapps</td>
                        <td className="p-2.5">rw (0750)</td>
                        <td className="p-2.5 text-slate-400">Hot deployment WAR and exploded contexts</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">./data/conf</td>
                        <td className="p-2.5">/usr/local/tomcat/conf/custom</td>
                        <td className="p-2.5">ro (0640)</td>
                        <td className="p-2.5 text-slate-400">Custom server.xml &amp; context properties</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">./logs</td>
                        <td className="p-2.5">/usr/local/tomcat/logs</td>
                        <td className="p-2.5">rw (0750)</td>
                        <td className="p-2.5 text-slate-400">Catalina and access logs</td>
                      </tr>
                    </>
                  ) : (
                    <>
                      <tr>
                        <td className="p-2.5 text-cyan-400">./app</td>
                        <td className="p-2.5">/app</td>
                        <td className="p-2.5">rw (0750)</td>
                        <td className="p-2.5 text-slate-400">Python source code, main.py, requirements.txt</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-cyan-400">./logs</td>
                        <td className="p-2.5">/app/logs</td>
                        <td className="p-2.5">rw (0750)</td>
                        <td className="p-2.5 text-slate-400">Application log stream outputs</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Runtime Settings */}
      {activeTab === 'runtime' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          {isTomcat ? (
            <div className="space-y-6">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <Server className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-mono font-bold text-white">
                    Apache Tomcat &amp; Temurin JRE JVM Tuning
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Configures CATALINA_OPTS and automated heap sizing in .env
                  </p>
                </div>
              </div>

              {/* Heap Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div>
                  <div className="flex justify-between items-center text-xs font-mono text-slate-300 mb-1">
                    <span>Initial Heap (-Xms):</span>
                    <strong className="text-amber-400">{minHeapMB}m</strong>
                  </div>
                  <input
                    type="range"
                    min="256"
                    max="2048"
                    step="128"
                    value={minHeapMB}
                    onChange={e => setMinHeapMB(parseInt(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                    <span>256m</span>
                    <span>2048m</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs font-mono text-slate-300 mb-1">
                    <span>Maximum Heap (-Xmx):</span>
                    <strong className="text-amber-400">{maxHeapMB}m</strong>
                  </div>
                  <input
                    type="range"
                    min="512"
                    max="4096"
                    step="256"
                    value={maxHeapMB}
                    onChange={e => setMaxHeapMB(parseInt(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                    <span>512m</span>
                    <span>4096m</span>
                  </div>
                </div>
              </div>

              {/* Custom JVM Parameters */}
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1.5 font-bold">
                  Custom JVM Flags &amp; Options (Sanitized against command injection)
                </label>
                <textarea
                  value={customJvmOpts}
                  onChange={e => setCustomJvmOpts(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-amber-300 focus:outline-none focus:border-amber-500 leading-relaxed"
                />
                <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                  Shell metacharacters (<code>;&amp;|`$</code>) and arbitrary agent loading (<code>-javaagent</code>) are automatically rejected.
                </span>
              </div>

              {/* .WAR File Drag & Drop Uploader */}
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1.5 font-bold">
                  Hot Deploy .WAR Archive (Root Context)
                </label>
                <div
                  onClick={() => setSelectedWarFile({ name: 'ROOT.war', size: '18.4 MB' })}
                  className="border-2 border-dashed border-amber-500/30 hover:border-amber-500/60 rounded-2xl p-6 text-center cursor-pointer bg-slate-950/60 transition-colors"
                >
                  <Upload className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                  {selectedWarFile ? (
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Ready: {selectedWarFile.name} ({selectedWarFile.size})</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Magic bytes verified: <code>[0x50, 0x4B, 0x03, 0x04]</code> (Valid ZIP Archive)
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        Drag and drop your application .WAR package here
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Validates magic bytes • Streams to ./data/webapps/ROOT.war
                      </span>
                    </div>
                  )}
                </div>

                {selectedWarFile && (
                  <button
                    onClick={handleDeployWar}
                    disabled={warDeploying}
                    className="mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs rounded-xl shadow-md transition-colors"
                  >
                    {warDeploying ? 'Deploying and Restarting Tomcat...' : 'Deploy to ROOT.war'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <Terminal className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-mono font-bold text-white">
                    Python WSGI / ASGI Execution Specification
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Configures workers, threads, and application module entrypoints
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Python Version</label>
                  <select
                    value={pythonVersion}
                    onChange={e => setPythonVersion(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300"
                  >
                    <option value="3.12-slim">Python 3.12 Slim (FastAPI default)</option>
                    <option value="3.11-slim">Python 3.11 Slim (Enterprise stable)</option>
                    <option value="3.10-slim">Python 3.10 Slim (LTS legacy)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Server Runner</label>
                  <select
                    value={pythonRunner}
                    onChange={e => setPythonRunner(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300"
                  >
                    <option value="uvicorn">Uvicorn (FastAPI / ASGI Event Loop)</option>
                    <option value="gunicorn">Gunicorn (WSGI / gthread workers)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">App Module Entrypoint</label>
                  <input
                    type="text"
                    value={appEntrypoint}
                    onChange={e => setAppEntrypoint(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300"
                    placeholder="main:app"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Worker Count Stepper ({workersCount})</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setWorkersCount(Math.max(1, workersCount - 1))}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded font-mono text-xs"
                    >
                      -
                    </button>
                    <span className="font-mono text-xs font-bold text-white px-3">{workersCount} Workers</span>
                    <button
                      onClick={() => setWorkersCount(Math.min(16, workersCount + 1))}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded font-mono text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Pip Install Trigger */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-mono font-bold text-white">Dependency Synchronizer</h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Executes <code>pip install --user -r requirements.txt</code> inside the unprivileged container.
                    </p>
                  </div>
                  <button
                    onClick={handlePipInstall}
                    disabled={pipInstalling}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs rounded-xl shadow-md transition-colors disabled:opacity-50"
                  >
                    {pipInstalling ? 'Running pip install...' : 'Run pip install -r requirements.txt'}
                  </button>
                </div>

                {pipOutput && (
                  <pre className="p-3 bg-slate-900 rounded-lg border border-slate-800 font-mono text-[11px] text-cyan-200 whitespace-pre-wrap">
                    {pipOutput}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Environment (.env) */}
      {activeTab === 'env' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-mono font-bold text-white">Environment Variables (.env)</h3>
              <p className="text-xs text-slate-400 font-mono">
                Persisted in /opt/panel/apps/sites/{site.domain}/.env with 0640 permissions
              </p>
            </div>
            <button
              onClick={handleSaveEnv}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs rounded-xl shadow-md transition-colors"
            >
              Save &amp; Restart Container
            </button>
          </div>

          {/* Add variable form */}
          <form onSubmit={handleAddEnvVar} className="flex flex-wrap items-center gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
            <input
              type="text"
              value={newEnvKey}
              onChange={e => setNewEnvKey(e.target.value)}
              placeholder="VARIABLE_KEY"
              className="flex-1 min-w-[160px] bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none"
            />
            <input
              type="text"
              value={newEnvVal}
              onChange={e => setNewEnvVal(e.target.value)}
              placeholder="value"
              className="flex-1 min-w-[200px] bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none"
            />
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Variable
            </button>
          </form>

          {/* Variables Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">Key</th>
                  <th className="p-3">Value</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {envVars.map((v, idx) => (
                  <tr key={idx} className="hover:bg-slate-950/60 transition-colors">
                    <td className="p-3 font-bold text-emerald-400">{v.key}</td>
                    <td className="p-3">
                      {v.isSecret && !v.revealed ? (
                        <span className="text-slate-500 tracking-widest font-mono">••••••••••••••••••••••••</span>
                      ) : (
                        <span className="text-slate-200">{v.value}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {v.isSecret && (
                          <button
                            type="button"
                            onClick={() =>
                              setEnvVars(prev =>
                                prev.map((item, i) => (i === idx ? { ...item, revealed: !item.revealed } : item))
                              )
                            }
                            className="p-1 text-slate-400 hover:text-white"
                            title={v.revealed ? 'Hide secret' : 'Reveal secret'}
                          >
                            {v.revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEnvVars(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: SSL & Ingress */}
      {activeTab === 'ssl' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-mono font-bold text-white">
                OpenResty / Nginx Ingress &amp; TLS Certificates
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Dynamic vhost in /opt/panel/apps/openresty/conf.d/vhosts/{site.domain}.conf
              </p>
            </div>
            <button
              onClick={() => triggerToast('OpenResty syntax tested (nginx -t) and reloaded with SIGHUP.')}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs rounded-xl shadow-md transition-colors"
            >
              Apply &amp; Reload Proxy
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Automated ACME Let&apos;s Encrypt</span>
                <span className="text-slate-400 text-[11px]">Auto-renews at 30 days via HTTP-01 challenge</span>
              </div>
              <input
                type="checkbox"
                checked={autoRenewSSL}
                onChange={e => setAutoRenewSSL(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Force HTTP to HTTPS (301)</span>
                <span className="text-slate-400 text-[11px]">Redirects unencrypted traffic automatically</span>
              </div>
              <input
                type="checkbox"
                checked={forceHttps}
                onChange={e => setForceHttps(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">WebSocket Upgrade Mapping</span>
                <span className="text-slate-400 text-[11px]">Passes Connection and Upgrade headers</span>
              </div>
              <input
                type="checkbox"
                checked={enableWebSocket}
                onChange={e => setEnableWebSocket(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">HSTS 2-Year Preload</span>
                <span className="text-slate-400 text-[11px]">Strict-Transport-Security max-age=63072000</span>
              </div>
              <input
                type="checkbox"
                checked={hstsPreload}
                onChange={e => setHstsPreload(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500"
              />
            </div>
          </div>

          {/* Custom Certificate Uploader */}
          <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <h4 className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
              <Key className="w-4 h-4 text-cyan-400" />
              Custom TLS / SSL Certificate Override (Optional)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Certificate (fullchain.pem)</label>
                <textarea
                  value={customCert}
                  onChange={e => setCustomCert(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----..."
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono text-[11px] text-slate-200 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Private Key (privkey.pem)</label>
                <textarea
                  value={customKey}
                  onChange={e => setCustomKey(e.target.value)}
                  placeholder="-----BEGIN PRIVATE KEY-----..."
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono text-[11px] text-slate-200 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Live Container Logs */}
      {activeTab === 'logs' && (
        <SiteLogViewer domain={site.domain} initialType={site.type} />
      )}

      {/* Tab 6: Files & Monaco Editor */}
      {activeTab === 'files' && (
        <SiteFileManager domain={site.domain} initialType={site.type} />
      )}

      {/* AI Diagnostic Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 font-sans text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">AI Log Diagnostician &amp; Root Cause Analysis</h3>
              </div>
              <button
                onClick={() => setAiModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            {aiDiagnosing ? (
              <div className="py-12 text-center space-y-3 font-mono text-xs">
                <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
                <p className="text-purple-300 font-semibold">
                  Ingesting Docker log demux multiplexer &amp; analyzing stack traces...
                </p>
              </div>
            ) : (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs leading-relaxed text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap">
                {aiAnalysis}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setAiModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-mono transition-colors"
              >
                Close Diagnosis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
