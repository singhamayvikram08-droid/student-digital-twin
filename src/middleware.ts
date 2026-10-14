import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { headers, nextUrl } = request;
  const proto = headers.get('x-forwarded-proto');

  // Enforce HTTPS redirection in production when arriving via HTTP
  if (process.env.NODE_ENV === 'production' && proto === 'http') {
    const httpsUrl = nextUrl.clone();
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, {
      status: 301,
      headers: {
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      },
    });
  }

  const response = NextResponse.next();
  // Ensure HSTS is present on all responses
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * 1. /api/ routes that might handle raw webhooks
     * 2. /_next/ (Next.js internals)
     * 3. /_static (inside /public)
     * 4. Static files (e.g. /favicon.ico, /og-image.png, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)',
  ],
};
