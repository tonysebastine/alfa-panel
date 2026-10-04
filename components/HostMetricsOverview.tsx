'use client';

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  HardDrive,
  Activity,
  Network,
  Shield,
  ShieldAlert,
  Server,
  Clock,
  CheckCircle2,
  Trash2,
  Lock,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
}

const Sparkline: React.FC<SparklineProps> = ({ data, color, height = 36 }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 120;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

export const HostMetricsOverview: React.FC = () => {
  // Live metric history for sparklines
  const [cpuHistory, setCpuHistory] = useState<number[]>([12, 14, 18, 15, 22, 19, 16, 24, 18]);
  const [ramHistory, setRamHistory] = useState<number[]>([20, 20, 20.2, 20.4, 20.1, 20.5, 20.3]);
  const [netRxHistory, setNetRxHistory] = useState<number[]>([8, 12, 16, 14, 22, 35, 28, 30]);
  const [diskIoHistory, setDiskIoHistory] = useState<number[]>([4, 6, 12, 8, 15, 9, 7, 10]);

  // Fail2ban / CrowdSec Banned IPs
  const [bannedIPs, setBannedIPs] = useState<Array<{ ip: string; jail: string; time: string; attempts: number }>>([
    { ip: '185.220.101.5', jail: 'sshd', time: '14 mins ago', attempts: 5 },
    { ip: '45.154.255.89', jail: 'openresty-auth', time: '42 mins ago', attempts: 12 },
    { ip: '194.26.29.112', jail: 'panel-login', time: '2 hours ago', attempts: 8 },
  ]);

  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Periodic simulated live ticks
  useEffect(() => {
    const timer = setInterval(() => {
      setCpuHistory(prev => [...prev.slice(-15), Math.floor(14 + Math.random() * 12)]);
      setNetRxHistory(prev => [...prev.slice(-15), Math.floor(20 + Math.random() * 25)]);
      setDiskIoHistory(prev => [...prev.slice(-15), Math.floor(6 + Math.random() * 10)]);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleUnban = (ip: string) => {
    setBannedIPs(prev => prev.filter(item => item.ip !== ip));
    setToastNotice(`IP ${ip} unbanned from Fail2ban / CrowdSec jail.`);
    setTimeout(() => setToastNotice(null), 3000);
  };

  const currentCpu = cpuHistory[cpuHistory.length - 1];
  const currentNetRx = netRxHistory[netRxHistory.length - 1];
  const currentDiskIo = diskIoHistory[diskIoHistory.length - 1];

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Alert */}
      {toastNotice && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono text-xs rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastNotice}</span>
        </div>
      )}

      {/* Host Node Metadata Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div>
            <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold">
              Host Node Telemetry &amp; Cgroups
            </span>
            <h2 className="text-lg font-bold text-white mt-0.5">
              Production Node 01 (Ubuntu 24.04 LTS / Linux 6.8.0-generic)
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono mt-1">
              <span>Uptime: 18d 14h 22m</span>
              <span>•</span>
              <span>Load Average: 0.42, 0.58, 0.65</span>
              <span>•</span>
              <span>Docker Daemon: 27.1.1 API v1.46</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs rounded-full font-bold">
              SYS STATS OK
            </span>
          </div>
        </div>

        {/* 4 Primary Metric Cards with Sparklines */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {/* CPU Card */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" /> CPU Load
                </span>
                <span className="text-purple-300 font-bold">{currentCpu}%</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white mt-1">
                {currentCpu}.0%
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">8 vCPUs • 2.60 GHz</div>
            </div>
            <div className="pt-3 flex justify-end">
              <Sparkline data={cpuHistory} color="#a855f7" />
            </div>
          </div>

          {/* RAM Card */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> RAM Memory
                </span>
                <span className="text-cyan-300 font-bold">20.4%</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white mt-1">
                6.5 GB
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">of 32.0 GB Total</div>
            </div>
            <div className="pt-3 flex justify-end">
              <Sparkline data={ramHistory} color="#06b6d4" />
            </div>
          </div>

          {/* Network I/O Card */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-emerald-400" /> Network Bandwidth
                </span>
                <span className="text-emerald-300 font-bold">{currentNetRx} MB/s</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white mt-1">
                {currentNetRx}.2 MB/s
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">panel-network bridge interface</div>
            </div>
            <div className="pt-3 flex justify-end">
              <Sparkline data={netRxHistory} color="#10b981" />
            </div>
          </div>

          {/* Disk I/O Card */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" /> Disk I/O (NVMe)
                </span>
                <span className="text-amber-300 font-bold">{currentDiskIo} MB/s</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white mt-1">
                {currentDiskIo}.8 MB/s
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">84.2 GB used of 480 GB (17.5%)</div>
            </div>
            <div className="pt-3 flex justify-end">
              <Sparkline data={diskIoHistory} color="#f59e0b" />
            </div>
          </div>
        </div>
      </div>

      {/* Security Engine Row: Fail2ban & Active Host Firewall */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fail2ban / CrowdSec Banned IPs */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <div>
                <h3 className="text-sm font-mono font-bold text-white">
                  Brute-Force Protection (Fail2ban &amp; CrowdSec)
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Automated ban triggers on excessive failed auth attempts
                </p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400">
              {bannedIPs.length} Banned IPs
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Banned IP</th>
                  <th className="p-2.5">Jail Rule</th>
                  <th className="p-2.5">Attempts</th>
                  <th className="p-2.5">Banned Time</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {bannedIPs.map(item => (
                  <tr key={item.ip} className="hover:bg-slate-950/60 transition-colors">
                    <td className="p-2.5 font-bold text-rose-400">{item.ip}</td>
                    <td className="p-2.5 text-slate-300">{item.jail}</td>
                    <td className="p-2.5 text-slate-400">{item.attempts} fails</td>
                    <td className="p-2.5 text-slate-500">{item.time}</td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => handleUnban(item.ip)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] transition-colors"
                      >
                        Unban
                      </button>
                    </td>
                  </tr>
                ))}
                {bannedIPs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      No active bans. Host is protected and quiet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Firewall Rules Summary */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-mono font-bold text-white">
                  Host Firewall Status (UFW / nftables)
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Default Policy: DROP incoming • ALLOW 80/443
                </p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              Active &amp; Locked
            </span>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-bold text-white">Port 22/tcp</span>
                <span className="text-slate-400">(SSH Management)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                ALLOW
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-bold text-white">Port 80/tcp</span>
                <span className="text-slate-400">(HTTP 1Panel Ingress &amp; ACME)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                ALLOW
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-bold text-white">Port 443/tcp</span>
                <span className="text-slate-400">(HTTPS OpenResty TLS Ingress)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                ALLOW
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="font-bold text-rose-300">All Other Raw Ports</span>
                <span className="text-slate-500">(8080, 8000, 3306, 5432)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                BLOCKED ON HOST
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
