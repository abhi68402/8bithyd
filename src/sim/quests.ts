// Game-like map variety for Hyderabad Days:
//  1. 24 deterministic collectible Golden Chai Cups & Deccan Pearls across
//     Hyderabad's iconic neighbourhoods, persisted in localStorage.
//  2. 6 automatic City Explorer Mini-Quests tracked from real player actions.
//  3. Ambient Map Life (drawMapLife): drifting Deccan Hot-Air Balloon,
//     twinkling night fireflies over parks & lakes, and interactive Traffic
//     Honk / Cheer ripples + collection sparkles.
//
// Hot update() and draw() paths are strictly zero-allocation per frame.
import { mx, my, WORLD_W, WORLD_H } from '../world/geo';
import { PLACES } from '../world/places';

export type TreasureKind = 'chai' | 'pearl';
export type TreasureDistrict =
  | 'Old City'
  | 'Hussain Sagar'
  | 'Golconda'
  | 'HITEC City'
  | 'Secunderabad'
  | 'Uppal';

export type QuestId =
  | 'chai-run'
  | 'heritage'
  | 'metro-rider'
  | 'auto-ride'
  | 'monsoon'
  | 'night-owl';

export type RippleKind = 'horn' | 'cheer' | 'collect';

export interface PlaceInput {
  id: string;
  x: number;
  y: number;
  name?: string;
  area?: string;
}

export interface SimView {
  clock: number;
  hour: number;
  sunrise?: number;
  sunset?: number;
  night: number;
  rain: number;
  storm?: boolean;
  cloudCover?: number;
  congestion?: (cls: number) => number;
  veh?: {
    n: number;
    x: Float32Array;
    y: Float32Array;
    tile: readonly (unknown | null)[];
  };
}

export interface CamView {
  x: number;
  y: number;
  zoom: number;
  w: number;
  h: number;
  dpr?: number;
  flying?: boolean;
}

export interface Treasure {
  id: string;
  index: number;
  name: string;
  kind: TreasureKind;
  district: TreasureDistrict;
  placeId: string;
  /** City metres east. */
  x: number;
  /** City metres south. */
  y: number;
  /** World pixels east (= x). */
  wx: number;
  /** World pixels south (= y / 2). */
  wy: number;
  hint: string;
  collected: boolean;
}

export interface QuestInfo {
  id: QuestId;
  title: string;
  description: string;
  progress: number;
  target: number;
  unit: string;
  completed: boolean;
  rewardPts: number;
}

export interface DistrictProgress {
  district: TreasureDistrict;
  collected: number;
  total: number;
}

