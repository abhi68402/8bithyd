import React, { useEffect, useRef, useState } from 'react';
import { Button, Card } from 'pixel-retroui';
import { aqiColorFor, describeAqi, type WeatherPreset } from '../sim/live';
import { PixelIcon, type IconName } from './PixelIcon';
import './skyPanel.css';

const PANEL = '#1b1626';
const PANEL_ALT = '#28213a';
const BORDER = '#5a4d7a';
const CREAM = '#f7efe0';
const TEAL = '#2dd4bf';
const MARIGOLD = '#f0a030';
const MARIGOLD_INK = '#1b1626';
const ROSE = '#e0524c';
const NO_SHADOW = 'transparent';

const WEATHER_PRESETS: { id: WeatherPreset; label: string; desc: string; icon: IconName }[] = [
  { id: 'live', label: 'Live Hyderabad', desc: 'Real-time Open-Meteo', icon: 'refresh' },
  { id: 'clear', label: 'Clear Sky', desc: 'Sunny Deccan skies', icon: 'sun' },
  { id: 'cloudy', label: 'Overcast', desc: 'Drifting cloud cover', icon: 'cloud' },
  { id: 'haze', label: 'Deccan Haze', desc: 'Soft morning mist', icon: 'haze' },
  { id: 'drizzle', label: 'Light Drizzle', desc: 'Gentle city showers', icon: 'rain' },
  { id: 'rain', label: 'Monsoon Rain', desc: 'Heavy rain & puddles', icon: 'rain' },
  { id: 'storm', label: 'Thunderstorm', desc: 'Lightning & thunder', icon: 'storm' },
];

export interface SkyPanelState {
  timeStr: string;
  dayLine: string;
  liveOn: boolean;
  speed: number;
  minutes: number;
  weatherPreset: WeatherPreset;
  weatherLabel: string;
  weatherCondition: string;
  weatherTemp: number | null;
  weatherFeels: number | null;
  weatherHumidity: number | null;
  weatherWind: string;
  weatherClouds: number | null;
  weatherPrecipMm?: number | null;
  weatherAqi: number | null;
  weatherEuAqi?: number | null;
  weatherPm25?: number | null;
  weatherPm10?: number | null;
  weatherLastUpdatedAt?: string | null;
  weatherAqiLabel?: string;
  weatherAqiColor?: string;
  weatherAqiFailed?: boolean;
  weatherFetching: boolean;
  weatherFailed: boolean;
  labelsOn: boolean;
  soundOn: boolean;
  soundMood?: string;
}

export interface SkyPanelActions {
  setLive: (on: boolean) => void;
  setSpeed: (speed: number) => void;
  scrubTime: (minutes: number, done?: boolean) => void;
  setWeatherPreset: (preset: WeatherPreset) => void;
  refreshWeather: () => void;
  toggleSigns: () => void;
  toggleSound: () => void;
}

export interface SkyPanelProps {
  open: boolean;
  onToggleOpen: () => void;
  onClose?: () => void;
  state: SkyPanelState;
  actions: SkyPanelActions;
  className?: string;
}

function skyIconFor(condition: string, minutes: number): IconName {
  const c = condition.toLowerCase();
  if (c.includes('thunder')) return 'storm';
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return 'rain';
  if (c.includes('fog') || c.includes('haze')) return 'haze';
  if (c.includes('cloud') || c.includes('overcast')) return 'cloud';
  const hr = minutes / 60;
  return hr < 6 || hr >= 18.5 ? 'moon' : 'sun';
}

