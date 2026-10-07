/**
 * Privacy-First Client Analytics for Student AI Digital Twin
 * Fully respects GDPR / DPDP Cookie Consent preferences.
 */

export interface ConsentPreferences {
  essential: boolean;
  analytics: boolean;
  telemetry: boolean;
  timestamp: string;
}

const CONSENT_STORAGE_KEY = 'digital_twin_cookie_consent_v1';

export function getCookieConsent(): ConsentPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCookieConsent(preferences: Omit<ConsentPreferences, 'timestamp'>): ConsentPreferences {
  const fullConsent: ConsentPreferences = {
    ...preferences,
    timestamp: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(fullConsent));
    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: fullConsent }));
  }
  return fullConsent;
}

export function hasAnalyticsConsent(): boolean {
  const consent = getCookieConsent();
  return consent ? Boolean(consent.analytics) : false;
}

export interface AnalyticsEvent {
  name: string;
  category?: string;
  label?: string;
  value?: number;
  params?: Record<string, unknown>;
}

// In-memory debug telemetry log
const localEventLog: Array<AnalyticsEvent & { timestamp: number }> = [];

export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;

  // Always log locally in development for diagnostics
  if (process.env.NODE_ENV === 'development') {
    localEventLog.push({ name, params, timestamp: Date.now() });
    if (localEventLog.length > 50) localEventLog.shift();
  }

  // Only transmit externally if user granted analytics consent
  if (!hasAnalyticsConsent()) {
    return;
  }

  // Google Analytics 4 integration if gtag is initialized
  if (typeof (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag === 'function') {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag('event', name, params);
  }
}

export function trackPageView(path: string) {
  trackEvent('page_view', {
    page_path: path,
    page_title: typeof document !== 'undefined' ? document.title : '',
  });
}

export function getLocalEventAuditLog() {
  return [...localEventLog];
}
