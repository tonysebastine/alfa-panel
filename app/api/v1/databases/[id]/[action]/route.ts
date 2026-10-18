import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  return NextResponse.json({
    success: true,
    id,
    action,
    timestamp: new Date().toISOString(),
    status: action === 'stop' ? 'stopped' : 'running',
    message: `Database instance ${id} ${action} executed successfully`,
  });
}
