'use client';

import React, { useState } from 'react';
import { defaultSiteConfig, SiteConfigState } from '@/lib/generator-client';
import { DashboardShell, NavigationItem } from '@/components/DashboardShell';
import { SitesManagementView, SiteItem } from '@/components/SitesManagementView';
import { SiteDetailView } from '@/components/SiteDetailView';
import { HostMonitoringPanel } from '@/components/HostMonitoringPanel';
import { HostMetricsOverview } from '@/components/HostMetricsOverview';
import { SiteFileManager } from '@/components/SiteFileManager';
import { SecurityPenTester } from '@/components/SecurityPenTester';
import { AutoHealDashboard } from '@/components/AutoHealDashboard';
import { DatabasesView } from '@/components/DatabasesView';
import SettingsView from '@/components/SettingsView';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ToastProvider';

const fallbackSites: SiteItem[] = [
  {
    id: '1',
    domain: 'api.production.example.com',
    type: 'tomcat',
    runtimeName: 'Tomcat 10.1 / Temurin 21',
    status: 'running',
    ssl: 'active',
    cpuPercent: 14.2,
    cpuLimit: '2.0 cores',
    memoryUsedMB: 482,
    memoryLimitMB: 2048,
    port: 8080,
    containerName: 'site_tomcat_api_production_example_com',
    createdAt: '2 days ago',
  },
  {
    id: '2',
    domain: 'fastapi.corp.internal',
    type: 'python',
    runtimeName: 'Python 3.12 / FastAPI',
    status: 'running',
    ssl: 'active',
    cpuPercent: 6.8,
    cpuLimit: '1.0 cores',
    memoryUsedMB: 194,
    memoryLimitMB: 1024,
    port: 8000,
    containerName: 'site_python_fastapi_corp_internal',
    createdAt: '5 days ago',
  },
  {
    id: '3',
    domain: 'legacy-crm.internal.net',
    type: 'tomcat',
    runtimeName: 'Tomcat 9.0 / OpenJDK 17',
    status: 'running',
    ssl: 'expiring',
    cpuPercent: 32.5,
    cpuLimit: '4.0 cores',
    memoryUsedMB: 1420,
    memoryLimitMB: 4096,
    port: 8082,
    containerName: 'site_tomcat_legacy_crm',
    createdAt: '3 weeks ago',
  },
  {
    id: '4',
    domain: 'ai-pipeline.labs.io',
    type: 'python',
    runtimeName: 'Python 3.11 / PyTorch',
    status: 'running',
    ssl: 'active',
    cpuPercent: 44.1,
    cpuLimit: '4.0 cores',
    memoryUsedMB: 2840,
    memoryLimitMB: 8192,
    port: 8001,
    containerName: 'site_python_ai_pipeline',
    createdAt: '1 day ago',
  },
];

export default function HomePage() {
  const [currentNav, setCurrentNav] = useState<NavigationItem>('sites');
  const [selectedSite, setSelectedSite] = useState<SiteItem | null>(null);
  const [selectedSiteTab, setSelectedSiteTab] = useState<'overview' | 'runtime' | 'env' | 'ssl' | 'logs' | 'files' | 'autoheal'>('overview');
  const [config, setConfig] = useState<SiteConfigState>(defaultSiteConfig);

  const handleOpenDetail = (
    site: SiteItem,
    tab: 'overview' | 'runtime' | 'env' | 'ssl' | 'logs' | 'files' | 'autoheal' = 'overview'
  ) => {
    setSelectedSite(site);
    setSelectedSiteTab(tab);
    setConfig(prev => ({
      ...prev,
      domain: site.domain,
      type: site.type,
      port: site.port,
      cpuLimit: site.cpuLimit.split(' ')[0],
      memoryLimit: `${site.memoryLimitMB}M`,
    }));
  };

  const handleOpenDetailByDomain = (domain: string) => {
    const found = fallbackSites.find(s => s.domain === domain) || {
      id: domain,
      domain,
      type: domain.includes('fastapi') || domain.includes('python') || domain.includes('pipeline') ? 'python' : 'tomcat',
      runtimeName: domain.includes('fastapi') ? 'Python 3.12 / FastAPI' : 'Tomcat 10.1 / Temurin 21',
      status: 'running' as const,
      ssl: 'active' as const,
      cpuPercent: 12.0,
      cpuLimit: '2.0 cores',
      memoryUsedMB: 512,
      memoryLimitMB: 2048,
      port: 8080,
      containerName: `site_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`,
      createdAt: 'Recently',
    };
    handleOpenDetail(found, 'autoheal');
    setCurrentNav('sites');
  };

  const handleOpenTerminal = (site: SiteItem) => {
    handleOpenDetail(site, 'logs');
  };

  const handleOpenFiles = (site: SiteItem) => {
    setSelectedSite(null);
    setConfig(prev => ({
      ...prev,
      domain: site.domain,
      type: site.type,
    }));
    setCurrentNav('files');
  };

  return (
    <ErrorBoundary fallbackTitle="Panel Runtime Exception Intercepted" sectionName="Root Shell">
      <ToastProvider>
        <DashboardShell
          currentNav={currentNav}
          onNavigate={nav => {
            setSelectedSite(null);
            setCurrentNav(nav);
          }}
        >
          {/* 1. Sites View & Detail View */}
          {currentNav === 'sites' && (
            <ErrorBoundary sectionName="Sites Management View">
              {selectedSite ? (
                <SiteDetailView
                  site={selectedSite}
                  initialTab={selectedSiteTab}
                  onBack={() => setSelectedSite(null)}
                />
              ) : (
                <SitesManagementView
                  onSelectSite={handleOpenDetail}
                  onOpenTerminal={handleOpenTerminal}
                  onOpenFiles={handleOpenFiles}
                />
              )}
            </ErrorBoundary>
          )}

          {/* 2. Auto-Healing & Watchdog Control */}
          {currentNav === 'autoheal' && (
            <ErrorBoundary sectionName="Auto-Healing & Watchdog Control">
              <AutoHealDashboard onSelectSite={handleOpenDetailByDomain} />
            </ErrorBoundary>
          )}

          {/* 3. Overview / Host Monitoring with Sparklines & Fail2ban */}
          {currentNav === 'overview' && (
            <ErrorBoundary sectionName="Overview & Host Monitoring">
              <div className="space-y-6">
                <HostMetricsOverview />
                <HostMonitoringPanel />
              </div>
            </ErrorBoundary>
          )}

          {/* 4. Production Databases View (PostgreSQL, MySQL, Redis, MongoDB) */}
          {currentNav === 'databases' && (
            <ErrorBoundary sectionName="Databases View">
              <DatabasesView />
            </ErrorBoundary>
          )}

          {/* 5. Security & Firewall */}
          {currentNav === 'security' && (
            <ErrorBoundary sectionName="Security & Firewall">
              <div className="space-y-6">
                <HostMonitoringPanel />
                <SecurityPenTester />
              </div>
            </ErrorBoundary>
          )}

          {/* 6. Files & Backups (Monaco Editor & Tree) */}
          {currentNav === 'files' && (
            <ErrorBoundary sectionName="Files & Editor">
              <div className="space-y-6">
                <SiteFileManager domain={config.domain} initialType={config.type} />
              </div>
            </ErrorBoundary>
          )}

          {/* 7. Production System Settings (RBAC Users & Audit Logs) */}
          {currentNav === 'settings' && (
            <ErrorBoundary sectionName="System Settings">
              <SettingsView />
            </ErrorBoundary>
          )}
        </DashboardShell>
      </ToastProvider>
    </ErrorBoundary>
  );
}
