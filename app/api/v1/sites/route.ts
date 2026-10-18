import { NextResponse } from 'next/server';

let mockSites = [
  {
    domain: 'shop.example.com',
    type: 'nodejs',
    port: 3001,
    status: 'running',
    cpuLimit: '1.0 cores',
    memoryLimitMB: 512,
    createdAt: new Date().toISOString(),
  },
  {
    domain: 'api.example.com',
    type: 'python',
    port: 8000,
    status: 'running',
    cpuLimit: '2.0 cores',
    memoryLimitMB: 1024,
    createdAt: new Date().toISOString(),
  },
  {
    domain: 'blog.example.com',
    type: 'static',
    port: 8080,
    status: 'stopped',
    cpuLimit: '0.5 cores',
    memoryLimitMB: 256,
    createdAt: new Date().toISOString(),
  },
];

export async function GET() {
  return NextResponse.json({
    sites: mockSites,
    total: mockSites.length,
  });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const newSite = {
      domain: payload.domain || `site-${Date.now()}.local`,
      type: payload.type || 'static',
      port: Number(payload.port) || 3000 + mockSites.length + 1,
      status: 'running',
      cpuLimit: payload.cpu_limit || '1.0 cores',
      memoryLimitMB: Number(payload.memory_limit_mb) || 512,
      createdAt: new Date().toISOString(),
    };
    mockSites.unshift(newSite);
    return NextResponse.json({ success: true, site: newSite });
  } catch {
    return NextResponse.json({ error: 'Failed to create site' }, { status: 400 });
  }
}
