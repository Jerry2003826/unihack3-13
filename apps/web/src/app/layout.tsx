import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { StoreHydrationGate } from "@/components/providers/StoreHydrationGate";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const bodyFont = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const headingFont = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const monoFont = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RentRadar",
  description: "AI-assisted rental property risk scanner and decision assistant.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${headingFont.variable} ${monoFont.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <I18nProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            <StoreHydrationGate>
              <LanguageSwitcher />
              {children}
            </StoreHydrationGate>
            <Toaster position="top-center" richColors />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
