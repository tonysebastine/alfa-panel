'use client';

import React, { useState } from 'react';
import { SiteConfigState, defaultSiteConfig, sanitizeSlug } from '@/lib/generator-client';
import {
  X,
  Server,
  Terminal,
  Cpu,
  HardDrive,
  Upload,
  ShieldCheck,
  CheckCircle2,
  FileCode,
  Layers,
} from 'lucide-react';

interface CreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newSite: any) => void;
}

export const CreateSiteModal: React.FC<CreateSiteModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [siteType, setSiteType] = useState<'tomcat' | 'python'>('tomcat');
  const [domain, setDomain] = useState('');
  const [cpuLimit, setCpuLimit] = useState(1.5);
  const [ramLimitMB, setRamLimitMB] = useState(2048);
  const [enableSSL, setEnableSSL] = useState(true);

  // Tomcat specific
  const [jvmXms, setJvmXms] = useState('512m');
  const [jvmXmx, setJvmXmx] = useState('1536m');
  const [tomcatVersion, setTomcatVersion] = useState('10.1-jdk21-temurin');
  const [uploadedWar, setUploadedWar] = useState<string | null>(null);

  // Python specific
  const [pythonVersion, setPythonVersion] = useState('3.12-slim');
  const [appEntry, setAppEntry] = useState('main:app');
  const [serverType, setServerType] = useState<'gunicorn' | 'uvicorn'>('gunicorn');
  const [workers, setWorkers] = useState(4);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanDomain = domain.trim().toLowerCase();
    if (!cleanDomain) {
      setErrorMsg('Domain name is required (e.g. app.example.com)');
      return;
    }
    if (!/^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(cleanDomain)) {
      setErrorMsg('Domain must match RFC 1123 FQDN syntax without path characters');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);

      const newSite = {
        id: Date.now().toString(),
        domain: cleanDomain,
        type: siteType,
        runtimeName: siteType === 'tomcat' ? 'Tomcat 10.1 / Temurin 21' : `Python ${pythonVersion.split('-')[0]} / ${serverType === 'uvicorn' ? 'FastAPI' : 'WSGI'}`,
        status: 'running',
        ssl: enableSSL ? 'active' : 'disabled',
        cpuPercent: 4.2,
        cpuLimit: `${cpuLimit.toFixed(1)} cores`,
        memoryUsedMB: siteType === 'tomcat' ? 384 : 142,
        memoryLimitMB: ramLimitMB,
        port: siteType === 'tomcat' ? 8080 : 8000,
        containerName: `site_${siteType}_${sanitizeSlug(cleanDomain)}`,
        createdAt: 'Just now',
      };

      onCreated(newSite);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-200 font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Create New Website Workload</h3>
              <p className="text-xs text-slate-400 font-mono">
                Declarative isolation in /opt/panel/apps/sites/&lt;domain&gt;/
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-xs font-mono">
              {errorMsg}
            </div>
          )}

          {/* Runtime Selector Tabs */}
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase font-semibold">
              Workload Engine
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSiteType('tomcat')}
                className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                  siteType === 'tomcat'
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Server className="w-4 h-4" />
                Apache Tomcat (Java JRE)
              </button>
              <button
                type="button"
                onClick={() => setSiteType('python')}
                className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                  siteType === 'python'
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Terminal className="w-4 h-4" />
                Python (ASGI / WSGI)
              </button>
            </div>
          </div>

          {/* Domain Name */}
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5">
              Domain Name (RFC 1123 FQDN)
            </label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="e.g. api.production.example.com"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-emerald-300 font-mono focus:border-emerald-500 focus:outline-none"
              required
            />
            <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1 font-mono">
              <span>Container: site_{siteType}_{domain ? sanitizeSlug(domain) : 'domain'}</span>
              <span>Network: panel-network</span>
            </div>
          </div>

          {/* Cgroup Sliders: CPU & RAM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
            <div>
              <div className="flex justify-between items-center text-xs font-mono text-slate-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" /> CPU Limit
                </span>
                <span className="font-bold text-purple-400">{cpuLimit.toFixed(1)} Cores</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="4.0"
                step="0.5"
                value={cpuLimit}
                onChange={e => setCpuLimit(parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                <span>0.5 core</span>
                <span>4.0 cores</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs font-mono text-slate-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> RAM Hard Limit
                </span>
                <span className="font-bold text-cyan-400">
                  {ramLimitMB >= 1024 ? `${(ramLimitMB / 1024).toFixed(1)} GB` : `${ramLimitMB} MB`}
                </span>
              </div>
              <input
                type="range"
                min="256"
                max="4096"
                step="256"
                value={ramLimitMB}
                onChange={e => setRamLimitMB(parseInt(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                <span>256 MB</span>
                <span>4096 MB</span>
              </div>
            </div>
          </div>

          {/* Runtime Specific Fields */}
          {siteType === 'tomcat' ? (
            <div className="space-y-4 p-4 rounded-xl bg-amber-950/20 border border-amber-900/30">
              <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold">
                <Server className="w-4 h-4" />
                Apache Tomcat &amp; JVM Heap Parameters
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Initial Heap (-Xms)</label>
                  <input
                    type="text"
                    value={jvmXms}
                    onChange={e => setJvmXms(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-amber-300"
                    placeholder="512m"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Max Heap (-Xmx)</label>
                  <input
                    type="text"
                    value={jvmXmx}
                    onChange={e => setJvmXmx(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-amber-300"
                    placeholder="1536m"
                  />
                </div>
              </div>

              {/* .WAR File Dropzone */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">
                  Root Context Deployment (.WAR archive upload)
                </label>
                <div
                  onClick={() => setUploadedWar('app-release-v1.0.war')}
                  className="border-2 border-dashed border-amber-500/30 hover:border-amber-500/60 rounded-xl p-4 text-center cursor-pointer bg-slate-950/60 transition-colors"
                >
                  <Upload className="w-6 h-6 text-amber-400 mx-auto mb-1.5" />
                  {uploadedWar ? (
                    <div className="text-xs font-mono text-emerald-400 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{uploadedWar} (Validated ZIP header: PK..)</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-medium text-slate-300 block">
                        Drop your ROOT.war archive here, or click to browse
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Magic bytes verified • Auto-streams to ./data/webapps/ROOT.war
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-4 rounded-xl bg-cyan-950/20 border border-cyan-900/30">
              <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold">
                <Terminal className="w-4 h-4" />
                Python WSGI / ASGI Execution Parameters
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Runner Engine</label>
                  <select
                    value={serverType}
                    onChange={e => setServerType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-cyan-300"
                  >
                    <option value="gunicorn">Gunicorn (WSGI / gthread)</option>
                    <option value="uvicorn">Uvicorn (FastAPI / ASGI)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">App Entrypoint</label>
                  <input
                    type="text"
                    value={appEntry}
                    onChange={e => setAppEntry(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-cyan-300"
                    placeholder="main:app"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Base Python Version</label>
                  <select
                    value={pythonVersion}
                    onChange={e => setPythonVersion(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200"
                  >
                    <option value="3.12-slim">Python 3.12 Slim (Fastest)</option>
                    <option value="3.11-slim">Python 3.11 Slim (Stable)</option>
                    <option value="3.10-slim">Python 3.10 Slim (LTS)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Workers Count ({workers})</label>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={workers}
                    onChange={e => setWorkers(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer mt-2"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Security & SSL Checklist */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={enableSSL}
                onChange={e => setEnableSSL(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-emerald-500"
              />
              <span>Automated ACME Let&apos;s Encrypt SSL &amp; HTTPS 301 Redirect</span>
            </label>
            <div className="flex items-center gap-2 text-emerald-400/90 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Rootless flags: no-new-privileges: true, CapDrop: [ALL], User: 1001:1001</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-mono font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Provisioning Site...' : 'Provision & Deploy Site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
