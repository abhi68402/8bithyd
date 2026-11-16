// Live Hyderabad mode: the city follows the real one. Local time and the day's
// real sunrise/sunset are computed here; current weather comes from the free
// Open-Meteo API (no key, no personal data: only Hyderabad's coordinates).
import type { Sim } from './sim';

const LAT = 17.385, LON = 78.4867;
const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,precipitation,weather_code,cloud_cover&timezone=Asia%2FKolkata`;

/** Sunrise and sunset in IST hours for a given date. */
export function sunTimes(date: Date): [number, number] {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const n = Math.floor((date.getTime() + 5.5 * 3600e3 - start) / 86400e3);
  const rad = Math.PI / 180;
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (n + 10));
  const b = rad * (360 / 365) * (n - 81);
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // minutes
  const cosw = -Math.tan(LAT * rad) * Math.tan(decl * rad);
  const half = Math.acos(Math.max(-1, Math.min(1, cosw))) / rad / 15; // hours
  const noon = 12 + ((82.5 - LON) * 4) / 60 - eot / 60;
  return [noon - half, noon + half];
}

export function describeWeather(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Sleet';
  if (code <= 82) return 'Showers';
  return 'Thunderstorm';
}
const isWet = (code: number, mm: number) => mm > 0.05 || (code >= 51 && code <= 67) || (code >= 80 && code <= 99);

export class Live {
  on = true;
  temp: number | null = null;
  desc = '';
  failed = false;
  private nextFetch = 0;

  constructor(private sim: Sim) {}

  set(on: boolean) {
    this.on = on;
    this.sim.autoWeather = !on;
    if (!on) { this.sim.sunrise = 6.1; this.sim.sunset = 18.3; }
    else this.nextFetch = 0;
  }

  /** Call every frame while live. */
  tick() {
    if (!this.on) return;
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 3600e3);
    const s = this.sim;
    s.time = ist.getUTCHours() * 60 + ist.getUTCMinutes() + ist.getUTCSeconds() / 60;
    s.weekday = ist.getUTCDay();
    [s.sunrise, s.sunset] = sunTimes(now);
    if (now.getTime() > this.nextFetch) {
      this.nextFetch = now.getTime() + 10 * 60e3;
      fetch(WEATHER_URL)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => {
          const c = j.current;
          this.temp = Math.round(c.temperature_2m);
          this.desc = describeWeather(c.weather_code);
          this.failed = false;
          if (this.on) s.setRain(isWet(c.weather_code, c.precipitation));
        })
        .catch(() => { this.failed = true; this.nextFetch = now.getTime() + 60e3; });
    }
  }

  get label(): string {
    if (this.failed && this.temp === null) return 'LIVE · WEATHER OFFLINE';
    if (this.temp === null) return 'LIVE · CHECKING SKY';
    return `LIVE · ${this.temp}°C · ${this.desc.toUpperCase()}`;
  }
}
