'use client';

import React, { useState } from 'react';
import { SiteConfigState, getSiteDir } from '@/lib/generator-client';
import { Folder, File, Upload, Play, Save, Check, AlertTriangle, RefreshCw, FileCode, CheckCircle2 } from 'lucide-react';

interface FileManagerModalProps {
  config: SiteConfigState;
}

export const FileManagerModal: React.FC<FileManagerModalProps> = ({ config }) => {
  const isTomcat = config.type === 'tomcat';
  const siteDir = getSiteDir(config);

  // Simulated filesystem files
  const [selectedFile, setSelectedFile] = useState<string>(
    isTomcat ? 'data/webapps/ROOT/index.jsp' : 'app/main.py'
  );

  const [fileContents, setFileContents] = useState<{ [key: string]: string }>({
    'data/webapps/ROOT/index.jsp': `<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
<head>
    <title>Apache Tomcat 10.1 - 1Panel Container</title>
    <style>
        body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
        .card { max-width: 600px; margin: 40px auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155; }
        .badge { background: #22c55e; color: #000; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 12px; }
        code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }
    </style>
</head>
<body>
    <div class="card">
        <span class="badge">ROOTLESS RUNNING</span>
        <h2>Tomcat 10.1 (Temurin JRE 21)</h2>
        <p>Containerized isolation on <code>panel-network</code>.</p>
        <p>Drop your custom WAR file into <code>./data/webapps/ROOT.war</code> to deploy.</p>
    </div>
</body>
</html>`,
    'data/conf/server.xml': `<?xml version="1.0" encoding="UTF-8"?>
<Server port="-1" shutdown="SHUTDOWN">
  <Service name="Catalina">
    <Connector port="8080" protocol="HTTP/1.1" connectionTimeout="20000" redirectPort="8443" />
    <Engine name="Catalina" defaultHost="localhost">
      <Host name="localhost" appBase="webapps" unpackWARs="true" autoDeploy="true" />
    </Engine>
  </Service>
</Server>`,
    'app/main.py': `"""
1Panel Containerized Python Workload (FastAPI / ASGI)
Running under rootless user UID:1001 on panel-network.
"""
from datetime import datetime

async def app(scope, receive, send):
    assert scope['type'] == 'http'
    path = scope.get('path', '/')
    if path == '/healthz':
        body = b'{"status": "healthy", "service": "fastapi-1panel"}'
    else:
        body = f'{{"status": "running", "timestamp": "{datetime.utcnow().isoformat()}Z"}}'.encode()

    await send({
        'type': 'http.response.start',
        'status': 200,
        'headers': [[b'content-type', b'application/json']],
    })
    await send({
        'type': 'http.response.body',
        'body': body,
    })
`,
    'app/requirements.txt': `gunicorn>=21.2.0
uvicorn[standard]>=0.28.0
pydantic>=2.6.4
starlette>=0.36.3
`,
  });

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [warUploadStatus, setWarUploadStatus] = useState<string | null>(null);
  const [pipInstallStatus, setPipInstallStatus] = useState<{ running: boolean; output: string | null }>({
    running: false,
    output: null,
  });

  const currentContent = fileContents[selectedFile] || '';

  const handleSave = () => {
    setSaveStatus('Saving to ' + selectedFile + '...');
    setTimeout(() => {
      setSaveStatus('Saved atomically with mode 0640');
      setTimeout(() => setSaveStatus(null), 2500);
    }, 400);
  };

  // Turn 5: Simulate WAR upload with ZIP magic bytes check
  const handleSimulateWarUpload = () => {
    setWarUploadStatus('Streaming ROOT.war and verifying magic bytes [0x50, 0x4B, 0x03, 0x04]...');
    setTimeout(() => {
      setWarUploadStatus(
        `SUCCESS: ROOT.war verified as valid ZIP archive (14.2 MB). Streamed to ${siteDir}/data/webapps/ROOT.war. Triggered container restart.`
      );
      setTimeout(() => setWarUploadStatus(null), 6000);
    }, 1000);
  };

  // Turn 5: Simulate Python pip install
  const handleSimulatePipInstall = () => {
    setPipInstallStatus({ running: true, output: null });
    setTimeout(() => {
      setPipInstallStatus({
        running: false,
        output: `[Turn 5 pip install via docker exec]\nCollecting gunicorn>=21.2.0 (from -r requirements.txt)\nCollecting uvicorn[standard]>=0.28.0 (from -r requirements.txt)\nCollecting pydantic>=2.6.4 (from -r requirements.txt)\nInstalling collected packages: gunicorn, uvicorn, pydantic\nSuccessfully installed gunicorn-21.2.0 pydantic-2.6.4 uvicorn-0.28.0\n[Docker Exec Status: Exit code 0]`,
      });
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Turn 5 Operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isTomcat ? (
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-2">
              <Upload className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-mono font-bold text-slate-200">
                Turn 5: Tomcat .WAR Hot Deploy Handler
              </h4>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Accepts multipart .war file, validates ZIP magic bytes (<code>PK\x03\x04</code>), streams to <code>{siteDir}/data/webapps/ROOT.war</code>, and restarts container.
            </p>
            <button
              onClick={handleSimulateWarUpload}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold font-mono text-xs rounded-lg transition-colors shadow-md"
            >
              <Upload className="w-3.5 h-3.5" />
              Simulate Deploy ROOT.war (Magic Bytes Verified)
            </button>
            {warUploadStatus && (
              <div className="mt-2.5 p-2 bg-amber-950/40 border border-amber-800/80 rounded font-mono text-[11px] text-amber-200">
                {warUploadStatus}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-mono font-bold text-slate-200">
                Turn 5: Python Dependency Handler
              </h4>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Invokes <code>docker exec</code> to run <code>pip install --user -r requirements.txt</code> inside the unprivileged container.
            </p>
            <button
              onClick={handleSimulatePipInstall}
              disabled={pipInstallStatus.running}
              className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold font-mono text-xs rounded-lg transition-colors shadow-md disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {pipInstallStatus.running ? 'Installing packages...' : 'Install dependencies (pip install)'}
            </button>
            {pipInstallStatus.output && (
              <div className="mt-2.5 p-2 bg-cyan-950/40 border border-cyan-800/80 rounded font-mono text-[11px] text-cyan-200 whitespace-pre-wrap max-h-32 overflow-y-auto">
                {pipInstallStatus.output}
              </div>
            )}
          </div>
        )}

        {/* Security Isolation Callout */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-mono font-bold text-slate-200">
                Turn 5: Path Traversal Confinement
              </h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every file read/write is guarded by <code>ResolveSafePath()</code> with <code>filepath.Clean</code>. Any relative path attempting to escape <code>{siteDir}</code> (e.g. <code>../../etc/shadow</code>) returns HTTP 403 Forbidden.
            </p>
          </div>
          <div className="text-[11px] font-mono text-emerald-400 mt-2 bg-slate-950 p-2 rounded border border-slate-800">
            Confinement: Strictly jailed inside {siteDir}
          </div>
        </div>
      </div>

      {/* Web-based File Manager & Editor Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-2xl">
        {/* Left Column: File Tree */}
        <div className="md:col-span-1 border-r border-slate-800 pr-3 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-mono font-semibold text-slate-300">File Tree</span>
            <span className="text-[10px] font-mono text-slate-500">0750 / 0640</span>
          </div>

          <div className="space-y-1 font-mono text-xs">
            {isTomcat ? (
              <>
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold py-1">
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>data/webapps/</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile('data/webapps/ROOT/index.jsp')}
                  className={`w-full text-left pl-5 py-1 px-2 rounded flex items-center gap-1.5 transition-colors ${
                    selectedFile === 'data/webapps/ROOT/index.jsp'
                      ? 'bg-amber-500/20 text-amber-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>ROOT/index.jsp</span>
                </button>

                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold py-1 mt-2">
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>data/conf/</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile('data/conf/server.xml')}
                  className={`w-full text-left pl-5 py-1 px-2 rounded flex items-center gap-1.5 transition-colors ${
                    selectedFile === 'data/conf/server.xml'
                      ? 'bg-amber-500/20 text-amber-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <File className="w-3.5 h-3.5" />
                  <span>server.xml</span>
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-semibold py-1">
                  <Folder className="w-3.5 h-3.5 text-cyan-400" />
                  <span>app/</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile('app/main.py')}
                  className={`w-full text-left pl-5 py-1 px-2 rounded flex items-center gap-1.5 transition-colors ${
                    selectedFile === 'app/main.py'
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>main.py</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFile('app/requirements.txt')}
                  className={`w-full text-left pl-5 py-1 px-2 rounded flex items-center gap-1.5 transition-colors ${
                    selectedFile === 'app/requirements.txt'
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <File className="w-3.5 h-3.5" />
                  <span>requirements.txt</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Code Editor */}
        <div className="md:col-span-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono font-bold text-slate-200">
                {selectedFile}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {saveStatus && (
                <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> {saveStatus}
                </span>
              )}
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs rounded transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                Save (Atomic Write)
              </button>
            </div>
          </div>

          <textarea
            value={currentContent}
            onChange={e => {
              const val = e.target.value;
              setFileContents(prev => ({ ...prev, [selectedFile]: val }));
            }}
            rows={14}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed resize-y"
          />
        </div>
      </div>
    </div>
  );
};
