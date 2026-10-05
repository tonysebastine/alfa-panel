'use client';

import React, { useState } from 'react';
import {
  Server,
  Globe,
  Database,
  Shield,
  FolderTree,
  Settings,
  Code2,
  Terminal,
  Activity,
  Layers,
  ChevronLeft,
  ChevronRight,
  User,
  Moon,
  Sun,
  Radio,
  ExternalLink,
  Lock,
} from 'lucide-react';

export type NavigationItem =
  | 'overview'
  | 'sites'
  | 'databases'
  | 'security'
  | 'files'
  | 'settings'
  | 'generator'
  | 'docker'
  | 'code'
  | 'blueprint';

interface DashboardShellProps {
  currentNav: NavigationItem;
  onNavigate: (nav: NavigationItem) => void;
  children: React.ReactNode;
  onLogout?: () => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({ currentNav, onNavigate, children, onLogout }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems: Array<{ id: NavigationItem; label: string; icon: React.ElementType; section?: string }> = [
    { id: 'sites', label: 'Websites & Domains', icon: Globe, section: 'Hosting Management' },
    { id: 'overview', label: 'Dashboard Overview', icon: Activity },
    { id: 'databases', label: 'Databases', icon: Database },
    { id: 'security', label: 'Security & Firewall', icon: Shield },
    { id: 'files', label: 'Files & Backups', icon: FolderTree },
    { id: 'settings', label: 'System Settings', icon: Settings },

    { id: 'generator', label: 'Workload Generator', icon: Layers, section: '1Panel Architecture' },
    { id: 'docker', label: 'Docker Socket & Logs', icon: Terminal },
    { id: 'code', label: 'Go Source Code', icon: Code2 },
    { id: 'blueprint', label: 'Architecture Blueprint', icon: ExternalLink },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Collapsible Left Sidebar */}
      <aside
        className={`bg-slate-950 border-r border-slate-800/80 flex flex-col transition-all duration-300 z-40 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <Server className="w-4 h-4 text-slate-950" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-tight">1Panel</h1>
                <p className="text-[10px] text-slate-400 font-mono">Linux Engine Daemon</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 mx-auto rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center">
              <Server className="w-4 h-4 text-slate-950" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors hidden sm:block"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto scrollbar-thin font-mono text-xs">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = currentNav === item.id;

            return (
              <React.Fragment key={item.id}>
                {item.section && !collapsed && (
                  <div className="pt-3 pb-1 px-3 text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    {item.section}
                  </div>
                )}
                <button
                  onClick={() => onNavigate(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/10'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-800 text-[11px] font-mono text-slate-500">
          {!collapsed ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Daemon Active</span>
              </div>
              <span className="text-[10px]">v1.8.2</span>
            </div>
          ) : (
            <div className="w-2 h-2 mx-auto rounded-full bg-emerald-400"></div>
          )}
        </div>
      </aside>

      {userMenuOpen && onLogout && (
        <div className="fixed right-4 top-16 z-50 rounded-xl border border-slate-800 bg-slate-900 shadow-xl p-2">
          <button onClick={onLogout} className="px-3 py-2 text-xs text-rose-300 hover:bg-slate-800 rounded-lg w-full text-left">Sign out</button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
          <div className="px-6 py-3 flex items-center justify-between gap-4">
            {/* Server Node Name Badge */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="font-bold text-white">node-01.us-east.prod</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">Ubuntu 24.04 LTS</span>
              </div>
            </div>

            {/* Quick Resource Consumption Pills */}
            <div className="flex items-center gap-3">
              {/* CPU Pill */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs">
                <span className="text-slate-400">CPU:</span>
                <span className="text-purple-300 font-bold">18.4%</span>
                <div className="w-12 bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full w-[18.4%]" />
                </div>
              </div>

              {/* RAM Pill */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs">
                <span className="text-slate-400">RAM:</span>
                <span className="text-cyan-300 font-bold">6.4 GB / 32 GB (20%)</span>
                <div className="w-12 bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-cyan-500 h-full w-[20%]" />
                </div>
              </div>

              {/* Theme Toggle (Dark Mode Indicator) */}
              <button
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
                title="Current: Dark Mode"
              >
                <Moon className="w-4 h-4 text-emerald-400" />
              </button>

              {/* Admin User Profile Menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-900 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 text-xs font-mono font-bold">
                    AD
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-300 hidden sm:inline">
                    admin
                  </span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-11 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 z-50 font-mono text-xs space-y-1">
                    <div className="px-3 py-2 border-b border-slate-800">
                      <div className="font-bold text-white">Administrator</div>
                      <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                        <Lock className="w-3 h-3" /> TOTP 2FA Verified
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onNavigate('settings');
                      }}
                      className="w-full text-left px-3 py-1.5 rounded text-slate-300 hover:bg-slate-800"
                    >
                      Account Settings
                    </button>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onNavigate('security');
                      }}
                      className="w-full text-left px-3 py-1.5 rounded text-slate-300 hover:bg-slate-800"
                    >
                      Security Audit Logs
                    </button>
                    <div className="h-px bg-slate-800" />
                    <button
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full text-left px-3 py-1.5 rounded text-rose-400 hover:bg-rose-950/40"
                    >
                      Log Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* View Workspace Content */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
};
