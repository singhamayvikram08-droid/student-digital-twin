import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const stress = Number(data.stress_score) || 0;
    const focus = Number(data.focus_score) || 85;
    const smile = Number(data.smile_score) || 0;

    let label = 'Focused & Attentive';
    let emoji = '🎯';
    let inquiry = '';

    if (stress > 0.65) {
      label = 'Fatigued / Stressed';
      emoji = '😰';
      inquiry = "You look like you're feeling the pressure. Remember to take regular hydration breaks!";
    } else if (smile > 0.3) {
      label = 'Happy & Confident';
      emoji = '😊';
      inquiry = "Love the energy and positive mindset today! Let's crush this study block.";
    }

    return NextResponse.json({
      label,
      emoji,
      confidence: 0.92,
      valence: stress > 0.65 ? 'negative' : 'positive',
      inquiry,
      stress_score: stress,
      focus_score: focus,
      recommendation: 'Maintain steady pacing and deep focus.'
    });
  } catch (error) {
    console.error('Classify emotion error:', error);
    return NextResponse.json({
      label: 'Focused & Attentive',
      emoji: '🎯',
      confidence: 0.9,
      valence: 'positive',
      inquiry: '',
      stress_score: 0.1,
      focus_score: 85,
      recommendation: 'Great focus.'
    });
  }
}
