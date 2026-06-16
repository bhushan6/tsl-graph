import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { ReactScan } from "@/components/react-scan";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TSL Graph",
  description: "Visual node-based shader editor for Three.js shading language (TSL)",
  icons: [
    {
      rel: "icon",
      url: "/light-logo.ico",
      media: "(prefers-color-scheme: dark)",
    },
    {
      rel: "icon",
      url: "/dark-logo.ico",
      media: "(prefers-color-scheme: light)",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConvexClientProvider>
          <NuqsAdapter>
            <ThemeProvider>
              <TooltipProvider>
                {children}
                <ReactScan />
                <Toaster position="top-center" richColors />
              </TooltipProvider>
            </ThemeProvider>
          </NuqsAdapter>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
