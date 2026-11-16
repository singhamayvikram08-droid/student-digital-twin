import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const study_hours = Number(data.study_hours) || 0;
    const past_marks = Number(data.past_marks) || 0;
    const attendance_percent = Number(data.attendance_percent) || 75.0;
    const cia_marks = data.cia_marks !== undefined ? Number(data.cia_marks) : null;
    const end_sem_marks = data.end_sem_marks !== undefined ? Number(data.end_sem_marks) : null;

    if (cia_marks !== null && cia_marks > 0) {
      const cia = Math.min(60.0, Math.max(0.0, cia_marks));
      let end_sem: number;
      if (end_sem_marks !== null && end_sem_marks > 0) {
        end_sem = Math.min(40.0, Math.max(0.0, end_sem_marks));
      } else {
        const projected_rate = Math.min(
          1.0,
          Math.max(
            0.4,
            (cia / 60.0) * 0.65 + (study_hours / 6.0) * 0.2 + (attendance_percent / 100.0) * 0.15
          )
        );
        end_sem = Math.round(projected_rate * 40.0 * 10) / 10;
      }
      const total = Math.round((cia + end_sem) * 10) / 10;
      const needed_for_distinction = Math.max(0.0, Math.round((75.0 - cia) * 10) / 10);
      const needed_for_pass = Math.max(0.0, Math.round((50.0 - cia) * 10) / 10);

      return NextResponse.json({
        predicted_score: total,
        cia_marks: cia,
        cia_total: 60,
        end_sem_marks: end_sem,
        end_sem_total: 40,
        needed_for_distinction: needed_for_distinction <= 40 ? needed_for_distinction : null,
        needed_for_pass: needed_for_pass <= 40 ? needed_for_pass : 0.0,
        insights: `Internal CIA: ${cia}/60. You need ${needed_for_distinction}/40 in End Sem to achieve Distinction (75%).`
      });
    }

    let predicted = (study_hours * 2.5) + (past_marks * 0.6) + (attendance_percent * 0.2);
    predicted = Math.min(100.0, Math.round(predicted * 10) / 10);

    return NextResponse.json({
      predicted_score: predicted,
      insights: 'Consistent study hours and internal marks ensure maximum performance.'
    });
  } catch (error) {
    console.error('Exam score calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate exam score prediction' },
      { status: 400 }
    );
  }
}
