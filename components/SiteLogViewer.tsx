'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Terminal,
  Search,
  ArrowDown,
  Pause,
  Play,
  RotateCcw,
  Download,
  Wifi,
  WifiOff,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
} from 'lucide-react';

interface SiteLogViewerProps {
  domain: string;
  initialType?: 'tomcat' | 'python';
}

interface LogMessage {
  id: string;
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system';
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
}

function getInitialLogs(domain: string, initialType: string): LogMessage[] {
  const isTomcat = initialType === 'tomcat' || domain.includes('tomcat') || domain.includes('java');
  const now = new Date().toISOString().substring(11, 23);

  if (isTomcat) {
    return [
      { id: '1', timestamp: now, stream: 'system', level: 'INFO', message: `[1Panel Agent] Handshake with /var/run/docker.sock confirmed` },
      { id: '2', timestamp: now, stream: 'system', level: 'INFO', message: `[panel-network] Container site_tomcat_${domain.replace(/[\.\-]/g, '_')} attached with IP 172.28.0.14` },
      { id: '3', timestamp: now, stream: 'stdout', level: 'INFO', message: `04-Oct-2026 12:00:01.014 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Server version: Apache Tomcat/10.1.28` },
      { id: '4', timestamp: now, stream: 'stdout', level: 'INFO', message: `04-Oct-2026 12:00:01.018 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log JVM Version: 21.0.4+7-LTS (Eclipse Temurin)` },
      { id: '5', timestamp: now, stream: 'stdout', level: 'INFO', message: `04-Oct-2026 12:00:01.022 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log CATALINA_OPTS: -Xms512m -Xmx1536m -XX:+UseG1GC` },
      { id: '6', timestamp: now, stream: 'stdout', level: 'INFO', message: `04-Oct-2026 12:00:02.140 INFO [main] org.apache.coyote.http11.Http11NioProtocol.start Starting ProtocolHandler ["http-nio-8080"]` },
      { id: '7', timestamp: now, stream: 'stdout', level: 'INFO', message: `04-Oct-2026 12:00:02.890 INFO [main] org.apache.catalina.startup.Catalina.start Server startup in [1872] milliseconds` },
      { id: '8', timestamp: now, stream: 'stdout', level: 'INFO', message: `04-Oct-2026 12:00:05.110 INFO [http-nio-8080-exec-1] org.apache.catalina.core.ContainerBase.[Catalina].[localhost].[/] Initializing Spring DispatcherServlet 'dispatcherServlet'` },
      { id: '9', timestamp: now, stream: 'stdout', level: 'WARN', message: `04-Oct-2026 12:00:15.220 WARN [http-nio-8080-exec-2] o.a.c.authenticator.AuthenticatorBase: Session cookie missing SameSite attribute, defaulting to Lax` },
    ];
  } else {
    return [
      { id: '1', timestamp: now, stream: 'system', level: 'INFO', message: `[1Panel Agent] Handshake with /var/run/docker.sock confirmed` },
      { id: '2', timestamp: now, stream: 'system', level: 'INFO', message: `[panel-network] Container site_python_${domain.replace(/[\.\-]/g, '_')} attached with IP 172.28.0.18` },
      { id: '3', timestamp: now, stream: 'stdout', level: 'INFO', message: `[2026-10-04 12:00:01 +0000] [1] [INFO] Starting uvicorn 0.28.0 on CPython 3.12.5` },
      { id: '4', timestamp: now, stream: 'stdout', level: 'INFO', message: `[2026-10-04 12:00:01 +0000] [1] [INFO] Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)` },
      { id: '5', timestamp: now, stream: 'stdout', level: 'INFO', message: `[2026-10-04 12:00:01 +0000] [1] [INFO] Started parent process [1] under unprivileged UID 1001` },
      { id: '6', timestamp: now, stream: 'stdout', level: 'INFO', message: `[2026-10-04 12:00:01 +0000] [7] [INFO] Application startup complete (FastAPI ASGI)` },
      { id: '7', timestamp: now, stream: 'stdout', level: 'INFO', message: `[2026-10-04 12:00:10 +0000] [7] [INFO] 172.28.0.2:48122 - "GET /healthz HTTP/1.1" 200 OK` },
    ];
  }
}

