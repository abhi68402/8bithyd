// Live Hyderabad mode: the city follows the real one. Local time and the day's
// real sunrise/sunset are computed here; current weather and air quality come
// from the free Open-Meteo APIs (no key, no personal data: only Hyderabad's coordinates).
import type { Sim } from './sim';

const LAT = 17.385, LON = 78.4867;
const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=Asia%2FKolkata`;
const AQI_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=us_aqi,pm2_5,pm10,european_aqi&timezone=Asia%2FKolkata`;
const REFRESH_MS = 5 * 60e3;
const RETRY_MS = 60e3;

export type WeatherPreset = 'live' | 'clear' | 'cloudy' | 'haze' | 'drizzle' | 'rain' | 'storm';

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

export function describeAqi(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Hazy';
  if (aqi <= 200) return 'Unhealthy';
  return 'Heavy haze';
}

/** Green / gold / orange / red color on the US AQI scale. */
export function aqiColorFor(aqi: number | null): string {
  if (aqi === null) return '#d4cce3';
  if (aqi <= 50) return '#4cd964';
  if (aqi <= 100) return '#ffcc33';
  if (aqi <= 150) return '#ff8c38';
  return '#ff4d4d';
}

function formatIstTime(date: Date): string {
  const ist = new Date(date.getTime() + 5.5 * 3600e3);
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const windCompass = (deg: number) => COMPASS[Math.round((deg % 360) / 45) & 7];

function mapWeather(
  code: number,
  mm: number,
  clouds: number,
  windKmh: number,
  windDeg: number,
  aqi: number | null,
): [number, number, number, boolean, number] {
  const windX = Math.max(-1.2, Math.min(1.2, -Math.sin((windDeg * Math.PI) / 180) * (0.25 + windKmh / 24)));
  const storm = code >= 95;
  const fogHaze = code >= 45 && code <= 48 ? 0.45 : 0;
  const aqiHaze = aqi != null ? Math.min(0.65, Math.max(0, (aqi - 55) / 220)) : 0;
  const baseHaze = Math.max(fogHaze, aqiHaze);
  if (storm) return [1, Math.max(0.9, clouds), Math.max(0.25, baseHaze), true, windX];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82) || mm >= 1.5) return [0.78, Math.max(0.8, clouds), Math.max(0.14, baseHaze), false, windX];
  if ((code >= 51 && code <= 57) || mm > 0.05) return [0.38, Math.max(0.65, clouds), Math.max(0.1, baseHaze), false, windX];
  return [0, clouds, Math.max(clouds > 0.7 ? 0.08 : 0.02, baseHaze), false, windX];
}

const PRESET_MAP: Record<Exclude<WeatherPreset, 'live'>, { desc: string; args: [number, number, number, boolean, number] }> = {
  clear: { desc: 'Clear', args: [0, 0.12, 0, false, 0.2] },
  cloudy: { desc: 'Overcast', args: [0, 0.85, 0.08, false, 0.35] },
  haze: { desc: 'Fog', args: [0, 0.55, 0.62, false, 0.15] },
  drizzle: { desc: 'Drizzle', args: [0.4, 0.75, 0.12, false, 0.45] },
  rain: { desc: 'Rain', args: [0.8, 0.9, 0.18, false, 0.65] },
  storm: { desc: 'Thunderstorm', args: [1, 0.98, 0.28, true, 0.95] },
};

