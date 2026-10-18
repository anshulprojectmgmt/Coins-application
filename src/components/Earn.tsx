import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  CheckCircle2,
  Clock3,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import confetti from "canvas-confetti";
import { AuthContext } from "../App.tsx";
import { Mission, Submission } from "../types.ts";
import { api, photoData } from "../lib/api.ts";

const labels = {
  checking: "Checking…",
  pending: "Parent check",
  approved: "Coins earned!",
  retry: "Try another photo",
  rejected: "Try again tomorrow",
};

export function Earn() {
  const { user, token, updateUser } = useContext(AuthContext)!;
  const [missions, setMissions] = useState<Mission[]>([]);
  const [history, setHistory] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    try {
      const [data, rows, profile] = await Promise.all([
        api("/api/missions", token),
        api<Submission[]>("/api/submissions", token),
        api("/api/profile", token),
      ]);
      setMissions(data.missions);
      setHistory(rows);
      updateUser(profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [token]);
  async function selectPhoto(file: File | undefined, index: number) {
    if (!file) return;
    setError("");
    try {
      const data = await photoData(file);
      setPhotos((old) => {
        const next = [...old];
        next[index] = data;
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(mission: Mission) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(
        `/api/missions/${mission._id}/submissions`,
        token,
        { method: "POST", body: JSON.stringify({ photos }) },
      );
      updateUser(result.user);
      setNotice(
        result.submission.status === "approved"
          ? `You earned ${result.submission.points} coins!`
          : result.submission.message,
      );
      if (result.submission.status === "approved")
        confetti({
          particleCount: 90,
          spread: 65,
          colors: ["#fd9000", "#a7295a", "#43a675"],
        });
      setSelected(null);
      setPhotos([]);
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  const earned = missions
    .filter((m) => m.submission?.status === "approved")
    .reduce((sum, m) => sum + m.submission.points, 0);
  return (
    <div className="pt-6 space-y-6">
      <section className="rounded-3xl bg-primary text-on-primary p-6 shadow-lg">
        <Sparkles className="mb-3" />
        <p className="text-sm font-bold uppercase tracking-widest opacity-80">
          A little effort. A big adventure.
        </p>
        <h2 className="font-headline text-3xl font-black mt-2">
          Today’s missions
        </h2>
        <p className="mt-3">
          Complete a mission, share a photo, grow your coin chest.
        </p>
        <div className="mt-5 text-2xl font-black">
          +{earned}{" "}
          <span className="text-sm font-medium">coins earned today</span>
        </div>
      </section>
      {!user?.photo_consent && (
        <div className="rounded-2xl bg-surface-container-low p-5 space-y-2">
          <h3 className="font-bold">Let’s get ready!</h3>
          <p>Ask a parent to set up your missions and allow private photos.</p>
          <Link className="text-primary underline font-bold" to="/parent">
            Parent setup
          </Link>
        </div>
      )}
      <p className="text-sm text-on-surface-variant">
        Photograph your work, not your face. Keep names, school details and
        other people out of the picture. Photos are private and deleted after 7
        days.
      </p>
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-800 p-4">
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-xl bg-green-50 text-green-800 p-4 font-bold"
        >
          {notice}
        </div>
      )}
      <div className="flex justify-between items-center">
        <h3 className="font-bold">One reward per mission each day</h3>
        <button
          type="button"
          aria-label="Refresh missions"
          onClick={() => void load()}
          className="p-3 text-primary"
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {loading && <p role="status">Finding your missions…</p>}
      {!loading && !missions.length && (
        <p className="p-5 rounded-2xl bg-surface-container-low">
          No active missions yet. Ask a parent to add one.
        </p>
      )}
      {missions.map((mission, i) => {
        const s = mission.submission;
        const canSubmit = !s || s.status === "retry";
        const count = mission.proof === "before_after" ? 2 : 1;
        const open = selected === mission._id;
        return (
          <section
            key={mission._id}
            className="rounded-3xl border border-orange-100 bg-surface-container-lowest shadow-sm overflow-hidden"
          >
            <div className="p-5 space-y-3">
              <div className="flex gap-3 items-start">
                <span className="bg-primary/10 text-primary rounded-2xl p-3 font-black">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <h3 className="text-xl font-bold">{mission.title}</h3>
                  <p className="text-sm font-bold text-primary">
                    +{mission.points} coins
                  </p>
                </div>
                {s?.status === "approved" && (
                  <CheckCircle2 className="text-green-700" />
                )}
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {mission.instructions}
              </p>
              {s && (
                <div className="rounded-xl bg-background p-3 text-sm">
                  <p className="font-bold flex items-center gap-2">
                    <Clock3 size={16} />
                    {labels[s.status]}
                  </p>
                  <p className="mt-1">{s.message}</p>
                </div>
              )}
              {canSubmit && !open && (
                <button
                  type="button"
                  disabled={!user?.photo_consent || busy}
                  onClick={() => {
                    setSelected(mission._id);
                    setPhotos([]);
                    setError("");
                  }}
                  className="mission-button w-full"
                >
                  <Camera size={18} />
                  {s ? "Try again" : "Start mission"}
                </button>
              )}
            </div>
            {open && (
              <div className="p-5 pt-0 space-y-4">
                {Array.from({ length: count }, (_, index) => (
                  <label
                    key={index}
                    className="block rounded-2xl border-2 border-dashed border-primary/30 p-4 cursor-pointer"
                  >
                    <span className="font-bold text-sm flex items-center gap-2">
                      <Camera size={18} />
                      {count === 2
                        ? index === 0
                          ? "1. Before you start"
                          : "2. After you finish"
                        : "Show your completed work"}
                    </span>
                    <input
                      type="file"
                      aria-label={
                        count === 2
                          ? index === 0
                            ? "Before photo"
                            : "After photo"
                          : "Mission photo"
                      }
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      disabled={busy}
                      onChange={(e) =>
                        void selectPhoto(e.target.files?.[0], index)
                      }
                      className="block w-full text-sm mt-3"
                    />
                    {photos[index] && (
                      <img
                        src={photos[index]}
                        alt={
                          count === 2
                            ? index === 0
                              ? "Your before photo"
                              : "Your after photo"
                            : "Your mission photo"
                        }
                        className="mt-3 rounded-xl max-h-48 w-full object-contain bg-background"
                      />
                    )}
                  </label>
                ))}
                <button
                  type="button"
                  disabled={
                    busy ||
                    Array.from({ length: count }, (_, i) => photos[i]).some(
                      (p) => !p,
                    )
                  }
                  onClick={() => void submit(mission)}
                  className="mission-button w-full"
                >
                  {busy ? "Saving and checking…" : "I did it! Check my photos"}
                </button>
                {busy && (
                  <p role="status" className="text-sm">
                    This can take a little while. You can refresh later; your
                    saved submission will still be here.
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy}
                  className="w-full text-sm underline"
                  onClick={() => {
                    setSelected(null);
                    setPhotos([]);
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        );
      })}
      {history.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-bold text-lg">My recent efforts</h3>
          {history.slice(0, 8).map((s) => (
            <div
              key={s._id}
              className="rounded-xl p-4 bg-surface-container-low text-sm"
            >
              <div className="flex justify-between gap-3">
                <strong>{s.title}</strong>
                <span>
                  {s.status === "approved" ? `+${s.points}` : labels[s.status]}
                </span>
              </div>
              <p className="text-on-surface-variant mt-1">
                {s.day} · {s.message}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
