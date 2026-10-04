'use client';

import React, { useState } from 'react';
import { SiteConfigState, generateEnvContent, generateComposeContent, generateProxyConfig, getSiteDir } from '@/lib/generator-client';
import { Copy, Check, FileText, Layers, FolderTree, Terminal, Shield, ArrowUpRight } from 'lucide-react';

interface GeneratedArtifactsViewProps {
  config: SiteConfigState;
}

export const GeneratedArtifactsView: React.FC<GeneratedArtifactsViewProps> = ({ config }) => {
  const [activeTab, setActiveTab] = useState<'compose' | 'env' | 'proxy' | 'tree' | 'cmds'>('compose');
  const [copied, setCopied] = useState<string | null>(null);

  const envContent = generateEnvContent(config);
  const composeContent = generateComposeContent(config);
  const proxyContent = generateProxyConfig(config);
  const siteDir = getSiteDir(config);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const isTomcat = config.type === 'tomcat';

  const verificationCommands = [
    `# 1. Inspect generated site directory and permissions`,
    `ls -la ${siteDir}`,
    ``,
    `# 2. Dry-run validate Compose specification against Docker daemon`,
    `docker compose -f ${siteDir}/docker-compose.yml --env-file ${siteDir}/.env config`,
    ``,
    `# 3. Bring up site stack on isolated bridge panel-network`,
    `docker compose -f ${siteDir}/docker-compose.yml --env-file ${siteDir}/.env up -d`,
    ``,
    `# 4. Audit rootless isolation & dropped Linux capabilities`,
    `docker inspect site_${config.type}_${config.domain.replace(/[\.\-]/g, '_')} --format '{{json .HostConfig.SecurityOpt}}'`,
    `docker inspect site_${config.type}_${config.domain.replace(/[\.\-]/g, '_')} --format 'CapDrop: {{json .HostConfig.CapDrop}} | CapAdd: {{json .HostConfig.CapAdd}}'`,
    `docker inspect site_${config.type}_${config.domain.replace(/[\.\-]/g, '_')} --format 'User: {{.Config.User}}'`,
    ``,
    `# 5. Verify zero host ports bound (must show null/empty host port list)`,
    `docker inspect site_${config.type}_${config.domain.replace(/[\.\-]/g, '_')} --format '{{json .HostConfig.PortBindings}}'`,
    ``,
    `# 6. Test syntax of OpenResty reverse proxy and reload`,
    `docker exec 1panel-openresty nginx -t`,
    `docker exec 1panel-openresty nginx -s reload`,
    ``,
    `# 7. Test end-to-end HTTPS ingress through reverse proxy`,
    `curl -kv -H "Host: ${config.domain}" https://127.0.0.1/`,
  ].join('\n');

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Manifest Tabs Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('compose')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'compose'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            docker-compose.yml
          </button>

          <button
            onClick={() => setActiveTab('env')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'env'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            .env
          </button>

          <button
            onClick={() => setActiveTab('proxy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'proxy'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            openresty/{config.domain}.conf
          </button>

          <button
            onClick={() => setActiveTab('tree')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'tree'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            Directory Tree (0750)
          </button>

          <button
            onClick={() => setActiveTab('cmds')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'cmds'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            CLI Audit Commands
          </button>
        </div>

        <button
          onClick={() => {
            const content = activeTab === 'compose' ? composeContent
              : activeTab === 'env' ? envContent
              : activeTab === 'proxy' ? proxyContent
              : verificationCommands;
            copyToClipboard(content, activeTab);
          }}
          className="flex items-center gap-1 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
        >
          {copied === activeTab ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied === activeTab ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Code / Content Area */}
      <div className="p-4 bg-slate-950 font-mono text-xs overflow-x-auto min-h-[460px] max-h-[580px] overflow-y-auto">
        {activeTab === 'compose' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] text-slate-500 pb-2 border-b border-slate-800/80">
              <span>Path: {siteDir}/docker-compose.yml</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Rootless &amp; CapDrop ENFORCED
              </span>
            </div>
            <pre className="text-emerald-300/90 leading-relaxed">{composeContent}</pre>
          </div>
        )}

        {activeTab === 'env' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] text-slate-500 pb-2 border-b border-slate-800/80">
              <span>Path: {siteDir}/.env</span>
              <span className="text-slate-400">Mode: 0640</span>
            </div>
            <pre className="text-amber-300/90 leading-relaxed">{envContent}</pre>
          </div>
        )}

        {activeTab === 'proxy' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] text-slate-500 pb-2 border-b border-slate-800/80">
              <span>Path: /opt/panel/apps/openresty/conf.d/vhosts/{config.domain}.conf</span>
              <span className="text-cyan-400">Routes to upstream on panel-network</span>
            </div>
            <pre className="text-cyan-300/90 leading-relaxed">{proxyContent}</pre>
          </div>
        )}

        {activeTab === 'tree' && (
          <div className="space-y-4">
            <div className="text-[11px] text-slate-400 pb-2 border-b border-slate-800/80">
              Exact Directory Structure Created on Host by Go Generator:
            </div>
            <div className="space-y-2 text-slate-300 font-mono text-xs">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="text-emerald-400 font-bold">/opt/panel/apps/sites/{config.domain}/ (drwxr-x--- 0750)</div>
                {isTomcat ? (
                  <>
                    <div className="pl-4 text-slate-300">├── data/ (drwxr-x--- 0750)</div>
                    <div className="pl-8 text-amber-300">├── webapps/ (Hot-deploy WAR / ROOT app directory)</div>
                    <div className="pl-8 text-slate-300">└── conf/ (Custom server.xml overrides)</div>
                    <div className="pl-4 text-slate-300">├── logs/ (drwxr-x--- 0750, catalina logs)</div>
                    <div className="pl-4 text-emerald-300">├── docker-compose.yml (-rw-r----- 0640)</div>
                    <div className="pl-4 text-amber-300">└── .env (-rw-r----- 0640)</div>
                  </>
                ) : (
                  <>
                    <div className="pl-4 text-slate-300">├── app/ (drwxr-x--- 0750)</div>
                    <div className="pl-8 text-cyan-300">├── main.py (Starter ASGI/WSGI entrypoint)</div>
                    <div className="pl-8 text-slate-300">└── requirements.txt (Dependencies)</div>
                    <div className="pl-4 text-slate-300">├── logs/ (drwxr-x--- 0750)</div>
                    <div className="pl-4 text-emerald-300">├── docker-compose.yml (-rw-r----- 0640)</div>
                    <div className="pl-4 text-amber-300">└── .env (-rw-r----- 0640)</div>
                  </>
                )}
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="text-cyan-400 font-bold">/opt/panel/apps/openresty/</div>
                <div className="pl-4 text-slate-300">├── conf.d/vhosts/{config.domain}.conf (Ingress Vhost)</div>
                <div className="pl-4 text-slate-300">└── ssl/{config.domain}/ (fullchain.pem, privkey.pem)</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cmds' && (
          <div className="space-y-4">
            <div className="text-[11px] text-slate-400 pb-2 border-b border-slate-800/80">
              Step-by-step verification commands to run on host as root / panel daemon:
            </div>
            <pre className="text-purple-300/90 leading-relaxed">{verificationCommands}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