export interface CityGameSummary {
  treasuresCollected: number;
  treasuresTotal: number;
  chaiCollected: number;
  chaiTotal: number;
  pearlsCollected: number;
  pearlsTotal: number;
  questsCompleted: number;
  questsTotal: number;
  score: number;
  quests: QuestInfo[];
  districts: DistrictProgress[];
  nearestUncollected: {
    id: string;
    name: string;
    kind: TreasureKind;
    district: TreasureDistrict;
    wx: number;
    wy: number;
  } | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface CityGameOptions {
  storageKey?: string | null;
  storage?: StorageLike | null;
}

interface TreasureDef {
  id: string;
  name: string;
  kind: TreasureKind;
  district: TreasureDistrict;
  placeId: string;
  dx: number;
  dy: number;
  hint: string;
}

interface QuestDef {
  id: QuestId;
  title: string;
  description: string;
  target: number;
  unit: string;
  rewardPts: number;
}

const DEFAULT_STORE = 'hyderabad-days.quests.v1';
const TREASURE_PTS = 50;

export const DISTRICTS: readonly TreasureDistrict[] = [
  'Old City',
  'Hussain Sagar',
  'Golconda',
  'HITEC City',
  'Secunderabad',
  'Uppal',
];

export const TREASURE_DEFS: readonly TreasureDef[] = [
  // Old City (5)
  { id: 't-charminar-chai', name: 'Nimrah Irani Chai', kind: 'chai', district: 'Old City', placeId: 'charminar', dx: 22, dy: 20, hint: 'Steaming beside Charminar' },
  { id: 't-laad-pearl', name: 'Laad Bazaar Pearl', kind: 'pearl', district: 'Old City', placeId: 'laad-bazaar', dx: -20, dy: 18, hint: 'Glinting among the bangle stalls' },
  { id: 't-chowmahalla-pearl', name: "Nizam's Courtyard Pearl", kind: 'pearl', district: 'Old City', placeId: 'chowmahalla', dx: 34, dy: 28, hint: 'Beside Chowmahalla Palace' },
  { id: 't-salarjung-chai', name: 'Musi Bank Chai', kind: 'chai', district: 'Old City', placeId: 'salar-jung', dx: -28, dy: 26, hint: 'Near Salar Jung Museum' },
  { id: 't-falaknuma-pearl', name: 'Sky Palace Pearl', kind: 'pearl', district: 'Old City', placeId: 'falaknuma', dx: 36, dy: 22, hint: 'On the hilltop at Falaknuma' },

  // Hussain Sagar (5)
  { id: 't-buddha-pearl', name: 'Gibraltar Rock Pearl', kind: 'pearl', district: 'Hussain Sagar', placeId: 'buddha', dx: 38, dy: 28, hint: 'Out on Hussain Sagar island' },
  { id: 't-tankbund-chai', name: 'Tank Bund Evening Chai', kind: 'chai', district: 'Hussain Sagar', placeId: 'tank-bund', dx: -24, dy: 20, hint: 'Along the twin-city bund road' },
  { id: 't-necklace-pearl', name: 'Necklace Road Pearl', kind: 'pearl', district: 'Hussain Sagar', placeId: 'necklace-road', dx: 28, dy: 22, hint: 'Under the tricolour boulevard' },
  { id: 't-lumbini-chai', name: 'Lumbini Jetty Chai', kind: 'chai', district: 'Hussain Sagar', placeId: 'lumbini', dx: -22, dy: 24, hint: 'Near the Lumbini fountain & boats' },
  { id: 't-birla-pearl', name: 'Naubat Pahad Pearl', kind: 'pearl', district: 'Hussain Sagar', placeId: 'birla-mandir', dx: 30, dy: 18, hint: 'Glowing by Birla Mandir marble' },

  // Golconda & West Heritage (4)
  { id: 't-golconda-pearl', name: 'Golconda Diamond Pearl', kind: 'pearl', district: 'Golconda', placeId: 'golconda', dx: 42, dy: 34, hint: 'Near the granite citadel gate' },
  { id: 't-qutb-pearl', name: 'Seven Tombs Pearl', kind: 'pearl', district: 'Golconda', placeId: 'qutb-shahi', dx: -26, dy: 24, hint: 'In the Qutb Shahi gardens' },
  { id: 't-taramati-chai', name: 'Baradari Courtyard Chai', kind: 'chai', district: 'Golconda', placeId: 'taramati', dx: 24, dy: 22, hint: 'By Taramati acoustic pavilion' },
  { id: 't-kbr-chai', name: "Walkers' Loop Chai", kind: 'chai', district: 'Golconda', placeId: 'kbr-park', dx: -24, dy: 24, hint: 'Outside KBR Park forest gate' },

  // HITEC City (4)
  { id: 't-cyber-chai', name: 'HITEC Late-Shift Chai', kind: 'chai', district: 'HITEC City', placeId: 'cyber-towers', dx: 32, dy: 22, hint: 'Right by Cyber Towers roundabout' },
  { id: 't-cable-pearl', name: 'Durgam Cheruvu Pearl', kind: 'pearl', district: 'HITEC City', placeId: 'cable-bridge', dx: -30, dy: 20, hint: 'Overlooking the Secret Lake bridge' },
  { id: 't-shilpa-pearl', name: 'Shilparamam Craft Pearl', kind: 'pearl', district: 'HITEC City', placeId: 'shilparamam', dx: 26, dy: 24, hint: 'Inside the artisan crafts village' },
  { id: 't-findist-chai', name: 'Skyline Corner Chai', kind: 'chai', district: 'HITEC City', placeId: 'financial-district', dx: -28, dy: 26, hint: 'Among the glass towers' },

  // Secunderabad (3)
  { id: 't-clock-chai', name: 'Clock Tower Cutting Chai', kind: 'chai', district: 'Secunderabad', placeId: 'clock-tower', dx: 24, dy: 20, hint: 'Beside Secunderabad Clock Tower' },
  { id: 't-secjn-chai', name: 'Platform 1 Irani Chai', kind: 'chai', district: 'Secunderabad', placeId: 'sec-junction', dx: -32, dy: 24, hint: 'Outside Secunderabad Junction' },
  { id: 't-parade-pearl', name: 'Cantonment Kite Pearl', kind: 'pearl', district: 'Secunderabad', placeId: 'parade-ground', dx: 32, dy: 22, hint: 'Over Parade Ground maidan' },

  // Uppal & East (3)
  { id: 't-uppal-chai', name: 'Stadium Match Chai', kind: 'chai', district: 'Uppal', placeId: 'uppal', dx: 36, dy: 28, hint: 'Outside Uppal Cricket Stadium' },
  { id: 't-ou-chai', name: 'Campus Canteen Chai', kind: 'chai', district: 'Uppal', placeId: 'ou-arts', dx: -30, dy: 22, hint: 'By OU Arts College lawns' },
  { id: 't-ramoji-pearl', name: 'Film City Star Pearl', kind: 'pearl', district: 'Uppal', placeId: 'ramoji', dx: 34, dy: 26, hint: 'By the Ramoji palace sets' },
];

export const QUEST_DEFS: readonly QuestDef[] = [
  { id: 'chai-run', title: 'Irani Chai Run', description: 'Collect 3 Golden Chai cups around the city.', target: 3, unit: 'cups', rewardPts: 150 },
  { id: 'heritage', title: 'Heritage Explorer', description: 'Collect 5 Passport stamps at Hyderabad landmarks.', target: 5, unit: 'stamps', rewardPts: 200 },
  { id: 'metro-rider', title: 'Metro Commuter', description: 'Hop on and ride a Hyderabad Metro train for 300 m.', target: 300, unit: 'm', rewardPts: 200 },
  { id: 'auto-ride', title: 'Auto Ride', description: 'Hop on an Auto-rickshaw or Delivery rider.', target: 1, unit: 'ride', rewardPts: 150 },
  { id: 'monsoon', title: 'Monsoon Watcher', description: 'Experience Monsoon Rain or a Storm on the map.', target: 1, unit: 'storm', rewardPts: 150 },
  { id: 'night-owl', title: 'Night Owl', description: 'Explore the glowing city after sunset.', target: 1, unit: 'night', rewardPts: 150 },
];

const FIREFLY_SPOTS: readonly { id: string; lat: number; lon: number; count: number; spreadX: number; spreadY: number }[] = [
  { id: 'kbr-park', lat: 17.4222, lon: 78.4205, count: 14, spreadX: 160, spreadY: 130 },
  { id: 'public-gardens', lat: 17.3985, lon: 78.4675, count: 10, spreadX: 120, spreadY: 95 },
  { id: 'lumbini', lat: 17.4101, lon: 78.4733, count: 9, spreadX: 130, spreadY: 85 },
  { id: 'necklace-road', lat: 17.4262, lon: 78.4672, count: 9, spreadX: 170, spreadY: 90 },
  { id: 'qutb-shahi', lat: 17.395, lon: 78.3968, count: 8, spreadX: 130, spreadY: 100 },
];

const MAX_RIPPLES = 16;
const MAX_SPARKS = 48;
const RIPPLE_HORN = 0;
const RIPPLE_CHEER = 1;
const RIPPLE_COLLECT = 2;

const SPARK_COLORS = ['#ffd84c', '#fff7e0', '#2dd4bf', '#f0a030', '#ff6b5a'] as const;

function hash01(n: number, salt: number): number {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** Resolve a human-friendly follow kind from a Sim pick + vehicle table. */
export function resolveFollowingKind(
  pick: { type: string; i: number } | null | undefined,
  sim: { veh?: { look: Uint8Array } } | null | undefined,
  vehRows?: readonly { kind: string }[],
): string | null {
  if (!pick) return null;
  if (pick.type === 'v' && sim?.veh && vehRows) {
    const row = vehRows[sim.veh.look[pick.i]];
    return row ? row.kind : 'v';
  }
  return pick.type;
}

function isMetroFollow(ft: string | null | undefined): boolean {
  if (!ft) return false;
  const k = ft.toLowerCase();
  return k === 't' || k === 'metro' || k.includes('metro');
}

function isAutoOrDeliveryFollow(ft: string | null | undefined): boolean {
  if (!ft) return false;
  const k = ft.toLowerCase();
  return k === 'auto' || k === 'delivery' || k.includes('auto') || k.includes('delivery');
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export class CityGame {
  readonly treasures: Treasure[] = [];
  readonly quests: QuestInfo[] = [];

  private collectedMask = new Uint8Array(TREASURE_DEFS.length);
  private questCompletedMask = new Uint8Array(QUEST_DEFS.length);
  private questProgress = new Float64Array(QUEST_DEFS.length);

  private placeLookup = new Map<string, { x: number; y: number }>();
  private storageKey: string | null;
  private storage: StorageLike | null;

  private clock = 0;
  private metroRideSample = 0;
  private wasMetroFollow = false;
  private ambientHonkTimer = 3.5;

  // Balloon state (cruises between Hussain Sagar and Golconda)
  private balloonCenterX = 0;
  private balloonCenterY = 0;
  private balloonAmpX = 1;
  private balloonAmpY = 1;
  private balloonPhase = 0.4;
  balloonX = 0;
  balloonY = 0;
  balloonZ = 76;
  balloonAlpha = 1;

  // Firefly buffer: [wx, wy, phase, speed] * count (zero allocation in draw)
  private fireflyCount = 0;
  private fireflyData: Float32Array;

  // Ripple ring buffer (zero allocation per frame)
  private ripX = new Float32Array(MAX_RIPPLES);
  private ripY = new Float32Array(MAX_RIPPLES);
  private ripAge = new Float32Array(MAX_RIPPLES);
  private ripDur = new Float32Array(MAX_RIPPLES);
  private ripKind = new Uint8Array(MAX_RIPPLES);
  private ripCursor = 0;

  // Collect burst sparks buffer (zero allocation per frame)
  private spkX = new Float32Array(MAX_SPARKS);
  private spkY = new Float32Array(MAX_SPARKS);
  private spkVX = new Float32Array(MAX_SPARKS);
  private spkVY = new Float32Array(MAX_SPARKS);
  private spkAge = new Float32Array(MAX_SPARKS);
  private spkLife = new Float32Array(MAX_SPARKS);
  private spkCol = new Uint8Array(MAX_SPARKS);
  private spkCursor = 0;

  // Toast queue & dirty flag for cached summary
  private toastQueue: string[] = [];
  private summaryDirty = true;
  private cachedSummary: CityGameSummary | null = null;
  private camRefX = WORLD_W / 2;
  private camRefY = WORLD_H / 2;
  private cachedRefX = NaN;
  private cachedRefY = NaN;

  onToast: ((msg: string) => void) | null = null;

  constructor(places?: readonly PlaceInput[], options: CityGameOptions = {}) {
    this.storageKey = options.storageKey === undefined ? DEFAULT_STORE : options.storageKey;
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;

    if (places) {
      for (const p of places) this.placeLookup.set(p.id, { x: p.x, y: p.y });
    }
    for (const p of PLACES) {
      if (!this.placeLookup.has(p.id)) {
        this.placeLookup.set(p.id, { x: mx(p.lon), y: my(p.lat) });
      }
    }

    for (let i = 0; i < TREASURE_DEFS.length; i++) {
      const def = TREASURE_DEFS[i];
      const anchor = this.placeLookup.get(def.placeId) ?? { x: WORLD_W / 2, y: WORLD_H };
      const x = anchor.x + def.dx;
      const y = anchor.y + def.dy;
      this.treasures.push({
        id: def.id,
        index: i,
        name: def.name,
        kind: def.kind,
        district: def.district,
        placeId: def.placeId,
        x,
        y,
        wx: x,
        wy: y / 2,
        hint: def.hint,
        collected: false,
      });
    }

    for (let i = 0; i < QUEST_DEFS.length; i++) {
      const q = QUEST_DEFS[i];
      this.quests.push({
        id: q.id,
        title: q.title,
        description: q.description,
        progress: 0,
        target: q.target,
        unit: q.unit,
        completed: false,
        rewardPts: q.rewardPts,
      });
    }

    // Configure balloon cruise corridor over Hussain Sagar <-> Golconda
    const lake = this.placeLookup.get('buddha')!;
    const fort = this.placeLookup.get('golconda')!;
    this.balloonCenterX = (lake.x + fort.x) / 2;
    this.balloonCenterY = (lake.y / 2 + fort.y / 2) / 2 - 40;
    this.balloonAmpX = Math.max(900, Math.abs(lake.x - fort.x) * 0.52);
    this.balloonAmpY = Math.max(480, Math.abs(lake.y / 2 - fort.y / 2) * 0.65);
    this.stepBalloon(0);

    // Build deterministic fireflies around parks & lakesides
    let totalFlies = 0;
    for (const s of FIREFLY_SPOTS) totalFlies += s.count;
    this.fireflyCount = totalFlies;
    this.fireflyData = new Float32Array(totalFlies * 4);
    let fi = 0;
    for (let si = 0; si < FIREFLY_SPOTS.length; si++) {
      const sp = FIREFLY_SPOTS[si];
      const pos = this.placeLookup.get(sp.id) ?? { x: mx(sp.lon), y: my(sp.lat) };
      const cx = pos.x;
      const cy = pos.y / 2;
      for (let k = 0; k < sp.count; k++) {
        const idx = fi * 4;
        const rx = (hash01(fi, 1) - 0.5) * 2 * sp.spreadX;
        const ry = (hash01(fi, 2) - 0.5) * 2 * sp.spreadY;
        this.fireflyData[idx] = cx + rx;
        this.fireflyData[idx + 1] = cy + ry;
        this.fireflyData[idx + 2] = hash01(fi, 3) * 6.2832;
        this.fireflyData[idx + 3] = 0.7 + hash01(fi, 4) * 0.9;
        fi++;
      }
    }

    this.load();
    this.syncDerivedState();
  }

  private load() {
    if (!this.storageKey || !this.storage) return;
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        collected?: string[];
        progress?: Record<string, number>;
        completed?: string[];
      };
      if (Array.isArray(data.collected)) {
        const set = new Set(data.collected);
        for (let i = 0; i < this.treasures.length; i++) {
          if (set.has(this.treasures[i].id)) {
            this.collectedMask[i] = 1;
            this.treasures[i].collected = true;
          }
        }
      }
      if (data.progress && typeof data.progress === 'object') {
        for (let i = 0; i < QUEST_DEFS.length; i++) {
          const val = Number(data.progress[QUEST_DEFS[i].id]);
          if (Number.isFinite(val) && val > 0) {
            this.questProgress[i] = Math.min(QUEST_DEFS[i].target, val);
          }
        }
      }
      if (Array.isArray(data.completed)) {
        const cset = new Set(data.completed);
        for (let i = 0; i < QUEST_DEFS.length; i++) {
          if (cset.has(QUEST_DEFS[i].id)) {
            this.questCompletedMask[i] = 1;
            this.questProgress[i] = QUEST_DEFS[i].target;
          }
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  private save() {
    if (!this.storageKey || !this.storage) return;
    try {
      const collected: string[] = [];
      for (let i = 0; i < this.treasures.length; i++) {
        if (this.collectedMask[i]) collected.push(this.treasures[i].id);
      }
      const progress: Record<string, number> = {};
      const completed: string[] = [];
      for (let i = 0; i < QUEST_DEFS.length; i++) {
        if (this.questProgress[i] > 0) progress[QUEST_DEFS[i].id] = Math.round(this.questProgress[i] * 10) / 10;
        if (this.questCompletedMask[i]) completed.push(QUEST_DEFS[i].id);
      }
      this.storage.setItem(this.storageKey, JSON.stringify({ collected, progress, completed }));
    } catch {
      /* ignore quota / private mode */
    }
  }

  private syncDerivedState() {
    let chaiGot = 0;
    for (let i = 0; i < this.treasures.length; i++) {
      this.treasures[i].collected = this.collectedMask[i] === 1;
      if (this.collectedMask[i] === 1 && this.treasures[i].kind === 'chai') chaiGot++;
    }
    if (chaiGot > this.questProgress[0]) {
      this.questProgress[0] = Math.min(QUEST_DEFS[0].target, chaiGot);
    }
    for (let i = 0; i < QUEST_DEFS.length; i++) {
      const target = QUEST_DEFS[i].target;
      if (this.questProgress[i] >= target) {
        this.questProgress[i] = target;
        this.questCompletedMask[i] = 1;
      }
      this.quests[i].progress = Math.min(target, Math.floor(this.questProgress[i]));
      this.quests[i].completed = this.questCompletedMask[i] === 1;
    }
    this.summaryDirty = true;
  }

  resetProgress() {
    this.collectedMask.fill(0);
    this.questCompletedMask.fill(0);
    this.questProgress.fill(0);
    this.metroRideSample = 0;
    this.wasMetroFollow = false;
    this.toastQueue.length = 0;
    for (let i = 0; i < this.treasures.length; i++) this.treasures[i].collected = false;
    this.syncDerivedState();
    this.save();
  }

  private stepBalloon(dt: number) {
    this.balloonPhase += dt * 0.025;
    const p = this.balloonPhase;
    this.balloonX = this.balloonCenterX + Math.sin(p) * this.balloonAmpX;
    this.balloonY = this.balloonCenterY + Math.sin(p * 2 + 0.5) * this.balloonAmpY * 0.65;
    this.balloonZ = 76 + Math.sin(this.clock * 0.8 + p) * 7;
  }

  private pushToast(msg: string) {
    this.toastQueue.push(msg);
    if (this.toastQueue.length > 8) this.toastQueue.shift();
    if (this.onToast) this.onToast(msg);
  }

  popToast(): string | null {
    return this.toastQueue.length ? this.toastQueue.shift()! : null;
  }

  private setQuestValue(idx: number, value: number, emitToast: boolean): boolean {
    const def = QUEST_DEFS[idx];
    const clamped = Math.min(def.target, Math.max(this.questProgress[idx], value));
    const prevRounded = Math.floor(this.questProgress[idx]);
    const nextRounded = Math.floor(clamped);
    let dirty = nextRounded !== prevRounded;
    this.questProgress[idx] = clamped;
    this.quests[idx].progress = nextRounded;
    if (clamped >= def.target && !this.questCompletedMask[idx]) {
      this.questCompletedMask[idx] = 1;
      this.quests[idx].completed = true;
      dirty = true;
      if (emitToast) {
        this.pushToast(`Quest Complete: ${def.title}! (+${def.rewardPts} pts)`);
      }
    }
    if (dirty) this.summaryDirty = true;
    return dirty;
  }

  private collectAt(index: number, emitToast: boolean): { toast: string; completedQuest: string | null } {
    const tr = this.treasures[index];
    this.collectedMask[index] = 1;
    tr.collected = true;
    this.spawnCollectBurst(tr.wx, tr.wy - 4);
    this.triggerRipple(tr.wx, tr.wy, 'collect');

    let totalGot = 0;
    let chaiGot = 0;
    for (let i = 0; i < this.treasures.length; i++) {
      if (this.collectedMask[i]) {
        totalGot++;
        if (this.treasures[i].kind === 'chai') chaiGot++;
      }
    }

    const prevCompleted = this.questCompletedMask[0] === 1;
    this.setQuestValue(0, chaiGot, false);
    const completedQuest = !prevCompleted && this.questCompletedMask[0] === 1 ? QUEST_DEFS[0].title : null;

    this.summaryDirty = true;
    this.save();

    const base =
      totalGot === this.treasures.length
        ? `All ${totalGot}/${this.treasures.length} Chai & Pearls collected! Deccan Legend!`
        : `${tr.name} collected! Chai & Pearls: ${totalGot}/${this.treasures.length}`;
    const toast = completedQuest ? `${base} · Quest: ${completedQuest}!` : base;

    if (emitToast) {
      this.pushToast(toast);
    }
    return { toast, completedQuest };
  }

  /** Trigger a visual "Horn / Cheer / Collect" ripple at world px (wx, wy). */
  triggerRipple(wx: number, wy: number, kind: RippleKind = 'horn') {
    const i = this.ripCursor;
    this.ripCursor = (this.ripCursor + 1) % MAX_RIPPLES;
    this.ripX[i] = wx;
    this.ripY[i] = wy;
    this.ripAge[i] = 0;
    this.ripDur[i] = kind === 'collect' ? 0.95 : 1.15;
    this.ripKind[i] = kind === 'collect' ? RIPPLE_COLLECT : kind === 'cheer' ? RIPPLE_CHEER : RIPPLE_HORN;
  }

  honkAt(wx: number, wy: number) {
    this.triggerRipple(wx, wy, 'horn');
  }

  cheerAt(wx: number, wy: number) {
    this.triggerRipple(wx, wy, 'cheer');
  }

  private spawnCollectBurst(wx: number, wy: number) {
    for (let k = 0; k < 10; k++) {
      const i = this.spkCursor;
      this.spkCursor = (this.spkCursor + 1) % MAX_SPARKS;
      const ang = (k / 10) * 6.2832 + hash01(i, this.clock) * 0.4;
      const spd = 14 + hash01(k, 17) * 20;
      this.spkX[i] = wx;
      this.spkY[i] = wy;
      this.spkVX[i] = Math.cos(ang) * spd;
      this.spkVY[i] = Math.sin(ang) * spd * 0.65 - 10;
      this.spkAge[i] = 0;
      this.spkLife[i] = 0.55 + hash01(k, 29) * 0.35;
      this.spkCol[i] = k % SPARK_COLORS.length;
    }
  }

  /** Handle a map tap at world pixels (wx, wy). Returns toast text if a collectible or balloon was tapped. */
  tryTap(wx: number, wy: number, zoom: number): string | null {
    const hitRad = Math.max(14, 18 / Math.max(0.15, zoom));
    let bestIdx = -1;
    let bestD = hitRad;
    for (let i = 0; i < this.treasures.length; i++) {
      if (this.collectedMask[i]) continue;
      const t = this.treasures[i];
      const d = Math.hypot(t.wx - wx, t.wy - 4 - wy);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      return this.collectAt(bestIdx, false).toast;
    }

    // Allow tapping the floating Hot-Air Balloon when visible!
    if (this.balloonAlpha > 0.25 && zoom >= 0.25) {
      const bScale = zoom < 0.3 ? 3 : zoom < 0.7 ? 1.6 : 1;
      const bx = this.balloonX;
      const topY = this.balloonY - this.balloonZ * (bScale > 1 ? 0.9 : 1);
      const centerY = topY - 7 * bScale;
      const bRad = Math.max(18, 22 / Math.max(0.25, zoom));
      if (Math.hypot(bx - wx, centerY - wy) < bRad) {
        this.triggerRipple(bx, centerY, 'cheer');
        return 'Deccan Sky Balloon · Drifting over Hussain Sagar & Golconda!';
      }
    }

    return null;
  }

  /** Advance ambient life, inspect-zoom collection, and Explorer Mini-Quests (zero per-frame heap allocation). */
  update(
    dt: number,
    sim: SimView,
    cam: CamView,
    stampsCount = 0,
    followingType: string | null = null,
    rideMeters = 0,
  ) {
    const safeDt = dt > 0 ? dt : 0;
    this.clock += safeDt;
    this.camRefX = cam.x;
    this.camRefY = cam.y;

    // 1. Balloon drift & daytime clear visibility fade
    const clearDay = sim.night < 0.45 && sim.rain < 0.25 && !sim.storm;
    const targetAlpha = clearDay ? 1 : 0;
    if (safeDt > 0) {
      this.balloonAlpha += (targetAlpha - this.balloonAlpha) * Math.min(1, safeDt * 1.2);
      if (this.balloonAlpha < 0.01 && targetAlpha === 0) this.balloonAlpha = 0;
      this.stepBalloon(safeDt);
    } else {
      this.balloonAlpha = targetAlpha;
    }

    // 2. Step active ripples & celebration sparks
    if (safeDt > 0) {
      for (let i = 0; i < MAX_RIPPLES; i++) {
        if (this.ripDur[i] > 0) {
          this.ripAge[i] += safeDt;
          if (this.ripAge[i] >= this.ripDur[i]) this.ripDur[i] = 0;
        }
      }
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (this.spkLife[i] > 0) {
          this.spkAge[i] += safeDt;
          if (this.spkAge[i] >= this.spkLife[i]) {
            this.spkLife[i] = 0;
          } else {
            this.spkX[i] += this.spkVX[i] * safeDt;
            this.spkY[i] += this.spkVY[i] * safeDt;
            this.spkVY[i] += 26 * safeDt;
          }
        }
      }
    }

    // 3. Occasional subtle ambient horn ripple in busy street traffic
    const cong = sim.congestion ? sim.congestion(2) : 0;
    if (safeDt > 0 && cam.zoom >= 1.2 && cong > 0.45 && sim.veh) {
      this.ambientHonkTimer -= safeDt;
      if (this.ambientHonkTimer <= 0) {
        this.ambientHonkTimer = 4 + hash01(this.clock, 9) * 4;
        const hw = cam.w / 2 / cam.zoom;
        const hh = cam.h / 2 / cam.zoom;
        const n = sim.veh.n;
        const start = Math.floor(hash01(this.clock, 13) * n);
        for (let k = 0; k < n; k++) {
          const vi = (start + k) % n;
          if (!sim.veh.tile[vi]) continue;
          const vx = sim.veh.x[vi];
          const vy = sim.veh.y[vi] / 2;
          if (vx >= cam.x - hw && vx <= cam.x + hw && vy >= cam.y - hh && vy <= cam.y + hh) {
            this.triggerRipple(vx, vy - 4, 'horn');
            break;
          }
        }
      }
    }

    // 4. Collect nearby treasure when zoomed down close to inspect
    let changed = false;
    if (cam.zoom >= 1.8 && !cam.flying) {
      for (let i = 0; i < this.treasures.length; i++) {
        if (this.collectedMask[i]) continue;
        const t = this.treasures[i];
        if (Math.hypot(t.wx - cam.x, (t.wy - cam.y) * 1.4) < 52) {
          this.collectAt(i, true);
          changed = true;
          break;
        }
      }
    }

    // 5. Evaluate Mini-Quests from live player & simulation state
    if (stampsCount > this.questProgress[1]) {
      if (this.setQuestValue(1, stampsCount, true)) changed = true;
    }

    if (isMetroFollow(followingType)) {
      const prevSample = this.wasMetroFollow ? this.metroRideSample : 0;
      const delta = rideMeters >= prevSample ? rideMeters - prevSample : rideMeters;
      this.metroRideSample = rideMeters;
      this.wasMetroFollow = true;
      if (delta > 0) {
        if (this.setQuestValue(2, this.questProgress[2] + delta, true)) changed = true;
      }
    } else {
      this.wasMetroFollow = false;
      this.metroRideSample = 0;
    }

    if (isAutoOrDeliveryFollow(followingType)) {
      if (this.setQuestValue(3, 1, true)) changed = true;
    }

    if (sim.rain >= 0.35 || sim.storm) {
      if (this.setQuestValue(4, 1, true)) changed = true;
    }

    const sunrise = sim.sunrise ?? 6.1;
    const sunset = sim.sunset ?? 18.3;
    const isNight =
      sim.night >= 0.45 ||
      (Number.isFinite(sim.hour) && (sim.hour >= sunset + 0.2 || sim.hour < sunrise - 0.2));
    if (isNight) {
      if (this.setQuestValue(5, 1, true)) changed = true;
    }

    if (changed) this.save();
  }

  /** Render collectibles, ambient map life, and celebration sparks in world pixel space. */
  draw(ctx: CanvasRenderingContext2D, cam: CamView, sim: SimView) {
    const dpr = cam.dpr || 1;
    const s = cam.zoom * dpr;
    const W = ctx.canvas ? ctx.canvas.width : Math.floor(cam.w * dpr);
    const H = ctx.canvas ? ctx.canvas.height : Math.floor(cam.h * dpr);
    const ox = Math.round(W / 2 - cam.x * s);
    const oy = Math.round(H / 2 - cam.y * s);

    const hw = W / 2 / s;
    const hh = H / 2 / s;
    const x0 = cam.x - hw;
    const x1 = cam.x + hw;
    const y0 = cam.y - hh;
    const y1 = cam.y + hh;
    const t = Number.isFinite(sim.clock) && sim.clock > 0 ? sim.clock : this.clock;

    ctx.save();
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';

    this.drawAmbientInWorld(ctx, cam, sim, x0, y0, x1, y1, t);
    this.drawTreasuresInWorld(ctx, cam, x0, y0, x1, y1, t);
    this.drawSparksInWorld(ctx, x0, y0, x1, y1);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Draw ambient map life (balloon, night fireflies, honk/cheer ripples) with its own transform setup. */
  drawMapLife(ctx: CanvasRenderingContext2D, cam: CamView, sim: SimView) {
    const dpr = cam.dpr || 1;
    const s = cam.zoom * dpr;
    const W = ctx.canvas ? ctx.canvas.width : Math.floor(cam.w * dpr);
    const H = ctx.canvas ? ctx.canvas.height : Math.floor(cam.h * dpr);
    const ox = Math.round(W / 2 - cam.x * s);
    const oy = Math.round(H / 2 - cam.y * s);
    const hw = W / 2 / s;
    const hh = H / 2 / s;
    const t = Number.isFinite(sim.clock) && sim.clock > 0 ? sim.clock : this.clock;

    ctx.save();
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';

    this.drawAmbientInWorld(ctx, cam, sim, cam.x - hw, cam.y - hh, cam.x + hw, cam.y + hh, t);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawAmbientInWorld(
    ctx: CanvasRenderingContext2D,
    cam: CamView,
    sim: SimView,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    t: number,
  ) {
    // 1. Night fireflies twinkling softly over parks & lakesides
    const sunrise = sim.sunrise ?? 6.1;
    const sunset = sim.sunset ?? 18.3;
    const nightStrength = Math.max(
      sim.night,
      sim.hour >= sunset - 0.1 || sim.hour < sunrise + 0.1 ? 0.65 : 0,
    );
    if (nightStrength > 0.18 && sim.rain < 0.7 && cam.zoom >= 0.45) {
      const fScale = cam.zoom < 1 ? 1.5 : 1;
      const data = this.fireflyData;
      for (let i = 0; i < this.fireflyCount; i++) {
        const idx = i * 4;
        const bx = data[idx];
        const by = data[idx + 1];
        if (bx < x0 - 30 || bx > x1 + 30 || by < y0 - 30 || by > y1 + 30) continue;
        const ph = data[idx + 2];
        const spd = data[idx + 3];
        const pulse = Math.sin(t * 2.4 + ph * 3.1);
        if (pulse <= 0.05) continue;
        const fx = Math.round(bx + Math.sin(t * spd + ph) * 18);
        const fy = Math.round(by + Math.cos(t * spd * 0.85 + ph * 1.7) * 9);
        ctx.globalAlpha = 0.28 * pulse * nightStrength;
        ctx.fillStyle = '#ffe978';
        ctx.fillRect(fx - fScale, fy - fScale, 3 * fScale, 3 * fScale);
        ctx.globalAlpha = 0.92 * pulse * nightStrength;
        ctx.fillStyle = (i & 1) === 0 ? '#fff9b8' : '#d2ff72';
        ctx.fillRect(fx, fy, fScale, fScale);
      }
      ctx.globalAlpha = 1;
    }

    // 2. Drifting Hot-Air Balloon over Hussain Sagar <-> Golconda
    if (this.balloonAlpha > 0.03 && cam.zoom >= 0.12) {
      const bScale = cam.zoom < 0.3 ? 3 : cam.zoom < 0.7 ? 1.6 : 1;
      const bx = Math.round(this.balloonX);
      const by = Math.round(this.balloonY);
      const topY = Math.round(by - this.balloonZ * (bScale > 1 ? 0.9 : 1));
      if (bx >= x0 - 80 && bx <= x1 + 80 && topY >= y0 - 120 && by <= y1 + 60) {
        // Ground shadow
        ctx.globalAlpha = 0.22 * this.balloonAlpha;
        ctx.fillStyle = '#1b1626';
        ctx.fillRect(bx - 6 * bScale, by - 2 * bScale, 12 * bScale, 4 * bScale);

        ctx.globalAlpha = this.balloonAlpha;
        // Envelope outline & colorful pixel gores
        const px = bScale;
        ctx.fillStyle = '#2a1f3a';
        ctx.fillRect(bx - 6 * px, topY - 14 * px, 12 * px, 11 * px);
        ctx.fillRect(bx - 7 * px, topY - 12 * px, 14 * px, 7 * px);
        ctx.fillRect(bx - 4 * px, topY - 3 * px, 8 * px, 3 * px);

        ctx.fillStyle = '#f0a030';
        ctx.fillRect(bx - 6 * px, topY - 11 * px, 12 * px, 7 * px);
        ctx.fillStyle = '#f7efe0';
        ctx.fillRect(bx - 4 * px, topY - 13 * px, 8 * px, 10 * px);
        ctx.fillStyle = '#2dd4bf';
        ctx.fillRect(bx - 2 * px, topY - 13 * px, 4 * px, 11 * px);
        ctx.fillStyle = '#e0524c';
        ctx.fillRect(bx - 5 * px, topY - 9 * px, 2 * px, 4 * px);
        ctx.fillRect(bx + 3 * px, topY - 9 * px, 2 * px, 4 * px);
        ctx.fillStyle = '#f0a030';
        ctx.fillRect(bx - 3 * px, topY - 3 * px, 6 * px, 2 * px);

        // Burner flame flicker
        if (((t * 5) | 0) % 3 === 0) {
          ctx.fillStyle = '#ffd84c';
          ctx.fillRect(bx - 1 * px, topY, 2 * px, 2 * px);
        }

        // Suspension ropes & wicker basket
        ctx.fillStyle = '#2a1f3a';
        ctx.fillRect(bx - 2 * px, topY, 1 * px, 3 * px);
        ctx.fillRect(bx + 1 * px, topY, 1 * px, 3 * px);
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(bx - 2 * px, topY + 3 * px, 4 * px, 3 * px);
        ctx.fillStyle = '#d4a359';
        ctx.fillRect(bx - 1 * px, topY + 3 * px, 2 * px, 1 * px);
        ctx.globalAlpha = 1;
      }
    }

    // 3. Expanding Traffic Honk / Cheer / Collect Ripples
    const rScale = cam.zoom < 0.6 ? 2.2 : 1;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const dur = this.ripDur[i];
      if (dur <= 0) continue;
      const rx = this.ripX[i];
      const ry = this.ripY[i];
      if (rx < x0 - 60 || rx > x1 + 60 || ry < y0 - 60 || ry > y1 + 60) continue;
      const p = this.ripAge[i] / dur;
      const fade = 1 - p;
      const kind = this.ripKind[i];
      const rad = Math.round((4 + p * 20) * rScale);
      const radH = Math.round(rad * 0.55);
      const col = kind === RIPPLE_CHEER ? '#2dd4bf' : kind === RIPPLE_COLLECT ? '#fff7e0' : '#ffd23f';
      const accent = kind === RIPPLE_CHEER ? '#f0a030' : kind === RIPPLE_COLLECT ? '#ffd84c' : '#e0524c';

      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = col;
      // Stepped pixel rectangle perimeter (4 crisp bars, zero path alloc)
      const bw = Math.max(1, Math.round(rScale));
      ctx.fillRect(Math.round(rx - rad), Math.round(ry - radH), rad * 2, bw);
      ctx.fillRect(Math.round(rx - rad), Math.round(ry + radH - bw), rad * 2, bw);
      ctx.fillRect(Math.round(rx - rad), Math.round(ry - radH), bw, radH * 2);
      ctx.fillRect(Math.round(rx + rad - bw), Math.round(ry - radH), bw, radH * 2);

      // Floating accent blip ("honk note" / cheer sparkle)
      if (p < 0.75) {
        const rise = Math.round(p * 12 * rScale);
        ctx.fillStyle = accent;
        ctx.fillRect(Math.round(rx - bw), Math.round(ry - radH - 3 * rScale - rise), bw * 2, bw * 2);
        if (kind === RIPPLE_HORN) {
          ctx.fillRect(Math.round(rx + 2 * rScale), Math.round(ry - radH - 5 * rScale - rise), bw, bw * 2);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawTreasuresInWorld(
    ctx: CanvasRenderingContext2D,
    cam: CamView,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    t: number,
  ) {
    // Scale tokens gently when zoomed out so players can spot them across districts
    const sc = cam.zoom < 0.14 ? 5 : cam.zoom < 0.3 ? 3 : cam.zoom < 0.7 ? 1.75 : 1;
    const pad = 20 * sc;

    for (let i = 0; i < this.treasures.length; i++) {
      if (this.collectedMask[i]) continue;
      const tr = this.treasures[i];
      if (tr.wx < x0 - pad || tr.wx > x1 + pad || tr.wy < y0 - pad || tr.wy > y1 + pad) continue;

      const x = Math.round(tr.wx);
      const bob = Math.sin(t * 3.1 + i * 1.15) * 1.5 * sc;
      const y = Math.round(tr.wy - 4 * sc + bob);

      // Overview golden diamond pip when very zoomed out
      if (cam.zoom < 0.25) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#2a1f3a';
        ctx.fillRect(x - 3 * sc, y - 3 * sc, 6 * sc, 6 * sc);
        ctx.fillStyle = tr.kind === 'chai' ? '#f0a030' : '#f7efe0';
        ctx.fillRect(x - 2 * sc, y - 2 * sc, 4 * sc, 4 * sc);
        ctx.fillStyle = '#ffd84c';
        ctx.fillRect(x - 1 * sc, y - 1 * sc, 2 * sc, 2 * sc);
        continue;
      }

      // Ground drop shadow
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#1b1626';
      ctx.fillRect(x - 3 * sc, Math.round(tr.wy) - 1 * sc, 6 * sc, 2 * sc);
      ctx.globalAlpha = 1;

      if (tr.kind === 'chai') {
        // Golden Irani Chai Cup on saucer + rising steam
        ctx.fillStyle = '#2a1f3a';
        ctx.fillRect(x - 4 * sc, y - 4 * sc, 8 * sc, 7 * sc);
        ctx.fillRect(x + 4 * sc, y - 3 * sc, 2 * sc, 4 * sc);
        // Saucer
        ctx.fillStyle = '#f7efe0';
        ctx.fillRect(x - 4 * sc, y + 1 * sc, 8 * sc, 1 * sc);
        // Golden cup body & rim highlight
        ctx.fillStyle = '#f0a030';
        ctx.fillRect(x - 3 * sc, y - 3 * sc, 6 * sc, 4 * sc);
        ctx.fillStyle = '#ffd86b';
        ctx.fillRect(x - 3 * sc, y - 3 * sc, 2 * sc, 3 * sc);
        // Chai tea top
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(x - 2 * sc, y - 3 * sc, 4 * sc, 1 * sc);
        // Handle
        ctx.fillStyle = '#ffd86b';
        ctx.fillRect(x + 3 * sc, y - 2 * sc, 2 * sc, 2 * sc);
        // Animated steam wisp
        const st = ((t * 3.5 + i) % 3) * sc;
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = '#fff7e0';
        ctx.fillRect(x - 1 * sc, Math.round(y - 6 * sc - st), 1 * sc, 2 * sc);
        ctx.fillRect(x + 1 * sc, Math.round(y - 7 * sc - st * 0.7), 1 * sc, 1 * sc);
      } else {
        // Luminous Deccan Pearl in a golden clasp
        ctx.fillStyle = '#2a1f3a';
        ctx.fillRect(x - 4 * sc, y - 4 * sc, 8 * sc, 8 * sc);
        // Gold clasp base
        ctx.fillStyle = '#f0a030';
        ctx.fillRect(x - 3 * sc, y + 1 * sc, 6 * sc, 2 * sc);
        // Pearl orb
        ctx.fillStyle = '#f7efe0';
        ctx.fillRect(x - 3 * sc, y - 3 * sc, 6 * sc, 5 * sc);
        ctx.fillStyle = '#cfe8f0';
        ctx.fillRect(x + 1 * sc, y - 1 * sc, 2 * sc, 3 * sc);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 2 * sc, y - 2 * sc, 2 * sc, 2 * sc);
        ctx.fillStyle = '#2dd4bf';
        ctx.fillRect(x - 1 * sc, y + 2 * sc, 2 * sc, 1 * sc);
      }

      // Golden twinkle sparkle orbiting top corner
      const glint = Math.sin(t * 5.2 + i * 2.1);
      if (glint > 0.2) {
        ctx.globalAlpha = glint;
        ctx.fillStyle = '#fff7e0';
        const gx = x + (i % 2 === 0 ? 4 : -5) * sc;
        const gy = y - 5 * sc;
        ctx.fillRect(gx, gy - 1 * sc, 1 * sc, 3 * sc);
        ctx.fillRect(gx - 1 * sc, gy, 3 * sc, 1 * sc);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawSparksInWorld(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    for (let i = 0; i < MAX_SPARKS; i++) {
      const life = this.spkLife[i];
      if (life <= 0) continue;
      const sx = this.spkX[i];
      const sy = this.spkY[i];
      if (sx < x0 - 20 || sx > x1 + 20 || sy < y0 - 20 || sy > y1 + 20) continue;
      ctx.globalAlpha = Math.max(0, 1 - this.spkAge[i] / life);
      ctx.fillStyle = SPARK_COLORS[this.spkCol[i]];
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  /** Sync balloon position directly from an external clock value (used by stateless drawMapLife). */
  syncClockForMapLife(clock: number, sim: SimView) {
    this.clock = clock;
    this.balloonPhase = 0.4 + clock * 0.025;
    this.stepBalloon(0);
    const clearDay = sim.night < 0.45 && sim.rain < 0.25 && !sim.storm;
    this.balloonAlpha = clearDay ? 1 : 0;
  }

  /** Current summary snapshot for the HUD chip & modal. */
  getSummary(refX = this.camRefX, refY = this.camRefY): CityGameSummary {
    if (!this.summaryDirty && this.cachedSummary && refX === this.cachedRefX && refY === this.cachedRefY) {
      return this.cachedSummary;
    }

    let totalGot = 0;
    let chaiGot = 0;
    let chaiTotal = 0;
    let pearlsGot = 0;
    let pearlsTotal = 0;

    const distMap = new Map<TreasureDistrict, { collected: number; total: number }>();
    for (const d of DISTRICTS) distMap.set(d, { collected: 0, total: 0 });

    let nearest: CityGameSummary['nearestUncollected'] = null;
    let bestDist = Infinity;

    for (let i = 0; i < this.treasures.length; i++) {
      const t = this.treasures[i];
      const got = this.collectedMask[i] === 1;
      const bucket = distMap.get(t.district)!;
      bucket.total++;
      if (got) {
        totalGot++;
        bucket.collected++;
      } else {
        const d = Math.hypot(t.wx - refX, t.wy - refY);
        if (d < bestDist) {
          bestDist = d;
          nearest = { id: t.id, name: t.name, kind: t.kind, district: t.district, wx: t.wx, wy: t.wy };
        }
      }
      if (t.kind === 'chai') {
        chaiTotal++;
        if (got) chaiGot++;
      } else {
        pearlsTotal++;
        if (got) pearlsGot++;
      }
    }

    let questsDone = 0;
    let questPts = 0;
    const quests = this.quests.map((q) => {
      if (q.completed) {
        questsDone++;
        questPts += q.rewardPts;
      }
      return { ...q };
    });

    const districts: DistrictProgress[] = DISTRICTS.map((district) => {
      const b = distMap.get(district)!;
      return { district, collected: b.collected, total: b.total };
    });

    const summary: CityGameSummary = {
      treasuresCollected: totalGot,
      treasuresTotal: this.treasures.length,
      chaiCollected: chaiGot,
      chaiTotal,
      pearlsCollected: pearlsGot,
      pearlsTotal,
      questsCompleted: questsDone,
      questsTotal: this.quests.length,
      score: totalGot * TREASURE_PTS + questPts,
      quests,
      districts,
      nearestUncollected: nearest,
    };

    this.cachedRefX = refX;
    this.cachedRefY = refY;
    this.cachedSummary = summary;
    this.summaryDirty = false;
    return summary;
  }
}

let sharedMapLife: CityGame | null = null;

/** Standalone helper to render ambient map life (balloon + night fireflies, or full CityGame life). */
export function drawMapLife(
  ctx: CanvasRenderingContext2D,
  cam: CamView,
  sim: SimView,
  game?: CityGame,
) {
  if (game) {
    game.drawMapLife(ctx, cam, sim);
    return;
  }
  if (!sharedMapLife) {
    sharedMapLife = new CityGame(undefined, { storageKey: null });
  }
  sharedMapLife.syncClockForMapLife(sim.clock || 0, sim);
  sharedMapLife.drawMapLife(ctx, cam, sim);
}
