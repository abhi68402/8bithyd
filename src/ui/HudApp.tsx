import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Bubble,
  Button,
  Card,
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
import type { CityGameSummary } from '../sim/quests';
import { ZONE_COL, ZONE_NAMES } from '../world/query';
import { EventsDrawer } from './EventsDrawer';
import { PixelIcon } from './PixelIcon';
import { PostcardModal } from './PostcardModal';
import { QuestsChip } from './QuestsChip';
import { SkyPanel } from './SkyPanel';

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
  place?: string;
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
  weatherPrecipMm: number | null;
  weatherAqi: number | null;
  weatherEuAqi: number | null;
  weatherPm25: number | null;
  weatherPm10: number | null;
  weatherLastUpdatedAt: string | null;
  weatherAqiLabel: string;
  weatherAqiColor: string;
  weatherAqiFailed: boolean;
  weatherFetching: boolean;
  weatherFailed: boolean;

  labelsOn: boolean;
  soundOn: boolean;
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
  postcard: { url: string; caption: string; canvas?: HTMLCanvasElement } | null;
  questsSummary: CityGameSummary;
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
  zoomToStreet: () => void;
  minimapFly: (wx: number, wy: number) => void;
  minimapJump: (wx: number, wy: number) => void;
  tapToast: () => void;
  goFestival: () => void;
  openPostcard: () => void;
  closePostcard: () => void;
  sharePostcard: () => Promise<string>;
  launchEvent: (id: string) => void;
  stopEvent: (id: string) => void;
  goWalk: (placeId: string) => void;
  flyToQuest: (wx: number, wy: number, zoom?: number) => void;
  honkMap: () => void;
  resetQuests: () => void;
  setMinimapCanvas: (el: HTMLCanvasElement | null) => void;
  setPortraitCanvas: (el: HTMLCanvasElement | null) => void;
}

const PANEL = '#1b1626';
const PANEL_ALT = '#28213a';
const PANEL_ITEM = '#231c33';
const BORDER = '#5a4d7a';
const CREAM = '#f7efe0';
const TEAL = '#2dd4bf';
const MARIGOLD = '#f0a030';
const MARIGOLD_INK = '#1b1626';
const ROSE = '#e0524c';
const NO_SHADOW = 'transparent';

const OVERLAYS: { id: Overlay; label: string; desc: string; swatch: string }[] = [
  { id: 'roads', label: 'Roads', desc: 'All roads', swatch: '#ff8a3c' },
  { id: 'metro', label: 'Metro', desc: 'Lines & walk', swatch: '#3b78d8' },
  { id: 'traffic', label: 'Traffic', desc: 'Live flow', swatch: '#4cd964' },
  { id: 'zones', label: 'Zones', desc: 'R / C / I mix', swatch: '#f0a030' },
  { id: 'density', label: 'Density', desc: 'Floor area', swatch: '#f5963c' },
  { id: 'landuse', label: 'Land Use', desc: 'Parks & water', swatch: '#5ac86e' },
  { id: 'none', label: 'Standard', desc: 'Default view', swatch: '#5a4d7a' },
];

