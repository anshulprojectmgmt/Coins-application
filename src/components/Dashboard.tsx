import React, { useState, useEffect, useContext, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Gamepad2, PlusCircle, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AuthContext } from '../App.tsx';
import { Activity } from '../types.ts';
import { cn } from '../lib/utils.ts';

interface DashboardNavigationState {
  pointsDelta?: number;
  previousTotalCoins?: number;
  animationKey?: number;
}

interface LevelMeterProps {
  totalCoins: number;
  level: number;
  currentXP: number;
  levelThreshold: number;
  progressPercent: number;
  activeDelta: number | null;
}

const MOTIVATION_QUOTES = [
  'Small steps make big wins.',
  'Keep trying. You are growing.',
  'Brave kids try one more time.',
  'You can do hard things.',
  'Every try makes you stronger.',
  'Mistakes help your brain grow.',
  'You are getting better each day.',
  'Take a breath, then try again.',
  'Your effort is your superpower.',
  'One more try can surprise you.',
];

function getRandomMotivationQuote(previousIndex: number | null) {
  if (MOTIVATION_QUOTES.length === 1) {
    return { quote: MOTIVATION_QUOTES[0], index: 0 };
  }

  let nextIndex = Math.floor(Math.random() * MOTIVATION_QUOTES.length);

  while (nextIndex === previousIndex) {
    nextIndex = Math.floor(Math.random() * MOTIVATION_QUOTES.length);
  }

  return { quote: MOTIVATION_QUOTES[nextIndex], index: nextIndex };
}

