import React, { useContext } from "react";
import { Link } from "react-router-dom";
import { X, LogOut, ShieldCheck } from "lucide-react";
import { AuthContext } from "../App.tsx";

export function SettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user, logout } = useContext(AuthContext)!;
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-5 bg-black/30"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-background p-6 shadow-xl space-y-5"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-black text-primary">Settings</h2>
          <button autoFocus aria-label="Close settings" onClick={onClose}>
            <X />
          </button>
        </div>
        <p>
          Signed in as <strong>{user?.username}</strong>
        </p>
        <Link to="/parent" onClick={onClose} className="mission-button w-full">
          <ShieldCheck size={18} />
          Parent space
        </Link>
        <p className="text-sm text-on-surface-variant">
          A separate parent password protects missions, reward prices and
          surprise settings.
        </p>
        <button
          className="inline-flex gap-2 items-center font-bold text-primary"
          onClick={() => {
            logout();
            onClose();
          }}
        >
          <LogOut size={18} />
          Sign out
        </button>
      </section>
    </div>
  );
}
