// Procedural Web Audio city soundscape & weather-reactive ambient music: zero external audio assets.
// Stays silent until explicitly enabled by the visitor, then dynamically mixes
// weather-specific ambient music (clear breeze, starry nocturne, overcast drift, misty raga,
// drizzle celesta drops, monsoon lo-fi piano, thunderstorm pulse) with traffic, rain, metro & thunder.

export type WeatherMood = 'clear' | 'night' | 'cloudy' | 'haze' | 'drizzle' | 'rain' | 'storm';

export interface WeatherAudioOpts {
  rainTarget?: number;
  clouds?: number;
  haze?: number;
  storm?: boolean;
  windX?: number;
  night?: number;
}

export interface WeatherMusicProfile {
  mood: WeatherMood;
  label: string;
  scale: readonly number[];
  pattern: readonly number[];
  padMain: readonly [number, number];
  padAlt: readonly [number, number];
  stepSec: number;
  padCutoff: number;
  oscType: OscillatorType;
  attack: number;
  decay: number;
  padVol: number;
  noteVol: number;
  windVol: number;
  windFreq: number;
}

const PROFILES: Record<WeatherMood, Omit<WeatherMusicProfile, 'mood'>> = {
  clear: {
    label: 'Sunny Deccan Breeze',
    scale: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25], // G/C bright pentatonic
    pattern: [0, 2, 4, 5, 4, 2, 3, 6, 5, 4, 2, 1, 0, 4, 5, 7],
    padMain: [196.0, 293.66],
    padAlt: [261.63, 392.0],
    stepSec: 0.36,
    padCutoff: 1180,
    oscType: 'triangle',
    attack: 0.02,
    decay: 0.65,
    padVol: 0.045,
    noteVol: 0.045,
    windVol: 0.015,
    windFreq: 680,
  },
  night: {
    label: 'Starry City Nocturne',
    scale: [196.0, 246.94, 293.66, 329.63, 392.0, 493.88, 587.33], // E minor 9 luminous chimes
    pattern: [0, 2, 4, 3, 5, 4, 2, 1, 0, 3, 4, 6, 4, 3, 2, 0],
    padMain: [164.81, 246.94],
    padAlt: [130.81, 196.0],
    stepSec: 0.56,
    padCutoff: 960,
    oscType: 'sine',
    attack: 0.035,
    decay: 1.05,
    padVol: 0.05,
    noteVol: 0.04,
    windVol: 0.012,
    windFreq: 520,
  },
  cloudy: {
    label: 'Overcast Chill Drift',
    scale: [220.0, 261.63, 329.63, 392.0, 493.88, 523.25, 659.25], // A minor 9
    pattern: [0, 1, 2, 4, 2, 3, 5, 4, 2, 1, 0, 3, 2, 4, 3, 1],
    padMain: [110.0, 261.63],
    padAlt: [174.61, 261.63],
    stepSec: 0.5,
    padCutoff: 820,
    oscType: 'triangle',
    attack: 0.045,
    decay: 0.85,
    padVol: 0.052,
    noteVol: 0.038,
    windVol: 0.028,
    windFreq: 560,
  },
  haze: {
    label: 'Misty Deccan Morning',
    scale: [196.0, 246.94, 293.66, 369.99, 440.0, 493.88, 587.33], // Lydian misty flute swells
    pattern: [0, 2, 3, 4, 5, 4, 2, 1, 3, 4, 6, 4, 3, 2, 1, 0],
    padMain: [146.83, 220.0],
    padAlt: [196.0, 293.66],
    stepSec: 0.72,
    padCutoff: 540,
    oscType: 'sine',
    attack: 0.16,
    decay: 1.3,
    padVol: 0.058,
    noteVol: 0.036,
    windVol: 0.035,
    windFreq: 410,
  },
  drizzle: {
    label: 'Light Drizzle Celesta',
    scale: [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25], // D major pentatonic droplets
    pattern: [0, 4, 2, 5, 3, 6, 4, 2, 1, 4, 5, 3, 2, 5, 4, 1],
    padMain: [146.83, 220.0],
    padAlt: [123.47, 185.0],
    stepSec: 0.35,
    padCutoff: 1120,
    oscType: 'sine',
    attack: 0.01,
    decay: 0.52,
    padVol: 0.042,
    noteVol: 0.044,
    windVol: 0.03,
    windFreq: 740,
  },
  rain: {
    label: 'Monsoon Lo-Fi Drops',
    scale: [174.61, 220.0, 261.63, 329.63, 392.0, 440.0, 523.25], // F Maj7 warm rain piano
    pattern: [0, 2, 3, 4, 5, 4, 2, 1, 0, 3, 5, 6, 4, 3, 2, 1],
    padMain: [174.61, 261.63],
    padAlt: [146.83, 220.0],
    stepSec: 0.42,
    padCutoff: 700,
    oscType: 'triangle',
    attack: 0.025,
    decay: 0.92,
    padVol: 0.055,
    noteVol: 0.046,
    windVol: 0.05,
    windFreq: 590,
  },
  storm: {
    label: 'Thunderstorm Pulse',
    scale: [130.81, 155.56, 174.61, 196.0, 233.08, 261.63, 293.66, 311.13], // C Dorian dramatic swell
    pattern: [0, 3, 4, 1, 0, 4, 5, 3, 2, 4, 6, 3, 1, 4, 7, 4],
    padMain: [98.0, 146.83],
    padAlt: [130.81, 196.0],
    stepSec: 0.48,
    padCutoff: 440,
    oscType: 'triangle',
    attack: 0.03,
    decay: 1.15,
    padVol: 0.068,
    noteVol: 0.048,
    windVol: 0.095,
    windFreq: 460,
  },
};