export const HudApp: React.FC<{ state: HudSnapshot; actions: HudActions }> = ({ state, actions }) => {
  const [search, setSearch] = useState('');
  const [skyOpen, setSkyOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [mmDown, setMmDown] = useState(false);
  const dockWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (dockWrapRef.current && !dockWrapRef.current.contains(e.target as Node)) setViewsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [viewsOpen]);

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

  const activeOvLabel = OVERLAYS.find((o) => o.id === state.overlay)?.label ?? 'Map Views';

  return (
    <div id="hud-root">
      {/* 1. TOP-LEFT: City Identity + Help Guide + Quests Chip + Live Pulse */}
      <div className="hud-top-left">
        <div className="hd-top-row">
          <Button
            className="hd-brand-pill"
            bg={PANEL}
            textColor={CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            title="Jump to Charminar"
            onClick={() => {
              const cm = state.places.find((p) => p.id === 'charminar');
              if (cm) actions.openPlace(cm);
            }}
          >
            <span className="hd-brand-title">HYDERABAD <span className="hd-brand-days">DAYS</span></span>
            <span className="hd-brand-te" lang="te">హైదరాబాద్</span>
            <span className="hd-brand-sep" />
            <span className="hd-brand-stamps">{state.stamps.length}/{state.places.length}<span className="hd-stamps-word"> STAMPS</span></span>
          </Button>

          <QuestsChip
            summary={state.questsSummary}
            onFlyTo={actions.flyToQuest}
            onHonk={actions.honkMap}
            onReset={actions.resetQuests}
          />

          <Button
            className="hd-guide-pill"
            bg={guideOpen ? MARIGOLD : PANEL}
            textColor={guideOpen ? MARIGOLD_INK : CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            title="How to play & explore"
            onClick={() => setGuideOpen(true)}
          >
            <span>?<span className="hd-guide-word"> GUIDE</span></span>
          </Button>
        </div>

        {state.drawer === '' && (
          <Card className="hd-pulse-pill" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
            <span className="led" />
            <span className="hd-ui-text">{state.pulseText}</span>
          </Card>
        )}
      </div>

      {/* 2. TOP-RIGHT: Live Clock, Real Weather & AQI Capsule + Popover */}
      <div className="hud-top-right">
        <SkyPanel
          open={skyOpen}
          onToggleOpen={() => setSkyOpen((v) => !v)}
          onClose={() => setSkyOpen(false)}
          state={state}
          actions={actions}
        />
      </div>

      {/* 3. TOP-CENTER OVERLAY LEGEND (When a Map View is active) */}
      {state.overlay !== 'none' && (
        <div className="hud-legend-dock">
          <Card className="hd-legend-card" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
            <div className="hd-legend-head">
              <b>{activeOvLabel.toUpperCase()} VIEW</b>
              <Button className="hd-small-btn" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => actions.setOverlay('none')}>
                Turn Off
              </Button>
            </div>
            {state.legend.length > 0 && (
              <div className="hd-legend-grid hd-ui-text">
                {state.legend.map(([col, name]) => (
                  <span key={name}>
                    <i style={{ background: col }} />
                    {name}
                  </span>
                ))}
              </div>
            )}
            {state.viewInfo && <div className="hd-legend-info hd-ui-text">{state.viewInfo}</div>}
          </Card>
        </div>
      )}

      {/* 4. SINGLE LEFT DRAWER (Passport / City Stats / Events & Walks) */}
      {state.drawer !== '' && (
        <aside className="hud-drawer">
          <Card className="hd-drawer-card" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
            {state.drawer === 'passport' && (
              <>
                <div className="hd-drawer-head">
                  <h2>CITY PASSPORT</h2>
                  <Button className="hd-small-btn" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => actions.setDrawer('')}>
                    <PixelIcon name="close" size={12} />
                  </Button>
                </div>
                <p className="hd-sub hd-ui-text">
                  Tap any landmark to fly there and collect its stamp. <b>{state.stamps.length} of {state.places.length} stamped</b>
                </p>
                <ProgressBar progress={stampPct} size="sm" color={TEAL} borderColor={BORDER} />
                <Input
                  type="search"
                  placeholder="Search landmarks, Telugu or area..."
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
                            <span className="hd-place-st">{got ? '✓' : ''}</span>
                            <span className="hd-place-nm">
                              <b>{p.name}</b>
                              <span lang={secLang}>{sec}</span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="hd-sub hd-ui-text">No landmark found matching "{search}".</p>
                    )
                  ) : (
                    <Accordion collapsible={false} bg={PANEL_ITEM} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
                      {groupedPlaces.groups.map(([area, list]) => {
                        const areaGot = list.filter((p) => stampSet.has(p.id)).length;
                        return (
                          <AccordionItem key={area} value={area} bg={PANEL_ITEM} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
                            <AccordionTrigger>
                              <span className="hd-acc-title">
                                <span>{state.placeAreaLabel(area)}</span>
                                <span className="hd-acc-count">{areaGot}/{list.length}</span>
                              </span>
                            </AccordionTrigger>
                            <AccordionContent>
                              {list.map((p) => {
                                const [sec, secLang] = state.placeSecond(p);
                                const got = stampSet.has(p.id);
                                return (
                                  <button key={p.id} type="button" className={`hd-place-btn${got ? ' got' : ''}`} onClick={() => actions.openPlace(p)}>
                                    <span className="hd-place-st">{got ? '✓' : ''}</span>
                                    <span className="hd-place-nm">
                                      <b>{p.name}</b>
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
                  <h2>NEIGHBOURHOOD STATS</h2>
                  <Button className="hd-small-btn" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadow={NO_SHADOW} onClick={() => actions.setDrawer('')}>
                    <PixelIcon name="close" size={12} />
                  </Button>
                </div>
                {!state.report || !state.report.detail ? (
                  <div className="hd-empty-box">
                    <p className="hd-ui-text" style={{ margin: 0, color: CREAM }}>
                      You are zoomed out to the city overview. Zoom into street level to survey population, jobs, and traffic around your camera.
                    </p>
                    <Button bg={MARIGOLD} textColor={MARIGOLD_INK} borderColor={BORDER} shadow={NO_SHADOW} onClick={actions.zoomToStreet}>
                      Zoom In to Survey Here
                    </Button>
                  </div>
                ) : (
                  <div className="hd-scroll">
                    <p className="hd-sub hd-ui-text">
                      Live estimate for buildings around <b>{state.report.suburb}</b>
                    </p>
                    <dl className="hd-stats-dl">
                      <div className="hd-stat-box"><dt>Residents</dt><dd>{state.report.residents}</dd></div>
                      <div className="hd-stat-box"><dt>Local Jobs</dt><dd>{state.report.jobs}</dd></div>
                      <div className="hd-stat-box"><dt>Buildings</dt><dd>{state.report.buildings}</dd></div>
                      <div className="hd-stat-box"><dt>Tallest · Roads</dt><dd>{state.report.tallest} · {state.report.roadKm}</dd></div>
                    </dl>

                    <div className="hd-section-label">R / C / I GROWTH DEMAND</div>
                    <div className="hd-demand">
                      {['Res', 'Com', 'Ind'].map((letter, idx) => {
                        const v = state.report!.demand[idx] ?? 0;
                        return (
                          <div key={letter} className="col" title={ZONE_NAMES[idx]}>
                            <i style={{ background: ZONE_COL[idx], height: `${Math.abs(v) * 50}%`, [v >= 0 ? 'bottom' : 'top']: '50%' }} />
                            <b>{letter}</b>
                          </div>
                        );
                      })}
                    </div>

                    <div className="hd-section-label">LAND USE MIX</div>
                    <div className="hd-mix">
                      {[0, 1, 2, 3].map((z) => {
                        const n = state.report!.byZone[z];
                        return n ? <i key={z} style={{ background: ZONE_COL[z], flex: n }} title={`${ZONE_NAMES[z]}: ${n}`} /> : null;
                      })}
                    </div>

                    {state.report.ratings.map((rt) => (
                      <div key={rt.label} className="hd-rating-row hd-ui-text">
                        <div className="hd-rating-head">
                          <span>{rt.label}</span>
                          <b>{rt.pct}%</b>
                        </div>
                        <ProgressBar progress={rt.pct} size="sm" color={rt.pct >= 60 ? TEAL : rt.pct >= 35 ? MARIGOLD : ROSE} borderColor={BORDER} />
                      </div>
                    ))}

                    <Bubble direction="left" className="hd-advisor-bubble" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER}>
                      <b style={{ color: MARIGOLD }}>City Advisor: </b>
                      {state.report.advisor}
                    </Bubble>
                  </div>
                )}
              </>
            )}

            {state.drawer === 'explore' && (
              <EventsDrawer
                festival={state.festival}
                eventsList={state.eventsList}
                walksList={state.walksList}
                onClose={() => actions.setDrawer('')}
                onGoFestival={actions.goFestival}
                onLaunchEvent={actions.launchEvent}
                onStopEvent={actions.stopEvent}
                onGoWalk={actions.goWalk}
              />
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
              <PixelIcon name="close" size={12} />
            </Button>
            <canvas ref={actions.setPortraitCanvas} className="hd-portrait" width={96} height={96} />
            <div className="hd-card-body">
              <span className="hd-card-tag">{state.card.tag}</span>
              <h3>{state.card.title}</h3>
              {state.card.sub && <div className="hd-card-sub" lang={state.card.subLang}>{state.card.sub}</div>}
              <p className="hd-card-blurb">{state.card.blurb}</p>
              {state.card.showAction && (
                <div style={{ marginTop: 6 }}>
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
        <div className={`hud-hint hd-ui-text${state.hintGone ? ' gone' : ''}`}>
          Drag to pan · Scroll to zoom · Tap any building, car, train, or person
        </div>
      )}

      {/* 5. BOTTOM-CENTER GAME TOOL DOCK */}
      <div className="hud-dock-wrap" ref={dockWrapRef}>
        {viewsOpen && (
          <Card
            className="hd-views-bar"
            bg={PANEL}
            textColor={CREAM}
            borderColor={MARIGOLD}
            shadowColor={NO_SHADOW}
          >
            <div id="viewsTray" role="region" aria-label="Map overlays">
              <div className="hd-views-head">
                <span className="hd-views-title">MAP OVERLAYS</span>
                <button
                  type="button"
                  className="hd-views-close"
                  aria-label="Close map overlays"
                  onClick={() => setViewsOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="hd-views-row">
                {OVERLAYS.map((ov) => {
                  const active = ov.id === 'none' ? state.overlay === 'none' : state.overlay === ov.id;
                  return (
                    <button
                      key={ov.id}
                      type="button"
                      className={`hd-view-chip${active ? ' on' : ''}`}
                      aria-pressed={active}
                      onClick={() => {
                        actions.setOverlay(ov.id);
                        setViewsOpen(false);
                      }}
                    >
                      <span className="hd-view-bar" style={{ background: ov.swatch }} aria-hidden="true" />
                      <span className="hd-view-label">{ov.label}</span>
                      <span className="hd-view-desc">{ov.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        <Card className="hd-dock" bg={PANEL} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
          <Button
            id="passportBtn"
            className={`hd-dock-btn${state.drawer === 'passport' ? ' active' : ''}`}
            bg={state.drawer === 'passport' ? MARIGOLD : PANEL_ALT}
            textColor={state.drawer === 'passport' ? MARIGOLD_INK : CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            title="View 38 Hyderabad landmarks & stamps"
            onClick={() => {
              setViewsOpen(false);
              actions.setDrawer('passport');
            }}
          >
            <PixelIcon name="passport" size={15} />
            <span>Passport</span>
          </Button>

          <Button
            id="viewsBtn"
            className={`hd-dock-btn${viewsOpen || state.overlay !== 'none' ? ' active' : ''}`}
            bg={viewsOpen || state.overlay !== 'none' ? MARIGOLD : PANEL_ALT}
            textColor={viewsOpen || state.overlay !== 'none' ? MARIGOLD_INK : CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            aria-expanded={viewsOpen}
            aria-controls="viewsTray"
            title="Toggle Metro, Traffic, Roads or Zones map layers"
            onClick={() => setViewsOpen((v) => !v)}
          >
            <PixelIcon name="layers" size={15} />
            <span>{state.overlay !== 'none' ? activeOvLabel : 'Map Views'}</span>
          </Button>

          <Button
            id="reportBtn"
            className={`hd-dock-btn${state.drawer === 'report' ? ' active' : ''}`}
            bg={state.drawer === 'report' ? MARIGOLD : PANEL_ALT}
            textColor={state.drawer === 'report' ? MARIGOLD_INK : CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            title="Inspect neighbourhood population, jobs & demand"
            onClick={() => {
              setViewsOpen(false);
              actions.setDrawer('report');
            }}
          >
            <PixelIcon name="report" size={15} />
            <span>City Stats</span>
          </Button>

          <Button
            id="exploreBtn"
            className={`hd-dock-btn${state.drawer === 'explore' ? ' active' : ''}`}
            bg={state.drawer === 'explore' ? MARIGOLD : PANEL_ALT}
            textColor={state.drawer === 'explore' ? MARIGOLD_INK : CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            title="Festivals, events & curated city walks"
            onClick={() => {
              setViewsOpen(false);
              actions.setDrawer('explore');
            }}
          >
            <PixelIcon name="events" size={15} color={state.festival?.now && state.drawer !== 'explore' ? MARIGOLD : 'currentColor'} />
            <span>Events</span>
          </Button>

          <Button
            id="postcardBtn"
            className="hd-dock-btn"
            bg={PANEL_ALT}
            textColor={CREAM}
            borderColor={BORDER}
            shadow={NO_SHADOW}
            title="Capture & share a Greetings from Hyderabad postcard"
            onClick={() => {
              setViewsOpen(false);
              actions.openPostcard();
            }}
          >
            <PixelIcon name="camera" size={15} />
            <span>Postcard</span>
          </Button>
        </Card>
      </div>

      {/* 6. BOTTOM-RIGHT MINIMAP & ZOOM */}
      <div className="hud-bottom-right">
        <div className="hd-credit hd-ui-text">Map © OpenStreetMap</div>
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

      {/* HOW TO PLAY / GUIDE POPUP */}
      <Popup
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="HOW TO EXPLORE HYDERABAD"
        className="hd-guide-popup"
        bg={PANEL}
        baseBg={PANEL}
        textColor={CREAM}
        borderColor={BORDER}
      >
        <div className="hd-guide-body hd-ui-text">
          <div className="hd-guide-item">
            <b>1. Explore the Real City</b>
            <p>Drag to pan across 51×46 km of OpenStreetMap Hyderabad. Scroll, pinch, or tap the minimap &amp; <b>+ / -</b> buttons to zoom down to street level.</p>
          </div>
          <div className="hd-guide-item">
            <b>2. Collect Golden Chai &amp; Deccan Pearls</b>
            <p>Spot floating <b>Chai Cups &amp; Pearls</b> on the map and tap the drifting <b>Hot-Air Balloon</b>! Open the top-left <b>Chai &amp; Quests</b> chip for clues and Explorer Quests.</p>
          </div>
          <div className="hd-guide-item">
            <b>3. Collect Stamps &amp; Check Stats</b>
            <p>Open <b>Passport</b> to visit all 38 landmarks, switch <b>Map Views</b> (Metro, Traffic, Zones), or open <b>City Stats</b> at street level for neighbourhood demand.</p>
          </div>
          <div className="hd-guide-item">
            <b>4. Live Time, Weather &amp; Events</b>
            <p>Tap the top-right <b>Clock &amp; Weather</b> pill to see live Hyderabad weather &amp; AQI, preview storms, scrub time of day, or toggle city <b>Sound</b>. Check <b>Events</b> for festivals &amp; walks.</p>
          </div>
          <Button bg={MARIGOLD} textColor={MARIGOLD_INK} borderColor={BORDER} shadow={NO_SHADOW} style={{ width: '100%' }} onClick={() => setGuideOpen(false)}>
            Got It — Back to City
          </Button>
        </div>
      </Popup>

      {/* POSTCARD POPUP */}
      <PostcardModal
        postcard={state.postcard}
        onClose={actions.closePostcard}
        onShare={actions.sharePostcard}
      />
    </div>
  );
};
export type { Festival, CityEvent };
