import { NextResponse } from 'next/server';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    success: true,
    id,
    message: `Database ${id} removed successfully`,
  });
}