export const SkyPanel: React.FC<SkyPanelProps> = ({
  open,
  onToggleOpen,
  onClose,
  state,
  actions,
  className = '',
}) => {
  const [skyPickerOpen, setSkyPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const closeAll = () => {
    setSkyPickerOpen(false);
    if (onClose) onClose();
    else if (open) onToggleOpen();
  };

  useEffect(() => {
    if (!open) {
      setSkyPickerOpen(false);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closeAll();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (skyPickerOpen) setSkyPickerOpen(false);
      else closeAll();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, skyPickerOpen]);

  const wxIcon = skyIconFor(state.weatherCondition, state.minutes);
  const activeWeatherLabel = WEATHER_PRESETS.find((w) => w.id === state.weatherPreset)?.label ?? 'Live Hyderabad';

  const isWeatherOffline = state.weatherFailed && !state.weatherFetching;
  const isAqiOffline = (state.weatherAqiFailed ?? state.weatherFailed) && !state.weatherFetching;

  const aqiVal = state.weatherAqi;
  const aqiColor = state.weatherAqiColor ?? aqiColorFor(aqiVal);
  const aqiLabel = state.weatherAqiLabel ?? (aqiVal !== null ? describeAqi(aqiVal) : isAqiOffline ? 'Offline · Tap ↻' : 'Fetching...');

  const pm25Text = state.weatherPm25 != null ? `${state.weatherPm25} µg/m³` : '—';
  const pm10Text = state.weatherPm10 != null ? `${state.weatherPm10} µg/m³` : '—';

  const pillConditionText = state.weatherTemp !== null
    ? state.weatherCondition
    : isWeatherOffline
      ? 'Offline · Tap ↻'
      : 'Fetching...';

  const syncStatusText = state.weatherFetching && !state.weatherLastUpdatedAt
    ? 'Fetching...'
    : isWeatherOffline
      ? 'Offline · Tap ↻'
      : state.weatherLastUpdatedAt
        ? `Synced ${state.weatherLastUpdatedAt}`
        : state.weatherTemp !== null
          ? 'Live'
          : 'Fetching...';

  const weatherHeadline = state.weatherTemp !== null
    ? state.weatherLabel
    : isWeatherOffline
      ? 'Offline · Tap ↻'
      : 'Fetching...';

  return (
    <div ref={wrapRef} className={`sp-root ${className}`.trim()}>
      <Button
        id="skyBtn"
        className="sp-pill"
        bg={open ? PANEL_ALT : PANEL}
        textColor={CREAM}
        borderColor={open ? MARIGOLD : BORDER}
        shadow={NO_SHADOW}
        title="Open Time, Live Weather, AQI & Audio settings"
        aria-expanded={open}
        onClick={onToggleOpen}
      >
        {state.liveOn && <span className="sp-live-dot" title="Live IST Time" />}
        <span className="sp-pill-time">{state.timeStr}</span>
        <span className="sp-pill-wx">
          <PixelIcon name={wxIcon} size={15} color={isWeatherOffline && state.weatherTemp === null ? ROSE : TEAL} />
          {state.weatherTemp !== null && <span>{state.weatherTemp}°C</span>}
          <span className="sp-pill-wx-text">{pillConditionText}</span>
        </span>
        <span className="sp-pill-caret">{open ? '▲' : '▼'}</span>
      </Button>

      {open && (
        <Card className="sp-popover" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
          {/* Header: Digital IST Clock + Close */}
          <div className="sp-pop-head">
            <div>
              <div className="sp-pop-time">{state.timeStr}</div>
              <div className="sp-pop-day sp-ui-text">{state.dayLine}</div>
            </div>
            <Button
              className="sp-small-btn"
              bg={PANEL_ALT}
              textColor={CREAM}
              borderColor={BORDER}
              shadow={NO_SHADOW}
              aria-label="Close Sky panel"
              onClick={closeAll}
            >
              <PixelIcon name="close" size={12} />
            </Button>
          </div>

          {/* Item 5: Prominent Color-Coded Hyderabad AQI Banner */}
          <div className="sp-aqi-card" style={{ borderLeftColor: aqiColor }}>
            <div className="sp-aqi-top">
              <div className="sp-aqi-badge">
                <span className="sp-aqi-dot" style={{ backgroundColor: aqiColor }} aria-hidden="true" />
                {aqiVal !== null ? (
                  <span className="sp-aqi-title" style={{ color: aqiColor }}>
                    AQI {aqiVal} · {aqiLabel}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`sp-aqi-status-btn${isAqiOffline ? ' offline' : ''}`}
                    onClick={actions.refreshWeather}
                  >
                    AQI · {isAqiOffline ? 'Offline · Tap ↻' : 'Fetching...'}
                  </button>
                )}
              </div>
              <span className="sp-aqi-tag">
                {state.weatherEuAqi != null ? `EU ${state.weatherEuAqi}` : 'HYD AIR'}
              </span>
            </div>
            <div className="sp-aqi-pm sp-ui-text">
              <span>PM2.5 <b>{pm25Text}</b></span>
              <span className="sp-aqi-sep" aria-hidden="true">·</span>
              <span>PM10 <b>{pm10Text}</b></span>
            </div>
          </div>

          {/* Item 5: Live Weather Telemetry & Sky Mode Controls */}
          <div className="sp-weather-panel">
            <div className="sp-weather-head">
              <span className={`sp-weather-main${isWeatherOffline && state.weatherTemp === null ? ' offline' : ''}`}>
                <PixelIcon name={wxIcon} size={16} color={isWeatherOffline && state.weatherTemp === null ? ROSE : TEAL} />
                <span>{weatherHeadline}</span>
              </span>
              <button
                type="button"
                className={`sp-sync-badge sp-ui-text${isWeatherOffline ? ' offline' : ''}`}
                title="Refresh live Hyderabad weather & AQI"
                onClick={actions.refreshWeather}
              >
                {syncStatusText}
              </button>
            </div>

            <div className="sp-weather-grid sp-ui-text">
              <span>
                Temp{' '}
                <b>
                  {state.weatherTemp !== null
                    ? `${state.weatherTemp}°C`
                    : isWeatherOffline
                      ? 'Offline · Tap ↻'
                      : 'Fetching...'}
                </b>
              </span>
              <span>
                Feels like <b>{state.weatherFeels !== null ? `${state.weatherFeels}°C` : '—'}</b>
              </span>
              <span>
                Humidity <b>{state.weatherHumidity !== null ? `${state.weatherHumidity}%` : '—'}</b>
              </span>
              <span>
                Wind <b>{state.weatherWind || '—'}</b>
              </span>
              <span>
                Clouds <b>{state.weatherClouds !== null ? `${state.weatherClouds}%` : '—'}</b>
              </span>
              <span>
                Precip <b>{state.weatherPrecipMm != null ? `${state.weatherPrecipMm} mm` : '—'}</b>
              </span>
            </div>

            <div className="sp-weather-controls">
              <Button
                className={`sp-sky-trigger${skyPickerOpen ? ' open' : ''}`}
                bg={state.weatherPreset === 'live' ? '#133131' : MARIGOLD}
                textColor={state.weatherPreset === 'live' ? TEAL : MARIGOLD_INK}
                borderColor={skyPickerOpen ? MARIGOLD : BORDER}
                shadow={NO_SHADOW}
                aria-expanded={skyPickerOpen}
                aria-controls="sp-sky-flyout"
                onClick={() => setSkyPickerOpen((v) => !v)}
              >
                <span className="sp-sky-trigger-arrow" aria-hidden="true">{skyPickerOpen ? '▶' : '◀'}</span>
                <span className="sp-sky-trigger-label">Sky: {activeWeatherLabel}</span>
              </Button>

              <Button
                className="sp-small-btn sp-refresh-btn"
                title="Refresh live weather & AQI"
                aria-label="Refresh live weather and AQI"
                bg={PANEL_ALT}
                textColor={CREAM}
                borderColor={isWeatherOffline || isAqiOffline ? ROSE : BORDER}
                shadow={NO_SHADOW}
                onClick={actions.refreshWeather}
              >
                <PixelIcon name="refresh" size={14} color={state.weatherFetching ? MARIGOLD : CREAM} />
              </Button>
            </div>

            {/* Item 4 Fix: Sideways-LEFT flyout on desktop (>=680px), inline 2-col drawer on mobile (<680px) */}
            {skyPickerOpen && (
              <Card
                className="sp-flyout"
                bg={PANEL}
                textColor={CREAM}
                borderColor={MARIGOLD}
                shadowColor={NO_SHADOW}
              >
                <div
                  id="sp-sky-flyout"
                  role="region"
                  aria-label="Sky and weather presets"
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div className="sp-flyout-head">
                    <span className="sp-flyout-title">WEATHER &amp; SKY MODE</span>
                    <button
                      type="button"
                      className="sp-flyout-close"
                      aria-label="Close sky presets"
                      onClick={() => setSkyPickerOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="sp-preset-list">
                    {WEATHER_PRESETS.map((wp) => {
                      const active = state.weatherPreset === wp.id;
                      return (
                        <button
                          key={wp.id}
                          type="button"
                          className={`sp-preset-btn${active ? ' on' : ''}${wp.id === 'live' && active ? ' live-on' : ''}`}
                          aria-pressed={active}
                          onClick={() => {
                            actions.setWeatherPreset(wp.id);
                            setSkyPickerOpen(false);
                          }}
                        >
                          <span className="sp-preset-icon">
                            <PixelIcon
                              name={wp.id === 'live' ? wxIcon : wp.icon}
                              size={14}
                              color={active ? (wp.id === 'live' ? TEAL : MARIGOLD_INK) : TEAL}
                            />
                          </span>
                          <span className="sp-preset-text">
                            <b>{wp.label}</b>
                            <small>{wp.desc}</small>
                          </span>
                          {active && <span className="sp-preset-dot" aria-hidden="true">●</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Time of Day Scrubber (NEVER occluded by sky presets!) */}
          <div className="sp-section-label">
            TIME OF DAY {state.liveOn ? '(LIVE IST)' : '(MANUAL)'}
          </div>
          <input
            className={`sp-scrub${state.liveOn ? ' dim' : ''}`}
            type="range"
            min={0}
            max={1439}
            step={1}
            value={state.minutes}
            aria-label="Time of day"
            onChange={(e) => actions.scrubTime(Number(e.target.value), false)}
            onMouseUp={(e) => actions.scrubTime(Number((e.target as HTMLInputElement).value), true)}
            onTouchEnd={(e) => actions.scrubTime(Number((e.target as HTMLInputElement).value), true)}
          />

          {/* Clock Speed Controls */}
          <div className="sp-grid-4" role="group" aria-label="Clock mode">
            <Button
              bg={state.liveOn ? ROSE : PANEL_ALT}
              textColor={CREAM}
              borderColor={BORDER}
              shadow={NO_SHADOW}
              onClick={() => actions.setLive(!state.liveOn)}
            >
              LIVE
            </Button>
            {[
              { s: 0, label: 'PAUSE', aria: 'Pause' },
              { s: 1, label: '1x', aria: 'Normal speed' },
              { s: 3, label: '3x', aria: 'Fast speed' },
            ].map((item) => {
              const active = !state.liveOn && state.speed === item.s;
              return (
                <Button
                  key={item.s}
                  aria-label={item.aria}
                  bg={active ? MARIGOLD : PANEL_ALT}
                  textColor={active ? MARIGOLD_INK : CREAM}
                  borderColor={BORDER}
                  shadow={NO_SHADOW}
                  onClick={() => actions.setSpeed(item.s)}
                >
                  {item.label}
                </Button>
              );
            })}
          </div>

          {/* Labels & Sound Toggles */}
          <div className="sp-grid-2">
            <Button
              id="signBtn"
              bg={state.labelsOn ? MARIGOLD : PANEL_ALT}
              textColor={state.labelsOn ? MARIGOLD_INK : CREAM}
              borderColor={BORDER}
              shadow={NO_SHADOW}
              onClick={actions.toggleSigns}
            >
              <PixelIcon name="signs" size={14} />
              <span>Labels: {state.labelsOn ? 'On' : 'Off'}</span>
            </Button>
            <Button
              id="soundBtn"
              bg={state.soundOn ? MARIGOLD : PANEL_ALT}
              textColor={state.soundOn ? MARIGOLD_INK : CREAM}
              borderColor={BORDER}
              shadow={NO_SHADOW}
              onClick={actions.toggleSound}
            >
              <PixelIcon name={state.soundOn ? 'soundOn' : 'soundOff'} size={14} />
              <span>Sound: {state.soundOn ? 'On' : 'Off'}</span>
            </Button>
          </div>
          {state.soundOn && state.soundMood && (
            <div className="sp-music-tag sp-ui-text" title="Procedural weather soundtrack playing">
              <span>♪ {state.soundMood}</span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default SkyPanel;
