import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const courses = [
      { name: 'Data Structures & Algorithms', credits: 4.0, grade: 'A+', gradePoint: 9.5, category: 'Core Theory' },
      { name: 'Computer Architecture & Org', credits: 4.0, grade: 'A', gradePoint: 9.0, category: 'Core Theory' },
      { name: 'Discrete Mathematics', credits: 3.0, grade: 'A', gradePoint: 8.5, category: 'Mathematics' },
      { name: 'Full-Stack Web Engineering', credits: 3.0, grade: 'O', gradePoint: 10.0, category: 'Practical Lab' },
      { name: 'Operating Systems & Linux', credits: 4.0, grade: 'A', gradePoint: 8.8, category: 'Core Theory' }
    ];

    return NextResponse.json({
      status: 'success',
      courses,
      gpa: 9.12,
      total_credits: 18.0
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: 'Failed to scan transcript' }, { status: 400 });
  }
}
