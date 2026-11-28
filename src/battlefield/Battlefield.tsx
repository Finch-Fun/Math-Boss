// The animated battlefield: boss on the LEFT, open field in the middle, castle and student army on the RIGHT.
//
// PURELY VISUAL. It reads a BattleView (built from the server-settled campaign or the local demo state) and draws it. It has no
// access to Firebase and sends nothing anywhere: swings, arrows, spells and boss strikes are decoration that loops on a schedule,
// while the real boss HP, castle HP and damage come from the server's numbers shown in the health bars.
//
// Performance: every animation is a CSS transform loop inside one SVG (no canvas, no animation library, no per-frame React state).
// The scene is memoised and only re-renders when the army, state or boss changes, not on each clock tick. Animations pause while the
// tab is hidden and are switched off by prefers-reduced-motion (the status text and health bars carry the same information).
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { fmtDps, fmtNum } from '../game/format';
import { HealthBar } from '../ui/game/kit';
import { bossArtFor } from './art/boss';
import { Arrow, CHARACTER_ART, MUZZLE, Orb, TAG_Y, INK } from './art/characters';
import { Backdrop, Castle } from './art/scenery';
import { BOSS_BOX, VIEW, buildArmy, maxSpritesForWidth, type Army, type Sprite } from './layout';
import { battleMode, bossStrikes, canAttack, castleLook, nextBossVisual, statusText, type BattleMode, type BossVisual, type CastleLook } from './mode';
import type { BattleView } from './view';

const vars = (o: Record<string, string | number>) => o as CSSProperties;
/** Where ranged attacks are aimed: the boss's chest. */
const TARGET = { x: BOSS_BOX.right - 18, y: BOSS_BOX.footY - 118 };
const FLAGS = ['#d6453d', '#2f7fe0', '#2f9e44', '#c14bb3', '#e0902b'];

const SpriteView = memo(function SpriteView({ s, attacking }: { s: Sprite; attacking: boolean }) {
  const Art = CHARACTER_ART[s.cls];
  const m = MUZZLE[s.cls];
  const ranged = s.cls !== 'warrior';
  const dx = TARGET.x - (s.x + m.x);
  const dy = TARGET.y - (s.y + m.y);
  return (
    <g
      transform={`translate(${s.x} ${s.y})`}
      className={`sprite ${s.cls}${attacking ? ' attacking' : ''}${s.active ? '' : ' waiting'}${s.isYou ? ' you' : ''}`}
      style={vars({ '--bob': `${s.t.bob}s`, '--bob-d': `${s.t.bobDelay}s`, '--atk': `${s.t.atk}s`, '--atk-d': `${s.t.atkDelay}s`, '--sway': `${s.t.sway}s` })}
    >
      <ellipse cx={0} cy={1} rx={15} ry={4.5} fill="rgba(29,36,51,.28)" />
      {s.isYou && <ellipse cx={0} cy={2} rx={21} ry={6.5} fill="none" stroke="#ffd43b" strokeWidth={3.4} />}
      <g className="sway"><Art variant={s.variant} /></g>
      {attacking && ranged && (
        <g transform={`translate(${m.x} ${m.y})`}>
          <g className={`proj ${s.cls === 'ranger' ? 'arrow' : 'orb'}`} style={vars({ '--dx': `${dx}px`, '--dy': `${dy}px` })}>{s.cls === 'ranger' ? <Arrow /> : <Orb />}</g>
        </g>
      )}
      {s.isYou && (
        <g className="you-tag" transform={`translate(0 ${TAG_Y[s.cls]})`}>
          <rect x={-15} y={-9} width={30} height={15} rx={7.5} fill="#ffd43b" stroke={INK} strokeWidth={2} />
          <text x={0} y={2.5} textAnchor="middle" fontSize={10} fontWeight={800} fill={INK} fontFamily="system-ui, sans-serif">YOU</text>
        </g>
      )}
    </g>
  );
});

interface SceneProps {
  army: Army;
  mode: BattleMode;
  bossNumber: number | null;
  bossVisual: BossVisual;
  strikes: boolean;
  look: CastleLook;
  flag: string;
}

/** The whole picture. Memoised: it does not re-render when only the clock or an HP number changed. */
const Scene = memo(function Scene({ army, mode, bossNumber, bossVisual, strikes, look, flag }: SceneProps) {
  const BossArt = bossArtFor(bossNumber ?? 1);
  const anyAttackers = army.sprites.some((s) => canAttack(mode, s.active));
  return (
    <svg className="bf-svg" viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
      <Backdrop />
      {bossNumber !== null && bossVisual !== 'defeated' && (
        <g transform={`translate(${BOSS_BOX.x} ${BOSS_BOX.footY})`}>
          <ellipse cx={0} cy={2} rx={92} ry={11} fill="rgba(29,36,51,.28)" />
          <g className={`boss${strikes ? ' strikes' : ''}${bossVisual === 'defeating' ? ' defeating' : ''}`}>
            <g className="boss-lunge"><g className="boss-breath"><BossArt number={bossNumber} /></g></g>
          </g>
        </g>
      )}
      <Castle look={look} flag={flag} />
      {strikes && (
        <g className="boss-slash" transform="translate(780 262)" stroke={INK} strokeWidth={3} strokeLinecap="round">
          <path d="M-14 -22 L10 22 M0 -26 L22 16 M-26 -10 L-2 26" fill="none" stroke="#ffd43b" strokeWidth={5} />
        </g>
      )}
      {army.sprites.map((s) => <SpriteView key={s.id} s={s} attacking={canAttack(mode, s.active)} />)}
      {anyAttackers && bossVisual === 'alive' && [0, 1, 2].map((i) => (
        <g key={i} className={`impact i${i}`} transform={`translate(${TARGET.x + (i === 1 ? -8 : 4)} ${TARGET.y + (i - 1) * 42})`}>
          <path d="M0 -11 V11 M-11 0 H11 M-8 -8 L8 8 M8 -8 L-8 8" stroke="#ffe066" strokeWidth={3.2} strokeLinecap="round" fill="none" />
        </g>
      ))}
    </svg>
  );
});

