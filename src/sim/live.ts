// Live Hyderabad mode: the city follows the real one. Local time and the day's
// real sunrise/sunset are computed here; current weather and air quality come
// from the free Open-Meteo APIs (no key, no personal data: only Hyderabad's coordinates).
import type { Sim } from './sim';

const LAT = 17.385, LON = 78.4867;
const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=Asia%2FKolkata`;
const AQI_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=us_aqi,pm2_5&timezone=Asia%2FKolkata`;

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
  aqi: number | null = null;
  pm25: number | null = null;
  desc = '';
  failed = false;
  fetching = false;
  private nextFetch = 0;

  constructor(private sim: Sim) {}

  set(on: boolean) {
    this.on = on;
    if (!on) {
      this.sim.sunrise = 6.1;
      this.sim.sunset = 18.3;
      this.sim.autoWeather = !this.weatherLive;
    } else {
      this.weatherLive = true;
      this.weatherPreset = 'live';
      this.sim.autoWeather = false;
      this.nextFetch = 0;
    }
  }

  setWeatherPreset(preset: WeatherPreset) {
    this.weatherPreset = preset;
    if (preset === 'live') {
      this.weatherLive = true;
      this.sim.autoWeather = false;
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
    this.fetchNow();
  }

  private fetchNow() {
    if (this.fetching) return;
    this.fetching = true;
    this.nextFetch = Date.now() + 5 * 60e3;
    Promise.all([
      fetch(WEATHER_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      fetch(AQI_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([wj, aj]) => {
        const c = wj.current;
        this.temp = Math.round(c.temperature_2m);
        this.feelsLike = c.apparent_temperature != null ? Math.round(c.apparent_temperature) : this.temp;
        this.humidity = c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) : null;
        this.windSpeed = c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null;
        this.windDir = c.wind_direction_10m != null ? Math.round(c.wind_direction_10m) : null;
        this.cloudPct = c.cloud_cover != null ? Math.round(c.cloud_cover) : null;
        this.desc = describeWeather(c.weather_code);
        this.failed = false;

        if (aj?.current) {
          this.aqi = aj.current.us_aqi != null ? Math.round(aj.current.us_aqi) : this.aqi;
          this.pm25 = aj.current.pm2_5 != null ? Math.round(aj.current.pm2_5 * 10) / 10 : this.pm25;
        }

        if (this.weatherLive) {
          const clouds = c.cloud_cover != null ? Math.min(1, Math.max(0, c.cloud_cover / 100)) : 0.25;
          const [rt, cl, hz, st, wx] = mapWeather(
            c.weather_code,
            c.precipitation ?? 0,
            clouds,
            this.windSpeed ?? 10,
            this.windDir ?? 90,
            this.aqi,
          );
          this.sim.setWeather(rt, cl, hz, st, wx);
        }
      })
      .catch(() => { this.failed = true; this.nextFetch = Date.now() + 60e3; })
      .finally(() => { this.fetching = false; });
  }

  /** Call every frame while live. */
  tick() {
    const now = new Date();
    if (this.on) {
      const ist = new Date(now.getTime() + 5.5 * 3600e3);
      const s = this.sim;
      s.time = ist.getUTCHours() * 60 + ist.getUTCMinutes() + ist.getUTCSeconds() / 60;
      s.weekday = ist.getUTCDay();
      [s.sunrise, s.sunset] = sunTimes(now);
    }
    if ((this.on || this.weatherLive) && now.getTime() > this.nextFetch) {
      this.fetchNow();
    }
  }

  get activeDesc(): string {
    if (this.weatherPreset !== 'live') return PRESET_MAP[this.weatherPreset].desc;
    if (this.desc) return this.desc;
    return this.sim.rain > 0.4 ? 'Rain' : this.sim.cloudCover > 0.7 ? 'Overcast' : 'Clear';
  }

  get label(): string {
    if (this.weatherPreset !== 'live') return `SKY · ${this.activeDesc.toUpperCase()}`;
    if (this.failed && this.temp === null) return 'LIVE · WEATHER OFFLINE';
    if (this.temp === null) return 'LIVE · CHECKING SKY';
    const aqiPart = this.aqi !== null ? ` · AQI ${this.aqi}` : '';
    return `LIVE · ${this.temp}°C · ${this.desc.toUpperCase()}${aqiPart}`;
  }
}
