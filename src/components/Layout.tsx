import React, { useState, useContext, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Gamepad2, Stars, Gift, Settings } from "lucide-react";
import { AuthContext } from "../App.tsx";
import { SettingsModal } from "./SettingsModal.tsx";
import { cn } from "../lib/utils.ts";

export function Layout() {
  const location = useLocation();
  const { user, lockParent } = useContext(AuthContext)!;
  useEffect(() => { if (location.pathname !== '/parent') lockParent(); }, [location.pathname]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/spend", label: "Spend", icon: Gamepad2 },
    { path: "/earn", label: "Missions", icon: Stars },
    { path: "/surprise", label: "Surprise", icon: Gift },
  ];

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-background relative">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md w-full">
        <div className="flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/20">
              <img
                alt="Avatar"
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-2xl font-black text-primary tracking-tight font-headline">
              Habit Hero
            </h1>
          </div>
          <button
            aria-label="Open settings"
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center justify-center text-primary hover:scale-105 active:scale-95 transition-all"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 pb-32">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 flex justify-around items-center px-4 pb-8 pt-4 bg-background/90 backdrop-blur-xl rounded-t-[3rem] shadow-[0_-12px_32px_rgba(67,41,0,0.08)] border-t border-orange-100">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center transition-all duration-150 active:scale-90",
                isActive
                  ? "bg-primary-container text-white rounded-[2rem] px-5 py-2 scale-110 shadow-lg"
                  : "text-secondary opacity-70 px-4 py-2 hover:bg-surface-container-low rounded-full",
              )}
            >
              <Icon className={cn("w-6 h-6", isActive && "fill-current")} />
              <span className="text-[12px] font-bold tracking-wide mt-0.5">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
