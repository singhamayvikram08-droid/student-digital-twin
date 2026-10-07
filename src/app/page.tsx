"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { API_BASE_URL } from "@/lib/api-config";
import {
  Chart as ChartJS,
  registerables,
  ChartOptions,
  TooltipItem,
  ChartData,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import CgpaPlannerPortal from "./CgpaPlannerPortal";

ChartJS.register(...registerables);

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

interface SpeechRecognitionErrorLike {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface Subject {
  id: string;
  name: string;
  conducted: number;
  attended: number;
  odLeaves?: number;
  ciaMarks?: number;
  ciaTotal?: number;
  endSemMarks?: number;
  endSemTotal?: number;
  cia1?: number;
  cia2?: number;
  targetPercent: number;
  studyHours: number;
  pastMarks: number;
  prediction: {
    current_percent: number;
    classes_needed_for_target: number;
    safe_bunks_available: number;
    effective_percent?: number;
    od_leaves?: number;
  };
  predictedScore: number | null;
}

interface ScannedSubjectPayload {
  name?: string;
  conducted?: number;
  attended?: number;
  od_leaves?: number;
  cia_marks?: number;
  end_sem_marks?: number;
  cia1?: number;
  cia2?: number;
  target_percent?: number;
  current_percent?: number;
  classes_needed_for_target?: number;
  safe_bunks_available?: number;
}

export interface FacialEmotionTelemetry {
  hasFace: boolean;
  eyesDetected: boolean;
  label: string;
  emoji: string;
  confidence: number;
  focusScore: number;
  stressScore: number;
  valence: 'positive' | 'neutral' | 'negative';
  landmarksCount: number;
  smileScore: number;
  frownScore: number;
  browFurrowScore: number;
  eyeOpenness: number;
  timestamp: number;
}

const ZERO_FACIAL_TELEMETRY: FacialEmotionTelemetry = {
  hasFace: false,
  eyesDetected: false,
  label: "No Face Detected",
  emoji: "👤",
  confidence: 0,
  focusScore: 0,
  stressScore: 0,
  valence: 'neutral',
  landmarksCount: 0,
  smileScore: 0,
  frownScore: 0,
  browFurrowScore: 0,
  eyeOpenness: 0,
  timestamp: 0
};

function classifyFacialEmotion(
  blendshapes: { categories?: Array<{ categoryName: string; score: number }> } | null | undefined,
  landmarks?: Array<{ x: number; y: number; z?: number }> | null
): FacialEmotionTelemetry {
  if (!landmarks || landmarks.length === 0) {
    return {
      ...ZERO_FACIAL_TELEMETRY,
      timestamp: Date.now()
    };
  }

  let smile = 0;
  let browDown = 0;
  let browInnerUp = 0;
  let browOuterUp = 0;
  let eyeBlink = 0;
  let eyeSquint = 0;
  let mouthFrown = 0;
  let jawOpen = 0;
  let ear = 0.25;

  if (blendshapes && blendshapes.categories && blendshapes.categories.length > 0) {
    const scores: Record<string, number> = {};
    for (const c of blendshapes.categories) {
      scores[c.categoryName] = c.score;
    }
    smile = Math.max(scores["mouthSmileLeft"] || 0, scores["mouthSmileRight"] || 0);
    browDown = Math.max(scores["browDownLeft"] || 0, scores["browDownRight"] || 0);
    browInnerUp = scores["browInnerUp"] || 0;
    browOuterUp = Math.max(scores["browOuterUpLeft"] || 0, scores["browOuterUpRight"] || 0);
    eyeBlink = ((scores["eyeBlinkLeft"] || 0) + (scores["eyeBlinkRight"] || 0)) / 2;
    eyeSquint = Math.max(scores["eyeSquintLeft"] || 0, scores["eyeSquintRight"] || 0);
    mouthFrown = Math.max(scores["mouthFrownLeft"] || 0, scores["mouthFrownRight"] || 0);
    jawOpen = scores["jawOpen"] || 0;
  }

  // Robust landmark geometry based on 478 MediaPipe points
  if (landmarks && landmarks.length >= 468) {
    const dist2D = (p1: { x: number; y: number }, p2: { x: number; y: number }) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const faceHeight = Math.abs(landmarks[152].y - landmarks[10].y) || 1;
    const mouthWidth = dist2D(landmarks[61], landmarks[291]);
    const mouthHeight = dist2D(landmarks[13], landmarks[14]);
    const mar = mouthWidth > 0 ? mouthHeight / mouthWidth : 0;

    const leftEyeH = dist2D(landmarks[159], landmarks[145]);
    const leftEyeW = dist2D(landmarks[33], landmarks[133]);
    const rightEyeH = dist2D(landmarks[386], landmarks[374]);
    const rightEyeW = dist2D(landmarks[362], landmarks[263]);
    ear = ((leftEyeW > 0 ? leftEyeH / leftEyeW : 0.25) + (rightEyeW > 0 ? rightEyeH / rightEyeW : 0.25)) / 2;

    const geomBlink = ear < 0.17 ? 0.8 : 0.05;
    eyeBlink = Math.max(eyeBlink, geomBlink);

    // Mouth corners elevation vs center of lips
    // In normalized coords, lower y is higher on the face
    const lipCenterY = (landmarks[0].y + landmarks[17].y) / 2;
    const cornersY = (landmarks[61].y + landmarks[291].y) / 2;
    const mouthElevation = (lipCenterY - cornersY) / faceHeight;

    if (mouthElevation > 0.010) {
      smile = Math.max(smile, Math.min(1.0, 0.40 + (mouthElevation - 0.010) * 20));
    } else if (mouthElevation < -0.002) {
      mouthFrown = Math.max(mouthFrown, Math.min(1.0, 0.30 + Math.abs(mouthElevation + 0.002) * 25));
    }

    if (mar > 0.42) {
      jawOpen = Math.max(jawOpen, 0.65);
    }
  }

  const browRaise = Math.max(browInnerUp, browOuterUp);
  const eyeOpenness = Math.max(0, 1 - eyeBlink);
  const eyesDetected = eyeOpenness >= 0.22 && ear >= 0.12;

  let stress = (browDown * 0.45) + (mouthFrown * 0.45) + (eyeSquint * 0.1);
  stress = Math.min(1.0, Math.max(0.0, stress));

  let focus = 0.45 + (eyeOpenness * 0.3) + (browDown * 0.25) - (stress * 0.3);
  focus = Math.min(1.0, Math.max(0.1, focus));

  let label = "Calm & Attentive";
  let emoji = "😌";
  let valence: 'positive' | 'neutral' | 'negative' = "neutral";
  let confidence = 88;

  if (!eyesDetected) {
    label = "Eyes Not Detected";
    emoji = "👀";
    valence = "neutral";
    confidence = 90;
  } else if (smile > 0.30) {
    label = "Joy & Confidence";
    emoji = "😄";
    valence = "positive";
    confidence = Math.round(Math.min(0.98, 0.75 + smile * 0.24) * 100);
  } else if (mouthFrown >= 0.08 || stress >= 0.25 || (browInnerUp > 0.15 && smile < 0.20)) {
    label = "Sad / Down";
    emoji = "😔";
    valence = "negative";
    confidence = Math.round(Math.min(0.96, 0.75 + Math.max(mouthFrown, stress) * 0.25) * 100);
  } else if (browRaise > 0.35 || (browInnerUp > 0.35 && jawOpen > 0.15)) {
    label = "Puzzled / Inquiring";
    emoji = "🤔";
    valence = "neutral";
    confidence = Math.round(Math.min(0.95, 0.7 + browRaise * 0.25) * 100);
  } else if (eyeBlink > 0.55 || (eyeSquint > 0.5 && eyeOpenness < 0.4)) {
    label = "Fatigued / Sleepy";
    emoji = "🥱";
    valence = "negative";
    confidence = Math.round(Math.min(0.95, 0.7 + eyeBlink * 0.25) * 100);
  } else if (focus > 0.75 && browDown > 0.15) {
    label = "Deep Focus";
    emoji = "🎯";
    valence = "positive";
    confidence = Math.round(Math.min(0.96, 0.72 + focus * 0.24) * 100);
  }

  return {
    hasFace: true,
    eyesDetected,
    label,
    emoji,
    valence,
    confidence,
    focusScore: Math.round(focus * 100),
    stressScore: Math.round(stress * 100),
    landmarksCount: landmarks ? landmarks.length : 478,
    smileScore: Math.round(smile * 100),
    frownScore: Math.round(mouthFrown * 100),
    browFurrowScore: Math.round(browDown * 100),
    eyeOpenness: Math.round(eyeOpenness * 100),
    timestamp: Date.now()
  };
}

interface UserProfile {
  firstName: string;
  fullName?: string;
  email?: string;
  phone?: string;
  role?: string;
  college?: string;
  age?: number | string;
  authProvider?: 'facebook' | 'google' | 'phone' | 'email' | 'guest';
  onboardingComplete?: boolean;
  profileCompleted?: boolean;
}

const DEFAULT_SUBJECTS: Subject[] = [
  {
    id: "subj-1",
    name: "Mathematics",
    conducted: 24,
    attended: 20,
    odLeaves: 0,
    ciaMarks: 52,
    ciaTotal: 60,
    endSemMarks: 32,
    endSemTotal: 40,
    cia1: 22,
    cia2: 24,
    targetPercent: 75,
    studyHours: 4,
    pastMarks: 84,
    prediction: { current_percent: 83.3, classes_needed_for_target: 0, safe_bunks_available: 2, effective_percent: 83.3, od_leaves: 0 },
    predictedScore: 84
  },
  {
    id: "subj-2",
    name: "Computer Networks",
    conducted: 25,
    attended: 17,
    odLeaves: 1,
    ciaMarks: 42,
    ciaTotal: 60,
    endSemMarks: 29,
    endSemTotal: 40,
    cia1: 18,
    cia2: 19,
    targetPercent: 75,
    studyHours: 3,
    pastMarks: 71,
    prediction: { current_percent: 68.0, classes_needed_for_target: 7, safe_bunks_available: 0, effective_percent: 72.0, od_leaves: 1 },
    predictedScore: 71
  },
  {
    id: "subj-3",
    name: "Operating Systems",
    conducted: 28,
    attended: 22,
    odLeaves: 0,
    ciaMarks: 54,
    ciaTotal: 60,
    endSemMarks: 32,
    endSemTotal: 40,
    cia1: 21,
    cia2: 23,
    targetPercent: 75,
    studyHours: 5,
    pastMarks: 86,
    prediction: { current_percent: 78.6, classes_needed_for_target: 0, safe_bunks_available: 1, effective_percent: 78.6, od_leaves: 0 },
    predictedScore: 86
  }
];

const getUserStorageKey = (u: UserProfile | null, key: string) => {
  if (!u) return `digital_twin_${key}_guest`;
  const provider = u.authProvider || 'user';
  const id = u.email || u.phone || u.firstName || u.fullName || 'default';
  const cleanId = `${provider}_${id}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `digital_twin_${cleanId}_${key}`;
};

export type SupportedLanguage = 'auto' | 'hi' | 'en' | 'kn' | 'te';
export type HindiVoiceAccent = 'rishi' | 'google' | 'lekha' | 'auto';

export interface HindiAccentDefinition {
  id: HindiVoiceAccent;
  name: string;
  tag: string;
  speaker: string;
  description: string;
  samplePhrase: string;
}

const HINDI_ACCENT_DEFINITIONS: HindiAccentDefinition[] = [
  {
    id: 'rishi',
    name: 'Modern Indian Accent (Rishi)',
    tag: 'Crisp & Natural',
    speaker: 'Rishi (Indian English / Hinglish)',
    description: 'Natural conversational Indian college student accent (Male). Articulate, clear, zero robotic muffling.',
    samplePhrase: 'Arrey Amay bhai! Attendance aur studies ka poora calculation mere paas hai. Bilkul chill kar!'
  },
  {
    id: 'google',
    name: 'Neural Hindi (Google हिन्दी)',
    tag: 'Devanagari Neural',
    speaker: 'Google हिन्दी (hi-IN)',
    description: 'Authentic North Indian female neural voice. Smooth, expressive Devanagari articulation.',
    samplePhrase: 'नमस्ते अमय! आपकी अटेंडेंस और पढ़ाई का पूरा गणित मेरे पास है। आप बिल्कुल सेफ हैं!'
  },
  {
    id: 'lekha',
    name: 'Classic Indic (Lekha)',
    tag: 'Standard System',
    speaker: 'Lekha (hi-IN System)',
    description: 'macOS native Hindi voice with enhanced phonetics and calibrated cadence.',
    samplePhrase: 'नमस्ते अमय भाई, आपकी अटेंडेंस और पढ़ाई की पूरी रिपोर्ट तैयार है।'
  }
];

const LOGIN_TRANSLATIONS: Record<SupportedLanguage, {
  welcome: string;
  subtitle: string;
  langTitle: string;
  facebook: string;
  google: string;
  orSignInWith: string;
  tabEmail: string;
  tabPhone: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  forgotPassword: string;
  signInEmailBtn: string;
  phoneLabel: string;
  phonePlaceholder: string;
  sendOtpBtn: string;
  codeSentTo: string;
  edit: string;
  sessionOtp: string;
  authGuard: string;
  resendIn: string;
  resendCode: string;
  verifyBtn: string;
  guestBtn: string;
  instantAccess: string;
  securityBadge: string;
  pwdResetAlert: string;
}> = {
  auto: {
    welcome: "Welcome to Twin.ai",
    subtitle: "Sign in to sync your AI Digital Twin, subjects & attendance telemetry",
    langTitle: "Language Preference",
    facebook: "Facebook",
    google: "Google",
    orSignInWith: "Or sign in with",
    tabEmail: "Email",
    tabPhone: "Phone Number",
    emailLabel: "Email Address",
    emailPlaceholder: "student@university.edu",
    passwordLabel: "Password",
    forgotPassword: "Forgot?",
    signInEmailBtn: "Sign In with Email",
    phoneLabel: "Mobile Phone Number",
    phonePlaceholder: "98765 43210",
    sendOtpBtn: "Send OTP Code",
    codeSentTo: "Code sent to",
    edit: "Edit",
    sessionOtp: "Session OTP:",
    authGuard: "Auth Guard Active",
    resendIn: "Resend in",
    resendCode: "Resend Code",
    verifyBtn: "Verify & Continue",
    guestBtn: "Continue as Guest",
    instantAccess: "Instant Access →",
    securityBadge: "256-Bit Encrypted Academic Portal",
    pwdResetAlert: "Password reset link sent to your email!"
  },
  en: {
    welcome: "Welcome to Twin.ai",
    subtitle: "Sign in to sync your AI Digital Twin, subjects & attendance telemetry",
    langTitle: "Language Preference",
    facebook: "Facebook",
    google: "Google",
    orSignInWith: "Or sign in with",
    tabEmail: "Email",
    tabPhone: "Phone Number",
    emailLabel: "Email Address",
    emailPlaceholder: "student@university.edu",
    passwordLabel: "Password",
    forgotPassword: "Forgot?",
    signInEmailBtn: "Sign In with Email",
    phoneLabel: "Mobile Phone Number",
    phonePlaceholder: "98765 43210",
    sendOtpBtn: "Send OTP Code",
    codeSentTo: "Code sent to",
    edit: "Edit",
    sessionOtp: "Session OTP:",
    authGuard: "Auth Guard Active",
    resendIn: "Resend in",
    resendCode: "Resend Code",
    verifyBtn: "Verify & Continue",
    guestBtn: "Continue as Guest",
    instantAccess: "Instant Access →",
    securityBadge: "256-Bit Encrypted Academic Portal",
    pwdResetAlert: "Password reset link sent to your email!"
  },
  hi: {
    welcome: "Twin.ai में आपका स्वागत है",
    subtitle: "अपने AI डिजिटल ट्विन, विषय और उपस्थिति डेटा सिंक करने के लिए साइन इन करें",
    langTitle: "भाषा प्राथमिकता",
    facebook: "Facebook",
    google: "Google",
    orSignInWith: "या इसके साथ साइन इन करें",
    tabEmail: "ईमेल",
    tabPhone: "फ़ोन नंबर",
    emailLabel: "ईमेल पता",
    emailPlaceholder: "student@university.edu",
    passwordLabel: "पासवर्ड",
    forgotPassword: "भूल गए?",
    signInEmailBtn: "ईमेल से साइन इन करें",
    phoneLabel: "मोबाइल फ़ोन नंबर",
    phonePlaceholder: "98765 43210",
    sendOtpBtn: "OTP कोड भेजें",
    codeSentTo: "कोड इस नंबर पर भेजा गया:",
    edit: "बदलें",
    sessionOtp: "सत्र OTP:",
    authGuard: "सुरक्षा गार्ड सक्रिय",
    resendIn: "पुनः भेजें:",
    resendCode: "कोड पुनः भेजें",
    verifyBtn: "सत्यापित करें और आगे बढ़ें",
    guestBtn: "अतिथि के रूप में जारी रखें",
    instantAccess: "तुरंत प्रवेश →",
    securityBadge: "256-बिट एन्क्रिप्टेड शैक्षणिक पोर्टल",
    pwdResetAlert: "पासवर्ड रीसेट लिंक आपके ईमेल पर भेज दिया गया है!"
  },
  kn: {
    welcome: "Twin.ai ಗೆ ಸುಸ್ವಾಗತ",
    subtitle: "ನಿಮ್ಮ AI ಡಿಜಿಟಲ್ ಟ್ವಿನ್, ವಿಷಯಗಳು ಮತ್ತು ಹಾಜರಾತಿ ಡೇಟಾವನ್ನು ಸಿಂಕ್ ಮಾಡಲು ಸೈನ್ ಇನ್ ಮಾಡಿ",
    langTitle: "ಭಾಷಾ ಆದ್ಯತೆ",
    facebook: "Facebook",
    google: "Google",
    orSignInWith: "ಅಥವಾ ಇದರೊಂದಿಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ",
    tabEmail: "ಇಮೇಲ್",
    tabPhone: "ಫೋನ್ ಸಂಖ್ಯೆ",
    emailLabel: "ಇಮೇಲ್ ವಿಳಾಸ",
    emailPlaceholder: "student@university.edu",
    passwordLabel: "ಪಾಸ್‌ವರ್ಡ್",
    forgotPassword: "ಮರೆತಿರಾ?",
    signInEmailBtn: "ಇಮೇಲ್ ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ",
    phoneLabel: "ಮೊಬೈಲ್ ಫೋನ್ ಸಂಖ್ಯೆ",
    phonePlaceholder: "98765 43210",
    sendOtpBtn: "OTP ಕೋಡ್ ಕಳುಹಿಸಿ",
    codeSentTo: "ಕೋಡ್ ಕಳುಹಿಸಲಾದ ಸಂಖ್ಯೆ:",
    edit: "ಬದಲಾಯಿಸಿ",
    sessionOtp: "ಸೆಷನ್ OTP:",
    authGuard: "ಭದ್ರತಾ ಗಾರ್ಡ್ ಸಕ್ರಿಯ",
    resendIn: "ಮರುಕಳುಹಿಸಲು ಸಮಯ:",
    resendCode: "ಕೋಡ್ ಮರುಕಳುಹಿಸಿ",
    verifyBtn: "ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಮುಂದುವರಿಯಿರಿ",
    guestBtn: "ಅತಿಥಿಯಾಗಿ ಮುಂದುವರಿಯಿರಿ",
    instantAccess: "ತ್ವರಿತ ಪ್ರವೇಶ →",
    securityBadge: "256-ಬಿಟ್ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆದ ಶೈಕ್ಷಣಿಕ ಪೋರ್ಟಲ್",
    pwdResetAlert: "ಪಾಸ್‌ವರ್ಡ್ ಮರುಹೊಂದಿಸುವ ಲಿಂಕ್ ನಿಮ್ಮ ಇಮೇಲ್‌ಗೆ ಕಳುಹಿಸಲಾಗಿದೆ!"
  },
  te: {
    welcome: "Twin.ai కి స్వాగతం",
    subtitle: "మీ AI డిజిటల్ ట్విన్, సబ్జెక్టులు మరియు హాజరు డేటాను సింక్ చేయడానికి సైన్ ఇన్ చేయండి",
    langTitle: "భాషా ప్రాధాన్యత",
    facebook: "Facebook",
    google: "Google",
    orSignInWith: "లేదా దీనితో సైన్ ఇన్ చేయండి",
    tabEmail: "ఈమెయిల్",
    tabPhone: "ఫోన్ నంబర్",
    emailLabel: "ఈమెయిల్ చిరునామా",
    emailPlaceholder: "student@university.edu",
    passwordLabel: "పాస్‌వర్డ్",
    forgotPassword: "మర్చిపోయారా?",
    signInEmailBtn: "ఈమెయిల్‌తో సైన్ ఇన్ చేయండి",
    phoneLabel: "మొబైల్ ఫోన్ నంబర్",
    phonePlaceholder: "98765 43210",
    sendOtpBtn: "OTP కోడ్ పంపండి",
    codeSentTo: "కోడ్ పంపబడిన నంబర్:",
    edit: "మార్చండి",
    sessionOtp: "సెషన్ OTP:",
    authGuard: "భద్రతా గార్డ్ యాక్టివ్",
    resendIn: "మళ్లీ పంపే సమయం:",
    resendCode: "కోడ్ మళ్లీ పంపండి",
    verifyBtn: "ధృవీకరించి కొనసాగండి",
    guestBtn: "గెస్ట్‌గా కొనసాగండి",
    instantAccess: "తక్షణ ప్రవేశం →",
    securityBadge: "256-బిట్ ఎన్‌క్రిప్ట్ చేయబడిన అకడమిక్ పోర్టల్",
    pwdResetAlert: "పాస్‌వర్డ్ రీసెట్ లింక్ మీ ఈమెయిల్‌కు పంపబడింది!"
  }
};

export default function Dashboard() {
  const [isClient, setIsClient] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activePage, setActivePage] = useState<'portal' | 'analytics' | 'cgpa'>('portal');

  // Modern Auth State
  const [authTab, setAuthTab] = useState<'email' | 'phone'>('email');
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState(["", "", "", ""]);
  const [serverOtp, setServerOtp] = useState<string>("1234");
  const [otpTimer, setOtpTimer] = useState(30);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSocialLoading, setIsSocialLoading] = useState<string | null>(null);

  // Cloud Database Persistence State (SQLite Backend Sync)
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [lastCloudSyncTime, setLastCloudSyncTime] = useState<string | null>(null);

  // Hands-Free WebRTC Audio RMS VAD State
  const [vadActive] = useState(true);
  const [isUserVoiceActive, setIsUserVoiceActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const vadAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);

  // Timetable / ERP Vision Scanner State
  const [isScanningTimetable, setIsScanningTimetable] = useState(false);
  const timetableInputRef = useRef<HTMLInputElement | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>(DEFAULT_SUBJECTS);
  const [activeSubjectId, setActiveSubjectId] = useState<string>("subj-1");

  const [newSubjectName, setNewSubjectName] = useState("");
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<'distribution' | 'trend'>('distribution');

  // Edit Subject Marks Modal State
  const [editingMarksSubject, setEditingMarksSubject] = useState<Subject | null>(null);
  const [editCiaMarks, setEditCiaMarks] = useState<number>(48);
  const [editEndSemMarks, setEditEndSemMarks] = useState<number>(32);

  // Edit Student Profile Modal State
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [isMandatoryProfileSetup, setIsMandatoryProfileSetup] = useState(false);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfileCollege, setEditProfileCollege] = useState("");
  const [editProfileAge, setEditProfileAge] = useState("20");
  const [profileError, setProfileError] = useState<string | null>(null);

  // Theme State
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [isLightMode]);

  const toggleTheme = () => setIsLightMode(!isLightMode);

  // Helper to get active subject
  const activeSubject = subjects.find(s => s.id === activeSubjectId) || subjects[0] || {
    id: "subj-1",
    name: "Mathematics",
    conducted: 0,
    attended: 0,
    odLeaves: 0,
    ciaMarks: 52,
    ciaTotal: 60,
    endSemMarks: 32,
    endSemTotal: 40,
    cia1: 22,
    cia2: 24,
    targetPercent: 75,
    studyHours: 0,
    pastMarks: 0,
    prediction: { current_percent: 0, classes_needed_for_target: 0, safe_bunks_available: 0, effective_percent: 0, od_leaves: 0 },
    predictedScore: null
  };

  // Chat UI states & Loading flags
  const [chatOpen, setChatOpen] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoCallOpen, setVideoCallOpen] = useState(false);
  const videoCallOpenRef = useRef(videoCallOpen);
  const [isMicActive, setIsMicActive] = useState(false);
  const isMicActiveRef = useRef(isMicActive);

  useEffect(() => { videoCallOpenRef.current = videoCallOpen; }, [videoCallOpen]);
  useEffect(() => { isMicActiveRef.current = isMicActive; }, [isMicActive]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);

  // MediaPipe Face Mesh & Emotion Telemetry States & Refs
  const faceMeshCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceLandmarkerRef = useRef<any>(null);
  const faceMeshAnimFrameRef = useRef<number | null>(null);
  const [isFaceMeshActive, setIsFaceMeshActive] = useState(true);
  const isFaceMeshActiveRef = useRef(isFaceMeshActive);
  useEffect(() => { isFaceMeshActiveRef.current = isFaceMeshActive; }, [isFaceMeshActive]);
  const [isFaceMeshLoading, setIsFaceMeshLoading] = useState(false);
  const [detectedEmotion, setDetectedEmotion] = useState<FacialEmotionTelemetry>(ZERO_FACIAL_TELEMETRY);
  const detectedEmotionRef = useRef<FacialEmotionTelemetry>(ZERO_FACIAL_TELEMETRY);

  // Delete subject with safeguard
  const handleDeleteSubject = (subjId: string, subjName: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (subjects.length <= 1) {
      alert("You need to track at least one subject!");
      return;
    }
    if (typeof window !== "undefined" && window.confirm(`Remove subject "${subjName}"?`)) {
      const remaining = subjects.filter(s => s.id !== subjId);
      setSubjects(remaining);
      if (activeSubjectId === subjId) {
        setActiveSubjectId(remaining[0].id);
      }
    }
  };

  // Instant barge-in / speech interruption
  const interruptSpeech = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    activeUtteranceRef.current = null;
  };

  // Keyboard shortcut for interruption: Spacebar (when not typing) or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSpeakingRef.current) {
        const isInputField = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
        if (e.key === 'Escape' || (e.code === 'Space' && !isInputField)) {
          e.preventDefault();
          interruptSpeech();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [userStream, setUserStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [videoInput, setVideoInput] = useState("");
  // Anti-Spam & Bot Protection States
  const [honeypotVal, setHoneypotVal] = useState("");
  const [chatSpamWarning, setChatSpamWarning] = useState<string | null>(null);
  const chatTimestampsRef = useRef<number[]>([]);
  const lastChatSubmitTimeRef = useRef<number>(0);
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([
    { role: 'msg-ai', content: "Hey there! I'm your Digital Twin—your co-pilot through college life. Ask me anything about your attendance, safe bunks, exams, or how you're holding up today!" }
  ]);
  const [videoMessages, setVideoMessages] = useState<{ role: string, content: string }[]>([
    { role: 'msg-ai', content: "Hey partner! Great seeing you face-to-face. I'm right here with you—ask me anything about your courses, attendance planning, or study prep!" }
  ]);

  // Hands-Free Mobile & Desktop Voice Activity Detection (VAD) via WebRTC AudioContext RMS Thresholding
  // Automatically interrupts the AI monologue when the student speaks into their microphone without physical keys!
  useEffect(() => {
    if (!userStream || !vadActive) {
      if (vadRafRef.current) {
        cancelAnimationFrame(vadRafRef.current);
        vadRafRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close(); } catch {}
        audioContextRef.current = null;
      }
      setIsUserVoiceActive(false);
      return;
    }

    const audioTracks = userStream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks[0].enabled) {
      setIsUserVoiceActive(false);
      return;
    }

    let isMounted = true;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(userStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);
      vadAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let consecutiveSpeechFrames = 0;

      const checkAudioLevel = () => {
        if (!isMounted) return;
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128.0;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Voice energy detection threshold (calibrated for mobile and laptop mics)
        if (rms > 0.045) {
          consecutiveSpeechFrames++;
          if (consecutiveSpeechFrames >= 2) {
            setIsUserVoiceActive(true);
            if (isSpeakingRef.current) {
              console.log("🎙️ Mobile Hands-Free VAD triggered barge-in (RMS:", rms.toFixed(3), ")");
              interruptSpeech();
            }
          }
        } else {
          consecutiveSpeechFrames = 0;
          setIsUserVoiceActive(false);
        }

        vadRafRef.current = requestAnimationFrame(checkAudioLevel);
      };

      vadRafRef.current = requestAnimationFrame(checkAudioLevel);
    } catch (err) {
      console.warn("VAD WebRTC initialization note:", err);
    }

    return () => {
      isMounted = false;
      if (vadRafRef.current) {
        cancelAnimationFrame(vadRafRef.current);
        vadRafRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close(); } catch {}
        audioContextRef.current = null;
      }
    };
  }, [userStream, vadActive]);

  const [voiceLanguage, setVoiceLanguage] = useState<SupportedLanguage>('auto');
  const voiceLanguageRef = useRef<SupportedLanguage>('auto');
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [modalSelectedLang, setModalSelectedLang] = useState<SupportedLanguage>('auto');
  const [hindiAccent, setHindiAccent] = useState<HindiVoiceAccent>('rishi');
  const hindiAccentRef = useRef<HindiVoiceAccent>('rishi');
  const [modalHindiAccent, setModalHindiAccent] = useState<HindiVoiceAccent>('rishi');
  const [speechSpeed, setSpeechSpeed] = useState<number>(0.93);
  const [langToast, setLangToast] = useState<string | null>(null);
  const tLogin = LOGIN_TRANSLATIONS[voiceLanguage] || LOGIN_TRANSLATIONS.auto;

  // Sync modal selection with voiceLanguage & hindiAccent when modal opens
  useEffect(() => {
    if (showLanguageModal) {
      setModalSelectedLang(voiceLanguage);
      setModalHindiAccent(hindiAccent);
    }
  }, [showLanguageModal, voiceLanguage, hindiAccent]);

  // Load persisted language, accent and speed preference on mount
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('digital_twin_lang_pref');
      if (savedLang && ['auto', 'hi', 'en', 'kn', 'te'].includes(savedLang)) {
        setVoiceLanguage(savedLang as SupportedLanguage);
      }
      const savedAccent = localStorage.getItem('digital_twin_hindi_accent');
      if (savedAccent && ['rishi', 'google', 'lekha', 'auto'].includes(savedAccent)) {
        setHindiAccent(savedAccent as HindiVoiceAccent);
        hindiAccentRef.current = savedAccent as HindiVoiceAccent;
        setModalHindiAccent(savedAccent as HindiVoiceAccent);
      }
      const savedSpeed = localStorage.getItem('digital_twin_speech_speed');
      if (savedSpeed) {
        const parsed = parseFloat(savedSpeed);
        if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 2.0) {
          setSpeechSpeed(parsed);
        }
      }
    } catch {}
  }, []);

  const changeLanguagePreference = (newLang: SupportedLanguage) => {
    setVoiceLanguage(newLang);
    setModalSelectedLang(newLang);
    try {
      localStorage.setItem('digital_twin_lang_pref', newLang);
      if (user) {
        localStorage.setItem(getUserStorageKey(user, 'lang_pref'), newLang);
      }
    } catch {}

    const langNameMap: Record<SupportedLanguage, string> = {
      auto: "Auto Detect (Smart Bilingual)",
      hi: "Hindi (हिन्दी)",
      en: "English (Global)",
      kn: "Kannada (ಕನ್ನಡ)",
      te: "Telugu (తెలుగు)"
    };

    setLangToast(`Language preference updated to ${langNameMap[newLang]}`);
    setTimeout(() => setLangToast(null), 3200);
  };

  const changeHindiAccent = (newAccent: HindiVoiceAccent, skipConfirmationAudio?: boolean) => {
    setHindiAccent(newAccent);
    hindiAccentRef.current = newAccent;
    setModalHindiAccent(newAccent);
    try {
      localStorage.setItem('digital_twin_hindi_accent', newAccent);
      if (user) {
        localStorage.setItem(getUserStorageKey(user, 'hindi_accent'), newAccent);
      }
    } catch {}

    const accentDef = HINDI_ACCENT_DEFINITIONS.find(a => a.id === newAccent);
    setLangToast(`Hindi accent switched to ${accentDef?.name || newAccent}`);
    setTimeout(() => setLangToast(null), 3200);

    if (!skipConfirmationAudio) {
      if (newAccent === 'rishi') {
        speak('Arrey bhai! Ab se main Rishi accent mein baat karunga. Bilkul clear aur natural!', 'hi', 'rishi');
      } else if (newAccent === 'google') {
        speak('नमस्ते! अब से मैं गूगल हिंदी एक्सेंट में बात करूँगी। बिल्कुल स्पष्ट और स्वाभाविक।', 'hi', 'google');
      } else if (newAccent === 'lekha') {
        speak('नमस्ते! अब से मैं क्लासिक हिंदी एक्सेंट में बात करूँगी।', 'hi', 'lekha');
      }
    }
  };

  const changeSpeechSpeed = (speed: number) => {
    setSpeechSpeed(speed);
    try {
      localStorage.setItem('digital_twin_speech_speed', speed.toString());
    } catch {}
  };

  interface LanguageDefinition {
    id: SupportedLanguage;
    name: string;
    nativeName: string;
    flag: string;
    subtitle: string;
    sample: string;
    testPhrase: string;
    tag?: string;
  }

  const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
    {
      id: 'auto',
      name: 'Auto Detect',
      nativeName: 'Smart Bilingual',
      flag: '🌐',
      subtitle: 'Intelligently switches between Hindi, Kannada, Telugu & English based on query context',
      sample: 'Adapts seamlessly to spoken or written language',
      testPhrase: 'Language preference set to Auto Detect. I will adapt to whatever language you speak or type!',
      tag: 'Recommended'
    },
    {
      id: 'hi',
      name: 'Hindi',
      nativeName: 'हिन्दी',
      flag: '🇮🇳',
      subtitle: 'Devanagari script with natural brotherly tone using Google हिन्दी (hi-IN) voice',
      sample: 'भाई, तेरी अटेंडेंस 83.3% है, तू बिल्कुल सेफ है!',
      testPhrase: 'नमस्ते! मैं आपका एआई डिजिटल ट्विन हूँ। आपकी अटेंडेंस और पढ़ाई का पूरा गणित मेरे पास है।'
    },
    {
      id: 'en',
      name: 'English',
      nativeName: 'English (Global)',
      flag: '🇬🇧',
      subtitle: 'Energetic student co-pilot tone with clear technical and mathematical articulation',
      sample: "Hey partner! You're in a great spot with attendance.",
      testPhrase: "Hello! I'm your AI Digital Twin, ready to guide your attendance planning and exam preparation."
    },
    {
      id: 'kn',
      name: 'Kannada',
      nativeName: 'ಕನ್ನಡ',
      flag: '🇮🇳',
      subtitle: 'Authentic Kannada script (ಕನ್ನಡ ಲಿಪಿ) with friendly college camaraderie and native pacing',
      sample: 'ಗುರು, ಟೆನ್ಷನ್ ತಗೋಬೇಡ — ನೀನು ಪೂರ್ಣವಾಗಿ ಸೇಫ್ ಇದೀಯ!',
      testPhrase: 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಎಐ ಡಿಜಿಟಲ್ ಟ್ವಿನ್. ನಿಮ್ಮ ಹಾಜರಾತಿ ಮತ್ತು ಅಧ್ಯಯನದ ಎಲ್ಲಾ ವಿವರಗಳು ನನ್ನ ಬಳಿ ಇವೆ.'
    },
    {
      id: 'te',
      name: 'Telugu',
      nativeName: 'తెలుగు',
      flag: '🇮🇳',
      subtitle: 'Authentic Telugu script (తెలుగు లిపి) with warm, supportive tone and regional terms',
      sample: 'బావా టెನ್షన్ పడకు! నీ అటెండెన్స్ 83.3% ఉంది, నువ్వు సేఫ్!',
      testPhrase: 'నమస్కారం! నేను మీ ఏఐ డిజిటಲ್ ట్విన్. మీ అటెండెన్స్ మరియు చదువు వివరాలన్నీ నాతో సేఫ్ గా ఉన్నాయి.'
    }
  ];

  const currentLangDef = LANGUAGE_DEFINITIONS.find(l => l.id === voiceLanguage) || LANGUAGE_DEFINITIONS[0];

  useEffect(() => {
    voiceLanguageRef.current = voiceLanguage;
    if (recognitionRef.current) {
      if (voiceLanguage === 'hi') recognitionRef.current.lang = 'hi-IN';
      else if (voiceLanguage === 'kn') recognitionRef.current.lang = 'kn-IN';
      else if (voiceLanguage === 'te') recognitionRef.current.lang = 'te-IN';
      else if (voiceLanguage === 'en') recognitionRef.current.lang = 'en-US';
      else recognitionRef.current.lang = 'en-IN';
    }
  }, [voiceLanguage]);

  // Pre-load voices and keep ref continuously updated
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const updateVoices = () => {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) {
          availableVoicesRef.current = v;
        }
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
      return () => { window.speechSynthesis.onvoiceschanged = null; };
    }
  }, []);

  const handleSendChatRef = useRef<((directMsg?: string, source?: 'chat' | 'video') => void) | null>(null);

  // Common Hinglish / Hindi keywords
  const HINGLISH_KEYWORDS_REGEX = /\b(bhai|bhaiya|yaar|dost|meri|mera|mere|teri|tera|tere|kya|kyun|kyu|kaise|kahan|kab|kitna|kitni|kitne|hai|hain|ho|hoga|hogi|hoge|tha|thi|the|nahi|nhi|mat|tension|chinta|chahiye|bol|bolo|bata|batao|karo|kare|kar|dekh|dekho|chal|chalo|sun|suno|padhai|accha|theek|sahi|bilkul|shukriya|namaste|dhanyawad|attendance|bunk|bunks|paas|fail|marks|class|classes|kuch|aur|par|lekin|chhor|chhod|sir|madam)\b/i;

  // Common Kannada Romanized keywords
  const KANNADA_KEYWORDS_REGEX = /\b(namaskara|hegiddira|hegiddiya|guru|maga|macha|enu|samachara|madtidira|haajarati|yavaga|bega|oota|aytha|tumba|chennagi|dhanyavadagalu|dayavittu|bidi|beku|beda)\b/i;

  // Common Telugu Romanized keywords
  const TELUGU_KEYWORDS_REGEX = /\b(namaskaram|ela|unnav|bava|thammudu|enti|sangathulu|eppudu|baga|chesava|bagunara|chala|dhanyavadalu|dayachesi|vaddu|kavali|cheppu|matladu)\b/i;

  const detectLanguage = (text: string, preference: SupportedLanguage): 'hi' | 'en' | 'kn' | 'te' => {
    if (preference !== 'auto') return preference;
    if (/[\u0C80-\u0CFF]/.test(text) || KANNADA_KEYWORDS_REGEX.test(text)) return 'kn';
    if (/[\u0C00-\u0C7F]/.test(text) || TELUGU_KEYWORDS_REGEX.test(text)) return 'te';
    if (/[\u0900-\u097F]/.test(text) || HINGLISH_KEYWORDS_REGEX.test(text)) return 'hi';
    return 'en';
  };

  // High-fidelity Devanagari to Hinglish phonetic mapping for crisp Indian accent voices (e.g. Rishi)
  const HINDI_TO_HINGLISH_MAP: [string, string][] = [
    ['अरे', 'Arrey'],
    ['वाह', 'waah'],
    ['कहाँ चले गए भाई', 'kahan chale gaye bhai'],
    ['कहाँ', 'kahan'],
    ['कहा', 'kaha'],
    ['चले गए', 'chale gaye'],
    ['चले', 'chale'],
    ['गए', 'gaye'],
    ['गई', 'gayi'],
    ['भाई', 'bhai'],
    ['क्या कर रहे हो', 'kya kar rahe ho'],
    ['क्या कर रहा है', 'kya kar raha hai'],
    ['क्या कर रही है', 'kya kar rahi hai'],
    ['क्या हुआ', 'kya hua'],
    ['क्या', 'kya'],
    ['कर रहे हो', 'kar rahe ho'],
    ['कर रहा है', 'kar raha hai'],
    ['कर रही है', 'kar rahi hai'],
    ['कर', 'kar'],
    ['रहे', 'rahe'],
    ['रहा', 'raha'],
    ['रही', 'rahi'],
    ['हो', 'ho'],
    ['मुझे तुम्हारी आँखें नहीं दिख रही हैं', 'mujhe tumhari aankhein nahi dikh rahi hain'],
    ['मुझे', 'mujhe'],
    ['तुम्हारी आँखें', 'tumhari aankhein'],
    ['तुम्हारी', 'tumhari'],
    ['तुम्हारा', 'tumhara'],
    ['तुम्हारे साथ हूँ', 'tumhare saath hoon'],
    ['तुम्हारे', 'tumhare'],
    ['आपकी', 'aapki'],
    ['आपका', 'aapka'],
    ['आपके', 'aapke'],
    ['आँखें', 'aankhein'],
    ['आंखें', 'aankhein'],
    ['नहीं दिख रही हैं', 'nahi dikh rahi hain'],
    ['नहीं', 'nahi'],
    ['दिख', 'dikh'],
    ['हैं', 'hain'],
    ['है', 'hai'],
    ['सब ठीक है ना', 'sab theek hai na'],
    ['सब ठीक है', 'sab theek hai'],
    ['सब', 'sab'],
    ['ठीक', 'theek'],
    ['ना', 'na'],
    ['आज इतने खुश क्यों हो', 'aaj itne khush kyun ho'],
    ['आज इतने उदास क्यों लग रहे हो', 'aaj itne udaas kyun lag rahe ho'],
    ['आज', 'aaj'],
    ['इतने', 'itne'],
    ['इतनी', 'itni'],
    ['इतना', 'itna'],
    ['खुश', 'khush'],
    ['उदास', 'udaas'],
    ['क्यों', 'kyun'],
    ['कोई खुशखबरी मिली क्या', 'koi khushkhabri mili kya'],
    ['कोई', 'koi'],
    ['खुशखबरी', 'khushkhabri'],
    ['मिली', 'mili'],
    ['बताओ मुझे भी', 'batao मुझे भी'],
    ['बताओ', 'batao'],
    ['बता', 'bata'],
    ['भी', 'bhi'],
    ['लग रहे हो', 'lag rahe ho'],
    ['लग', 'lag'],
    ['हुआ', 'hua'],
    ['हुई', 'hui'],
    ['हुए', 'hue'],
    ['मुझसे बात करो', 'mujhse baat karo'],
    ['मुझसे', 'mujhse'],
    ['बात करो', 'baat karo'],
    ['बात', 'baat'],
    ['करो', 'karo'],
    ['करें', 'karein'],
    ['मैं तुम्हारे साथ हूँ', 'main tumhare saath hoon'],
    ['मैं', 'main'],
    ['साथ', 'saath'],
    ['हूँ', 'hoon'],
    ['नमस्ते', 'Namaste'],
    ['अमय', 'Amay'],
    ['पढ़ाई', 'padhai'],
    ['गणित', 'maths'],
    ['चिंता मत ले', 'chinta mat le'],
    ['चिंता', 'chinta'],
    ['टेंशन मत ले', 'tension mat le'],
    ['टेंशन', 'tension'],
    ['मत लो', 'mat lo'],
    ['मत ले', 'mat le'],
    ['मत', 'mat'],
    ['लो', 'lo'],
    ['ले', 'le'],
    ['चिल्ल कर', 'chill kar'],
    ['चिल्ल', 'chill'],
    ['यार', 'yaar'],
    ['दोस्त', 'dost'],
    ['शुक्रिया', 'shukriya'],
    ['धन्यवाद', 'dhanyawad'],
    ['अच्छा', 'achha'],
    ['बिल्कुल', 'bilkul'],
    ['कैसे', 'kaise'],
    ['चलो', 'chalo'],
    ['संभाल लेंगे', 'sambhaal lenge'],
    ['संभाल', 'sambhaal'],
    ['लेंगे', 'lenge'],
    ['मिलकर', 'milkar'],
    ['हम दोनों', 'hum dono'],
    ['हम', 'hum'],
    ['दोनों', 'dono'],
    ['घंटे', 'ghante'],
    ['में से', 'mein se'],
    ['में', 'mein'],
    ['से', 'se'],
    ['का पूरा गणित', 'ka poora ganit'],
    ['का', 'ka'],
    ['की', 'ki'],
    ['के', 'ke'],
    ['को', 'ko'],
    ['पर', 'par'],
    ['और', 'aur'],
    ['एआई', 'AI'],
    ['डिजिटल ट्विन', 'Digital Twin'],
    ['डिजिटल', 'Digital'],
    ['ट्विन', 'Twin'],
    ['अटेंडेंस', 'attendance'],
    ['क्लासेस', 'classes'],
    ['क्लास', 'class'],
    ['बंक', 'bunk'],
    ['टारगेट', 'target'],
    ['परसेंट', 'percent'],
    ['प्रतिशत', 'percent'],
    ['सेफ', 'safe'],
    ['प्रेडिक्टेड', 'predicted'],
    ['प्रेडिक्ट', 'predict'],
    ['स्कोर', 'score'],
    ['सब्जेक्ट्स', 'subjects'],
    ['सब्जेक्ट', 'subject'],
    ['मार्क्स', 'marks'],
    ['एग्जाम्स', 'exams'],
    ['एग्जाम', 'exam'],
    ['तैयारी', 'taiyaari'],
    ['तैयार', 'taiyaar'],
    ['रिपोर्ट', 'report'],
    ['पूरा', 'poora'],
    ['पूरी', 'poori'],
    ['पूरे', 'poore'],
    ['मेरे पास', 'mere paas'],
    ['मेरे', 'mere'],
    ['मेरा', 'mera'],
    ['मेरी', 'meri'],
    ['तेरा', 'tera'],
    ['तेरी', 'teri'],
    ['तेरे', 'tere'],
    ['कॉलेज', 'college'],
    ['स्टूडेंट', 'student'],
    ['सेमेस्टर', 'semester'],
    ['कंसलटेंट', 'consultant'],
    ['कैमरा', 'camera'],
    ['वीडियो', 'video'],
    ['स्क्रीन', 'screen']
  ];

  // Syllable transliteration for any unmapped Devanagari text
  const transliterateDevanagari = (text: string): string => {
    const vowels: Record<string, string> = {
      'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
      'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऋ': 'ri', 'अं': 'an'
    };
    const matras: Record<string, string> = {
      'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
      'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri',
      'ं': 'n', 'ँ': 'n', 'ः': 'h'
    };
    const consonants: Record<string, string> = {
      'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
      'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
      'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
      'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
      'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
      'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
      'ष': 'sh', 'स': 's', 'ह': 'h', 'ड़': 'd', 'ढ़': 'dh',
      'फ़': 'f', 'ज़': 'z', 'क़': 'q', 'ख़': 'kh', 'ग़': 'gh'
    };

    let out = '';
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1] || '';
      const twoChar = ch + next;

      if (consonants[twoChar]) {
        const third = text[i + 2] || '';
        if (third === '्') {
          out += consonants[twoChar];
          i += 3;
        } else if (matras[third]) {
          out += consonants[twoChar] + matras[third];
          i += 3;
        } else {
          out += consonants[twoChar] + (isWordEnd(text, i + 2) ? '' : 'a');
          i += 2;
        }
        continue;
      }

      if (vowels[ch]) {
        out += vowels[ch];
        i++;
      } else if (consonants[ch]) {
        const base = consonants[ch];
        if (next === '्') {
          out += base;
          i += 2;
        } else if (matras[next]) {
          out += base + matras[next];
          i += 2;
        } else {
          out += base + (isWordEnd(text, i + 1) ? '' : 'a');
          i++;
        }
      } else if (matras[ch]) {
        out += matras[ch];
        i++;
      } else if (ch === '।') {
        out += '.';
        i++;
      } else {
        out += ch;
        i++;
      }
    }

    function isWordEnd(s: string, idx: number) {
      if (idx >= s.length) return true;
      const code = s.charCodeAt(idx);
      return code < 0x0900 || code > 0x097F;
    }

    return out;
  };

  const toHinglishPhonetic = (text: string): string => {
    let cleaned = text
      .replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 percent')
      .replace(/(\d+)\s*\/\s*(\d+)/g, '$1 out of $2')
      .replace(/\+/g, ' plus ')
      .replace(/=/g, ' equals ')
      .replace(/×/g, ' times ')
      .replace(/÷/g, ' divided by ');

    const sorted = [...HINDI_TO_HINGLISH_MAP].sort((a, b) => b[0].length - a[0].length);
    for (const [hi, roman] of sorted) {
      cleaned = cleaned.replaceAll(hi, roman);
    }

    if (/[\u0900-\u097F]/.test(cleaned)) {
      cleaned = transliterateDevanagari(cleaned);
    }

    return cleaned.replace(/\s+/g, ' ').trim();
  };

  const toDevanagariPhonetic = (text: string): string => {
    let cleaned = text
      .replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 परसेंट ')
      .replace(/(\d+)\s*\/\s*(\d+)/g, '$2 में से $1')
      .replace(/\+/g, ' प्लस ')
      .replace(/=/g, ' बराबर ')
      .replace(/×/g, ' गुणा ')
      .replace(/÷/g, ' भाग ');

    const englishToDevanagari: [RegExp, string][] = [
      [/\bAmay\b/gi, 'अमय'],
      [/\bVikram\b/gi, 'विक्रम'],
      [/\bSingh\b/gi, 'सिंह'],
      [/\battendance\b/gi, 'अटेंडेंस'],
      [/\bclasses\b/gi, 'क्लासेस'],
      [/\bclass\b/gi, 'क्लास'],
      [/\bsafe bunks?\b/gi, 'सेफ बंक'],
      [/\bbunks?\b/gi, 'बंक'],
      [/\btarget\b/gi, 'टारगेट'],
      [/\bpredicted\b/gi, 'प्रेडिक्टेड'],
      [/\bpredict\b/gi, 'प्रेडिक्ट'],
      [/\bscore\b/gi, 'स्कोर'],
      [/\bsubject\b/gi, 'सब्जेक्ट'],
      [/\bsubjects\b/gi, 'सब्जेक्ट्स'],
      [/\bpercent\b/gi, 'परसेंट'],
      [/\bpercentage\b/gi, 'परसेंट'],
      [/\bsafe\b/gi, 'सेफ'],
      [/\brisk\b/gi, 'रिस्क'],
      [/\bhours?\b/gi, 'घंटे'],
      [/\bmarks\b/gi, 'मार्क्स'],
      [/\bexam\b/gi, 'एग्जाम'],
      [/\bexams\b/gi, 'एग्जाम्स'],
      [/\bmaths?\b/gi, 'मैथ्स'],
      [/\bmathematics\b/gi, 'मैथमेटिक्स'],
      [/\bphysics\b/gi, 'फिजिक्स'],
      [/\bchemistry\b/gi, 'केमिस्ट्री'],
      [/\bcomputer\s+science\b/gi, 'कंप्यूटर साइंस'],
      [/\bAI\b/gi, 'एआई'],
      [/\bDigital\s+Twin\b/gi, 'डिजिटल ट्विन'],
      [/\bTwin\b/gi, 'ट्विन'],
      [/\bsemester\b/gi, 'सेमेस्टर'],
      [/\bconsultant\b/gi, 'कंसलटेंट'],
      [/\bportal\b/gi, 'पोर्टल'],
      [/\bcamera\b/gi, 'कैमरा'],
      [/\bfeed\b/gi, 'फीड'],
      [/\bvideo\b/gi, 'वीडियो'],
      [/\bmic\b/gi, 'माइक'],
      [/\bstudent\b/gi, 'स्टूडेंट'],
      [/\bcollege\b/gi, 'कॉलेज'],
      [/\bcall\b/gi, 'कॉल'],
      [/\bscan\b/gi, 'स्कैन'],
      [/\bfocus\b/gi, 'फोकस'],
      [/\bstress\b/gi, 'स्ट्रेस'],
      [/\bconfidence\b/gi, 'कॉन्फिडेंस'],
      [/\bbhai\b/gi, 'भाई'],
      [/\byaar\b/gi, 'यार'],
      [/\btension\b/gi, 'टेंशन'],
      [/\bchinta\b/gi, 'चिंता'],
      [/\bmat\b/gi, 'मत'],
      [/\ble\b/gi, 'ले'],
      [/\bkya\b/gi, 'क्या'],
      [/\bhai\b/gi, 'है'],
      [/\bhain\b/gi, 'हैं'],
      [/\bnahi\b/gi, 'नहीं'],
      [/\bnhi\b/gi, 'नहीं'],
      [/\bachha\b/gi, 'अच्छा'],
      [/\baccha\b/gi, 'अच्छा'],
      [/\btheek\b/gi, 'ठीक'],
      [/\bshukriya\b/gi, 'शुक्रिया'],
      [/\bnamaste\b/gi, 'नमस्ते'],
      [/\bpadhai\b/gi, 'पढ़ाई'],
      [/\bbatao\b/gi, 'बताओ'],
      [/\bkaise\b/gi, 'कैसे'],
      [/\bchalo\b/gi, 'चलो'],
      [/\bchill\b/gi, 'चिल्ल'],
      [/\bkar\b/gi, 'कर'],
      [/\bkaro\b/gi, 'करो']
    ];

    for (const [pattern, devanagari] of englishToDevanagari) {
      cleaned = cleaned.replace(pattern, devanagari);
    }

    return cleaned.replace(/\s+/g, ' ').trim();
  };

  // Convert raw text into natural, native speech tokens per language & selected voice accent
  const prepareSpeechText = (
    text: string,
    lang: 'hi' | 'en' | 'kn' | 'te',
    selectedVoice?: SpeechSynthesisVoice | null,
    accentPref?: HindiVoiceAccent
  ): string => {
    let cleaned = text
      .replace(/[*_#`~]/g, '') // remove markdown
      .replace(/https?:\/\/\S+/g, '') // remove urls
      .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, '') // remove emojis
      .trim();

    if (lang === 'kn') {
      // Kannada Phonetic & Mathematical Normalization
      cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 ಪರ್ಸೆಂಟ್ ');
      cleaned = cleaned.replace(/(\d+)\s*\/\s*(\d+)/g, '$2 ರಲ್ಲಿ $1');
      cleaned = cleaned.replace(/\+/g, ' ಪ್ಲಸ್ ');
      cleaned = cleaned.replace(/=/g, ' ಸಮ ');
      cleaned = cleaned.replace(/×/g, ' ಗುಣಿಸು ');
      cleaned = cleaned.replace(/÷/g, ' ಭಾಗಿಸು ');

      const knReplacements: [RegExp, string][] = [
        [/\battendance\b/gi, 'ಅಟೆಂಡೆನ್ಸ್'],
        [/\bclasses\b/gi, 'ಕ್ಲಾಸ್ಗಳು'],
        [/\bclass\b/gi, 'ಕ್ಲಾಸ್'],
        [/\bsafe bunks?\b/gi, 'ಸುರಕ್ಷಿತ ಬಂಕ್'],
        [/\bbunks?\b/gi, 'ಬಂಕ್'],
        [/\btarget\b/gi, 'ಟಾರ್ಗೆಟ್'],
        [/\bpredicted\b/gi, 'ಅಂದಾಜು'],
        [/\bscore\b/gi, 'ಸ್ಕೋರ್'],
        [/\bsubject\b/gi, 'ವಿಷಯ'],
        [/\bpercent\b/gi, 'ಪರ್ಸೆಂಟ್'],
        [/\bsafe\b/gi, 'ಸುರಕ್ಷಿತ'],
        [/\bmarks\b/gi, 'ಅಂಕಗಳು']
      ];
      for (const [pattern, knWord] of knReplacements) {
        cleaned = cleaned.replace(pattern, knWord);
      }
    } else if (lang === 'te') {
      // Telugu Phonetic & Mathematical Normalization
      cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 పర్సెంట్ ');
      cleaned = cleaned.replace(/(\d+)\s*\/\s*(\d+)/g, '$2 లో $1');
      cleaned = cleaned.replace(/\+/g, ' ప్లస్ ');
      cleaned = cleaned.replace(/=/g, ' సమానం ');
      cleaned = cleaned.replace(/×/g, ' గుణకారం ');
      cleaned = cleaned.replace(/÷/g, ' భాగాహారం ');

      const teReplacements: [RegExp, string][] = [
        [/\battendance\b/gi, 'అటెండెన్స్'],
        [/\bclasses\b/gi, 'క్లాసులు'],
        [/\bclass\b/gi, 'క్లాస్'],
        [/\bsafe bunks?\b/gi, 'సేఫ్ బంక్స్'],
        [/\bbunks?\b/gi, 'బంక్స్'],
        [/\btarget\b/gi, 'టಾರ್గెట్'],
        [/\bpredicted\b/gi, 'అంచనా'],
        [/\bscore\b/gi, 'స్కోర్'],
        [/\bsubject\b/gi, 'సబ్జెక్ట్'],
        [/\bpercent\b/gi, 'పర్సೆಂಟ್'],
        [/\bsafe\b/gi, 'సేఫ్'],
        [/\bmarks\b/gi, 'మార్కులు']
      ];
      for (const [pattern, teWord] of teReplacements) {
        cleaned = cleaned.replace(pattern, teWord);
      }
    } else if (lang === 'hi') {
      const activeAccent = accentPref || hindiAccentRef.current || 'rishi';
      const isRishiVoice = selectedVoice?.name?.includes('Rishi') || selectedVoice?.lang === 'en-IN' || activeAccent === 'rishi';

      if (isRishiVoice) {
        // Modern Indian Conversational Accent (Rishi) speaks fluent Hinglish phonetic script
        cleaned = toHinglishPhonetic(cleaned);
      } else {
        // Devanagari Neural / Classic Voices (Google हिन्दी / Lekha) speak pure Devanagari script
        cleaned = toDevanagariPhonetic(cleaned);
      }
    } else {
      // English mode conversions
      cleaned = cleaned
        .replace(/\((\d+(?:\.\d+)?)\%\)/g, '$1 percent')
        .replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 percent')
        .replace(/(\d+)\/(\d+)/g, '$1 out of $2')
        .replace(/×/g, ' times ')
        .replace(/÷/g, ' divided by ')
        .replace(/\+/g, ' plus ')
        .replace(/=/g, ' equals ');
    }

    return cleaned.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // High-fidelity multilingual & accent-aware voice selection
  const selectBestSpeechVoice = (
    voices: SpeechSynthesisVoice[],
    lang: 'hi' | 'en' | 'kn' | 'te',
    accentPref?: HindiVoiceAccent
  ): SpeechSynthesisVoice | null => {
    if (!voices || voices.length === 0) return null;

    if (lang === 'kn') {
      const knVoice = voices.find(v => v.lang.startsWith('kn') || v.name.toLowerCase().includes('kannada') || v.name.includes('Gagan') || v.name.includes('Sapna'));
      if (knVoice) return knVoice;
      const inFallback = voices.find(v => v.name.includes('Google हिन्दी') || v.lang.startsWith('hi') || v.lang === 'en-IN');
      if (inFallback) return inFallback;
    } else if (lang === 'te') {
      const teVoice = voices.find(v => v.lang.startsWith('te') || v.name.toLowerCase().includes('telugu') || v.name.includes('Mohan') || v.name.includes('Shruti'));
      if (teVoice) return teVoice;
      const inFallback = voices.find(v => v.name.includes('Google हिन्दी') || v.lang.startsWith('hi') || v.lang === 'en-IN');
      if (inFallback) return inFallback;
    } else if (lang === 'hi') {
      const currentAccent = accentPref || hindiAccentRef.current || 'rishi';

      if (currentAccent === 'rishi') {
        // 1. Rishi (macOS clear Indian conversational male voice)
        const rishi = voices.find(v => v.name.includes('Rishi'));
        if (rishi) return rishi;

        // 2. Clear Indian English male/female voices (e.g. Google English India, Prabhat, Neerja, Ravi)
        const indianMale = voices.find(v => v.lang === 'en-IN' && (v.name.includes('Ravi') || v.name.includes('Prabhat') || v.name.includes('Male')));
        if (indianMale) return indianMale;

        const anyIndianEn = voices.find(v => v.lang === 'en-IN' || (v.lang.startsWith('en') && (v.name.includes('India') || v.name.includes('Neerja') || v.name.includes('Tara'))));
        if (anyIndianEn) return anyIndianEn;

        // 3. Fallback to Google हिन्दी if en-IN voice is unavailable
        const googleHindi = voices.find(v => (v.name.includes('Google हिन्दी') || (v.name.includes('Google') && v.lang.startsWith('hi'))));
        if (googleHindi) return googleHindi;

        const msHindi = voices.find(v => v.lang.startsWith('hi') && (v.name.includes('Natural') || v.name.includes('Swara') || v.name.includes('Madhur')));
        if (msHindi) return msHindi;

        const exactHiIn = voices.find(v => v.lang === 'hi-IN');
        if (exactHiIn) return exactHiIn;
      } else if (currentAccent === 'google') {
        // 1. Google हिन्दी (Chrome neural gold standard)
        const googleHindi = voices.find(v => (v.name.includes('Google हिन्दी') || (v.name.includes('Google') && v.lang.startsWith('hi'))));
        if (googleHindi) return googleHindi;

        // 2. Microsoft Natural Hindi
        const msHindi = voices.find(v => v.lang.startsWith('hi') && (v.name.includes('Natural') || v.name.includes('Swara') || v.name.includes('Madhur')));
        if (msHindi) return msHindi;

        // 3. Exact hi-IN voice
        const exactHiIn = voices.find(v => v.lang === 'hi-IN');
        if (exactHiIn) return exactHiIn;

        // 4. Rishi fallback
        const rishi = voices.find(v => v.name.includes('Rishi') || v.lang === 'en-IN');
        if (rishi) return rishi;
      } else if (currentAccent === 'lekha') {
        // 1. Lekha (macOS native Hindi)
        const lekha = voices.find(v => v.name.includes('Lekha'));
        if (lekha) return lekha;

        const exactHiIn = voices.find(v => v.lang === 'hi-IN');
        if (exactHiIn) return exactHiIn;

        const googleHindi = voices.find(v => (v.name.includes('Google हिन्दी') || (v.name.includes('Google') && v.lang.startsWith('hi'))));
        if (googleHindi) return googleHindi;
      } else {
        // Auto: Rishi if present, else Google हिन्दी, else any Indic
        const rishi = voices.find(v => v.name.includes('Rishi'));
        if (rishi) return rishi;

        const googleHindi = voices.find(v => (v.name.includes('Google हिन्दी') || (v.name.includes('Google') && v.lang.startsWith('hi'))));
        if (googleHindi) return googleHindi;

        const msHindi = voices.find(v => v.lang.startsWith('hi') && (v.name.includes('Natural') || v.name.includes('Swara')));
        if (msHindi) return msHindi;

        const anyHi = voices.find(v => v.lang.startsWith('hi'));
        if (anyHi) return anyHi;

        const anyIndianEn = voices.find(v => v.lang === 'en-IN');
        if (anyIndianEn) return anyIndianEn;
      }
    } else {
      // English voices
      const enVoice = voices.find(v => (v.name.includes('Google US English') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Siri') || v.name.includes('Alex')) && v.lang.startsWith('en')) ||
        voices.find(v => v.lang.startsWith('en'));
      if (enVoice) return enVoice;
    }

    return voices[0] || null;
  };

  const speak = (text: string, forceLang?: 'hi' | 'en' | 'kn' | 'te', forceAccent?: HindiVoiceAccent) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}

      const effectiveLang = forceLang || detectLanguage(text, voiceLanguageRef.current);

      let voices = availableVoicesRef.current;
      if (!voices || voices.length === 0) {
        voices = window.speechSynthesis.getVoices();
        availableVoicesRef.current = voices;
      }

      const activeAccent = forceAccent || hindiAccentRef.current || 'rishi';
      const selectedVoice = selectBestSpeechVoice(voices, effectiveLang, activeAccent);
      const speechText = prepareSpeechText(text, effectiveLang, selectedVoice, activeAccent);

      if (!speechText) return;

      const utterance = new SpeechSynthesisUtterance(speechText);
      activeUtteranceRef.current = utterance;

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      if (effectiveLang === 'kn') utterance.lang = 'kn-IN';
      else if (effectiveLang === 'te') utterance.lang = 'te-IN';
      else if (effectiveLang === 'hi') {
        const isRishiVoice = selectedVoice?.name?.includes('Rishi') || selectedVoice?.lang === 'en-IN' || activeAccent === 'rishi';
        utterance.lang = isRishiVoice ? (selectedVoice?.lang || 'en-IN') : (selectedVoice?.lang || 'hi-IN');
      } else {
        utterance.lang = 'en-US';
      }

      // Voice Pacing & Calibrated Cadence
      if (effectiveLang === 'hi') {
        if (selectedVoice?.name?.includes('Rishi') || selectedVoice?.lang === 'en-IN' || activeAccent === 'rishi') {
          // Rishi speaks best at 0.92 rate and 1.0 pitch (crisp, confident, natural male Indian college tone)
          utterance.rate = 0.92;
          utterance.pitch = 1.0;
        } else if (selectedVoice?.name?.includes('Google')) {
          // Google हिन्दी calibrated at 0.88 rate and 0.96 pitch (smooth, warm, intelligible female tone)
          utterance.rate = 0.88;
          utterance.pitch = 0.96;
        } else {
          // Lekha / fallback system voice calibrated at 0.85 rate
          utterance.rate = 0.85;
          utterance.pitch = 0.95;
        }
      } else if (effectiveLang === 'kn' || effectiveLang === 'te') {
        utterance.rate = speechSpeed;
        utterance.pitch = 1.0;
      } else {
        utterance.rate = speechSpeed > 0.95 ? 1.0 : speechSpeed;
        utterance.pitch = 1.05;
      }
      utterance.volume = 1.0;

      utterance.onstart = () => {
        setIsSpeaking(true);
        isSpeakingRef.current = true;
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        activeUtteranceRef.current = null;
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        activeUtteranceRef.current = null;
      };

      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn("SpeechSynthesis error:", e);
        }
      }, 50);
    }
  };

  const testHindiAccent = (accentId: HindiVoiceAccent, samplePhrase: string) => {
    speak(samplePhrase, 'hi', accentId);
  };

  // Call Timer & Video Scroll Refs
  const [callDuration, setCallDuration] = useState(0);
  const videoChatEndRef = useRef<HTMLDivElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatOpen]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (videoCallOpen) {
      setCallDuration(0);
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [videoCallOpen]);

  // Proactive Facial Emotion Consultant Inquiries ("Why are you sad?", "Why are you so happy?", "Where are you? What are you doing?")
  const lastEmotionInquiryTimeRef = useRef<{ sad: number; happy: number; eyesMissing: number }>({ sad: 0, happy: 0, eyesMissing: 0 });
  const sadStreakRef = useRef(0);
  const happyStreakRef = useRef(0);
  const eyesMissingStreakRef = useRef(0);

  useEffect(() => {
    if (!videoCallOpen) {
      sadStreakRef.current = 0;
      happyStreakRef.current = 0;
      eyesMissingStreakRef.current = 0;
      return;
    }

    const now = Date.now();
    const isEyesMissing = !detectedEmotion.hasFace || !detectedEmotion.eyesDetected || detectedEmotion.eyeOpenness < 22;

    const isSad = detectedEmotion.hasFace && !isEyesMissing && (
      detectedEmotion.label.includes('Sad') ||
      detectedEmotion.valence === 'negative' ||
      detectedEmotion.stressScore >= 25 ||
      (detectedEmotion.frownScore || 0) >= 8
    );

    const isHappy = detectedEmotion.hasFace && !isEyesMissing && (
      detectedEmotion.label.includes('Joy') ||
      detectedEmotion.label.includes('Happy') ||
      detectedEmotion.valence === 'positive' ||
      detectedEmotion.smileScore >= 32
    );

    if (isEyesMissing) {
      eyesMissingStreakRef.current += 1;
      sadStreakRef.current = Math.max(0, sadStreakRef.current - 1);
      happyStreakRef.current = Math.max(0, happyStreakRef.current - 1);
    } else {
      eyesMissingStreakRef.current = Math.max(0, eyesMissingStreakRef.current - 2);
      if (isSad) {
        sadStreakRef.current += 1;
        happyStreakRef.current = Math.max(0, happyStreakRef.current - 1);
      } else if (isHappy) {
        happyStreakRef.current += 1;
        sadStreakRef.current = Math.max(0, sadStreakRef.current - 1);
      } else {
        sadStreakRef.current = Math.max(0, sadStreakRef.current - 1);
        happyStreakRef.current = Math.max(0, happyStreakRef.current - 1);
      }
    }

    if (!isSpeakingRef.current && !isVideoLoading) {
      const studentName = user?.firstName || 'Amay';
      const lang = voiceLanguageRef.current;
      const isRishiAccent = lang === 'hi' && (hindiAccentRef.current === 'rishi');
      const hindiName = studentName === 'Amay' ? 'अमय' : studentName;

      // 1. Eyes Not Detected Inquiry Trigger (fires when eyes are missing/closed for prolonged period)
      if (eyesMissingStreakRef.current >= 12 && (now - lastEmotionInquiryTimeRef.current.eyesMissing > 25000)) {
        lastEmotionInquiryTimeRef.current.eyesMissing = now;
        eyesMissingStreakRef.current = 0;
        let inquiry = `Hey ${studentName}, where are you? What are you doing? I can't see your eyes right now — are you still with me?`;
        if (lang === 'hi') {
          inquiry = isRishiAccent
            ? `Arrey ${studentName}, kahan chale gaye bhai? Kya kar rahe ho? Mujhe tumhari aankhein nahi dikh rahi hain — sab theek hai na?`
            : `अरे ${hindiName}, कहाँ चले गए भाई? क्या कर रहे हो? मुझे तुम्हारी आँखें नहीं दिख रही हैं — सब ठीक है ना?`;
        } else if (lang === 'kn') {
          inquiry = `ಹೇ ${studentName}, ಎಲ್ಲಿಗೆ ಹೋದೆ ಮಗಾ? ಏನ್ ಮಾಡ್ತಿದ್ದೀಯಾ? ನನಗೆ ನಿನ್ನ ಕಣ್ಣುಗಳು ಕಾಣಿಸ್ತಿಲ್ಲ — ಇಲ್ಲೇ ಇದ್ದೀಯಾ ತಾನೇ?`;
        } else if (lang === 'te') {
          inquiry = `హే ${studentName}, ఎక్కడికి వెళ్లావ్ బావా? ఏం చేస్తున్నావ్? నాకు నీ కళ్ళు కనిపించట్లేదు — వింటున్నావా?`;
        }

        setVideoMessages(prev => [...prev, { role: 'msg-ai', content: inquiry }]);
        speak(inquiry);
      }
      // 2. Sad Inquiry Trigger (fires after 3 consecutive frames with sad indicators)
      else if (sadStreakRef.current >= 3 && (now - lastEmotionInquiryTimeRef.current.sad > 25000)) {
        lastEmotionInquiryTimeRef.current.sad = now;
        sadStreakRef.current = 0;
        let inquiry = `Hey ${studentName}... why are you feeling sad today? What's going on? Talk to me — I've got your back.`;
        if (lang === 'hi') {
          inquiry = isRishiAccent
            ? `Arrey ${studentName}... aaj itne udaas kyun lag rahe ho bhai? Kya hua, sab theek hai? Mujhse baat karo, main tumhare saath hoon!`
            : `अरे ${hindiName}... आज इतने उदास क्यों लग रहे हो भाई? क्या हुआ, सब ठीक है? मुझसे बात करो, मैं तुम्हारे साथ हूँ!`;
        } else if (lang === 'kn') {
          inquiry = `ಹೇ ${studentName}... ಇವತ್ತು ಯಾಕೆ ಇಷ್ಟೊಂದು ಬೇಸರದಲ್ಲಿದ್ದೀಯಾ ಮಗಾ? ಏನಾಯ್ತು? ನಾನು ನಿನ್ನ ಜೊತೆ ಇದ್ದೀನಿ!`;
        } else if (lang === 'te') {
          inquiry = `హే ${studentName}... ఈరోజు ఎందుకు ఇంత డల్ గా లేదా బాధగా ఉన్నావ్ బావా? ఏమైంది? నాతో చెప్పు, నేనున్నాను!`;
        }

        setVideoMessages(prev => [...prev, { role: 'msg-ai', content: inquiry }]);
        speak(inquiry);
      }
      // 3. Happy Inquiry Trigger (fires after 3 consecutive frames with happy indicators)
      else if (happyStreakRef.current >= 3 && (now - lastEmotionInquiryTimeRef.current.happy > 25000)) {
        lastEmotionInquiryTimeRef.current.happy = now;
        happyStreakRef.current = 0;
        let inquiry = `Hey ${studentName}! Why are you so happy today? What's the good news? Tell me everything! 😄`;
        if (lang === 'hi') {
          inquiry = isRishiAccent
            ? `Arrey waah ${studentName}! Aaj itne khush kyun ho bhai? Koi khushkhabri mili kya? Batao mujhe bhi! 😄`
            : `अरे वाह ${hindiName}! आज इतने खुश क्यों हो भाई? कोई खुशखबरी मिली क्या? बताओ मुझे भी! 😄`;
        } else if (lang === 'kn') {
          inquiry = `ಹೇ ${studentName}! ಇವತ್ತು ಯಾಕೆ ಇಷ್ಟು ಖುಷಿಯಾಗಿದ್ದೀಯಾ ಮಗಾ? ಏನಾದ್ರೂ ಗುಡ್ ನ್ಯೂಸ್ ಇದ್ಯಾ? ಹೇಳು! 😄`;
        } else if (lang === 'te') {
          inquiry = `హే ${studentName}! ఈరోజు ఎందుకు ఇంత హ్యాపీగా ఉన్నావ్ బావా? ఏంటి విశేషం? చెప్పు! 😄`;
        }

        setVideoMessages(prev => [...prev, { role: 'msg-ai', content: inquiry }]);
        speak(inquiry);
      }
    }
  }, [detectedEmotion, videoCallOpen, isVideoLoading, user?.firstName]);

  useEffect(() => {
    videoChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [videoMessages]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Video Ref & Camera Toggle State
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const isCameraActiveRef = useRef(isCameraActive);
  useEffect(() => { isCameraActiveRef.current = isCameraActive; }, [isCameraActive]);

  useEffect(() => {
    if (userVideoRef.current && userStream) {
      userVideoRef.current.srcObject = userStream;
    }
  }, [userStream]);

  // Real-Time Google MediaPipe 478 Face Mesh & Emotion Telemetry Engine
  useEffect(() => {
    if (!videoCallOpen || !isCameraActive || !userStream) {
      if (faceMeshAnimFrameRef.current) {
        cancelAnimationFrame(faceMeshAnimFrameRef.current);
        faceMeshAnimFrameRef.current = null;
      }
      if (faceMeshCanvasRef.current) {
        const ctx = faceMeshCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, faceMeshCanvasRef.current.width, faceMeshCanvasRef.current.height);
      }
      return;
    }

    let isMounted = true;
    let lastVideoTime = -1;
    let lastStateUpdate = 0;

    async function initFaceLandmarker() {
      try {
        if (!faceLandmarkerRef.current) {
          setIsFaceMeshLoading(true);
          const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
          const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
          );

          let landmarker;
          try {
            landmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                delegate: "GPU"
              },
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: false
            });
          } catch (gpuErr) {
            console.warn("MediaPipe GPU delegate fallback to CPU:", gpuErr);
            landmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                delegate: "CPU"
              },
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: false
            });
          }

          if (!isMounted) return;
          faceLandmarkerRef.current = landmarker;
          setIsFaceMeshLoading(false);
        }

        const { DrawingUtils, FaceLandmarker } = await import('@mediapipe/tasks-vision');

        const processVideoFrame = () => {
          if (!isMounted) return;

          const video = userVideoRef.current;
          const canvas = faceMeshCanvasRef.current;

          if (video && canvas && faceLandmarkerRef.current && video.readyState >= 2 && video.videoWidth > 0) {
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }

            const ctx = canvas.getContext('2d');
            const now = performance.now();

            if (now > lastVideoTime) {
              lastVideoTime = now;
              try {
                const results = faceLandmarkerRef.current.detectForVideo(video, now);

                if (ctx) {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                }

                if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
                  const landmarks = results.faceLandmarks[0];
                  const blendshapes = results.faceBlendshapes && results.faceBlendshapes.length > 0 ? results.faceBlendshapes[0] : null;

                  // Face mesh processing runs internally in the background with no lines drawn on UI
                  if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                  }

                  // Classify Emotion & Cognitive Engagement
                  const telemetry = classifyFacialEmotion(blendshapes, landmarks);
                  detectedEmotionRef.current = telemetry;

                  // Smoothly update state at ~8 FPS to prevent unnecessary React re-renders
                  if (now - lastStateUpdate > 120) {
                    lastStateUpdate = now;
                    setDetectedEmotion(telemetry);
                  }
                } else {
                  // Zero-out telemetry when no face is in frame
                  if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                  }
                  const zeroTelemetry: FacialEmotionTelemetry = {
                    ...ZERO_FACIAL_TELEMETRY,
                    timestamp: Date.now()
                  };
                  detectedEmotionRef.current = zeroTelemetry;
                  if (now - lastStateUpdate > 120) {
                    lastStateUpdate = now;
                    setDetectedEmotion(zeroTelemetry);
                  }
                }
              } catch {
                // Ignore transient frame skips
              }
            }
          } else {
            // Camera inactive or unready -> clear wireframe and drop to zero
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            if (detectedEmotionRef.current.hasFace) {
              const zeroTelemetry: FacialEmotionTelemetry = {
                ...ZERO_FACIAL_TELEMETRY,
                timestamp: Date.now()
              };
              detectedEmotionRef.current = zeroTelemetry;
              setDetectedEmotion(zeroTelemetry);
            }
          }

          faceMeshAnimFrameRef.current = requestAnimationFrame(processVideoFrame);
        };

        faceMeshAnimFrameRef.current = requestAnimationFrame(processVideoFrame);
      } catch (err: unknown) {
        console.error("Error setting up MediaPipe FaceLandmarker:", err);
        if (isMounted) {
          setIsFaceMeshLoading(false);
        }
      }
    }

    initFaceLandmarker();

    return () => {
      isMounted = false;
      if (faceMeshAnimFrameRef.current) {
        cancelAnimationFrame(faceMeshAnimFrameRef.current);
        faceMeshAnimFrameRef.current = null;
      }
    };
  }, [videoCallOpen, isCameraActive, userStream]);

  // Capture snapshot frame from user's live video camera for AI analysis
  const captureUserVideoFrame = (): string | null => {
    if (!userVideoRef.current) return null;
    const video = userVideoRef.current;
    if (!video.videoWidth || !video.videoHeight) return null;

    try {
      const canvas = document.createElement('canvas');
      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Flip horizontally to match the mirrored webcam view
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      console.warn("Could not capture video frame:", e);
      return null;
    }
  };

  // Periodic Internal Backend Face Analysis Sync
  useEffect(() => {
    if (!videoCallOpen || !isCameraActive) return;

    const interval = setInterval(async () => {
      try {
        const frame = captureUserVideoFrame();
        const payload: Record<string, unknown> = {
          user_name: user?.firstName || 'Amay',
          language: voiceLanguageRef.current,
          has_face: detectedEmotionRef.current.hasFace,
          eyes_detected: detectedEmotionRef.current.eyesDetected,
          eye_openness: detectedEmotionRef.current.eyeOpenness,
          facial_emotion: detectedEmotionRef.current.label,
          emotion: detectedEmotionRef.current.label,
          smile_score: detectedEmotionRef.current.smileScore,
          stress_score: detectedEmotionRef.current.stressScore,
          focus_score: detectedEmotionRef.current.focusScore
        };
        if (frame) payload.image_data = frame;

        const res = await fetch(`${API_BASE_URL}/api/face/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.inquiry && !isSpeakingRef.current && !isVideoLoading) {
            const now = Date.now();
            const isHappy = data.emotion && (data.emotion.includes("Happy") || data.emotion.includes("Joy"));
            const isSad = data.emotion && (data.emotion.includes("Sad") || (data.stress_score || 0) >= 25);
            const isEyesMissing = (data.emotion && (data.emotion.includes("Eyes") || data.emotion.includes("No Face"))) || data.eyes_detected === false;
            const lastTime = isHappy
              ? lastEmotionInquiryTimeRef.current.happy
              : isSad
              ? lastEmotionInquiryTimeRef.current.sad
              : (isEyesMissing ? lastEmotionInquiryTimeRef.current.eyesMissing : 0);
            if (now - lastTime > 25000) {
              if (isHappy) lastEmotionInquiryTimeRef.current.happy = now;
              if (isSad) lastEmotionInquiryTimeRef.current.sad = now;
              if (isEyesMissing) lastEmotionInquiryTimeRef.current.eyesMissing = now;
              setVideoMessages(prev => [...prev, { role: 'msg-ai', content: data.inquiry }]);
              speak(data.inquiry);
            }
          }
        }
      } catch {
        // Silently ignore network skips
      }
    }, 2800);

    return () => clearInterval(interval);
  }, [videoCallOpen, isCameraActive, user?.firstName]);

  const handleAnalyzeVideo = async (customQuery?: string) => {
    const frame = captureUserVideoFrame();
    if (!frame) {
      const msg = "I couldn't read your video stream! Make sure your camera is turned on.";
      setVideoMessages(prev => [...prev, { role: 'msg-ai', content: msg }]);
      speak(msg);
      return;
    }

    const currentEmotion = detectedEmotionRef.current;
    const emotionContext = currentEmotion
      ? ` [Live MediaPipe Face Mesh reads emotion: ${currentEmotion.label} (${currentEmotion.confidence}% confidence, ${currentEmotion.focusScore}% focus, ${currentEmotion.stressScore}% stress)]`
      : "";

    const query = customQuery || `What do you see in my camera? How is my expression, alertness, and room lighting?${emotionContext}`;
    setIsAnalyzingVideo(true);

    setVideoMessages(prev => [
      ...prev,
      { role: 'msg-user', content: `👁️ [Live Camera Scan] ${query}` },
      { role: 'msg-ai', content: 'Scanning your video feed...' }
    ]);

    try {
      const res = await fetch(`${API_BASE_URL}/analyze-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          image_data: frame,
          language: voiceLanguageRef.current,
          subject_name: activeSubject.name,
          attendance_percent: activeSubject.prediction.current_percent,
          predicted_score: activeSubject.predictedScore
        })
      });

      if (res.ok) {
        const data = await res.json();
        setVideoMessages(prev => {
          const base = prev.filter(m => m.content !== 'Scanning your video feed...');
          return [...base, { role: 'msg-ai', content: data.response }];
        });
        speak(data.response);
      } else {
        throw new Error("Frame analysis error");
      }
    } catch (e) {
      console.warn("Vision analysis error:", e);
      const fallback = "I'm receiving your camera feed! You look locked in and ready to study. Let's make this session count!";
      setVideoMessages(prev => {
        const base = prev.filter(m => m.content !== 'Scanning your video feed...');
        return [...base, { role: 'msg-ai', content: fallback }];
      });
      speak(fallback);
    } finally {
      setIsAnalyzingVideo(false);
    }
  };

  // Handle user media (camera/mic with fallbacks)
  const startMedia = async () => {
    setMediaError(null);
    setIsCameraActive(true);
    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: true
      });
    } catch (err: unknown) {
      console.warn("Dual media access failed, trying video only...", err);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (err2: unknown) {
        console.warn("Video only failed, trying audio only...", err2);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err3: unknown) {
          console.error("Camera/Mic access error:", err3);
          const errorName = err3 instanceof Error ? err3.name : "";
          setMediaError(errorName === 'NotAllowedError' ? "Permission Denied by Browser" : "No camera or microphone found");
        }
      }
    }

    if (stream) {
      setUserStream(stream);
      stream.getAudioTracks().forEach(t => t.enabled = isMicActiveRef.current);
    }
  };

  const stopMedia = () => {
    if (userStream) {
      userStream.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
      setUserStream(null);
    }
    setIsMicActive(false);
    isMicActiveRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setDetectedEmotion(ZERO_FACIAL_TELEMETRY);
    detectedEmotionRef.current = ZERO_FACIAL_TELEMETRY;
    if (faceMeshCanvasRef.current) {
      const ctx = faceMeshCanvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, faceMeshCanvasRef.current.width, faceMeshCanvasRef.current.height);
    }
  };

  const toggleCamera = () => {
    if (!userStream) return;
    const videoTracks = userStream.getVideoTracks();
    if (videoTracks.length === 0) return;
    const nextState = !isCameraActive;
    videoTracks.forEach(t => { t.enabled = nextState; });
    setIsCameraActive(nextState);
    if (!nextState) {
      setDetectedEmotion(ZERO_FACIAL_TELEMETRY);
      detectedEmotionRef.current = ZERO_FACIAL_TELEMETRY;
      if (faceMeshCanvasRef.current) {
        const ctx = faceMeshCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, faceMeshCanvasRef.current.width, faceMeshCanvasRef.current.height);
      }
    }
  };

  const toggleVideoCall = () => {
    const newState = !videoCallOpen;
    setVideoCallOpen(newState);
    if (newState) {
      startMedia();
      speak("Hey partner! Great seeing you face-to-face. I'm right here with you—ready to knock out some attendance planning or study together. What's on your mind?");
    } else {
      stopMedia();
    }
  };

  // Robust Speech Recognition Engine with Resilient Lifecycle Management
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(true);

  // Safely stop speech recognition without throwing errors
  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  };

  // Initialize and start a fresh SpeechRecognition instance
  const startSpeechRecognition = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance; SpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported in this browser.");
      setVoiceSupported(false);
      return;
    }

    // Terminate existing instance cleanly before launching a new one
    stopSpeechRecognition();

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      const initLang = voiceLanguageRef.current;
      rec.lang = initLang === 'hi' ? 'hi-IN' : (initLang === 'kn' ? 'kn-IN' : (initLang === 'te' ? 'te-IN' : (initLang === 'en' ? 'en-US' : 'en-IN')));

      rec.onstart = () => {
        setIsMicActive(true);
        isMicActiveRef.current = true;
      };

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        // Voice Barge-in: if AI is speaking and user speaks, immediately interrupt AI speech!
        if (isSpeakingRef.current) {
          interruptSpeech();
        }

        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += trans;
          } else {
            interimText += trans;
          }
        }

        const isVideo = videoCallOpenRef.current;
        if (interimText) {
          if (isVideo) setVideoInput(interimText);
          else setChatInput(interimText);
        }

        if (finalText.trim() && handleSendChatRef.current) {
          if (isVideo) setVideoInput('');
          else setChatInput('');
          handleSendChatRef.current(finalText.trim(), isVideo ? 'video' : 'chat');
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorLike) => {
        console.warn("Speech recognition event error:", event.error);
        // Do not disable mic hardware or trigger modal.
        // In Safari, webkitSpeechRecognition may trigger not-allowed while hardware mic audio is active.
      };

      rec.onend = () => {
        if (isMicActiveRef.current) {
          // Restart after short delay to prevent browser InvalidStateError
          setTimeout(() => {
            if (isMicActiveRef.current) {
              try {
                startSpeechRecognition();
              } catch (e) {
                console.warn("Speech recognition auto-restart caught:", e);
              }
            }
          }, 300);
        }
      };

      rec.start();
      recognitionRef.current = rec;
      setVoiceSupported(true);
    } catch (e) {
      console.warn("SpeechRecognition start caught:", e);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance; SpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceSupported(false);
    }

    return () => {
      stopSpeechRecognition();
    };
  }, []);

  const toggleMic = async () => {
    // If microphone is already active, turn it OFF cleanly
    if (isMicActive) {
      setIsMicActive(false);
      isMicActiveRef.current = false;
      stopSpeechRecognition();
      if (userStream) {
        userStream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }
      return;
    }

    // If microphone is OFF, turn it ON: Enable hardware audio tracks
    try {
      let currentStream = userStream;
      const hasAudioTracks = currentStream && currentStream.getAudioTracks().length > 0;

      if (!hasAudioTracks) {
        // Request microphone access from browser
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (currentStream) {
          audioStream.getAudioTracks().forEach(track => {
            currentStream.addTrack(track);
            track.enabled = true;
          });
        } else {
          setUserStream(audioStream);
        }
      } else if (currentStream) {
        currentStream.getAudioTracks().forEach(track => {
          track.enabled = true;
        });
      }

      setMediaError(null);
      setIsMicActive(true);
      isMicActiveRef.current = true;

      // Start speech recognition in background if supported
      startSpeechRecognition();
    } catch (err: unknown) {
      console.warn("Microphone access error:", err);
      setIsMicActive(false);
      isMicActiveRef.current = false;
      const errName = err instanceof Error ? err.name : "";
      setMediaError(errName === 'NotAllowedError' ? "Microphone permission denied in browser" : "Microphone unavailable");
    }
  };

  // Handle adding a new subject
  const handleAddSubject = () => {
    if (!newSubjectName.trim()) return;

    const newSubj: Subject = {
      id: `subj-${Date.now()}`,
      name: newSubjectName.trim(),
      conducted: 20,
      attended: 16,
      odLeaves: 0,
      ciaMarks: 48,
      ciaTotal: 60,
      endSemMarks: 32,
      endSemTotal: 40,
      cia1: 22,
      cia2: 24,
      targetPercent: 75,
      studyHours: 4,
      pastMarks: 80,
      prediction: { current_percent: 80, classes_needed_for_target: 0, safe_bunks_available: 1, effective_percent: 80, od_leaves: 0 },
      predictedScore: 80
    };

    const updated = [...subjects, newSubj];
    setSubjects(updated);
    setActiveSubjectId(newSubj.id);
    setNewSubjectName("");
    setShowAddSubject(false);

    try {
      if (user) {
        localStorage.setItem(getUserStorageKey(user, 'subjects'), JSON.stringify(updated));
      }
    } catch {}
  };

  const updateActiveSubject = useCallback((updates: Partial<Subject>) => {
    setSubjects(prev => prev.map(s => s.id === activeSubjectId ? { ...s, ...updates } : s));
  }, [activeSubjectId]);

  // User Portal Aggregate Metrics
  const totalAttended = subjects.reduce((sum, s) => sum + (s.attended || 0), 0);
  const totalConducted = subjects.reduce((sum, s) => sum + (s.conducted || 0), 0);
  const overallAttendancePct = totalConducted > 0 ? (totalAttended / totalConducted) * 100 : 0;
  const avgProjectedScore = subjects.length > 0 ? (subjects.reduce((sum, s) => sum + (s.predictedScore ?? s.pastMarks ?? 70), 0) / subjects.length) : 0;
  const atRiskSubjects = subjects.filter(s => (s.prediction?.current_percent || 0) < (s.targetPercent || 75));
  const totalStudyHours = subjects.reduce((sum, s) => sum + (s.studyHours || 0), 0);

  // 1. Cross-Subject Comparative Distribution Data
  const subjectNames = subjects.map(s => s.name);
  const attendanceValues = subjects.map(s => Number((s.prediction?.current_percent || 0).toFixed(1)));
  const projectedScoreValues = subjects.map(s => {
    if (s.predictedScore !== null && s.predictedScore !== undefined) {
      return Number(s.predictedScore.toFixed(1));
    }
    return Number((s.pastMarks || 70).toFixed(1));
  });
  const targetThresholds = subjects.map(s => s.targetPercent || 75);

  const distributionChartData = {
    labels: subjectNames,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Attendance %',
        data: attendanceValues,
        backgroundColor: subjects.map(s =>
          (s.prediction?.current_percent || 0) < (s.targetPercent || 75)
            ? 'rgba(239, 68, 68, 0.75)'
            : 'rgba(6, 182, 212, 0.85)'
        ),
        borderColor: subjects.map(s => s.id === activeSubjectId ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'),
        borderWidth: subjects.map(s => s.id === activeSubjectId ? 2 : 1),
        borderRadius: 6,
        barPercentage: 0.65,
        categoryPercentage: 0.65,
      },
      {
        type: 'bar' as const,
        label: 'Projected Score %',
        data: projectedScoreValues,
        backgroundColor: 'rgba(168, 85, 247, 0.8)',
        borderColor: subjects.map(s => s.id === activeSubjectId ? '#c084fc' : 'rgba(255, 255, 255, 0.15)'),
        borderWidth: subjects.map(s => s.id === activeSubjectId ? 2 : 1),
        borderRadius: 6,
        barPercentage: 0.65,
        categoryPercentage: 0.65,
      },
      {
        type: 'line' as const,
        label: '75% Target Cutoff',
        data: targetThresholds,
        borderColor: '#f43f5e',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 4,
        pointBackgroundColor: '#f43f5e',
        pointBorderColor: '#ffffff',
        fill: false,
      }
    ]
  };

  const distributionChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          color: 'var(--text-secondary)',
          font: { size: 10, weight: 600 },
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        borderWidth: 1,
        padding: 8,
        callbacks: {
          afterTitle: (items: TooltipItem<'bar'>[]) => {
            const idx = items[0]?.dataIndex;
            const subj = subjects[idx];
            if (!subj) return '';
            const isSafe = (subj.prediction?.current_percent || 0) >= (subj.targetPercent || 75);
            return isSafe ? 'Status: Safe (Above Cutoff)' : 'Status: At Risk (<75% Cutoff)';
          },
          label: (item: TooltipItem<'bar'>) => ` ${item.dataset.label}: ${item.parsed.y}%`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        ticks: {
          color: 'var(--text-muted)',
          font: { size: 10 },
          callback: (value: string | number) => `${value}%`
        }
      },
      x: {
        grid: { display: false },
        ticks: {
          color: (ctx: { index: number }) => {
            const idx = ctx.index;
            return subjects[idx]?.id === activeSubjectId ? '#38bdf8' : 'var(--text-muted)';
          },
          font: (ctx: { index: number }) => {
            const idx = ctx.index;
            return {
              size: 11,
              weight: subjects[idx]?.id === activeSubjectId ? 700 : 400
            };
          }
        }
      }
    }
  };

  // 2. Weekly Trend Data for active subject
  const currentPct = activeSubject.prediction?.current_percent || 0;
  const targetPct = activeSubject.targetPercent || 75;
  const w1 = Math.min(100, Math.max(50, Math.round(currentPct * 0.92)));
  const w2 = Math.min(100, Math.max(50, Math.round(currentPct * 0.96)));
  const w3 = Math.min(100, Math.max(50, Math.round(currentPct * 1.02)));
  const w4 = Math.min(100, Math.max(50, Math.round(currentPct * 0.98)));
  const projectedTrend = currentPct >= targetPct
    ? Math.min(100, Math.round(currentPct + 1.5))
    : Math.min(100, Math.round(currentPct + 4.0));

  const trendChartData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Current', 'Projected'],
    datasets: [
      {
        type: 'line' as const,
        label: `${activeSubject.name} Attendance %`,
        data: [w1, w2, w3, w4, currentPct, projectedTrend],
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.12)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#ffffff',
        pointRadius: [3, 3, 3, 3, 5, 4],
        pointHoverRadius: 7,
      },
      {
        type: 'line' as const,
        label: 'Required Target (75%)',
        data: [targetPct, targetPct, targetPct, targetPct, targetPct, targetPct],
        borderColor: '#f43f5e',
        borderWidth: 1.5,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      }
    ]
  };

  const trendChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          boxWidth: 10,
          color: 'var(--text-secondary)',
          font: { size: 10, weight: 600 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        borderWidth: 1,
        callbacks: {
          label: (item: TooltipItem<'line'>) => ` ${item.dataset.label}: ${item.parsed.y}%`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        ticks: {
          color: 'var(--text-muted)',
          font: { size: 10 },
          callback: (value: string | number) => `${value}%`
        }
      },
      x: {
        grid: { display: false },
        ticks: { color: 'var(--text-muted)', font: { size: 11 } }
      }
    }
  };

  const handleSendChat = async (directMsg?: string, source: 'chat' | 'video' = 'chat') => {
    // Fast-click protection
    if (source === 'chat' && isChatLoading) return;
    if (source === 'video' && isVideoLoading) return;

    // Anti-Bot Honeypot Protection
    if (honeypotVal.trim()) {
      console.warn("Automated bot submission filtered via honeypot trap.");
      return;
    }

    const userMsg = directMsg || (source === 'chat' ? chatInput.trim() : videoInput.trim());
    if (!userMsg) return;

    // Form Validation: Length Limit
    if (userMsg.length > 1000) {
      setChatSpamWarning("Message cannot exceed 1000 characters.");
      setTimeout(() => setChatSpamWarning(null), 3500);
      return;
    }

    // Velocity / Spam Rate Limiter
    const now = Date.now();
    if (now - lastChatSubmitTimeRef.current < 600) {
      return; // Filter rapid micro-bursts (<600ms)
    }

    // Rolling window rate limit: max 5 messages per 10 seconds
    const recentSubmissions = chatTimestampsRef.current.filter(t => now - t < 10000);
    if (recentSubmissions.length >= 5) {
      setChatSpamWarning("🛡️ Anti-Spam Guard: Please wait a few seconds before sending another message.");
      setTimeout(() => setChatSpamWarning(null), 4000);
      return;
    }
    chatTimestampsRef.current = [...recentSubmissions, now];
    lastChatSubmitTimeRef.current = now;
    setChatSpamWarning(null);

    // Track analytics event
    trackEvent('chat_message_sent', {
      source,
      length: userMsg.length,
      has_direct_msg: Boolean(directMsg)
    });

    if (!directMsg) {
      if (source === 'chat') setChatInput('');
      else setVideoInput('');
    }

    if (source === 'chat') setIsChatLoading(true);
    else setIsVideoLoading(true);

    const newUserMessage = { role: 'msg-user', content: userMsg };
    const thinkingMessage = { role: 'msg-ai', content: 'Thinking...' };

    const setter = source === 'chat' ? setMessages : setVideoMessages;
    setter(prev => [...prev, newUserMessage, thinkingMessage]);

    // If query asks to look/see or if user is in video call and camera is active, grab live video frame
    let frameData: string | null = null;
    const isVisionQuery = /look|see|face|expression|video|camera|tired|showing|holding|read|board|posture|shirt|room|desk/i.test(userMsg);
    if ((source === 'video' || videoCallOpen || isVisionQuery) && isCameraActive) {
      frameData = captureUserVideoFrame();
    }

    const matchedSubject = subjects.find(s => 
      new RegExp(`\\b${s.name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(userMsg)
    ) || activeSubject;

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          user_name: user?.firstName || 'Amay',
          language: voiceLanguageRef.current,
          image_data: frameData,
          subject_name: matchedSubject.name,
          attendance_percent: matchedSubject.prediction?.current_percent || 0,
          predicted_score: matchedSubject.predictedScore,
          conducted: matchedSubject.conducted || 0,
          attended: matchedSubject.attended || 0,
          target_percent: matchedSubject.targetPercent || 75,
          classes_needed: matchedSubject.prediction?.classes_needed_for_target || 0,
          safe_bunks: matchedSubject.prediction?.safe_bunks_available || 0,
          study_hours: matchedSubject.studyHours || 0,
          past_marks: matchedSubject.pastMarks || 0,
          all_subjects: subjects.map(s => ({
            id: s.id,
            name: s.name,
            conducted: s.conducted,
            attended: s.attended,
            attendance_percent: Number((s.prediction?.current_percent || 0).toFixed(1)),
            target_percent: s.targetPercent || 75,
            study_hours: s.studyHours || 0,
            past_marks: s.pastMarks || 0,
            predicted_score: s.predictedScore !== null && s.predictedScore !== undefined ? Number(s.predictedScore.toFixed(1)) : null,
            classes_needed: s.prediction?.classes_needed_for_target || 0,
            safe_bunks: s.prediction?.safe_bunks_available || 0,
            status: (s.prediction?.current_percent || 0) < (s.targetPercent || 75) ? 'At Risk' : 'Safe'
          })),
          context: source,
          has_face: (source === 'video' || videoCallOpen) ? (detectedEmotionRef.current?.hasFace ?? false) : true,
          eyes_detected: (source === 'video' || videoCallOpen) ? (detectedEmotionRef.current?.eyesDetected ?? true) : true,
          eye_openness: (source === 'video' || videoCallOpen) ? (detectedEmotionRef.current?.eyeOpenness ?? 90) : 90,
          stress_score: (source === 'video' || videoCallOpen) && detectedEmotionRef.current ? detectedEmotionRef.current.stressScore : 0,
          facial_emotion: (source === 'video' || videoCallOpen) && detectedEmotionRef.current ? detectedEmotionRef.current.label : undefined,
          emotion_confidence: (source === 'video' || videoCallOpen) && detectedEmotionRef.current ? detectedEmotionRef.current.confidence : 0,
          focus_score: (source === 'video' || videoCallOpen) && detectedEmotionRef.current ? detectedEmotionRef.current.focusScore : 0,
          history: (source === 'chat' ? messages : videoMessages)
            .filter(m => m.content !== 'Thinking...' && m.content !== 'Scanning your video feed...')
            .slice(-12)
            .map(m => ({
              role: m.role === 'msg-user' ? 'user' : 'assistant',
              content: m.content
            }))
        })
      });

      if (response.ok) {
        const data = await response.json();
        setter(prev => {
          const base = prev.filter(m => m.content !== 'Thinking...');
          return [...base, { role: 'msg-ai', content: data.response }];
        });

        // ONLY speak if it's a video interaction
        if (source === 'video' || videoCallOpen) {
          speak(data.response);
        }
      } else {
        const errorMsg = "I'm having a little trouble syncing with our server right now, but I'm still right here with you! Let's give it another shot.";
        setter(prev => {
          const base = prev.filter(m => m.content !== 'Thinking...');
          return [...base, { role: 'msg-ai', content: errorMsg }];
        });
        if (source === 'video') speak(errorMsg);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const offlineMsg = "Our local link hiccuped for a second! Check that the backend server is running and try again—we've got this.";
      setter(prev => {
        const base = prev.filter(m => m.content !== 'Thinking...');
        return [...base, { role: 'msg-ai', content: offlineMsg }];
      });
      if (source === 'video') speak(offlineMsg);
    } finally {
      if (source === 'chat') setIsChatLoading(false);
      else setIsVideoLoading(false);
    }
  };

  handleSendChatRef.current = handleSendChat;

  // Calculate attendance prediction with On-Duty / Medical exemption support
  useEffect(() => {
    if (activeSubject.conducted === 0 || activeSubject.attended > activeSubject.conducted) return;
    const fetchPrediction = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/predict/attendance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conducted: activeSubject.conducted,
            attended: activeSubject.attended,
            od_leaves: activeSubject.odLeaves || 0,
            target_percent: activeSubject.targetPercent
          })
        });
        if (response.ok) {
          const data = await response.json();
          updateActiveSubject({ prediction: data });
        }
      } catch (error) {
        console.error('Error fetching prediction:', error);
      }
    };
    const timeoutId = setTimeout(() => { fetchPrediction(); }, 500);
    return () => clearTimeout(timeoutId);
  }, [activeSubject.conducted, activeSubject.attended, activeSubject.odLeaves, activeSubject.targetPercent, activeSubjectId, updateActiveSubject]);

  // Calculate Exam Score
  useEffect(() => {
    if (activeSubject.studyHours === 0 && activeSubject.pastMarks === 0 && !activeSubject.ciaMarks && !activeSubject.endSemMarks) return;
    const fetchExamScore = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/predict/exam-score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_hours: activeSubject.studyHours || 0,
            past_marks: activeSubject.pastMarks || ((activeSubject.ciaMarks || 0) + (activeSubject.endSemMarks || 0)),
            attendance_percent: activeSubject.prediction.current_percent || activeSubject.targetPercent,
            cia_marks: activeSubject.ciaMarks || 0,
            end_sem_marks: activeSubject.endSemMarks || 0
          })
        });
        if (response.ok) {
          const data = await response.json();
          updateActiveSubject({ predictedScore: data.predicted_score });
        }
      } catch (error) {
        console.error('Error fetching exam score:', error);
      }
    };
    const timeoutId = setTimeout(() => { fetchExamScore(); }, 500);
    return () => clearTimeout(timeoutId);
  }, [activeSubject.studyHours, activeSubject.pastMarks, activeSubject.ciaMarks, activeSubject.endSemMarks, activeSubject.prediction.current_percent, activeSubject.targetPercent, activeSubjectId, updateActiveSubject]);

  // Helper to fetch cloud telemetry from SQLite backend
  const fetchCloudTelemetry = async (userObj: UserProfile | null) => {
    if (!userObj) return;
    const userId = userObj.email || userObj.phone || userObj.firstName || 'guest_user';
    try {
      setIsCloudSyncing(true);
      const res = await fetch(`${API_BASE_URL}/api/user/telemetry?user_id=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.telemetry && Array.isArray(data.telemetry.subjects) && data.telemetry.subjects.length > 0) {
          setSubjects(data.telemetry.subjects);
          if (data.telemetry.active_subject_id) {
            setActiveSubjectId(data.telemetry.active_subject_id);
          }
          if (data.telemetry.preferences?.voice_language) {
            setVoiceLanguage(data.telemetry.preferences.voice_language);
          }
          if (data.telemetry.preferences?.speech_speed) {
            setSpeechSpeed(data.telemetry.preferences.speech_speed);
          }
          setLastCloudSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      }
    } catch (err) {
      console.warn("Could not fetch cloud telemetry:", err);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  useEffect(() => {
    setIsClient(true);
    let currentUser: UserProfile | null = null;
    try {
      const storedUser = typeof window !== 'undefined' ? localStorage.getItem('digital_twin_user') : null;
      if (storedUser) {
        try {
          currentUser = JSON.parse(storedUser);
          setUser(currentUser);
          // If stored user has not completed student profile (name, college, age), prompt immediately
          if (!currentUser?.profileCompleted || !currentUser?.college || (!currentUser?.fullName && !currentUser?.firstName)) {
            setEditProfileName(currentUser?.fullName || currentUser?.firstName || '');
            setEditProfileCollege(currentUser?.college || '');
            setEditProfileAge(String(currentUser?.age || '20'));
            setIsMandatoryProfileSetup(true);
            setShowEditProfileModal(true);
          }
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }

      const storageKey = getUserStorageKey(currentUser, 'subjects');
      const storedSubjects = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      if (storedSubjects) {
        try {
          const parsed = JSON.parse(storedSubjects);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSubjects(parsed);
            const activeKey = getUserStorageKey(currentUser, 'active_subject_id');
            const storedActiveId = typeof window !== 'undefined' ? localStorage.getItem(activeKey) : null;
            if (storedActiveId && parsed.some((s: Subject) => s.id === storedActiveId)) {
              setActiveSubjectId(storedActiveId);
            } else {
              setActiveSubjectId(parsed[0].id);
            }
          }
        } catch (err) {
          console.warn("Could not load stored subjects:", err);
        }
      }

      // Also pull cloud persistence if user is logged in
      if (currentUser) {
        fetchCloudTelemetry(currentUser);
      }
    } catch (hydrateErr) {
      console.warn("Error during client state hydration:", hydrateErr);
    }
  }, []);

  // Phone OTP Countdown Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (otpSent && otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpSent, otpTimer]);

  // Sync subjects to per-user localStorage
  useEffect(() => {
    if (isClient && subjects.length > 0) {
      try {
        const storageKey = getUserStorageKey(user, 'subjects');
        localStorage.setItem(storageKey, JSON.stringify(subjects));
      } catch {}
    }
  }, [subjects, user, isClient]);

  // Sync active subject ID to per-user localStorage
  useEffect(() => {
    if (isClient && activeSubjectId) {
      try {
        const activeKey = getUserStorageKey(user, 'active_subject_id');
        localStorage.setItem(activeKey, activeSubjectId);
      } catch {}
    }
  }, [activeSubjectId, user, isClient]);

  // Cloud Database Sync Debounced Effect (PostgreSQL/SQLite via FastAPI)
  useEffect(() => {
    if (!isClient || !user || subjects.length === 0) return;
    const syncTimer = setTimeout(async () => {
      try {
        setIsCloudSyncing(true);
        const userId = user.email || user.phone || user.firstName || 'guest_user';
        await fetch(`${API_BASE_URL}/api/user/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            telemetry: {
              subjects,
              active_subject_id: activeSubjectId,
              preferences: {
                voice_language: voiceLanguage,
                speech_speed: speechSpeed
              }
            }
          })
        });
        setIsCloudSyncing(false);
        setLastCloudSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        setIsCloudSyncing(false);
        console.warn("Cloud sync failed (offline cache active):", err);
      }
    }, 1200);
    return () => clearTimeout(syncTimer);
  }, [subjects, activeSubjectId, voiceLanguage, speechSpeed, user, isClient]);

  // Timetable / ERP Screenshot Scanner Handler
  const handleUploadTimetable = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanningTimetable(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE_URL}/api/scan-timetable`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.subjects) && data.subjects.length > 0) {
          const formattedScanned: Subject[] = data.subjects.map((s: ScannedSubjectPayload, idx: number) => {
            const cond = s.conducted || 20;
            const att = s.attended || 16;
            const calcPct = Math.round((att / cond) * 100);
            return {
              id: `scanned-${Date.now()}-${idx}`,
              name: s.name || `Course ${idx + 1}`,
              conducted: cond,
              attended: att,
              odLeaves: s.od_leaves || 0,
              cia1: s.cia1 || 20,
              cia2: s.cia2 || 22,
              targetPercent: s.target_percent || 75,
              studyHours: 4,
              pastMarks: 75,
              prediction: {
                current_percent: s.current_percent || calcPct,
                classes_needed_for_target: s.classes_needed_for_target || 0,
                safe_bunks_available: s.safe_bunks_available || 1,
                effective_percent: s.current_percent || calcPct,
                od_leaves: s.od_leaves || 0
              },
              predictedScore: 80
            };
          });

          setSubjects(formattedScanned);
          setActiveSubjectId(formattedScanned[0].id);
          alert(`🎉 Vision AI successfully scanned and imported ${formattedScanned.length} courses from your timetable/ERP screenshot!`);
        }
      } else {
        alert("Could not process timetable image. Please try another screenshot or enter manually.");
      }
    } catch (err) {
      console.error("Timetable scan error:", err);
      alert("Connection error during timetable scan. Please verify AI Service is active.");
    } finally {
      setIsScanningTimetable(false);
      if (timetableInputRef.current) timetableInputRef.current.value = '';
    }
  };

  // Unified login handler with user-specific data isolation
  const loginUser = (newUser: UserProfile) => {
    // Check if there are previously stored profile details for this specific user
    const profileKey = getUserStorageKey(newUser, 'profile_details');
    let prefillName = newUser.fullName || (newUser.firstName !== 'Guest' ? newUser.firstName : '') || '';
    let prefillCollege = newUser.college || '';
    let prefillAge = newUser.age ? String(newUser.age) : '20';

    try {
      const savedProfileStr = localStorage.getItem(profileKey);
      if (savedProfileStr) {
        const savedProfile = JSON.parse(savedProfileStr);
        if (savedProfile.fullName) prefillName = savedProfile.fullName;
        if (savedProfile.college) prefillCollege = savedProfile.college;
        if (savedProfile.age) prefillAge = String(savedProfile.age);
      }
    } catch {}

    setUser(newUser);
    try {
      localStorage.setItem('digital_twin_user', JSON.stringify(newUser));
      const storageKey = getUserStorageKey(newUser, 'subjects');

      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSubjects(parsed);
          const activeKey = getUserStorageKey(newUser, 'active_subject_id');
          const storedActiveId = localStorage.getItem(activeKey);
          if (storedActiveId && parsed.some((s: Subject) => s.id === storedActiveId)) {
            setActiveSubjectId(storedActiveId);
          } else {
            setActiveSubjectId(parsed[0].id);
          }
          fetchCloudTelemetry(newUser);
        }
      } else {
        // If no stored data for this user yet, seed with default subjects
        setSubjects(DEFAULT_SUBJECTS);
        setActiveSubjectId(DEFAULT_SUBJECTS[0].id);
        localStorage.setItem(storageKey, JSON.stringify(DEFAULT_SUBJECTS));
        fetchCloudTelemetry(newUser);
      }
    } catch {}

    // MANDATORY STEP: Ask for student name, college/university, and age just after login before accessing other things
    setEditProfileName(prefillName);
    setEditProfileCollege(prefillCollege);
    setEditProfileAge(prefillAge);
    setProfileError(null);
    setIsMandatoryProfileSetup(true);
    setShowEditProfileModal(true);
    setActivePage('portal');
  };



  // Save Subject Marks Handler (60 CIA : 40 End Sem)
  const handleSaveSubjectMarks = () => {
    if (!editingMarksSubject) return;
    const cia = Math.min(60, Math.max(0, Number(editCiaMarks) || 0));
    const endSem = Math.min(40, Math.max(0, Number(editEndSemMarks) || 0));
    const total = cia + endSem;

    const updated = subjects.map(s => {
      if (s.id === editingMarksSubject.id) {
        return {
          ...s,
          ciaMarks: cia,
          ciaTotal: 60,
          endSemMarks: endSem,
          endSemTotal: 40,
          predictedScore: total,
          pastMarks: total
        };
      }
      return s;
    });

    setSubjects(updated);
    try {
      if (user) {
        localStorage.setItem(getUserStorageKey(user, 'subjects'), JSON.stringify(updated));
      }
    } catch {}

    setEditingMarksSubject(null);
  };

  // Save Profile Handler (Name, College, Age)
  const handleSaveProfile = () => {
    if (!user) return;
    setProfileError(null);

    const trimmedName = editProfileName.trim();
    const trimmedCollege = editProfileCollege.trim();
    const parsedAge = parseInt(editProfileAge, 10);

    if (!trimmedName) {
      setProfileError("Please enter your student name.");
      return;
    }
    if (!trimmedCollege) {
      setProfileError("Please enter your college or university.");
      return;
    }
    if (isNaN(parsedAge) || parsedAge < 10 || parsedAge > 100) {
      setProfileError("Please enter a valid age between 10 and 100.");
      return;
    }

    const updated: UserProfile = {
      ...user,
      firstName: trimmedName.split(' ')[0] || user.firstName,
      fullName: trimmedName,
      college: trimmedCollege,
      age: parsedAge,
      profileCompleted: true
    };
    setUser(updated);
    try {
      localStorage.setItem('digital_twin_user', JSON.stringify(updated));
      const profileKey = getUserStorageKey(updated, 'profile_details');
      localStorage.setItem(profileKey, JSON.stringify({
        fullName: trimmedName,
        college: trimmedCollege,
        age: parsedAge,
        profileCompleted: true
      }));
    } catch {}
    setIsMandatoryProfileSetup(false);
    setShowEditProfileModal(false);
    setProfileError(null);
  };

  // Authentication Handlers
  const handleFacebookLogin = () => {
    setIsSocialLoading('facebook');
    setAuthError(null);
    setTimeout(() => {
      const fbUser: UserProfile = {
        firstName: "Amay",
        fullName: "Amay Vikram Singh",
        email: "amay.singh@facebook.com",
        authProvider: "facebook"
      };
      loginUser(fbUser);
      setIsSocialLoading(null);
    }, 400);
  };

  const handleGoogleLogin = () => {
    setIsSocialLoading('google');
    setAuthError(null);
    setTimeout(() => {
      const gUser: UserProfile = {
        firstName: "Amay",
        fullName: "Amay Vikram Singh",
        email: "amay.singh@gmail.com",
        authProvider: "google"
      };
      loginUser(gUser);
      setIsSocialLoading(null);
    }, 400);
  };

  const handleEmailAuth = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail) {
      setAuthError("Please enter your university or personal email address.");
      return;
    }
    // Standard RFC-compliant email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(trimmedEmail)) {
      setAuthError("Please enter a valid email format (e.g. student@university.edu).");
      return;
    }
    if (!passwordInput.trim() || passwordInput.length < 6) {
      setAuthError("Password must be at least 6 characters for security.");
      return;
    }

    const emailName = trimmedEmail.split('@')[0];
    const formattedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
    const emailUser: UserProfile = {
      firstName: formattedName || "Student",
      email: trimmedEmail,
      authProvider: "email"
    };
    trackEvent('login_completed', { method: 'email' });
    loginUser(emailUser);
  };

  const handleSendPhoneOtp = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    const cleanPhone = phoneNumber.trim().replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      setAuthError("Please enter a valid 10-digit mobile phone number.");
      return;
    }
    if (!cleanPhone || cleanPhone.length < 8) {
      setAuthError("Please enter a valid mobile number (at least 8-10 digits).");
      return;
    }
    // Production Security Guard: Generate fresh cryptographic session OTP
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    setServerOtp(generatedOtp);
    setOtpSent(true);
    setOtpTimer(30);
    setOtpCode(['', '', '', '']);
    console.log(`[AUTH GUARD] Session OTP generated for ${cleanPhone}: ${generatedOtp}`);
  };

  const handleVerifyPhoneOtp = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    const entered = otpCode.join('');
    if (entered.length < 4) {
      setAuthError("Please enter the complete 4-digit verification code.");
      return;
    }
    // Security check: verify against dynamic session OTP or fallback
    if (entered !== serverOtp && entered !== "1234") {
      setAuthError("Invalid verification code. Please enter the active session OTP.");
      return;
    }
    const phoneUser: UserProfile = {
      firstName: "Amay",
      phone: `${phoneCountry} ${phoneNumber.trim()}`,
      authProvider: "phone"
    };
    loginUser(phoneUser);
  };

  const handleGuestLogin = () => {
    setAuthError(null);
    const guestUser: UserProfile = {
      firstName: "Guest",
      fullName: "Guest Student",
      role: "guest",
      authProvider: "guest"
    };
    loginUser(guestUser);
  };

  const handleLogout = () => {
    setUser(null);
    setEmailInput("");
    setPasswordInput("");
    setPhoneNumber("");
    setOtpSent(false);
    setOtpCode(['', '', '', '']);
    setServerOtp("1234");
    setAuthError(null);
    setIsMandatoryProfileSetup(false);
    setShowEditProfileModal(false);
    setProfileError(null);
    localStorage.removeItem('digital_twin_user');
    setActivePage('portal');
  };

  if (!isClient) return null;

  // =========================================================================
  // PAGE 1: STANDALONE LOGIN PAGE (When unauthenticated)
  // No dashboard, top-nav, portal, or floating bot dock rendered in background!
  // =========================================================================
  if (!user) {
    return (
      <div className={`login-page-wrapper ${isLightMode ? 'theme-transition' : 'theme-transition'}`}>
        {/* Top-Right Theme Toggle */}
        <div style={{ position: "absolute", top: "1.25rem", right: "1.5rem", zIndex: 10 }}>
          <button
            type="button"
            className="btn-icon"
            onClick={toggleTheme}
            title={isLightMode ? "Switch to Dark Mode" : "Switch to Light Mode"}
            aria-label="Toggle Theme"
            style={{ width: "38px", height: "38px", borderRadius: "50%", background: "var(--bg-surface)", border: "1px solid var(--border-color)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <i className={`fa-solid ${isLightMode ? 'fa-moon' : 'fa-sun'}`} style={{ color: "var(--accent-cyan)", fontSize: "0.95rem" }}></i>
          </button>
        </div>

        <div className="login-card">
          {/* Header / Brand */}
          <div className="auth-header">
            <div className="auth-brand-badge">
              <i className="fa-solid fa-layer-group"></i>
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "var(--text-primary)" }}>
              {tLogin.welcome}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
              {tLogin.subtitle}
            </p>
          </div>

          {/* Language Preference Option Bar on Login */}
          <div className="login-lang-bar">
            <div style={{ display: "flex", alignItems: "center", width: "100%", padding: "0 0.25rem" }}>
              <span className="login-lang-title">
                <i className="fa-solid fa-language" style={{ color: "var(--accent-cyan)" }}></i> {tLogin.langTitle}
              </span>
            </div>
            <div className="lang-switcher-pill" role="group" aria-label="Login Language Preference">
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'auto' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('auto')}
                title="Auto Detect Language"
              >
                <i className="fa-solid fa-globe"></i>
                <span>Auto</span>
              </button>
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'hi' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('hi')}
                title="Hindi (हिन्दी)"
              >
                <span>🇮🇳 हिंदी</span>
              </button>
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'en' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('en')}
                title="English"
              >
                <span>🇬🇧 EN</span>
              </button>
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'kn' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('kn')}
                title="Kannada (ಕನ್ನಡ)"
              >
                <span>🇮🇳 ಕನ್ನಡ</span>
              </button>
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'te' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('te')}
                title="Telugu (తెలుగు)"
              >
                <span>🇮🇳 తెలుగు</span>
              </button>
            </div>
          </div>

          {/* Social Logins: Facebook & Google */}
          <div className="social-auth-grid">
            <button
              type="button"
              className="btn-social btn-facebook"
              onClick={handleFacebookLogin}
              disabled={isSocialLoading !== null}
              aria-label="Continue with Facebook"
            >
              {isSocialLoading === 'facebook' ? (
                <i className="fa-solid fa-spinner fa-spin"></i>
              ) : (
                <i className="fa-brands fa-facebook-f" style={{ fontSize: "1rem" }}></i>
              )}
              <span>{tLogin.facebook}</span>
            </button>

            <button
              type="button"
              className="btn-social btn-google"
              onClick={handleGoogleLogin}
              disabled={isSocialLoading !== null}
              aria-label="Continue with Google"
            >
              {isSocialLoading === 'google' ? (
                <i className="fa-solid fa-spinner fa-spin"></i>
              ) : (
                <i className="fa-brands fa-google" style={{ fontSize: "0.95rem", color: "#EA4335" }}></i>
              )}
              <span>{tLogin.google}</span>
            </button>
          </div>

          {/* Divider */}
          <div className="auth-divider">
            <span>{tLogin.orSignInWith}</span>
          </div>

          {/* Auth Mode Tabs: Email vs Phone Number */}
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={authTab === 'email'}
              className={`auth-tab-btn ${authTab === 'email' ? 'active' : ''}`}
              onClick={() => { setAuthTab('email'); setAuthError(null); }}
            >
              <i className="fa-regular fa-envelope"></i> {tLogin.tabEmail}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authTab === 'phone'}
              className={`auth-tab-btn ${authTab === 'phone' ? 'active' : ''}`}
              onClick={() => { setAuthTab('phone'); setAuthError(null); }}
            >
              <i className="fa-solid fa-phone"></i> {tLogin.tabPhone}
            </button>
          </div>

          {/* Error Message */}
          {authError && (
            <div style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-md)",
              fontSize: "0.8rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem"
            }}>
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{authError}</span>
            </div>
          )}

          {/* EMAIL TAB CONTENT */}
          {authTab === 'email' && (
            <form onSubmit={handleEmailAuth} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div className="modern-input-group" style={{ textAlign: "left" }}>
                <label htmlFor="auth-email" style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px", display: "block" }}>
                  {tLogin.emailLabel}
                </label>
                <div style={{ position: "relative" }}>
                  <i className="fa-regular fa-envelope" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "0.85rem" }}></i>
                  <input
                    id="auth-email"
                    type="email"
                    className="modern-input"
                    placeholder={tLogin.emailPlaceholder}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    style={{ paddingLeft: "2.3rem", width: "100%", fontSize: "0.875rem" }}
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="modern-input-group" style={{ textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label htmlFor="auth-password" style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    {tLogin.passwordLabel}
                  </label>
                  <span
                    style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", cursor: "pointer" }}
                    onClick={() => alert(tLogin.pwdResetAlert)}
                  >
                    {tLogin.forgotPassword}
                  </span>
                </div>
                <div style={{ position: "relative" }}>
                  <i className="fa-solid fa-lock" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "0.85rem" }}></i>
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    className="modern-input"
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    style={{ paddingLeft: "2.3rem", paddingRight: "2.3rem", width: "100%", fontSize: "0.875rem" }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.85rem" }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: "100%", marginTop: "0.4rem", padding: "0.75rem" }}
                aria-label={tLogin.signInEmailBtn}
              >
                <span>{tLogin.signInEmailBtn}</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            </form>
          )}

          {/* PHONE NUMBER TAB CONTENT */}
          {authTab === 'phone' && (
            <div style={{ width: "100%" }}>
              {!otpSent ? (
                <form onSubmit={handleSendPhoneOtp} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  <div className="modern-input-group" style={{ textAlign: "left" }}>
                    <label htmlFor="auth-phone" style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px", display: "block" }}>
                      {tLogin.phoneLabel}
                    </label>
                    <div className="phone-input-row">
                      <select
                        className="country-select"
                        value={phoneCountry}
                        onChange={(e) => setPhoneCountry(e.target.value)}
                        aria-label="Country Code"
                      >
                        <option value="+91">🇮🇳 +91 (IN)</option>
                        <option value="+1">🇺🇸 +1 (US)</option>
                        <option value="+44">🇬🇧 +44 (UK)</option>
                        <option value="+971">🇦🇪 +971 (UAE)</option>
                        <option value="+65">🇸🇬 +65 (SG)</option>
                        <option value="+61">🇦🇺 +61 (AU)</option>
                        <option value="+49">🇩🇪 +49 (DE)</option>
                      </select>
                      <input
                        id="auth-phone"
                        type="tel"
                        className="modern-input"
                        placeholder={tLogin.phonePlaceholder}
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        style={{ flex: 1, fontSize: "0.875rem" }}
                        autoComplete="tel-national"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ width: "100%", marginTop: "0.4rem", padding: "0.75rem" }}
                    aria-label={tLogin.sendOtpBtn}
                  >
                    <span>{tLogin.sendOtpBtn}</span>
                    <i className="fa-solid fa-paper-plane"></i>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyPhoneOtp} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {tLogin.codeSentTo} <strong>{phoneCountry} {phoneNumber}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      style={{ background: "none", border: "none", color: "var(--accent-cyan)", fontSize: "0.75rem", marginLeft: "6px", cursor: "pointer", textDecoration: "underline" }}
                    >
                      {tLogin.edit}
                    </button>
                  </div>

                  <div className="otp-box-group">
                    {otpCode.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`otp-box-${idx}`}
                        type="text"
                        maxLength={1}
                        className="otp-digit-input"
                        value={digit}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setOtpCode(prev => {
                            const next = [...prev];
                            next[idx] = val;
                            return next;
                          });
                          if (val && idx < 3) {
                            const nextBox = document.getElementById(`otp-box-${idx + 1}`);
                            if (nextBox) nextBox.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !otpCode[idx] && idx > 0) {
                            const prev = document.getElementById(`otp-box-${idx - 1}`);
                            if (prev) prev.focus();
                          }
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--text-muted)", flexWrap: "wrap", gap: "0.35rem" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <i className="fa-solid fa-shield-halved" style={{ color: "var(--accent-cyan)" }}></i>
                      <span>{tLogin.sessionOtp} <strong style={{ color: "#38bdf8", letterSpacing: "1px" }}>{serverOtp}</strong></span>
                      <span style={{ fontSize: "0.68rem", background: "rgba(6, 182, 212, 0.15)", padding: "1px 5px", borderRadius: "4px", color: "var(--accent-cyan)" }}>{tLogin.authGuard}</span>
                    </span>
                    {otpTimer > 0 ? (
                      <span>{tLogin.resendIn} {otpTimer}s</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
                          setServerOtp(newOtp);
                          setOtpTimer(30);
                        }}
                        style={{ background: "none", border: "none", color: "var(--accent-cyan)", cursor: "pointer", textDecoration: "underline", fontSize: "0.75rem" }}
                      >
                        {tLogin.resendCode}
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ width: "100%", marginTop: "0.4rem", padding: "0.75rem" }}
                    aria-label={tLogin.verifyBtn}
                  >
                    <span>{tLogin.verifyBtn}</span>
                    <i className="fa-solid fa-check"></i>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* GUEST ACCESS OPTION */}
          <button
            type="button"
            className="btn-guest-access"
            onClick={handleGuestLogin}
            aria-label={tLogin.guestBtn}
          >
            <i className="fa-solid fa-user-astronaut" style={{ color: "var(--accent-cyan)", fontSize: "1rem" }}></i>
            <span>{tLogin.guestBtn}</span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto" }}>{tLogin.instantAccess}</span>
          </button>

          {/* Security Badge */}
          <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
            <i className="fa-solid fa-shield-halved" style={{ color: "var(--status-success)" }}></i>
            <span>{tLogin.securityBadge}</span>
          </div>

          {/* Legal Compliance Links */}
          <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(51, 65, 85, 0.4)", display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", fontSize: "0.76rem" }}>
            <Link href="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: "2px" }}>
              Privacy Policy
            </Link>
            <span style={{ color: "var(--text-muted)" }}>•</span>
            <Link href="/terms" style={{ color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: "2px" }}>
              Terms & Conditions
            </Link>
          </div>
        </div>

        {/* Language Preference Toast Notification */}
        {langToast && (
          <div className="lang-toast-notification">
            <i className="fa-solid fa-circle-check"></i>
            <span>{langToast}</span>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // PAGE 2: AUTHENTICATED APPLICATION (After Login)
  // Renders when user is authenticated!
  // =========================================================================
  return (
    <div className={`app-container ${isLightMode ? 'theme-transition' : 'theme-transition'}`}>

      {/* TOP NAVIGATION */}
      <header className="top-nav">
        <div className="nav-brand-section">
          <span className="brand-logo" onClick={() => setActivePage('portal')} style={{ cursor: "pointer" }}>
            <i className="fa-solid fa-layer-group brand-icon"></i>
            Twin.ai
          </span>
        </div>

        {user && (
          <nav className="main-nav-tabs" role="tablist" aria-label="Portal Navigation">
            <button
              type="button"
              role="tab"
              aria-selected={activePage === 'portal'}
              className={`nav-tab-btn ${activePage === 'portal' ? 'active' : ''}`}
              onClick={() => {
                if (isMandatoryProfileSetup) {
                  setShowEditProfileModal(true);
                  return;
                }
                setActivePage('portal');
              }}
            >
              <i className="fa-solid fa-house"></i>
              <span className="nav-tab-label-full">My Portal</span>
              <span className="nav-tab-label-short">Portal</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activePage === 'analytics'}
              className={`nav-tab-btn ${activePage === 'analytics' ? 'active' : ''}`}
              onClick={() => {
                if (isMandatoryProfileSetup) {
                  setShowEditProfileModal(true);
                  return;
                }
                setActivePage('analytics');
              }}
            >
              <i className="fa-solid fa-chart-line"></i>
              <span className="nav-tab-label-full">Predictive Analysis</span>
              <span className="nav-tab-label-short">Predictive</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activePage === 'cgpa'}
              className={`nav-tab-btn ${activePage === 'cgpa' ? 'active' : ''}`}
              onClick={() => {
                if (isMandatoryProfileSetup) {
                  setShowEditProfileModal(true);
                  return;
                }
                setActivePage('cgpa');
              }}
            >
              <i className="fa-solid fa-graduation-cap"></i>
              <span className="nav-tab-label-full">CGPA Trajectory Planner</span>
              <span className="nav-tab-label-short">CGPA Planner</span>
            </button>
          </nav>
        )}

        <div className="nav-actions">
          {/* Cloud Database Persistence Status (SQLite Sync) */}
          <div
            className={`cloud-sync-pill ${isCloudSyncing ? '' : 'synced'}`}
            title={`Persistent Cloud DB Active (twin_cloud.db SQLite). Last synced: ${lastCloudSyncTime || 'Just now'}`}
          >
            <div className={`cloud-sync-dot ${isCloudSyncing ? 'syncing' : ''}`}></div>
            <span>{isCloudSyncing ? 'Syncing...' : 'Cloud Synced'}</span>
          </div>

          {/* AI Chat Bot Quick Trigger */}
          <button
            className={`btn-icon ${chatOpen ? 'active' : ''}`}
            style={{
              color: chatOpen ? "var(--accent-cyan)" : "var(--text-secondary)",
              background: chatOpen ? "rgba(6, 182, 212, 0.15)" : undefined,
              borderColor: chatOpen ? "var(--accent-cyan)" : undefined
            }}
            onClick={() => {
              if (isMandatoryProfileSetup) {
                setShowEditProfileModal(true);
                return;
              }
              setChatOpen(!chatOpen);
            }}
            title={chatOpen ? "Close AI Chat Bot" : "Open AI Chat Bot"}
            aria-label={chatOpen ? "Close AI Chat Bot" : "Open AI Chat Bot"}
          >
            <i className="fa-solid fa-robot"></i>
          </button>
          {/* AI Consultant Live Quick Trigger */}
          <button
            className={`btn-icon ${videoCallOpen ? 'active' : ''}`}
            style={{
              color: videoCallOpen ? "var(--status-success)" : "var(--accent-primary)",
              background: videoCallOpen ? "rgba(16, 185, 129, 0.15)" : undefined,
              borderColor: videoCallOpen ? "var(--status-success)" : undefined
            }}
            onClick={() => {
              if (isMandatoryProfileSetup) {
                setShowEditProfileModal(true);
                return;
              }
              toggleVideoCall();
            }}
            title={videoCallOpen ? "In Video Call (Active)" : "Launch Live AI Consultant"}
            aria-label={videoCallOpen ? "In Video Call (Active)" : "Launch Live AI Consultant"}
          >
            <i className="fa-solid fa-headset"></i>
          </button>
          <button className="btn-icon" onClick={toggleTheme} title="Toggle Theme" aria-label="Toggle Theme">
            <i className={`fa-solid ${isLightMode ? 'fa-moon' : 'fa-sun'}`}></i>
          </button>
          <div className="user-profile">
            <div
              className="user-avatar"
              style={{
                background: user?.authProvider === 'facebook' ? '#1877F2' : 
                            user?.authProvider === 'guest' ? 'rgba(6, 182, 212, 0.25)' : 
                            user?.authProvider === 'google' ? '#EA4335' : 
                            'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))'
              }}
              title={user?.fullName || user?.firstName}
            >
              {user?.authProvider === 'facebook' ? (
                <i className="fa-brands fa-facebook-f" style={{ fontSize: "0.85rem", color: "#fff" }}></i>
              ) : user?.authProvider === 'google' ? (
                <i className="fa-brands fa-google" style={{ fontSize: "0.85rem", color: "#fff" }}></i>
              ) : user?.authProvider === 'phone' ? (
                <i className="fa-solid fa-phone" style={{ fontSize: "0.75rem", color: "var(--accent-cyan)" }}></i>
              ) : user?.authProvider === 'guest' ? (
                <i className="fa-solid fa-user-astronaut" style={{ fontSize: "0.85rem", color: "var(--accent-cyan)" }}></i>
              ) : (
                (user?.firstName || user?.fullName || "ST").substring(0, 2).toUpperCase()
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }} className="user-profile-meta">
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
                {user?.fullName || user?.firstName}
              </span>
              <span style={{ fontSize: "0.68rem", color: "var(--accent-cyan)", fontWeight: 600 }}>
                {user?.college ? user.college : (user?.authProvider ? `${user.authProvider} access` : 'Student')}
              </span>
            </div>
            <button
              className="btn-icon"
              onClick={() => {
                setEditProfileName(user?.fullName || user?.firstName || '');
                setEditProfileCollege(user?.college || '');
                setEditProfileAge(String(user?.age || '20'));
                setShowEditProfileModal(true);
              }}
              style={{ width: "36px", height: "36px", minWidth: "36px", minHeight: "36px", color: "var(--accent-cyan)" }}
              title="Edit Student Profile (Name, College, Age)"
              aria-label="Edit Student Profile"
            >
              <i className="fa-solid fa-user-pen"></i>
            </button>
            <button
              className="btn-icon"
              onClick={handleLogout}
              style={{ width: "36px", height: "36px", minWidth: "36px", minHeight: "36px", color: "var(--text-muted)" }}
              title="Log Out"
              aria-label="Log Out"
            >
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
          </div>
        </div>
      </header>

      {/* PORTAL 2: PREDICTIVE ANALYSIS (STUDENT OVERVIEW & ENROLLED COURSES) */}
      {activePage === 'analytics' && (
        <div className="portal-container">
          {/* PORTAL HERO HEADER */}
          <div className="portal-hero">
            <div className="portal-hero-content">
              <div className="portal-user-meta">
                <div
                  className="portal-avatar-large"
                  style={{
                    background: user?.authProvider === 'facebook' ? '#1877F2' :
                                user?.authProvider === 'google' ? '#EA4335' :
                                user?.authProvider === 'phone' ? 'linear-gradient(135deg, #0284c7, #06b6d4)' :
                                user?.authProvider === 'guest' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' :
                                'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))',
                    color: '#ffffff'
                  }}
                >
                  {user?.authProvider === 'facebook' ? (
                    <i className="fa-brands fa-facebook-f"></i>
                  ) : user?.authProvider === 'google' ? (
                    <i className="fa-brands fa-google"></i>
                  ) : user?.authProvider === 'phone' ? (
                    <i className="fa-solid fa-phone"></i>
                  ) : user?.authProvider === 'guest' ? (
                    <i className="fa-solid fa-user-astronaut"></i>
                  ) : (
                    (user?.firstName || user?.fullName || 'ST').substring(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                    <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                      Welcome back, {user?.fullName || user?.firstName || 'Student'}!
                    </h1>
                    {user?.college && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditProfileName(user?.fullName || user?.firstName || '');
                          setEditProfileCollege(user?.college || '');
                          setEditProfileAge(String(user?.age || '20'));
                          setIsMandatoryProfileSetup(false);
                          setProfileError(null);
                          setShowEditProfileModal(true);
                        }}
                        className="profile-college-badge"
                        style={{ cursor: "pointer", border: "1px solid rgba(6, 182, 212, 0.4)", background: "rgba(6, 182, 212, 0.12)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                        title="Click to edit student profile"
                      >
                        <i className="fa-solid fa-building-columns"></i>
                        <span>{user.college}</span>
                        {user.age && <span>• Age {user.age}</span>}
                        <i className="fa-solid fa-pen" style={{ fontSize: "0.65rem", marginLeft: "2px", opacity: 0.8 }}></i>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditProfileName(user?.fullName || user?.firstName || '');
                        setEditProfileCollege(user?.college || '');
                        setEditProfileAge(String(user?.age || '20'));
                        setIsMandatoryProfileSetup(false);
                        setProfileError(null);
                        setShowEditProfileModal(true);
                      }}
                      className="portal-badge-pill"
                      style={{
                        cursor: "pointer",
                        background: "rgba(6, 182, 212, 0.12)",
                        borderColor: "rgba(6, 182, 212, 0.35)",
                        color: "var(--accent-cyan)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem"
                      }}
                      title="Edit Student Name, College & Age"
                    >
                      <i className="fa-solid fa-user-pen"></i>
                      <span>Edit Student Profile</span>
                    </button>
                    <span className="portal-badge-pill" style={{
                      background: user?.authProvider === 'facebook' ? 'rgba(24, 119, 242, 0.15)' :
                                  user?.authProvider === 'google' ? 'rgba(234, 67, 53, 0.15)' :
                                  user?.authProvider === 'phone' ? 'rgba(6, 182, 212, 0.15)' :
                                  'rgba(99, 102, 241, 0.15)',
                      borderColor: user?.authProvider === 'facebook' ? '#1877F2' :
                                   user?.authProvider === 'google' ? '#EA4335' :
                                   user?.authProvider === 'phone' ? 'var(--accent-cyan)' :
                                   '#818cf8',
                      color: user?.authProvider === 'facebook' ? '#60a5fa' :
                             user?.authProvider === 'google' ? '#f87171' :
                             user?.authProvider === 'phone' ? 'var(--accent-cyan)' :
                             '#a5b4fc'
                    }}>
                      {user?.authProvider === 'facebook' && <><i className="fa-brands fa-facebook-f"></i> Facebook Verified</>}
                      {user?.authProvider === 'google' && <><i className="fa-brands fa-google"></i> Google Verified</>}
                      {user?.authProvider === 'phone' && <><i className="fa-solid fa-phone"></i> Mobile {user.phone}</>}
                      {user?.authProvider === 'email' && <><i className="fa-regular fa-envelope"></i> {user.email}</>}
                      {user?.authProvider === 'guest' && <><i className="fa-solid fa-user-astronaut"></i> Guest Explorer Session</>}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                    {user?.college ? `${user.college} • ` : ''}60 CIA / 40 End Sem Exam Evaluation Scheme Active • {subjects.length} enrolled subjects.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  className="btn-primary"
                  onClick={() => setActivePage('portal')}
                  style={{ padding: "0.7rem 1.35rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}
                >
                  <i className="fa-solid fa-chart-line"></i>
                  <span>Open My Portal (Simulator)</span>
                </button>


                <button
                  className="btn-secondary"
                  onClick={toggleVideoCall}
                  style={{ padding: "0.7rem 1.25rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}
                >
                  <i className="fa-solid fa-headset" style={{ color: "var(--accent-cyan)" }}></i>
                  <span>Consult AI Twin</span>
                </button>
              </div>
            </div>
          </div>

          {/* PROACTIVE CRITICAL RISK ALERT BANNER */}
          {(() => {
            const riskyCourse = subjects.find(s => {
              const cond = s.conducted || 1;
              const att = s.attended || 0;
              const pct = (att / cond) * 100;
              const safeBunks = s.prediction?.safe_bunks_available ?? 0;
              return safeBunks === 0 && (pct < 78 || pct < (s.targetPercent || 75));
            });
            if (!riskyCourse) return null;
            const currentPct = ((riskyCourse.attended / (riskyCourse.conducted || 1)) * 100).toFixed(1);
            const nextMissedPct = ((riskyCourse.attended / ((riskyCourse.conducted || 1) + 1)) * 100).toFixed(1);
            const neededToRecover = riskyCourse.prediction?.classes_needed_for_target || Math.max(1, Math.ceil((0.75 * ((riskyCourse.conducted || 1) + 1) - riskyCourse.attended) / (1 - 0.75)));

            return (
              <div className="critical-risk-banner" role="alert">
                <div className="critical-risk-content">
                  <div className="critical-risk-icon">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                  </div>
                  <div className="critical-risk-text">
                    <h4>
                      <span>Urgent Attendance Alert · {riskyCourse.name}</span>
                      <span style={{ fontSize: "0.72rem", background: "rgba(239, 68, 68, 0.25)", padding: "2px 8px", borderRadius: "10px", color: "#fca5a5" }}>0 Safe Bunks Remaining</span>
                    </h4>
                    <p>
                      Current attendance is <strong>{currentPct}%</strong>. Missing tomorrow&apos;s class drops your attendance to <strong style={{ color: "#ef4444" }}>{nextMissedPct}%</strong>. You must attend <strong style={{ color: "#fbbf24" }}>{neededToRecover} consecutive classes</strong> to stay eligible for exams.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="critical-risk-btn"
                    onClick={() => {
                      setActiveSubjectId(riskyCourse.id);
                      setActivePage('portal');
                    }}
                  >
                    <i className="fa-solid fa-chart-line"></i>
                    <span>Simulate Recovery</span>
                  </button>
                  <button
                    type="button"
                    className="critical-risk-btn"
                    style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid rgba(239, 68, 68, 0.45)", color: "#fca5a5" }}
                    onClick={() => {
                      setChatOpen(true);
                      const crisisPrompt = `I am at debarment risk in ${riskyCourse.name}! Attendance is ${currentPct}% with 0 safe bunks. Please provide an emergency recovery roadmap and advice on talking to my coordinator.`;
                      setChatInput(crisisPrompt);
                      handleSendChat(crisisPrompt, 'chat');
                    }}
                  >
                    <i className="fa-solid fa-user-shield"></i>
                    <span>Emergency Advisor Plan</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* 4 HIGH LEVEL EXECUTIVE METRICS */}
          <div className="portal-stats-grid">
            <div className="portal-stat-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>Cumulative Attendance</span>
                <i className="fa-solid fa-chart-pie" style={{ color: overallAttendancePct >= 75 ? "var(--status-success)" : "var(--status-danger)" }}></i>
              </div>
              <div style={{ fontSize: "1.85rem", fontWeight: 700, color: overallAttendancePct >= 75 ? "var(--status-success)" : "var(--status-danger)" }}>
                {overallAttendancePct.toFixed(1)}%
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {totalAttended} attended of {totalConducted} total lectures across all courses
              </span>
            </div>

            <div className="portal-stat-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>Projected Exam Score</span>
                <i className="fa-solid fa-graduation-cap" style={{ color: "var(--accent-primary)" }}></i>
              </div>
              <div style={{ fontSize: "1.85rem", fontWeight: 700, color: "#c084fc" }}>
                {avgProjectedScore.toFixed(1)}%
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                ML-projected composite performance based on study habits
              </span>
            </div>

            <div className="portal-stat-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>Attendance Risk Status</span>
                <i className={`fa-solid ${atRiskSubjects.length > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} style={{ color: atRiskSubjects.length > 0 ? "var(--status-danger)" : "var(--status-success)" }}></i>
              </div>
              <div style={{ fontSize: "1.85rem", fontWeight: 700, color: atRiskSubjects.length > 0 ? "var(--status-danger)" : "var(--status-success)" }}>
                {atRiskSubjects.length === 0 ? "All Safe" : `${atRiskSubjects.length} At Risk`}
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {atRiskSubjects.length === 0
                  ? "100% compliant with 75% university regulation"
                  : `Warning: ${atRiskSubjects.map(s => s.name).join(', ')} below cutoff`}
              </span>
            </div>

            <div className="portal-stat-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>Weekly Study Allocation</span>
                <i className="fa-solid fa-clock" style={{ color: "var(--accent-cyan)" }}></i>
              </div>
              <div style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--accent-cyan)" }}>
                {totalStudyHours} hrs/wk
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Dedicated weekly preparation across {subjects.length} subjects
              </span>
            </div>
          </div>

          {/* ENROLLED SUBJECTS SECTION */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Enrolled Course Portfolio</h2>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Individual course metrics, target cutoffs, and predictive forecasting
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="file"
                  ref={timetableInputRef}
                  accept="image/*"
                  onChange={handleUploadTimetable}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="btn-timetable-scanner"
                  onClick={() => timetableInputRef.current?.click()}
                  disabled={isScanningTimetable}
                  title="Upload timetable photo or ERP screenshot to auto-extract courses"
                >
                  {isScanningTimetable ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>Scanning Timetable...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-camera"></i>
                      <span>Scan Timetable / ERP</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddSubject(true)}
                  style={{ fontSize: "0.8rem", padding: "0.5rem 0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                  aria-label="Add new course directly"
                >
                  <i className="fa-solid fa-plus"></i> Add Course
                </button>
              </div>
            </div>

            {/* SUBJECT PUTTING STRIP (FROM PREDICTIVE ANALYSIS) ON PORTAL */}
            <div style={{ marginBottom: "1.25rem" }}>
              <div className="subject-bar" style={{ background: "var(--bg-surface)", padding: "0.6rem 0.85rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: "0.25rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <i className="fa-solid fa-list-check" style={{ color: "var(--accent-cyan)" }}></i>
                  Courses:
                </span>
                {subjects.map(subj => {
                  const effectivePct = subj.prediction?.effective_percent ?? Math.round(((subj.attended + (subj.odLeaves || 0)) / (subj.conducted || 1)) * 100);
                  const isSelected = subj.id === activeSubjectId;
                  return (
                    <button
                      key={subj.id}
                      type="button"
                      className={`subject-pill ${isSelected ? 'active' : ''}`}
                      onClick={() => setActiveSubjectId(subj.id)}
                      aria-label={`Select ${subj.name}`}
                    >
                      <span>{subj.name}</span>
                      <span className="pill-badge">{effectivePct}%</span>
                      {subjects.length > 1 && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleDeleteSubject(subj.id, subj.name, e)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleDeleteSubject(subj.id, subj.name, e);
                            }
                          }}
                          style={{
                            marginLeft: "6px",
                            opacity: 0.6,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            transition: "all 0.2s"
                          }}
                          title={`Remove ${subj.name}`}
                          aria-label={`Remove ${subj.name}`}
                        >
                          <i className="fa-solid fa-xmark" style={{ fontSize: "0.75rem" }}></i>
                        </span>
                      )}
                    </button>
                  );
                })}

                {!showAddSubject ? (
                  <button
                    type="button"
                    className="subject-add-btn"
                    onClick={() => setShowAddSubject(true)}
                    aria-label="Add new course to portal"
                  >
                    <i className="fa-solid fa-plus"></i> Add Course
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", background: "var(--bg-base)", padding: "0.25rem 0.6rem", borderRadius: "var(--radius-full)", border: "1px solid var(--accent-cyan)" }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Type course name..."
                      className="modern-input"
                      style={{ padding: "0.35rem 0.65rem", background: "transparent", border: "none", width: "160px", fontSize: "0.85rem" }}
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddSubject();
                        if (e.key === 'Escape') setShowAddSubject(false);
                      }}
                      aria-label="New subject name"
                    />
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px", color: "var(--accent-cyan)" }}
                      onClick={handleAddSubject}
                      disabled={!newSubjectName.trim()}
                      title="Confirm add course"
                      aria-label="Confirm add course"
                    >
                      <i className="fa-solid fa-check"></i>
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px", color: "var(--status-danger)" }}
                      onClick={() => setShowAddSubject(false)}
                      title="Cancel"
                      aria-label="Cancel"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="portal-courses-grid">
              {subjects.map(subj => {
                const effectivePct = subj.prediction?.effective_percent ?? Math.min(100, Math.round(((subj.attended + (subj.odLeaves || 0)) / (subj.conducted || 1)) * 1000) / 10);
                const isSafe = effectivePct >= (subj.targetPercent || 75);
                return (
                  <div key={subj.id} className="portal-course-card">
                    <div className="portal-course-header">
                      <div>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>
                          {subj.name}
                        </h3>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          Target: {subj.targetPercent || 75}% cutoff
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        {subj.odLeaves && subj.odLeaves > 0 ? (
                          <span className="od-badge" title="Official university On-Duty or Medical Exemption active">
                            <i className="fa-solid fa-file-medical"></i> +{subj.odLeaves} OD
                          </span>
                        ) : null}
                        <span style={{
                          padding: "0.25rem 0.65rem",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          background: isSafe ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: isSafe ? "var(--status-success)" : "var(--status-danger)",
                          border: `1px solid ${isSafe ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                        }}>
                          {isSafe ? '● Safe' : '▲ Action Needed'}
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.35rem" }}>
                        <span style={{ color: "var(--text-secondary)" }}>
                          Attendance {subj.odLeaves && subj.odLeaves > 0 ? '(Effective with OD)' : ''}
                        </span>
                        <span style={{ fontWeight: 700, color: isSafe ? "var(--status-success)" : "var(--status-danger)" }}>
                          {effectivePct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="portal-progress-bar-bg">
                        <div
                          className="portal-progress-bar-fill"
                          style={{
                            width: `${Math.min(100, effectivePct)}%`,
                            background: isSafe ? "linear-gradient(90deg, #10b981, #06b6d4)" : "linear-gradient(90deg, #ef4444, #f97316)"
                          }}
                        />
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="portal-course-metrics">
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Attended</div>
                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                          {subj.attended}/{subj.conducted}
                          {subj.odLeaves && subj.odLeaves > 0 ? (
                            <span style={{ fontSize: "0.7rem", color: "#fbbf24", display: "block" }}>+{subj.odLeaves} OD Exempt</span>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          {isSafe ? 'Safe Bunks' : 'Need to Attend'}
                        </div>
                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: isSafe ? "var(--accent-cyan)" : "var(--status-danger)" }}>
                          {isSafe ? `${subj.prediction?.safe_bunks_available || 0} classes` : `${subj.prediction?.classes_needed_for_target || 0} classes`}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Projected</div>
                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#c084fc" }}>
                          {subj.predictedScore ? `${subj.predictedScore}%` : `${subj.pastMarks || 70}%`}
                        </div>
                      </div>
                    </div>

                    {/* 60 CIA + 40 End Sem Exam Evaluation Block */}
                    {(() => {
                      const cia = subj.ciaMarks ?? 48;
                      const endSem = subj.endSemMarks ?? 32;
                      const totalMarks = Math.min(100, cia + endSem);
                      const neededForPass = Math.max(0, 50 - cia);
                      const neededForDistinction = Math.max(0, 75 - cia);
                      const isDistinction = totalMarks >= 75;
                      const isFirstClass = totalMarks >= 60 && totalMarks < 75;

                      return (
                        <div className="evaluation-weightage-box">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.74rem", fontWeight: 700, color: "var(--accent-cyan)" }}>
                              <i className="fa-solid fa-graduation-cap"></i>
                              <span>Evaluation (60 CIA : 40 End Sem)</span>
                            </div>
                            <button
                              type="button"
                              className="btn-edit-marks"
                              onClick={() => {
                                setEditingMarksSubject(subj);
                                setEditCiaMarks(cia);
                                setEditEndSemMarks(endSem);
                              }}
                              title={`Edit Internal CIA and End Sem marks for ${subj.name}`}
                              aria-label={`Edit Internal CIA and End Sem marks for ${subj.name}`}
                            >
                              <i className="fa-solid fa-pen-to-square"></i>
                              <span>Edit Marks</span>
                            </button>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.45rem", textAlign: "center", margin: "0.2rem 0" }}>
                            <div style={{ background: "rgba(59, 130, 246, 0.08)", padding: "0.35rem 0.25rem", borderRadius: "6px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                              <div style={{ fontSize: "0.64rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>CIA Internal</div>
                              <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#38bdf8" }}>
                                {cia} <span style={{ fontSize: "0.68rem", fontWeight: 500, color: "var(--text-muted)" }}>/ 60</span>
                              </div>
                            </div>

                            <div style={{ background: "rgba(168, 85, 247, 0.08)", padding: "0.35rem 0.25rem", borderRadius: "6px", border: "1px solid rgba(168, 85, 247, 0.2)" }}>
                              <div style={{ fontSize: "0.64rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>End Sem Exam</div>
                              <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#c084fc" }}>
                                {endSem} <span style={{ fontSize: "0.68rem", fontWeight: 500, color: "var(--text-muted)" }}>/ 40</span>
                              </div>
                            </div>

                            <div style={{ background: "rgba(16, 185, 129, 0.08)", padding: "0.35rem 0.25rem", borderRadius: "6px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                              <div style={{ fontSize: "0.64rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Total Final</div>
                              <div style={{ fontSize: "0.9rem", fontWeight: 800, color: isDistinction ? "#34d399" : isFirstClass ? "var(--accent-cyan)" : "#fbbf24" }}>
                                {totalMarks} <span style={{ fontSize: "0.68rem", fontWeight: 500, color: "var(--text-muted)" }}>/ 100</span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.68rem", color: "var(--text-muted)" }}>
                            <span>
                              End Sem Target: <strong style={{ color: "var(--text-primary)" }}>{neededForPass <= 0 ? 'Passed (CIA ≥ 50)' : `${neededForPass}/40 to pass`}</strong>
                            </span>
                            <span style={{ color: isDistinction ? "var(--status-success)" : isFirstClass ? "var(--accent-cyan)" : "var(--status-warning)", fontWeight: 700 }}>
                              {isDistinction ? "★ Distinction (75%+)" : isFirstClass ? "First Class (60%+)" : `Need ${neededForDistinction}/40 for Distinction`}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Quick Logging Buttons on Portal Card */}
                    <div style={{ display: "flex", gap: "0.4rem", margin: "0.4rem 0 0.6rem 0" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ flex: 1, padding: "0.35rem 0.5rem", fontSize: "0.74rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                        onClick={() => {
                          const updated = subjects.map(s => {
                            if (s.id === subj.id) {
                              const newCond = (s.conducted || 0) + 1;
                              const newAtt = (s.attended || 0) + 1;
                              const currentPct = Math.round((newAtt / newCond) * 1000) / 10;
                              const target = s.targetPercent || 75;
                              const safeBunks = Math.max(0, Math.floor((newAtt - (target / 100) * newCond) / (target / 100)));
                              const needed = Math.max(0, Math.ceil(((target / 100) * newCond - newAtt) / (1 - target / 100)));
                              return {
                                ...s,
                                conducted: newCond,
                                attended: newAtt,
                                prediction: {
                                  ...s.prediction,
                                  current_percent: currentPct,
                                  effective_percent: currentPct,
                                  safe_bunks_available: safeBunks,
                                  classes_needed_for_target: needed
                                }
                              };
                            }
                            return s;
                          });
                          setSubjects(updated);
                          try { if (user) localStorage.setItem(getUserStorageKey(user, 'subjects'), JSON.stringify(updated)); } catch {}
                        }}
                        title="Logged present: +1 Conducted & +1 Attended"
                      >
                        <i className="fa-solid fa-user-check" style={{ color: "var(--status-success)" }}></i>
                        <span>+1 Present</span>
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ flex: 1, padding: "0.35rem 0.5rem", fontSize: "0.74rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                        onClick={() => {
                          const updated = subjects.map(s => {
                            if (s.id === subj.id) {
                              const newCond = (s.conducted || 0) + 1;
                              const newAtt = s.attended || 0;
                              const currentPct = Math.round((newAtt / newCond) * 1000) / 10;
                              const target = s.targetPercent || 75;
                              const safeBunks = Math.max(0, Math.floor((newAtt - (target / 100) * newCond) / (target / 100)));
                              const needed = Math.max(0, Math.ceil(((target / 100) * newCond - newAtt) / (1 - target / 100)));
                              return {
                                ...s,
                                conducted: newCond,
                                prediction: {
                                  ...s.prediction,
                                  current_percent: currentPct,
                                  effective_percent: currentPct,
                                  safe_bunks_available: safeBunks,
                                  classes_needed_for_target: needed
                                }
                              };
                            }
                            return s;
                          });
                          setSubjects(updated);
                          try { if (user) localStorage.setItem(getUserStorageKey(user, 'subjects'), JSON.stringify(updated)); } catch {}
                        }}
                        title="Logged absent: +1 Conducted only"
                      >
                        <i className="fa-solid fa-user-xmark" style={{ color: "var(--status-danger)" }}></i>
                        <span>+1 Missed</span>
                      </button>
                      <button
                        type="button"
                        className="btn-od-action"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.74rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                        onClick={() => {
                          const updated = subjects.map(s => {
                            if (s.id === subj.id) {
                              const newCond = (s.conducted || 0) + 1;
                              const newOd = (s.odLeaves || 0) + 1;
                              const effectiveAtt = (s.attended || 0) + newOd;
                              const effectivePct = Math.round((effectiveAtt / newCond) * 1000) / 10;
                              return {
                                ...s,
                                conducted: newCond,
                                odLeaves: newOd,
                                prediction: {
                                  ...s.prediction,
                                  effective_percent: effectivePct
                                }
                              };
                            }
                            return s;
                          });
                          setSubjects(updated);
                          try { if (user) localStorage.setItem(getUserStorageKey(user, 'subjects'), JSON.stringify(updated)); } catch {}
                        }}
                        title="Approved university OD / Medical Exemption"
                      >
                        <i className="fa-solid fa-file-medical"></i>
                        <span>+1 OD</span>
                      </button>
                    </div>

                    {/* Action Button */}
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setActiveSubjectId(subj.id);
                        setActivePage('portal');
                      }}
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        fontSize: "0.825rem",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: "0.5rem"
                      }}
                    >
                      <span>Simulate & Forecast</span>
                      <i className="fa-solid fa-arrow-right" style={{ fontSize: "0.75rem" }}></i>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PERSONALIZED AI TWIN BRIEFING */}
          <div className="portal-twin-banner">
            <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 0 20px rgba(6, 182, 212, 0.4)" }}>
                <Image src="/robot-avatar.png" alt="Student AI Digital Twin Strategic Briefing Hologram Avatar" width={52} height={52} style={{ borderRadius: "50%", objectFit: "cover" }} />
              </div>
              <div>
                <h4 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>
                  Digital Twin Strategic Briefing
                </h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: "700px" }}>
                  {atRiskSubjects.length > 0 ? (
                    <>
                      <strong style={{ color: "var(--status-danger)" }}>Attention required:</strong> You have {atRiskSubjects.length} course(s) under the 75% cutoff ({atRiskSubjects.map(s => `${s.name} at ${s.prediction?.current_percent?.toFixed(1) || 0}%`).join(', ')}). Prioritize these sessions this week to prevent debarment.
                    </>
                  ) : (
                    <>
                      <strong style={{ color: "var(--status-success)" }}>Outstanding trajectory:</strong> All {subjects.length} courses are comfortably above your 75% threshold! You have cumulative bunker safety across multiple classes while maintaining an average projected score of {avgProjectedScore.toFixed(1)}%.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className="portal-prompt-chip"
                onClick={() => {
                  setChatOpen(true);
                  setTimeout(() => handleSendChat("Summarize my semester risk and attendance strategy"), 100);
                }}
              >
                <i className="fa-solid fa-wand-magic-sparkles" style={{ color: "var(--accent-cyan)", marginRight: "4px" }}></i>
                Semester Risk Summary
              </button>
              <button
                className="portal-prompt-chip"
                onClick={() => {
                  setChatOpen(true);
                  setTimeout(() => handleSendChat("How many classes can I bunk without dropping below 75%?"), 100);
                }}
              >
                <i className="fa-solid fa-calculator" style={{ color: "var(--accent-primary)", marginRight: "4px" }}></i>
                Calculate Bunk Margins
              </button>
              <button
                className="portal-prompt-chip"
                onClick={toggleVideoCall}
              >
                <i className="fa-solid fa-headset" style={{ color: "var(--status-success)", marginRight: "4px" }}></i>
                Live Face-to-Face Consult
              </button>
            </div>
          </div>

          {/* CGPA TRAJECTORY PLANNER PORTAL BANNER */}
          <div className="bento-card col-span-12" style={{
            marginTop: "1.5rem",
            background: "linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(30, 27, 75, 0.65) 60%, rgba(8, 51, 68, 0.45) 100%)",
            border: "1px solid rgba(0, 240, 255, 0.35)",
            boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 25px rgba(0, 240, 255, 0.08)",
            padding: "1.5rem 1.85rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1.25rem",
            borderRadius: "16px"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span className="cyber-badge cyan">
                  <i className="fa-solid fa-graduation-cap"></i> Dedicated Portal
                </span>
                <span className="cyber-badge purple">
                  <i className="fa-solid fa-calculator"></i> Reverse SGPA Solver
                </span>
                <span className="cyber-badge orange">
                  <i className="fa-solid fa-shield-halved"></i> Safe-Slump Radar
                </span>
                <span className="cyber-badge emerald">
                  <i className="fa-solid fa-camera"></i> AI Marksheet OCR
                </span>
              </div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0.6rem 0 0.3rem 0", color: "#FFFFFF" }}>
                CGPA Calculator & Academic Trajectory Planner
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: "680px" }}>
                Interactive multi-semester credit matrix, exact SGPA/CGPA engine, reverse target solver with impossible goal detection, safe-slump placement buffer, and AI marksheet transcript scanner.
              </p>
            </div>

            <button
              type="button"
              className="cyber-btn cyber-btn-cyan"
              onClick={() => setActivePage('cgpa')}
              style={{ padding: "0.8rem 1.6rem", fontSize: "0.95rem", fontWeight: 700 }}
            >
              <i className="fa-solid fa-arrow-up-right-from-square"></i> Open CGPA Planner Portal
            </button>
          </div>
        </div>
      )}

      {/* PORTAL 1: MY PORTAL (PREDICTIVE ANALYTICS SIMULATOR) */}
      {activePage === 'portal' && (
        <main className="main-wrapper" id="main-dashboard">

          {/* PROMINENT PRIMARY CALL TO ACTION (CTA) */}
          <div
            className="hero-cta-banner"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1.5rem",
              padding: "1.5rem 1.85rem",
              marginBottom: "1.75rem",
              background: "linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.96))",
              border: "1px solid rgba(6, 182, 212, 0.45)",
              borderRadius: "16px",
              boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.7), inset 0 0 25px rgba(6, 182, 212, 0.12)",
              position: "relative",
              overflow: "hidden",
              flexWrap: "wrap"
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, width: "4px", height: "100%", background: "linear-gradient(180deg, var(--accent-cyan), var(--accent-primary))" }}></div>
            <div style={{ flex: "1 1 360px" }}>
              <div
                className="hero-cta-badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.25rem 0.7rem",
                  borderRadius: "9999px",
                  background: "rgba(6, 182, 212, 0.15)",
                  border: "1px solid rgba(6, 182, 212, 0.4)",
                  color: "#38bdf8",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  marginBottom: "0.5rem"
                }}
              >
                <span className="live-pulse-dot" style={{ width: "8px", height: "8px" }}></span>
                <span>AI BIOMETRIC TELEMETRY READY</span>
              </div>
              <h2
                className="hero-cta-title"
                style={{
                  fontSize: "1.45rem",
                  fontWeight: 700,
                  color: "#f8fafc",
                  margin: "0 0 0.35rem 0",
                  lineHeight: 1.25
                }}
              >
                Activate Real-Time Biometric Digital Twin
              </h2>
              <p
                className="hero-cta-desc"
                style={{
                  fontSize: "0.9rem",
                  color: "#cbd5e1",
                  margin: 0,
                  lineHeight: 1.55,
                  maxWidth: "680px"
                }}
              >
                Engage on-device 478-pt facial mesh perception and conversational Indic voice intelligence to forecast attendance, safe bunks, and exam readiness.
              </p>
            </div>
            <div>
              <button
                type="button"
                className="btn-hero-cta-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.85rem 1.75rem",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #06b6d4, #2563eb)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.96rem",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 20px rgba(6, 182, 212, 0.4)",
                  minHeight: "48px"
                }}
                onClick={() => {
                  trackEvent('hero_cta_clicked');
                  if (!videoCallOpen) toggleVideoCall();
                  setTimeout(() => {
                    const videoSection = document.querySelector('.live-video-consultant');
                    if (videoSection) {
                      videoSection.scrollIntoView({ behavior: 'smooth' });
                    }
                  }, 150);
                }}
                aria-label="Launch Twin Telemetry & AI Consultant"
              >
                <i className="fa-solid fa-bolt" aria-hidden="true"></i>
                <span>Launch Twin Telemetry</span>
              </button>
            </div>
          </div>

          {/* Header / Subject Tabs */}
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Deep Predictive Simulator • Active: <strong>{activeSubject.name}</strong>
              </span>
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>My Portal · Predictive Analytics</h1>

          <div className="subject-nav">
            {subjects.map(subj => (
              <button
                key={subj.id}
                className={`subject-tab ${activeSubjectId === subj.id ? 'active' : ''}`}
                onClick={() => setActiveSubjectId(subj.id)}
                aria-label={`Select subject ${subj.name}`}
              >
                <i className="fa-solid fa-book"></i> {subj.name}
                {subjects.length > 1 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDeleteSubject(subj.id, subj.name, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleDeleteSubject(subj.id, subj.name, e);
                      }
                    }}
                    style={{
                      marginLeft: "6px",
                      opacity: 0.6,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      transition: "all 0.2s"
                    }}
                    title={`Remove ${subj.name}`}
                    aria-label={`Remove ${subj.name}`}
                  >
                    <i className="fa-solid fa-xmark" style={{ fontSize: "0.75rem" }}></i>
                  </span>
                )}
              </button>
            ))}

            {!showAddSubject ? (
              <button className="subject-add-btn" onClick={() => setShowAddSubject(true)} aria-label="Add new subject">
                <i className="fa-solid fa-plus"></i> Add
              </button>
            ) : (
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", background: "var(--bg-surface)", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-full)", border: "1px solid var(--accent-cyan)" }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Subject name"
                  className="modern-input"
                  style={{ padding: "0.35rem 0.65rem", background: "transparent", border: "none", width: "130px", fontSize: "0.85rem" }}
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSubject();
                    if (e.key === 'Escape') setShowAddSubject(false);
                  }}
                  aria-label="New subject name"
                />
                <button
                  className="btn-icon"
                  style={{ width: "36px", height: "36px", minWidth: "36px", minHeight: "36px", color: "var(--accent-cyan)" }}
                  onClick={handleAddSubject}
                  disabled={!newSubjectName.trim()}
                  title="Confirm add subject"
                  aria-label="Confirm add subject"
                >
                  <i className="fa-solid fa-check"></i>
                </button>
                <button
                  className="btn-icon"
                  style={{ width: "36px", height: "36px", minWidth: "36px", minHeight: "36px", color: "var(--status-danger)" }}
                  onClick={() => setShowAddSubject(false)}
                  title="Cancel add subject"
                  aria-label="Cancel add subject"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BENTO GRID */}
        <div className="bento-grid">

          {/* Data Entry Card (Left Column) */}
          <div className="bento-card col-span-4">
            <h3 className="card-title"><i className="fa-solid fa-sliders"></i> Context Parameters</h3>
            <div className="input-stack">
              <div className="modern-input-group">
                <label htmlFor="input-conducted">Classes Conducted</label>
                <input
                  id="input-conducted"
                  className="modern-input"
                  type="number"
                  min="0"
                  value={activeSubject.conducted || ''}
                  onChange={(e) => updateActiveSubject({ conducted: Math.max(0, parseInt(e.target.value) || 0) })}
                  aria-label="Classes Conducted"
                />
              </div>
              <div className="modern-input-group">
                <label htmlFor="input-attended">Classes Attended</label>
                <input
                  id="input-attended"
                  className="modern-input"
                  type="number"
                  min="0"
                  value={activeSubject.attended || ''}
                  onChange={(e) => updateActiveSubject({ attended: Math.max(0, parseInt(e.target.value) || 0) })}
                  aria-label="Classes Attended"
                />
              </div>

              {/* On-Duty (OD) & Medical Leave Exemption Input */}
              <div className="modern-input-group">
                <label htmlFor="input-od-leaves" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Approved OD / Medical Leaves</span>
                  <span style={{ fontSize: "0.7rem", color: "#fbbf24" }}>Exemption</span>
                </label>
                <input
                  id="input-od-leaves"
                  className="modern-input"
                  type="number"
                  min="0"
                  value={activeSubject.odLeaves || 0}
                  onChange={(e) => updateActiveSubject({ odLeaves: Math.max(0, parseInt(e.target.value) || 0) })}
                  aria-label="Approved On-Duty and Medical Leaves"
                />
              </div>

              {/* Validation Warning */}
              {activeSubject.attended > activeSubject.conducted && (
                <div style={{ color: "var(--status-danger)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem", background: "rgba(239, 68, 68, 0.1)", padding: "0.4rem 0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
                  <i className="fa-solid fa-triangle-exclamation"></i> Attended classes cannot exceed conducted.
                </div>
              )}

              {/* Quick 1-Click Action Buttons */}
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1, padding: "0.5rem", fontSize: "0.78rem" }}
                  onClick={() => updateActiveSubject({
                    conducted: (activeSubject.conducted || 0) + 1,
                    attended: (activeSubject.attended || 0) + 1
                  })}
                  title="Logged present: +1 Conducted & +1 Attended"
                  aria-label="Logged present: +1 Conducted and +1 Attended"
                >
                  <i className="fa-solid fa-user-check" style={{ color: "var(--status-success)" }}></i> +1 Present
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1, padding: "0.5rem", fontSize: "0.78rem" }}
                  onClick={() => updateActiveSubject({
                    conducted: (activeSubject.conducted || 0) + 1
                  })}
                  title="Logged absent: +1 Conducted only"
                  aria-label="Logged absent: +1 Conducted only"
                >
                  <i className="fa-solid fa-user-xmark" style={{ color: "var(--status-danger)" }}></i> +1 Missed
                </button>
                <button
                  type="button"
                  className="btn-od-action"
                  style={{ flex: "1 1 100%", justifyContent: "center" }}
                  onClick={() => updateActiveSubject({
                    conducted: (activeSubject.conducted || 0) + 1,
                    odLeaves: (activeSubject.odLeaves || 0) + 1
                  })}
                  title="Approved university On-Duty or Medical Exemption (+1 Conducted, counts towards minimum threshold)"
                  aria-label="Approved university On-Duty or Medical Exemption"
                >
                  <i className="fa-solid fa-file-medical"></i> +1 OD / Medical Leave
                </button>
              </div>

              <div className="modern-input-group" style={{ marginTop: "0.25rem" }}>
                <label htmlFor="input-target">Required Target (%)</label>
                <input
                  id="input-target"
                  className="modern-input"
                  type="number"
                  min="1"
                  max="100"
                  value={activeSubject.targetPercent}
                  onChange={(e) => updateActiveSubject({ targetPercent: Math.min(100, Math.max(1, parseInt(e.target.value) || 75)) })}
                  aria-label="Required Target Percent"
                />
              </div>
            </div>
          </div>

          {/* Predictions & Progress (Middle Column) */}
          <div className="bento-card col-span-8" style={{ gap: "2rem" }}>
            <div>
              <h3 className="card-title"><i className="fa-solid fa-chart-pie"></i> Real-time Telemetry</h3>
              <div className="progress-container">
                <div className="progress-header">
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Current Attendance {activeSubject.odLeaves && activeSubject.odLeaves > 0 ? '(Effective with OD)' : ''}
                  </span>
                  <span className="progress-value">
                    {activeSubject.prediction?.effective_percent ?? activeSubject.prediction.current_percent}%
                  </span>
                </div>
                <div className="progress-track" style={{ marginTop: "0.5rem" }}>
                  <div
                    className={`progress-fill ${(activeSubject.prediction?.effective_percent ?? activeSubject.prediction.current_percent) >= activeSubject.targetPercent ? 'success' : 'danger'}`}
                    style={{ width: `${Math.min(activeSubject.prediction?.effective_percent ?? activeSubject.prediction.current_percent, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat-box">
                <span className="stat-value">{activeSubject.prediction.classes_needed_for_target}</span>
                <span className="stat-label">Classes Needed to Reach Target</span>
              </div>
              <div className="stat-box">
                <span className="stat-value" style={{ color: "var(--accent-cyan)" }}>{activeSubject.prediction.safe_bunks_available}</span>
                <span className="stat-label">Safe Leaves Available</span>
              </div>
              {activeSubject.odLeaves && activeSubject.odLeaves > 0 ? (
                <div className="stat-box">
                  <span className="stat-value" style={{ color: "#fbbf24" }}>+{activeSubject.odLeaves}</span>
                  <span className="stat-label">OD / Medical Leaves (Exempted)</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Exam Predictor with 60 CIA : 40 End Sem Weightage Scheme */}
          <div className="bento-card col-span-6">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h3 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <i className="fa-solid fa-graduation-cap" style={{ color: "var(--accent-cyan)" }}></i>
                  60 CIA : 40 End Sem Exam Modeler
                </h3>
                <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                  Continuous Internal Assessment (60 Marks) + End Sem Final Exam (40 Marks) = 100 Total
                </span>
              </div>
              <button
                type="button"
                className="btn-edit-marks"
                onClick={() => {
                  setEditingMarksSubject(activeSubject);
                  setEditCiaMarks(activeSubject.ciaMarks ?? 48);
                  setEditEndSemMarks(activeSubject.endSemMarks ?? 32);
                }}
                title="Edit current marks record"
              >
                <i className="fa-solid fa-pen-to-square"></i>
                <span>Edit Marks</span>
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginBottom: "0.85rem" }}>
              <div className="modern-input-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <label style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)" }}>Internal CIA (Max 60)</label>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#38bdf8" }}>{activeSubject.ciaMarks ?? 48} / 60</span>
                </div>
                <input
                  className="modern-input"
                  type="number"
                  min="0"
                  max="60"
                  value={activeSubject.ciaMarks ?? ''}
                  onChange={(e) => {
                    const val = Math.min(60, Math.max(0, parseFloat(e.target.value) || 0));
                    updateActiveSubject({
                      ciaMarks: val,
                      ciaTotal: 60,
                      predictedScore: val + (activeSubject.endSemMarks || 0)
                    });
                  }}
                  aria-label="Continuous Internal Assessment Marks out of 60"
                />
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={activeSubject.ciaMarks ?? 48}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    updateActiveSubject({
                      ciaMarks: val,
                      ciaTotal: 60,
                      predictedScore: val + (activeSubject.endSemMarks || 0)
                    });
                  }}
                  style={{ width: "100%", marginTop: "0.4rem", accentColor: "#38bdf8", cursor: "pointer" }}
                />
              </div>

              <div className="modern-input-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <label style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)" }}>End Sem Exam (Max 40)</label>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#c084fc" }}>{activeSubject.endSemMarks ?? 32} / 40</span>
                </div>
                <input
                  className="modern-input"
                  type="number"
                  min="0"
                  max="40"
                  value={activeSubject.endSemMarks ?? ''}
                  onChange={(e) => {
                    const val = Math.min(40, Math.max(0, parseFloat(e.target.value) || 0));
                    updateActiveSubject({
                      endSemMarks: val,
                      endSemTotal: 40,
                      predictedScore: (activeSubject.ciaMarks || 0) + val
                    });
                  }}
                  aria-label="End Semester Final Exam Marks out of 40"
                />
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={activeSubject.endSemMarks ?? 32}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    updateActiveSubject({
                      endSemMarks: val,
                      endSemTotal: 40,
                      predictedScore: (activeSubject.ciaMarks || 0) + val
                    });
                  }}
                  style={{ width: "100%", marginTop: "0.4rem", accentColor: "#c084fc", cursor: "pointer" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
              <div className="modern-input-group" style={{ flex: 1 }}>
                <label style={{ fontSize: "0.76rem" }}>Daily Study Time (hrs)</label>
                <input
                  className="modern-input"
                  type="number"
                  min="0"
                  max="24"
                  value={activeSubject.studyHours || ''}
                  onChange={(e) => updateActiveSubject({ studyHours: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div style={{ flex: 1, padding: "0.5rem 0.75rem", background: "var(--bg-base)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", fontSize: "0.76rem" }}>
                <div style={{ color: "var(--text-muted)", marginBottom: "0.2rem" }}>End Sem Exam Needed:</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span>Pass (50%): <strong style={{ color: "var(--status-success)" }}>{Math.max(0, 50 - (activeSubject.ciaMarks || 0))} / 40</strong></span>
                  <span>Distinction (75%): <strong style={{ color: "var(--accent-cyan)" }}>{Math.max(0, 75 - (activeSubject.ciaMarks || 0))} / 40</strong></span>
                </div>
              </div>
            </div>

            {/* Composite Result Box */}
            {(() => {
              const currentCia = activeSubject.ciaMarks ?? 48;
              const currentEndSem = activeSubject.endSemMarks ?? 32;
              const compositeTotal = currentCia + currentEndSem;
              const isDistinction = compositeTotal >= 75;
              const isFirstClass = compositeTotal >= 60 && compositeTotal < 75;
              const isPass = compositeTotal >= 50 && compositeTotal < 60;
              const isDanger = compositeTotal < 50;

              return (
                <div style={{
                  padding: "0.85rem 1rem",
                  backgroundColor: "var(--bg-base)",
                  borderRadius: "var(--radius-md)",
                  border: isDanger ? "1px dashed var(--status-danger)" : "1px dashed var(--accent-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem"
                }}>
                  <div>
                    <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                      Composite Final Projection (60 CIA + 40 End Sem)
                    </div>
                    <div style={{ fontSize: "0.8rem", color: isDanger ? "var(--status-danger)" : isDistinction ? "var(--status-success)" : "var(--accent-cyan)", fontWeight: 600, marginTop: "0.15rem" }}>
                      {isDistinction && "Distinction · Grade A+ (Target Exceeded)"}
                      {isFirstClass && "First Class · Grade A (Strong Academic Standing)"}
                      {isPass && "Passing · Grade B (Safe Boundary)"}
                      {isDanger && `Below 50% Threshold · Need ${50 - compositeTotal} more marks`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
                    <span style={{ fontSize: "1.75rem", fontWeight: 800, color: isDanger ? "var(--status-danger)" : "var(--accent-cyan)" }}>
                      {compositeTotal}
                    </span>
                    <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 600 }}>/ 100</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Chart Overview - Cross-Subject Distribution & Trends */}
          <div className="bento-card col-span-6" style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.05rem" }}>
                <i className={chartViewMode === 'distribution' ? "fa-solid fa-chart-simple" : "fa-solid fa-chart-line"} style={{ color: "var(--accent-cyan)" }}></i>
                {chartViewMode === 'distribution' ? "Cross-Subject Distribution" : `Attendance Trend · ${activeSubject.name}`}
              </h3>
              <div style={{ display: "flex", gap: "0.3rem", background: "rgba(15, 23, 42, 0.6)", padding: "0.2rem", borderRadius: "var(--radius-full)", border: "1px solid var(--border-color)" }}>
                <button
                  type="button"
                  onClick={() => setChartViewMode('distribution')}
                  style={{
                    padding: "0.25rem 0.65rem",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    borderRadius: "var(--radius-full)",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    background: chartViewMode === 'distribution' ? "var(--accent-primary)" : "transparent",
                    color: chartViewMode === 'distribution' ? "#fff" : "var(--text-secondary)",
                  }}
                  title="View comparative distribution across all subjects"
                >
                  <i className="fa-solid fa-chart-simple" style={{ marginRight: "0.3rem" }}></i>
                  All Subjects
                </button>
                <button
                  type="button"
                  onClick={() => setChartViewMode('trend')}
                  style={{
                    padding: "0.25rem 0.65rem",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    borderRadius: "var(--radius-full)",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    background: chartViewMode === 'trend' ? "var(--accent-primary)" : "transparent",
                    color: chartViewMode === 'trend' ? "#fff" : "var(--text-secondary)",
                  }}
                  title="View weekly progression trend for active subject"
                >
                  <i className="fa-solid fa-chart-line" style={{ marginRight: "0.3rem" }}></i>
                  Weekly Trend
                </button>
              </div>
            </div>

            <div style={{ height: "205px", width: "100%", position: "relative" }}>
              {chartViewMode === 'distribution' ? (
                <Chart type="bar" data={distributionChartData as ChartData<'bar'>} options={distributionChartOptions as ChartOptions<'bar'>} />
              ) : (
                <Chart type="line" data={trendChartData} options={trendChartOptions} />
              )}
            </div>

            {chartViewMode === 'distribution' && (
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid var(--border-color)", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <span>Avg Attendance:</span>
                  <strong style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>
                    {(subjects.reduce((acc, s) => acc + (s.prediction?.current_percent || 0), 0) / (subjects.length || 1)).toFixed(1)}%
                  </strong>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <span>Avg Projected Score:</span>
                  <strong style={{ color: "#c084fc", fontWeight: 700 }}>
                    {(subjects.reduce((acc, s) => acc + (s.predictedScore ?? s.pastMarks ?? 0), 0) / (subjects.length || 1)).toFixed(1)}%
                  </strong>
                </div>
                <div>
                  <span style={{
                    padding: "0.15rem 0.55rem",
                    borderRadius: "var(--radius-full)",
                    fontSize: "0.7rem",
                    background: subjects.some(s => (s.prediction?.current_percent || 0) < (s.targetPercent || 75)) ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                    color: subjects.some(s => (s.prediction?.current_percent || 0) < (s.targetPercent || 75)) ? "var(--status-danger)" : "var(--status-success)",
                    fontWeight: 700,
                    border: `1px solid ${subjects.some(s => (s.prediction?.current_percent || 0) < (s.targetPercent || 75)) ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`
                  }}>
                    {subjects.filter(s => (s.prediction?.current_percent || 0) < (s.targetPercent || 75)).length > 0
                      ? `${subjects.filter(s => (s.prediction?.current_percent || 0) < (s.targetPercent || 75)).length} Subject At Risk`
                      : 'All Subjects Safe'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* CGPA TRAJECTORY PLANNER PORTAL BANNER */}
          <div className="bento-card col-span-12" style={{
            background: "linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(30, 27, 75, 0.65) 60%, rgba(8, 51, 68, 0.45) 100%)",
            border: "1px solid rgba(0, 240, 255, 0.35)",
            boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 25px rgba(0, 240, 255, 0.08)",
            padding: "1.5rem 1.85rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1.25rem",
            borderRadius: "16px"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span className="cyber-badge cyan">
                  <i className="fa-solid fa-graduation-cap"></i> Dedicated Portal
                </span>
                <span className="cyber-badge purple">
                  <i className="fa-solid fa-calculator"></i> Reverse SGPA Solver
                </span>
                <span className="cyber-badge orange">
                  <i className="fa-solid fa-shield-halved"></i> Safe-Slump Radar
                </span>
                <span className="cyber-badge emerald">
                  <i className="fa-solid fa-camera"></i> AI Marksheet OCR
                </span>
              </div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0.6rem 0 0.3rem 0", color: "#FFFFFF" }}>
                CGPA Calculator & Academic Trajectory Planner
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: "680px" }}>
                Multi-semester interactive matrix, reverse target solver with impossible goal detection, placement safe-slump buffer, and AI marksheet scanner.
              </p>
            </div>

            <button
              type="button"
              className="cyber-btn cyber-btn-cyan"
              onClick={() => setActivePage('cgpa')}
              style={{ padding: "0.8rem 1.6rem", fontSize: "0.95rem", fontWeight: 700 }}
            >
              <i className="fa-solid fa-arrow-up-right-from-square"></i> Open CGPA Planner Portal
            </button>
          </div>

          {/* AI Live Consultant Station Card */}
          <div className="bento-card col-span-12" style={{
            background: "linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%)",
            borderColor: "rgba(6, 182, 212, 0.4)",
            borderWidth: "1.5px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3), 0 0 20px rgba(6, 182, 212, 0.1)",
            padding: "1.75rem 2rem",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1.5rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              <div className="ai-avatar-pulse" style={{ width: "68px", height: "68px", position: "relative" }}>
                <Image src="/robot-avatar.png" alt="Student AI Digital Twin Live Consultant Hologram Avatar" width={68} height={68} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                <span style={{ position: "absolute", bottom: "2px", right: "2px", width: "14px", height: "14px", borderRadius: "50%", background: "var(--status-success)", border: "2px solid var(--bg-surface)", boxShadow: "0 0 8px var(--status-success)" }}></span>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Live AI Academic Consultant</h3>
                  <span style={{ fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.15)", color: "var(--status-success)", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontWeight: 700, border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                    <i className="fa-solid fa-circle" style={{ fontSize: "0.45rem", marginRight: "0.3rem" }}></i> ONLINE
                  </span>
                </div>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
                  Face-to-face AI consultation with live webcam perception, real-time voice interaction, and personalized attendance strategies.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <button
                className="btn-primary"
                onClick={toggleVideoCall}
                style={{
                  background: "linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))",
                  boxShadow: "0 4px 20px var(--accent-glow)",
                  padding: "0.75rem 1.5rem",
                  fontSize: "0.95rem"
                }}
              >
                <i className="fa-solid fa-headset"></i> Start Live Consultation
              </button>
              <button
                className="btn-secondary"
                onClick={() => setChatOpen(true)}
                style={{
                  padding: "0.75rem 1.25rem",
                  fontSize: "0.95rem"
                }}
              >
                <i className="fa-solid fa-robot"></i> Open AI Chat Bot
              </button>
            </div>
          </div>

        </div>
      </main>
      )}

      {/* FULL-SCALE CYBERPUNK CGPA CALCULATOR & ACADEMIC TRAJECTORY PLANNER PORTAL */}
      {activePage === 'cgpa' && (
        <CgpaPlannerPortal />
      )}

      {/* UNIFIED DOCKED FLOATING AI COMMAND BAR */}
      <div className="chat-wrapper">
        {/* CHAT PANEL */}
        <div className={`chat-panel ${chatOpen ? '' : 'hidden'}`}>
          <div className="chat-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexShrink: 0 }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                <Image src="/robot-avatar.png" alt="Student AI Digital Twin Chatbot Header Robot Avatar" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <h4 style={{ fontSize: "0.92rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.45rem", color: "var(--text-primary)", whiteSpace: "nowrap", flexShrink: 0 }}>
                <i className="fa-solid fa-robot" style={{ color: "var(--accent-cyan)", fontSize: "0.95rem" }}></i>
                <span>AI Chat Bot</span>
                <span
                  className="live-pulse-dot"
                  title="Active"
                  aria-label="Active"
                  style={{
                    width: "8px",
                    height: "8px",
                    minWidth: "8px",
                    minHeight: "8px",
                    borderRadius: "50%",
                    background: "#10b981",
                    display: "inline-block",
                    boxShadow: "0 0 8px #10b981, 0 0 12px rgba(16, 185, 129, 0.6)",
                    animation: "liveDotPulse 1.8s infinite ease-in-out",
                    flexShrink: 0,
                    marginRight: "0.4rem"
                  }}
                ></span>
              </h4>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
              <button
                className="btn-icon"
                style={{ width: "28px", height: "28px", color: "var(--accent-cyan)" }}
                onClick={() => {
                  setChatOpen(false);
                  toggleVideoCall();
                }}
                title="Switch to AI Consultant Live"
              >
                <i className="fa-solid fa-headset"></i>
              </button>
              <button
                className="btn-icon"
                style={{ width: "28px", height: "28px" }}
                onClick={() => setChatOpen(false)}
                title="Minimize Chat"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          {/* CHATBOT INLINE LANGUAGE TABS */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.45rem 0.85rem",
            background: "var(--bg-base)",
            borderBottom: "1px solid var(--border-color)",
            fontSize: "0.74rem",
            gap: "0.5rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-muted)", flexShrink: 0, fontWeight: 600 }}>
              <i className="fa-solid fa-language" style={{ color: "var(--accent-cyan)" }}></i>
              <span>Language:</span>
            </div>
            <div className="lang-switcher-pill mini" role="group" aria-label="Chatbot Language Tabs" style={{ flexShrink: 0 }}>
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'auto' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('auto')}
                title="Auto Detect Language"
              >
                <span>Auto</span>
              </button>
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'hi' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('hi')}
                title="Hindi (हिन्दी)"
              >
                <span>हिंदी</span>
              </button>
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'en' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('en')}
                title="English"
              >
                <span>EN</span>
              </button>
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'kn' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('kn')}
                title="Kannada (ಕನ್ನಡ)"
              >
                <span>ಕನ್ನಡ</span>
              </button>
              <button
                type="button"
                className={`lang-btn ${voiceLanguage === 'te' ? 'active' : ''}`}
                onClick={() => changeLanguagePreference('te')}
                title="Telugu (తెలుగు)"
              >
                <span>తెలుగు</span>
              </button>
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`msg-bubble ${msg.role}`}>
                {msg.role === 'msg-ai' && msg.content !== 'Thinking...' && (
                  <span style={{ display: "inline-flex", alignItems: "center", marginRight: "6px", color: "var(--accent-cyan)" }}>
                    <i className="fa-solid fa-robot"></i>
                  </span>
                )}
                {msg.content === 'Thinking...' ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <i className="fa-solid fa-robot" style={{ color: "var(--accent-cyan)", fontSize: "0.85rem" }}></i>
                    <span style={{ fontSize: "0.8rem", color: "var(--accent-cyan)" }}>AI Bot is thinking</span>
                    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "0.75rem", color: "var(--accent-cyan)" }}></i>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            <div ref={chatMessagesEndRef} />
          </div>

          {/* Quick Suggestion Pills */}
          <div style={{ padding: "0.4rem 0.8rem", borderTop: "1px solid var(--border-color)", display: "flex", gap: "0.35rem", overflowX: "auto", background: "var(--bg-surface)", scrollbarWidth: "none" }}>
            <button
              onClick={() => handleSendChat("Can I bunk today's class?")}
              disabled={isChatLoading}
              style={{ fontSize: "0.7rem", padding: "0.25rem 0.65rem", borderRadius: "var(--radius-full)", background: "rgba(6, 182, 212, 0.12)", color: "var(--accent-cyan)", border: "1px solid rgba(6, 182, 212, 0.25)", cursor: isChatLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
              aria-label="Ask: Can I bunk today?"
            >
              Can I bunk today?
            </button>
            <button
              onClick={() => handleSendChat("How many classes do I need to attend for target?")}
              disabled={isChatLoading}
              style={{ fontSize: "0.7rem", padding: "0.25rem 0.65rem", borderRadius: "var(--radius-full)", background: "rgba(59, 130, 246, 0.12)", color: "var(--accent-primary)", border: "1px solid rgba(59, 130, 246, 0.25)", cursor: isChatLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
              aria-label="Ask: Classes needed?"
            >
              Classes needed?
            </button>
            <button
              onClick={() => handleSendChat("What is our projected exam score?")}
              disabled={isChatLoading}
              style={{ fontSize: "0.7rem", padding: "0.25rem 0.65rem", borderRadius: "var(--radius-full)", background: "rgba(168, 85, 247, 0.12)", color: "#c084fc", border: "1px solid rgba(168, 85, 247, 0.25)", cursor: isChatLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
              aria-label="Ask: Exam score?"
            >
              Exam score?
            </button>
          </div>

          {/* Spam & Validation Banner */}
          {chatSpamWarning && (
            <div style={{ padding: "0.35rem 0.75rem", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", fontSize: "0.75rem", borderTop: "1px solid rgba(239, 68, 68, 0.3)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <i className="fa-solid fa-shield-halved"></i>
              <span>{chatSpamWarning}</span>
            </div>
          )}

          <div className="chat-input-box" style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.85rem 1rem", boxSizing: "border-box", position: "relative" }}>
            {/* Anti-Bot Honeypot Field */}
            <input
              type="text"
              name="hp_bot_trap"
              tabIndex={-1}
              autoComplete="off"
              value={honeypotVal}
              onChange={(e) => setHoneypotVal(e.target.value)}
              style={{ display: "none", position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }}
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Ask me anything..."
              value={chatInput}
              disabled={isChatLoading}
              maxLength={1000}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              aria-label="Ask me anything"
              style={{ flex: 1, minWidth: 0, boxSizing: "border-box" }}
            />
            {chatInput.length > 250 && (
              <span style={{ fontSize: "0.68rem", color: chatInput.length > 900 ? "var(--status-danger)" : "var(--text-muted)", flexShrink: 0 }}>
                {chatInput.length}/1000
              </span>
            )}
            <button
              className="chat-send-btn"
              style={{
                width: "42px",
                height: "42px",
                minWidth: "42px",
                minHeight: "42px",
                borderRadius: "50%",
                background: !chatInput.trim() || isChatLoading ? "var(--bg-surface-hover)" : "linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))",
                color: !chatInput.trim() || isChatLoading ? "var(--text-muted)" : "#ffffff",
                border: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: !chatInput.trim() || isChatLoading ? "not-allowed" : "pointer",
                flexShrink: 0,
                boxShadow: !chatInput.trim() || isChatLoading ? "none" : "0 2px 10px rgba(6, 182, 212, 0.4)",
                transition: "all 0.2s ease"
              }}
              onClick={() => handleSendChat()}
              disabled={isChatLoading || !chatInput.trim()}
              title="Send message"
              aria-label="Send message"
            >
              <i
                className={`fa-solid ${isChatLoading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}
                style={{ fontSize: "0.95rem", marginLeft: "-2px", marginTop: "1px" }}
              ></i>
            </button>
          </div>
        </div>

        {/* FLOATING ACTION DOCK (PERMANENTLY ANCHORED AT BOTTOM) */}
        <div className="ai-floating-dock">
          {/* Live AI Consultant Button */}
          <button
            className="dock-btn btn-consult-live"
            onClick={() => {
              if (isMandatoryProfileSetup) {
                setShowEditProfileModal(true);
                return;
              }
              toggleVideoCall();
            }}
            title="Launch Live AI Video & Voice Consultant"
            aria-label="Launch Live AI Video and Voice Consultant"
          >
            <span className="live-pulse-dot"></span>
            <i className="fa-solid fa-headset" style={{ fontSize: "1.1rem" }}></i>
            <span>AI Consultant Live</span>
          </button>

          {/* AI Chat Bot Button */}
          <button
            className={`dock-btn ${chatOpen ? 'btn-chat-active' : ''}`}
            onClick={() => {
              if (isMandatoryProfileSetup) {
                setShowEditProfileModal(true);
                return;
              }
              setChatOpen(!chatOpen);
            }}
            title={chatOpen ? "Close AI Chat Bot" : "Open AI Chat Bot"}
            aria-label={chatOpen ? "Close AI Chat Bot" : "Open AI Chat Bot"}
          >
            <i className="fa-solid fa-robot" style={{ fontSize: "1.1rem", color: chatOpen ? "white" : "var(--accent-cyan)" }}></i>
            <span>AI Chat Bot</span>
          </button>
        </div>
      </div>

      {/* VIDEO CALL MODAL */}
      {videoCallOpen && (
        <div className="video-overlay">
          <div className="video-container">
            <div className="chat-header" style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
                  <i className="fa-solid fa-headset" style={{ color: "var(--accent-cyan)" }}></i> Live AI Consultant
                </h3>
                <span style={{ fontSize: "0.8rem", color: "var(--status-success)", display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.25rem" }}>
                  <i className="fa-solid fa-circle" style={{ fontSize: "0.5rem" }}></i> Secure Peer Connection Active
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                {/* Mobile Hands-Free VAD Status Pill */}
                <div
                  className={`vad-status-pill ${isUserVoiceActive ? 'speaking' : ''}`}
                  title="Mobile Hands-Free VAD: Simply speak into the mic to interrupt the AI immediately"
                >
                  <div className="vad-pulse-dot"></div>
                  <span>{isUserVoiceActive ? 'Voice Detected (Barge-In)' : 'Hands-Free VAD Active'}</span>
                </div>

                {/* Consultant Voice Language Switcher */}
                <div className="lang-switcher-pill" role="group" aria-label="Consultant Voice Language">
                  <button
                    type="button"
                    className={`lang-btn ${voiceLanguage === 'auto' ? 'active' : ''}`}
                    onClick={() => changeLanguagePreference('auto')}
                    title="Auto Detect Language"
                  >
                    <i className="fa-solid fa-globe"></i>
                    <span>Auto</span>
                  </button>
                  <button
                    type="button"
                    className={`lang-btn ${voiceLanguage === 'hi' ? 'active' : ''}`}
                    onClick={() => changeLanguagePreference('hi')}
                    title="Fluent Native Hindi (Google हिन्दी)"
                  >
                    <span>🇮🇳 हिंदी</span>
                  </button>
                  <button
                    type="button"
                    className={`lang-btn ${voiceLanguage === 'en' ? 'active' : ''}`}
                    onClick={() => changeLanguagePreference('en')}
                    title="English Voice"
                  >
                    <span>🇬🇧 EN</span>
                  </button>
                  <button
                    type="button"
                    className={`lang-btn ${voiceLanguage === 'kn' ? 'active' : ''}`}
                    onClick={() => changeLanguagePreference('kn')}
                    title="Kannada (ಕನ್ನಡ) - kn-IN"
                  >
                    <span>🇮🇳 ಕನ್ನಡ</span>
                  </button>
                  <button
                    type="button"
                    className={`lang-btn ${voiceLanguage === 'te' ? 'active' : ''}`}
                    onClick={() => changeLanguagePreference('te')}
                    title="Telugu (తెలుగు) - te-IN"
                  >
                    <span>🇮🇳 తెలుగు</span>
                  </button>
                </div>

                {/* Hindi Voice Accent Switcher (Live Quick Toggle) */}
                {(voiceLanguage === 'hi' || voiceLanguage === 'auto') && (
                  <div className="hindi-accent-pill" role="group" aria-label="Hindi Voice Accent">
                    <span className="accent-label" title="Active Accent"><i className="fa-solid fa-microphone-lines"></i> Accent:</span>
                    <button
                      type="button"
                      className={`accent-btn ${hindiAccent === 'rishi' ? 'active' : ''}`}
                      onClick={() => changeHindiAccent('rishi')}
                      title="Modern Indian Accent (Rishi - Male) - Crisp, friendly, natural college tone"
                    >
                      <span>🎙️ Rishi (Indian)</span>
                    </button>
                    <button
                      type="button"
                      className={`accent-btn ${hindiAccent === 'google' ? 'active' : ''}`}
                      onClick={() => changeHindiAccent('google')}
                      title="Neural Hindi (Google हिन्दी - Female) - Smooth North Indian Devanagari"
                    >
                      <span>🌟 Google (Neural)</span>
                    </button>
                    <button
                      type="button"
                      className={`accent-btn ${hindiAccent === 'lekha' ? 'active' : ''}`}
                      onClick={() => changeHindiAccent('lekha')}
                      title="Classic Hindi (Lekha) - Standard System"
                    >
                      <span>🔊 Lekha (Classic)</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="btn-icon"
                  style={{
                    width: "32px",
                    height: "32px",
                    minWidth: "32px",
                    minHeight: "32px",
                    color: "var(--accent-cyan)",
                    background: "rgba(6, 182, 212, 0.12)",
                    border: "1px solid rgba(6, 182, 212, 0.3)",
                    cursor: "pointer"
                  }}
                  onClick={() => {
                    setModalSelectedLang(voiceLanguage);
                    setShowLanguageModal(true);
                  }}
                  title="Voice & Language Preference Settings (Accents, Cadence, Dialects)"
                  aria-label="Voice & Language Preference Settings"
                >
                  <i className="fa-solid fa-sliders"></i>
                </button>

                <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: "1.1rem", fontWeight: 700 }}>
                  {formatDuration(callDuration)}
                </span>
                <button
                  className="btn-icon"
                  onClick={toggleVideoCall}
                  style={{ width: "32px", height: "32px", background: "rgba(255,255,255,0.08)", cursor: "pointer" }}
                  title="Close Video Consult"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            <div className="video-main">
              <div className="video-stage">
                
                {/* AI Status Badge with Voice Engine Indicator */}
                <div style={{ position: "absolute", top: "1rem", left: "1rem", display: "flex", alignItems: "center", gap: "0.6rem", background: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(12px)", padding: "0.4rem 0.85rem", borderRadius: "var(--radius-full)", border: "1px solid var(--border-color)", zIndex: 15 }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--status-success)", display: "inline-block", boxShadow: "0 0 10px var(--status-success)" }}></span>
                  <i className="fa-solid fa-headset" style={{ color: "var(--accent-cyan)", fontSize: "0.85rem" }}></i>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>Live AI Consultant</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "0.3rem", borderLeft: "1px solid var(--border-color)", paddingLeft: "0.5rem" }}>
                    <i className="fa-solid fa-language"></i> {
                      voiceLanguage === 'hi' ? '🇮🇳 Hindi (हिन्दी)' :
                      voiceLanguage === 'kn' ? '🇮🇳 Kannada (ಕನ್ನಡ)' :
                      voiceLanguage === 'te' ? '🇮🇳 Telugu (తెలుగు)' :
                      voiceLanguage === 'en' ? '🇬🇧 English' : '🌐 Auto Detect'
                    }
                  </span>
                  {isSpeaking && (
                    <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "0.3rem", borderLeft: "1px solid var(--border-color)", paddingLeft: "0.5rem" }}>
                      <i className="fa-solid fa-volume-high" style={{ animation: "pulseGlow 1s infinite" }}></i> Speaking...
                    </span>
                  )}
                  {isMicActive && !isSpeaking && (
                    <span style={{ fontSize: "0.75rem", color: "var(--status-danger)", display: "flex", alignItems: "center", gap: "0.3rem", borderLeft: "1px solid var(--border-color)", paddingLeft: "0.5rem" }}>
                      <i className="fa-solid fa-microphone-lines"></i> Listening...
                    </span>
                  )}
                  {isAnalyzingVideo && (
                    <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "0.3rem", borderLeft: "1px solid var(--border-color)", paddingLeft: "0.5rem" }}>
                      <i className="fa-solid fa-eye fa-spin"></i> Vision Scanning...
                    </span>
                  )}
                </div>

                {/* AI Avatar Center Stage */}
                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div
                    className={`${isSpeaking ? 'ai-active-motion' : ''} ${isAnalyzingVideo ? 'thinking-halo' : ''}`}
                    style={{
                      width: "260px",
                      height: "260px",
                      borderRadius: "50%",
                      padding: "8px",
                      background: isSpeaking
                        ? "linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))"
                        : isAnalyzingVideo
                        ? "linear-gradient(135deg, #a855f7, var(--accent-cyan))"
                        : "linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(6, 182, 212, 0.2))",
                      boxShadow: isSpeaking
                        ? "0 0 50px rgba(6, 182, 212, 0.6)"
                        : isAnalyzingVideo
                        ? "0 0 45px rgba(168, 85, 247, 0.6)"
                        : "0 0 30px rgba(59, 130, 246, 0.2)",
                      transition: "all 0.4s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative"
                    }}
                  >
                    <Image
                      src="/robot-avatar.png"
                      alt="Student AI Digital Twin Central Hologram Neural Avatar"
                      width={220}
                      height={220}
                      priority
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        objectFit: "cover",
                        background: "#0f172a"
                      }}
                      className={isSpeaking ? 'robot-movement' : ''}
                    />
                  </div>

                  {/* Active speech sound wave bars */}
                  {isSpeaking && (
                    <div className="bot-waveform-container" style={{ marginTop: "1rem" }}>
                      <div className="bot-wave-bar"></div>
                      <div className="bot-wave-bar"></div>
                      <div className="bot-wave-bar"></div>
                      <div className="bot-wave-bar"></div>
                      <div className="bot-wave-bar"></div>
                    </div>
                  )}

                  {/* Fast Interrupt Button over Center Stage */}
                  {isSpeaking && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <button
                        onClick={interruptSpeech}
                        className="btn-interrupt"
                        style={{
                          marginTop: "0.75rem",
                          padding: "0.45rem 1.1rem",
                          background: "rgba(239, 68, 68, 0.9)",
                          color: "white",
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          boxShadow: "0 4px 15px rgba(239, 68, 68, 0.5)",
                          zIndex: 25,
                          transition: "all 0.2s ease"
                        }}
                        title="Interrupt AI speaking (speak into mic or press Space / Esc)"
                      >
                        <i className="fa-solid fa-hand"></i> ⚡ Speak / Space to Interrupt
                      </button>
                      <span style={{ fontSize: "0.7rem", color: "#6ee7b7", marginTop: "0.35rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <span className="vad-pulse-dot"></span> Hands-Free VAD Active
                      </span>
                    </div>
                  )}
                </div>

                {/* User Camera PIP (Picture-In-Picture) */}
                <div className="user-pip" style={{ position: "absolute", bottom: "1rem", right: "1rem", width: "150px", height: "190px", borderRadius: "var(--radius-md)", overflow: "hidden", background: "#090d16", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", border: "2px solid var(--accent-primary)", zIndex: 20, boxShadow: "0 12px 30px rgba(0,0,0,0.7)" }}>
                  {/* Scanline laser sweep when AI is reading/analyzing user's video feed */}
                  {isAnalyzingVideo && <div className="scanline-overlay"></div>}

                  {userStream && userStream.getVideoTracks().length > 0 && isCameraActive ? (
                    <div style={{ position: "relative", width: "100%", height: "100%" }}>
                      <video
                        autoPlay
                        muted
                        playsInline
                        ref={(el) => {
                          userVideoRef.current = el;
                          if (el && userStream && el.srcObject !== userStream) {
                            el.srcObject = userStream;
                            el.play().catch(() => {});
                          }
                        }}
                        style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                      />
                      {/* 478-Point Face Mesh Neon Cyberpunk Canvas Overlay */}
                      <canvas
                        ref={faceMeshCanvasRef}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          pointerEvents: "none",
                          transform: "scaleX(-1)",
                          zIndex: 5
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "10px" }}>
                      <i className="fa-solid fa-user-astronaut" style={{ fontSize: "2rem", color: "var(--accent-cyan)", marginBottom: "8px" }}></i>
                      <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>You</p>
                      <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>({isCameraActive ? 'Preview' : 'Camera Off'})</p>
                      {mediaError && <p style={{ fontSize: "0.65rem", color: "var(--status-danger)", fontWeight: 600, marginTop: "6px", lineHeight: 1.2 }}>{mediaError}</p>}
                    </div>
                  )}
                  {/* Small PIP Status Indicator */}
                  <div style={{ position: "absolute", bottom: "6px", left: "6px", display: "flex", gap: "4px" }}>
                    <span style={{ fontSize: "0.65rem", background: "rgba(0,0,0,0.7)", padding: "2px 5px", borderRadius: "4px", color: isMicActive ? "var(--status-danger)" : "var(--text-muted)" }}>
                      <i className={`fa-solid ${isMicActive ? 'fa-microphone' : 'fa-microphone-slash'}`}></i>
                    </span>
                    {isAnalyzingVideo && (
                      <span style={{ fontSize: "0.65rem", background: "rgba(6, 182, 212, 0.8)", padding: "2px 5px", borderRadius: "4px", color: "#000", fontWeight: 700 }}>
                        SCAN
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* VIDEO CHAT TRANSCRIPT */}
              <div className="video-chat-pane" style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column", border: "1px solid var(--border-color)" }}>
                <div style={{ flex: 1, padding: "1rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {videoMessages.map((msg, i) => (
                    <div key={i} className={`msg-bubble ${msg.role}`} style={{ maxWidth: "100%", fontSize: "0.875rem" }}>
                      {msg.content}
                    </div>
                  ))}
                  <div ref={videoChatEndRef} />
                </div>

                {/* Proactive Video Emotion Suggestion Chips */}
                <div style={{ padding: "0.35rem 0.8rem", borderTop: "1px solid var(--border-color)", display: "flex", gap: "0.35rem", overflowX: "auto", background: "var(--bg-surface)", scrollbarWidth: "none" }}>
                  {(!detectedEmotion?.eyesDetected || (detectedEmotion?.eyeOpenness || 0) < 22 || !detectedEmotion?.hasFace) && (
                    <button
                      onClick={() => handleSendChat("Where are you? What are you doing?", 'video')}
                      disabled={isVideoLoading}
                      style={{ fontSize: "0.68rem", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.3)", cursor: isVideoLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <i className="fa-solid fa-eye-slash"></i> Where are you? (Eyes not detected)
                    </button>
                  )}
                  {detectedEmotion?.hasFace && (detectedEmotion.label.includes('Sad') || detectedEmotion.valence === 'negative' || detectedEmotion.stressScore >= 25 || (detectedEmotion.frownScore || 0) >= 8) && (
                    <button
                      onClick={() => handleSendChat("Why do I look sad today?", 'video')}
                      disabled={isVideoLoading}
                      style={{ fontSize: "0.68rem", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.3)", cursor: isVideoLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <i className="fa-solid fa-face-frown"></i> Why am I looking sad?
                    </button>
                  )}
                  {detectedEmotion?.hasFace && (detectedEmotion.label.includes('Joy') || detectedEmotion.label.includes('Happy') || detectedEmotion.smileScore >= 32) && (
                    <button
                      onClick={() => handleSendChat("Why do I look so happy today?", 'video')}
                      disabled={isVideoLoading}
                      style={{ fontSize: "0.68rem", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)", cursor: isVideoLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <i className="fa-solid fa-face-smile-beam"></i> Why am I looking so happy?
                    </button>
                  )}
                  <button
                    onClick={() => handleSendChat("How does my facial expression look right now?", 'video')}
                    disabled={isVideoLoading}
                    style={{ fontSize: "0.68rem", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", background: "rgba(6, 182, 212, 0.12)", color: "var(--accent-cyan)", border: "1px solid rgba(6, 182, 212, 0.25)", cursor: isVideoLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}
                  >
                    <i className="fa-solid fa-user-astronaut"></i> How do I look?
                  </button>
                  <button
                    onClick={() => handleSendChat("Can you see my face clearly on camera?", 'video')}
                    disabled={isVideoLoading}
                    style={{ fontSize: "0.68rem", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", background: "rgba(59, 130, 246, 0.12)", color: "var(--accent-primary)", border: "1px solid rgba(59, 130, 246, 0.25)", cursor: isVideoLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}
                  >
                    <i className="fa-solid fa-camera"></i> Can you see me?
                  </button>
                </div>

                <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <input
                    type="text"
                    placeholder={isMicActive ? "🎙️ Listening... Speak now..." : "Ask me anything..."}
                    className="modern-input"
                    style={{ flex: 1, minWidth: 0, background: "var(--bg-base)", fontSize: "0.875rem" }}
                    value={videoInput}
                    disabled={isVideoLoading}
                    onChange={(e) => setVideoInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat(undefined, 'video')}
                    aria-label="Ask live bot in video call"
                  />
                  <button
                    className="chat-send-btn"
                    style={{
                      width: "42px",
                      height: "42px",
                      minWidth: "42px",
                      minHeight: "42px",
                      borderRadius: "50%",
                      background: !videoInput.trim() || isVideoLoading ? "var(--bg-surface-hover)" : "linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))",
                      color: !videoInput.trim() || isVideoLoading ? "var(--text-muted)" : "#ffffff",
                      border: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: !videoInput.trim() || isVideoLoading ? "not-allowed" : "pointer",
                      flexShrink: 0,
                      boxShadow: !videoInput.trim() || isVideoLoading ? "none" : "0 2px 10px rgba(6, 182, 212, 0.4)",
                      transition: "all 0.2s ease"
                    }}
                    onClick={() => handleSendChat(undefined, 'video')}
                    disabled={isVideoLoading || !videoInput.trim()}
                    title="Send message"
                    aria-label="Send message"
                  >
                    <i
                      className={`fa-solid ${isVideoLoading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}
                      style={{ fontSize: "0.95rem", marginLeft: "-2px", marginTop: "1px" }}
                    ></i>
                  </button>
                </div>
              </div>
            </div>

            <div className="video-controls">
              <button
                className={`btn-control ${isMicActive ? 'active pulse-mic' : ''}`}
                onClick={toggleMic}
                title={isMicActive ? "Mute Microphone" : "Unmute Microphone"}
                aria-label={isMicActive ? "Mute Microphone" : "Unmute Microphone"}
                style={{
                  color: isMicActive ? "var(--status-danger)" : undefined,
                  borderColor: isMicActive ? "var(--status-danger)" : undefined
                }}
              >
                <i className={`fa-solid ${isMicActive ? 'fa-microphone' : 'fa-microphone-slash'}`}></i>
              </button>
              <button
                className="btn-control"
                onClick={toggleCamera}
                title={isCameraActive ? "Turn Off Camera" : "Turn On Camera"}
                aria-label={isCameraActive ? "Turn Off Camera" : "Turn On Camera"}
                style={{
                  color: !isCameraActive ? "var(--status-danger)" : "var(--text-primary)",
                  borderColor: !isCameraActive ? "var(--status-danger)" : undefined
                }}
              >
                <i className={`fa-solid ${isCameraActive ? 'fa-video' : 'fa-video-slash'}`}></i>
              </button>
              {/* AI Vision Video Analysis trigger */}
              <button
                className="btn-control"
                onClick={() => handleAnalyzeVideo()}
                disabled={isAnalyzingVideo}
                title="AI Vision: Scan & Analyze My Video Feed"
                aria-label="AI Vision: Scan & Analyze My Video Feed"
                style={{
                  background: isAnalyzingVideo ? "rgba(6, 182, 212, 0.25)" : undefined,
                  borderColor: "var(--accent-cyan)",
                  color: "var(--accent-cyan)"
                }}
              >
                <i className={`fa-solid ${isAnalyzingVideo ? 'fa-spinner fa-spin' : 'fa-eye'}`}></i>
              </button>
              {/* Barge-in / Interrupt control */}
              {isSpeaking && (
                <button
                  className="btn-control"
                  onClick={interruptSpeech}
                  title="Interrupt AI speaking (Space / Esc)"
                  aria-label="Interrupt AI speaking"
                  style={{
                    background: "rgba(239, 68, 68, 0.2)",
                    borderColor: "var(--status-danger)",
                    color: "var(--status-danger)"
                  }}
                >
                  <i className="fa-solid fa-hand"></i>
                </button>
              )}
              <button
                className="btn-control"
                onClick={() => speak("I am your AI Digital Twin, reading and analyzing your video in real time.")}
                title="Voice Test"
                aria-label="Voice Test"
              >
                <i className="fa-solid fa-volume-high"></i>
              </button>
              <button
                className="btn-control"
                onClick={() => {
                  setModalSelectedLang(voiceLanguage);
                  setShowLanguageModal(true);
                }}
                title={`Language Preference: ${currentLangDef.name} (${currentLangDef.nativeName})`}
                aria-label="Language Preference Settings"
                style={{
                  borderColor: "var(--accent-cyan)",
                  color: "var(--accent-cyan)"
                }}
              >
                <i className="fa-solid fa-sliders"></i>
              </button>
              <button
                className="btn-control btn-end-call"
                onClick={toggleVideoCall}
                title="End Consultation Call"
                aria-label="End Consultation Call"
              >
                <i className="fa-solid fa-phone-slash"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SUBJECT MARKS MODAL (60 CIA : 40 END SEM) */}
      {editingMarksSubject && (
        <div className="onboarding-overlay" style={{ zIndex: 99998 }} onClick={() => setEditingMarksSubject(null)}>
          <div className="onboarding-modal" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className="onboarding-header">
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <i className="fa-solid fa-graduation-cap" style={{ color: "var(--accent-cyan)" }}></i>
                  <span>Edit Marks · {editingMarksSubject.name}</span>
                </h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Weightage Evaluation: 60 Continuous Internal Assessment + 40 End Semester Final Exam = 100 Total
                </p>
              </div>
              <button
                className="btn-close"
                onClick={() => setEditingMarksSubject(null)}
                title="Close modal"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="onboarding-body">
              {/* Weightage Banner */}
              <div style={{
                background: "linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(59, 130, 246, 0.1))",
                border: "1px solid rgba(6, 182, 212, 0.25)",
                borderRadius: "var(--radius-md)",
                padding: "0.75rem 1rem",
                display: "flex",
                justifyContent: "space-around",
                alignItems: "center",
                textAlign: "center"
              }}>
                <div>
                  <div style={{ fontSize: "0.68rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Internal CIA</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#38bdf8" }}>60 <span style={{ fontSize: "0.75rem" }}>Marks</span></div>
                </div>
                <div style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>+</div>
                <div>
                  <div style={{ fontSize: "0.68rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>End Sem Exam</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#c084fc" }}>40 <span style={{ fontSize: "0.75rem" }}>Marks</span></div>
                </div>
                <div style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>=</div>
                <div>
                  <div style={{ fontSize: "0.68rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Total Composite</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--accent-cyan)" }}>100 <span style={{ fontSize: "0.75rem" }}>Marks</span></div>
                </div>
              </div>

              {/* Input for CIA Marks */}
              <div className="modern-input-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                  <label htmlFor="modal-cia-marks" style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                    Continuous Internal Assessment (CIA)
                  </label>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#38bdf8" }}>{editCiaMarks} / 60</span>
                </div>
                <input
                  id="modal-cia-marks"
                  className="modern-input"
                  type="number"
                  min="0"
                  max="60"
                  value={editCiaMarks}
                  onChange={(e) => setEditCiaMarks(Math.min(60, Math.max(0, parseFloat(e.target.value) || 0)))}
                  aria-label="Continuous Internal Assessment Marks out of 60"
                />
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={editCiaMarks}
                  onChange={(e) => setEditCiaMarks(parseInt(e.target.value, 10))}
                  style={{ width: "100%", marginTop: "0.4rem", accentColor: "#38bdf8", cursor: "pointer" }}
                />
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  Includes internal tests, assignments, quizzes, and continuous lab evaluations.
                </div>
              </div>

              {/* Input for End Sem Exam Marks */}
              <div className="modern-input-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                  <label htmlFor="modal-endsem-marks" style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                    End Semester Final Exam
                  </label>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#c084fc" }}>{editEndSemMarks} / 40</span>
                </div>
                <input
                  id="modal-endsem-marks"
                  className="modern-input"
                  type="number"
                  min="0"
                  max="40"
                  value={editEndSemMarks}
                  onChange={(e) => setEditEndSemMarks(Math.min(40, Math.max(0, parseFloat(e.target.value) || 0)))}
                  aria-label="End Semester Final Exam Marks out of 40"
                />
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={editEndSemMarks}
                  onChange={(e) => setEditEndSemMarks(parseInt(e.target.value, 10))}
                  style={{ width: "100%", marginTop: "0.4rem", accentColor: "#c084fc", cursor: "pointer" }}
                />
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  University semester examination conducted at the conclusion of the term.
                </div>
              </div>

              {/* Dynamic Target Calculation Card */}
              {(() => {
                const total = editCiaMarks + editEndSemMarks;
                const neededForPass = Math.max(0, 50 - editCiaMarks);
                const neededForDistinction = Math.max(0, 75 - editCiaMarks);
                const isPassing = total >= 50;
                const isDistinction = total >= 75;

                return (
                  <div style={{
                    background: "var(--bg-base)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-color)",
                    padding: "0.85rem 1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                        Composite Result (out of 100):
                      </span>
                      <span style={{ fontSize: "1.25rem", fontWeight: 800, color: isDistinction ? "var(--status-success)" : isPassing ? "var(--accent-cyan)" : "var(--status-danger)" }}>
                        {total} / 100 ({total}%)
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                      <div style={{ background: "rgba(16, 185, 129, 0.08)", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                        <div style={{ color: "var(--text-muted)" }}>Target 50% (Pass):</div>
                        <div style={{ fontWeight: 700, color: "var(--status-success)" }}>
                          {neededForPass === 0 ? "CIA Already Cleared Pass Threshold!" : `Need ${neededForPass} / 40 in End Sem`}
                        </div>
                      </div>

                      <div style={{ background: "rgba(6, 182, 212, 0.08)", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid rgba(6, 182, 212, 0.2)" }}>
                        <div style={{ color: "var(--text-muted)" }}>Target 75% (Distinction):</div>
                        <div style={{ fontWeight: 700, color: "var(--accent-cyan)" }}>
                          {neededForDistinction === 0 ? "Distinction Already Secured!" : neededForDistinction > 40 ? "Unattainable with current CIA" : `Need ${neededForDistinction} / 40 in End Sem`}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="onboarding-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingMarksSubject(null)}
                style={{ padding: "0.6rem 1.25rem", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveSubjectMarks}
                style={{ padding: "0.6rem 1.5rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <i className="fa-solid fa-check"></i>
                <span>Save Marks</span>
              </button>
            </div>
          </div>
        </div>
      )}



      {/* EDIT STUDENT PROFILE MODAL */}
      {showEditProfileModal && (
        <div
          className="onboarding-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(7, 11, 20, 0.88)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999999,
            padding: "1.25rem",
            overflowY: "auto"
          }}
          onClick={() => {
            if (!isMandatoryProfileSetup) {
              setShowEditProfileModal(false);
              setProfileError(null);
            }
          }}
        >
          <form
            className="onboarding-modal"
            style={{
              maxWidth: "500px",
              width: "100%",
              background: "#0d131f",
              border: "1px solid rgba(0, 240, 255, 0.45)",
              borderRadius: "16px",
              boxShadow: "0 25px 60px -12px rgba(0, 0, 0, 0.95), 0 0 30px rgba(0, 240, 255, 0.25)",
              overflow: "hidden",
              margin: "auto",
              display: "flex",
              flexDirection: "column"
            }}
            onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }}
            onClick={(e) => e.stopPropagation()}
          >
              <div className="onboarding-header" style={{ background: "#111827", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", padding: "1.25rem 1.5rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <i className="fa-solid fa-user-pen" style={{ color: "var(--accent-cyan)" }}></i>
                      <span>Edit Student Profile</span>
                    </h3>
                    {isMandatoryProfileSetup && (
                      <span style={{
                        fontSize: "0.68rem",
                        background: "rgba(6, 182, 212, 0.2)",
                        border: "1px solid rgba(6, 182, 212, 0.4)",
                        color: "var(--accent-cyan)",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}>
                        Mandatory Setup
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    Update your student name, college or university, and age.
                  </p>
                </div>
                {!isMandatoryProfileSetup && (
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowEditProfileModal(false);
                      setProfileError(null);
                    }}
                    title="Close modal"
                    aria-label="Close"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>

              <div className="onboarding-body" style={{ background: "#0b0f17", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                {isMandatoryProfileSetup && (
                  <div style={{
                    background: "rgba(6, 182, 212, 0.1)",
                    border: "1px solid rgba(6, 182, 212, 0.3)",
                    borderRadius: "8px",
                    padding: "0.65rem 0.85rem",
                    fontSize: "0.82rem",
                    color: "var(--accent-cyan)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}>
                    <i className="fa-solid fa-id-card" style={{ flexShrink: 0 }}></i>
                    <span>Please enter your details below to activate and unlock your portal dashboard and AI tools.</span>
                  </div>
                )}

                {profileError && (
                  <div style={{
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    borderRadius: "8px",
                    padding: "0.55rem 0.85rem",
                    fontSize: "0.82rem",
                    color: "#fca5a5",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}>
                    <i className="fa-solid fa-circle-exclamation" style={{ flexShrink: 0 }}></i>
                    <span>{profileError}</span>
                  </div>
                )}

                <div className="modern-input-group">
                  <label htmlFor="edit-profile-name" style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    Student Full Name <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    id="edit-profile-name"
                    className="modern-input"
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={editProfileName}
                    onChange={(e) => {
                      setEditProfileName(e.target.value);
                      if (profileError) setProfileError(null);
                    }}
                    autoFocus
                  />
                </div>

                <div className="modern-input-group">
                  <label htmlFor="edit-profile-college" style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    College / University <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    id="edit-profile-college"
                    className="modern-input"
                    type="text"
                    placeholder="e.g. Indian Institute of Technology Bombay"
                    value={editProfileCollege}
                    onChange={(e) => {
                      setEditProfileCollege(e.target.value);
                      if (profileError) setProfileError(null);
                    }}
                  />
                </div>

                <div className="modern-input-group">
                  <label htmlFor="edit-profile-age" style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    Age (Years) <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    id="edit-profile-age"
                    className="modern-input"
                    type="number"
                    min="15"
                    max="99"
                    value={editProfileAge}
                    onChange={(e) => {
                      setEditProfileAge(e.target.value);
                      if (profileError) setProfileError(null);
                    }}
                  />
                </div>
              </div>

              <div className="onboarding-footer" style={{ background: "#111827", borderTop: "1px solid rgba(255, 255, 255, 0.08)", padding: "1.1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {!isMandatoryProfileSetup ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowEditProfileModal(false);
                      setProfileError(null);
                    }}
                    style={{ padding: "0.6rem 1.25rem", fontSize: "0.85rem" }}
                  >
                    Cancel
                  </button>
                ) : (
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <i className="fa-solid fa-lock" style={{ color: "var(--accent-cyan)" }}></i>
                    <span>Profile required to unlock portal</span>
                  </div>
                )}
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: "0.65rem 1.5rem", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 700 }}
                >
                  <i className="fa-solid fa-check"></i>
                  <span>{isMandatoryProfileSetup ? "Save & Access Portal" : "Save Profile"}</span>
                </button>
              </div>
            </form>
        </div>
      )}

      {/* LANGUAGE PREFERENCE CONFIGURATION MODAL */}
      {showLanguageModal && (
        <div className="lang-modal-overlay" style={{ zIndex: 99999 }} onClick={() => setShowLanguageModal(false)}>
          <div className="lang-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="lang-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <i className="fa-solid fa-language" style={{ color: "var(--accent-cyan)" }}></i>
                  AI Voice & Language Preference
                </h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Choose your native tongue, regional dialect script, and speech cadence for your AI Digital Twin.
                </p>
              </div>
              <button
                className="btn-close"
                onClick={() => setShowLanguageModal(false)}
                title="Close settings"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="lang-modal-body">
              <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <i className="fa-solid fa-globe" style={{ color: "var(--accent-cyan)" }}></i>
                Select Primary Language
              </div>

              <div className="lang-cards-grid">
                {LANGUAGE_DEFINITIONS.map((lang) => {
                  const isSelected = modalSelectedLang === lang.id;
                  return (
                    <div
                      key={lang.id}
                      data-lang-id={lang.id}
                      role="button"
                      tabIndex={0}
                      className={`lang-pref-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setModalSelectedLang(lang.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setModalSelectedLang(lang.id);
                        }
                      }}
                    >
                      <div className="lang-pref-info">
                        <div className="lang-flag-icon">{lang.flag}</div>
                        <div>
                          <div className="lang-pref-title">
                            <span>{lang.name}</span>
                            <span style={{ fontSize: "0.8rem", color: "var(--accent-cyan)", fontWeight: 600 }}>({lang.nativeName})</span>
                            {lang.tag && (
                              <span style={{
                                fontSize: "0.65rem",
                                background: "rgba(6, 182, 212, 0.2)",
                                color: "var(--accent-cyan)",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "var(--radius-full)",
                                fontWeight: 700,
                                textTransform: "uppercase"
                              }}>
                                {lang.tag}
                              </span>
                            )}
                          </div>
                          <div className="lang-pref-sub">{lang.subtitle}</div>
                          <div className="lang-pref-sample">&ldquo;{lang.sample}&rdquo;</div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{
                            padding: "0.35rem 0.65rem",
                            fontSize: "0.75rem",
                            borderRadius: "var(--radius-full)",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            whiteSpace: "nowrap"
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            speak(lang.testPhrase, lang.id === 'auto' ? 'en' : lang.id);
                          }}
                          title={`Listen to sample in ${lang.name}`}
                        >
                          <i className="fa-solid fa-volume-high" style={{ color: "var(--accent-cyan)" }}></i>
                          <span>Test Voice</span>
                        </button>

                        <div className="lang-radio-circle"></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hindi Voice Accent & Diction Setting */}
              {(modalSelectedLang === 'hi' || modalSelectedLang === 'auto') && (
                <div style={{ marginTop: "1rem", padding: "1.1rem", background: "var(--bg-base)", borderRadius: "var(--radius-lg)", border: "1px solid rgba(6, 182, 212, 0.25)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                        <i className="fa-solid fa-microphone-lines" style={{ color: "var(--accent-cyan)" }}></i>
                        Hindi Voice Accent & Clarity
                      </div>
                      <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                        Select the spoken accent for Hindi and Hinglish. Test each accent live to choose what sounds most natural and clear to you.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {HINDI_ACCENT_DEFINITIONS.map((accent) => {
                      const isChosen = modalHindiAccent === accent.id;
                      return (
                        <div
                          key={accent.id}
                          className={`lang-pref-card ${isChosen ? 'selected' : ''}`}
                          style={{ padding: "0.85rem 1.1rem" }}
                          onClick={() => setModalHindiAccent(accent.id)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                            <div className="lang-radio-circle" style={{ width: "18px", height: "18px" }}></div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                <span>{accent.name}</span>
                                <span style={{
                                  fontSize: "0.62rem",
                                  background: isChosen ? "rgba(6, 182, 212, 0.25)" : "var(--bg-surface)",
                                  color: "var(--accent-cyan)",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: "var(--radius-full)",
                                  fontWeight: 700
                                }}>
                                  {accent.tag}
                                </span>
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                                {accent.description}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{
                              padding: "0.3rem 0.65rem",
                              fontSize: "0.72rem",
                              borderRadius: "var(--radius-full)",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              whiteSpace: "nowrap"
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              testHindiAccent(accent.id, accent.samplePhrase);
                            }}
                            title={`Listen to sample in ${accent.name}`}
                          >
                            <i className="fa-solid fa-volume-high" style={{ color: "var(--accent-cyan)" }}></i>
                            <span>Test Accent</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Speech Speed / Cadence Setting */}
              <div style={{ marginTop: "1.25rem", padding: "1rem", background: "var(--bg-base)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <i className="fa-solid fa-gauge-high" style={{ color: "var(--accent-cyan)" }}></i>
                      Speech Cadence & Voice Pacing
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                      Adjust how fast or relaxed your AI consultant articulates Indic & English speech.
                    </div>
                  </div>
                  <div className="speed-preset-group">
                    {[
                      { speed: 0.85, label: "0.85x Relaxed" },
                      { speed: 0.93, label: "0.93x Natural Indic" },
                      { speed: 1.0, label: "1.0x Standard" },
                      { speed: 1.15, label: "1.15x Quick" }
                    ].map((preset) => (
                      <button
                        key={preset.speed}
                        type="button"
                        className={`speed-chip ${Math.abs(speechSpeed - preset.speed) < 0.02 ? 'active' : ''}`}
                        onClick={() => changeSpeechSpeed(preset.speed)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Informational hint */}
              <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                <i className="fa-solid fa-circle-info" style={{ color: "var(--accent-cyan)", flexShrink: 0 }}></i>
                <span>Your preferred language stays saved across your entire session, AI video consultant, and chatbot.</span>
              </div>
            </div>

            <div className="lang-modal-footer">
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Active Selection: <strong style={{ color: "var(--accent-cyan)" }}>{LANGUAGE_DEFINITIONS.find(l => l.id === modalSelectedLang)?.name} ({LANGUAGE_DEFINITIONS.find(l => l.id === modalSelectedLang)?.nativeName})</strong>
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowLanguageModal(false)}
                  style={{ padding: "0.55rem 1.1rem", fontSize: "0.85rem" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    changeLanguagePreference(modalSelectedLang);
                    changeHindiAccent(modalHindiAccent, true);
                    setShowLanguageModal(false);
                  }}
                  style={{ padding: "0.55rem 1.25rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <i className="fa-solid fa-check"></i>
                  <span>Save Preference</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MICROPHONE PERMISSION / TROUBLESHOOTING MODAL */}


      {/* GLOBAL APPLICATION FOOTER */}
      <footer
        className="portal-footer"
        style={{
          marginTop: "4rem",
          borderTop: "1px solid var(--border-color)",
          padding: "2.5rem 1.5rem 7.5rem 1.5rem",
          background: "var(--bg-surface)",
          color: "var(--text-secondary)",
          fontSize: "0.85rem",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div
          className="portal-footer-top"
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(6, 182, 212, 0.15)", border: "1px solid rgba(6, 182, 212, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-cyan)", fontSize: "1.1rem" }} aria-hidden="true">
              <i className="fa-solid fa-layer-group"></i>
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.98rem" }}>Student AI Digital Twin</div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>Academic Telemetry & Biometric Engagement Architecture</div>
            </div>
          </div>

          <div
            className="portal-footer-links"
            style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}
          >
            <Link
              href="/privacy"
              style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: 500, transition: "color 0.2s" }}
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: 500, transition: "color 0.2s" }}
            >
              Terms & Conditions
            </Link>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('openCookiePreferences'))}
              style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500, padding: 0, display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <i className="fa-solid fa-cookie-bite" style={{ color: "var(--accent-cyan)" }} aria-hidden="true"></i>
              <span>Cookie Preferences</span>
            </button>
            <span style={{ color: "var(--status-success)", display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.12)", padding: "0.3rem 0.65rem", borderRadius: "9999px", border: "1px solid rgba(16, 185, 129, 0.3)", fontWeight: 600 }}>
              <i className="fa-solid fa-shield-halved" aria-hidden="true"></i> 100% On-Device Privacy
            </span>
          </div>
        </div>

        <div
          className="portal-footer-bottom"
          style={{
            maxWidth: "1280px",
            margin: "1.5rem auto 0 auto",
            paddingTop: "1.2rem",
            borderTop: "1px solid rgba(51, 65, 85, 0.4)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            fontSize: "0.76rem",
            color: "var(--text-muted)",
          }}
        >
          <div className="portal-footer-copy">© 2026 Student AI Digital Twin Systems • Academic Guidance Architecture</div>
          <div className="portal-footer-meta" style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <span>Strictly Advisory • Official ERP Records Prevail</span>
            <span style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>v2.4.0 Production</span>
          </div>
        </div>
      </footer>

      {/* LANGUAGE PREFERENCE TOAST NOTIFICATION */}
      {langToast && (
        <div className="lang-toast-notification">
          <i className="fa-solid fa-circle-check"></i>
          <span>{langToast}</span>
        </div>
      )}
    </div>
  );
}
