'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  Save,
  Check,
  RefreshCw,
  Plus,
  Shield,
  Layers,
  Upload,
} from 'lucide-react';

// Dynamically import Monaco Editor to prevent SSR hydration mismatches
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center font-mono text-xs text-slate-500 bg-slate-950">
      Loading Monaco Editor...
    </div>
  ),
});

interface SiteFileManagerProps {
  domain: string;
  initialType?: 'tomcat' | 'python';
}

interface VirtualFile {
  path: string; // e.g. "data/webapps/ROOT/index.jsp"
  name: string;
  language: string;
  content: string;
  sizeBytes: number;
  mode: string; // e.g. "0640" or "0750"
  isDir?: boolean;
}

export const SiteFileManager: React.FC<SiteFileManagerProps> = ({ domain, initialType = 'tomcat' }) => {
  const isTomcat = initialType === 'tomcat' || domain.includes('tomcat') || domain.includes('java');

  // Virtual file system state for the site
  const [files, setFiles] = useState<Record<string, VirtualFile>>(() => {
    if (isTomcat) {
      return {
        'docker-compose.yml': {
          path: 'docker-compose.yml',
          name: 'docker-compose.yml',
          language: 'yaml',
          mode: '0640',
          sizeBytes: 1240,
          content: `services:\n  app:\n    image: \${TOMCAT_IMAGE}\n    container_name: \${CONTAINER_NAME}\n    restart: unless-stopped\n    user: "\${UID}:\${GID}"\n    expose:\n      - "\${APP_PORT}"\n    security_opt:\n      - no-new-privileges:true\n    cap_drop:\n      - ALL\n    cap_add:\n      - NET_BIND_SERVICE\n      - CHOWN\n      - SETUID\n      - SETGID\n    volumes:\n      - ./data/webapps:/usr/local/tomcat/webapps:rw\n      - ./data/conf:/usr/local/tomcat/conf/custom:ro\n      - ./logs:/usr/local/tomcat/logs:rw\n    networks:\n      - panel-network\n\nnetworks:\n  panel-network:\n    external: true\n`,
        },
        '.env': {
          path: '.env',
          name: '.env',
          language: 'ini',
          mode: '0640',
          sizeBytes: 680,
          content: `SITE_DOMAIN=${domain}\nCONTAINER_NAME=site_tomcat_${domain.replace(/[\.\-]/g, '_')}\nAPP_PORT=8080\nCPU_LIMIT=2.0\nRAM_LIMIT=2048M\nTOMCAT_IMAGE=tomcat:10.1-jdk21-temurin-jammy\nJVM_XMS=512m\nJVM_XMX=1536m\nCATALINA_OPTS=-Xms512m -Xmx1536m -XX:+UseG1GC -Dfile.encoding=UTF-8\nUID=1001\nGID=1001\n`,
        },
        'data/webapps/ROOT/index.jsp': {
          path: 'data/webapps/ROOT/index.jsp',
          name: 'index.jsp',
          language: 'html',
          mode: '0644',
          sizeBytes: 890,
          content: `<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>\n<!DOCTYPE html>\n<html>\n<head>\n    <title>Apache Tomcat 10.1 - 1Panel Container</title>\n    <style>\n        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }\n        .card { max-width: 600px; margin: 40px auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155; }\n        .badge { background: #22c55e; color: #000; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 12px; }\n    </style>\n</head>\n<body>\n    <div class="card">\n        <span class="badge">ROOTLESS RUNNING</span>\n        <h2>Tomcat 10.1 (Temurin JRE 21 LTS)</h2>\n        <p>Containerized workload on <code>panel-network</code>.</p>\n    </div>\n</body>\n</html>\n`,
        },
        'data/conf/server.xml': {
          path: 'data/conf/server.xml',
          name: 'server.xml',
          language: 'xml',
          mode: '0644',
          sizeBytes: 420,
          content: `<?xml version="1.0" encoding="UTF-8"?>\n<Server port="-1" shutdown="SHUTDOWN">\n  <Service name="Catalina">\n    <Connector port="8080" protocol="HTTP/1.1" connectionTimeout="20000" redirectPort="8443" />\n    <Engine name="Catalina" defaultHost="localhost">\n      <Host name="localhost" appBase="webapps" unpackWARs="true" autoDeploy="true" />\n    </Engine>\n  </Service>\n</Server>\n`,
        },
      } as Record<string, VirtualFile>;
    } else {
      return {
        'docker-compose.yml': {
          path: 'docker-compose.yml',
          name: 'docker-compose.yml',
          language: 'yaml',
          mode: '0640',
          sizeBytes: 1120,
          content: `services:\n  app:\n    image: \${PYTHON_IMAGE}\n    container_name: \${CONTAINER_NAME}\n    restart: unless-stopped\n    user: "\${UID}:\${GID}"\n    working_dir: /app\n    expose:\n      - "\${APP_PORT}"\n    security_opt:\n      - no-new-privileges:true\n    cap_drop:\n      - ALL\n    cap_add:\n      - NET_BIND_SERVICE\n      - CHOWN\n      - SETUID\n      - SETGID\n    volumes:\n      - ./app:/app:rw\n      - ./logs:/app/logs:rw\n    command: >\n      sh -c "\n        if [ -f requirements.txt ]; then\n          pip install --no-cache-dir --user -r requirements.txt;\n        fi &&\n        exec uvicorn \${APP_ENTRY} --host 0.0.0.0 --port \${APP_PORT} --workers \${WORKERS} --proxy-headers\n      "\n    networks:\n      - panel-network\n\nnetworks:\n  panel-network:\n    external: true\n`,
        },
        '.env': {
          path: '.env',
          name: '.env',
          language: 'ini',
          mode: '0640',
          sizeBytes: 520,
          content: `SITE_DOMAIN=${domain}\nCONTAINER_NAME=site_python_${domain.replace(/[\.\-]/g, '_')}\nAPP_PORT=8000\nCPU_LIMIT=1.5\nRAM_LIMIT=1024M\nPYTHON_IMAGE=python:3.12-slim-bookworm\nAPP_ENTRY=main:app\nWORKERS=4\nUID=1001\nGID=1001\nPYTHONUNBUFFERED=1\n`,
        },
        'app/main.py': {
          path: 'app/main.py',
          name: 'main.py',
          language: 'python',
          mode: '0644',
          sizeBytes: 680,
          content: `"""\n1Panel Python FastAPI Application\nRootless execution under UID 1001.\n"""\nfrom datetime import datetime\n\nasync def app(scope, receive, send):\n    assert scope['type'] == 'http'\n    path = scope.get('path', '/')\n    if path == '/healthz':\n        body = b'{"status": "healthy", "service": "fastapi-1panel"}'\n    else:\n        body = f'{{"status": "running", "timestamp": "{datetime.utcnow().isoformat()}Z"}}'.encode()\n\n    await send({\n        'type': 'http.response.start',\n        'status': 200,\n        'headers': [[b'content-type', b'application/json']],\n    })\n    await send({\n        'type': 'http.response.body',\n        'body': body,\n    })\n`,
        },
        'app/requirements.txt': {
          path: 'app/requirements.txt',
          name: 'requirements.txt',
          language: 'plaintext',
          mode: '0644',
          sizeBytes: 95,
          content: `gunicorn>=21.2.0\nuvicorn[standard]>=0.28.0\npydantic>=2.6.4\nstarlette>=0.36.3\n`,
        },
      } as Record<string, VirtualFile>;
    }
  });

  const [activeFilePath, setActiveFilePath] = useState<string>(
    isTomcat ? 'data/webapps/ROOT/index.jsp' : 'app/main.py'
  );
  const [editorContent, setEditorContent] = useState<string>(
    files[isTomcat ? 'data/webapps/ROOT/index.jsp' : 'app/main.py']?.content || ''
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectFile = (path: string) => {
    setActiveFilePath(path);
    if (files[path]) {
      setEditorContent(files[path].content);
    }
  };

  // Save handler with toast notification
  const handleSaveFile = useCallback(() => {
    setIsSaving(true);
    setFiles(prev => ({
      ...prev,
      [activeFilePath]: {
        ...prev[activeFilePath],
        content: editorContent,
        sizeBytes: new Blob([editorContent]).size,
      },
    }));

    setTimeout(() => {
      setIsSaving(false);
      setToastMessage(`Saved /opt/panel/apps/sites/${domain}/${activeFilePath} (0640 atomic write)`);
      setTimeout(() => setToastMessage(null), 3000);
    }, 300);
  }, [activeFilePath, domain, editorContent]);

  // Global hotkey Ctrl+S / Cmd+S listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveFile]);

  const activeFile = files[activeFilePath] || {
    path: activeFilePath,
    name: activeFilePath.split('/').pop() || '',
    language: 'plaintext',
    mode: '0640',
    sizeBytes: 0,
    content: '',
  };

  const lineCount = editorContent.split('\n').length;
  const charCount = editorContent.length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[640px] font-mono text-xs">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono text-xs rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-white">/opt/panel/apps/sites/{domain}/</span>
          <span className="text-slate-500">|</span>
          <span className="text-[11px] text-emerald-400/90 font-semibold flex items-center gap-1">
            <Shield className="w-3.5 h-3.5" /> Jailed Path Confinement
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveFile}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save (Ctrl+S)</span>
          </button>
        </div>
      </div>

      {/* Split Pane: Tree on Left, Monaco on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Directory Tree Pane */}
        <div className="w-64 bg-slate-950/70 border-r border-slate-800 p-3 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500 px-1 flex items-center justify-between">
              <span>Site Files</span>
              <span>Permissions</span>
            </div>

            <div className="space-y-0.5">
              {Object.values(files).map(file => {
                const isActive = activeFilePath === file.path;
                const isPy = file.name.endsWith('.py');
                const isYml = file.name.endsWith('.yml');
                const isEnv = file.name.startsWith('.env');
                const isXml = file.name.endsWith('.xml');
                const isJsp = file.name.endsWith('.jsp');

                return (
                  <button
                    key={file.path}
                    onClick={() => handleSelectFile(file.path)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isPy ? (
                        <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      ) : isYml ? (
                        <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : isEnv ? (
                        <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{file.path}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 ml-2 shrink-0">{file.mode}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-500 space-y-1">
            <div>Owner: <code>1001:1001 (paneluser)</code></div>
            <div>Directory mode: <code>0750</code></div>
            <div>File mode: <code>0640</code></div>
          </div>
        </div>

        {/* Right Monaco Editor Pane */}
        <div className="flex-1 flex flex-col bg-slate-950">
          {/* File Tab Bar */}
          <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-white">{activeFile.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400">
                {activeFile.language}
              </span>
              <span className="text-[10px] text-slate-500">
                ({activeFile.sizeBytes} bytes)
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              Press <kbd className="px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">Ctrl+S</kbd> to save
            </div>
          </div>

          {/* Monaco Editor Component */}
          <div className="flex-1 relative">
            <MonacoEditor
              height="100%"
              language={activeFile.language}
              value={editorContent}
              onChange={val => setEditorContent(val || '')}
              theme="vs-dark"
              options={{
                fontSize: 12,
                fontFamily: 'var(--font-geist-mono), monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                automaticLayout: true,
                tabSize: 2,
                cursorBlinking: 'smooth',
                renderWhitespace: 'none',
              }}
            />
          </div>

          {/* Editor Status Bar */}
          <div className="px-4 py-1.5 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between font-mono">
            <div className="flex items-center gap-3">
              <span>Lines: {lineCount}</span>
              <span>Characters: {charCount}</span>
              <span>Encoding: UTF-8</span>
            </div>
            <div className="text-emerald-400">
              Safe Sandbox • Atomic Flush Mode
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
