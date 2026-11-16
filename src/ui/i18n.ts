// English / Hindi strings. `t(key, vars)` looks up the current language and
// fills {placeholders}. Static HTML opts in with data-i18n (text),
// data-i18n-ph (placeholder), data-i18n-aria (aria-label) and data-i18n-title.
// Language comes from ?lang=hi|en, then the saved choice, then the browser.

export type Lang = 'en' | 'hi';

type Dict = Record<string, string>;

const EN: Dict = {
  'boot.unroll': 'Unrolling the map...',
  'boot.drawing': 'Drawing {n} buildings...',
  'boot.waking': 'Waking everyone up...',
  'boot.ready': 'Ready!',
  'boot.didyouknow': 'DID YOU KNOW?',
  'boot.tapfact': 'Tap for another fact',
  'boot.tip': 'TIP: {tip}',
  'boot.share': 'SHARE WITH A HYDERABADI',
  'boot.copied': 'LINK COPIED!',
  'boot.shareText': 'Explore Hyderabad as a living pixel city',
  'boot.credit': 'Real streets from OpenStreetMap · made with love in pixels',
  'lang.switch': 'हिंदी',
  'lang.switchAria': 'हिंदी में देखें',

  'brand.sub': 'the real city, in pixels',
  'btn.passport': 'PASSPORT',
  'btn.views': 'MAP VIEWS',
  'ov.roads': 'ROADS', 'ov.metro': 'METRO', 'ov.traffic': 'TRAFFIC', 'ov.density': 'DENSITY', 'ov.landuse': 'LAND USE', 'ov.none': 'OFF',
  'clock.live': 'LIVE', 'clock.liveTitle': 'Follow real Hyderabad time and weather',
  'clock.rain': 'RAIN', 'clock.signs': 'SIGNS', 'clock.game': 'GAME TIME',
  'clock.pause': 'Pause', 'clock.normal': 'Normal speed', 'clock.fast': 'Fast', 'clock.timeOfDay': 'Time of day',
  'zoom.in': 'Zoom in', 'zoom.out': 'Zoom out',
  'passport.title': 'CITY PASSPORT', 'passport.close': 'Close passport',
  'passport.sub': 'Wander the city to stamp every place.', 'passport.search': 'Search places',
  'passport.stamped': '{n} stamped', 'passport.none': 'No place by that name.',
  'card.close': 'Close', 'card.fly': 'FLY THERE', 'card.stop': 'STOP',
  'card.stampedTag': 'STAMPED', 'card.citizen': 'CITIZEN', 'card.metro': 'METRO', 'card.road': 'ON THE ROAD',
  'hint': 'DRAG TO EXPLORE · SCROLL TO ZOOM · TAP ANYTHING THAT MOVES',
  'credit': 'Map data © OpenStreetMap contributors',
  'pulse.title': 'CITY PULSE',
  'pulse.buildings': '{n} REAL BUILDINGS ON THE MAP',
  'pulse.traffic': 'TRAFFIC: {s}', 'pulse.honk': 'HONKING EVERYWHERE', 'pulse.busy': 'BUSY, AS USUAL', 'pulse.smooth': 'SMOOTH FOR ONCE',
  'pulse.chai': '{n} CUPS OF CHAI POURED TODAY',
  'pulse.metro': 'METRO: {t} TRAINS ON {l} LINES',
  'pulse.onNow': 'ON NOW: {e}', 'pulse.monsoon': 'MONSOON SHOWER OVER THE CITY', 'pulse.lights': 'CITY LIGHTS ARE ON', 'pulse.clear': 'CLEAR DECCAN SKIES',
  'toast.event': 'HAPPENING NOW: {e} · TAP TO GO',
  'toast.complete': 'PASSPORT COMPLETE! YOU KNOW HYDERABAD.',
  'toast.stamped': 'STAMPED: {p} · {n}/{t}',
  'view.metro': 'NEAREST TO CENTRE: {st} ({line}) · {dist} · {min} MIN WALK', 'view.noMetro': 'NO METRO DATA',
  'view.roadsZoom': 'MAIN ROADS SHOWN · ZOOM IN FOR EVERY STREET',
  'view.roads': 'AROUND HERE: {main} KM MAIN ROADS · {local} KM STREETS',
  'view.traffic': 'SIMULATED FROM TIME, RAIN AND EVENTS · MAIN ROADS {s}',
  'view.density': 'BUILT FLOOR AREA PER 32 M CELL, FROM REAL FOOTPRINTS',
  'view.landuse': 'LAND USE AS MAPPED IN OPENSTREETMAP',
  'unit.m': '{n} M', 'unit.km': '{n} KM',
  'part.night': 'NIGHT', 'part.dawn': 'DAWN', 'part.morning': 'MORNING', 'part.afternoon': 'AFTERNOON', 'part.evening': 'EVENING', 'part.rain': 'RAIN',
  'days': 'SUNDAY,MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY',
  'live.offline': 'LIVE · WEATHER OFFLINE', 'live.checking': 'LIVE · CHECKING SKY', 'live.label': 'LIVE · {t}°C · {d}',
};

