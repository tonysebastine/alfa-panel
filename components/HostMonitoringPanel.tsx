'use client';

import React, { useState } from 'react';
import { Cpu, HardDrive, Activity, Shield, ShieldAlert, Plus, Trash2, Clock, CheckCircle2 } from 'lucide-react';

interface FirewallRuleItem {
  id: number;
  port: number;
  protocol: string;
  action: 'ALLOW' | 'DENY';
  from: string;
  comment: string;
}

interface AuditRecordItem {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  target: string;
  ip: string;
  details: string;
}

export const HostMonitoringPanel: React.FC = () => {
  // Turn 6: Host Telemetry
  const metrics = {
    hostname: 'panel-node-01.production',
    uptime: '18d 14h 22m',
    cpuPercent: 18.4,
    cpuCount: 8,
    ramUsedGB: 6.4,
    ramTotalGB: 32.0,
    ramPercent: 20.0,
    diskUsedGB: 84.2,
    diskTotalGB: 480.0,
    diskPercent: 17.5,
    diskReadMB: '14.8 MB/s',
    diskWriteMB: '8.2 MB/s',
  };

  // Turn 6: Firewall rules state
  const [rules, setRules] = useState<FirewallRuleItem[]>([
    { id: 1, port: 22, protocol: 'tcp', action: 'ALLOW', from: 'Anywhere', comment: 'SSH Host Management' },
    { id: 2, port: 80, protocol: 'tcp', action: 'ALLOW', from: 'Anywhere', comment: 'HTTP OpenResty Ingress' },
    { id: 3, port: 443, protocol: 'tcp', action: 'ALLOW', from: 'Anywhere', comment: 'HTTPS OpenResty Ingress' },
    { id: 4, port: 3306, protocol: 'tcp', action: 'DENY', from: 'Anywhere', comment: 'Block raw MySQL port' },
  ]);

  const [newPort, setNewPort] = useState<number>(8443);
  const [newProto, setNewProto] = useState<string>('tcp');
  const [newComment, setNewComment] = useState<string>('Custom Ingress Port');
  const [firewallNotice, setFirewallNotice] = useState<string | null>(null);

  // Turn 6: Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditRecordItem[]>([
    {
      id: 5,
      timestamp: '2026-10-04T12:04:18Z',
      user: 'admin',
      action: 'site_restart',
      target: 'api.production.example.com',
      ip: '192.168.1.50',
      details: 'Triggered graceful reboot via API',
    },
    {
      id: 4,
      timestamp: '2026-10-04T12:02:11Z',
      user: 'admin',
      action: 'deploy_war',
      target: 'tomcat.corp.internal',
      ip: '192.168.1.50',
      details: 'Uploaded ROOT.war (14.2 MB) magic bytes verified',
    },
    {
      id: 3,
      timestamp: '2026-10-04T11:58:32Z',
      user: 'admin',
      action: 'firewall_rule_added',
      target: 'port:443/tcp',
      ip: '192.168.1.50',
      details: 'Executed ufw allow 443/tcp comment "HTTPS OpenResty Ingress"',
    },
    {
      id: 2,
      timestamp: '2026-10-04T11:45:00Z',
      user: 'admin',
      action: 'site_created',
      target: 'fastapi.corp.internal',
      ip: '192.168.1.50',
      details: 'Provisioned Python 3.12 site with Uvicorn on panel-network',
    },
    {
      id: 1,
      timestamp: '2026-10-04T11:30:00Z',
      user: 'system',
      action: 'daemon_started',
      target: '1panel-agent',
      ip: '127.0.0.1',
      details: 'Host agent initialized with rootless Docker socket connection',
    },
  ]);

  const handleAllowPort = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPort < 1 || newPort > 65535) return;

    const newRule: FirewallRuleItem = {
      id: rules.length + 1,
      port: newPort,
      protocol: newProto,
      action: 'ALLOW',
      from: 'Anywhere',
      comment: newComment || `Port ${newPort}`,
    };

    setRules(prev => [...prev, newRule]);
    setAuditLogs(prev => [
      {
        id: prev.length + 1,
        timestamp: new Date().toISOString(),
        user: 'admin',
        action: 'firewall_rule_added',
        target: `port:${newPort}/${newProto}`,
        ip: '127.0.0.1',
        details: `ufw allow ${newPort}/${newProto} comment "${newComment}"`,
      },
      ...prev,
    ]);

    setFirewallNotice(`Rule added: ALLOW ${newPort}/${newProto} (${newComment})`);
    setTimeout(() => setFirewallNotice(null), 3000);
  };

  const handleDeleteRule = (id: number) => {
    const rule = rules.find(r => r.id === id);
    setRules(prev => prev.filter(r => r.id !== id));
    if (rule) {
      setAuditLogs(prev => [
        {
          id: prev.length + 1,
          timestamp: new Date().toISOString(),
          user: 'admin',
          action: 'firewall_rule_removed',
          target: `port:${rule.port}/${rule.protocol}`,
          ip: '127.0.0.1',
          details: `ufw delete rule for port ${rule.port}`,
        },
        ...prev,
      ]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Turn 6: System Metrics Dashboard */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div>
            <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold">
              Turn 6: Real-time Host Telemetry (gopsutil)
            </span>
            <h3 className="text-lg font-bold text-white mt-0.5">
              Host Resource Engine &amp; Health Probes
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              GET /api/v1/system/metrics • Host: {metrics.hostname} • Uptime: {metrics.uptime}
            </span>
          </div>
          <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs rounded-full font-bold self-start">
            HOST HEALTHY
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-purple-400" /> CPU Load
              </span>
              <span className="text-purple-300 font-bold">{metrics.cpuPercent}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full mt-2 overflow-hidden">
              <div className="bg-purple-500 h-full" style={{ width: `${metrics.cpuPercent}%` }} />
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1.5">
              {metrics.cpuCount} Cores • Scheduler cgroup v2
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> RAM Memory
              </span>
              <span className="text-cyan-300 font-bold">{metrics.ramPercent}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full mt-2 overflow-hidden">
              <div className="bg-cyan-500 h-full" style={{ width: `${metrics.ramPercent}%` }} />
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1.5">
              {metrics.ramUsedGB} GB used of {metrics.ramTotalGB} GB total
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" /> NVMe Disk Storage
              </span>
              <span className="text-emerald-300 font-bold">{metrics.diskPercent}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full mt-2 overflow-hidden">
              <div className="bg-emerald-500 h-full" style={{ width: `${metrics.diskPercent}%` }} />
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1.5">
              {metrics.diskUsedGB} GB / {metrics.diskTotalGB} GB • I/O: R:{metrics.diskReadMB} W:{metrics.diskWriteMB}
            </div>
          </div>
        </div>
      </div>

      {/* Turn 6: Host Firewall Manager */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <div>
              <h4 className="text-sm font-mono font-bold text-white">
                Turn 6: Host Firewall Management (UFW / nftables Wrapper)
              </h4>
              <p className="text-xs text-slate-400">
                Wraps host iptables/ufw via <code>exec.CommandContext</code> to restrict inbound traffic to reverse proxy.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Backend: <strong className="text-emerald-400">ufw (active)</strong>
          </span>
        </div>

        {firewallNotice && (
          <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/80 rounded-lg text-xs font-mono text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {firewallNotice}
          </div>
        )}

        {/* Add Port Form */}
        <form onSubmit={handleAllowPort} className="flex flex-wrap items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Port:</span>
            <input
              type="number"
              value={newPort}
              onChange={e => setNewPort(parseInt(e.target.value) || 0)}
              className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
              placeholder="443"
              min={1}
              max={65535}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Proto:</span>
            <select
              value={newProto}
              onChange={e => setNewProto(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="any">ANY</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
              placeholder="Rule comment (e.g. Ingress Port)"
            />
          </div>

          <button
            type="submit"
            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            AllowPort()
          </button>
        </form>

        {/* Rules Table */}
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-2.5">ID</th>
                <th className="p-2.5">Port / Proto</th>
                <th className="p-2.5">Action</th>
                <th className="p-2.5">From</th>
                <th className="p-2.5">Comment</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {rules.map(rule => (
                <tr key={rule.id} className="hover:bg-slate-950/60 transition-colors">
                  <td className="p-2.5 text-slate-500">[{rule.id}]</td>
                  <td className="p-2.5 font-bold text-white">
                    {rule.port} / {rule.protocol}
                  </td>
                  <td className="p-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        rule.action === 'ALLOW'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {rule.action}
                    </span>
                  </td>
                  <td className="p-2.5 text-slate-400">{rule.from}</td>
                  <td className="p-2.5 text-slate-300">{rule.comment}</td>
                  <td className="p-2.5 text-right">
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1 hover:bg-rose-950 text-slate-500 hover:text-rose-400 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Turn 6: SQLite Audit Log Engine */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-400" />
            <div>
              <h4 className="text-sm font-mono font-bold text-white">
                Turn 6: SQLite Security Audit Trail (/opt/panel/data/audit.db)
              </h4>
              <p className="text-xs text-slate-400">
                Captures immutable records: <code>timestamp</code>, <code>user</code>, <code>action</code>, <code>target</code>, and <code>ip_address</code>.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Total records: {auditLogs.length}
          </span>
        </div>

        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full font-mono text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
              <tr>
                <th className="p-2.5">Time (UTC)</th>
                <th className="p-2.5">User</th>
                <th className="p-2.5">Action</th>
                <th className="p-2.5">Target</th>
                <th className="p-2.5">Client IP</th>
                <th className="p-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {auditLogs.map(item => (
                <tr key={item.id} className="hover:bg-slate-950/60 transition-colors">
                  <td className="p-2.5 text-slate-400 whitespace-nowrap">
                    {item.timestamp.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="p-2.5 font-bold text-slate-200">{item.user}</td>
                  <td className="p-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.action.includes('restart')
                          ? 'bg-amber-500/20 text-amber-300'
                          : item.action.includes('removed') || item.action.includes('deny')
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {item.action}
                    </span>
                  </td>
                  <td className="p-2.5 text-cyan-300 font-semibold">{item.target}</td>
                  <td className="p-2.5 text-slate-400">{item.ip}</td>
                  <td className="p-2.5 text-slate-300">{item.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
