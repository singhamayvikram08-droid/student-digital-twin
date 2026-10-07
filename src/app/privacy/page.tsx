import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Understand how Student AI Digital Twin processes biometric telemetry, facial mesh landmarks, and academic data with 100% on-device privacy.',
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base, #020617)', color: 'var(--text-primary, #f8fafc)', padding: '2rem 1rem' }}>
      {/* Top Navigation */}
      <header
        style={{
          maxWidth: '1000px',
          margin: '0 auto 2rem auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid rgba(51, 65, 85, 0.6)',
          paddingBottom: '1rem',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#38bdf8',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: 600,
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
          <span>Return to Command Center</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              color: '#34d399',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '0.35rem 0.75rem',
              borderRadius: '9999px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <i className="fa-solid fa-shield-halved" aria-hidden="true"></i>
            100% On-Device Privacy Guaranteed
          </span>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Last Updated: October 2026</span>
        </div>
      </header>

      {/* Main Content Container */}
      <main style={{ maxWidth: '1000px', margin: '0 auto', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', borderRadius: '16px', padding: '2.5rem' }}>
        {/* Title */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#06b6d4', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            <i className="fa-solid fa-lock" aria-hidden="true"></i>
            Security & Governance Protocol
          </div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1.2, margin: '0 0 1rem 0' }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: '1.05rem', color: '#cbd5e1', lineHeight: 1.6, maxWidth: '820px', margin: 0 }}>
            The Student AI Digital Twin platform is engineered with a strict <strong>Privacy-by-Design</strong> architecture.
            We prioritize academic data confidentiality and ensure that biometric facial processing operates locally inside your personal browser sandbox.
          </p>
        </div>

        {/* Quick Highlights Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          <div style={{ background: '#020617', padding: '1.25rem', borderRadius: '12px', border: '1px solid #1e293b' }}>
            <div style={{ color: '#38bdf8', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
              <i className="fa-solid fa-eye-slash" aria-hidden="true"></i>
            </div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.35rem' }}>Zero Video Recording</h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              Webcam video feeds are processed in volatile client memory for real-time engagement telemetry. Raw frames are never written to disk or recorded.
            </p>
          </div>

          <div style={{ background: '#020617', padding: '1.25rem', borderRadius: '12px', border: '1px solid #1e293b' }}>
            <div style={{ color: '#34d399', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
              <i className="fa-solid fa-microchip" aria-hidden="true"></i>
            </div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.35rem' }}>On-Device MediaPipe Mesh</h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              The 478-point facial landmark mesh runs via client WebAssembly / GPU shaders directly in your browser. Biometric coordinate vectors never leave your device.
            </p>
          </div>

          <div style={{ background: '#020617', padding: '1.25rem', borderRadius: '12px', border: '1px solid #1e293b' }}>
            <div style={{ color: '#a855f7', fontSize: '1.2rem', marginBottom: '0.5rem' }}>
              <i className="fa-solid fa-database" aria-hidden="true"></i>
            </div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.35rem' }}>Local Data Ownership</h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              Attendance history, subject registers, and CGPA forecasts reside in your browser&apos;s isolated LocalStorage. You can clear or export your records at any time.
            </p>
          </div>
        </div>

        {/* Section 1 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>1. Information We Collect and Process</span>
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            When you use the Student AI Digital Twin, our systems process several distinct categories of information:
          </p>
          <ul style={{ paddingLeft: '1.5rem', color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.7, display: 'grid', gap: '0.4rem' }}>
            <li>
              <strong>Academic Input Data:</strong> Course names, target attendance percentages, attended and total class counts, semester credits, and target CGPA marks entered manually or via timetable imports.
            </li>
            <li>
              <strong>Optical Telemetry:</strong> Real-time eye coordinates, blink frequencies, head pitch/yaw/roll, and smile emotion probabilities computed using Google MediaPipe Tasks Vision.
            </li>
            <li>
              <strong>Speech & Audio Signals:</strong> Voice audio captured via the browser Web Speech API during AI Consultant sessions for multilingual dialogue synthesis.
            </li>
            <li>
              <strong>Interface State Preferences:</strong> Dark/light mode theme, chosen Indic language (English, Hindi, Kannada, Telugu), Hindi voice accent profile (Rishi, Google Neural, Lekha), and speech cadence multiplier.
            </li>
          </ul>
        </section>

        {/* Section 2 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            2. Biometric Data & On-Device Processing Architecture
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            Biometric privacy is paramount. Unlike surveillance software, our platform was intentionally constructed so that:
          </p>
          <div style={{ background: '#020617', borderLeft: '4px solid #06b6d4', padding: '1rem 1.25rem', borderRadius: '0 8px 8px 0', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.88rem', color: '#f8fafc', lineHeight: 1.6, margin: 0 }}>
              <strong>Ephemeral In-Memory Compute:</strong> Each camera frame is analyzed within 16 milliseconds in GPU buffer memory to extract numerical landmarks (e.g., eye aspect ratio). Once landmark calculations are computed, the frame buffer is immediately overwritten. At no point is an image file generated, saved, or uploaded.
            </p>
          </div>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            Users maintain full autonomy over their webcam. The camera feed can be toggled off at any second using the camera mute toggle or by denying camera permissions in your web browser.
          </p>
        </section>

        {/* Section 3 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            3. Artificial Intelligence & Language Processing
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            Our AI Consultant provides predictive attendance guidance and emotional wellness support.
            Queries submitted to the consultant are relayed through an authenticated local proxy service (FastAPI) which sanitizes data before model inference.
            We do not share student names, enrollment IDs, or biometric vectors with third-party advertising brokers or AI training datasets.
          </p>
        </section>

        {/* Section 4 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            4. Local Storage and Cookie Governance
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            We use browser LocalStorage rather than third-party tracking cookies to preserve your operational setup between browser tabs:
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#020617', color: '#38bdf8', textAlign: 'left', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '0.75rem' }}>Storage Key</th>
                <th style={{ padding: '0.75rem' }}>Purpose</th>
                <th style={{ padding: '0.75rem' }}>Duration</th>
              </tr>
            </thead>
            <tbody style={{ color: '#cbd5e1' }}>
              <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#f8fafc' }}>digital_twin_lang_pref</td>
                <td style={{ padding: '0.75rem' }}>Preserves language selection (EN, HI, KN, TE)</td>
                <td style={{ padding: '0.75rem' }}>Persistent until cleared</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#f8fafc' }}>digital_twin_hindi_accent</td>
                <td style={{ padding: '0.75rem' }}>Retains voice accent preference (Rishi, Google, Lekha)</td>
                <td style={{ padding: '0.75rem' }}>Persistent until cleared</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#f8fafc' }}>digital_twin_cookie_consent_v1</td>
                <td style={{ padding: '0.75rem' }}>Records your explicit consent choices</td>
                <td style={{ padding: '0.75rem' }}>1 Year</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Section 5 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            5. Student Rights & Data Management (FERPA & DPDP Alignment)
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            In alignment with the Family Educational Rights and Privacy Act (FERPA), the General Data Protection Regulation (GDPR), and India&apos;s Digital Personal Data Protection (DPDP) Act 2023, you hold the following rights:
          </p>
          <ul style={{ paddingLeft: '1.5rem', color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.7, display: 'grid', gap: '0.4rem' }}>
            <li><strong>Right of Rectification:</strong> Edit or overwrite your courses and attendance values directly in the dashboard.</li>
            <li><strong>Right of Erasure:</strong> Purge all local cached telemetry and preferences anytime by clearing your browser storage.</li>
            <li><strong>Right to Withdraw Consent:</strong> Revoke microphone or camera permissions in your browser address bar settings or through our Cookie Preferences drawer.</li>
          </ul>
        </section>

        {/* Section 6 */}
        <section>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            6. Contact & Data Protection Officer
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            For privacy inquiries, technical audits, or institutional compliance verification, please contact our data governance team at{' '}
            <a href="mailto:privacy@studentdigitaltwin.edu" style={{ color: '#06b6d4', textDecoration: 'underline' }}>
              privacy@studentdigitaltwin.edu
            </a>
            .
          </p>
        </section>
      </main>

      {/* Footer Navigation */}
      <footer style={{ maxWidth: '1000px', margin: '2rem auto 0 auto', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
        <p style={{ margin: '0 0 0.5rem 0' }}>Student AI Digital Twin Systems • Academic Telemetry & Decision Intelligence</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Home</Link>
          <Link href="/terms" style={{ color: '#38bdf8', textDecoration: 'none' }}>Terms & Conditions</Link>
          <Link href="/privacy" style={{ color: '#38bdf8', textDecoration: 'none' }}>Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
