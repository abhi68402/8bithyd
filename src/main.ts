import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import 'pixel-retroui/dist/index.css';
import './ui/styles.css';
import { City } from './world/city';
import { WORLD_W, WORLD_H } from './world/geo';
import { Chunks } from './engine/chunks';
import { Camera } from './engine/camera';
import { Renderer } from './engine/renderer';
import { CityAudio } from './engine/audio';
import { QUALITY } from './engine/quality';
import { Sim } from './sim/sim';
import { Live } from './sim/live';
import { Events } from './sim/events';
import { UI } from './ui/ui';
import { buildSheets } from './art/actors';
import { startBootScreen } from './ui/boot';
import { t, onLang } from './ui/i18n';

const bootReady = startBootScreen();

const $ = (id: string) => document.getElementById(id)!;
const frame = () => new Promise<void>((r) => setTimeout(r, 0));

async function boot() {
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');
  const msg = $('bootMsg'), bar = $('bootBar');
  let said: [string, Record<string, string | number>?] = ['boot.unroll'];
  const say = (key: string, vars?: Record<string, string | number>) => { said = [key, vars]; msg.textContent = t(key, vars); };
  onLang(() => { if (msg.isConnected) say(...said); });
  say('boot.unroll');
  const t0 = performance.now();
  const fonts = Promise.race([
    Promise.all([document.fonts.load('8px Silkscreen'), document.fonts.load('700 16px Silkscreen')]),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
  const city = await City.load();
  const tLoad = performance.now() - t0;
  await fonts;
  bar.style.width = '25%';
  say('boot.drawing', { n: city.buildings.toLocaleString('en-IN') });
  await frame();

  const chunks = new Chunks(city);
  await chunks.buildOverview((f) => { bar.style.width = `${Math.round(25 + f * 75)}%`; });
  const tOverview = performance.now() - t0 - tLoad;
  const sheets = buildSheets(city.metro.map((l) => l.color));
  say('boot.waking');

  city.tileCap = QUALITY.tileCap;
  city.maxFetch = QUALITY.fetches;
  const sim = new Sim(city);
  const live = new Live(sim);
  const events = new Events(city, sim);
  const cam = new Camera();
  const canvas = $('city') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, city, chunks, sim, cam, sheets, events);
  const audio = new CityAudio();
  sim.onFlash = () => audio.thunder();
  cam.attach(canvas);
  live.set(!params.has('game'));
  live.tick();
  const ui = new UI(city, sim, cam, renderer, chunks, live, events, audio);
  window.addEventListener('resize', () => renderer.resize());
  const start = city.places[0];
  if (!ui.fromHash()) {
    // opening move: the whole city, then down to Charminar
    cam.jump(WORLD_W / 2, WORLD_H / 2, 1 / 16);
    cam.flyTo(start.x, start.y / 2 - 20, 2, 3.2);
  } else {
    const p = city.places.find((q) => q.id === location.hash.slice(1))!;
    cam.jump(p.x, p.y / 2 - 20, 2);
  }
  const bootMs = performance.now() - t0;

  // frame statistics (also used by the automated performance sweep)
  const stats = { fps: 0, avg: 0, max: 0, samples: [] as number[], record: false };
  const dbg = $('debug');
  dbg.hidden = !debug;
  let last = performance.now(), acc = 0, n = 0, worst = 0, dbgT = 0;
  let hidden = document.hidden;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; last = performance.now(); });

  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (hidden) return;
    const raw = now - last;
    last = now;
    const dt = Math.min(0.05, raw / 1000);
    const w0 = performance.now();
    cam.update(dt);
    live.tick();
    sim.update(dt, live.on);
    events.update(dt);
    ui.update(dt);
    renderer.draw();
    if (audio.on) {
      let nearMetro = false;
      for (let i = 0; i < sim.trains.length; i++) {
        const tp = sim.trainPos(i, 1);
        if (Math.hypot(tp[0] - cam.x, tp[1] / 2 - cam.y) < 350) { nearMetro = true; break; }
      }
      audio.update(dt, cam.zoom, sim.congestion(2), sim.activity, sim.rain, nearMetro);
    }
    const work = performance.now() - w0;
    if (stats.record) stats.samples.push(raw, work);
    acc += raw; n++; if (raw > worst) worst = raw;
    dbgT += raw;
    if (dbgT > 500) {
      stats.fps = 1000 / (acc / n); stats.avg = acc / n; stats.max = worst;
      if (debug) {
        dbg.textContent = `${stats.fps.toFixed(0)} fps  avg ${stats.avg.toFixed(1)}ms  worst ${worst.toFixed(1)}ms  cpu ${work.toFixed(1)}ms\n` +
          `zoom ${cam.zoom.toFixed(3)}  ${renderer.mode}  chunks ${renderer.visibleChunks} visible / ${chunks.detail.size} detail / ${chunks.coarse.size} coarse  baking ${renderer.pending}\n` +
          `tiles loaded ${city.loadedCount()}  entities ${renderer.drawnEntities}  signals ${sim.signalPos.size}  mmts ${sim.mmts.length}  bakes ${chunks.bakes}  boot ${bootMs.toFixed(0)}ms\n` +
          `${canvas.width}x${canvas.height} @${cam.dpr}x`;
      }
      acc = 0; n = 0; worst = 0; dbgT = 0;
    }
  };
  requestAnimationFrame(loop);
  say('boot.ready');
  bar.style.width = '100%';
  await bootReady();
  $('boot').classList.add('done');
  setTimeout(() => $('boot').remove(), 600);
  (window as unknown as Record<string, unknown>).__hd = { city, chunks, sim, cam, renderer, ui, audio, live, events, stats, bootMs, tLoad, tOverview };
}

boot().catch((e) => {
  console.error(e);
  $('bootMsg').textContent = String(e?.message ?? e).includes('city.json') ? 'Map data is missing. Run "npm run map" first.' : 'Something broke while building the city. Check the console.';
});
