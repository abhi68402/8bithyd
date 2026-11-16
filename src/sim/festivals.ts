// Real-world festival calendar for Hyderabad. Pure data and date maths (no
// DOM) so it is unit-testable. The festival is picked from today's real date
// in India; the game clock only decides whether its show is on right now.
//
// Fixed-date festivals repeat every year ("MM-DD"). Lunar festivals move, so
// they carry explicit ranges ("YYYY-MM-DD..YYYY-MM-DD") for 2026 and 2027.
// Those are approximate (moon sightings shift Eid by a day) and the list needs
// a refresh before 2028.

import type { CityEvent } from './events';

export interface Festival extends Omit<CityEvent, 'days'> {
  /** "MM-DD", "MM-DD..MM-DD", "YYYY-MM-DD" or "YYYY-MM-DD..YYYY-MM-DD" */
  dates: string[];
}

export const FESTIVALS: Festival[] = [
  { id: 'f-newyear', name: 'New Year at Tank Bund', place: 'tank-bund', from: 0, to: 1.5, r: 260, crowd: 160, jam: 900,
    blurb: 'The city counts down by the lake, then the sky over Hussain Sagar lights up.', fx: ['crowd', 'fireworks', 'strings'], dates: ['01-01'] },
  { id: 'f-numaish', name: 'Numaish exhibition', place: 'nampally', from: 16, to: 23, r: 170, crowd: 120, jam: 500,
    blurb: 'The All India Industrial Exhibition: six weeks of stalls, rides and snacks at Nampally.', fx: ['crowd', 'ferris', 'strings'], dates: ['01-01..02-15'] },
  { id: 'f-sankranti', name: 'Sankranti kite festival', place: 'parade-ground', sites: ['parade-ground', 'necklace-road', 'golconda'], from: 8, to: 18.5, r: 240, crowd: 90,
    blurb: 'Every rooftop and open ground fills with kites. Watch out for manja on the roads.', fx: ['crowd', 'kites'], dates: ['01-13..01-15'] },
  { id: 'f-republic', name: 'Republic Day parade', place: 'parade-ground', from: 8, to: 11.5, r: 200, crowd: 140, jam: 600,
    blurb: 'Marching contingents and flags on Parade Ground, Secunderabad.', fx: ['crowd', 'confetti'], dates: ['01-26'] },
  { id: 'f-ramzan', name: 'Ramzan nights in the Old City', place: 'charminar', sites: ['charminar', 'mecca-masjid', 'laad-bazaar'], from: 18.5, to: 24, r: 150, crowd: 170, jam: 500,
    blurb: 'After iftar the lanes around Charminar glow till late: haleem, pathar ka gosht and bangles.', fx: ['crowd', 'strings'], dates: ['2026-02-18..2026-03-19', '2027-02-08..2027-03-09'] },
  { id: 'f-eid', name: 'Eid prayers at Mecca Masjid', place: 'mecca-masjid', sites: ['mecca-masjid', 'charminar'], from: 6.5, to: 13, r: 160, crowd: 180, jam: 700,
    blurb: 'Eid Mubarak! Thousands gather for prayers, then it is sheer khurma at every home.', fx: ['crowd', 'confetti'], dates: ['2026-03-20..2026-03-21', '2027-03-10..2027-03-11'] },
  { id: 'f-holi', name: 'Holi colours', place: 'kbr-park', sites: ['kbr-park', 'necklace-road', 'ou-arts'], from: 8.5, to: 14, r: 180, crowd: 110,
    blurb: 'Colour, music and water balloons. Nobody goes home clean.', fx: ['crowd', 'confetti'], dates: ['2026-03-04', '2027-03-22'] },
  { id: 'f-bakrid', name: 'Bakrid at Mecca Masjid', place: 'mecca-masjid', from: 6.5, to: 12, r: 160, crowd: 170, jam: 600,
    blurb: 'Eid al-Adha prayers in the Old City, followed by family feasts.', fx: ['crowd'], dates: ['2026-05-27', '2027-05-17'] },
  { id: 'f-telangana', name: 'Telangana Formation Day', place: 'tank-bund', sites: ['tank-bund', 'secretariat'], from: 18, to: 22.5, r: 260, crowd: 140, jam: 700,
    blurb: 'The state turns another year older: lights along Tank Bund and fireworks over the lake.', fx: ['crowd', 'strings', 'fireworks'], dates: ['06-02'] },
  { id: 'f-bonalu', name: 'Bonalu festival', place: 'golconda', sites: ['golconda', 'laad-bazaar'], from: 7, to: 14, r: 260, crowd: 140, jam: 700,
    blurb: 'The Ashada month festival to Goddess Mahakali: decorated pots, drums and Pothuraju dancers.', fx: ['crowd', 'confetti'], dates: ['2026-07-15..2026-08-12', '2027-07-04..2027-08-01'] },
  { id: 'f-independence', name: 'Independence Day', place: 'tank-bund', sites: ['tank-bund', 'golconda'], from: 7.5, to: 21, r: 240, crowd: 130, jam: 600,
    blurb: 'Flags everywhere and the tricolour lighting up the city after dark.', fx: ['crowd', 'strings'], dates: ['08-15'] },
  { id: 'f-ganesh', name: 'Ganesh Chaturthi', place: 'tank-bund', sites: ['tank-bund', 'necklace-road'], from: 17, to: 23.5, r: 300, crowd: 170, jam: 1100,
    blurb: 'Ten days of pandals across the city, ending in giant immersion processions at Hussain Sagar.', fx: ['crowd', 'strings', 'fireworks'], dates: ['2026-09-14..2026-09-25', '2027-09-04..2027-09-14'] },
  { id: 'f-bathukamma', name: 'Bathukamma', place: 'tank-bund', sites: ['tank-bund', 'lumbini'], from: 16.5, to: 21, r: 240, crowd: 150, jam: 600,
    blurb: 'Telangana\'s flower festival: women sing and dance around towering stacks of flowers.', fx: ['crowd', 'confetti', 'strings'], dates: ['2026-10-10..2026-10-18', '2027-09-29..2027-10-07'] },
  { id: 'f-dussehra', name: 'Dussehra', place: 'parade-ground', from: 17, to: 22, r: 220, crowd: 150, jam: 600,
    blurb: 'Ravana effigies go up in flames and friends swap jammi leaves for luck.', fx: ['crowd', 'fireworks'], dates: ['2026-10-20', '2027-10-09'] },
  { id: 'f-diwali', name: 'Diwali', place: 'charminar', sites: ['charminar', 'tank-bund', 'birla-mandir'], from: 18, to: 24, r: 220, crowd: 120, jam: 500,
    blurb: 'Diyas on every ledge and crackers till midnight.', fx: ['crowd', 'strings', 'fireworks'], dates: ['2026-11-07..2026-11-09', '2027-10-28..2027-10-30'] },
  { id: 'f-christmas', name: 'Christmas at St. Mary\'s', place: 'st-marys', from: 18, to: 24, r: 140, crowd: 110, jam: 300,
    blurb: 'Midnight mass, stars on balconies and plum cake from every bakery.', fx: ['crowd', 'strings'], dates: ['12-24..12-25'] },
  { id: 'f-nye', name: 'New Year\'s Eve', place: 'tank-bund', sites: ['tank-bund', 'cyber-towers'], from: 20, to: 24, r: 260, crowd: 160, jam: 900,
    blurb: 'Parties from Hitec City to the lake, all waiting for midnight.', fx: ['crowd', 'strings', 'fireworks'], dates: ['12-31'] },
];

