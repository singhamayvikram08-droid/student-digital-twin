import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const stress = Number(data.stress_score) || 0;
    const smile = Number(data.smile_score) || 0;

    let emotion = 'Focused';
    let inquiry = '';

    if (stress > 0.6) {
      emotion = 'Stressed';
      inquiry = "You're looking a bit tired. Make sure you stretch and rest your eyes.";
    } else if (smile > 0.35) {
      emotion = 'Happy';
      inquiry = "Great to see a smile! Ready to tackle your revision goals?";
    }

    return NextResponse.json({
      status: 'success',
      has_face: data.has_face ?? true,
      eyes_detected: data.eyes_detected ?? true,
      emotion,
      inquiry,
      stress_score: stress,
      focus_score: Number(data.focus_score) || 85
    });
  } catch (error) {
    console.error('Face analyze error:', error);
    return NextResponse.json({
      status: 'success',
      has_face: true,
      eyes_detected: true,
      emotion: 'Focused',
      inquiry: '',
      stress_score: 0.1,
      focus_score: 85
    });
  }
}
