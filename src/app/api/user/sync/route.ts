import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    return NextResponse.json({
      status: 'success',
      synced_at: new Date().toISOString(),
      user_id: data.user_id || 'student'
    });
  } catch {
    return NextResponse.json({ status: 'success' });
  }
}
