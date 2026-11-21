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

// Boss & castle (§12-§15)
export const REFERENCE_CLASS_SIZE = 25;
export const CASTLE_HP_PER_STUDENT = 400;
export const BOSS_ATTACK_PER_HOUR_REF = 110;
export const BOSS_ATTACK_INTERVAL = HOUR;
export const BOSS_TARGET_COMBAT_SECONDS = 30 * 3600;
export const BOSS_DIFFICULTY_MOD: Record<BossDifficulty, number> = { easy: 0.75, normal: 1, hard: 1.3 };
export const BOSS_HP_GROWTH = 1.5;
export const BOSS_ATTACK_GROWTH = 1.2;
export const TRAINING_DURATION = 24 * HOUR;
export const NO_SPAWN_WINDOW = 2 * HOUR;
export const BREACH_RECOVERY_FRACTION = 0.25;
// Placeholder emergency repair rates (design leaves these to balance testing)
export const AUTO_RECONSTRUCTION_PER_HOUR = 0.005; // of max HP
export const QUESTION_REPAIR_FRACTION = 0.001; // of max HP per correct Daily Review answer during a breach

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
export const PROJECT_REPEAT_GROWTH: [number, number] = [3, 2]; // x1.5 per repeat purchase
