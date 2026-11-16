// Loading screen: a little pixel scene (Charminar at night, a kite, an auto
// rickshaw puttering past) plus a rotating "did you know" fact. Everything that
// moves is a CSS transform/opacity animation so it keeps playing on the
// compositor while the main thread is busy baking the city.

import { t, lang, onLang, applyStatic } from './i18n';

const FACTS: { en: string; hi: string }[] = [
  { en: 'Charminar was built in 1591 by Muhammad Quli Qutb Shah, the founder of Hyderabad.',
    hi: 'चारमीनार 1591 में मुहम्मद क़ुली क़ुतुब शाह ने बनवाया था, जिन्होंने हैदराबाद शहर बसाया।' },
  { en: 'Hyderabad is called the City of Pearls. It was once a great pearl and diamond trading hub.',
    hi: 'हैदराबाद को "मोतियों का शहर" कहते हैं। यह कभी मोतियों और हीरों के व्यापार का बड़ा केंद्र था।' },
  { en: 'The Koh-i-Noor diamond is believed to have come from the mines of the Golconda region.',
    hi: 'माना जाता है कि कोहिनूर हीरा गोलकोंडा इलाके की खदानों से निकला था।' },
  { en: 'Clap under the entrance dome of Golconda Fort and the sound carries up to the hilltop pavilion.',
    hi: 'गोलकोंडा किले के प्रवेश द्वार के गुंबद के नीचे ताली बजाइए, आवाज़ पहाड़ी की चोटी तक पहुँचती है।' },
  { en: 'Hussain Sagar lake dates back to 1562. A giant monolithic Buddha stands on a rock in its middle.',
    hi: 'हुसैन सागर झील 1562 में बनी थी। इसके बीच एक चट्टान पर बुद्ध की विशाल एकाश्म प्रतिमा खड़ी है।' },
  { en: 'Hussain Sagar separates the twin cities, Hyderabad and Secunderabad.',
    hi: 'हुसैन सागर जुड़वाँ शहरों, हैदराबाद और सिकंदराबाद, को अलग करता है।' },
  { en: 'Ramoji Film City holds the Guinness record as the largest film studio complex in the world.',
    hi: 'गिनीज़ रिकॉर्ड के अनुसार रामोजी फ़िल्म सिटी दुनिया का सबसे बड़ा फ़िल्म स्टूडियो परिसर है।' },
  { en: 'Hyderabadi biryani is cooked "dum" style: sealed in a pot and slow-cooked in its own steam.',
    hi: 'हैदराबादी बिरयानी "दम" पर पकती है: बर्तन सील करके, उसकी अपनी भाप में धीमी आँच पर।' },
  { en: 'Irani chai arrived with Iranian migrants. Locals dunk Osmania biscuits in it.',
    hi: 'ईरानी चाय ईरान से आए लोगों के साथ आई। यहाँ के लोग इसमें उस्मानिया बिस्कुट डुबोकर खाते हैं।' },
  { en: 'Osmania biscuits are named after Mir Osman Ali Khan, the last Nizam of Hyderabad.',
    hi: 'उस्मानिया बिस्कुट का नाम हैदराबाद के आख़िरी निज़ाम, मीर उस्मान अली ख़ान, के नाम पर पड़ा।' },
  { en: 'In 1937 Time magazine put the last Nizam on its cover as the richest man in the world.',
    hi: '1937 में टाइम पत्रिका ने आख़िरी निज़ाम को दुनिया का सबसे अमीर आदमी बताकर कवर पर छापा।' },
  { en: 'Hyderabadi haleem has a Geographical Indication tag, the first meat dish in India to get one.',
    hi: 'हैदराबादी हलीम को GI टैग मिला है। यह टैग पाने वाला भारत का पहला मांसाहारी व्यंजन है।' },
  { en: 'Laad Bazaar, right next to Charminar, has been famous for its glittering bangles for centuries.',
    hi: 'चारमीनार के ठीक बगल में लाड बाज़ार सदियों से अपनी चमचमाती चूड़ियों के लिए मशहूर है।' },
  { en: 'Salar Jung Museum has a musical clock whose little figure strikes a gong every hour.',
    hi: 'सालार जंग संग्रहालय में एक संगीत घड़ी है, जिसका छोटा पुतला हर घंटे घंटा बजाता है।' },
  { en: 'In Hyderabadi Urdu, "haau" means yes and "nakko" means no.',
    hi: 'हैदराबादी में "हौ" का मतलब हाँ और "नक्को" का मतलब ना है।' },
  { en: 'Chowmahalla Palace was the seat of the Asaf Jahi dynasty, the Nizams of Hyderabad.',
    hi: 'चौमहल्ला पैलेस आसफ़ जाही वंश, यानी हैदराबाद के निज़ामों, की गद्दी था।' },
  { en: 'During Bonalu, women carry decorated pots of offerings to the goddess Mahakali.',
    hi: 'बोनालु में महिलाएँ सजे हुए घड़ों में देवी महाकाली के लिए भोग ले जाती हैं।' },
];

