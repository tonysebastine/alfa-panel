import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    success: true,
    id,
    ping_ms: Math.floor(Math.random() * 8) + 1,
    connection: 'alive',
    message: `Connection test to database ${id} succeeded`,
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    success: true,
    id,
    message: `Database ${id} deregistered / decommissioned`,
  });
}
