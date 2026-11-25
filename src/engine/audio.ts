// Procedural Web Audio city soundscape: zero external audio assets.
// Stays silent until explicitly enabled by the visitor, then dynamically
// mixes street hum, occasional distant horn chirps, rain patter, thunder,
// metro rumble, and crisp UI/stamp chimes.
export class CityAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private trafficGain: GainNode | null = null;
  private metroGain: GainNode | null = null;
  private hornCooldown = 1.5;
  on = false;

  toggle(): boolean {
    if (!this.on) this.start();
    else this.stop();
    return this.on;
  }

  private ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // 2-second looping filtered noise buffer shared by rain and city traffic
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
  }

  private start() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.on = true;
    this.master.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.25);
    this.blip(580, 0.04);
  }

  private stop() {
    this.on = false;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
  }

  /** Update continuous ambience from zoom, traffic congestion, rain and nearby trains. */
  update(dt: number, zoom: number, congestion: number, activity: number, rain: number, nearMetro: boolean) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    const detail = Math.min(1, Math.max(0, (zoom - 0.3) / 1.4));
    const trafTarget = detail * (0.04 + congestion * 0.12) * activity;
    this.trafficGain?.gain.setTargetAtTime(trafTarget, now, 0.3);
    this.rainGain?.gain.setTargetAtTime(rain * (0.06 + detail * 0.14), now, 0.25);
    this.metroGain?.gain.setTargetAtTime(nearMetro && zoom >= 0.7 ? 0.045 : 0, now, 0.2);

    this.hornCooldown -= dt * (0.5 + congestion * 1.8) * activity;
    if (this.hornCooldown <= 0) {
      this.hornCooldown = 2.2 + Math.random() * 5.5;
      if (zoom >= 0.85 && congestion > 0.18 && Math.random() < 0.75) this.horn();
    }
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
