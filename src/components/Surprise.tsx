import React, { useContext, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { Gift, Sparkles, Star } from 'lucide-react';
import { AuthContext } from '../App.tsx';
import { cn } from '../lib/utils.ts';

const DEFAULT_SURPRISE_GOAL = 500;
const DEFAULT_SURPRISE_REWARD = 'Mystery Surprise';

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Server returned an unexpected response. Please restart the app server and try again.' };
  }
}

const pathNodes = [
  { label: 'Start', ratio: 0, x: 14, y: 76 },
  { label: 'Step 1', ratio: 0.2, x: 29, y: 51 },
  { label: 'Step 2', ratio: 0.4, x: 48, y: 66 },
  { label: 'Step 3', ratio: 0.6, x: 63, y: 40 },
  { label: 'Almost', ratio: 0.8, x: 80, y: 55 },
  { label: 'Open', ratio: 1, x: 87, y: 20 },
];

function getMarkerPosition(progressRatio: number) {
  if (progressRatio >= 1) return pathNodes[pathNodes.length - 1];

  const scaled = progressRatio * (pathNodes.length - 1);
  const currentIndex = Math.floor(scaled);
  const nextIndex = Math.min(currentIndex + 1, pathNodes.length - 1);
  const segmentProgress = scaled - currentIndex;
  const current = pathNodes[currentIndex];
  const next = pathNodes[nextIndex];

  return {
    x: current.x + (next.x - current.x) * segmentProgress,
    y: current.y + (next.y - current.y) * segmentProgress,
  };
}

