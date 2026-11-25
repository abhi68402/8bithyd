// The places of Hyderabad that visitors can discover, at their real
// coordinates. The map pipeline snaps each one to the matching OpenStreetMap
// feature when it finds it (see `match`), otherwise these values are used.
export interface PlaceDef {
  id: string;
  name: string;
  te: string; // Telugu
  area: string;
  blurb: string;
  lat: number;
  lon: number;
  match?: string; // case-insensitive regex against OSM names
  sprite?: string; // hero sprite drawn at the spot
  scale?: number; // sprite scale (art px per sprite px)
  clear?: number; // radius in metres cleared of ordinary buildings
  lift?: number; // label height in px
}

const OLD = 'Old City', LAKE = 'Lakeside', SEC = 'Secunderabad', EAST = 'East', WEST = 'West', SOUTH = 'South';

export const PLACES: PlaceDef[] = [
  { id: 'charminar', name: 'Charminar', te: 'చార్మినార్', area: OLD, lat: 17.3616, lon: 78.4747, match: '^charminar$', sprite: 'lm:charminar', scale: 0.5, clear: 34, lift: 60,
    blurb: 'Four minarets, four grand arches, built in 1591 at the heart of the new city. Traffic still swirls around it.' },
  { id: 'mecca-masjid', name: 'Mecca Masjid', te: 'మక్కా మసీదు', area: OLD, lat: 17.3604, lon: 78.4736, match: 'ma?[ck]+ah? masjid', sprite: 'lm:mecca', scale: 0.5, clear: 50, lift: 36,
    blurb: 'One of the largest mosques in India. Bricks for its central arch are said to be made with soil from Mecca.' },
  { id: 'laad-bazaar', name: 'Laad Bazaar', te: 'లాడ్ బజార్', area: OLD, lat: 17.3614, lon: 78.4722, match: 'laad baza', lift: 18,
    blurb: 'A glittering lane of lac bangles, pearls and wedding shopping that has traded for four centuries.' },
  { id: 'chowmahalla', name: 'Chowmahalla Palace', te: 'చౌమహల్లా ప్యాలెస్', area: OLD, lat: 17.3578, lon: 78.4716, match: 'chowmahalla', sprite: 'lm:chowmahalla', scale: 1, clear: 90, lift: 52,
    blurb: 'Seat of the Nizams: courtyards, fountains, a clock tower that has ticked since the 1700s.' },
  { id: 'falaknuma', name: 'Falaknuma Palace', te: 'ఫలక్‌నుమా ప్యాలెస్', area: OLD, lat: 17.3312, lon: 78.4672, match: 'falaknuma palace', sprite: 'lm:falaknuma', scale: 1, clear: 100, lift: 58,
    blurb: '"Mirror of the sky" - a scorpion-shaped hilltop palace looking down over the Old City.' },
  { id: 'salar-jung', name: 'Salar Jung Museum', te: 'సాలార్ జంగ్ మ్యూజియం', area: OLD, lat: 17.3713, lon: 78.4804, match: 'salar ?jung museum', sprite: 'lm:salarjung', scale: 1, clear: 90, lift: 50,
    blurb: 'A vast one-family art collection on the bank of the Musi, famous for its veiled marble Rebecca.' },
  { id: 'high-court', name: 'High Court', te: 'హైకోర్టు', area: OLD, lat: 17.3691, lon: 78.4718, sprite: 'lm:highcourt', scale: 1, clear: 90, lift: 62,
    blurb: 'Pink granite and red sandstone domes rising from the south bank of the Musi since 1920.' },
  { id: 'osmania-hospital', name: 'Osmania General Hospital', te: 'ఉస్మానియా ఆసుపత్రి', area: OLD, lat: 17.3725, lon: 78.4735, match: 'osmania general hospital', sprite: 'lm:osmaniahosp', scale: 1, clear: 90, lift: 62,
    blurb: 'A century-old Indo-Saracenic hospital with great onion domes facing the river.' },
  { id: 'zoo', name: 'Nehru Zoological Park', te: 'నెహ్రూ జూ పార్క్', area: OLD, lat: 17.3507, lon: 78.4513, sprite: 'lm:zoogate', scale: 1, clear: 30, lift: 30,
    blurb: 'Lions, elephants, a toy train and a safari loop beside Mir Alam Tank.' },
  { id: 'mir-alam', name: 'Mir Alam Tank', te: 'మీర్ ఆలం చెరువు', area: OLD, lat: 17.3445, lon: 78.4395, match: 'mir alam', lift: 14,
    blurb: 'A reservoir held back by a dam of 21 stone arches, built in 1806.' },

  { id: 'buddha', name: 'Hussain Sagar Buddha', te: 'హుస్సేన్ సాగర్ బుద్ధ విగ్రహం', area: LAKE, lat: 17.4156, lon: 78.475, match: 'buddha statue', sprite: 'lm:buddha', scale: 2, lift: 124,
    blurb: 'An 18-metre monolith standing on the Rock of Gibraltar in the middle of the lake.' },
  { id: 'tank-bund', name: 'Tank Bund', te: 'ట్యాంక్ బండ్', area: LAKE, lat: 17.4239, lon: 78.4872, lift: 16,
    blurb: 'The dam road that joins the twin cities, lined with statues and evening walkers.' },
  { id: 'necklace-road', name: 'Necklace Road', te: 'నెక్లెస్ రోడ్', area: LAKE, lat: 17.4295, lon: 78.4748, sprite: 'lm:flag', scale: 1, clear: 18, lift: 72,
    blurb: 'The lakeside boulevard that glitters like a string of pearls at night, under a giant tricolour.' },
  { id: 'lumbini', name: 'Lumbini Park', te: 'లుంబినీ పార్క్', area: LAKE, lat: 17.4101, lon: 78.4733, match: 'lumbini park', sprite: 'lm:fountain', scale: 1, clear: 20, lift: 30,
    blurb: 'Boat jetty to the Buddha statue, plus a laser show every evening.' },
  { id: 'ntr-gardens', name: 'NTR Gardens', te: 'ఎన్టీఆర్ గార్డెన్స్', area: LAKE, lat: 17.4124, lon: 78.469, match: 'ntr garden', sprite: 'lm:pavilion', scale: 1, clear: 20, lift: 36,
    blurb: 'Lawns, a toy train and a memorial beside the lake.' },
  { id: 'birla-mandir', name: 'Birla Mandir', te: 'బిర్లా మందిర్', area: LAKE, lat: 17.4062, lon: 78.4691, match: 'birla mandir', sprite: 'lm:birla', scale: 1, clear: 60, lift: 84,
    blurb: 'A temple of white Rajasthani marble on Naubat Pahad, glowing over the lake after dark.' },
  { id: 'secretariat', name: 'Secretariat', te: 'సచివాలయం', area: LAKE, lat: 17.4079, lon: 78.4722, sprite: 'lm:secretariat', scale: 1, clear: 120, lift: 88,
    blurb: 'The domed seat of the Telangana government on the southern shore.' },
  { id: 'assembly', name: 'Legislative Assembly', te: 'శాసనసభ', area: LAKE, lat: 17.4, lon: 78.469, match: 'legislative assembly', sprite: 'lm:assembly', scale: 1, clear: 90, lift: 56,
    blurb: 'A white Rajasthani-Persian hall with gleaming domes, built in 1913.' },
  { id: 'public-gardens', name: 'Public Gardens', te: 'పబ్లిక్ గార్డెన్స్', area: LAKE, lat: 17.3987, lon: 78.4688, match: 'public gardens', sprite: 'lm:bandstand', scale: 1, clear: 18, lift: 28,
    blurb: 'The Nizam\'s Bagh-e-Aam: old trees, a lotus pond and a bandstand.' },
  { id: 'nampally', name: 'Nampally Station', te: 'నాంపల్లి స్టేషన్', area: LAKE, lat: 17.3924, lon: 78.4675, match: 'hyderabad deccan', sprite: 'lm:nampally', scale: 1, clear: 70, lift: 46,
    blurb: 'Hyderabad Deccan station, the old terminus of the Nizam\'s railway.' },
  { id: 'abids', name: 'Abids', te: 'అబిడ్స్', area: LAKE, lat: 17.391, lon: 78.4762, match: 'general post office', sprite: 'lm:gpo', scale: 1, clear: 45, lift: 50,
    blurb: 'The old shopping heart of the city, around the General Post Office.' },

  { id: 'clock-tower', name: 'Secunderabad Clock Tower', te: 'సికింద్రాబాద్ క్లాక్ టవర్', area: SEC, lat: 17.4409, lon: 78.4986, match: 'clock tower', sprite: 'lm:clock', scale: 1, clear: 18, lift: 72,
    blurb: 'A 37-metre tower from 1897 standing in a small park in the cantonment town.' },
  { id: 'sec-junction', name: 'Secunderabad Junction', te: 'సికింద్రాబాద్ జంక్షన్', area: SEC, lat: 17.4337, lon: 78.5016, match: 'secunderabad (junction|railway)', sprite: 'lm:secjn', scale: 1, clear: 90, lift: 50,
    blurb: 'A fort-like station from 1874 and one of the busiest rail hubs of the Deccan.' },
  { id: 'parade-ground', name: 'Parade Ground', te: 'పరేడ్ గ్రౌండ్', area: SEC, lat: 17.4449, lon: 78.4929, match: 'parade ground', sprite: 'lm:flag', scale: 1, clear: 18, lift: 72,
    blurb: 'A wide open maidan for parades, kite festivals and weekend cricket.' },
  { id: 'st-marys', name: 'St. Mary\'s Basilica', te: 'సెయింట్ మేరీస్ బసిలికా', area: SEC, lat: 17.4392, lon: 78.5045, match: 'mary.?s basilica', sprite: 'lm:stmary', scale: 1, clear: 50, lift: 70,
    blurb: 'A Gothic basilica begun in 1840, once the largest church in the Nizam\'s dominions.' },

  { id: 'ou-arts', name: 'OU Arts College', te: 'ఉస్మానియా ఆర్ట్స్ కళాశాల', area: EAST, lat: 17.4189, lon: 78.5265, sprite: 'lm:ou', scale: 1, clear: 100, lift: 62,
    blurb: 'Osmania University\'s granite landmark, its giant arch blending Ajanta and Qutb Shahi styles.' },
  { id: 'uppal', name: 'Uppal Stadium', te: 'ఉప్పల్ స్టేడియం', area: EAST, lat: 17.4065, lon: 78.5505, match: 'rajiv gandhi international cricket', sprite: 'lm:uppal', scale: 1, clear: 130, lift: 62,
    blurb: 'Home of Hyderabad cricket. On match nights the floodlights can be seen for miles.' },
  { id: 'ramoji', name: 'Ramoji Film City', te: 'రామోజీ ఫిల్మ్ సిటీ', area: EAST, lat: 17.2543, lon: 78.6808, sprite: 'lm:palaceset', scale: 2, clear: 80, lift: 120,
    blurb: 'A film studio the size of a town: palaces, streets and whole cities built as sets.' },

  { id: 'golconda', name: 'Golconda Fort', te: 'గోల్కొండ కోట', area: WEST, lat: 17.3831, lon: 78.4011, sprite: 'lm:golconda', scale: 2, clear: 260, lift: 190,
    blurb: 'A granite hill fortress once known for its diamonds. A clap at the gate can be heard at the top.' },
  { id: 'qutb-shahi', name: 'Qutb Shahi Tombs', te: 'కుతుబ్ షాహీ సమాధులు', area: WEST, lat: 17.395, lon: 78.3968, match: 'qutu?b shahi tombs', sprite: 'lm:tomb0', scale: 1, clear: 50, lift: 62,
    blurb: 'Domed tombs of seven kings resting in a garden near the fort.' },
  { id: 'taramati', name: 'Taramati Baradari', te: 'తారామతి బారాదరి', area: WEST, lat: 17.3758, lon: 78.3781, match: 'taramati', sprite: 'lm:taramati', scale: 1, clear: 40, lift: 46,
    blurb: 'A twelve-arched music pavilion whose songs were said to carry to Golconda.' },
  { id: 'cable-bridge', name: 'Durgam Cheruvu Cable Bridge', te: 'దుర్గం చెరువు కేబుల్ బ్రిడ్జి', area: WEST, lat: 17.4307, lon: 78.3898, match: 'cable bridge', sprite: 'lm:pylon', scale: 1, lift: 84,
    blurb: 'A cable-stayed bridge over the "secret lake", lit up in colours every night.' },
  { id: 'cyber-towers', name: 'Cyber Towers', te: 'సైబర్ టవర్స్', area: WEST, lat: 17.4505, lon: 78.3811, sprite: 'lm:cyber', scale: 1, clear: 60, lift: 104,
    blurb: 'The round-cornered tower that started HITEC City in 1998.' },
  { id: 'shilparamam', name: 'Shilparamam', te: 'శిల్పారామం', area: WEST, lat: 17.4525, lon: 78.3789, match: 'shilparamam', sprite: 'lm:shilpagate', scale: 1, clear: 25, lift: 32,
    blurb: 'A crafts village of thatched stalls, pottery and folk performances.' },
  { id: 'gachibowli', name: 'Gachibowli Stadium', te: 'గచ్చిబౌలి స్టేడియం', area: WEST, lat: 17.4462, lon: 78.3441, sprite: 'lm:gachibowli', scale: 1, clear: 120, lift: 50,
    blurb: 'An athletics and football arena built for the 2003 Afro-Asian Games.' },
  { id: 'financial-district', name: 'Financial District', te: 'ఫైనాన్షియల్ డిస్ట్రిక్ట్', area: WEST, lat: 17.4145, lon: 78.3425, lift: 90,
    blurb: 'Glass towers on what was boulder country twenty years ago.' },
  { id: 'kbr-park', name: 'KBR Park', te: 'కేబీఆర్ పార్క్', area: WEST, lat: 17.4222, lon: 78.4205, sprite: 'lm:parkgate', scale: 1, clear: 20, lift: 30,
    blurb: 'A patch of Deccan forest in Jubilee Hills, with peacocks and a morning walkers\' loop.' },

  { id: 'airport', name: 'Shamshabad Airport', te: 'శంషాబాద్ విమానాశ్రయం', area: SOUTH, lat: 17.2365, lon: 78.4293, sprite: 'lm:atc', scale: 2, clear: 80, lift: 130,
    blurb: 'Rajiv Gandhi International. Watch for departures along the runway.' },
];
