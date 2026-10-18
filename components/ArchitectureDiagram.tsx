'use client';

import React from 'react';
import { Shield, Server, ArrowDown, ArrowRight, Network, Lock, FileCode, CheckCircle2 } from 'lucide-react';

export const ArchitectureDiagram: React.FC = () => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
        <div>
          <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold">
            alfa-panel Architecture Reference Model
          </span>
          <h3 className="text-lg font-bold text-white mt-0.5">
            Privileged Host Daemon &amp; Rootless Docker Workloads
          </h3>
          <p className="text-xs text-slate-400 font-mono">
            Orchestration via /var/run/docker.sock • Internal Bridge panel-network • Ingress Isolation
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs rounded-full font-bold self-start">
          ZERO HOST PORTS EXPOSED
        </span>
      </div>

      {/* Visual Architectural Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 text-xs font-mono">
        {/* Layer 1: Public Internet & Firewall */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-bold border-b border-slate-800 pb-2">
            <Shield className="w-4 h-4" />
            <span>1. Host Ingress &amp; UFW</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Host firewall (<code>ufw</code> / <code>nftables</code>) strictly allows only Port 80 (HTTP) &amp; Port 443 (HTTPS) from the public internet.
          </p>
          <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] space-y-1 text-slate-300">
            <div>• Port 80 (ACME Challenge)</div>
            <div>• Port 443 (TLS 1.2/1.3)</div>
            <div>• All raw app ports BLOCKED</div>
          </div>
        </div>

        {/* Layer 2: OpenResty Reverse Proxy */}
        <div className="bg-slate-950 p-4 rounded-xl border border-cyan-800/60 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-bold border-b border-slate-800 pb-2">
            <Server className="w-4 h-4" />
            <span>2. alfa-panel OpenResty</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            OpenResty / Nginx container terminating SSL, enforcing HSTS, handling WebSocket upgrades, and routing <code>&lt;domain&gt;</code> to containers.
          </p>
          <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] space-y-1 text-cyan-300">
            <div>• Dynamic Vhost Generator</div>
            <div>• ACME / Let&apos;s Encrypt Auto-renew</div>
            <div>• Upstream: container:port</div>
          </div>
        </div>

        {/* Layer 3: panel-network Bridge */}
        <div className="bg-slate-950 p-4 rounded-xl border border-emerald-800/60 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold border-b border-slate-800 pb-2">
            <Network className="w-4 h-4" />
            <span>3. panel-network</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Internal bridge network isolated from host network namespace. Workloads join via declarative <code>docker-compose.yml</code>.
          </p>
          <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] space-y-1 text-emerald-300">
            <div>• No host port bindings</div>
            <div>• Only exposed internally</div>
            <div>• DNS name resolution</div>
          </div>
        </div>

        {/* Layer 4: Workload Sandbox */}
        <div className="bg-slate-950 p-4 rounded-xl border border-purple-800/60 space-y-3">
          <div className="flex items-center gap-2 text-purple-400 font-bold border-b border-slate-800 pb-2">
            <Lock className="w-4 h-4" />
            <span>4. Rootless Workload</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Site isolated in <code>/opt/panel/apps/sites/&lt;domain&gt;/</code> with non-root UID 1001, dropped capabilities, and strict cgroups.
          </p>
          <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] space-y-1 text-purple-300">
            <div>• no-new-privileges: true</div>
            <div>• CapDrop: [ALL]</div>
            <div>• CPU &amp; RAM Quotas</div>
          </div>
        </div>
      </div>

      {/* Directory & Security Principles Checklist */}
      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
        <h4 className="text-xs font-mono font-bold text-slate-200 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Core Architecture &amp; Security Compliance
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono text-slate-300">
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Target path convention: <code>/opt/panel/apps/sites/&lt;domain&gt;/</code> (0750 dirs, 0640 files)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Tomcat layout: <code>data/webapps/</code>, <code>data/conf/</code>, <code>logs/</code>, <code>docker-compose.yml</code>, <code>.env</code></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Python layout: <code>app/</code>, <code>logs/</code>, <code>docker-compose.yml</code>, <code>.env</code></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Orchestration over <code>/var/run/docker.sock</code> with live log multiplex demuxing</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Dynamic OpenResty reload with <code>nginx -t</code> syntax verification and rollback</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>JWT Auth + RFC 6238 TOTP + Token-Bucket Rate Limiter + SQLite Audit Trail</span>
          </div>
        </div>
      </div>
    </div>
  );
};