const LevelMeter: React.FC<LevelMeterProps> = ({
  totalCoins,
  level,
  currentXP,
  levelThreshold,
  progressPercent,
  activeDelta
}) => {
  const radius = 132;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (progressPercent / 100) * circumference;
  const pointsToNext = Math.max(levelThreshold - currentXP, 0);

  return (
    <section className="flex flex-col items-center justify-center pt-4 pb-6">
      <div className="relative w-full max-w-[330px] aspect-square flex items-center justify-center">
        <AnimatePresence>
          {activeDelta !== null && activeDelta !== 0 && (
            <motion.div
              key={activeDelta}
              initial={{ opacity: 0, y: 18, scale: 0.75 }}
              animate={{ opacity: 1, y: -10, scale: 1 }}
              exit={{ opacity: 0, y: -34, scale: 0.8 }}
              className={cn(
                'absolute right-2 top-6 z-20 rounded-full px-4 py-2 font-headline text-lg font-black text-white shadow-lg',
                activeDelta > 0 ? 'bg-tertiary' : 'bg-secondary'
              )}
            >
              {activeDelta > 0 ? `+${activeDelta}` : activeDelta}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          aria-hidden="true"
          className="absolute inset-[7%] rounded-full bg-[#fff9f2] shadow-[0_16px_40px_rgba(138,76,0,0.12)]"
          animate={{ scale: [1, 1.015, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 320 320">
          <circle
            cx="160"
            cy="160"
            r={radius}
            fill="none"
            stroke="#ffe2bd"
            strokeWidth="34"
          />
          <motion.circle
            cx="160"
            cy="160"
            r={radius}
            fill="none"
            stroke="#fd9000"
            strokeWidth="34"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: strokeOffset }}
            transition={{ type: 'spring', bounce: 0.18, duration: 1.4 }}
          />
        </svg>
        <div className="absolute inset-[17%] rounded-full bg-white border border-[#f4e5d2] shadow-[inset_0_4px_10px_rgba(138,76,0,0.06)] flex flex-col items-center justify-center text-center px-6">
          <span className="text-xs font-black tracking-[0.22em] text-[#765524] uppercase">Total Points</span>
          <motion.span
            key={totalCoins}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="font-headline text-6xl font-black text-primary leading-none mt-2"
          >
            {totalCoins}
          </motion.span>
          <div className="mt-4 flex items-center gap-2 text-tertiary font-black uppercase">
            <Trophy className="w-5 h-5 fill-current" />
            <span>Level {level}</span>
          </div>
          <p className="mt-3 text-xs font-extrabold text-[#8a4c00]">
            {pointsToNext} points to Level {level + 1}
          </p>
        </div>
      </div>
    </section>
  );
};

const getLevelProgress = (coins: number) => {
  let tempCoins = coins;
  let calcLevel = 1;
  let xpRequired = 100;

  while (tempCoins >= xpRequired) {
    tempCoins -= xpRequired;
    calcLevel++;
    xpRequired += 50;
  }

  return {
    level: calcLevel,
    currentXP: tempCoins,
    levelThreshold: xpRequired,
    progressPercent: Math.min(100, (tempCoins / xpRequired) * 100),
  };
};

export function Dashboard() {
  const { user, token } = useContext(AuthContext)!;
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as DashboardNavigationState | null;
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [isLevelUpOpen, setIsLevelUpOpen] = useState(false);
  const [motivationQuote, setMotivationQuote] = useState(MOTIVATION_QUOTES[0]);
  const [activeDelta, setActiveDelta] = useState<number | null>(null);
  const prevLevelRef = useRef<number | null>(null);
  const quoteIndexRef = useRef<number | null>(null);

  const totalCoins = Math.round(Math.max(0, user?.total_coins || 0));
  const [animatedCoins, setAnimatedCoins] = useState(() => {
    if (typeof routeState?.previousTotalCoins === 'number') {
      return Math.round(Math.max(0, routeState.previousTotalCoins));
    }
    return totalCoins;
  });

  const { level, currentXP, levelThreshold, progressPercent } = getLevelProgress(animatedCoins);

  useEffect(() => {
    const from = typeof routeState?.previousTotalCoins === 'number'
      ? Math.round(Math.max(0, routeState.previousTotalCoins))
      : animatedCoins;
    const to = totalCoins;
    const delta = typeof routeState?.pointsDelta === 'number' ? routeState.pointsDelta : to - from;

    if (from === to) {
      setAnimatedCoins(to);
      if (routeState?.animationKey) {
        navigate('/', { replace: true, state: null });
      }
      return;
    }

    setActiveDelta(delta);
    const startedAt = performance.now();
    const duration = 1200;
    let frameId = 0;

    const animate = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setAnimatedCoins(Math.round(from + (to - from) * eased));

      if (elapsed < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        setAnimatedCoins(to);
        window.setTimeout(() => setActiveDelta(null), 700);
        if (routeState?.animationKey) {
          navigate('/', { replace: true, state: null });
        }
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, [routeState?.animationKey, totalCoins]);

  useEffect(() => {
    fetch('/api/activities/recent', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setRecentActivities(data));
  }, [token, totalCoins]);

  useEffect(() => {
    if (prevLevelRef.current !== null && level > prevLevelRef.current) {
      const nextQuote = getRandomMotivationQuote(quoteIndexRef.current);
      quoteIndexRef.current = nextQuote.index;
      setMotivationQuote(nextQuote.quote);
      setIsLevelUpOpen(true);
      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#f58200', '#e07600', '#ec4899', '#4555a8']
      });
    }
    prevLevelRef.current = level;
  }, [level]);

  return (
    <div className="space-y-8 pt-4 pb-12">
      <LevelMeter
        totalCoins={animatedCoins}
        level={level}
        currentXP={currentXP}
        levelThreshold={levelThreshold}
        progressPercent={progressPercent}
        activeDelta={activeDelta}
      />

      <div className="grid grid-cols-2 gap-4 pt-2">
        <Link
          to="/earn"
          className="h-[72px] bg-[#f58200] text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-[0_6px_0_#c26600] active:shadow-none active:translate-y-[6px] transition-all hover:bg-[#e07600]"
        >
          <div className="bg-black/20 rounded-full p-1">
            <PlusCircle className="w-5 h-5" />
          </div>
          <span className="font-headline text-xl">Missions</span>
        </Link>
        <Link
          to="/spend"
          className="h-[72px] bg-[#4555a8] text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-[0_6px_0_#2d3770] active:shadow-none active:translate-y-[6px] transition-all hover:bg-[#3b488f]"
        >
          <div className="bg-white/20 rounded-full p-1">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <span className="font-headline text-xl">Spend</span>
        </Link>
      </div>

      {/* Activity Log */}
      <section className="space-y-4 pt-2">
        <div className="flex items-end px-2">
          <h2 className="text-2xl font-black text-[#4a3f35] font-headline">Activity Log</h2>
        </div>
        <div className="bg-[#f9f4e8] rounded-2xl overflow-hidden p-1 shadow-sm border border-[#e8dfce]">
          <div className="bg-white rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#fcdcb5]/30 text-[#8a4c00] text-[11px] uppercase tracking-wider font-extrabold">
                  <th className="px-4 py-4">Date</th>
                  <th className="px-4 py-4">Activity</th>
                  <th className="px-4 py-4 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#fcdcb5]/30">
                {recentActivities.map((activity) => (
                  <tr key={activity._id} className="hover:bg-[#fcdcb5]/10 transition-colors">
                    <td className="px-4 py-4 text-xs font-bold text-[#6b5e4a]">
                      {new Date(activity.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-extrabold text-[#4a3f35]">{activity.activityName}</span>
                        <span className="text-[10px] text-[#8a4c00] font-bold">
                          {activity.type === 'earn' ? 'Habit Completed' : 'Reward Spent'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={cn(
                        'text-sm font-black',
                        activity.pointsImpact > 0 ? 'text-[#c2185b]' : 'text-[#4555a8]'
                      )}>
                        {activity.pointsImpact > 0 ? `+${Math.round(activity.pointsImpact)}` : Math.round(activity.pointsImpact)}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentActivities.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-[#8a4c00] font-bold text-sm">
                      No activities yet. Start earning!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Level Up Modal */}
      <AnimatePresence>
        {isLevelUpOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setIsLevelUpOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 100 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.5, opacity: 0, y: 100 }}
              className="relative bg-white rounded-[3rem] p-8 text-center shadow-2xl border-4 border-[#f58200] max-w-sm w-full"
            >
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-32 h-32 bg-[#f58200] rounded-full flex items-center justify-center shadow-lg border-4 border-white">
                <Trophy className="w-16 h-16 text-white fill-current" />
              </div>
              <div className="mt-12 space-y-4">
                <h2 className="text-3xl font-black text-[#c2185b] font-headline uppercase">Level Up!</h2>
                <p className="text-lg font-bold text-[#6b5e4a]">You reached Level {level}.</p>
                <div className="bg-[#fcdcb5]/30 p-6 rounded-2xl border-2 border-dashed border-[#f58200]/50">
                  <p className="text-xs font-black text-[#f58200] uppercase mb-2">Power Thought</p>
                  <p className="text-xl font-black text-[#8a4c00]">{motivationQuote}</p>
                </div>
                <button
                  onClick={() => setIsLevelUpOpen(false)}
                  className="w-full h-14 bg-[#f58200] text-white font-bold rounded-2xl shadow-[0_6px_0_#c26600] active:shadow-none active:translate-y-[6px] transition-all text-lg"
                >
                  Keep Going!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
