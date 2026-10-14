import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description: 'Terms of service, academic forecasting disclaimers, and acceptable use guidelines for the Student AI Digital Twin platform.',
  alternates: {
    canonical: '/terms',
  },
};

export default function TermsAndConditionsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base, #020617)', color: 'var(--text-primary, #f8fafc)', padding: '2rem 1rem' }}>
      {/* Top Header Navigation */}
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
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '0.35rem 0.75rem',
              borderRadius: '9999px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <i className="fa-solid fa-file-contract" aria-hidden="true"></i>
            Academic Operating Charter
          </span>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Effective: October 2026</span>
        </div>
      </header>

      {/* Main Content Container */}
      <main style={{ maxWidth: '1000px', margin: '0 auto', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', borderRadius: '16px', padding: '2.5rem' }}>
        {/* Title */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#06b6d4', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            <i className="fa-solid fa-scale-balanced" aria-hidden="true"></i>
            User Agreement & Operational Protocol
          </div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1.2, margin: '0 0 1rem 0' }}>
            Terms and Conditions
          </h1>
          <p style={{ fontSize: '1.05rem', color: '#cbd5e1', lineHeight: 1.6, maxWidth: '820px', margin: 0 }}>
            Welcome to the Student AI Digital Twin. By accessing or interacting with our attendance forecasting engines,
            biometric telemetry, and AI consultant interfaces, you agree to comply with the terms and operational guidelines set forth below.
          </p>
        </div>

        {/* Essential Notice Box */}
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            marginBottom: '2rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ color: '#ef4444', fontSize: '1.4rem', flexShrink: 0, marginTop: '0.2rem' }}>
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          </div>
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.25rem 0' }}>
              Academic Advisory Disclaimer — Official University Records Prevail
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: 0, lineHeight: 1.55 }}>
              The Student AI Digital Twin provides algorithmic attendance simulations, safe bunk margin projections, and CGPA trajectories for personal guidance only.
              This platform does <strong>NOT</strong> represent or alter your institution&apos;s official Enterprise Resource Planning (ERP), Registrar, or Student Information System (SIS) records.
              Official university registers always supersede any calculations provided here.
            </p>
          </div>
        </div>

        {/* Section 1 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            1. Acceptance of Terms & Student Scope
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            By utilizing the software, you affirm that you are an enrolled student, educator, or authorized researcher using the application for legitimate educational purposes.
            Continued usage following any revisions to these Terms constitutes binding acceptance of the updated standards.
          </p>
        </section>

        {/* Section 2 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            2. Responsible Use & Anti-Abuse Standards
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            Users agree to interact with the service ethically. You expressly agree not to:
          </p>
          <ul style={{ paddingLeft: '1.5rem', color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.7, display: 'grid', gap: '0.4rem' }}>
            <li>Attempt automated denial-of-service, rapid-fire scripting, or brute-force spamming against the AI Consultant chat APIs.</li>
            <li>Inject malicious scripts, SQL payloads, or corrupted multimedia frames into the OCR transcript scanner or biometric pipeline.</li>
            <li>Reverse engineer or extract backend secret tokens or proprietary intelligence prompts.</li>
            <li>Rely on digital twin predictions to justify unlawful absence from mandatory academic examinations or practical lab sessions.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            3. Biometric Telemetry & Optical Engagement Consent
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            The 478-point facial mesh, gaze tracking, blink detection, and emotion classification functionalities operate strictly upon your explicit optical grant.
            The software executes all computer vision algorithms locally within client memory.
            You retain the unconditional right to disable your camera feed at any moment without penalty to basic attendance calculations.
          </p>
        </section>

        {/* Section 4 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            4. AI Consultant Outputs & Hallucination Guardrails
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            Responses generated by the AI Consultant are produced using probabilistic language inference.
            While calibrated to offer realistic academic counsel, answers may occasionally reflect variance in university syllabus interpretation or calculation nuances.
            Students are solely responsible for cross-checking semester credits and grading scale formulas with their departmental academic handbooks.
          </p>
        </section>

        {/* Section 5 */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            5. Limitation of Liability
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            To the maximum extent permitted by applicable law, the developers, creators, and host university shall not be held liable for:
            (a) Academic penalties, attendance shortages, or examination debarment resulting from student reliance on bunk margin forecasts;
            (b) Temporary downtime or service interruptions due to network instability or browser incompatibilities; or
            (c) Loss of local browser storage cache or timetable configuration files.
          </p>
        </section>

        {/* Section 6 */}
        <section>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.75rem' }}>
            6. Inquiries & Institutional Governance
          </h2>
          <p style={{ fontSize: '0.92rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            If you have questions regarding these terms, please contact the student systems administrative team at{' '}
            <a href="mailto:terms@studentdigitaltwin.edu" style={{ color: '#06b6d4', textDecoration: 'underline' }}>
              terms@studentdigitaltwin.edu
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
