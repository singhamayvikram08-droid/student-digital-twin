/**
 * API Configuration Module
 * Dynamically resolves the backend API endpoint for local development
 * and cloud production deployments (e.g. Render, Vercel).
 */

export const API_BASE_URL: string = (
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:8000'
    : 'http://127.0.0.1:8000')
).replace(/\/+$/, '');