async function fetchJson(url: string, signal?: AbortSignal) {
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export class Live {
  on = true;
  weatherLive = true;
  weatherPreset: WeatherPreset = 'live';
  temp: number | null = null;
  feelsLike: number | null = null;
  humidity: number | null = null;
  windSpeed: number | null = null;
  windDir: number | null = null;
  cloudPct: number | null = null;
  precipMm: number | null = null;
  aqi: number | null = null;
  euAqi: number | null = null;
  pm25: number | null = null;
  pm10: number | null = null;
  lastUpdatedAt: string | null = null;
  desc = '';
  failed = false;
  aqiFailed = false;
  fetching = false;
  private nextFetch = 0;
  private fetchId = 0;
  private fetchStartedAt = 0;
  private abortCtrl: AbortController | null = null;
  private lastWeatherInput: { code: number; mm: number; clouds: number; windKmh: number; windDeg: number } | null = null;

  constructor(private sim: Sim) {
    // In browser runtime, begin fetching live weather & AQI immediately on boot
    // regardless of whether the live IST clock starts enabled.
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      this.fetchNow();
    }
  }

  /** Toggle live IST clock & sun times independently of live weather sync. */
  set(on: boolean) {
    this.on = on;
    this.sim.autoWeather = false;
    if (!on) {
      this.sim.sunrise = 6.1;
      this.sim.sunset = 18.3;
    }
  }

  setWeatherPreset(preset: WeatherPreset) {
    this.weatherPreset = preset;
    if (preset === 'live') {
      this.weatherLive = true;
      this.sim.autoWeather = false;
      this.applyLiveWeather();
      this.nextFetch = 0;
      this.fetchNow();
      return;
    }
    this.weatherLive = false;
    this.sim.autoWeather = false;
    this.sim.setWeather(...PRESET_MAP[preset].args);
  }

  refreshWeather() {
    this.nextFetch = 0;
    this.fetchNow(true);
  }

  private applyLiveWeather() {
    if (!this.weatherLive || !this.lastWeatherInput) return;
    const { code, mm, clouds, windKmh, windDeg } = this.lastWeatherInput;
    const [rt, cl, hz, st, wx] = mapWeather(code, mm, clouds, windKmh, windDeg, this.aqi);
    this.sim.setWeather(rt, cl, hz, st, wx);
  }

  private fetchNow(force = false) {
    if (typeof fetch !== 'function') return;
    const now = Date.now();
    if (this.fetching) {
      // Avoid duplicate requests when setWeatherPreset('live') + refreshWeather() run together,
      // while allowing manual retries if an older request is stalled.
      if (!force || now - this.fetchStartedAt < 2000) return;
      this.abortCtrl?.abort();
    }

    const id = ++this.fetchId;
    this.abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const signal = this.abortCtrl?.signal;
    this.fetching = true;
    this.fetchStartedAt = now;
    this.nextFetch = now + REFRESH_MS;

    Promise.allSettled([
      fetchJson(WEATHER_URL, signal),
      fetchJson(AQI_URL, signal),
    ])
      .then(([wRes, aRes]) => {
        if (id !== this.fetchId) return;

        let gotAny = false;
        if (wRes.status === 'fulfilled' && wRes.value?.current) {
          const c = wRes.value.current;
          this.temp = Math.round(c.temperature_2m);
          this.feelsLike = c.apparent_temperature != null ? Math.round(c.apparent_temperature) : this.temp;
          this.humidity = c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) : null;
          this.windSpeed = c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null;
          this.windDir = c.wind_direction_10m != null ? Math.round(c.wind_direction_10m) : null;
          this.cloudPct = c.cloud_cover != null ? Math.round(c.cloud_cover) : null;
          this.precipMm = c.precipitation != null ? Math.round(c.precipitation * 10) / 10 : null;
          this.desc = describeWeather(c.weather_code);
          this.failed = false;
          gotAny = true;

          const clouds = c.cloud_cover != null ? Math.min(1, Math.max(0, c.cloud_cover / 100)) : 0.25;
          this.lastWeatherInput = {
            code: c.weather_code,
            mm: c.precipitation ?? 0,
            clouds,
            windKmh: this.windSpeed ?? 10,
            windDeg: this.windDir ?? 90,
          };
        } else {
          this.failed = true;
        }

        if (aRes.status === 'fulfilled' && aRes.value?.current) {
          const ac = aRes.value.current;
          this.aqi = ac.us_aqi != null ? Math.round(ac.us_aqi) : this.aqi;
          this.euAqi = ac.european_aqi != null ? Math.round(ac.european_aqi) : this.euAqi;
          this.pm25 = ac.pm2_5 != null ? Math.round(ac.pm2_5 * 10) / 10 : this.pm25;
          this.pm10 = ac.pm10 != null ? Math.round(ac.pm10 * 10) / 10 : this.pm10;
          this.aqiFailed = false;
          gotAny = true;
        } else {
          this.aqiFailed = true;
        }

        if (gotAny) {
          this.lastUpdatedAt = formatIstTime(new Date());
          this.applyLiveWeather();
        }

        if (this.failed || (this.aqiFailed && this.aqi === null)) {
          this.nextFetch = Date.now() + RETRY_MS;
        }
      })
      .catch(() => {
        if (id !== this.fetchId) return;
        this.failed = true;
        this.aqiFailed = true;
        this.nextFetch = Date.now() + RETRY_MS;
      })
      .finally(() => {
        if (id !== this.fetchId) return;
        this.fetching = false;
        this.abortCtrl = null;
      });
  }

  /** Call every frame while live or syncing Hyderabad weather. */
  tick() {
    const now = new Date();
    if (this.on) {
      const ist = new Date(now.getTime() + 5.5 * 3600e3);
      const s = this.sim;
      s.time = ist.getUTCHours() * 60 + ist.getUTCMinutes() + ist.getUTCSeconds() / 60;
      s.weekday = ist.getUTCDay();
      [s.sunrise, s.sunset] = sunTimes(now);
    }
    if ((this.on || this.weatherLive || this.lastUpdatedAt !== null) && now.getTime() >= this.nextFetch) {
      this.fetchNow();
    }
  }

  get aqiLabel(): string {
    if (this.aqi !== null) return describeAqi(this.aqi);
    if ((this.failed || this.aqiFailed) && !this.fetching) return 'Offline · Tap ↻';
    return 'Fetching...';
  }

  get aqiColor(): string {
    return aqiColorFor(this.aqi);
  }

  get activeDesc(): string {
    if (this.weatherPreset !== 'live') return PRESET_MAP[this.weatherPreset].desc;
    if (this.desc) return this.desc;
    if (this.failed && !this.fetching) return 'Offline · Tap ↻';
    return 'Fetching...';
  }

  get label(): string {
    if (this.weatherPreset !== 'live') return `SKY · ${this.activeDesc.toUpperCase()}`;
    if (this.failed && this.temp === null && !this.fetching) return 'Offline · Tap ↻';
    if (this.temp === null) return 'Fetching...';
    const aqiPart = this.aqi !== null ? ` · AQI ${this.aqi}` : '';
    return `LIVE · ${this.temp}°C · ${this.desc.toUpperCase()}${aqiPart}`;
  }
}
