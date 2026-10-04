'use client';

import React, { useState } from 'react';
import { defaultSiteConfig, SiteConfigState } from '@/lib/generator-client';
import { DashboardShell, NavigationItem } from '@/components/DashboardShell';
import { SitesManagementView, SiteItem } from '@/components/SitesManagementView';
import { SiteDetailView } from '@/components/SiteDetailView';
import { SiteConfigurator } from '@/components/SiteConfigurator';
import { GeneratedArtifactsView } from '@/components/GeneratedArtifactsView';
import { DockerSocketSimulator } from '@/components/DockerSocketSimulator';
import { FileManagerModal } from '@/components/FileManagerModal';
import { HostMonitoringPanel } from '@/components/HostMonitoringPanel';
import { HostMetricsOverview } from '@/components/HostMetricsOverview';
import { SiteLogViewer } from '@/components/SiteLogViewer';
import { SiteFileManager } from '@/components/SiteFileManager';
import { SecurityPenTester } from '@/components/SecurityPenTester';
import { GoCodeExplorer } from '@/components/GoCodeExplorer';
import { ArchitectureDiagram } from '@/components/ArchitectureDiagram';

export default function HomePage() {
  const [currentNav, setCurrentNav] = useState<NavigationItem>('sites');
  const [selectedSite, setSelectedSite] = useState<SiteItem | null>(null);
  const [config, setConfig] = useState<SiteConfigState>(defaultSiteConfig);

  const handleOpenDetail = (site: SiteItem) => {
    setSelectedSite(site);
    // Sync configuration state with selected site
    setConfig(prev => ({
      ...prev,
      domain: site.domain,
      type: site.type,
      port: site.port,
      cpuLimit: site.cpuLimit.split(' ')[0],
      memoryLimit: `${site.memoryLimitMB}M`,
    }));
  };

  const handleOpenTerminal = (site: SiteItem) => {
    setSelectedSite(site);
    setCurrentNav('docker');
  };

  const handleOpenFiles = (site: SiteItem) => {
    setSelectedSite(site);
    setCurrentNav('files');
  };

  return (
    <DashboardShell
      currentNav={currentNav}
      onNavigate={nav => {
        setSelectedSite(null);
        setCurrentNav(nav);
      }}
    >
      {/* 1. Sites View & Detail View */}
      {currentNav === 'sites' && (
        <>
          {selectedSite ? (
            <SiteDetailView site={selectedSite} onBack={() => setSelectedSite(null)} />
          ) : (
            <SitesManagementView
              onSelectSite={handleOpenDetail}
              onOpenTerminal={handleOpenTerminal}
              onOpenFiles={handleOpenFiles}
            />
          )}
        </>
      )}

      {/* 2. Overview / Host Monitoring with Sparklines & Fail2ban */}
      {currentNav === 'overview' && (
        <div className="space-y-6">
          <HostMetricsOverview />
          <HostMonitoringPanel />
        </div>
      )}

      {/* 3. Databases placeholder view */}
      {currentNav === 'databases' && (
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center font-mono space-y-3">
          <div className="text-emerald-400 font-bold text-base">Databases &amp; Caching Services</div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Containerized PostgreSQL, MySQL, and Redis services joined to <code>panel-network</code> with isolated internal volumes.
          </p>
          <div className="p-3 bg-slate-950 rounded-xl inline-block text-xs text-slate-300 border border-slate-800">
            Internal bridge: <code>panel-network</code> (Zero exposed host ports)
          </div>
        </div>
      )}

      {/* 4. Security & Firewall */}
      {currentNav === 'security' && (
        <div className="space-y-6">
          <HostMonitoringPanel />
          <SecurityPenTester />
        </div>
      )}

      {/* 5. Files & Backups (Monaco Editor & Tree) */}
      {currentNav === 'files' && (
        <div className="space-y-6">
          <SiteFileManager domain={config.domain} initialType={config.type} />
        </div>
      )}

      {/* 6. System Settings */}
      {currentNav === 'settings' && (
        <div className="space-y-6">
          <SecurityPenTester />
        </div>
      )}

      {/* 7. Workload & Manifest Generator (Turns 1 & 3) */}
      {currentNav === 'generator' && (
        <div className="space-y-6">
          <SiteConfigurator config={config} onChange={setConfig} />
          <GeneratedArtifactsView config={config} />
        </div>
      )}

      {/* 8. Docker Socket & Logs (Turn 2) */}
      {currentNav === 'docker' && (
        <div className="space-y-6">
          <DockerSocketSimulator config={config} />
        </div>
      )}

      {/* 9. Go Source Code (Turns 1 - 6) */}
      {currentNav === 'code' && (
        <div className="space-y-6">
          <GoCodeExplorer />
        </div>
      )}

      {/* 10. Architecture Blueprint */}
      {currentNav === 'blueprint' && (
        <div className="space-y-6">
          <ArchitectureDiagram />
        </div>
      )}
    </DashboardShell>
  );
}
