import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Visual Glitch / Tech Badge */}
      <div
        style={{
          width: '88px',
          height: '88px',
          borderRadius: '24px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          boxShadow: '0 0 30px rgba(239, 68, 68, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.5rem',
          color: '#ef4444',
          marginBottom: '1.75rem',
          animation: 'pulse 2s infinite',
        }}
        aria-hidden="true"
      >
        <i className="fa-solid fa-triangle-exclamation"></i>
      </div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.85rem',
          borderRadius: '9999px',
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          color: '#38bdf8',
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '1rem',
        }}
      >
        <i className="fa-solid fa-radar fa-spin" style={{ fontSize: '0.75rem' }} aria-hidden="true"></i>
        <span>Telemetry Desynchronized [404]</span>
      </div>

      <h1
        style={{
          fontSize: 'clamp(3rem, 8vw, 5.5rem)',
          fontWeight: 800,
          lineHeight: 1,
          margin: '0 0 0.75rem 0',
          background: 'linear-gradient(135deg, #f8fafc 30%, #38bdf8 70%, #06b6d4 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.02em',
        }}
      >
        404
      </h1>

      <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#f8fafc', margin: '0 0 1rem 0' }}>
        Coordinates Not Found in Digital Twin Mainframe
      </h2>

      <p
        style={{
          maxWidth: '540px',
          fontSize: '0.95rem',
          lineHeight: 1.6,
          color: '#cbd5e1',
          margin: '0 0 2.25rem 0',
        }}
      >
        The academic route or telemetry endpoint you navigated to does not exist or has been shifted in the quantum attendance matrix.
      </p>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
            color: '#ffffff',
            padding: '0.85rem 1.6rem',
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '0.92rem',
            textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(6, 182, 212, 0.35)',
            transition: 'transform 0.15s ease',
          }}
        >
          <i className="fa-solid fa-house" aria-hidden="true"></i>
          <span>Return to Command Center</span>
        </Link>

        <Link
          href="/privacy"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            padding: '0.85rem 1.4rem',
            borderRadius: '12px',
            fontWeight: 500,
            fontSize: '0.92rem',
            textDecoration: 'none',
          }}
        >
          <i className="fa-solid fa-shield-halved" aria-hidden="true"></i>
          <span>Privacy Policy</span>
        </Link>
      </div>

      {/* Diagnostic Footer */}
      <div
        style={{
          marginTop: '3.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid rgba(51, 65, 85, 0.5)',
          fontSize: '0.78rem',
          color: '#94a3b8',
        }}
      >
        System Status: Operational • Error Reference: <code>ERR_ACADEMIC_ROUTE_NOT_LOCATED</code>
      </div>
    </div>
  );
}
