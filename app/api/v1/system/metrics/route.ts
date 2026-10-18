import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    hostname: 'alfa-node-01',
    os: 'linux',
    platform: 'ubuntu',
    kernel_version: '6.5.0-generic',
    uptime_seconds: 345600,
    uptime_human: '4d 0h 0m',
    cpu_percent: 18.5,
    cpu_count: 8,
    memory_percent: 32.4,
    memory_total_mb: 8192,
    memory_used_mb: 2654,
    memory_free_mb: 5538,
    disk_percent: 24.8,
    disk_total_gb: 256.0,
    disk_used_gb: 63.5,
    disk_free_gb: 192.5,
  });
}
