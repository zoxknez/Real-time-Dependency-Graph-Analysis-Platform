import type { Metadata } from "next";
import "./globals.css";
import { ApolloWrapper } from "@/lib/apollo-wrapper";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";
import { ErrorBoundary } from "@/components/ui/error-boundary";

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
      <body className="min-h-screen theme-bg-primary gradient-mesh transition-colors duration-300">
        <ThemeProvider>
          <ApolloWrapper>
            <ToastProvider>
              <div className="flex h-screen overflow-hidden">
                {/* Sidebar Navigation */}
                <Sidebar />
                
                {/* Main Content Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Top Header */}
                  <Header />
                  
                  {/* Page Content with Error Boundary */}
                  <main className="flex-1 overflow-y-auto p-6">
                    <ErrorBoundary>
                      {children}
                    </ErrorBoundary>
                  </main>
                </div>
              </div>
              
              {/* Global Command Palette (Cmd+K) */}
              <CommandPalette />
            </ToastProvider>
          </ApolloWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
