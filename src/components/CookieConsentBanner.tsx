'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCookieConsent, setCookieConsent, trackEvent } from '@/lib/analytics';

export default function CookieConsentBanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  // Preference switches
  const [analyticsAllowed, setAnalyticsAllowed] = useState(true);
  const [telemetryAllowed, setTelemetryAllowed] = useState(true);

  useEffect(() => {
    // Check if consent has already been given
    const existing = getCookieConsent();
    if (!existing) {
      // Show banner after brief delay for smooth appearance
      const timer = setTimeout(() => setIsOpen(true), 600);
      return () => clearTimeout(timer);
    } else {
      setAnalyticsAllowed(existing.analytics);
      setTelemetryAllowed(existing.telemetry);
    }

    // Listen for custom event from footer to re-open consent settings
    const handleReopen = () => {
      const current = getCookieConsent();
      if (current) {
        setAnalyticsAllowed(current.analytics);
        setTelemetryAllowed(current.telemetry);
      }
      setShowPreferences(true);
      setIsOpen(true);
    };

    window.addEventListener('openCookiePreferences', handleReopen);
    return () => window.removeEventListener('openCookiePreferences', handleReopen);
  }, []);

  const handleAcceptAll = () => {
    setCookieConsent({
      essential: true,
      analytics: true,
      telemetry: true,
    });
    setIsOpen(false);
    setShowPreferences(false);
    trackEvent('cookie_consent_accepted_all');
  };

  const handleEssentialOnly = () => {
    setCookieConsent({
      essential: true,
      analytics: false,
      telemetry: false,
    });
    setIsOpen(false);
    setShowPreferences(false);
  };

  const handleSaveCustom = () => {
    setCookieConsent({
      essential: true,
      analytics: analyticsAllowed,
      telemetry: telemetryAllowed,
    });
    setIsOpen(false);
    setShowPreferences(false);
    trackEvent('cookie_consent_customized', {
      analytics: analyticsAllowed,
      telemetry: telemetryAllowed,
    });
  };

  if (!isOpen) return null;

  return (
    <aside
      className="cookie-consent-banner"
      aria-label="Privacy and Cookie Consent"
      role="region"
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 2.5rem)',
        maxWidth: '920px',
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(6, 182, 212, 0.4)',
        boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.8), 0 0 25px rgba(6, 182, 212, 0.15)',
        borderRadius: '16px',
        padding: '1.25rem 1.5rem',
        color: '#f8fafc',
        fontFamily: 'inherit',
        animation: 'slideUpCookie 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Shield / Cookie Icon */}
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'rgba(6, 182, 212, 0.15)',
            border: '1px solid rgba(6, 182, 212, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#38bdf8',
            fontSize: '1.2rem',
          }}
          aria-hidden="true"
        >
          <i className="fa-solid fa-cookie-bite"></i>
        </div>

        {/* Text info */}
        <div style={{ flex: '1 1 340px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
              Privacy & Biometric Data Consent
            </h3>
            <span
              style={{
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '0.15rem 0.45rem',
                borderRadius: '9999px',
                fontWeight: 600,
              }}
            >
              100% On-Device
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', lineHeight: '1.45', color: '#cbd5e1', margin: 0 }}>
            We use essential local storage to remember your language, attendance targets, and voice settings.
            Our 478-pt facial mesh and emotion telemetry process locally on your device and are{' '}
            <strong style={{ color: '#f8fafc' }}>never recorded or sold</strong>. Review our{' '}
            <Link
              href="/privacy"
              style={{ color: '#38bdf8', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 500 }}
            >
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link
              href="/terms"
              style={{ color: '#38bdf8', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 500 }}
            >
              Terms of Service
            </Link>
            .
          </p>

          {/* Granular Preference Drawer */}
          {showPreferences && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.85rem',
                background: 'rgba(2, 6, 23, 0.75)',
                borderRadius: '10px',
                border: '1px solid #334155',
                display: 'grid',
                gap: '0.65rem',
              }}
            >
              {/* Essential */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                    🔒 Essential System State (Required)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Saves attendance numbers, timetable, and voice accent preferences in local storage.
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>Always Active</span>
              </div>

              {/* Analytics */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                    📊 Performance & Usage Analytics
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Anonymous telemetry to measure attendance prediction calculation speeds.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={analyticsAllowed}
                  onChange={(e) => setAnalyticsAllowed(e.target.checked)}
                  aria-label="Toggle Performance & Usage Analytics"
                  style={{ width: '18px', height: '18px', accentColor: '#06b6d4', cursor: 'pointer' }}
                />
              </div>

              {/* Biometrics */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                    👁️ Real-time Biometric Analysis
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Permits local MediaPipe 478-pt face mesh for student engagement & fatigue detection.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={telemetryAllowed}
                  onChange={(e) => setTelemetryAllowed(e.target.checked)}
                  aria-label="Toggle Real-time Biometric Analysis"
                  style={{ width: '18px', height: '18px', accentColor: '#06b6d4', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            alignSelf: 'center',
          }}
        >
          {showPreferences ? (
            <button
              type="button"
              onClick={handleSaveCustom}
              style={{
                background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save Preferences
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleAcceptAll}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.55rem 1.15rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(6, 182, 212, 0.3)',
                }}
              >
                Accept All
              </button>
              <button
                type="button"
                onClick={handleEssentialOnly}
                style={{
                  background: '#1e293b',
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '0.55rem 0.95rem',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Essential Only
              </button>
              <button
                type="button"
                onClick={() => setShowPreferences(true)}
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '0.55rem 0.75rem',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                aria-label="Customize Cookie Preferences"
              >
                <i className="fa-solid fa-sliders" style={{ marginRight: '0.3rem' }}></i>
                Customize
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
