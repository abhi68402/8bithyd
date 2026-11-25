import React, { useMemo, useState } from 'react';
import { Button, Card } from 'pixel-retroui';
import { PixelIcon } from './PixelIcon';
import './eventsDrawer.css';

export interface EventsDrawerProps {
  festival: { now: boolean; label: string; name: string; sub: string; blurb: string } | null;
  eventsList: { id: string; name: string; when: string; blurb: string; active: boolean; place?: string }[];
  walksList: { id: string; name: string; sub: string; placeId: string }[];
  onClose: () => void;
  onGoFestival: () => void;
  onLaunchEvent: (id: string) => void;
  onStopEvent?: (id: string) => void;
  onGoWalk: (placeId: string) => void;
}

type EventsTab = 'all' | 'happenings' | 'walks';

const PANEL_ALT = '#28213a';
const PANEL_ITEM = '#231c33';
const BORDER = '#5a4d7a';
const CREAM = '#f7efe0';
const TEAL = '#2dd4bf';
const MARIGOLD = '#f0a030';
const DARK_INK = '#1b1626';
const ROSE_BG = '#361922';
const ROSE_TEXT = '#ffb4b0';
const NO_SHADOW = 'transparent';

const TABS: { id: EventsTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'happenings', label: 'Happenings' },
  { id: 'walks', label: 'City Walks' },
];

const EVENT_PLACE_MAP: Record<string, string> = {
  match: 'Uppal Stadium',
  market: 'Charminar',
  kites: 'Parade Ground',
  laser: 'Lumbini Park',
  immersion: 'Tank Bund',
  bonalu: 'Golconda Fort',
  numaish: 'Nampally',
  flood: 'Low-lying Junctions',
};

const WALK_DISTRICT_MAP: Record<string, string> = {
  charminar: 'Old City',
  'mecca-masjid': 'Old City',
  'laad-bazaar': 'Old City',
  buddha: 'Lakeside',
  'tank-bund': 'Lakeside',
  lumbini: 'Lakeside',
  'cable-bridge': 'West',
  'cyber-towers': 'West',
  golconda: 'West',
  'qutb-shahi': 'West',
  'sec-junction': 'Secunderabad',
  'parade-ground': 'Secunderabad',
  airport: 'South',
  uppal: 'East',
};

const FESTIVAL_LOCATION_RULES: [RegExp, string][] = [
  [/tank bund|new year|telangana|ganesh|bathukamma|independence/i, 'Tank Bund'],
  [/numaish/i, 'Nampally'],
  [/sankranti|republic|dussehra/i, 'Parade Ground'],
  [/ramzan|diwali/i, 'Charminar'],
  [/eid|bakrid/i, 'Mecca Masjid'],
  [/holi/i, 'KBR Park'],
  [/bonalu/i, 'Golconda Fort'],
  [/christmas|st\.\s*mary/i, "St. Mary's"],
];

function formatSlug(raw: string): string {
  return raw
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveFestivalLocation(festival: NonNullable<EventsDrawerProps['festival']>): string {
  const sub = festival.sub.trim();
  if (sub && !/^(tap|click|preview)\b/i.test(sub)) return sub;
  for (const [pattern, place] of FESTIVAL_LOCATION_RULES) {
    if (pattern.test(festival.name)) return place;
  }
  const atMatch = festival.name.match(/\b(?:at|in)\s+(.+)$/i);
  if (atMatch) return formatSlug(atMatch[1]);
  return 'Hyderabad';
}

function resolveFestivalCountdown(festival: NonNullable<EventsDrawerProps['festival']>): {
  eyebrow: string;
  badge: string;
} {
  if (festival.now) {
    return {
      eyebrow: 'Today in Hyderabad',
      badge: 'LIVE TODAY',
    };
  }
  const label = festival.label.trim();
  const inDays = label.match(/\bIN\s+\d+\s+DAYS?\b/i);
  if (inDays) {
    return { eyebrow: 'Next Festival', badge: inDays[0].toUpperCase() };
  }
  if (/\bTOMORROW\b/i.test(label)) {
    return { eyebrow: 'Next Festival', badge: 'IN 1 DAY' };
  }
  return { eyebrow: 'Next Festival', badge: label || 'UPCOMING' };
}

function resolveEventPlace(ev: EventsDrawerProps['eventsList'][number]): string {
  if (ev.place && ev.place.trim()) {
    const p = ev.place.trim();
    return p.includes('-') && p === p.toLowerCase() ? formatSlug(p) : p;
  }
  if (EVENT_PLACE_MAP[ev.id]) return EVENT_PLACE_MAP[ev.id];
  const atMatch = ev.name.match(/\bat\s+(.+)$/i);
  if (atMatch) return atMatch[1].trim();
  return 'Hyderabad';
}

function resolveWalkDistrict(walk: EventsDrawerProps['walksList'][number]): string {
  if (WALK_DISTRICT_MAP[walk.placeId]) return WALK_DISTRICT_MAP[walk.placeId];
  if (WALK_DISTRICT_MAP[walk.id]) return WALK_DISTRICT_MAP[walk.id];
  return 'District';
}

type GlyphKind = 'pin' | 'clock' | 'play' | 'stop' | 'arrow';

const EdGlyph: React.FC<{ kind: GlyphKind; size?: number }> = ({ kind, size = 12 }) => {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'currentColor',
    shapeRendering: 'crispEdges' as const,
    'aria-hidden': true,
    style: { flex: 'none' },
  };
  switch (kind) {
    case 'pin':
      return (
        <svg {...props}>
          <path d="M5 2h6v1h2v5h-1v2h-2v2H9v2H7v-2H6v-2H4V8H3V3h2V2zm2 3v3h2V5H7z" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...props}>
          <path d="M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2V2zm0 2v1H4v6h1v1h6v-1h1V5h-1V4H5zm2 1h2v3h2v2H7V5z" />
        </svg>
      );
    case 'play':
      return (
        <svg {...props}>
          <path d="M4 2h2v1h2v2h2v2h2v2h-2v2H8v2H6v1H4V2z" />
        </svg>
      );
    case 'stop':
      return (
        <svg {...props}>
          <path d="M3 3h10v10H3V3z" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...props}>
          <path d="M3 7h7V5h2v2h1v2h-1v2h-2V9H3V7z" />
        </svg>
      );
  }
};

