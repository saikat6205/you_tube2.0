import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { UserProvider } from "../lib/AuthContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import DevGeoSwitcher from "@/components/DevGeoSwitcher";
export default function App({ Component, pageProps }: AppProps) {
  return (
    <UserProvider>
      <ThemeProvider>
        <div className="min-h-screen bg-background text-foreground">
          <title>Your-Tube Clone</title>
          <Header />
          <Toaster />
          <DevGeoSwitcher />
          <div className="flex">
            <Sidebar />
            <Component {...pageProps} />
          </div>
        </div>
      </ThemeProvider>
    </UserProvider>
  );
}