const HI: Dict = {
  'boot.unroll': 'नक्शा खुल रहा है...',
  'boot.drawing': '{n} इमारतें बन रही हैं...',
  'boot.waking': 'सबको जगा रहे हैं...',
  'boot.ready': 'तैयार!',
  'boot.didyouknow': 'क्या आप जानते हैं?',
  'boot.tapfact': 'अगली बात के लिए टैप करें',
  'boot.tip': 'टिप: {tip}',
  'boot.share': 'किसी हैदराबादी को भेजें',
  'boot.copied': 'लिंक कॉपी हो गया!',
  'boot.shareText': 'हैदराबाद को एक ज़िंदा पिक्सेल शहर की तरह घूमिए',
  'boot.credit': 'असली सड़कें OpenStreetMap से · पिक्सेल में प्यार से बनाया',
  'lang.switch': 'ENGLISH',
  'lang.switchAria': 'View in English',

  'brand.sub': 'असली शहर, पिक्सेल में',
  'btn.passport': 'पासपोर्ट',
  'btn.views': 'नक्शे',
  'ov.roads': 'सड़कें', 'ov.metro': 'मेट्रो', 'ov.traffic': 'ट्रैफ़िक', 'ov.density': 'घनत्व', 'ov.landuse': 'ज़मीन', 'ov.none': 'बंद',
  'clock.live': 'लाइव', 'clock.liveTitle': 'असली हैदराबाद का समय और मौसम',
  'clock.rain': 'बारिश', 'clock.signs': 'नाम', 'clock.game': 'खेल का समय',
  'clock.pause': 'रोकें', 'clock.normal': 'सामान्य रफ़्तार', 'clock.fast': 'तेज़', 'clock.timeOfDay': 'दिन का समय',
  'zoom.in': 'ज़ूम इन', 'zoom.out': 'ज़ूम आउट',
  'passport.title': 'शहर पासपोर्ट', 'passport.close': 'पासपोर्ट बंद करें',
  'passport.sub': 'शहर घूमिए और हर जगह का ठप्पा लगाइए।', 'passport.search': 'जगह खोजें',
  'passport.stamped': '{n} ठप्पे लगे', 'passport.none': 'इस नाम की कोई जगह नहीं मिली।',
  'card.close': 'बंद करें', 'card.fly': 'वहाँ चलें', 'card.stop': 'रुकें',
  'card.stampedTag': 'ठप्पा लगा', 'card.citizen': 'शहरवासी', 'card.metro': 'मेट्रो', 'card.road': 'सड़क पर',
  'hint': 'खींचकर घूमें · स्क्रॉल से ज़ूम · जो चलता दिखे उस पर टैप करें',
  'credit': 'नक्शा डेटा © OpenStreetMap योगदानकर्ता',
  'pulse.title': 'शहर की धड़कन',
  'pulse.buildings': 'नक्शे पर {n} असली इमारतें',
  'pulse.traffic': 'ट्रैफ़िक: {s}', 'pulse.honk': 'हर तरफ़ हॉर्न', 'pulse.busy': 'हमेशा की तरह भीड़', 'pulse.smooth': 'आज तो सब साफ़',
  'pulse.chai': 'आज {n} कप चाय पी गई',
  'pulse.metro': 'मेट्रो: {l} लाइनों पर {t} ट्रेनें',
  'pulse.onNow': 'अभी चल रहा है: {e}', 'pulse.monsoon': 'शहर पर मानसून की बौछार', 'pulse.lights': 'शहर की बत्तियाँ जल गईं', 'pulse.clear': 'दक्कन का साफ़ आसमान',
  'toast.event': 'अभी हो रहा है: {e} · जाने के लिए टैप करें',
  'toast.complete': 'पासपोर्ट पूरा! आप हैदराबाद को जानते हैं।',
  'toast.stamped': 'ठप्पा लगा: {p} · {n}/{t}',
  'view.metro': 'सबसे पास: {st} ({line}) · {dist} · {min} मिनट पैदल', 'view.noMetro': 'मेट्रो डेटा नहीं है',
  'view.roadsZoom': 'मुख्य सड़कें दिख रही हैं · हर गली के लिए ज़ूम करें',
  'view.roads': 'यहाँ आसपास: {main} किमी मुख्य सड़कें · {local} किमी गलियाँ',
  'view.traffic': 'समय, बारिश और आयोजनों से अनुमानित · मुख्य सड़कें {s}',
  'view.density': 'हर 32 मीटर में बना हुआ क्षेत्र, असली इमारतों से',
  'view.landuse': 'OpenStreetMap के अनुसार ज़मीन का इस्तेमाल',
  'unit.m': '{n} मीटर', 'unit.km': '{n} किमी',
  'part.night': 'रात', 'part.dawn': 'भोर', 'part.morning': 'सुबह', 'part.afternoon': 'दोपहर', 'part.evening': 'शाम', 'part.rain': 'बारिश',
  'days': 'रविवार,सोमवार,मंगलवार,बुधवार,गुरुवार,शुक्रवार,शनिवार',
  'live.offline': 'लाइव · मौसम उपलब्ध नहीं', 'live.checking': 'लाइव · आसमान देख रहे हैं', 'live.label': 'लाइव · {t}°C · {d}',
};

