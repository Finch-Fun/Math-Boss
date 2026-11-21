export type BossDifficulty = 'easy' | 'normal' | 'hard';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type DifficultyPreset = 'foundations' | 'balanced' | 'challenge';
export type SkillKey =
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'division'
  | 'fractions'
  | 'missing';
export type UpgradeKey = 'damage' | 'speed' | 'critChance' | 'critDamage';
export type ProjectKey = 'walls' | 'plating' | 'banner' | 'repairs';
export type Strategy = 'balanced' | 'damage' | 'crit' | 'saver' | 'donor' | 'minimal';
/** combat: boss fighting; training: 24h pause; breach: castle down; idle: no boss (end of week). */
export type Phase = 'combat' | 'training' | 'breach' | 'idle';

export type Upgrades = Record<UpgradeKey, number>;

export interface BotProfile {
  engagement: number; // chance of showing up on a school day
  accuracy: number; // chance of a first-attempt correct answer
  strategy: Strategy;
  sessionMinute: number; // minutes after local midnight
  donatePct: number; // share of each session's earnings donated
  lastSessionAt: number;
}

export interface QuestionRecord {
  week: number;
  skill: SkillKey;
  difficulty: QuestionDifficulty;
  firstAttempt: boolean;
  attempts: number;
  coins: number;
  at: number;
}

export interface BonusAnswer {
  choice: number;
  correct: boolean;
}

export interface Student {
  id: string;
  nickname: string;
  coins: number;
  lifetimeCoins: number;
  upgrades: Upgrades;
  // weekly (reset every Monday)
  activated: boolean;
  weekDamage: number;
  weekDonated: number;
  weekQuestions: number;
  weekFirstTry: number;
  // progress on the current daily question
  currentWrong: number;
  bonusAnswers: Record<string, BonusAnswer>;
  records: QuestionRecord[];
  bot: BotProfile;
}

export interface Boss {
  number: number;
  name: string;
  maxHp: number;
  hp: number;
  attackPerHour: number;
  spawnedAt: number;
}

export interface Battle {
  phase: Phase;
  boss: Boss | null;
  bossesDefeated: number;
  castleHp: number;
  baseCastleMaxHp: number;
  nextAttackAt: number | null; // null = dormant until first activation
  trainingEndsAt: number | null;
  weekIndex: number;
  weekStart: number;
  weekEnd: number;
}

export interface ProjectState {
  level: number; // times completed this week
  funded: number; // coins toward the next completion
}

export interface WeekStats {
  questions: number;
  donated: number;
  breaches: number;
  emergencyRepairHp: number;
}

export interface WeekSummary {
  weekIndex: number;
  weekStart: number;
  bossesDefeated: number;
  castlePct: number;
  activatedFraction: number;
  donated: number;
  questions: number;
  breaches: number;
}

export interface DaySnapshot {
  at: number;
  bossPct: number;
  bossNumber: number;
  castlePct: number;
  donated: number;
  questions: number;
}

export interface Settings {
  requireMathForUpgrades: boolean;
  dailyQuestions: number[]; // Monday..Sunday, 0-20 each
  difficultyPreset: DifficultyPreset;
  skills: SkillKey[];
  bossDifficulty: BossDifficulty;
  bonusEnabled: boolean;
}

export interface DevSettings {
  dpsMultiplier: number;
  botsEnabled: boolean;
}

export interface LogEntry {
  at: number;
  text: string;
}

export interface GameState {
  version: number;
  now: number; // game clock (ms since epoch); advanced by real time x time scale
  savedAtReal: number;
  playerId: string;
  className: string;
  students: Student[];
  settings: Settings;
  battle: Battle;
  projects: Record<ProjectKey, ProjectState>;
  stats: WeekStats;
  history: WeekSummary[];
  daySnapshot: DaySnapshot;
  dev: DevSettings;
  log: LogEntry[];
}

export type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: string; hint?: string };