export interface Day { y: number; m: number; d: number }

/** Today's date in India (IST, UTC+5:30), whatever the visitor's own timezone. */
export function indiaToday(now = new Date()): Day {
  const t = new Date(now.getTime() + 5.5 * 3600e3);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const dayNum = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86400e3;

/** Absolute [start, end] day numbers of one date spec, for the given year. */
function span(spec: string, year: number): [number, number] {
  const [a, b = a] = spec.split('..');
  const one = (s: string): number => {
    const p = s.split('-').map(Number);
    return p.length === 3 ? dayNum(p[0], p[1], p[2]) : dayNum(year, p[0], p[1]);
  };
  let s = one(a), e = one(b);
  if (e < s) e = one(b) + 365; // a yearly range that wraps past New Year
  return [s, e];
}

/** Festivals happening on this date. */
export function festivalsOn(day: Day): Festival[] {
  const n = dayNum(day.y, day.m, day.d);
  return FESTIVALS.filter((f) => f.dates.some((spec) => {
    for (const y of [day.y - 1, day.y]) { const [s, e] = span(spec, y); if (n >= s && n <= e) return true; }
    return false;
  }));
}

/** The next festival that starts after this date, and how many days away it is. */
export function nextFestival(day: Day): { f: Festival; days: number } | null {
  const n = dayNum(day.y, day.m, day.d);
  let best: { f: Festival; days: number } | null = null;
  for (const f of FESTIVALS) for (const spec of f.dates) for (const y of [day.y, day.y + 1]) {
    const [s] = span(spec, y);
    if (s > n && (!best || s - n < best.days)) best = { f, days: s - n };
  }
  return best;
}
