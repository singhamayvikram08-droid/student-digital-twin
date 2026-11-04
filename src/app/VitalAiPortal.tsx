'use client';

import React, { useState, useMemo } from 'react';
import { API_BASE_URL } from '@/lib/api-config';
import { FacialEmotionTelemetry } from './page';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  ChartData
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export interface VitalAiPortalProps {
  user: {
    fullName?: string;
    user_id?: string;
    authProvider?: string;
  } | null;
  facialTelemetry?: FacialEmotionTelemetry;
  cameraActive?: boolean;
  activeLang?: string;
}

interface BmiCategory {
  category: string;
  min: number;
  max: number;
  color: string;
  badge: string;
  dietAdvice: string;
  exerciseAdvice: string;
}

const BMI_CATEGORIES: BmiCategory[] = [
  {
    category: 'Underweight',
    min: 0,
    max: 18.5,
    color: '#38bdf8',
    badge: 'Underweight',
    dietAdvice: 'Prioritize calorie-dense, wholesome foods (nuts, avocado, whole grains, dairy, clean proteins). Maintain 5-6 structured meals to boost physical stamina without digestive overload.',
    exerciseAdvice: 'Focus on progressive resistance training (hypertrophy) over high-intensity cardio to build lean muscle mass and bone density.'
  },
  {
    category: 'Normal Weight',
    min: 18.5,
    max: 24.9,
    color: '#34d399',
    badge: 'Optimal Vitality',
    dietAdvice: 'Maintain metabolic homeostasis with 50% complex carbs, 30% lean protein, and 20% healthy lipids. Stay hydrated with 2.5L+ clean water for sustained cognitive clarity.',
    exerciseAdvice: 'Balance cardiovascular endurance (3 sessions/week) with strength training (2-3 sessions/week) for optimal neurogenesis and stamina.'
  },
  {
    category: 'Overweight',
    min: 25,
    max: 29.9,
    color: '#fbbf24',
    badge: 'Overweight',
    dietAdvice: 'Incorporate a gentle caloric deficit (-400 kcal) while increasing dietary fiber and lean protein to preserve satiety during intense exam study hours.',
    exerciseAdvice: 'Engage in 150+ minutes of moderate aerobic workouts weekly (brisk walking, cycling, swimming) to accelerate lipid metabolism without joint strain.'
  },
  {
    category: 'Obese',
    min: 30,
    max: 100,
    color: '#f43f5e',
    badge: 'Obesity Zone',
    dietAdvice: 'Eliminate refined sugars and ultra-processed snacks. Shift to whole Mediterranean or low-glycemic meals to stabilize insulin spikes and avoid daytime brain fog.',
    exerciseAdvice: 'Begin with low-impact cardiovascular movements (swimming, water aerobics, seated cycling) to protect knees and lumbar posture.'
  }
];

const HEALTH_TIPS = [
  "Drink 500ml of water right after waking up to rehydrate your brain and kickstart metabolism.",
  "Take a 5-minute movement break every 50 minutes of deep study to prevent postural fatigue.",
  "Prioritize 7-8 hours of sleep before exam days; memory consolidation happens during REM cycles.",
  "Swap high-sugar energy drinks for green tea or electrolytes to prevent afternoon energy crashes.",
  "Incorporate omega-3 rich foods (walnuts, chia seeds, fish) to support neuronal membrane health.",
  "Practice 4-7-8 diaphragmatic breathing when pre-exam anxiety or stress spikes appear."
];

interface HistoryEntry {
  date: string;
  bmi: number;
  fitnessScore: number;
}