/** Hindi for map vocabulary that comes from data files. */
const HI_WORDS: Record<string, string> = {
  // areas
  'Old City': 'पुराना शहर', Lakeside: 'झील किनारे', Secunderabad: 'सिकंदराबाद', East: 'पूर्व', West: 'पश्चिम', South: 'दक्षिण',
  // legends
  Flowing: 'खुला', Slow: 'धीमा', Jammed: 'जाम', 'Red line': 'लाल लाइन', 'Blue line': 'नीली लाइन', 'Green line': 'हरी लाइन',
  '10 min walk': '10 मिनट पैदल', Railway: 'रेलवे', Sparse: 'बहुत कम', Low: 'कम', Medium: 'मध्यम', Dense: 'घना', 'Very dense': 'बहुत घना',
  Packed: 'ठसाठस', Residential: 'रिहायशी', Commercial: 'व्यापारिक', Industrial: 'औद्योगिक', Parks: 'पार्क', Forest: 'जंगल',
  Farmland: 'खेत', Military: 'सेना', Water: 'पानी',
  // weather
  Clear: 'साफ़', 'Partly cloudy': 'हल्के बादल', Overcast: 'घने बादल', Fog: 'कोहरा', Drizzle: 'बूँदाबाँदी', Rain: 'बारिश',
  Sleet: 'ओले', Showers: 'बौछारें', Thunderstorm: 'आँधी-तूफ़ान',
  // events
  'Match night at Uppal': 'उप्पल में मैच की रात', 'Night market at Charminar': 'चारमीनार का रात का बाज़ार', 'Kite festival': 'पतंग उत्सव',
  'Laser show at Lumbini Park': 'लुंबिनी पार्क में लेज़र शो', 'Ganesh immersion': 'गणेश विसर्जन', 'Bonalu at Golconda': 'गोलकोंडा में बोनालु',
  'Numaish exhibition': 'नुमाइश प्रदर्शनी', 'Monsoon waterlogging': 'मानसून में जलभराव',
};

