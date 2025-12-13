import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login • WhatsApp AI Bot",
  description: "Sign in to your admin account",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

