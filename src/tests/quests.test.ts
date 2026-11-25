import { describe, it, expect, vi } from 'vitest';
import {
  CityGame,
  DISTRICTS,
  TREASURE_DEFS,
  QUEST_DEFS,
  drawMapLife,
  resolveFollowingKind,
  type CamView,
  type SimView,
  type StorageLike,
} from '../sim/quests';
import { PLACES } from '../world/places';
import { WORLD_W, WORLD_H } from '../world/geo';
import { VEH_ROWS } from '../art/actors';

function makeSim(overrides: Partial<SimView> = {}): SimView {
  return {
    clock: 10,
    hour: 16.4,
    sunrise: 6.1,
    sunset: 18.3,
    night: 0,
    rain: 0,
    storm: false,
    cloudCover: 0.25,
    congestion: () => 0.2,
    ...overrides,
  };
}

function makeCam(overrides: Partial<CamView> = {}): CamView {
  return {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    zoom: 2,
    w: 1280,
    h: 720,
    dpr: 1,
    flying: false,
    ...overrides,
  };
}

function makeMockStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

function makeMockCtx() {
  const fills: string[] = [];
  const ctx = {
    canvas: { width: 1280, height: 720 },
    fillStyle: '#000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn((_x: number, _y: number, _w: number, _h: number) => {
      fills.push(String(ctx.fillStyle));
    }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, mock: ctx, fills };
}

describe('CityGame collectibles & world invariants', () => {
  it('places 24 deterministic Chai & Pearl treasures across 6 districts on real places', () => {
    const a = new CityGame(undefined, { storageKey: null });
    const b = new CityGame(undefined, { storageKey: null });

    expect(a.treasures).toHaveLength(24);
    expect(TREASURE_DEFS).toHaveLength(24);
    expect(QUEST_DEFS).toHaveLength(6);

    const ids = new Set(a.treasures.map((t) => t.id));
    expect(ids.size).toBe(24);

    let chai = 0;
    let pearl = 0;
    const seenDistricts = new Set<string>();
    for (let i = 0; i < a.treasures.length; i++) {
      const ta = a.treasures[i];
      const tb = b.treasures[i];
      expect(ta.wx).toBe(tb.wx);
      expect(ta.wy).toBe(tb.wy);
      expect(ta.wx).toBeGreaterThan(0);
      expect(ta.wx).toBeLessThan(WORLD_W);
      expect(ta.wy).toBeGreaterThan(0);
      expect(ta.wy).toBeLessThan(WORLD_H);
      expect(PLACES.some((p) => p.id === ta.placeId)).toBe(true);
      seenDistricts.add(ta.district);
      if (ta.kind === 'chai') chai++;
      else pearl++;
    }
    expect(chai).toBe(12);
    expect(pearl).toBe(12);
    for (const d of DISTRICTS) expect(seenDistricts.has(d)).toBe(true);
  });

  it('collects a treasure on tap with toast and prevents duplicate collection', () => {
    const game = new CityGame(undefined, { storageKey: null });
    const first = game.treasures[0];

    const msg = game.tryTap(first.wx, first.wy - 4, 2);
    expect(msg).not.toBeNull();
    expect(msg).toContain(first.name);
    expect(msg).toContain('1/24');
    expect(first.collected).toBe(true);

    // Second tap on same token returns null
    expect(game.tryTap(first.wx, first.wy - 4, 2)).toBeNull();
    expect(game.getSummary().treasuresCollected).toBe(1);
    expect(game.getSummary().score).toBe(50);
  });

  it('auto-collects when zoomed down close to inspect and not flying', () => {
    const game = new CityGame(undefined, { storageKey: null });
    const onToast = vi.fn();
    game.onToast = onToast;
    const target = game.treasures[1];
    const sim = makeSim();

    // Does not collect while zoomed out or flying
    game.update(0.1, sim, makeCam({ x: target.wx, y: target.wy, zoom: 1.0, flying: false }));
    expect(target.collected).toBe(false);

    game.update(0.1, sim, makeCam({ x: target.wx, y: target.wy, zoom: 2.0, flying: true }));
    expect(target.collected).toBe(false);

    // Collects when zoom >= 1.8 and landed
    game.update(0.1, sim, makeCam({ x: target.wx + 10, y: target.wy + 5, zoom: 2.0, flying: false }));
    expect(target.collected).toBe(true);
    const popped = game.popToast();
    expect(popped).toContain(target.name);
    expect(onToast).toHaveBeenCalledTimes(1);
  });

  it('persists collected treasures and quest progress in storage and supports reset', () => {
    const storage = makeMockStorage();
    const g1 = new CityGame(undefined, { storageKey: 'test.quests', storage });
    const sim = makeSim({ rain: 0.8 });
    const cam = makeCam();

    g1.tryTap(g1.treasures[0].wx, g1.treasures[0].wy - 4, 2);
    g1.update(0.1, sim, cam, 5, 'auto', 0);

    const g2 = new CityGame(undefined, { storageKey: 'test.quests', storage });
    const s2 = g2.getSummary();
    expect(s2.treasuresCollected).toBe(1);
    expect(g2.treasures[0].collected).toBe(true);
    expect(s2.quests.find((q) => q.id === 'heritage')?.completed).toBe(true);
    expect(s2.quests.find((q) => q.id === 'auto-ride')?.completed).toBe(true);
    expect(s2.quests.find((q) => q.id === 'monsoon')?.completed).toBe(true);

    g2.resetProgress();
    const s3 = g2.getSummary();
    expect(s3.treasuresCollected).toBe(0);
    expect(s3.questsCompleted).toBe(0);
    expect(s3.score).toBe(0);
  });
});

