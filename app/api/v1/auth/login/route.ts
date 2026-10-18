import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;

    // For local dev, allow admin or any non-empty username/password
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    return NextResponse.json({
      access_token: 'dev-access-token-' + Date.now(),
      refresh_token: 'dev-refresh-token-' + Date.now(),
      token_type: 'Bearer',
      expires_in: 900,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
