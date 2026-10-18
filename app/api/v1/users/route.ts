import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    users: [
      { id: 'usr-1', username: 'admin', role: 'admin', mfa_enabled: true, created_at: new Date().toISOString() },
      { id: 'usr-2', username: 'developer', role: 'operator', mfa_enabled: true, created_at: new Date().toISOString() },
    ],
  });
}
