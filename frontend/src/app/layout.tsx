import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ConditionalLayout } from "@/components/conditional-layout";
import { getCurrentUser, getUserMembership, UserRole } from "@/lib/auth-helpers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WhatsApp AI Bot • Admin",
  description: "Admin dashboard for the WhatsApp AI chatbot with RAG + Gemini",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  let role: UserRole | null = null;
  if (user && user.profile?.default_org_id) {
    const membership = await getUserMembership(user.profile.default_org_id);
    role = membership?.role || null;
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100`}
      >
        <ThemeProvider>
          <ConditionalLayout userRole={role}>{children}</ConditionalLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
