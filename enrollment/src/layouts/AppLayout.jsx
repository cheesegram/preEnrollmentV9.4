import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import AppHeader from "./AppHeader";

function AppLayout() {
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-slate-900">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar open={navigationOpen} onClose={() => setNavigationOpen(false)} />

      <div className="min-h-screen lg:pl-[16rem]">
        <AppHeader navigationOpen={navigationOpen} onOpenNavigation={() => setNavigationOpen(true)} />
        <main id="main-content" tabIndex={-1} className="relative min-w-0 min-h-[calc(100vh-4rem)]">
          <div className="relative">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
