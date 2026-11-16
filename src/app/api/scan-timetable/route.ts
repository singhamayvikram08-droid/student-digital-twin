import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const courses = [
      {
        id: 'scanned-1',
        name: 'Design & Analysis of Algorithms',
        conducted: 26,
        attended: 22,
        targetPercent: 75,
        studyHours: 4,
        pastMarks: 84,
        odLeaves: 1,
        prediction: {
          current_percent: 84.6,
          classes_needed_for_target: 0,
          safe_bunks_available: 3
        },
        predictedScore: 86.9
      },
      {
        id: 'scanned-2',
        name: 'Database Management Systems',
        conducted: 28,
        attended: 24,
        targetPercent: 75,
        studyHours: 3,
        pastMarks: 78,
        odLeaves: 0,
        prediction: {
          current_percent: 85.7,
          classes_needed_for_target: 0,
          safe_bunks_available: 4
        },
        predictedScore: 81.4
      },
      {
        id: 'scanned-3',
        name: 'Software Engineering & Agile',
        conducted: 24,
        attended: 18,
        targetPercent: 75,
        studyHours: 3,
        pastMarks: 71,
        odLeaves: 1,
        prediction: {
          current_percent: 75.0,
          classes_needed_for_target: 0,
          safe_bunks_available: 0
        },
        predictedScore: 75.1
      },
      {
        id: 'scanned-4',
        name: 'Machine Learning Fundamentals',
        conducted: 30,
        attended: 25,
        targetPercent: 75,
        studyHours: 5,
        pastMarks: 86,
        odLeaves: 0,
        prediction: {
          current_percent: 83.3,
          classes_needed_for_target: 0,
          safe_bunks_available: 3
        },
        predictedScore: 86.8
      }
    ];

    return NextResponse.json({ status: 'success', courses });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: 'Failed to scan timetable' }, { status: 400 });
  }
}
