import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, ArrowLeft, Plus, ShieldCheck } from "lucide-react";
import { AuthContext } from "../App.tsx";
import { Mission, Submission } from "../types.ts";
import { api } from "../lib/api.ts";

type Config = {
  surprise_goal_points: number;
  surprise_reward_name: string;
  min_per_coin_ratio: number;
  custom_play_activities: string[];
  timezone: string;
  photo_consent: boolean;
  ai_consent: boolean;
  aiAvailable: boolean;
};
const emptyMission = {
  title: "",
  instructions: "",
  points: 10,
  proof: "photo" as const,
  verification: "parent" as const,
  active: true,
};

function Evidence({
  submission,
  token,
}: {
  submission: Submission;
  token: string;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    setUrls([]);
    setError("");
    Promise.all(
      Array.from({ length: submission.evidenceCount }, async (_, index) => {
        const res = await fetch(
          `/api/parent/evidence/${submission._id}/${index}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok)
          throw new Error(
            "Photos have expired or are no longer available. You can still review the task with your child.",
          );
        const url = URL.createObjectURL(await res.blob());
        if (cancelled) {
          URL.revokeObjectURL(url);
          return "";
        }
        created.push(url);
        return url;
      }),
    )
      .then((results) => {
        if (!cancelled) setUrls(results);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [submission._id, submission.updatedAt, submission.evidenceCount, token]);
  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-on-surface-variant">{error}</p>}
      {submission.evidenceCount === 0 && (
        <p className="text-sm">Photos were deleted.</p>
      )}
      {urls.map((url, i) => (
        <figure key={url}>
          <img
            src={url}
            alt={
              submission.proof === "before_after"
                ? i === 0
                  ? "Before task"
                  : "After task"
                : "Submitted work"
            }
            className="w-full rounded-xl max-h-72 object-contain bg-background"
          />
          <figcaption className="text-xs mt-1">
            {submission.proof === "before_after"
              ? i === 0
                ? "Before"
                : "After"
              : "Completed work"}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function Parent() {
  const { user, token, parentToken, unlockParent, lockParent, updateUser } =
    useContext(AuthContext)!;
  const [password, setPassword] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [tab, setTab] = useState<"review" | "missions" | "settings">("review");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [review, setReview] = useState<Submission[]>([]);
  const [summary, setSummary] = useState<{
    earned: number;
    completed: number;
    pending: number;
  } | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [rewardText, setRewardText] = useState("");
  const [editing, setEditing] = useState<Partial<Mission> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    if (!parentToken) return;
    const [rows, queue, settings, stats] = await Promise.all([
      api<Mission[]>("/api/parent/missions", parentToken),
      api<Submission[]>("/api/parent/review", parentToken),
      api<Config>("/api/parent/config", parentToken),
      api("/api/parent/summary", parentToken),
    ]);
    setMissions(rows);
    setReview(queue);
    setConfig(settings);
    setRewardText(settings.custom_play_activities.join("\n"));
    setSummary(stats);
  }
  useEffect(() => {
    if (parentToken) void load().catch((e) => setError(e.message));
  }, [parentToken]);
  async function action(fn: () => Promise<void>, success = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    await action(async () => {
      const data = await api(
        user?.parent_setup ? "/api/parent/unlock" : "/api/parent/setup",
        token,
        {
          method: "POST",
          body: JSON.stringify(
            user?.parent_setup
              ? { password }
              : {
                  accountPassword,
                  parentPassword: password,
                  photoConsent: consent,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
          ),
        },
      );
      if (data.user) updateUser(data.user);
      unlockParent(data.parentToken);
      setPassword("");
      setAccountPassword("");
    });
  }
  async function decide(s: Submission, decision: "approve" | "reject") {
    await action(
      async () => {
        const result = await api(`/api/parent/review/${s._id}`, parentToken, {
          method: "POST",
          body: JSON.stringify({ decision }),
        });
        updateUser(result.user);
        await load();
      },
      decision === "approve"
        ? "Coins awarded. Your child’s surprise progress is updated too."
        : "Review saved. Your child can try again tomorrow.",
    );
  }
  async function saveMission(e: React.FormEvent) {
    e.preventDefault();
    await action(async () => {
      await api(
        `/api/parent/missions${editing?._id ? `/${editing._id}` : ""}`,
        parentToken,
        {
          method: editing?._id ? "PATCH" : "POST",
          body: JSON.stringify(editing),
        },
      );
      setEditing(null);
      await load();
    }, "Mission saved.");
  }
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    await action(async () => {
      const result = await api("/api/parent/config", parentToken, {
        method: "PATCH",
        body: JSON.stringify({
          ...config,
          custom_play_activities: rewardText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      updateUser(result.user);
      await load();
    }, "Parent settings saved.");
  }
  return (
    <div className="pt-6 space-y-5">
      <Link
        to="/earn"
        onClick={lockParent}
        className="inline-flex items-center gap-2 text-primary text-sm font-bold"
      >
        <ArrowLeft size={16} />
        Back to missions
      </Link>
      <div className="flex gap-3 items-center">
        <ShieldCheck className="text-primary" size={30} />
        <div>
          <h2 className="text-3xl font-black font-headline">Parent space</h2>
          <p className="text-sm text-on-surface-variant">
            Set the rules once. Let your child take the lead.
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="rounded-xl p-4 bg-red-50 text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          className="rounded-xl p-4 bg-green-50 text-green-800"
        >
          {message}
        </div>
      )}
      {!parentToken ? (
        <form
          onSubmit={unlock}
          className="rounded-3xl bg-surface-container-low p-5 space-y-5"
        >
          <LockKeyhole className="text-primary" />
          <h3 className="text-xl font-bold">
            {user?.parent_setup
              ? "Unlock parent controls"
              : "One-time parent setup"}
          </h3>
          {!user?.parent_setup && (
            <>
              <p className="text-sm">
                Keep your child’s existing sign-in. Create a separate parent
                password that only you know. Do this setup yourself before
                handing the app to your child.
              </p>
              <label className="mission-label">
                Current account password
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  className="mission-input"
                />
              </label>
            </>
          )}
          <label className="mission-label">
            {user?.parent_setup ? "Parent password" : "New parent password"}
            <input
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete={
                user?.parent_setup ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mission-input"
            />
          </label>
          {!user?.parent_setup && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1"
              />
              <span>
                I am the parent or guardian and allow private task photos,
                stored for up to 7 days. Faces are not required. AI sharing is
                off until I enable it.
              </span>
            </label>
          )}
          <button className="mission-button w-full" disabled={busy}>
            {busy
              ? "Checking…"
              : user?.parent_setup
                ? "Unlock"
                : "Create parent controls"}
          </button>
          <p className="text-xs text-on-surface-variant">
            Parent access locks after 15 minutes, on refresh, or when you return
            to the child’s screens.
          </p>
        </form>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-green-800 font-bold">
              Parent controls unlocked
            </span>
            <button onClick={lockParent} className="underline font-bold">
              Lock now
            </button>
          </div>
          {summary && (
            <section className="rounded-2xl bg-primary/10 p-4">
              <h3 className="font-bold">The last 7 days</h3>
              <p className="text-sm mt-2">
                {summary.completed} missions completed · {summary.earned} coins
                earned · {summary.pending} waiting for review
              </p>
            </section>
          )}
          <nav
            aria-label="Parent sections"
            className="grid grid-cols-3 gap-1 rounded-xl bg-surface-container-low p-1"
          >
            {(["review", "missions", "settings"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setMessage("");
                  setError("");
                  setEditing(null);
                }}
                className={`rounded-lg py-3 text-sm font-bold capitalize ${tab === t ? "bg-white text-primary shadow-sm" : ""}`}
              >
                {t}
                {t === "review" ? ` (${review.length})` : ""}
              </button>
            ))}
          </nav>
          {tab === "review" && (
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl">Review inbox</h3>
                <button
                  disabled={busy}
                  onClick={() => void action(load)}
                  className="text-sm underline"
                >
                  Refresh
                </button>
              </div>
              {review.length === 0 && (
                <div className="rounded-2xl bg-surface-container-low p-6">
                  <h4 className="font-bold">All caught up</h4>
                  <p className="text-sm mt-2">
                    Submissions that need your help will appear here.
                  </p>
                </div>
              )}
              {review.map((s) => (
                <article
                  key={s._id}
                  className="rounded-2xl border border-orange-100 bg-white p-4 space-y-3"
                >
                  <div className="flex justify-between gap-2">
                    <h4 className="font-bold">{s.title}</h4>
                    <strong className="text-primary whitespace-nowrap">
                      +{s.points}
                    </strong>
                  </div>
                  <p className="text-xs">
                    {s.day} ·{" "}
                    {s.status === "checking"
                      ? "Automatic check in progress"
                      : s.message}
                  </p>
                  <p className="text-sm">{s.instructions}</p>
                  <Evidence submission={s} token={parentToken} />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      disabled={busy}
                      className="mission-button"
                      onClick={() => void decide(s, "approve")}
                    >
                      Approve
                    </button>
                    <button
                      disabled={busy}
                      className="rounded-xl border border-orange-200 p-3 font-bold disabled:opacity-50"
                      onClick={() => void decide(s, "reject")}
                    >
                      Try tomorrow
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
          {tab === "missions" && (
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl">Daily missions</h3>
                <button
                  className="mission-button text-sm"
                  disabled={busy}
                  onClick={() => setEditing({ ...emptyMission })}
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
              <p className="text-sm">
                Each mission pays once a day. Start with outcomes you can see.
                AI cannot prove who did the work or how long it took.
              </p>
              {editing && (
                <form
                  onSubmit={saveMission}
                  className="rounded-2xl bg-surface-container-low p-4 space-y-4"
                >
                  <h4 className="font-bold">
                    {editing._id ? "Edit mission" : "New mission"}
                  </h4>
                  <label className="mission-label">
                    Title
                    <input
                      required
                      maxLength={80}
                      value={editing.title}
                      onChange={(e) =>
                        setEditing({ ...editing, title: e.target.value })
                      }
                      className="mission-input"
                    />
                  </label>
                  <label className="mission-label">
                    What should the photos show?
                    <textarea
                      required
                      minLength={10}
                      maxLength={600}
                      rows={4}
                      value={editing.instructions}
                      onChange={(e) =>
                        setEditing({ ...editing, instructions: e.target.value })
                      }
                      className="mission-input"
                    />
                  </label>
                  <label className="mission-label">
                    Coins (1–100)
                    <input
                      type="number"
                      required
                      min={1}
                      max={100}
                      step={1}
                      value={editing.points}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          points: Number(e.target.value),
                        })
                      }
                      className="mission-input"
                    />
                  </label>
                  <label className="mission-label">
                    Proof
                    <select
                      value={editing.proof}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          proof: e.target.value as Mission["proof"],
                        })
                      }
                      className="mission-input"
                    >
                      <option value="photo">Completed work photo</option>
                      <option value="before_after">
                        Before and after photos
                      </option>
                    </select>
                  </label>
                  <label className="mission-label">
                    Checking method
                    <select
                      value={editing.verification}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          verification: e.target
                            .value as Mission["verification"],
                        })
                      }
                      className="mission-input"
                    >
                      <option value="parent">Parent review</option>
                      <option value="ai">Automatic AI check</option>
                    </select>
                  </label>
                  {editing.verification === "ai" && (
                    <p className="text-sm">
                      AI checks require your AI consent in Settings and a
                      configured API key. Otherwise photos go to your review
                      inbox. Test the mission with real examples before relying
                      on automatic awards.
                    </p>
                  )}
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.active}
                      onChange={(e) =>
                        setEditing({ ...editing, active: e.target.checked })
                      }
                    />
                    Active
                  </label>
                  <div className="flex gap-4">
                    <button disabled={busy} className="mission-button">
                      Save mission
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditing(null)}
                      className="underline"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {missions.map((m) => (
                <article
                  key={m._id}
                  className="rounded-2xl border border-orange-100 p-4 bg-white space-y-2"
                >
                  <div className="flex justify-between gap-2">
                    <h4 className="font-bold">{m.title}</h4>
                    <strong className="text-primary">+{m.points}</strong>
                  </div>
                  <p className="text-sm">{m.instructions}</p>
                  <p className="text-xs text-on-surface-variant">
                    {m.active ? "Active" : "Paused"} ·{" "}
                    {m.proof === "photo" ? "One photo" : "Before & after"} ·{" "}
                    {m.verification === "ai" ? "AI check" : "Parent review"}
                  </p>
                  <button
                    disabled={busy}
                    className="text-primary font-bold underline text-sm"
                    onClick={() => setEditing({ ...m })}
                  >
                    Edit mission
                  </button>
                </article>
              ))}
            </section>
          )}
          {tab === "settings" && config && (
            <form
              onSubmit={saveSettings}
              className="space-y-5 rounded-2xl bg-surface-container-low p-4"
            >
              <h3 className="font-bold text-xl">Rewards & permissions</h3>
              <label className="mission-label">
                Surprise goal (coins)
                <input
                  type="number"
                  required
                  min={1}
                  max={100000}
                  value={config.surprise_goal_points}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      surprise_goal_points: Number(e.target.value),
                    })
                  }
                  className="mission-input"
                />
              </label>
              <label className="mission-label">
                Secret surprise reward
                <input
                  required
                  maxLength={100}
                  value={config.surprise_reward_name}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      surprise_reward_name: e.target.value,
                    })
                  }
                  className="mission-input"
                />
              </label>
              <label className="mission-label">
                Coins per reward minute
                <input
                  type="number"
                  required
                  min={1}
                  max={10}
                  value={config.min_per_coin_ratio}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      min_per_coin_ratio: Number(e.target.value),
                    })
                  }
                  className="mission-input"
                />
              </label>
              <label className="mission-label">
                Extra timed rewards (one per line, up to 10)
                <textarea
                  rows={3}
                  value={rewardText}
                  onChange={(e) => setRewardText(e.target.value)}
                  placeholder="Watch a favourite video"
                  className="mission-input"
                />
              </label>
              <p className="text-xs">
                Rewards log permission to play or watch. This app does not
                control other apps or devices. For gifts, use the surprise
                reward.
              </p>
              <label className="mission-label">
                Family time zone
                <input
                  required
                  value={config.timezone}
                  onChange={(e) =>
                    setConfig({ ...config, timezone: e.target.value })
                  }
                  placeholder="Asia/Kolkata"
                  className="mission-input"
                />
              </label>
              <p className="text-xs">
                Daily missions reset at midnight in this time zone.
              </p>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={config.photo_consent}
                  onChange={(e) =>
                    setConfig({ ...config, photo_consent: e.target.checked })
                  }
                  className="mt-1"
                />
                <span>
                  Allow private task photos. Unchecking this deletes existing
                  photos and blocks new submissions.
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={config.ai_consent}
                  onChange={(e) =>
                    setConfig({ ...config, ai_consent: e.target.checked })
                  }
                  className="mt-1"
                />
                <span>
                  Allow task photos to be sent to OpenAI for automatic checks on
                  missions I select. Faces are not required. AI can make
                  mistakes; uncertain checks go to my inbox.
                </span>
              </label>
              <p className="text-xs font-bold">
                {config.aiAvailable
                  ? "Automatic checking is available."
                  : "No AI key configured. Photos will go to your review inbox."}
              </p>
              <p className="text-xs">
                Private photos are deleted after 7 days. Mission history and
                photo hashes remain so reused photos cannot earn coins again.
              </p>
              <button disabled={busy} className="mission-button w-full">
                {busy ? "Saving…" : "Save settings"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
