import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { ApolloWrapper } from "@/lib/apollo-wrapper";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { WarRoomProvider } from "@/components/providers/war-room-provider";
import { WarRoomWebMcpBridge } from "@/components/providers/war-room-webmcp-bridge";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PageTransition } from "@/components/layout/page-transition";
import { SkipLink } from "@/components/ui/accessibility";

export const metadata: Metadata = {
  title: "Inverse Dependency Platform",
  description: "Enterprise-grade dependency graph explorer with real-time analysis",
  keywords: ["dependencies", "packages", "npm", "pypi", "cargo", "security", "vulnerabilities"],
  authors: [{ name: "IDP Team" }],
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('theme');
                  var resolved = saved;
                  if (!saved || saved === 'system') {
                    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(resolved);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen theme-bg-primary gradient-mesh transition-colors duration-300" suppressHydrationWarning>
        <ThemeProvider>
          <ApolloWrapper>
            <WarRoomProvider>
              <WarRoomWebMcpBridge />
              <ToastProvider>
                <SkipLink />
                <div className="flex h-screen overflow-hidden">
                  {/* Sidebar Navigation */}
                  <Sidebar />

                  {/* Main Content Area */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Top Header */}
                    <Header />

                    {/* Page Content with Error Boundary */}
                    <main id="main-content" className="flex-1 overflow-y-auto p-6 relative">
                      <ErrorBoundary>
                        <PageTransition>
                          {children}
                        </PageTransition>
                      </ErrorBoundary>
                    </main>
                  </div>
                </div>

                {/* Global Command Palette (Cmd+K) */}
                <CommandPalette />
              </ToastProvider>
            </WarRoomProvider>
          </ApolloWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
