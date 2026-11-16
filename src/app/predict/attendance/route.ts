import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const conducted = Number(data.conducted) || 0;
    const attended = Number(data.attended) || 0;
    const target_percent = Number(data.target_percent) || 75.0;
    const od_leaves = Math.max(0, Number(data.od_leaves) || 0);

    if (conducted === 0) {
      return NextResponse.json({
        needed: 0,
        bunks: 0,
        classes_needed_for_target: 0,
        safe_bunks_available: 0,
        current_percent: 0.0,
        effective_percent: 0.0,
        od_leaves: 0
      });
    }

    const raw_percent = (attended / conducted) * 100;
    const effective_attended = Math.min(conducted, attended + od_leaves);
    const effective_percent = (effective_attended / conducted) * 100;
    const target_decimal = target_percent / 100.0;

    let needed = 0;
    let safe_bunks = 0;

    if (effective_percent < target_percent) {
      needed = Math.ceil((target_decimal * conducted - effective_attended) / (1 - target_decimal));
      needed = Math.max(0, needed);
    } else {
      safe_bunks = Math.floor((effective_attended - target_decimal * conducted) / target_decimal);
      safe_bunks = Math.max(0, safe_bunks);
    }

    return NextResponse.json({
      needed,
      bunks: safe_bunks,
      classes_needed_for_target: needed,
      safe_bunks_available: safe_bunks,
      current_percent: Math.round(raw_percent * 10) / 10,
      effective_percent: Math.round(effective_percent * 10) / 10,
      od_leaves
    });
  } catch (error) {
    console.error('Attendance calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate attendance prediction' },
      { status: 400 }
    );
  }
}