const ROTATE_MS = 4200;
const MIN_SHOW_MS = 3000; // long enough to read at least one fact

const SVG = 'http://www.w3.org/2000/svg';

// [x, y, w, h, colour] in a 120x48 pixel grid
type R = [number, number, number, number, string];
const SAND = '#e8c48a', SHADE = '#c99a5b', DARK = '#1a1326', GLOW = '#f0a030';

function charminar(): R[] {
  const r: R[] = [];
  // ground and road
  r.push([0, 44, 120, 4, '#3a2e4a'], [0, 45, 120, 1, '#5a4a6a']);
  // main body
  r.push([46, 22, 28, 22, SAND], [46, 22, 2, 22, SHADE]);
  // great arch
  r.push([54, 30, 12, 14, DARK], [55, 28, 10, 2, DARK], [57, 27, 6, 1, DARK]);
  r.push([55, 29, 1, 1, SAND], [64, 29, 1, 1, SAND]);
  // lit windows on the upper gallery
  r.push([47, 17, 26, 5, SAND], [47, 21, 26, 1, SHADE]);
  for (let x = 49; x < 72; x += 4) r.push([x, 18, 2, 2, GLOW]);
  // side niches
  r.push([49, 32, 3, 6, DARK], [68, 32, 3, 6, DARK]);
  // central dome
  r.push([56, 13, 8, 4, SAND], [58, 11, 4, 2, SAND], [59, 9, 2, 2, SHADE]);
  // two minarets
  for (const mx of [41, 75]) {
    r.push([mx, 6, 4, 38, SAND], [mx, 6, 1, 38, SHADE]);
    for (const by of [14, 24, 34]) r.push([mx - 1, by, 6, 2, SAND], [mx - 1, by + 2, 6, 1, SHADE]);
    r.push([mx, 3, 4, 3, SAND], [mx + 1, 1, 2, 2, SAND], [mx + 1, 0, 2, 1, SHADE]);
  }
  // moon
  const M = '#f6ecd2';
  r.push([102, 3, 3, 1, M], [101, 4, 2, 1, M], [100, 5, 2, 3, M], [101, 8, 2, 1, M], [102, 9, 3, 1, M]);
  return r;
}

const STARS: [number, number][] = [[8, 6], [20, 14], [31, 4], [90, 16], [112, 22], [14, 26], [96, 3], [26, 34], [108, 34]];

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}

function rects(svg: SVGSVGElement, list: R[]) {
  for (const [x, y, width, height, fill] of list) svg.appendChild(el('rect', { x, y, width, height, fill }));
}

