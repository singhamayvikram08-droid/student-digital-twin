import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id') || 'student';
  return NextResponse.json({
    user_id: userId,
    attendance_rate: 85.4,
    predicted_cgpa: 8.9,
    status: 'active',
    last_active: new Date().toISOString()
  });
}
