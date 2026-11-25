import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Bubble,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Input,
  Popup,
  ProgressBar,
} from 'pixel-retroui';
import type { Overlay } from '../engine/renderer';
import type { WeatherPreset } from '../sim/live';
import { CITY_W, WORLD_H } from '../world/geo';
import type { Place } from '../world/city';
import type { CityEvent } from '../sim/events';
import type { Festival } from '../sim/festivals';
import { ZONE_COL, ZONE_NAMES } from '../world/query';
import { PixelIcon, type IconName } from './PixelIcon';

export type DrawerTab = '' | 'passport' | 'report' | 'explore';

export interface HudCardState {
  tag: string;
  title: string;
  sub: string;
  subLang: string;
  blurb: string;
  actionText: string;
  showAction: boolean;
}

export interface HudReportState {
  detail: boolean;
  suburb: string;
  residents: string;
  jobs: string;
  buildings: string;
  tallest: string;
  roadKm: string;
  demand: number[];
  byZone: number[];
  ratings: { label: string; pct: number }[];
  advisor: string;
}

export interface HudEventItem {
  id: string;
  name: string;
  when: string;
  blurb: string;
  active: boolean;
}

export interface HudWalkItem {
  id: string;
  name: string;
  sub: string;
  placeId: string;
}

export interface HudSnapshot {
  timeStr: string;
  dayLine: string;
  liveOn: boolean;
  speed: number;
  minutes: number;
  skyBg: string;
  skySun: string;
  skyOrb: string;

  weatherPreset: WeatherPreset;
  weatherLabel: string;
  weatherCondition: string;
  weatherTemp: number | null;
  weatherFeels: number | null;
  weatherHumidity: number | null;
  weatherWind: string;
  weatherClouds: number | null;
  weatherAqi: number | null;
  weatherFetching: boolean;
  weatherFailed: boolean;

  labelsOn: boolean;
  soundOn: boolean;
  touring: boolean;
  hintGone: boolean;
  overlay: Overlay;
  legend: [string, string][];
  viewInfo: string;

  drawer: DrawerTab;
  places: Place[];
  stamps: string[];
  placeAreaLabel: (area: string) => string;
  placeSecond: (p: Place) => [string, string];

  festival: { now: boolean; label: string; name: string; sub: string; blurb: string } | null;
  pulseText: string;
  toast: { msg: string; hasAction: boolean } | null;
  card: HudCardState | null;
  report: HudReportState | null;
  eventsList: HudEventItem[];
  walksList: HudWalkItem[];
  postcard: { url: string; caption: string } | null;
}

export interface HudActions {
  setLive: (on: boolean) => void;
  setSpeed: (speed: number) => void;
  scrubTime: (minutes: number, done?: boolean) => void;
  setWeatherPreset: (preset: WeatherPreset) => void;
  refreshWeather: () => void;
  toggleSigns: () => void;
  toggleSound: () => void;
  setOverlay: (ov: Overlay) => void;
  setDrawer: (tab: DrawerTab) => void;
  openPlace: (p: Place) => void;
  closeCard: () => void;
  cardAction: () => void;
  zoomStep: (dir: 1 | -1) => void;
  minimapFly: (wx: number, wy: number) => void;
  minimapJump: (wx: number, wy: number) => void;
  tapToast: () => void;
  goFestival: () => void;
  toggleTour: () => void;
  openPostcard: () => void;
  closePostcard: () => void;
  sharePostcard: () => Promise<string>;
  launchEvent: (id: string) => void;
  goWalk: (placeId: string) => void;
  setMinimapCanvas: (el: HTMLCanvasElement | null) => void;
  setPortraitCanvas: (el: HTMLCanvasElement | null) => void;
}

const PANEL = '#1b1626';
const PANEL_ALT = '#272038';
const PANEL_ITEM = '#231d33';
const BORDER = '#524570';
const CREAM = '#f7efe0';
const TEAL = '#2dd4bf';
const MARIGOLD = '#f0a030';
const MARIGOLD_INK = '#1b1626';
const ROSE = '#e0524c';
const NO_SHADOW = 'transparent';