function buildScene(): HTMLElement {
  const scene = document.createElement('div');
  scene.className = 'bootScene';
  scene.setAttribute('aria-hidden', 'true');

  const sky = el('svg', { viewBox: '0 0 120 48', 'shape-rendering': 'crispEdges', class: 'bootSky' });
  rects(sky, charminar());
  STARS.forEach(([x, y], i) => {
    const s = el('rect', { x, y, width: 1, height: 1, fill: '#f6ecd2', class: 'star' });
    s.style.animationDelay = `${(i * 0.37) % 2}s`;
    sky.appendChild(s);
  });
  scene.appendChild(sky);

  // kite on its own layer so it can sway
  const kite = el('svg', { viewBox: '0 0 12 20', 'shape-rendering': 'crispEdges', class: 'bootKite' });
  rects(kite, [[5, 0, 2, 1, '#d8433b'], [4, 1, 4, 1, '#d8433b'], [3, 2, 6, 1, '#d8433b'], [2, 3, 8, 1, '#f0a030'],
    [3, 4, 6, 1, '#f0a030'], [4, 5, 4, 1, '#f0a030'], [5, 6, 2, 1, '#f0a030'], [6, 7, 1, 2, '#f6ecd2'],
    [5, 9, 1, 2, '#f6ecd2'], [6, 11, 1, 2, '#f6ecd2'], [5, 13, 1, 3, '#f6ecd2']]);
  scene.appendChild(kite);

  // auto rickshaw: outer element drives, inner element bounces
  const drive = document.createElement('div');
  drive.className = 'bootAuto';
  const auto = el('svg', { viewBox: '0 0 22 14', 'shape-rendering': 'crispEdges', class: 'bounce' });
  rects(auto, [
    [4, 0, 14, 2, '#14111c'], [3, 2, 2, 6, '#14111c'],      // canopy
    [5, 2, 12, 4, '#f0c020'], [8, 3, 5, 3, '#8fc7d8'],      // body + windshield
    [3, 6, 17, 4, '#2e8b57'], [18, 4, 3, 4, '#f0c020'],     // lower body + nose
    [20, 6, 1, 1, '#fff7c0'], [3, 7, 1, 1, '#d8433b'],     // headlight, tail light
    [5, 10, 4, 4, '#14111c'], [15, 10, 4, 4, '#14111c'],   // wheels
    [6, 11, 2, 2, '#888'], [16, 11, 2, 2, '#888'],
  ]);
  drive.appendChild(auto);
  for (let i = 0; i < 3; i++) {
    const puff = document.createElement('span');
    puff.className = 'puff';
    puff.style.animationDelay = `${i * 0.25}s`;
    drive.appendChild(puff);
  }
  scene.appendChild(drive);
  return scene;
}

// Hindi and Telugu side by side, plus Hyderabadi Urdu, to greet every visitor.
const GREETINGS: { en: string; parts: [string, string][] }[] = [
  { en: 'Namaste / Namaskaram', parts: [['नमस्ते', 'hi'], ['నమస్కారం', 'te']] },
  { en: 'Welcome', parts: [['स्वागत है', 'hi'], ['స్వాగతం', 'te']] },
  { en: 'Salaam', parts: [['سلام', 'ur']] },
  { en: 'How are you?', parts: [['आप कैसे हैं?', 'hi'], ['ఎలా ఉన్నారు?', 'te']] },
  { en: 'Kya haal hai, miyan?', parts: [['کیا حال ہے میاں؟', 'ur']] },
];

const TIPS: { en: string; hi: string }[] = [
  { en: 'Drag to explore, scroll or pinch to zoom', hi: 'खींचकर घूमें, स्क्रॉल या पिंच से ज़ूम करें' },
  { en: 'Tap any car, person or train to meet them', hi: 'किसी भी गाड़ी, इंसान या ट्रेन पर टैप करके मिलें' },
  { en: 'Collect every landmark stamp in your Passport', hi: 'पासपोर्ट में हर मशहूर जगह का ठप्पा जमा करें' },
  { en: 'Turn on LIVE to match real Hyderabad time and weather', hi: 'असली हैदराबाद का समय और मौसम देखने के लिए लाइव चालू करें' },
  { en: 'Try MAP VIEWS for metro lines and traffic', hi: 'मेट्रो लाइनें और ट्रैफ़िक देखने के लिए "नक्शे" खोलें' },
];

/** Fills the rest of the loading screen: a faint city skyline along the
 *  bottom, a rotating local greeting up top, a language switch, gameplay tips
 *  and a share button. Returns { stop, relabel }. */
