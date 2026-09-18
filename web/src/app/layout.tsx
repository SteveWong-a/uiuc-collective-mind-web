import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "UIUC Collective Mind",
  description: "Track your UIUC assignments, grades, and deadlines across Canvas, PrairieLearn, and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:ital,wght@0,400;0,500;0,700;0,800;1,400&display=swap"
          rel="stylesheet"
        />
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 fill=%27%23000%27/%3E%3Ccircle cx=%2716%27 cy=%2716%27 r=%278%27 fill=%27none%27 stroke=%27%23fff%27 stroke-width=%273%27/%3E%3C/svg%3E"
        />
      </head>
      <body className="font-grotesk">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
