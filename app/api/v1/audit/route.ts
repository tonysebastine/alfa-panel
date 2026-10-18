import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    events: [
      { id: 'aud-1', actor: 'admin', action: 'site.create', target: 'shop.example.com', timestamp: new Date().toISOString(), status: 'success' },
      { id: 'aud-2', actor: 'admin', action: 'auth.login', target: 'session', timestamp: new Date(Date.now() - 3600000).toISOString(), status: 'success' },
    ],
  });
}