function buildChrome(root: HTMLElement) {
  const skyline = document.createElement('div');
  skyline.className = 'bootSkyline';
  skyline.setAttribute('aria-hidden', 'true');
  root.appendChild(skyline);

  const hello = document.createElement('div');
  hello.className = 'bootHello';
  const helloEn = document.createElement('span');
  const helloNative = document.createElement('span');
  helloNative.className = 'native';
  hello.append(helloEn, helloNative);
  root.appendChild(hello);
  let g = 0;
  const greet = () => {
    const { en, parts } = GREETINGS[g];
    helloEn.textContent = en;
    helloNative.textContent = '';
    parts.forEach(([text, l], n) => {
      if (n) helloNative.append(' / ');
      const s = document.createElement('span');
      s.textContent = text;
      s.lang = l;
      if (l === 'ur') s.dir = 'rtl';
      helloNative.append(s);
    });
    hello.classList.remove('in'); void hello.offsetWidth; hello.classList.add('in');
    g = (g + 1) % GREETINGS.length;
  };
  greet();
  const greetTimer = setInterval(greet, 2600);

  const foot = document.createElement('div');
  foot.className = 'bootFoot';
  const tip = document.createElement('p');
  tip.className = 'bootTip';
  let k = Math.floor(Math.random() * TIPS.length);
  const renderTip = () => { tip.textContent = t('boot.tip', { tip: TIPS[k][lang()] }); };
  const showTip = () => { k = (k + 1) % TIPS.length; renderTip(); };
  renderTip();
  const tipTimer = setInterval(showTip, 3800);

  const share = document.createElement('button');
  share.className = 'bootShare';
  share.textContent = t('boot.share');
  share.addEventListener('click', async () => {
    const data = { title: document.title, text: t('boot.shareText'), url: location.origin + location.pathname };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(data.url);
      share.textContent = t('boot.copied');
    } catch {
      share.textContent = data.url;
    }
    setTimeout(() => { share.textContent = t('boot.share'); }, 2200);
  });

  const credit = document.createElement('p');
  credit.className = 'bootCredit';
  foot.append(tip, share, credit);
  root.appendChild(foot);

  const relabel = () => { renderTip(); share.textContent = t('boot.share'); credit.textContent = t('boot.credit'); };
  relabel();
  return { stop: () => { clearInterval(greetTimer); clearInterval(tipTimer); }, relabel };
}

function pickStart(): number {
  let last = -1;
  try { last = Number(localStorage.getItem('hd.fact') ?? -1); } catch { /* storage blocked */ }
  let i = Math.floor(Math.random() * FACTS.length);
  if (i === last) i = (i + 1) % FACTS.length;
  try { localStorage.setItem('hd.fact', String(i)); } catch { /* storage blocked */ }
  return i;
}

/** Installs the scene and fact ticker. Returns a function that resolves once
 *  the loader has been visible long enough to be read. */
export function startBootScreen(): () => Promise<void> {
  const t0 = performance.now();
  // static language buttons in the HUD; the loader makes its own
  applyStatic();
  const box = document.querySelector('#boot .bootBox');
  if (!box) return async () => {};
  box.prepend(buildScene());

  const factBox = document.createElement('button');
  factBox.className = 'bootFact';
  const label = document.createElement('b');
  const text = document.createElement('span');
  factBox.append(label, text);
  box.appendChild(factBox);

  const chrome = buildChrome(box.parentElement!);
  applyStatic(); // label the loader's own language button

  let i = pickStart();
  const show = () => {
    text.classList.remove('in');
    void text.offsetWidth; // restart the slide-in
    text.textContent = FACTS[i][lang()];
    text.lang = lang();
    text.classList.add('in');
  };
  const labels = () => { label.textContent = t('boot.didyouknow'); factBox.title = t('boot.tapfact'); };
  labels();
  show();
  const next = () => { i = (i + 1) % FACTS.length; show(); };
  let timer = setInterval(next, ROTATE_MS);
  factBox.addEventListener('click', () => { clearInterval(timer); next(); timer = setInterval(next, ROTATE_MS); });
  onLang(() => { labels(); show(); chrome.relabel(); });

  return async () => {
    const wait = MIN_SHOW_MS - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    clearInterval(timer);
    // keep the greeting/tips ticking through the fade, then stop them
    setTimeout(chrome.stop, 600);
  };
}