const FestivalHeroCard: React.FC<{
  festival: NonNullable<EventsDrawerProps['festival']>;
  onGoFestival: () => void;
}> = ({ festival, onGoFestival }) => {
  const { eyebrow, badge } = resolveFestivalCountdown(festival);
  const location = resolveFestivalLocation(festival);

  return (
    <Card
      className={`ed-hero-card${festival.now ? ' is-live' : ''}`}
      bg={PANEL_ALT}
      textColor={CREAM}
      borderColor={festival.now ? MARIGOLD : BORDER}
      shadowColor={NO_SHADOW}
    >
      <div className="ed-hero-top">
        <span className="ed-hero-eyebrow">{eyebrow}</span>
        <span className={`ed-badge ${festival.now ? 'ed-badge-live' : 'ed-badge-upcoming'}`}>
          {festival.now ? <PixelIcon name="events" size={12} color="#ffffff" /> : <EdGlyph kind="clock" size={12} />}
          <span>{badge}</span>
        </span>
      </div>

      <h3 className="ed-hero-title">{festival.name}</h3>

      <div className="ed-chip-row">
        <span className="ed-loc-chip">
          <EdGlyph kind="pin" size={12} />
          <span>{location}</span>
        </span>
      </div>

      <p className="ed-blurb">{festival.blurb}</p>

      <Button
        className={`ed-hero-btn${festival.now ? '' : ' is-preview'}`}
        bg={festival.now ? MARIGOLD : TEAL}
        textColor={DARK_INK}
        borderColor={festival.now ? MARIGOLD : TEAL}
        shadow={NO_SHADOW}
        onClick={onGoFestival}
      >
        <EdGlyph kind="play" size={12} />
        <span>{festival.now ? 'Fly There Now' : 'Preview Festival'}</span>
      </Button>
    </Card>
  );
};

const WalkCard: React.FC<{
  walk: EventsDrawerProps['walksList'][number];
  onGoWalk: (placeId: string) => void;
}> = ({ walk, onGoWalk }) => {
  const district = resolveWalkDistrict(walk);

  return (
    <Card className="ed-walk-card" bg={PANEL_ALT} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
      <button type="button" className="ed-walk-btn" onClick={() => onGoWalk(walk.placeId)}>
        <div className="ed-walk-head">
          <span className="ed-district-tag">{district}</span>
        </div>
        <div className="ed-walk-body">
          <span className="ed-walk-name">{walk.name}</span>
          <span className="ed-walk-sub">{walk.sub}</span>
        </div>
        <div className="ed-walk-foot">
          <span>Walk Here</span>
          <EdGlyph kind="arrow" size={12} />
        </div>
      </button>
    </Card>
  );
};

const HappeningCard: React.FC<{
  event: EventsDrawerProps['eventsList'][number];
  onLaunchEvent: (id: string) => void;
  onStopEvent?: (id: string) => void;
}> = ({ event, onLaunchEvent, onStopEvent }) => {
  const placeLabel = resolveEventPlace(event);
  const canStop = event.active && typeof onStopEvent === 'function';

  return (
    <Card
      className={`ed-event-card${event.active ? ' is-live' : ''}`}
      bg={PANEL_ALT}
      textColor={CREAM}
      borderColor={event.active ? MARIGOLD : BORDER}
      shadowColor={NO_SHADOW}
    >
      <div className="ed-event-meta">
        <span className="ed-loc-chip">
          <EdGlyph kind="pin" size={12} />
          <span>{placeLabel}</span>
        </span>
        <span className={`ed-status-pill ${event.active ? 'is-live' : 'is-when'}`}>
          {!event.active && <EdGlyph kind="clock" size={11} />}
          <span>{event.active ? 'ON NOW' : event.when}</span>
        </span>
      </div>

      <h4 className="ed-event-title">{event.name}</h4>

      <p className="ed-blurb">{event.blurb}</p>

      <div className={`ed-event-actions${canStop ? ' has-stop' : ''}`}>
        <Button
          className={`ed-act-btn ${event.active ? 'is-fly' : 'is-preview'}`}
          bg={event.active ? MARIGOLD : PANEL_ITEM}
          textColor={event.active ? DARK_INK : CREAM}
          borderColor={event.active ? MARIGOLD : BORDER}
          shadow={NO_SHADOW}
          onClick={() => onLaunchEvent(event.id)}
        >
          <EdGlyph kind="play" size={11} />
          <span>{event.active ? 'Fly There' : 'Preview Event'}</span>
        </Button>

        {canStop && (
          <Button
            className="ed-act-btn is-stop"
            bg={ROSE_BG}
            textColor={ROSE_TEXT}
            borderColor="#e0524c"
            shadow={NO_SHADOW}
            onClick={() => onStopEvent(event.id)}
          >
            <EdGlyph kind="stop" size={11} />
            <span>Stop</span>
          </Button>
        )}
      </div>
    </Card>
  );
};