export function Surprise() {
  const { user, token, updateUser } = useContext(AuthContext)!;
  const [isRewardOpen, setIsRewardOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [revealedRewardName, setRevealedRewardName] = useState('');
  const totalCoins = Math.round(Math.max(0, user?.total_coins || 0));
  const cycleStart = Math.round(Math.max(0, user?.surprise_cycle_start_points || 0));
  const goalPoints = Math.max(1, Math.round(user?.surprise_goal_points || DEFAULT_SURPRISE_GOAL));
  const rewardName = user?.surprise_reward_name?.trim() || DEFAULT_SURPRISE_REWARD;
  const legacyCyclePoints = Math.max(0, totalCoins - cycleStart);
  const cyclePoints = Math.round(Math.max(0, user?.surprise_cycle_points ?? legacyCyclePoints));
  const progressRatio = Math.min(1, cyclePoints / goalPoints);
  const pointsLeft = Math.max(goalPoints - cyclePoints, 0);
  const isUnlocked = pointsLeft === 0;
  const marker = getMarkerPosition(progressRatio);
  const pathPoints = pathNodes.map((node) => `${node.x},${node.y}`).join(' ');

  const openGift = async () => {
    if (!isUnlocked) return;
    setClaiming(true);
    setClaimError('');

    try {
      const res = await fetch('/api/profile/claim-surprise', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readJsonResponse(res);

      if (!res.ok || data.error || !data.user) {
        setClaimError(data.error || 'Could not reset the surprise quest.');
        return;
      }

      setRevealedRewardName(data.rewardName || rewardName);
      updateUser(data.user);
      setIsRewardOpen(true);
      confetti({
        particleCount: 140,
        spread: 80,
        origin: { y: 0.45 },
        colors: ['#fd9000', '#a7295a', '#4555a8', '#ffd166']
      });
    } catch (err) {
      console.error(err);
      setClaimError('Could not open the surprise. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="relative -mx-2 min-h-[calc(100vh-12rem)] overflow-hidden pt-5 pb-8">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex min-h-[calc(100vh-14rem)] flex-col items-center text-center"
      >
        <div className={cn(
          'relative z-40 w-full px-4 py-4 rounded-2xl border shadow-sm',
          isUnlocked
            ? 'bg-white border-primary-container/40 shadow-[0_10px_28px_rgba(253,144,0,0.16)]'
            : 'bg-transparent border-transparent shadow-none'
        )}>
          <p className="font-label text-xs font-black uppercase tracking-[0.22em] text-tertiary">
            Surprise Quest
          </p>
          <h1 className={cn(
            'mx-auto mt-2 max-w-[20rem] font-headline font-black tracking-normal text-primary',
            isUnlocked ? 'text-3xl' : 'text-2xl leading-tight'
          )}>
            {isUnlocked ? 'Gift Ready!' : `Earn ${pointsLeft} more points to open the gift.`}
          </h1>
          {isUnlocked && (
            <p className="mx-auto mt-2 max-w-[18rem] text-sm font-black text-on-surface-variant">
              Tap the glowing gift to see your surprise.
            </p>
          )}
          {claimError && !isRewardOpen && (
            <p className="mx-auto mt-3 max-w-[18rem] rounded-xl bg-error/10 px-3 py-2 text-xs font-bold text-error">
              {claimError}
            </p>
          )}
        </div>

        <div className="relative mt-7 w-full max-w-[360px] overflow-visible rounded-[2rem] bg-[#fff9f2] px-3 pt-3 pb-0 shadow-[0_14px_36px_rgba(138,76,0,0.12)] border border-[#f1dfc8]">
          <div className="relative mx-auto h-[420px] w-full">
            <svg className="absolute inset-x-0 top-0 z-10 h-[280px] w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                points={pathPoints}
                fill="none"
                stroke="#f6d5ad"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <motion.polyline
                points={pathPoints}
                fill="none"
                stroke="#fd9000"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: progressRatio }}
                transition={{ type: 'spring', bounce: 0.18, duration: 1.2 }}
              />
            </svg>

            <div className="absolute inset-x-0 top-0 z-20 h-[280px]">
              {pathNodes.map((node, index) => {
                const reached = progressRatio >= node.ratio;
                const threshold = Math.round(goalPoints * node.ratio);
                const isFinal = index === pathNodes.length - 1;
                const nodeContent = isFinal ? (
                  <Gift className={cn('h-7 w-7', reached && 'fill-current')} />
                ) : (
                  <Star className={cn('h-6 w-6', reached && 'fill-current')} />
                );

                return (
                  <motion.div
                    key={node.label}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.08 }}
                  >
                    {isFinal ? (
                      <div className="relative">
                        {isUnlocked && (
                          <>
                            <motion.div
                              aria-hidden="true"
                              className="absolute -inset-3 rounded-full border-4 border-primary-container/40"
                              animate={{ scale: [0.9, 1.35], opacity: [0.75, 0] }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'easeOut' }}
                            />
                            <motion.div
                              className="absolute -top-10 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-tertiary px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow-lg"
                              animate={{ y: [0, -4, 0] }}
                              transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                            >
                              Tap gift
                            </motion.div>
                          </>
                        )}
                        <button
                          type="button"
                          aria-label={claiming ? 'Opening surprise' : 'Open surprise'}
                          onClick={openGift}
                          disabled={!isUnlocked || claiming}
                          className={cn(
                            'relative z-50 flex h-16 w-16 items-center justify-center rounded-full border-4 shadow-md transition-transform',
                            reached
                              ? 'border-white bg-primary-container text-white shadow-[0_0_28px_rgba(253,144,0,0.55)] active:scale-95'
                              : 'border-[#f4e6d4] bg-white text-[#c7a985]'
                          )}
                        >
                          {nodeContent}
                        </button>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'flex h-14 w-14 items-center justify-center rounded-full border-4 shadow-md',
                          reached
                            ? 'border-white bg-primary-container text-white'
                            : 'border-[#f4e6d4] bg-white text-[#c7a985]'
                        )}
                      >
                        {nodeContent}
                      </div>
                    )}
                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black text-primary shadow-sm">
                      {index === 0 ? 'Start' : threshold}
                    </span>
                  </motion.div>
                );
              })}

              {!isUnlocked && (
                <motion.div
                  className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                  animate={{ y: [-4, 4, -4], rotate: [-5, 5, -5] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary text-white shadow-[0_8px_18px_rgba(167,41,90,0.32)] border-4 border-white">
                    <Sparkles className="h-6 w-6 fill-current" />
                  </div>
                </motion.div>
              )}
            </div>

            <div className="absolute inset-x-0 bottom-0 flex h-[205px] items-end justify-center">
              <motion.div
                aria-hidden="true"
                className={cn(
                  'absolute bottom-8 h-24 w-56 rounded-full blur-2xl',
                  isUnlocked ? 'bg-[#fd9000]/45' : 'bg-[#ffddb3]/70'
                )}
                animate={{ opacity: [0.55, 0.9, 0.55] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.img
                src="/quest.png"
                alt="Treasure chest"
                className="relative z-10 h-[205px] w-auto max-w-[96%] object-contain object-bottom drop-shadow-xl"
                animate={isUnlocked ? { scale: [1, 1.04, 1] } : { y: [0, -4, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </div>
        </div>
      </motion.section>

      <AnimatePresence>
        {isRewardOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.65, opacity: 0, y: 60 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.65, opacity: 0, y: 60 }}
              className="relative w-full max-w-sm rounded-[2rem] bg-white p-7 text-center shadow-2xl border-4 border-primary-container"
            >
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary-container text-white shadow-lg">
                <Gift className="h-12 w-12 fill-current" />
              </div>
              <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-tertiary">Your Surprise Is</p>
              <div className="mt-3 rounded-2xl bg-[#fff5ec] px-4 py-5 border-2 border-dashed border-primary-container/50">
                <h2 className="font-headline text-4xl font-black text-primary">{revealedRewardName || rewardName}</h2>
              </div>
              <p className="mt-4 text-sm font-bold text-on-surface-variant">
                Show this to your parent to get your surprise.
              </p>

              {claimError && (
                <p className="mt-4 rounded-xl bg-error/10 px-3 py-2 text-xs font-bold text-error">
                  {claimError}
                </p>
              )}

              <button
                type="button"
                onClick={() => setIsRewardOpen(false)}
                className="mt-6 h-14 w-full rounded-2xl bg-primary-container font-headline text-lg font-black text-white shadow-[0_6px_0_#c26600] transition-all active:translate-y-[6px] active:shadow-none disabled:opacity-60"
              >
                Done
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
