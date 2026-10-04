'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SiteConfigState, getContainerName } from '@/lib/generator-client';
import { Play, RotateCw, Square, RefreshCcw, Activity, ShieldCheck, Terminal, Cpu, HardDrive } from 'lucide-react';

interface DockerSocketSimulatorProps {
  config: SiteConfigState;
}

interface SimulatedLog {
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
}

export const DockerSocketSimulator: React.FC<DockerSocketSimulatorProps> = ({ config }) => {
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deploymentStage, setDeploymentStage] = useState<string>('COMPLETED');
  const [progress, setProgress] = useState<number>(100);
  const [execCmd, setExecCmd] = useState<string>('python3 --version');
  const [execOutput, setExecOutput] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [proxyReloadStatus, setProxyReloadStatus] = useState<{ testing: boolean; result: string | null }>({
    testing: false,
    result: null,
  });

  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerName = getContainerName(config);
  const isTomcat = config.type === 'tomcat';

  // Initial simulated logs generator based on runtime
  const [logs, setLogs] = useState<SimulatedLog[]>(() => {
    const now = new Date();
    const ts = (secOffset: number) => new Date(now.getTime() - (30 - secOffset) * 1000).toISOString();

    if (config.type === 'tomcat') {
      const name = getContainerName(config);
      return [
        { timestamp: ts(1), stream: 'system', text: `[1Panel Engine] Attaching to /var/run/docker.sock for ${name}` },
        { timestamp: ts(2), stream: 'system', text: `[1Panel Engine] Bridge network panel-network verified (ICC enabled, direct host binding disabled)` },
        { timestamp: ts(3), stream: 'stdout', text: `04-Oct-2026 12:00:01.102 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Server version name: Apache Tomcat/10.1.28` },
        { timestamp: ts(4), stream: 'stdout', text: `04-Oct-2026 12:00:01.105 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Server built: Aug 12 2026 14:02:18 UTC` },
        { timestamp: ts(5), stream: 'stdout', text: `04-Oct-2026 12:00:01.109 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log OS Name: Linux (kernel 6.8.0-generic)` },
        { timestamp: ts(6), stream: 'stdout', text: `04-Oct-2026 12:00:01.112 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Java Home: /opt/java/openjdk (Eclipse Temurin JRE 21 LTS)` },
        { timestamp: ts(7), stream: 'stdout', text: `04-Oct-2026 12:00:01.115 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Xms${config.minHeap}` },
        { timestamp: ts(8), stream: 'stdout', text: `04-Oct-2026 12:00:01.118 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: -Xmx${config.maxHeap}` },
        { timestamp: ts(9), stream: 'stdout', text: `04-Oct-2026 12:00:01.120 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Command line argument: ${config.gcAlgo}` },
        { timestamp: ts(12), stream: 'stdout', text: `04-Oct-2026 12:00:02.430 INFO [main] org.apache.coyote.http11.Http11NioProtocol.start Starting ProtocolHandler ["http-nio-8080"]` },
        { timestamp: ts(15), stream: 'stdout', text: `04-Oct-2026 12:00:03.011 INFO [main] org.apache.catalina.startup.Catalina.start Server startup in [1908] milliseconds` },
        { timestamp: ts(20), stream: 'system', text: `[1Panel Prober] Docker API HealthCheck: curl -f http://127.0.0.1:8080/ -> HTTP 200 OK (HEALTHY)` },
      ];
    } else {
      const name = getContainerName(config);
      return [
        { timestamp: ts(1), stream: 'system', text: `[1Panel Engine] Attaching to /var/run/docker.sock for ${name}` },
        { timestamp: ts(2), stream: 'system', text: `[1Panel Engine] Bridge network panel-network verified (ICC enabled, direct host binding disabled)` },
        { timestamp: ts(4), stream: 'stdout', text: `[2026-10-04 12:00:01 +0000] [1] [INFO] Starting ${config.pythonRunner} 21.2.0 on python 3.12` },
        { timestamp: ts(5), stream: 'stdout', text: `[2026-10-04 12:00:01 +0000] [1] [INFO] Listening at: http://0.0.0.0:${config.port}` },
        { timestamp: ts(6), stream: 'stdout', text: `[2026-10-04 12:00:01 +0000] [1] [INFO] Using worker: gthread (workers: ${config.workers}, threads: ${config.threads})` },
        { timestamp: ts(7), stream: 'stdout', text: `[2026-10-04 12:00:01 +0000] [7] [INFO] Booting worker with pid: 7 (User UID 1001 / GID 1001)` },
        { timestamp: ts(8), stream: 'stdout', text: `[2026-10-04 12:00:01 +0000] [8] [INFO] Booting worker with pid: 8 (User UID 1001 / GID 1001)` },
        { timestamp: ts(15), stream: 'stdout', text: `[2026-10-04 12:00:02 +0000] [7] [INFO] Loaded application module: ${config.appModule}` },
        { timestamp: ts(20), stream: 'system', text: `[1Panel Prober] Docker API HealthCheck: GET http://127.0.0.1:${config.port}/healthz -> HTTP 200 OK (HEALTHY)` },
      ];
    }
  });

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Turn 2: Simulate BringUpComposeProject
  const handleStartSite = () => {
    setIsDeploying(true);
    setIsRunning(false);
    setProgress(10);
    setDeploymentStage('INITIALIZING');
    setLogs([]);

    const addLog = (stream: 'stdout' | 'stderr' | 'system', text: string) => {
      setLogs(prev => [...prev, { timestamp: new Date().toISOString(), stream, text }]);
    };

    addLog('system', `[Turn 2 StartSite] Initiating compose stack up for ${config.domain}`);

    setTimeout(() => {
      setProgress(25);
      setDeploymentStage('VERIFYING_NETWORK');
      addLog('system', `[Turn 2 EnsureNetwork] Verified panel-network bridge on /var/run/docker.sock`);
    }, 400);

    setTimeout(() => {
      setProgress(50);
      setDeploymentStage('VALIDATING_CONFIG');
      addLog('system', `[Turn 2] docker compose -f /opt/panel/apps/sites/${config.domain}/docker-compose.yml config --quiet: OK`);
    }, 800);

    setTimeout(() => {
      setProgress(75);
      setDeploymentStage('STARTING_SERVICES');
      addLog('system', `[Turn 2] Executing docker compose up -d (Container: ${containerName})`);
      if (isTomcat) {
        addLog('stdout', `Tomcat 10.1 starting under unprivileged user 1001:1001 with Catalina opts`);
      } else {
        addLog('stdout', `Python runner booting workers (${config.workers}) for entrypoint ${config.appModule}`);
      }
    }, 1300);

    setTimeout(() => {
      setProgress(90);
      setDeploymentStage('PROBING_HEALTH');
      addLog('system', `[Turn 2 GetSiteStatus] Polling Docker Engine inspect: State=running, Health=starting`);
    }, 1800);

    setTimeout(() => {
      setProgress(100);
      setDeploymentStage('COMPLETED');
      setIsDeploying(false);
      setIsRunning(true);
      addLog('system', `[Turn 2 GetSiteStatus] Health check PASSED: Container is HEALTHY (0 failing streak)`);
    }, 2400);
  };

  // Turn 2: Simulate StopSite
  const handleStopSite = () => {
    setIsRunning(false);
    setLogs(prev => [
      ...prev,
      { timestamp: new Date().toISOString(), stream: 'system', text: `[Turn 2 StopSite] Sent SIGTERM (timeout 15s) to ${containerName}` },
      { timestamp: new Date().toISOString(), stream: 'system', text: `[Turn 2 StopSite] Container gracefully terminated and removed from panel-network.` },
    ]);
  };

  // Turn 2: Simulate RestartSite
  const handleRestartSite = () => {
    setLogs(prev => [
      ...prev,
      { timestamp: new Date().toISOString(), stream: 'system', text: `[Turn 2 RestartSite] Triggering container restart via /var/run/docker.sock` },
    ]);
    setTimeout(() => {
      setLogs(prev => [
        ...prev,
        { timestamp: new Date().toISOString(), stream: 'stdout', text: `Service reboot completed. Handshake re-established.` },
      ]);
    }, 600);
  };

  // Turn 2: Simulate ExecInApp
  const handleExecInApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!execCmd.trim()) return;
    setIsExecuting(true);
    setExecOutput(null);

    setTimeout(() => {
      setIsExecuting(false);
      const cmd = execCmd.trim();
      if (cmd.includes('python')) {
        setExecOutput(`Python 3.12.5 (main, Aug 14 2026, 12:45:10) [GCC 12.2.0] on linux`);
      } else if (cmd.includes('java')) {
        setExecOutput(`openjdk version "21.0.4" 2026-07-16 LTS\nOpenJDK Runtime Environment Temurin-21.0.4+7 (build 21.0.4+7)\nOpenJDK 64-Bit Server VM Temurin-21.0.4+7 (build 21.0.4+7, mixed mode, sharing)`);
      } else if (cmd.includes('pip') || cmd.includes('requirements')) {
        setExecOutput(`Package    Version\n---------- -------\ngunicorn   21.2.0\nuvicorn    0.28.0\npydantic   2.6.4\nstarlette  0.36.3`);
      } else if (cmd.includes('id') || cmd.includes('whoami')) {
        setExecOutput(`uid=1001(paneluser) gid=1001(panelgroup) groups=1001(panelgroup)`);
      } else if (cmd.includes('capsh') || cmd.includes('status')) {
        setExecOutput(`Current capabilities: = cap_chown,cap_setgid,cap_setuid,cap_net_bind_service+ep\nDropped capabilities: ALL others`);
      } else {
        setExecOutput(`Command executed successfully inside ${containerName}:\nExit code: 0\n[exec buffer output]: process returned exit code 0 under UID:1001`);
      }
    }, 500);
  };

  // Turn 3: Simulate ReloadProxy
  const handleReloadProxy = () => {
    setProxyReloadStatus({ testing: true, result: null });
    setTimeout(() => {
      setProxyReloadStatus({
        testing: false,
        result: `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful\n[1Panel Proxy] Sent SIGHUP to 1panel-openresty master process (PID 1). Vhost ${config.domain}.conf reloaded gracefully.`,
      });
    }, 700);
  };

  return (
    <div className="space-y-6">
      {/* Real-time Status Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-xs font-mono font-semibold text-slate-300">
                {isRunning ? 'CONTAINER RUNNING & HEALTHY' : 'CONTAINER STOPPED'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 font-mono text-slate-400">
                /var/run/docker.sock
              </span>
            </div>
            <h3 className="text-lg font-bold text-white mt-1 font-mono">{containerName}</h3>
            <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1 mt-1 font-mono">
              <span>Bridge: <strong className="text-emerald-400">panel-network</strong></span>
              <span>Port: <strong className="text-slate-200">{config.port}</strong> (No host bind)</span>
              <span>User: <strong className="text-sky-400">{config.uid}:{config.gid}</strong></span>
              <span>SecurityOpt: <strong className="text-emerald-400">no-new-privileges:true</strong></span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleStartSite}
              disabled={isDeploying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-all shadow-md"
            >
              <Play className="w-3.5 h-3.5" />
              StartSite (docker compose up -d)
            </button>

            <button
              onClick={handleRestartSite}
              disabled={!isRunning || isDeploying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-all"
            >
              <RotateCw className="w-3.5 h-3.5" />
              RestartSite
            </button>

            <button
              onClick={handleStopSite}
              disabled={!isRunning || isDeploying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 disabled:opacity-50 transition-all"
            >
              <Square className="w-3.5 h-3.5" />
              StopSite
            </button>

            <button
              onClick={handleReloadProxy}
              disabled={proxyReloadStatus.testing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800/80 text-cyan-300 disabled:opacity-50 transition-all"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${proxyReloadStatus.testing ? 'animate-spin' : ''}`} />
              ReloadProxy (openresty -s reload)
            </button>
          </div>
        </div>

        {/* Progress Bar during deployment */}
        {isDeploying && (
          <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-emerald-400">Deployment Pipeline: {deploymentStage}</span>
              <span className="text-slate-400">{progress}%</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Telemetry Dials (Turn 2 GetSiteStatus) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-purple-400" />
              CPU Utilization
            </div>
            <div className="text-lg font-bold font-mono text-purple-300 mt-0.5">
              {isRunning ? '12.4%' : '0.0%'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Quota: {config.cpuLimit} cores</div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-cyan-400" />
              RAM Usage
            </div>
            <div className="text-lg font-bold font-mono text-cyan-300 mt-0.5">
              {isRunning ? (isTomcat ? '418 MB' : '162 MB') : '0 MB'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Max: {config.memoryLimit}</div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              Active PIDs
            </div>
            <div className="text-lg font-bold font-mono text-emerald-300 mt-0.5">
              {isRunning ? (isTomcat ? '38 pids' : '9 pids') : '0 pids'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Limit: {config.pidsLimit}</div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-sky-400" />
              Kernel CapDrop
            </div>
            <div className="text-lg font-bold font-mono text-sky-300 mt-0.5">ALL DROPPED</div>
            <div className="text-[10px] text-slate-500 font-mono">Added: 4 minimal caps</div>
          </div>
        </div>
      </div>

      {/* Proxy Reload Output Banner if present */}
      {proxyReloadStatus.result && (
        <div className="bg-cyan-950/40 border border-cyan-800/80 rounded-xl p-4 font-mono text-xs text-cyan-200">
          <div className="font-bold flex items-center gap-1.5 text-cyan-400 mb-1">
            <RefreshCcw className="w-3.5 h-3.5" />
            Turn 3 ReloadProxy Test &amp; SIGHUP Result:
          </div>
          <pre className="whitespace-pre-wrap">{proxyReloadStatus.result}</pre>
        </div>
      )}

      {/* Live Demuxed Log Streamer (Turn 2 StreamLogs) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-mono font-semibold text-slate-200">
              Live Docker Demux Log Streamer (Turn 2 StreamLogs over /var/run/docker.sock)
            </h4>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            Multiplex Header 8-byte Demuxed
          </span>
        </div>

        <div className="p-4 bg-slate-950 font-mono text-xs max-h-[340px] overflow-y-auto space-y-1">
          {logs.map((log, idx) => (
            <div key={idx} className="flex items-start gap-2 leading-relaxed">
              <span className="text-slate-600 select-none text-[10px] mt-0.5">
                {log.timestamp.slice(11, 23)}
              </span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                  log.stream === 'stdout'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : log.stream === 'stderr'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                }`}
              >
                {log.stream}
              </span>
              <span
                className={
                  log.stream === 'stderr'
                    ? 'text-rose-300'
                    : log.stream === 'system'
                    ? 'text-purple-300 font-semibold'
                    : 'text-slate-300'
                }
              >
                {log.text}
              </span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Container Exec Terminal (Turn 2 ExecInApp) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-mono font-semibold text-slate-200">
              Interactive Container Exec (Turn 2 ExecInApp via Docker Exec API)
            </h4>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            user: 1001:1001 (unprivileged)
          </span>
        </div>

        <form onSubmit={handleExecInApp} className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-2 text-xs font-mono text-slate-500">$</span>
            <input
              type="text"
              value={execCmd}
              onChange={e => setExecCmd(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-7 pr-3 py-1.5 text-xs text-cyan-300 font-mono focus:border-cyan-500 focus:outline-none"
              placeholder="e.g. python3 --version, pip list, id, cat /etc/os-release"
            />
          </div>
          <button
            type="submit"
            disabled={isExecuting}
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-mono font-semibold transition-colors disabled:opacity-50"
          >
            {isExecuting ? 'Running...' : 'ExecInApp'}
          </button>
        </form>

        <div className="flex flex-wrap gap-2 text-[11px] font-mono text-slate-400">
          <span>Quick Commands:</span>
          <button
            type="button"
            onClick={() => setExecCmd('id')}
            className="hover:text-cyan-300 underline"
          >
            id (verify UID)
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => setExecCmd(isTomcat ? 'java -version' : 'python3 --version')}
            className="hover:text-cyan-300 underline"
          >
            {isTomcat ? 'java -version' : 'python3 --version'}
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => setExecCmd(isTomcat ? 'ls -la /usr/local/tomcat/webapps' : 'pip list')}
            className="hover:text-cyan-300 underline"
          >
            {isTomcat ? 'ls webapps' : 'pip list'}
          </button>
        </div>

        {execOutput && (
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap">
            {execOutput}
          </div>
        )}
      </div>
    </div>
  );
};