export const EventsDrawer: React.FC<EventsDrawerProps> = ({
  festival,
  eventsList,
  walksList,
  onClose,
  onGoFestival,
  onLaunchEvent,
  onStopEvent,
  onGoWalk,
}) => {
  const [tab, setTab] = useState<EventsTab>('all');

  const orderedEvents = useMemo(
    () => [...eventsList.filter((ev) => ev.active), ...eventsList.filter((ev) => !ev.active)],
    [eventsList],
  );
  const activeEventsCount = useMemo(
    () => eventsList.reduce((sum, ev) => sum + (ev.active ? 1 : 0), 0),
    [eventsList],
  );
  const activeCount = activeEventsCount + (festival?.now ? 1 : 0);

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (idx + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next].id);
  };

  const showFestival = tab === 'all' && festival !== null;
  const showWalks = tab === 'all' || tab === 'walks';
  const showHappenings = tab === 'all' || tab === 'happenings';

  return (
    <div className="ed-shell">
      <div className="ed-head">
        <div className="ed-title-group">
          <h2 className="ed-title">EVENTS &amp; WALKS</h2>
          {activeCount > 0 && (
            <span className="ed-live-pill">
              <span className="ed-live-dot" aria-hidden="true" />
              <span>{activeCount} LIVE</span>
            </span>
          )}
        </div>
        <Button
          className="ed-close-btn"
          bg={PANEL_ALT}
          textColor={CREAM}
          borderColor={BORDER}
          shadow={NO_SHADOW}
          aria-label="Close events drawer"
          onClick={onClose}
        >
          <PixelIcon name="close" size={12} />
        </Button>
      </div>

      <p className="ed-sub">Jump to iconic Hyderabad walks or preview a live festival anytime.</p>

      <div className="ed-tabs" role="tablist" aria-label="Events filter">
        {TABS.map((t, idx) => {
          const active = tab === t.id;
          return (
            <Button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`ed-tab${active ? ' is-active' : ''}`}
              bg={active ? MARIGOLD : PANEL_ALT}
              textColor={active ? DARK_INK : CREAM}
              borderColor={active ? MARIGOLD : 'transparent'}
              shadow={NO_SHADOW}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
            >
              {t.id === 'happenings' && activeEventsCount > 0 && <span className="ed-tab-dot" aria-hidden="true" />}
              <span>{t.label}</span>
            </Button>
          );
        })}
      </div>

      <div className="ed-scroll">
        {showFestival && <FestivalHeroCard festival={festival} onGoFestival={onGoFestival} />}

        {showWalks && (
          <section className="ed-section" aria-label="Curated city walks">
            <div className="ed-section-head">
              <span className="ed-section-label">CURATED CITY WALKS</span>
              <span className="ed-section-meta">{walksList.length} routes</span>
            </div>
            {walksList.length > 0 ? (
              <div className="ed-walk-grid">
                {walksList.map((walk) => (
                  <WalkCard key={walk.id} walk={walk} onGoWalk={onGoWalk} />
                ))}
              </div>
            ) : (
              <Card className="ed-empty-card" bg={PANEL_ITEM} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
                <p className="ed-empty-text">No curated walks available.</p>
              </Card>
            )}
          </section>
        )}

        {showHappenings && (
          <section className="ed-section" aria-label="City happenings">
            <div className="ed-section-head">
              <span className="ed-section-label">CITY HAPPENINGS</span>
              <span className="ed-section-meta">{orderedEvents.length} events</span>
            </div>
            {orderedEvents.length > 0 ? (
              <div className="ed-events-list">
                {orderedEvents.map((ev) => (
                  <HappeningCard
                    key={ev.id}
                    event={ev}
                    onLaunchEvent={onLaunchEvent}
                    onStopEvent={onStopEvent}
                  />
                ))}
              </div>
            ) : (
              <Card className="ed-empty-card" bg={PANEL_ITEM} textColor={CREAM} borderColor={BORDER} shadowColor={NO_SHADOW}>
                <p className="ed-empty-text">No scheduled city happenings right now.</p>
              </Card>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
