import React, { useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gamepad2 } from "lucide-react";
import { AuthContext } from "../App.tsx";
import { Activity } from "../types.ts";
import { api } from "../lib/api.ts";

const defaults = [
  "Space Explorer",
  "Math Match",
  "Puzzle Quest",
  "Word Wizard",
];
export function Spend() {
  const { user, token, updateUser } = useContext(AuthContext)!;
  const navigate = useNavigate();
  const [name, setName] = useState(defaults[0]);
  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<Activity[]>([]);
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    api<Activity[]>("/api/activities/recent/spend", token)
      .then(setRecent)
      .catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, [name, minutes]);
  const cost = minutes * (user?.min_per_coin_ratio || 1);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const activity = await api<Activity>("/api/activities", token, {
        method: "POST",
        body: JSON.stringify({
          type: "spend",
          activityName: name,
          durationMinutes: minutes,
          requestId: requestId.current,
        }),
      });
      const profile = await api("/api/profile", token);
      updateUser(profile);
      navigate("/", {
        state: {
          pointsDelta: activity.pointsImpact,
          previousTotalCoins: profile.total_coins - activity.pointsImpact,
          animationKey: Date.now(),
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pt-6 space-y-6">
      <header>
        <Gamepad2 className="text-primary mb-3" size={32} />
        <h2 className="font-headline text-3xl font-black">Choose your fun</h2>
        <p className="mt-2 text-on-surface-variant">
          You’ve earned it. Pick a reward from your parent’s list.
        </p>
      </header>
      <div className="rounded-2xl bg-primary text-on-primary p-5">
        <p className="text-sm">In your coin chest</p>
        <p className="text-4xl font-black mt-2">{user?.total_coins || 0}</p>
      </div>
      <form
        onSubmit={submit}
        className="rounded-3xl bg-surface-container-low p-5 space-y-5"
      >
        {error && (
          <p role="alert" className="bg-red-50 text-red-800 rounded-xl p-3">
            {error}
          </p>
        )}
        <label className="mission-label">
          My reward
          <select
            disabled={busy}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mission-input"
          >
            {[
              ...new Set([
                ...defaults,
                ...(user?.custom_play_activities || []),
              ]),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="mission-label">
          Minutes
          <input
            type="number"
            required
            min={1}
            max={120}
            step={1}
            disabled={busy}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="mission-input"
          />
        </label>
        <div className="flex justify-between font-bold">
          <span>Cost</span>
          <span>{cost} coins</span>
        </div>
        <p className="text-xs text-on-surface-variant">
          Your parent sets the price: {user?.min_per_coin_ratio || 1} coin(s)
          per minute. Spending does not reduce surprise progress.
        </p>
        <button
          disabled={busy || cost > (user?.total_coins || 0)}
          className="mission-button w-full"
        >
          {busy
            ? "Saving…"
            : cost > (user?.total_coins || 0)
              ? "Complete a mission to earn more"
              : "Use my coins"}
        </button>
        <p className="text-xs">
          This records your reward. Ask your parent for access to the game or
          video.
        </p>
      </form>
      {recent.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-bold">Recent rewards</h3>
          {recent.map((a) => (
            <div
              key={a._id}
              className="rounded-xl bg-white border border-orange-100 p-4 flex justify-between gap-3 text-sm"
            >
              <div>
                <strong>{a.activityName}</strong>
                <p>
                  {a.durationMinutes} minutes ·{" "}
                  {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </div>
              <strong>{a.pointsImpact}</strong>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