export default function VitalAiPortal({
  user,
  facialTelemetry,
  cameraActive = false,
  activeLang = 'en'
}: VitalAiPortalProps) {
  const userKey = user?.user_id || 'guest';
  const storageKey = `digital_twin_vital_ai_${userKey}`;

  // Unit & Input States
  const [unit, setUnit] = useState<'metric' | 'imperial'>(() => {
    if (typeof window === 'undefined') return 'metric';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.unit) return parsed.unit;
      }
    } catch {}
    return 'metric';
  });

  const [heightCm, setHeightCm] = useState(() => {
    if (typeof window === 'undefined') return '175';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.heightCm) return parsed.heightCm;
      }
    } catch {}
    return '175';
  });

  const [heightFt, setHeightFt] = useState(() => {
    if (typeof window === 'undefined') return '5';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.heightFt) return parsed.heightFt;
      }
    } catch {}
    return '5';
  });

  const [heightIn, setHeightIn] = useState(() => {
    if (typeof window === 'undefined') return '9';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.heightIn) return parsed.heightIn;
      }
    } catch {}
    return '9';
  });

  const [weight, setWeight] = useState(() => {
    if (typeof window === 'undefined') return '68';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.weight) return parsed.weight;
      }
    } catch {}
    return '68';
  });

  const [age, setAge] = useState(() => {
    if (typeof window === 'undefined') return '20';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.age) return parsed.age;
      }
    } catch {}
    return '20';
  });

  const [gender, setGender] = useState<'male' | 'female'>(() => {
    if (typeof window === 'undefined') return 'male';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.gender) return parsed.gender;
      }
    } catch {}
    return 'male';
  });

  const [activityLevel, setActivityLevel] = useState<'sedentary' | 'light' | 'moderate' | 'very'>(() => {
    if (typeof window === 'undefined') return 'moderate';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.activityLevel) return parsed.activityLevel;
      }
    } catch {}
    return 'moderate';
  });

  // Calculation Results
  const [calculated, setCalculated] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Boolean(parsed.bmiValue);
      }
    } catch {}
    return false;
  });

  const [bmiValue, setBmiValue] = useState(() => {
    if (typeof window === 'undefined') return 22.2;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.bmiValue) return parsed.bmiValue;
      }
    } catch {}
    return 22.2;
  });

  const [activeCategory, setActiveCategory] = useState<BmiCategory>(() => {
    let b = 22.2;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.bmiValue) b = parsed.bmiValue;
        }
      } catch {}
    }
    return BMI_CATEGORIES.find(c => b >= c.min && b < c.max) || BMI_CATEGORIES[1];
  });

  const [bodyFatValue, setBodyFatValue] = useState(() => {
    if (typeof window === 'undefined') return 16.5;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.bodyFatValue) return parsed.bodyFatValue;
      }
    } catch {}
    return 16.5;
  });

  const [fitnessScore, setFitnessScore] = useState(() => {
    if (typeof window === 'undefined') return 88;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.fitnessScore) return parsed.fitnessScore;
      }
    } catch {}
    return 88;
  });

  const [dailyCalories, setDailyCalories] = useState(() => {
    if (typeof window === 'undefined') return 2450;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.dailyCalories) return parsed.dailyCalories;
      }
    } catch {}
    return 2450;
  });

  // AI & Interactive States
  const [aiAdviceText, setAiAdviceText] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [tipIndex, setTipIndex] = useState(0);

  // History State
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.history && Array.isArray(parsed.history)) return parsed.history;
        }
      } catch {}
    }
    return [
      { date: 'Oct 8', bmi: 22.8, fitnessScore: 84 },
      { date: 'Oct 10', bmi: 22.5, fitnessScore: 86 },
      { date: 'Oct 12', bmi: 22.2, fitnessScore: 88 }
    ];
  });

  // Audio synthesizer beep
  const playChime = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Win = window as any;
      const AudioCtx = Win.AudioContext || Win.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // AudioContext fallback
    }
  };

  // Compute Metrics Logic
  const handleCalculate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    let hMeters = 0;
    let wKg = parseFloat(weight) || 0;

    if (unit === 'metric') {
      const cm = parseFloat(heightCm) || 0;
      hMeters = cm / 100;
    } else {
      const ft = parseFloat(heightFt) || 0;
      const inch = parseFloat(heightIn) || 0;
      hMeters = (ft * 12 + inch) * 0.0254;
      wKg = wKg * 0.453592;
    }

    if (!hMeters || !wKg || hMeters <= 0 || wKg <= 0) {
      showToast('Please enter valid height and weight values.');
      return;
    }

    const ageNum = parseInt(age) || 20;
    const computedBmi = Math.round((wKg / (hMeters * hMeters)) * 10) / 10;

    // Deurenberg Body Fat Formula: BF% = (1.20 * BMI) + (0.23 * Age) - (16.2 if male, 5.4 if female)
    const bf = (1.20 * computedBmi) + (0.23 * ageNum) - (gender === 'male' ? 16.2 : 5.4);
    const clampedBf = Math.max(5, Math.min(50, Math.round(bf * 10) / 10));

    // Base Fitness Score
    const bmiDeviation = Math.abs(computedBmi - 22);
    const bmiScore = Math.max(0, 100 - bmiDeviation * 4);
    const idealBf = gender === 'male' ? 15 : 22;
    const bfScore = Math.max(0, 100 - Math.abs(clampedBf - idealBf) * 3);

    // If live biometric telemetry exists, factor in mental stamina
    let biometricBonus = 0;
    if (facialTelemetry && facialTelemetry.hasFace) {
      const mentalFocusRatio = (facialTelemetry.focusScore || 50) / 100;
      const stressPenalty = (facialTelemetry.stressScore || 0) / 100;
      biometricBonus = (mentalFocusRatio * 10) - (stressPenalty * 10);
    }

    const finalFitness = Math.round(
      Math.max(10, Math.min(100, (bmiScore * 0.4) + (bfScore * 0.5) + (biometricBonus + 10)))
    );

    // Mifflin-St Jeor BMR Formula
    let bmr = (10 * wKg) + (6.25 * (hMeters * 100)) - (5 * ageNum);
    bmr += (gender === 'male' ? 5 : -161);

    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      very: 1.725
    };
    const tdee = Math.round(bmr * activityMultipliers[activityLevel]);

    const category = BMI_CATEGORIES.find(c => computedBmi >= c.min && computedBmi < c.max) || BMI_CATEGORIES[3];

    setBmiValue(computedBmi);
    setActiveCategory(category);
    setBodyFatValue(clampedBf);
    setFitnessScore(finalFitness);
    setDailyCalories(tdee);
    setCalculated(true);
    setTipIndex((tipIndex + 1) % HEALTH_TIPS.length);
    playChime();

    // Save to history
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const newEntry: HistoryEntry = { date: dateStr, bmi: computedBmi, fitnessScore: finalFitness };
    const updatedHistory = [...history];
    if (updatedHistory.length > 0 && updatedHistory[updatedHistory.length - 1].date === dateStr) {
      updatedHistory[updatedHistory.length - 1] = newEntry;
    } else {
      updatedHistory.push(newEntry);
    }
    setHistory(updatedHistory);

    // Persist to storage
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        unit,
        heightCm,
        heightFt,
        heightIn,
        weight,
        age,
        gender,
        activityLevel,
        bmiValue: computedBmi,
        bodyFatValue: clampedBf,
        fitnessScore: finalFitness,
        dailyCalories: tdee,
        history: updatedHistory
      }));
    } catch {
      // Storage fallback
    }

    // Trigger AI Advice Generation
    generateAiHealthPlan(computedBmi, category, tdee, clampedBf, ageNum, gender, finalFitness);
  };

  // AI Personalized Health Plan Generator
  const generateAiHealthPlan = async (
    bmi: number,
    cat: BmiCategory,
    cals: number,
    bf: number,
    ageNum: number,
    gen: string,
    fit: number
  ) => {
    setIsGeneratingAi(true);
    setAiAdviceText('');

    const studentName = user?.fullName || 'Student';
    const focusMetric = facialTelemetry?.hasFace ? `Live Facial Focus: ${facialTelemetry.focusScore}%, Stress: ${facialTelemetry.stressScore}%` : 'Standard study mode';

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `VitalAI Biomarker Consultation: Student ${studentName}, Age ${ageNum}, Gender ${gen}, BMI ${bmi} (${cat.category}), Body Fat ${bf}%, Target Calories ${cals} kcal, Vitality Index ${fit}/100. Telemetry: ${focusMetric}. Provide a concise 2-paragraph personalized student physical vitality and cognitive stamina plan.`,
          user_name: studentName,
          context: 'chat',
          subject: 'Health & Wellness',
          language: activeLang
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.reply) {
          setAiAdviceText(data.reply);
          setIsGeneratingAi(false);
          return;
        }
      }
    } catch {
      // Fallback to intelligent local advisor
    }

    // High-quality local advice fallback
    const localAdvice = `For your ${cat.category} profile and daily energy demand of ${cals} kcal, maintain a balanced nutrient split prioritizing sustained cerebral glucose and steady muscle recovery. During long study stretches, avoid heavy simple sugars that trigger sluggish insulin spikes; instead, favor slow-digesting oats, berries, eggs, and nuts.\n\nTo elevate your Vitality Score (${fit}/100), pair ${cat.exerciseAdvice.toLowerCase()} with proper circadian hygiene. Ensure you hydrate with at least 500ml of water before every lecture and take 3-minute physical decompression walks between revision sessions to optimize blood flow to the prefrontal cortex.`;
    setAiAdviceText(localAdvice);
    setIsGeneratingAi(false);
  };

  // Voice Input Logic
  const handleVoiceInput = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Win = window as any;
    const SpeechRecognition = Win.SpeechRecognition || Win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast('Voice Recognition is not supported by your current browser.');
      return;
    }

    if (isListeningVoice) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US';
      recognition.interimResults = false;

      setIsListeningVoice(true);
      showToast('Listening... Speak your weight and height (e.g., "Weight 70 height 175")');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        setIsListeningVoice(false);
        const speech = event.results[0][0].transcript.toLowerCase();

        const weightMatch = speech.match(/weight\s*(?:is|at|of)?\s*(\d+(?:\.\d+)?)/);
        if (weightMatch) {
          setWeight(weightMatch[1]);
        }

        const heightMatch = speech.match(/height\s*(?:is|at|of)?\s*(\d+(?:\.\d+)?)/);
        if (heightMatch) {
          if (unit === 'metric') {
            setHeightCm(heightMatch[1]);
          } else {
            setHeightFt(heightMatch[1]);
          }
        }

        if (weightMatch || heightMatch) {
          showToast(`Voice parsed: ${weightMatch ? `Weight: ${weightMatch[1]} ` : ''}${heightMatch ? `Height: ${heightMatch[1]}` : ''}`);
        } else {
          showToast(`Heard: "${speech}". Try saying: "Weight 68 height 175"`);
        }
      };

      recognition.onerror = () => {
        setIsListeningVoice(false);
        showToast('Voice recognition canceled or timed out.');
      };

      recognition.onend = () => {
        setIsListeningVoice(false);
      };

      recognition.start();
    } catch {
      setIsListeningVoice(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleReset = () => {
    setHeightCm('175');
    setHeightFt('5');
    setHeightIn('9');
    setWeight('68');
    setAge('20');
    setGender('male');
    setActivityLevel('moderate');
    setCalculated(false);
    setAiAdviceText('');
    showToast('Reset form inputs to standard defaults.');
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all historical VitalAI biometric logs?')) {
      setHistory([]);
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.history = [];
          localStorage.setItem(storageKey, JSON.stringify(parsed));
        }
      } catch {
        // Fallback
      }
      showToast('Biometric history cleared.');
    }
  };

  // SVG Gauge calculations
  const gaugePercent = useMemo(() => {
    const minBmi = 15;
    const maxBmi = 40;
    const pct = (bmiValue - minBmi) / (maxBmi - minBmi);
    return Math.max(0, Math.min(1, pct));
  }, [bmiValue]);

  const gaugeStrokeDashoffset = useMemo(() => {
    const totalLength = 125.6;
    return totalLength - (totalLength * gaugePercent);
  }, [gaugePercent]);

  // Chart Data Configuration
  const chartData: ChartData<'line'> = useMemo(() => {
    const labels = history.length > 0 ? history.map(h => h.date) : ['Initial'];
    const bmiData = history.length > 0 ? history.map(h => h.bmi) : [22.2];
    const fitnessData = history.length > 0 ? history.map(h => h.fitnessScore) : [88];

    return {
      labels,
      datasets: [
        {
          label: 'BMI Trend',
          data: bmiData,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#8b5cf6',
          yAxisID: 'y'
        },
        {
          label: 'Vitality Index',
          data: fitnessData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          fill: false,
          tension: 0.35,
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 3,
          pointBackgroundColor: '#10b981',
          yAxisID: 'y1'
        }
      ]
    };
  }, [history]);

  const chartOptions: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#94a3b8',
          font: { size: 11, weight: 600 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#ffffff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 10
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 11 } }
      },
      y: {
        position: 'left',
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#c4b5fd', font: { size: 11 } },
        title: { display: true, text: 'BMI', color: '#c4b5fd', font: { size: 11, weight: 600 } }
      },
      y1: {
        position: 'right',
        min: 0,
        max: 100,
        grid: { display: false },
        ticks: { color: '#6ee7b7', font: { size: 11 } },
        title: { display: true, text: 'Vitality Score', color: '#6ee7b7', font: { size: 11, weight: 600 } }
      }
    }
  }), []);

  return (
    <div className="vital-ai-portal" role="region" aria-label="VitalAI Health & Biomarkers Portal">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(139, 92, 246, 0.4)',
            color: '#ffffff',
            padding: '10px 22px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            zIndex: 9999,
            fontSize: '0.88rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem'
          }}
        >
          <i className="fa-solid fa-bell" style={{ color: '#c4b5fd' }}></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Header */}
      <section className="vital-hero-header">
        <div className="vital-hero-title-area">
          <div className="vital-hero-icon">
            <i className="fa-solid fa-dna"></i>
          </div>
          <div>
            <h2>
              <span>VitalAI</span>
              <span style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 600 }}>Biomarkers & Health</span>
            </h2>
            <p>
              Synchronizing student metabolic wellness, clinical body composition analytics, and real-time biometric telemetry for peak cognitive & academic performance.
            </p>
          </div>
        </div>

        <div className="vital-hero-actions">
          <div className="vital-badge-pill">
            <span className="vital-live-dot"></span>
            <span>Clinical Biomarkers Online</span>
          </div>
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="vital-btn-standalone"
            title="Open Dedicated Full-Screen VitalAI Dashboard"
          >
            <i className="fa-solid fa-arrow-up-right-from-square"></i>
            <span>Standalone App</span>
          </a>
        </div>
      </section>

      {/* Real-Time Facial Telemetry Link Banner */}
      <section className="vital-telemetry-card">
        <div className="vital-telemetry-info">
          <i
            className="fa-solid fa-camera"
            style={{ color: cameraActive ? '#10b981' : '#64748b', fontSize: '1.25rem' }}
          ></i>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
              {cameraActive && facialTelemetry?.hasFace
                ? 'Camera Mesh Synced: Real-Time Neuro-Physical Engagement'
                : 'Cognitive Biometric Telemetry (Camera Standby)'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              {cameraActive && facialTelemetry?.hasFace
                ? `Facial telemetry actively modulating student physical stamina algorithms.`
                : `Enable camera on the Attendance Portal to correlate live fatigue/stress with metabolic performance.`}
            </div>
          </div>
        </div>

        <div className="vital-telemetry-chips">
          {cameraActive && facialTelemetry?.hasFace ? (
            <>
              <div className="vital-chip focus">
                <i className="fa-solid fa-crosshairs"></i>
                <span>Focus: {facialTelemetry.focusScore}%</span>
              </div>
              <div className="vital-chip stress">
                <i className="fa-solid fa-heart-pulse"></i>
                <span>Stress: {facialTelemetry.stressScore}%</span>
              </div>
              <div className="vital-chip calm">
                <span>{facialTelemetry.emoji}</span>
                <span>{facialTelemetry.label}</span>
              </div>
            </>
          ) : (
            <div className="vital-chip" style={{ color: '#94a3b8' }}>
              <i className="fa-solid fa-shield-halved"></i>
              <span>Telemetry Ready (Privacy Preserved)</span>
            </div>
          )}
        </div>
      </section>

      {/* Main Grid: Form Inputs (Left) and Results / Analytics (Right) */}
      <div className="vital-grid">
        {/* Left Column: Calculator Controls */}
        <div className="vital-card">
          <div className="vital-card-header">
            <h3>
              <i className="fa-solid fa-calculator" style={{ color: '#8b5cf6' }}></i>
              <span>Biomarker Parameters</span>
            </h3>
            <div className="vital-unit-toggle">
              <button
                type="button"
                className={`vital-unit-btn ${unit === 'metric' ? 'active' : ''}`}
                onClick={() => setUnit('metric')}
              >
                Metric
              </button>
              <button
                type="button"
                className={`vital-unit-btn ${unit === 'imperial' ? 'active' : ''}`}
                onClick={() => setUnit('imperial')}
              >
                Imperial
              </button>
            </div>
          </div>

          <form className="vital-form" onSubmit={handleCalculate}>
            {/* Height Input */}
            {unit === 'metric' ? (
              <div className="vital-form-group">
                <label htmlFor="vital-height-cm">
                  <i className="fa-solid fa-ruler-vertical"></i> Height
                </label>
                <div className="vital-input-wrapper">
                  <input
                    id="vital-height-cm"
                    type="number"
                    min="80"
                    max="260"
                    step="0.5"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    required
                  />
                  <span className="vital-unit-tag">cm</span>
                </div>
              </div>
            ) : (
              <div className="vital-form-row">
                <div className="vital-form-group">
                  <label htmlFor="vital-height-ft">Feet</label>
                  <div className="vital-input-wrapper">
                    <input
                      id="vital-height-ft"
                      type="number"
                      min="3"
                      max="8"
                      value={heightFt}
                      onChange={(e) => setHeightFt(e.target.value)}
                      required
                    />
                    <span className="vital-unit-tag">ft</span>
                  </div>
                </div>
                <div className="vital-form-group">
                  <label htmlFor="vital-height-in">Inches</label>
                  <div className="vital-input-wrapper">
                    <input
                      id="vital-height-in"
                      type="number"
                      min="0"
                      max="11"
                      value={heightIn}
                      onChange={(e) => setHeightIn(e.target.value)}
                      required
                    />
                    <span className="vital-unit-tag">in</span>
                  </div>
                </div>
              </div>
            )}

            {/* Weight Input */}
            <div className="vital-form-group">
              <label htmlFor="vital-weight">
                <i className="fa-solid fa-weight-scale"></i> Weight
              </label>
              <div className="vital-input-wrapper">
                <input
                  id="vital-weight"
                  type="number"
                  min="20"
                  max="300"
                  step="0.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  required
                />
                <span className="vital-unit-tag">{unit === 'metric' ? 'kg' : 'lbs'}</span>
              </div>
            </div>

            {/* Age & Gender */}
            <div className="vital-form-row">
              <div className="vital-form-group">
                <label htmlFor="vital-age">
                  <i className="fa-solid fa-calendar-days"></i> Age
                </label>
                <div className="vital-input-wrapper">
                  <input
                    id="vital-age"
                    type="number"
                    min="14"
                    max="100"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    required
                  />
                  <span className="vital-unit-tag">yrs</span>
                </div>
              </div>

              <div className="vital-form-group">
                <label>Gender</label>
                <div className="vital-gender-pills">
                  <label className={`vital-gender-label ${gender === 'male' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="vital-gender"
                      value="male"
                      checked={gender === 'male'}
                      onChange={() => setGender('male')}
                    />
                    <i className="fa-solid fa-mars"></i>
                    <span>Male</span>
                  </label>
                  <label className={`vital-gender-label ${gender === 'female' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="vital-gender"
                      value="female"
                      checked={gender === 'female'}
                      onChange={() => setGender('female')}
                    />
                    <i className="fa-solid fa-venus"></i>
                    <span>Female</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Activity Level */}
            <div className="vital-form-group">
              <label htmlFor="vital-activity">
                <i className="fa-solid fa-person-running"></i> Daily Activity Level
              </label>
              <div className="vital-input-wrapper">
                <select
                  id="vital-activity"
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value as 'sedentary' | 'light' | 'moderate' | 'very')}
                >
                  <option value="sedentary">Sedentary (Desk / Lecture Sessions)</option>
                  <option value="light">Lightly Active (Walking across Campus)</option>
                  <option value="moderate">Moderately Active (Gym / Sports 3x/wk)</option>
                  <option value="very">Very Active (Heavy Athletics & Fitness)</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="vital-form-actions">
              <button
                type="button"
                className={`vital-mic-btn ${isListeningVoice ? 'active' : ''}`}
                title="Voice Input (Speech Dictation)"
                onClick={handleVoiceInput}
              >
                <i className={`fa-solid ${isListeningVoice ? 'fa-microphone-lines' : 'fa-microphone'}`}></i>
              </button>
              <button
                type="button"
                className="vital-btn-reset"
                onClick={handleReset}
              >
                Reset
              </button>
              <button
                type="submit"
                className="vital-btn-calculate"
              >
                <i className="fa-solid fa-bolt"></i>
                <span>Calculate Biomarkers</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Dynamic Results, Gauges & AI Health Plan */}
        <div className="vital-results-column">
          {/* Top Metrics Strip */}
          <div className="vital-metrics-strip">
            {/* Body Fat Estimation */}
            <div className="vital-metric-card">
              <div className="vital-metric-card-header">
                <h4>Body Fat Est.</h4>
                <i className="fa-solid fa-percentage" style={{ color: '#38bdf8' }}></i>
              </div>
              <h3 className="vital-metric-card-val" style={{ color: '#38bdf8' }}>
                {calculated ? `${bodyFatValue}%` : '--%'}
              </h3>
              <div className="vital-progress-bar">
                <div
                  className="vital-progress-fill"
                  style={{ width: `${Math.min(100, (bodyFatValue / 40) * 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Vitality & Fitness Score */}
            <div className="vital-metric-card">
              <div className="vital-metric-card-header">
                <h4>Vitality Index</h4>
                <i className="fa-solid fa-shield-heart" style={{ color: '#10b981' }}></i>
              </div>
              <div className="vital-circular-score-wrapper">
                <svg viewBox="0 0 36 36" className="vital-circular-chart">
                  <path
                    className="vital-circle-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="vital-circle-fill"
                    stroke={fitnessScore > 80 ? '#10b981' : fitnessScore > 65 ? '#fbbf24' : '#ef4444'}
                    strokeDasharray={`${calculated ? fitnessScore : 0}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <text x="18" y="20.35" className="vital-circle-text">
                    {calculated ? fitnessScore : 0}
                  </text>
                </svg>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{calculated ? `${fitnessScore}/100` : '--'}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Physical & Neural Rating</div>
                </div>
              </div>
            </div>

            {/* Daily Tip */}
            <div className="vital-metric-card">
              <div className="vital-metric-card-header">
                <h4>Student Wellness Tip</h4>
                <i className="fa-solid fa-lightbulb" style={{ color: '#fbbf24' }}></i>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
                {HEALTH_TIPS[tipIndex]}
              </p>
            </div>
          </div>

          {/* BMI Gauge Card */}
          <div className="vital-card">
            <div className="vital-card-header">
              <h3>
                <i className="fa-solid fa-gauge-high" style={{ color: activeCategory.color }}></i>
                <span>Metabolic BMI Gauge</span>
              </h3>
              <div
                className="vital-status-pill"
                style={{
                  background: `${activeCategory.color}20`,
                  color: activeCategory.color,
                  border: `1px solid ${activeCategory.color}45`
                }}
              >
                <i className="fa-solid fa-circle-dot" style={{ fontSize: '0.65rem' }}></i>
                <span>{calculated ? activeCategory.badge : 'Standby'}</span>
              </div>
            </div>

            <div className="vital-gauge-layout">
              <div className="vital-gauge-svg-container">
                <svg viewBox="0 0 100 50" className="vital-gauge-svg">
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke={activeCategory.color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray="125.6"
                    strokeDashoffset={calculated ? gaugeStrokeDashoffset : 125.6}
                    style={{
                      transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      filter: `drop-shadow(0 0 8px ${activeCategory.color})`
                    }}
                  />
                </svg>
                <div className="vital-gauge-center-text">
                  <h2 style={{ color: activeCategory.color }}>
                    {calculated ? bmiValue.toFixed(1) : '--'}
                  </h2>
                  <p>Body Mass Index</p>
                </div>
              </div>

              {/* Linear Scale Marker */}
              <div style={{ width: '100%', maxWidth: '480px' }}>
                <div className="vital-linear-track">
                  <div
                    className="vital-linear-marker"
                    style={{ left: `${gaugePercent * 100}%` }}
                  ></div>
                </div>
                <div className="vital-linear-labels">
                  <span>15 (Under)</span>
                  <span>18.5 (Normal)</span>
                  <span>25 (Over)</span>
                  <span>30 (Obese)</span>
                  <span>40</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Personalized Student Health & Nutrition Plan */}
          <div className="vital-advisor-card">
            <div className="vital-card-header" style={{ borderBottomColor: 'rgba(139, 92, 246, 0.15)' }}>
              <h3>
                <i className="fa-solid fa-brain text-gradient"></i>
                <span>AI Personalized Health & Nutrition Plan</span>
              </h3>
              <div style={{ fontSize: '0.8rem', color: '#c4b5fd', fontWeight: 600 }}>
                {isGeneratingAi ? 'Synthesizing...' : 'Optimized for Academic Peak'}
              </div>
            </div>

            {/* Daily Caloric Target Strip */}
            <div className="vital-calories-strip">
              <div className="vital-calories-strip-title">
                <i className="fa-solid fa-fire" style={{ color: '#fbbf24' }}></i>
                <span>Target Daily Energy Expenditure (TDEE)</span>
              </div>
              <div className="vital-calories-strip-val">
                {calculated ? `${dailyCalories.toLocaleString()} kcal` : '-- kcal'}
              </div>
            </div>

            {/* Advice Content */}
            <div className={`vital-advisor-content ${isGeneratingAi ? 'vital-shimmer' : ''}`}>
              {isGeneratingAi ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#c4b5fd' }}>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Synthesizing cognitive wellness & clinical nutritional guidance...</span>
                </div>
              ) : aiAdviceText ? (
                <div>
                  {aiAdviceText.split('\n\n').map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
                  Enter your physical parameters and click <strong>Calculate Biomarkers</strong> to generate a custom nutrition, sleep, and physical fitness plan tailored for your academic schedule.
                </p>
              )}
            </div>
          </div>

          {/* Biometrics Analytics History Chart */}
          <div className="vital-chart-card">
            <div className="vital-card-header">
              <h3>
                <i className="fa-solid fa-chart-line" style={{ color: '#10b981' }}></i>
                <span>Biometric Progression History</span>
              </h3>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                  title="Clear history logs"
                >
                  <i className="fa-solid fa-trash-can"></i>
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="vital-chart-wrapper">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