/** Hindi place names, keyed by place id. */
export const PLACE_HI: Record<string, string> = {
  charminar: 'चारमीनार', 'mecca-masjid': 'मक्का मस्जिद', 'laad-bazaar': 'लाड बाज़ार', chowmahalla: 'चौमहल्ला पैलेस',
  falaknuma: 'फ़लकनुमा पैलेस', 'salar-jung': 'सालार जंग संग्रहालय', 'high-court': 'हाई कोर्ट', 'osmania-hospital': 'उस्मानिया जनरल अस्पताल',
  zoo: 'नेहरू चिड़ियाघर', 'mir-alam': 'मीर आलम तालाब', buddha: 'हुसैन सागर के बुद्ध', 'tank-bund': 'टैंक बंड',
  'necklace-road': 'नेकलेस रोड', lumbini: 'लुंबिनी पार्क', 'ntr-gardens': 'एनटीआर गार्डन', 'birla-mandir': 'बिड़ला मंदिर',
  secretariat: 'सचिवालय', assembly: 'विधानसभा', 'public-gardens': 'पब्लिक गार्डन', nampally: 'नामपल्ली स्टेशन', abids: 'आबिड्स',
  'clock-tower': 'सिकंदराबाद क्लॉक टावर', 'sec-junction': 'सिकंदराबाद जंक्शन', 'parade-ground': 'परेड ग्राउंड',
  'st-marys': 'सेंट मैरीज़ बेसिलिका', 'ou-arts': 'उस्मानिया आर्ट्स कॉलेज', uppal: 'उप्पल स्टेडियम', ramoji: 'रामोजी फ़िल्म सिटी',
  golconda: 'गोलकोंडा किला', 'qutb-shahi': 'क़ुतुब शाही मक़बरे', taramati: 'तारामती बारादरी', 'cable-bridge': 'दुर्गम चेरुवु केबल ब्रिज',
  'cyber-towers': 'साइबर टावर्स', shilparamam: 'शिल्पारामम', gachibowli: 'गच्चीबौली स्टेडियम', 'financial-district': 'फ़ाइनेंशियल डिस्ट्रिक्ट',
  'kbr-park': 'केबीआर पार्क', airport: 'शमशाबाद हवाई अड्डा',
};

const KEY = 'hd.lang';
// The UI stays in English; Hindi appears only in greetings next to Telugu.
// The Hindi table is kept so a full Hindi mode can be switched back on later.
let current: Lang = 'en';
const listeners: ((l: Lang) => void)[] = [];


export const lang = () => current;

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = (current === 'hi' ? HI[key] : undefined) ?? EN[key] ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** Translates a data word (area, legend, weather, event name); falls back to English. */
export const word = (s: string) => (current === 'hi' && HI_WORDS[s]) || s;

/** The HUD shouts in English capitals; Devanagari has no case. */
export const up = (s: string) => (current === 'hi' ? s : s.toUpperCase());

export function onLang(cb: (l: Lang) => void) { listeners.push(cb); }

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  applyStatic();
  for (const cb of listeners) cb(l);
}

export function toggleLang() { setLang(current === 'hi' ? 'en' : 'hi'); }

/** A button that flips between English and Hindi (labelled by applyStatic). */
export function langButton(extra = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `langBtn ${extra}`.trim();
  b.addEventListener('click', toggleLang);
  return b;
}

export function applyStatic(_root?: ParentNode) {
  document.documentElement.lang = current;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n!); });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-ph]').forEach((e) => { e.placeholder = t(e.dataset.i18nPh!); });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((e) => { e.setAttribute('aria-label', t(e.dataset.i18nAria!)); });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle!); });
  document.querySelectorAll<HTMLButtonElement>('.langBtn').forEach((b) => {
    b.textContent = t('lang.switch');
    b.setAttribute('aria-label', t('lang.switchAria'));
    b.lang = current === 'hi' ? 'en' : 'hi';
  });
}
