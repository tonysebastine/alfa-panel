import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    access_token: 'dev-access-token-' + Date.now(),
    refresh_token: 'dev-refresh-token-' + Date.now(),
  });
}