export const SiteLogViewer: React.FC<SiteLogViewerProps> = ({ domain, initialType = 'tomcat' }) => {
  const [logs, setLogs] = useState<LogMessage[]>(() => getInitialLogs(domain, initialType));
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [searchGrep, setSearchGrep] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO'>('ALL');
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Parse log line into structured message
  const parseLogLine = useCallback((raw: string, stream: 'stdout' | 'stderr' | 'system' = 'stdout'): LogMessage => {
    let level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' = 'INFO';
    const upper = raw.toUpperCase();

    if (upper.includes('ERROR') || upper.includes('EXCEPTION') || upper.includes('TRACEBACK') || upper.includes('FATAL') || stream === 'stderr') {
      level = 'ERROR';
    } else if (upper.includes('WARN') || upper.includes('WARNING')) {
      level = 'WARN';
    } else if (upper.includes('DEBUG')) {
      level = 'DEBUG';
    }

    return {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString().substring(11, 23),
      stream,
      level,
      message: raw,
    };
  }, []);

  // Simulated live log ticker over WebSocket hook
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      const samples = [
        `172.28.0.2 - - [04/Oct/2026:${new Date().toISOString()}] "GET /api/v1/health HTTP/1.1" 200 48`,
        `172.28.0.2 - - [04/Oct/2026:${new Date().toISOString()}] "GET /static/app.css HTTP/1.1" 304 0`,
        `Pool connection keepalive ping successful: DB latency 0.8ms`,
        `[METRICS] Active request throughput: 42.1 req/s, heap memory safe at 38%`,
      ];
      const randomLine = samples[Math.floor(Math.random() * samples.length)];
      setLogs(prev => [...prev.slice(-300), parseLogLine(randomLine, 'stdout')]);
    }, 4000);

    return () => clearInterval(interval);
  }, [isPaused, parseLogLine]);

  // Handle auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleDownload = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.stream.toUpperCase()}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domain}_docker.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setLogs([]);
  };

  // Filter logs by level and search grep
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchesLevel = selectedLevel === 'ALL' || l.level === selectedLevel;
      const matchesGrep =
        !searchGrep.trim() ||
        l.message.toLowerCase().includes(searchGrep.toLowerCase()) ||
        l.timestamp.includes(searchGrep);
      return matchesLevel && matchesGrep;
    });
  }, [logs, selectedLevel, searchGrep]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl font-mono text-xs flex flex-col h-[540px]">
      {/* Top Toolbar */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Connection status and domain */}
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-white text-xs">{domain}</span>
          <span className="text-slate-500">|</span>
          <div className="flex items-center gap-1.5 text-[11px]">
            {isConnected ? (
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <Wifi className="w-3.5 h-3.5 text-emerald-400" /> ws://connected
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1 font-semibold">
                <WifiOff className="w-3.5 h-3.5 text-rose-400" /> reconnecting ({reconnectAttempts})...
              </span>
            )}
          </div>
        </div>

        {/* Search grep input */}
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchGrep}
              onChange={e => setSearchGrep(e.target.value)}
              placeholder="grep logs (regex / string)..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Level Filters & Controls */}
        <div className="flex items-center gap-1.5">
          <div className="inline-flex p-0.5 bg-slate-900 border border-slate-800 rounded-lg text-[10px]">
            {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map(lvl => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  selectedLevel === lvl ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isPaused
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title={isPaused ? 'Resume stream' : 'Pause stream'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-1 rounded-lg border text-[11px] flex items-center gap-1 transition-colors ${
              autoScroll
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
            title="Auto-scroll to latest"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Scroll</span>
          </button>

          <button
            onClick={handleClear}
            className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Clear buffer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleDownload}
            className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Download log file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Terminal Output Area */}
      <div
        ref={containerRef}
        className="flex-1 p-4 bg-slate-950 overflow-y-auto space-y-1 select-text leading-relaxed font-mono"
      >
        {filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            No log entries matching &quot;{searchGrep}&quot;. Awaiting live frames from Docker socket.
          </div>
        ) : (
          filteredLogs.map(item => {
            const isError = item.level === 'ERROR';
            const isWarn = item.level === 'WARN';

            return (
              <div key={item.id} className="flex items-start gap-2 text-xs">
                {/* Timestamp */}
                <span className="text-slate-600 select-none text-[10px] shrink-0 mt-0.5">
                  {item.timestamp}
                </span>

                {/* Stream / Level Badge */}
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase shrink-0 ${
                    isError
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : isWarn
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : item.stream === 'system'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {item.level}
                </span>

                {/* Log Line Content with highlighted tokens */}
                <span
                  className={`break-all ${
                    isError
                      ? 'text-rose-300 font-semibold'
                      : isWarn
                      ? 'text-amber-200'
                      : item.stream === 'system'
                      ? 'text-purple-300'
                      : 'text-slate-300'
                  }`}
                >
                  {item.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Bottom Status Indicator Bar */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>Buffer: {filteredLogs.length} lines</span>
          <span>•</span>
          <span>Encoding: UTF-8 (Demuxed stdcopy)</span>
        </div>
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-emerald-400 hover:underline flex items-center gap-1 font-bold"
          >
            <span>Scroll to Bottom</span>
            <ArrowDown className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
