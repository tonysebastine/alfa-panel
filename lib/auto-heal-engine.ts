export type WorkloadHealth = 'healthy' | 'probing' | 'degraded' | 'recovering' | 'unhealthy';

export interface HealthProbeRule {
  path: string; // e.g. /healthz or /
  expectedStatus: number; // 200
  intervalSeconds: number; // default 10s
  timeoutSeconds: number; // default 3s
  failureThreshold: number; // consecutive failures before auto-heal, e.g. 3
  autoRestartEnabled: boolean;
  maxRestartsPerHour: number;
}

export interface AutoHealIncident {
  id: string;
  domain: string;
  runtime: 'tomcat' | 'python';
  triggerReason: string;
  triggerDetail: string;
  actionTaken: string;
  startedAt: string;
  resolvedAt?: string;
  downtimeSeconds: number;
  status: 'mitigating' | 'recovering' | 'resolved' | 'escalated';
  backoffDelayMs: number;
  restartAttempt: number;
  probeResponseCode?: number;
}

export interface WorkloadAutoHealState {
  domain: string;
  runtime: 'tomcat' | 'python';
  health: WorkloadHealth;
  consecutiveFailures: number;
  lastProbeTime: string;
  lastProbeLatencyMs: number;
  restartCount24h: number;
  currentBackoffMs: number;
  rule: HealthProbeRule;
  activeIncidentId: string | null;
}

export const defaultProbeRule: HealthProbeRule = {
  path: '/healthz',
  expectedStatus: 200,
  intervalSeconds: 10,
  timeoutSeconds: 3,
  failureThreshold: 2,
  autoRestartEnabled: true,
  maxRestartsPerHour: 5,
};

export const initialAutoHealStates: Record<string, WorkloadAutoHealState> = {
  'api.production.example.com': {
    domain: 'api.production.example.com',
    runtime: 'tomcat',
    health: 'healthy',
    consecutiveFailures: 0,
    lastProbeTime: new Date(Date.now() - 4000).toISOString(),
    lastProbeLatencyMs: 42,
    restartCount24h: 1,
    currentBackoffMs: 1000,
    rule: { ...defaultProbeRule, path: '/actuator/health' },
    activeIncidentId: null,
  },
  'fastapi.corp.internal': {
    domain: 'fastapi.corp.internal',
    runtime: 'python',
    health: 'healthy',
    consecutiveFailures: 0,
    lastProbeTime: new Date(Date.now() - 2000).toISOString(),
    lastProbeLatencyMs: 18,
    restartCount24h: 2,
    currentBackoffMs: 1000,
    rule: { ...defaultProbeRule, path: '/health' },
    activeIncidentId: null,
  },
  'legacy-crm.internal.net': {
    domain: 'legacy-crm.internal.net',
    runtime: 'tomcat',
    health: 'healthy',
    consecutiveFailures: 0,
    lastProbeTime: new Date(Date.now() - 6000).toISOString(),
    lastProbeLatencyMs: 85,
    restartCount24h: 0,
    currentBackoffMs: 1000,
    rule: { ...defaultProbeRule, intervalSeconds: 15 },
    activeIncidentId: null,
  },
  'ai-pipeline.labs.io': {
    domain: 'ai-pipeline.labs.io',
    runtime: 'python',
    health: 'healthy',
    consecutiveFailures: 0,
    lastProbeTime: new Date(Date.now() - 1000).toISOString(),
    lastProbeLatencyMs: 24,
    restartCount24h: 1,
    currentBackoffMs: 1000,
    rule: { ...defaultProbeRule, path: '/v1/ping' },
    activeIncidentId: null,
  },
};

export const initialIncidentHistory: AutoHealIncident[] = [
  {
    id: 'inc-9021',
    domain: 'fastapi.corp.internal',
    runtime: 'python',
    triggerReason: 'Worker Timeout (SIGKILL)',
    triggerDetail: 'Uvicorn worker process hung for >30s on synchronous database lock; health probe returned HTTP 504 Gateway Timeout.',
    actionTaken: 'Executed docker restart with clean socket unlinking; spawned 4 fresh Uvicorn workers',
    startedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    resolvedAt: new Date(Date.now() - 1000 * 60 * 45 + 2400).toISOString(),
    downtimeSeconds: 2.4,
    status: 'resolved',
    backoffDelayMs: 1000,
    restartAttempt: 1,
    probeResponseCode: 504,
  },
  {
    id: 'inc-8842',
    domain: 'api.production.example.com',
    runtime: 'tomcat',
    triggerReason: 'JVM Heap Exhaustion (OOM)',
    triggerDetail: 'java.lang.OutOfMemoryError: Java heap space during high-throughput report generation; GC overhead limit exceeded.',
    actionTaken: 'Captured automated heap dump diagnostic; recycled JVM container with -XX:+HeapDumpOnOutOfMemoryError',
    startedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    resolvedAt: new Date(Date.now() - 1000 * 60 * 180 + 3800).toISOString(),
    downtimeSeconds: 3.8,
    status: 'resolved',
    backoffDelayMs: 1000,
    restartAttempt: 1,
    probeResponseCode: 500,
  },
];

// Helper to calculate exponential backoff with max ceiling
export function calculateBackoffMs(attempt: number, baseMs = 1000, maxMs = 30000): number {
  const delay = baseMs * Math.pow(2, attempt - 1);
  return Math.min(delay, maxMs);
}

// Resilient storage helper that catches JSON corruption and repairs schema
const STORAGE_KEY_INCIDENTS = 'panel_autoheal_incidents_v1';
const STORAGE_KEY_STATES = 'panel_autoheal_states_v1';

export function loadStoredIncidents(): AutoHealIncident[] {
  if (typeof window === 'undefined') return initialIncidentHistory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_INCIDENTS);
    if (!raw) return initialIncidentHistory;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('AutoHeal incident storage corrupt; auto-healing state to defaults:', err);
  }
  return initialIncidentHistory;
}

export function saveStoredIncidents(incidents: AutoHealIncident[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_INCIDENTS, JSON.stringify(incidents));
  } catch (err) {
    console.warn('Unable to persist auto-heal incidents:', err);
  }
}

export function loadStoredStates(): Record<string, WorkloadAutoHealState> {
  if (typeof window === 'undefined') return initialAutoHealStates;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_STATES);
    if (!raw) return initialAutoHealStates;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return { ...initialAutoHealStates, ...parsed };
    }
  } catch (err) {
    console.warn('AutoHeal states storage corrupt; restoring defaults:', err);
  }
  return initialAutoHealStates;
}

export function saveStoredStates(states: Record<string, WorkloadAutoHealState>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_STATES, JSON.stringify(states));
  } catch (err) {
    console.warn('Unable to persist auto-heal states:', err);
  }
}
