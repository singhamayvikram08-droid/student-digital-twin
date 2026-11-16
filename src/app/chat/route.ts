import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const message = (data.message || '').trim();
    const userName = data.user_name || 'Student';
    const subjectName = data.subject_name || 'Academics';
    const attendance = Number(data.attendance_percent) || 0;
    const predictedScore = data.predicted_score !== null && data.predicted_score !== undefined ? Number(data.predicted_score) : null;

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (geminiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
        const prompt = `You are the student's personal AI Digital Twin and academic performance mentor.
Student Name: ${userName}
Subject: ${subjectName}
Current Attendance: ${attendance}%
Predicted Exam Score: ${predictedScore !== null ? predictedScore + '%' : 'N/A'}

Student says: "${message}"

Give a direct, highly practical, empathetic, and encouraging reply in 2-4 sentences. Do not be robotic or preachy.`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 250, temperature: 0.7 }
          }),
          signal: AbortSignal.timeout(8000)
        });

        if (res.ok) {
          const json = await res.json();
          const replyText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) {
            return NextResponse.json({
              response: replyText.trim(),
              reply: replyText.trim(),
              provider: 'gemini-ai'
            });
          }
        }
      } catch (geminiError) {
        console.warn('Gemini API call failed, falling back to local engine:', geminiError);
      }
    } else if (openRouterKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterKey}`,
            'HTTP-Referer': 'https://digital-twin.vercel.app',
            'X-Title': 'Student AI Digital Twin'
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages: [
              {
                role: 'system',
                content: `You are ${userName}'s AI Digital Twin. Subject: ${subjectName}, Attendance: ${attendance}%. Keep replies concise, actionable, and encouraging.`
              },
              { role: 'user', content: message }
            ],
            max_tokens: 250
          }),
          signal: AbortSignal.timeout(8000)
        });

        if (res.ok) {
          const json = await res.json();
          const replyText = json.choices?.[0]?.message?.content;
          if (replyText) {
            return NextResponse.json({
              response: replyText.trim(),
              reply: replyText.trim(),
              provider: 'openrouter'
            });
          }
        }
      } catch (routerError) {
        console.warn('OpenRouter API call failed, falling back:', routerError);
      }
    }

    // High fidelity contextual twin response fallback
    let fallbackText: string;
    const lower = message.toLowerCase();

    if (lower.includes('attendance') || lower.includes('bunk') || lower.includes('class')) {
      if (attendance < 75) {
        fallbackText = `Your attendance in ${subjectName} is currently ${attendance}%, which is below the mandatory 75% threshold. I recommend prioritizing your upcoming sessions to climb back into the safe zone before midterms!`;
      } else {
        fallbackText = `You're sitting solid with ${attendance}% attendance in ${subjectName}. Keep up this consistency and you'll easily preserve your buffer for final exam eligibility.`;
      }
    } else if (lower.includes('exam') || lower.includes('mark') || lower.includes('score') || lower.includes('grade')) {
      fallbackText = `Based on your recent study rhythm and CIAs, your projected score in ${subjectName} is around ${predictedScore ? predictedScore + '%' : '80%'}. Focus on high-weightage modules and 2-hour focused revision intervals to push it even higher.`;
    } else if (lower.includes('stress') || lower.includes('tired') || lower.includes('overwhelm') || lower.includes('sad')) {
      fallbackText = `Engineering school demands a lot of cognitive endurance. Take a quick 10-minute walk, hydrate, and break your current topic into 20-minute sprints. You've navigated tough semesters before and you've got this!`;
    } else {
      fallbackText = `I'm analyzing your academic trajectory for ${subjectName}. With ${attendance}% attendance and regular study sprints, you're on a solid course. What specific topic or schedule item should we tackle next?`;
    }

    return NextResponse.json({
      response: fallbackText,
      reply: fallbackText,
      provider: 'digital_twin_native'
    });
  } catch (error) {
    console.error('Chat endpoint error:', error);
    return NextResponse.json(
      { response: "I'm here with you. Let's keep making progress on your coursework today!", reply: "I'm here with you. Let's keep making progress on your coursework today!", provider: 'fallback' }
    );
  }
}
