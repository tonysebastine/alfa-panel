'use client';

import React from 'react';
import { SiteConfigState } from '@/lib/generator-client';
import { Server, Cpu, HardDrive, ShieldCheck, Globe, Terminal, Settings2 } from 'lucide-react';

interface SiteConfiguratorProps {
  config: SiteConfigState;
  onChange: (updater: (prev: SiteConfigState) => SiteConfigState) => void;
}

export const SiteConfigurator: React.FC<SiteConfiguratorProps> = ({ config, onChange }) => {
  const isTomcat = config.type === 'tomcat';

  return (
    <div className="space-y-6">
      {/* Runtime Switcher Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Workload Profile Engine
            </span>
            <h2 className="text-xl font-bold text-white mt-1">Runtime Specification</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Declarative configuration for containerized workloads fronted by 1Panel ingress.
            </p>
          </div>

          <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => onChange(prev => ({
                ...prev,
                type: 'tomcat',
                port: 8080,
                domain: prev.domain.includes('fastapi') ? prev.domain.replace('fastapi', 'java') : prev.domain,
              }))}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                isTomcat
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server className="w-4 h-4" />
              Apache Tomcat (Java)
            </button>
            <button
              type="button"
              onClick={() => onChange(prev => ({
                ...prev,
                type: 'python',
                port: 8000,
                domain: prev.domain.includes('java') ? prev.domain.replace('java', 'fastapi') : prev.domain,
              }))}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                !isTomcat
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal className="w-4 h-4" />
              Python (ASGI / WSGI)
            </button>
          </div>
        </div>
      </div>

      {/* Primary Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Domain & Identity */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
            <Globe className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">Site Identity & Ingress</h3>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1">
              Primary Domain (RFC 1123 FQDN)
            </label>
            <div className="relative">
              <input
                type="text"
                value={config.domain}
                onChange={e => onChange(prev => ({ ...prev, domain: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-sm text-emerald-300 font-mono focus:border-emerald-500 focus:outline-none transition-colors"
                placeholder="app.production.example.com"
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1 font-mono">
              <span>Target path: /opt/panel/apps/sites/{config.domain}/</span>
              <span className="text-emerald-400/80 font-medium">Valid FQDN</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">Internal Container Port</label>
              <input
                type="number"
                value={config.port}
                onChange={e => onChange(prev => ({ ...prev, port: parseInt(e.target.value) || 8080 }))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500">Exposed only to panel-network</span>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">Bridge Network</label>
              <input
                type="text"
                value={config.networkName}
                readOnly
                className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-400 font-mono cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-500">Host port binding: DISABLED</span>
            </div>
          </div>

          {/* Reverse Proxy Options */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <span className="text-xs font-semibold text-slate-300 block">OpenResty Ingress Features</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enableSSL}
                  onChange={e => onChange(prev => ({ ...prev, enableSSL: e.target.checked }))}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                />
                Automated ACME / HTTPS
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enableWebSocket}
                  onChange={e => onChange(prev => ({ ...prev, enableWebSocket: e.target.checked }))}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                />
                WebSocket Upgrade Pass
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.hsts}
                  onChange={e => onChange(prev => ({ ...prev, hsts: e.target.checked }))}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                />
                HSTS 2-Year Preload
              </label>

              <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                <span>Upload Max:</span>
                <input
                  type="number"
                  value={config.maxBodySizeMB}
                  onChange={e => onChange(prev => ({ ...prev, maxBodySizeMB: parseInt(e.target.value) || 100 }))}
                  className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200"
                />
                <span>MB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Runtime Specifics */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
            <Settings2 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              {isTomcat ? 'Java / Apache Tomcat Engine' : 'Python ASGI/WSGI Engine'}
            </h3>
          </div>

          {isTomcat ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Base Container Image</label>
                <select
                  value={config.tomcatImage}
                  onChange={e => onChange(prev => ({ ...prev, tomcatImage: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-mono focus:border-amber-500 focus:outline-none"
                >
                  <option value="tomcat:10.1-jdk21-temurin-jammy">tomcat:10.1-jdk21-temurin-jammy (Temurin 21 LTS - Recommended)</option>
                  <option value="tomcat:10.1-jdk17-temurin-jammy">tomcat:10.1-jdk17-temurin-jammy (Temurin 17 LTS)</option>
                  <option value="tomcat:9.0-jdk11-temurin-jammy">tomcat:9.0-jdk11-temurin-jammy (Legacy Java EE 8)</option>
                  <option value="tomcat:11.0-jdk21-temurin-noble">tomcat:11.0-jdk21-temurin-noble (Jakarta EE 11 NextGen)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Initial Heap (-Xms)</label>
                  <input
                    type="text"
                    value={config.minHeap}
                    onChange={e => onChange(prev => ({ ...prev, minHeap: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                    placeholder="512m"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Maximum Heap (-Xmx)</label>
                  <input
                    type="text"
                    value={config.maxHeap}
                    onChange={e => onChange(prev => ({ ...prev, maxHeap: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                    placeholder="1536m"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Garbage Collector</label>
                <select
                  value={config.gcAlgo}
                  onChange={e => onChange(prev => ({ ...prev, gcAlgo: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                >
                  <option value="-XX:+UseG1GC">-XX:+UseG1GC (Low Pause Multi-Core Default)</option>
                  <option value="-XX:+UseZGC">-XX:+UseZGC (Ultra-Low Latency Java 21)</option>
                  <option value="-XX:+UseParallelGC">-XX:+UseParallelGC (High Throughput Batch)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Deployment Mount Paths</label>
                <div className="text-[11px] font-mono text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-amber-400/90">./data/webapps → /usr/local/tomcat/webapps</div>
                  <div className="text-slate-400">./data/conf → /usr/local/tomcat/conf/custom:ro</div>
                  <div className="text-slate-400">./logs → /usr/local/tomcat/logs</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Base Container Image</label>
                <select
                  value={config.pythonImage}
                  onChange={e => onChange(prev => ({ ...prev, pythonImage: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-cyan-300 font-mono focus:border-cyan-500 focus:outline-none"
                >
                  <option value="python:3.12-slim-bookworm">python:3.12-slim-bookworm (Modern Fast Default)</option>
                  <option value="python:3.11-slim-bookworm">python:3.11-slim-bookworm (Enterprise Stable)</option>
                  <option value="python:3.10-slim-bullseye">python:3.10-slim-bullseye (LTS Compatible)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Server Runner</label>
                  <select
                    value={config.pythonRunner}
                    onChange={e => onChange(prev => ({ ...prev, pythonRunner: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                  >
                    <option value="gunicorn">Gunicorn (WSGI / Multi-Threaded)</option>
                    <option value="uvicorn">Uvicorn (FastAPI / ASGI Event Loop)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">App Entrypoint</label>
                  <input
                    type="text"
                    value={config.appModule}
                    onChange={e => onChange(prev => ({ ...prev, appModule: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-cyan-300 font-mono"
                    placeholder="main:app"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Workers Count</label>
                  <input
                    type="number"
                    value={config.workers}
                    onChange={e => onChange(prev => ({ ...prev, workers: parseInt(e.target.value) || 4 }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Threads / Worker</label>
                  <input
                    type="number"
                    value={config.threads}
                    onChange={e => onChange(prev => ({ ...prev, threads: parseInt(e.target.value) || 2 }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Deployment Mount Paths</label>
                <div className="text-[11px] font-mono text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-cyan-400/90">./app → /app (main.py, requirements.txt)</div>
                  <div className="text-slate-400">./logs → /app/logs</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resource & Security Isolation Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cgroup Limits */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
            <Cpu className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-200">cgroups Resource Quotas</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">CPU Limit (Cores)</label>
              <input
                type="text"
                value={config.cpuLimit}
                onChange={e => onChange(prev => ({ ...prev, cpuLimit: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                placeholder="1.5"
              />
              <span className="text-[10px] text-slate-500">cgroup v2 cpu.max</span>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">RAM Hard Limit</label>
              <input
                type="text"
                value={config.memoryLimit}
                onChange={e => onChange(prev => ({ ...prev, memoryLimit: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                placeholder="2048M"
              />
              <span className="text-[10px] text-slate-500">cgroup memory.max</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">RAM Reservation</label>
              <input
                type="text"
                value={config.memoryReservation}
                onChange={e => onChange(prev => ({ ...prev, memoryReservation: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                placeholder="512M"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">PIDs Limit (Fork-Bomb Guard)</label>
              <input
                type="number"
                value={config.pidsLimit}
                onChange={e => onChange(prev => ({ ...prev, pidsLimit: parseInt(e.target.value) || 200 }))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Linux Kernel Hardening */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">1Panel Rootless Security Flags</h3>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800">
              <div>
                <div className="text-xs font-mono font-semibold text-emerald-400">no-new-privileges: true</div>
                <div className="text-[10px] text-slate-400">Prevents SUID binaries from escalating kernel credentials</div>
              </div>
              <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 font-mono rounded font-bold">
                ENFORCED
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800">
              <div>
                <div className="text-xs font-mono font-semibold text-emerald-400">cap_drop: [ALL]</div>
                <div className="text-[10px] text-slate-400">Zero root capability baseline (strips 38+ kernel capabilities)</div>
              </div>
              <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 font-mono rounded font-bold">
                ENFORCED
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800">
              <div>
                <div className="text-xs font-mono font-semibold text-sky-400">
                  user: &quot;{config.uid}:{config.gid}&quot;
                </div>
                <div className="text-[10px] text-slate-400">Non-root unprivileged container user execution</div>
              </div>
              <span className="px-2 py-0.5 text-[10px] bg-sky-500/20 text-sky-300 font-mono rounded font-bold">
                ROOTLESS
              </span>
            </div>

            <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-400">
              <span className="text-amber-400 font-semibold">Whitelisted Minimal Caps:</span> NET_BIND_SERVICE, CHOWN, SETUID, SETGID
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