export function resolveWeatherMood(
  rain: number,
  clouds = 0,
  haze = 0,
  storm = false,
  night = 0,
): WeatherMood {
  if (storm || rain >= 0.88) return 'storm';
  if (rain >= 0.52) return 'rain';
  if (rain >= 0.12) return 'drizzle';
  if (haze >= 0.3) return 'haze';
  if (clouds >= 0.5) return 'cloudy';
  if (night >= 0.45) return 'night';
  return 'clear';
}

export function weatherAudioProfile(
  rain: number,
  clouds = 0,
  haze = 0,
  storm = false,
  night = 0,
): WeatherMusicProfile {
  const mood = resolveWeatherMood(rain, clouds, haze, storm, night);
  return { mood, ...PROFILES[mood] };
}

export class CityAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private trafficGain: GainNode | null = null;
  private metroGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private padOscA: OscillatorNode | null = null;
  private padOscB: OscillatorNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padGain: GainNode | null = null;
  private hornCooldown = 1.5;
  private noteTimer = 0.2;
  private stepIdx = 0;
  on = false;
  currentMood: WeatherMood = 'clear';

  get moodLabel(): string {
    return PROFILES[this.currentMood].label;
  }

  toggle(): boolean {
    if (!this.on) this.start();
    else this.stop();
    return this.on;
  }

  private ensure() {
    if (this.ctx || typeof window === 'undefined') return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // 2-second looping filtered noise buffer shared by rain, city traffic and weather wind
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04;
      data[i] = w * 0.45 + last * 1.8;
    }

    // Rain patter: band-pass noise
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = buf; rainSrc.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass'; rainFilter.frequency.value = 1400; rainFilter.Q.value = 0.6;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainSrc.connect(rainFilter); rainFilter.connect(rainGain); rainGain.connect(master);
    rainSrc.start();
    this.rainGain = rainGain;

    // Atmospheric weather wind: sweeping bandpass noise driven by windX, haze & storm intensity
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf; windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass'; windFilter.frequency.value = 540; windFilter.Q.value = 1.1;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
    windSrc.start();
    this.windFilter = windFilter;
    this.windGain = windGain;

    // Distant street hum: low-pass brown-ish noise
    const trafSrc = ctx.createBufferSource();
    trafSrc.buffer = buf; trafSrc.loop = true;
    const trafFilter = ctx.createBiquadFilter();
    trafFilter.type = 'lowpass'; trafFilter.frequency.value = 260;
    const trafGain = ctx.createGain();
    trafGain.gain.value = 0;
    trafSrc.connect(trafFilter); trafFilter.connect(trafGain); trafGain.connect(master);
    trafSrc.start();
    this.trafficGain = trafGain;

    // Metro rail whoosh: warm mid-low resonance
    const metroOsc = ctx.createOscillator();
    metroOsc.type = 'triangle'; metroOsc.frequency.value = 72;
    const metroGain = ctx.createGain();
    metroGain.gain.value = 0;
    metroOsc.connect(metroGain); metroGain.connect(master);
    metroOsc.start();
    this.metroGain = metroGain;

    // Weather-adaptive ambient music bus + warm twin harmonic pad
    const musicBus = ctx.createGain();
    musicBus.gain.value = 0.9;
    musicBus.connect(master);
    this.musicBus = musicBus;

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 1000; padFilter.Q.value = 0.5;
    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    padFilter.connect(padGain); padGain.connect(musicBus);

    const padOscA = ctx.createOscillator();
    const padOscB = ctx.createOscillator();
    padOscA.type = 'triangle'; padOscA.frequency.value = 196;
    padOscB.type = 'sine'; padOscB.frequency.value = 293.66;
    padOscA.connect(padFilter);
    padOscB.connect(padFilter);
    padOscA.start();
    padOscB.start();

    this.padOscA = padOscA;
    this.padOscB = padOscB;
    this.padFilter = padFilter;
    this.padGain = padGain;
  }

  private start() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.on = true;
    this.noteTimer = 0.18;
    this.master.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.25);
    this.blip(580, 0.04);
  }

  private stop() {
    this.on = false;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
  }

  /** Update continuous city ambience and weather-specific ambient music. */
  update(
    dt: number,
    zoom: number,
    congestion: number,
    activity: number,
    rain: number,
    nearMetro: boolean,
    weather?: WeatherAudioOpts,
  ) {
    const musicRain = weather?.rainTarget ?? rain;
    const clouds = weather?.clouds ?? 0;
    const haze = weather?.haze ?? 0;
    const storm = weather?.storm ?? false;
    const windMag = Math.abs(weather?.windX ?? 0);
    const night = weather?.night ?? 0;

    const prof = weatherAudioProfile(musicRain, clouds, haze, storm, night);
    this.currentMood = prof.mood;

    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    const detail = Math.min(1, Math.max(0, (zoom - 0.3) / 1.4));
    const musicDuck = 1 - detail * 0.18; // slightly airier over the city skyline, cozy in street view

    const trafTarget = detail * (0.04 + congestion * 0.12) * activity;
    this.trafficGain?.gain.setTargetAtTime(trafTarget, now, 0.3);
    this.rainGain?.gain.setTargetAtTime(rain * (0.06 + detail * 0.14), now, 0.25);
    this.metroGain?.gain.setTargetAtTime(nearMetro && zoom >= 0.7 ? 0.045 : 0, now, 0.2);

    const windTarget = (prof.windVol + windMag * 0.025) * (0.85 + 0.15 * Math.sin(now * 0.45));
    this.windGain?.gain.setTargetAtTime(windTarget, now, 0.45);
    this.windFilter?.frequency.setTargetAtTime(prof.windFreq + windMag * 180 + Math.sin(now * 0.3) * 70, now, 0.5);

    const altChord = ((this.stepIdx >> 3) & 1) === 1;
    const [fA, fB] = altChord ? prof.padAlt : prof.padMain;
    this.padOscA?.frequency.setTargetAtTime(fA, now, 0.65);
    this.padOscB?.frequency.setTargetAtTime(fB, now, 0.65);
    this.padFilter?.frequency.setTargetAtTime(prof.padCutoff, now, 0.65);
    this.padGain?.gain.setTargetAtTime(prof.padVol * musicDuck, now, 0.55);

    this.noteTimer -= dt;
    if (this.noteTimer <= 0) {
      const rest = (this.stepIdx % 5 === 4) || (prof.mood === 'haze' && this.stepIdx % 3 === 2);
      if (!rest) {
        const degree = prof.pattern[this.stepIdx % prof.pattern.length];
        const freq = prof.scale[degree % prof.scale.length];
        this.playWeatherNote(prof, freq, musicDuck);
      }
      this.stepIdx = (this.stepIdx + 1) % 64;
      this.noteTimer = prof.stepSec + (rest ? prof.stepSec * 0.35 : 0);
    }

    this.hornCooldown -= dt * (0.5 + congestion * 1.8) * activity;
    if (this.hornCooldown <= 0) {
      this.hornCooldown = 2.2 + Math.random() * 5.5;
      if (zoom >= 0.85 && congestion > 0.18 && Math.random() < 0.75) this.horn();
    }
  }

  private playWeatherNote(prof: WeatherMusicProfile, freq: number, scaleVol: number) {
    if (!this.on || !this.ctx || !this.musicBus) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = prof.oscType;
    osc.frequency.setValueAtTime(freq, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(3400, prof.padCutoff * 2.1), t);

    const peak = prof.noteVol * scaleVol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + prof.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + prof.attack + prof.decay);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + prof.attack + prof.decay + 0.05);
  }

  /** Occasional soft distant auto-rickshaw / scooter horn chirp. */
  private horn() {
    if (!this.on || !this.ctx || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    const base = 390 + Math.random() * 240;
    osc.type = Math.random() < 0.5 ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.setValueAtTime(base * 1.03, t + 0.06);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 1100;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.028, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(filter); filter.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.16);
  }

  /** Soft thunder rumble when monsoon lightning flashes. */
  thunder() {
    if (!this.on || !this.ctx || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(68, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 1.6);
  }

  /** Crisp UI click or tap feedback. */
  blip(freq = 520, vol = 0.03) {
    if (!this.on || !this.ctx || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.05);
  }

  /** Cheerful 3-note chime when stamping a new landmark in the Passport. */
  stampChime() {
    if (!this.on || !this.ctx || !this.master) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, idx) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      const t = t0 + idx * 0.075;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g); g.connect(this.master!);
      osc.start(t); osc.stop(t + 0.24);
    });
  }
}