describe('CityGame 6 Explorer Mini-Quests', () => {
  it('completes Irani Chai Run after collecting 3 chai cups (not pearls)', () => {
    const game = new CityGame(undefined, { storageKey: null });
    const pearls = game.treasures.filter((t) => t.kind === 'pearl');
    const chais = game.treasures.filter((t) => t.kind === 'chai');

    // Collecting 3 pearls should not complete Irani Chai Run
    for (let i = 0; i < 3; i++) game.tryTap(pearls[i].wx, pearls[i].wy - 4, 2);
    expect(game.getSummary().quests.find((q) => q.id === 'chai-run')?.progress).toBe(0);

    // Collecting 3 chai cups completes it
    game.tryTap(chais[0].wx, chais[0].wy - 4, 2);
    game.tryTap(chais[1].wx, chais[1].wy - 4, 2);
    const thirdMsg = game.tryTap(chais[2].wx, chais[2].wy - 4, 2);
    expect(thirdMsg).toContain('Irani Chai Run');
    const q = game.getSummary().quests.find((item) => item.id === 'chai-run')!;
    expect(q.completed).toBe(true);
    expect(q.progress).toBe(3);
  });

  it('tracks Metro Commuter distance across rides and completes at 300m', () => {
    const game = new CityGame(undefined, { storageKey: null });
    const sim = makeSim();
    const cam = makeCam();

    // Non-metro ride does not add metro distance
    game.update(0.2, sim, cam, 0, 'car', 500);
    expect(game.getSummary().quests.find((q) => q.id === 'metro-rider')?.progress).toBe(0);

    // Ride 180m on metro
    game.update(0.2, sim, cam, 0, 't', 180);
    expect(game.getSummary().quests.find((q) => q.id === 'metro-rider')?.progress).toBe(180);

    // Stop following, then ride another 140m -> 320m >= 300m
    game.update(0.2, sim, cam, 0, null, 0);
    game.update(0.2, sim, cam, 0, 't', 140);
    const q = game.getSummary().quests.find((item) => item.id === 'metro-rider')!;
    expect(q.completed).toBe(true);
    expect(q.progress).toBe(300);
  });

  it('completes Heritage Explorer, Auto Ride, Monsoon Watcher, and Night Owl from player state', () => {
    const game = new CityGame(undefined, { storageKey: null });
    const cam = makeCam();

    // Afternoon dry baseline: none complete
    game.update(0.1, makeSim({ hour: 15, night: 0, rain: 0 }), cam, 2, 'car', 0);
    expect(game.getSummary().questsCompleted).toBe(0);

    // Heritage (5 stamps) + Auto Ride (via resolveFollowingKind on auto row 0) + Monsoon + Night Owl
    const autoKind = resolveFollowingKind({ type: 'v', i: 0 }, { veh: { look: new Uint8Array([0]) } }, VEH_ROWS);
    expect(autoKind).toBe('auto');

    game.update(0.1, makeSim({ hour: 20.5, night: 0.8, rain: 0.6, storm: true }), cam, 5, autoKind, 0);
    const s = game.getSummary();
    expect(s.quests.find((q) => q.id === 'heritage')?.completed).toBe(true);
    expect(s.quests.find((q) => q.id === 'auto-ride')?.completed).toBe(true);
    expect(s.quests.find((q) => q.id === 'monsoon')?.completed).toBe(true);
    expect(s.quests.find((q) => q.id === 'night-owl')?.completed).toBe(true);
  });
});

describe('Ambient Map Life & rendering', () => {
  it('draws balloon in clear day, fireflies at night, treasures, and honk/cheer ripples', () => {
    const game = new CityGame(undefined, { storageKey: null });
    const { ctx, mock, fills } = makeMockCtx();

    // Day clear over the balloon
    const daySim = makeSim({ clock: 12, hour: 12, night: 0, rain: 0 });
    game.update(0.1, daySim, makeCam({ x: game.balloonX, y: game.balloonY, zoom: 1 }));
    game.honkAt(game.balloonX, game.balloonY);
    game.cheerAt(game.balloonX + 10, game.balloonY);
    game.draw(ctx, makeCam({ x: game.balloonX, y: game.balloonY, zoom: 1 }), daySim);
    expect(mock.save).toHaveBeenCalledTimes(1);
    expect(mock.restore).toHaveBeenCalledTimes(1);
    expect(fills.length).toBeGreaterThan(10);

    // Tapping the floating balloon gives a toast
    const balloonMsg = game.tryTap(game.balloonX, game.balloonY - game.balloonZ, 1);
    expect(balloonMsg).toContain('Balloon');

    // Night at KBR Park draws fireflies
    const kbr = game.treasures.find((t) => t.placeId === 'kbr-park')!;
    const { ctx: nCtx, mock: nMock, fills: nFills } = makeMockCtx();
    const nightSim = makeSim({ clock: 3.1, hour: 21, night: 0.9, rain: 0 });
    drawMapLife(nCtx, makeCam({ x: kbr.wx, y: kbr.wy, zoom: 1.5 }), nightSim, game);
    expect(nMock.save).toHaveBeenCalledTimes(1);
    expect(nMock.restore).toHaveBeenCalledTimes(1);
    expect(nFills.length).toBeGreaterThan(0);

    // Nearest uncollected treasure adapts to camera reference position
    const summaryNearKbr = game.getSummary(kbr.wx, kbr.wy);
    expect(summaryNearKbr.nearestUncollected?.id).toBe(kbr.id);
  });
});
