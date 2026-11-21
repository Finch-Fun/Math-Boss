// Provisional balancing values from docs/GAME_DESIGN.md (v1.3). All are placeholders until balance testing.
import type { BossDifficulty, DifficultyPreset, ProjectKey, QuestionDifficulty, UpgradeKey } from './types';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const STATE_VERSION = 1;

// Rewards (§4, §5)
export const DAILY_REWARDS = { first: 10, second: 5, later: 2 } as const;
export const BONUS_REWARD = 20;
export const BONUS_PER_WEEK = 3;
export const MAX_DAILY_QUESTIONS = 20;

// Difficulty mixes (§3.4)
export const DIFFICULTY_PRESETS: Record<DifficultyPreset, Record<QuestionDifficulty, number>> = {
  foundations: { easy: 0.7, medium: 0.25, hard: 0.05 },
  balanced: { easy: 0.4, medium: 0.4, hard: 0.2 },
  challenge: { easy: 0.2, medium: 0.4, hard: 0.4 },
};

// Upgrades (§8). Growth is stored as an exact fraction so costs never suffer float rounding.
export interface UpgradeDef {
  label: string;
  baseCost: number;
  growth: [number, number];
  maxLevel: number | null;
  blurb: string;
}
export const UPGRADE_KEYS: UpgradeKey[] = ['damage', 'speed', 'critChance', 'critDamage'];
export const UPGRADE_DEFS: Record<UpgradeKey, UpgradeDef> = {
  damage: { label: 'Attack Damage', baseCost: 10, growth: [23, 20], maxLevel: null, blurb: '+1 damage per hit' },
  speed: { label: 'Attack Speed', baseCost: 25, growth: [59, 50], maxLevel: null, blurb: '+0.05 attacks per second' },
  critChance: { label: 'Critical Chance', baseCost: 40, growth: [6, 5], maxLevel: 35, blurb: '+1% crit chance (max 40%)' },
  critDamage: { label: 'Critical Damage', baseCost: 50, growth: [59, 50], maxLevel: 15, blurb: '+0.10x crit multiplier (max 3.0x)' },
};

// Boss & castle (§12-§15). Confirmed rules and fixed structure:
export const REFERENCE_CLASS_SIZE = 25;
export const BOSS_ATTACK_INTERVAL = HOUR;
export const BOSS_DIFFICULTY_MOD: Record<BossDifficulty, number> = { easy: 0.75, normal: 1, hard: 1.3 };
export const TRAINING_DURATION = 24 * HOUR; // confirmed

/**
 * Provisional combat-balance values (design §12-§16, §22). The defaults equal the numbers in docs/GAME_DESIGN.md.
 * The game only ever reads TUNING; the balance simulator (src/sim) overrides it to test alternatives, then restores it.
 * Changing a default here is a game-design decision and needs owner approval.
 */
export interface Tuning {
  castleHpPerStudent: number; // castle max HP = this x expected participating students
  bossAttackPerHourRef: number; // Boss 1 damage per hour for a 25-student class (scaled linearly by class size)
  bossAttackGrowth: number; // attack multiplier per boss stage
  bossHpGrowth: number; // HP multiplier per boss stage
  bossTargetHours: number; // Boss 1 target active combat hours at Normal difficulty
  noSpawnWindowHours: number; // a new boss never spawns when this many hours or fewer remain in the campaign (§11.2: 2; §13.2 also says "sufficient campaign time")
  breachRecoveryFraction: number; // castle must recover to this share of max HP before combat resumes
  autoReconstructionPerHour: number; // share of max HP rebuilt per hour during a breach
  questionRepairFraction: number; // share of max HP per correct Daily Review answer during a breach
  wallsPerLevel: number; // Reinforce Walls: +share of castle max HP per level
  armorPerLevel: number; // Iron Plating: armor share per level (capped at 50% elsewhere)
  repairsFraction: number; // Castle Repairs: share of max HP restored per completion
  projectRepeatGrowth: [number, number]; // price multiplier per repeat purchase, as an exact fraction
}

export const DEFAULT_TUNING: Readonly<Tuning> = Object.freeze({
  castleHpPerStudent: 400,
  bossAttackPerHourRef: 110,
  bossAttackGrowth: 1.2,
  bossHpGrowth: 1.5,
  bossTargetHours: 30,
  noSpawnWindowHours: 2,
  breachRecoveryFraction: 0.25,
  autoReconstructionPerHour: 0.005, // placeholder: the design leaves emergency repair rates to balance testing
  questionRepairFraction: 0.001, // placeholder, as above
  wallsPerLevel: 0.1,
  armorPerLevel: 0.05,
  repairsFraction: 0.2,
  projectRepeatGrowth: [3, 2] as [number, number],
});

export const TUNING: Tuning = { ...DEFAULT_TUNING };
export const setTuning = (patch: Partial<Tuning>): void => void Object.assign(TUNING, patch);
export const resetTuning = (): void => void Object.assign(TUNING, DEFAULT_TUNING);

// Boss calibration helpers (§12.2)
export const EXPECTED_COINS_PER_QUESTION = 0.7 * 10 + 0.2 * 5 + 0.1 * 2;
export const PERSONAL_SPEND_SHARE = 0.7; // design suggests 25-30% goes to shared projects
export const DEFAULT_EXPECTED_PARTICIPATION = 0.85;

export const BOSS_NAMES = [
  'Goblin Grunt',
  'Stone Troll',
  'Ember Drake',
  'Frost Giant',
  'Shadow Wraith',
  'Crystal Golem',
  'Storm Titan',
];

// Shared projects (§16)
export interface ProjectDef {
  label: string;
  baseCost: number; // for a 25-student class
  maxLevel: number | null;
  blurb: string;
}
export const PROJECT_KEYS: ProjectKey[] = ['walls', 'plating', 'banner', 'repairs'];
export const PROJECT_DEFS: Record<ProjectKey, ProjectDef> = {
  walls: { label: 'Reinforce Walls', baseCost: 400, maxLevel: 5, blurb: '+10% castle max HP' },
  plating: { label: 'Iron Plating', baseCost: 450, maxLevel: 10, blurb: '+5 points of armor (max 50%)' },
  banner: { label: 'Battle Banner', baseCost: 500, maxLevel: 5, blurb: '+5% class DPS (max +25%)' },
  repairs: { label: 'Castle Repairs', baseCost: 250, maxLevel: null, blurb: 'Restore 20% of max castle HP' },
};