const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: 'roads', label: 'Roads' },
  { id: 'metro', label: 'Metro' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'zones', label: 'Zones' },
  { id: 'density', label: 'Density' },
  { id: 'landuse', label: 'Land Use' },
  { id: 'none', label: 'Off' },
];

const WEATHER_PRESETS: { id: WeatherPreset; label: string }[] = [
  { id: 'live', label: 'Live Hyd' },
  { id: 'clear', label: 'Clear Sky' },
  { id: 'cloudy', label: 'Overcast' },
  { id: 'haze', label: 'Deccan Haze' },
  { id: 'drizzle', label: 'Drizzle' },
  { id: 'rain', label: 'Monsoon Rain' },
  { id: 'storm', label: 'Thunderstorm' },
];

function closeMenus() {
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
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

export const HudApp: React.FC<{ state: HudSnapshot; actions: HudActions }> = ({ state, actions }) => {
  const [search, setSearch] = useState('');
  const [skyOpen, setSkyOpen] = useState(false);
  const [shareBtnText, setShareBtnText] = useState('SHARE');
  const [mmDown, setMmDown] = useState(false);
  const skyWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!skyOpen) return;
    const onDown = (e: MouseEvent) => {
      if (skyWrapRef.current && !skyWrapRef.current.contains(e.target as Node)) setSkyOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [skyOpen]);

  const groupedPlaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups = new Map<string, Place[]>();
    const flat: Place[] = [];
    for (const p of state.places) {
      const [sec] = state.placeSecond(p);
      if (q && !p.name.toLowerCase().includes(q) && !p.te.includes(q) && !sec.toLowerCase().includes(q) && !p.area.toLowerCase().includes(q)) {
        continue;
      }
      flat.push(p);
      const list = groups.get(p.area) ?? [];
      list.push(p);
      groups.set(p.area, list);
    }
    return { q, flat, groups: [...groups.entries()] };
  }, [state.places, search, state.placeSecond]);

  const stampPct = state.places.length ? Math.round((state.stamps.length / state.places.length) * 100) : 0;
  const stampSet = useMemo(() => new Set(state.stamps), [state.stamps]);

  const toWorld = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const b = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * CITY_W, ((e.clientY - b.top) / b.height) * WORLD_H];
  };

  const activeOvLabel = OVERLAYS.find((o) => o.id === state.overlay)?.label ?? 'Views';
  const activeWeatherLabel = WEATHER_PRESETS.find((w) => w.id === state.weatherPreset)?.label ?? 'Live Hyd';
  const wxIcon = skyIconFor(state.weatherCondition, state.minutes);

  return (
    <div id="hud-root">
      {/* 1. TOP-LEFT: City Identity + Live Pulse */}
      <div className="hud-top-left">
        <Button
          className="hd-brand-pill"
          bg={PANEL}
          textColor={CREAM}
          borderColor={BORDER}
          shadow={NO_SHADOW}
          title="Center on Charminar"
          onClick={() => {
            const cm = state.places.find((p) => p.id === 'charminar');
            if (cm) actions.openPlace(cm);
          }}
        >
          <span className="hd-brand-title">HYDERABAD DAYS</span>
          <span className="hd-brand-te" lang="te">హైదరాబాద్</span>
          <span className="hd-brand-sep" />
          <span className="hd-brand-stamps">{state.stamps.length}/{state.places.length}</span>
        </Button>

        {state.drawer === '' && (
          <Card className="hd-pulse-pill" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
            <span className="led" />
            <span>{state.pulseText}</span>
          </Card>
        )}
      </div>

      {/* 2. TOP-RIGHT: Live Clock & Weather Capsule + Popover */}
      <div className="hud-top-right" ref={skyWrapRef}>
        <Button
          id="skyBtn"
          className="hd-sky-pill"
          bg={skyOpen ? PANEL_ALT : PANEL}
          textColor={CREAM}
          borderColor={skyOpen ? MARIGOLD : BORDER}
          shadow={NO_SHADOW}
          title="Live Hyderabad time & weather"
          onClick={() => setSkyOpen((v) => !v)}
        >
          {state.liveOn && <span className="hd-live-dot" />}
          <span className="hd-pill-time">{state.timeStr}</span>
          <span className="hd-pill-wx">
            <PixelIcon name={wxIcon} size={13} color={TEAL} />
            {state.weatherTemp !== null && <span>{state.weatherTemp}°C</span>}
            <span className="hd-pill-wx-text">{state.weatherCondition.toUpperCase()}</span>
          </span>
          <span className="hd-pill-caret">{skyOpen ? '▲' : '▼'}</span>
        </Button>

        {skyOpen && (
          <Card className="hd-sky-popover" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
            <div className="hd-pop-head">
              <div>
                <div className="hd-pop-time">{state.timeStr}</div>
                <div className="hd-pop-day">{state.dayLine}</div>
              </div>
              <Button className="hd-small-btn" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => setSkyOpen(false)}>
                <PixelIcon name="close" size={11} />
              </Button>
            </div>

            <div className="hd-weather-panel">
              <div className="hd-weather-main">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <PixelIcon name={wxIcon} size={13} color={TEAL} />
                  {state.weatherLabel}
                </span>
              </div>
              <div className="hd-weather-grid">
                <span>FEELS <b>{state.weatherFeels !== null ? `${state.weatherFeels}°C` : '—'}</b></span>
                <span>HUMIDITY <b>{state.weatherHumidity !== null ? `${state.weatherHumidity}%` : '—'}</b></span>
                <span>WIND <b>{state.weatherWind || '—'}</b></span>
                <span>AQI <b>{state.weatherAqi !== null ? state.weatherAqi : '—'}</b></span>
              </div>
              <div className="hd-weather-controls">
                <DropdownMenu className="hd-drop-right" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
                  <DropdownMenuTrigger
                    bg={state.weatherPreset === 'live' ? '#133131' : MARIGOLD}
                    textColor={state.weatherPreset === 'live' ? TEAL : MARIGOLD_INK}
                    borderColor={BORDER}
                    shadow={NO_SHADOW}
                  >
                    SKY: {activeWeatherLabel.toUpperCase()}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
                    <DropdownMenuLabel className="hd-drop-sub">HYDERABAD SKY</DropdownMenuLabel>
                    <div className="hd-drop-list">
                      {WEATHER_PRESETS.map((wp) => (
                        <DropdownMenuItem key={wp.id}>
                          <button
                            type="button"
                            className={`hd-drop-btn${state.weatherPreset === wp.id ? ' on' : ''}`}
                            onClick={() => {
                              actions.setWeatherPreset(wp.id);
                              closeMenus();
                            }}
                          >
                            <span>{wp.label.toUpperCase()}</span>
                            {state.weatherPreset === wp.id ? <span>●</span> : null}
                          </button>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button className="hd-small-btn" title="Refresh live weather" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={actions.refreshWeather}>
                  <PixelIcon name="refresh" size={12} color={state.weatherFetching ? MARIGOLD : CREAM} />
                </Button>
              </div>
            </div>

            <input
              className={`hd-scrub${state.liveOn ? ' dim' : ''}`}
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

            <div className="hd-grid-4" role="group" aria-label="Clock mode">
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
                { s: 0, label: 'II', aria: 'Pause' },
                { s: 1, label: '>', aria: 'Normal speed' },
                { s: 3, label: '>>>', aria: 'Fast speed' },
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

            <div className="hd-grid-2">
              <Button
                id="signBtn"
                bg={state.labelsOn ? MARIGOLD : PANEL_ALT}
                textColor={state.labelsOn ? MARIGOLD_INK : CREAM}
                borderColor={BORDER}
                shadow={NO_SHADOW}
                onClick={actions.toggleSigns}
              >
                <PixelIcon name="signs" size={12} />
                <span>SIGNS</span>
              </Button>
              <Button
                id="soundBtn"
                bg={state.soundOn ? MARIGOLD : PANEL_ALT}
                textColor={state.soundOn ? MARIGOLD_INK : CREAM}
                borderColor={BORDER}
                shadow={NO_SHADOW}
                onClick={actions.toggleSound}
              >
                <PixelIcon name={state.soundOn ? 'soundOn' : 'soundOff'} size={12} />
                <span>SOUND</span>
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* 3. TOP-CENTER OVERLAY LEGEND (Only when a Map Layer is active) */}
      {state.overlay !== 'none' && (
        <div className="hud-legend-dock">
          <Card className="hd-legend-card" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
            <div className="hd-legend-head">
              <b>{activeOvLabel.toUpperCase()} LAYER</b>
              <Button className="hd-small-btn" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => actions.setOverlay('none')}>
                OFF
              </Button>
            </div>
            {state.legend.length > 0 && (
              <div className="hd-legend-grid">
                {state.legend.map(([col, name]) => (
                  <span key={name}>
                    <i style={{ background: col }} />
                    {name.toUpperCase()}
                  </span>
                ))}
              </div>
            )}
            {state.viewInfo && <div className="hd-legend-info">{state.viewInfo}</div>}
          </Card>
        </div>
      )}

      {/* 4. SINGLE LEFT DRAWER (Passport / Neighbourhood Report / Events & Walks) */}
      {state.drawer !== '' && (
        <aside className="hud-drawer">
          <Card className="hd-drawer-card" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
            {state.drawer === 'passport' && (
              <>
                <div className="hd-drawer-head">
                  <h2>CITY PASSPORT</h2>
                  <Button className="hd-small-btn" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => actions.setDrawer('')}>
                    <PixelIcon name="close" size={11} />
                  </Button>
                </div>
                <p className="hd-sub">
                  Wander near landmarks to stamp them. <b>{state.stamps.length}/{state.places.length}</b>
                </p>
                <ProgressBar progress={stampPct} size="sm" color={TEAL} borderColor={BORDER} />
                <Input
                  type="search"
                  placeholder="Search places, Telugu, area..."
                  value={search}
                  bg="#130f1c"
                  textColor={CREAM}
                  borderColor={BORDER}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="hd-scroll">
                  {groupedPlaces.q ? (
                    groupedPlaces.flat.length ? (
                      groupedPlaces.flat.map((p) => {
                        const [sec, secLang] = state.placeSecond(p);
                        const got = stampSet.has(p.id);
                        return (
                          <button key={p.id} type="button" className={`hd-place-btn${got ? ' got' : ''}`} onClick={() => actions.openPlace(p)}>
                            <span className="hd-place-st">OK</span>
                            <span className="hd-place-nm">
                              <span>{p.name}</span>
                              <span lang={secLang}>{sec}</span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="hd-sub">No place by that name.</p>
                    )
                  ) : (
                    <Accordion collapsible={false} bg={PANEL_ITEM} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
                      {groupedPlaces.groups.map(([area, list]) => {
                        const areaGot = list.filter((p) => stampSet.has(p.id)).length;
                        return (
                          <AccordionItem key={area} value={area} bg={PANEL_ITEM} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
                            <AccordionTrigger>
                              <span style={{ fontSize: 10, fontWeight: 700, flex: 1 }}>
                                {state.placeAreaLabel(area)} ({areaGot}/{list.length})
                              </span>
                            </AccordionTrigger>
                            <AccordionContent>
                              {list.map((p) => {
                                const [sec, secLang] = state.placeSecond(p);
                                const got = stampSet.has(p.id);
                                return (
                                  <button key={p.id} type="button" className={`hd-place-btn${got ? ' got' : ''}`} onClick={() => actions.openPlace(p)}>
                                    <span className="hd-place-st">OK</span>
                                    <span className="hd-place-nm">
                                      <span>{p.name}</span>
                                      <span lang={secLang}>{sec}</span>
                                    </span>
                                  </button>
                                );
                              })}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  )}
                </div>
              </>
            )}

            {state.drawer === 'report' && (
              <>
                <div className="hd-drawer-head">
                  <h2>NEIGHBOURHOOD</h2>
                  <Button className="hd-small-btn" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => actions.setDrawer('')}>
                    <PixelIcon name="close" size={11} />
                  </Button>
                </div>
                {!state.report || !state.report.detail ? (
                  <p className="hd-sub">Zoom in to street level to survey a neighbourhood.</p>
                ) : (
                  <div className="hd-scroll">
                    <p className="hd-sub"><b>AROUND {state.report.suburb.toUpperCase()}</b></p>
                    <dl className="hd-stats-dl">
                      <div className="hd-stat-box"><dt>POPULATION</dt><dd>{state.report.residents}</dd></div>
                      <div className="hd-stat-box"><dt>JOBS</dt><dd>{state.report.jobs}</dd></div>
                      <div className="hd-stat-box"><dt>BUILDINGS</dt><dd>{state.report.buildings}</dd></div>
                      <div className="hd-stat-box"><dt>TALLEST · ROADS</dt><dd>{state.report.tallest} · {state.report.roadKm}</dd></div>
                    </dl>

                    <div className="hd-demand">
                      <span className="lbl">DEMAND</span>
                      {['R', 'C', 'I'].map((letter, idx) => {
                        const v = state.report!.demand[idx] ?? 0;
                        return (
                          <div key={letter} className="col" title={ZONE_NAMES[idx]}>
                            <i style={{ background: ZONE_COL[idx], height: `${Math.abs(v) * 50}%`, [v >= 0 ? 'bottom' : 'top']: '50%' }} />
                            <b>{letter}</b>
                          </div>
                        );
                      })}
                    </div>

                    <div className="hd-mix">
                      {[0, 1, 2, 3].map((z) => {
                        const n = state.report!.byZone[z];
                        return n ? <i key={z} style={{ background: ZONE_COL[z], flex: n }} title={`${ZONE_NAMES[z]} ${n}`} /> : null;
                      })}
                    </div>

                    {state.report.ratings.map((rt) => (
                      <div key={rt.label} className="hd-rating-row">
                        <div className="hd-rating-head">
                          <span>{rt.label}</span>
                          <b>{rt.pct}%</b>
                        </div>
                        <ProgressBar progress={rt.pct} size="sm" color={rt.pct >= 60 ? TEAL : rt.pct >= 35 ? MARIGOLD : ROSE} borderColor={BORDER} />
                      </div>
                    ))}

                    <Bubble direction="left" className="hd-advisor-bubble" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER}>
                      <b style={{ fontFamily: 'Silkscreen, monospace', fontSize: 9, color: MARIGOLD }}>ADVISOR: </b>
                      {state.report.advisor}
                    </Bubble>
                  </div>
                )}
              </>
            )}

            {state.drawer === 'explore' && (
              <>
                <div className="hd-drawer-head">
                  <h2>EVENTS &amp; WALKS</h2>
                  <Button className="hd-small-btn" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => actions.setDrawer('')}>
                    <PixelIcon name="close" size={11} />
                  </Button>
                </div>
                <div className="hd-scroll">
                  {state.festival && (
                    <div className="hd-event-card" style={{ borderColor: state.festival.now ? MARIGOLD : BORDER }}>
                      <div className="hd-event-head">
                        <span style={{ color: MARIGOLD }}>{state.festival.label}</span>
                      </div>
                      <b style={{ color: CREAM }}>{state.festival.name}</b>
                      <p className="hd-event-blurb">{state.festival.blurb}</p>
                      <Button className="hd-small-btn" bg={MARIGOLD} textColor={MARIGOLD_INK} borderColor={BORDER} shadow={NO_SHADOW} style={{ alignSelf: 'flex-start' }} onClick={actions.goFestival}>
                        {state.festival.now ? 'FLY THERE' : 'PREVIEW FESTIVAL'}
                      </Button>
                    </div>
                  )}

                  <p className="hd-sub"><b>CURATED CITY WALKS</b></p>
                  <div className="hd-walk-grid">
                    {state.walksList.map((w) => (
                      <Button
                        key={w.id}
                        bg={PANEL_ALT}
                        textColor={CREAM}
                        borderColor={BORDER}
                        shadow={NO_SHADOW}
                        style={{ flexDirection: 'column', alignItems: 'flex-start', height: 'auto', padding: '7px 8px' }}
                        onClick={() => actions.goWalk(w.placeId)}
                      >
                        <span style={{ fontSize: 9, fontWeight: 700 }}>{w.name}</span>
                        <span style={{ fontSize: 8, color: '#b5abc9' }}>{w.sub}</span>
                      </Button>
                    ))}
                  </div>

                  <p className="hd-sub"><b>CITY HAPPENINGS</b></p>
                  {state.eventsList.map((ev) => (
                    <div key={ev.id} className="hd-event-card">
                      <div className="hd-event-head">
                        <span>{ev.name.toUpperCase()}</span>
                        {ev.active ? <span className="hd-tag-live">ON NOW</span> : <span style={{ fontSize: 8, color: '#b5abc9' }}>{ev.when}</span>}
                      </div>
                      <p className="hd-event-blurb">{ev.blurb}</p>
                      <Button
                        className="hd-small-btn"
                        bg={ev.active ? MARIGOLD : PANEL_ITEM}
                        textColor={ev.active ? MARIGOLD_INK : CREAM}
                        borderColor={BORDER}
                        shadow={NO_SHADOW}
                        style={{ alignSelf: 'flex-start' }}
                        onClick={() => actions.launchEvent(ev.id)}
                      >
                        {ev.active ? 'FLY THERE' : 'PREVIEW NOW'}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </aside>
      )}

      {/* TOP-CENTER TOAST */}
      {state.toast && (
        <div className="hud-toast">
          <Button className="hd-toast-btn" bg={ROSE} textColor="#fff" borderColor={CREAM} shadow={NO_SHADOW} onClick={actions.tapToast}>
            {state.toast.msg}
          </Button>
        </div>
      )}

      {/* CENTERED INSPECTOR CARD */}
      {state.card && (
        <div className="hud-inspector">
          <Card className="hd-card-inner" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
            <Button className="hd-card-close" aria-label="Close" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={actions.closeCard}>
              <PixelIcon name="close" size={11} />
            </Button>
            <canvas ref={actions.setPortraitCanvas} className="hd-portrait" width={96} height={96} />
            <div className="hd-card-body">
              <span className="hd-card-tag">{state.card.tag}</span>
              <h3>{state.card.title}</h3>
              {state.card.sub && <div className="hd-card-sub" lang={state.card.subLang}>{state.card.sub}</div>}
              <p className="hd-card-blurb">{state.card.blurb}</p>
              {state.card.showAction && (
                <div style={{ marginTop: 4 }}>
                  <Button className="hd-small-btn" bg={MARIGOLD} textColor={MARIGOLD_INK} borderColor={BORDER} shadow={NO_SHADOW} onClick={actions.cardAction}>
                    {state.card.actionText}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {!state.card && (
        <div className={`hud-hint${state.hintGone ? ' gone' : ''}`}>
          DRAG TO EXPLORE · SCROLL TO ZOOM · TAP ANYTHING THAT MOVES
        </div>
      )}

      {/* 5. BOTTOM-CENTER GAME TOOL DOCK */}
      <div className="hud-dock-wrap">
        <Card className="hd-dock" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
          <Button
            id="passportBtn"
            className={`hd-dock-btn${state.drawer === 'passport' ? ' active' : ''}`}
            bg={state.drawer === 'passport' ? MARIGOLD : PANEL_ALT}
            textColor={state.drawer === 'passport' ? MARIGOLD_INK : CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            onClick={() => actions.setDrawer('passport')}
          >
            <PixelIcon name="passport" size={14} />
            <span>PASSPORT</span>
          </Button>

          <DropdownMenu className="hd-drop-up hd-drop-center" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
            <DropdownMenuTrigger
              id="viewsBtn"
              className={`hd-dock-btn${state.overlay !== 'none' ? ' active' : ''}`}
              bg={state.overlay !== 'none' ? MARIGOLD : PANEL_ALT}
              textColor={state.overlay !== 'none' ? MARIGOLD_INK : CREAM}
              borderColor={BORDER}
              shadow={NO_SHADOW}
            >
              <PixelIcon name="layers" size={14} />
              <span>{state.overlay !== 'none' ? activeOvLabel.toUpperCase() : 'LAYERS'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
              <DropdownMenuLabel className="hd-drop-sub">DATA LAYERS</DropdownMenuLabel>
              <div className="hd-drop-list">
                {OVERLAYS.map((ov) => (
                  <DropdownMenuItem key={ov.id}>
                    <button
                      type="button"
                      className={`hd-drop-btn${state.overlay === ov.id && ov.id !== 'none' ? ' on' : ''}`}
                      onClick={() => {
                        actions.setOverlay(ov.id);
                        closeMenus();
                      }}
                    >
                      <span>{ov.label.toUpperCase()}</span>
                      {state.overlay === ov.id && ov.id !== 'none' ? <span>●</span> : null}
                    </button>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            id="reportBtn"
            className={`hd-dock-btn${state.drawer === 'report' ? ' active' : ''}`}
            bg={state.drawer === 'report' ? MARIGOLD : PANEL_ALT}
            textColor={state.drawer === 'report' ? MARIGOLD_INK : CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            onClick={() => actions.setDrawer('report')}
          >
            <PixelIcon name="report" size={14} />
            <span>SURVEY</span>
          </Button>

          <Button
            id="exploreBtn"
            className={`hd-dock-btn${state.drawer === 'explore' ? ' active' : ''}`}
            bg={state.drawer === 'explore' ? MARIGOLD : PANEL_ALT}
            textColor={state.drawer === 'explore' ? MARIGOLD_INK : CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            onClick={() => actions.setDrawer('explore')}
          >
            <PixelIcon name="events" size={14} color={state.festival?.now && state.drawer !== 'explore' ? MARIGOLD : 'currentColor'} />
            <span>EVENTS</span>
          </Button>

          <Button
            id="tourBtn"
            className={`hd-dock-btn${state.touring ? ' active' : ''}`}
            bg={state.touring ? MARIGOLD : PANEL_ALT}
            textColor={state.touring ? MARIGOLD_INK : CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            onClick={actions.toggleTour}
          >
            <PixelIcon name="tour" size={14} />
            <span>{state.touring ? 'STOP' : 'TOUR'}</span>
          </Button>

          <Button
            id="postcardBtn"
            className="hd-dock-btn"
            bg={PANEL_ALT}
            textColor={CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            onClick={actions.openPostcard}
          >
            <PixelIcon name="camera" size={14} />
            <span>SNAP</span>
          </Button>
        </Card>
      </div>

      {/* 6. BOTTOM-RIGHT MINIMAP & ZOOM */}
      <div className="hud-bottom-right">
        <div className="hd-credit">Map data © OpenStreetMap contributors</div>
        <Card className="hd-mini-card" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
          <canvas
            id="minimap"
            ref={actions.setMinimapCanvas}
            width={200}
            height={92}
            onPointerDown={(e) => {
              setMmDown(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              const [wx, wy] = toWorld(e);
              actions.minimapFly(wx, wy);
            }}
            onPointerMove={(e) => {
              if (!mmDown) return;
              const [wx, wy] = toWorld(e);
              actions.minimapJump(wx, wy);
            }}
            onPointerUp={() => setMmDown(false)}
            onPointerCancel={() => setMmDown(false)}
          />
          <div className="hd-zoom-col">
            <Button aria-label="Zoom in" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => actions.zoomStep(1)}>
              +
            </Button>
            <Button aria-label="Zoom out" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => actions.zoomStep(-1)}>
              -
            </Button>
          </div>
        </Card>
      </div>

      {/* POSTCARD POPUP */}
      <Popup
        isOpen={!!state.postcard}
        onClose={actions.closePostcard}
        title="YOUR POSTCARD"
        className="hd-postcard-popup"
        bg={PANEL}
        baseBg={PANEL}
        textColor={CREAM}
        borderColor={BORDER}
      >
        {state.postcard && (
          <div>
            <img className="hd-postcard-img" src={state.postcard.url} alt={`Postcard: ${state.postcard.caption}`} />
            <div className="hd-postcard-actions">
              <a className="hd-btnlink" href={state.postcard.url} download="hyderabad-postcard.png">
                SAVE
              </a>
              <Button
                bg={PANEL_ALT}
                textColor={CREAM}
                borderColor={BORDER}
                shadow={NO_SHADOW}
                onClick={async () => {
                  const res = await actions.sharePostcard();
                  setShareBtnText(res);
                  setTimeout(() => setShareBtnText('SHARE'), 2200);
                }}
              >
                {shareBtnText}
              </Button>
              <Button bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={actions.closePostcard}>
                CLOSE
              </Button>
            </div>
          </div>
        )}
      </Popup>
    </div>
  );
};
export type { Festival, CityEvent };
