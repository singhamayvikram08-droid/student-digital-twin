import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import "./language-preference.css";
import "./cgpa-planner.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import CookieConsentBanner from "@/components/CookieConsentBanner";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-outfit",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#020617",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://digitaltwin.university.edu"),
  title: {
    default: "Student AI Digital Twin | Academic Attendance & Biometric Optimization",
    template: "%s | Student AI Digital Twin",
  },
  description: "Real-time university attendance forecasting, safe bunk margin calculator, 478-point facial mesh engagement detection, and multilingual AI consultant.",
  keywords: [
    "Student AI Digital Twin",
    "Attendance Predictor",
    "Bunk Calculator",
    "University Attendance",
    "CGPA Optimization",
    "Face Mesh Telemetry",
    "Biometric Student AI",
    "MediaPipe 478-Point Mesh",
    "Indic Voice Consultant",
    "Privacy-First Student Dashboard",
  ],
  authors: [{ name: "Amay Vikram Singh & AI Digital Twin Team" }],
  creator: "Amay Vikram Singh",
  publisher: "Student AI Systems",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/icon.png"],
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Student AI Digital Twin | Academic Attendance & Biometric Optimization",
    description: "Real-time attendance forecasting, safe bunk calculations, 478-point facial mesh telemetry, and multilingual AI guidance with 100% on-device privacy.",
    url: "/",
    siteName: "Student AI Digital Twin",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Student AI Digital Twin Holographic Dashboard & Biometric Telemetry",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Student AI Digital Twin | Academic Attendance & Biometric Optimization",
    description: "Real-time attendance forecasting, safe bunk margin calculator, and biometric student engagement telemetry.",
    images: ["/og-image.png"],
    creator: "@studentdigitaltwin",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className={`${outfit.className} antialiased`} style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Accessible skip link */}
        <a
          href="#main-dashboard"
          className="skip-to-content-link"
          style={{ position: "fixed", top: "-9999px", left: "-9999px", zIndex: 10000 }}
        >
          Skip to main content
        </a>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {children}
        </div>

        {/* Global Privacy & Cookie Consent Banner */}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
