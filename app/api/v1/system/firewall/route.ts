import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    rules: [
      { id: 'fw-1', direction: 'inbound', protocol: 'tcp', port: '80', action: 'allow', comment: 'HTTP traffic' },
      { id: 'fw-2', direction: 'inbound', protocol: 'tcp', port: '443', action: 'allow', comment: 'HTTPS traffic' },
      { id: 'fw-3', direction: 'inbound', protocol: 'tcp', port: '22', action: 'allow', comment: 'SSH access' },
    ],
  });
}
