import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    let target_pct = data.target_grade_percent !== undefined ? Number(data.target_grade_percent) : undefined;
    if (target_pct === undefined && data.target_cgpa !== undefined) {
      const tc = Number(data.target_cgpa);
      target_pct = tc <= 10.0 ? tc * 10.0 : tc;
    }
    if (target_pct === undefined) {
      target_pct = 85.0;
    }

    let cia_w = data.cia_weight !== undefined ? Number(data.cia_weight) : undefined;
    if (cia_w === undefined && data.cia_weightage !== undefined) {
      const cw = Number(data.cia_weightage);
      cia_w = cw <= 1.0 ? cw * 100.0 : cw;
    }
    if (cia_w === undefined) {
      cia_w = 40.0;
    }

    const endsem_w = data.endsem_weight !== undefined ? Number(data.endsem_weight) : (100.0 - cia_w);
    const cia1 = Number(data.cia1) || 0;
    const cia2 = Number(data.cia2) || 0;
    const cia_avg = (cia1 + cia2) / 2.0;

    let cia_max: number;
    if (data.cia_max !== undefined && Number(data.cia_max) > 0) {
      cia_max = Number(data.cia_max);
    } else {
      const highest = Math.max(cia1, cia2);
      if (highest <= 20.0) cia_max = 20.0;
      else if (highest <= 25.0) cia_max = 25.0;
      else if (highest <= 30.0) cia_max = 30.0;
      else if (highest <= 40.0) cia_max = 40.0;
      else if (highest <= 50.0) cia_max = 50.0;
      else if (highest <= 60.0) cia_max = 60.0;
      else cia_max = highest > 0 ? highest : 50.0;
    }

    const cia_pct = cia_max > 0 ? (cia_avg / cia_max) * 100.0 : 0.0;
    const cia_contribution = (cia_pct * cia_w) / 100.0;
    const needed_contribution = Math.max(0.0, target_pct - cia_contribution);
    const required_endsem_pct = endsem_w > 0 ? (needed_contribution / endsem_w) * 100.0 : 0.0;

    const is_achievable = required_endsem_pct <= 100.0;
    const feasibility = is_achievable ? 'Achievable' : 'Challenging';
    const final_score = Math.round(Math.max(0.0, required_endsem_pct) * 10) / 10;

    return NextResponse.json({
      subject: data.subject_name || 'Course',
      cia_average_percent: Math.round(cia_pct * 10) / 10,
      cia_earned_points: Math.round(cia_contribution * 10) / 10,
      target_grade_percent: target_pct,
      required_endsem_score: final_score,
      target_score_needed: final_score,
      is_achievable,
      feasibility,
      status: feasibility,
      advice: is_achievable
        ? `With an average of ${cia_pct.toFixed(1)}% in CIAs (${cia_contribution.toFixed(1)}/${cia_w.toFixed(0)} pts earned), you need ${final_score.toFixed(1)}% in your End-Sem Exam to secure your target grade.`
        : `Target requires ${final_score.toFixed(1)}% on final exam. Prioritize core scoring topics or extra credits.`
    });
  } catch (error) {
    console.error('CGPA calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate CGPA target' },
      { status: 400 }
    );
  }
}