function useBossVisual(alive: boolean | null): { visual: BossVisual; celebrate: boolean } {
  const [visual, setVisual] = useState<BossVisual>(() => nextBossVisual(null, alive));
  const [celebrate, setCelebrate] = useState(false);
  const prev = useRef<BossVisual>(visual);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const next = nextBossVisual(prev.current, alive);
    if (next === prev.current) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    prev.current = next;
    setVisual(next);
    if (next === 'defeating') {
      setCelebrate(true);
      timers.current.push(setTimeout(() => { prev.current = 'defeated'; setVisual('defeated'); }, 1800));
      timers.current.push(setTimeout(() => setCelebrate(false), 9000));
    } else setCelebrate(false);
  }, [alive]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return { visual, celebrate };
}

/** Sprite budget from the on-screen width. Changes state only when crossing a size tier, never per frame. */
function useSpriteBudget(ref: RefObject<HTMLElement | null>): number {
  const initial = () => maxSpritesForWidth(typeof window === 'undefined' ? 1000 : Math.min(window.innerWidth, 1100));
  const [max, setMax] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setMax((cur) => { const n = maxSpritesForWidth(e.contentRect.width); return n === cur ? cur : n; }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return max;
}

/** Pause every animation while the tab is hidden (set on the element directly: no React state). */
function usePauseWhenHidden(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const apply = () => ref.current?.setAttribute('data-paused', document.hidden ? 'true' : 'false');
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, [ref]);
}

export default function Battlefield({ view }: { view: BattleView }) {
  const rootRef = useRef<HTMLElement | null>(null);
  const max = useSpriteBudget(rootRef);
  usePauseWhenHidden(rootRef);

  const bossAlive = view.bossNumber === null ? null : view.bossHp > 0;
  const { visual, celebrate } = useBossVisual(bossAlive);
  const mode = battleMode({ phase: view.phase, bossAlive: bossAlive === true, activeCount: view.activeCount });
  const army = useMemo(() => buildArmy(view.members, view.self?.uid ?? null, max), [view.armyKey, view.self?.uid, max]); // eslint-disable-line react-hooks/exhaustive-deps
  const castlePct = view.castleMaxHp > 0 ? view.castleHp / view.castleMaxHp : 1;
  const look = castleLook(mode, castlePct);
  const strikes = bossStrikes(mode, view.nextAttackAt);
  const flag = FLAGS[((view.bossNumber ?? 1) - 1) % FLAGS.length];
  const status = statusText({ mode, now: view.now, nextAttackAt: view.nextAttackAt, trainingEndsAt: view.trainingEndsAt, weekEnd: view.weekEnd, castlePct, bossNumber: view.bossNumber });
  const total = army.totalActive + army.totalInactive;
  const shown = army.sprites.length;
  const bossPct = view.bossMaxHp > 0 ? Math.round((Math.max(0, view.bossHp) / view.bossMaxHp) * 100) : 0;
  const label = `Battlefield. Boss${view.bossNumber ? ` ${view.bossNumber}` : ''} on the left at ${bossPct}% health. Castle on the right at ${Math.round(castlePct * 100)}% health. ${army.totalActive} of ${total} students are fighting. ${status.title}`;

  return (
    <section className="bf" ref={rootRef} data-mode={mode} data-boss={visual} data-castle={look} aria-label="Battlefield">
      <div className="bf-stage" role="img" aria-label={label}>
        <Scene army={army} mode={mode} bossNumber={view.bossNumber} bossVisual={visual} strikes={strikes} look={look} flag={flag} />
      </div>
      <div className="bf-hud">
        <div className="bf-plate bf-plate-boss">
          <div className="bf-plate-title"><span className="bf-num">{view.bossNumber ? `Boss ${view.bossNumber}` : 'Next boss'}</span><span className="bf-name">{view.bossNumber ? view.bossName : 'on its way'}</span></div>
          {view.bossNumber !== null && <HealthBar kind="boss" value={view.bossHp} max={view.bossMaxHp} label={`${fmtNum(Math.max(0, view.bossHp))} / ${fmtNum(view.bossMaxHp)} HP`} />}
        </div>
        <div className="bf-plate bf-plate-castle">
          <div className="bf-plate-title"><span className="bf-num">Classroom Castle</span></div>
          <HealthBar kind="castle" value={view.castleHp} max={view.castleMaxHp} label={`${fmtNum(view.castleHp)} / ${fmtNum(view.castleMaxHp)} HP`} />
        </div>
      </div>
      <div className={`bf-banner tone-${celebrate ? 'victory' : status.tone}`}>
        <strong role="status">{celebrate ? `Victory! Boss ${view.bossNumber ?? ''} defeated!` : status.title}</strong>
        <span>{celebrate ? 'The class trains for 24 hours before the next boss.' : status.detail}</span>
      </div>
      <div className="bf-army" title="Each fighter stands for a classmate. Only your own character is you.">
        <b>{army.totalActive}</b> fighting · <b>{army.totalInactive}</b> waiting · class DPS <b>{fmtDps(view.classDps)}</b>
        {shown < total && <span className="bf-more"> · showing {shown} of {total}</span>}
      </div>
    </section>
  );
}
