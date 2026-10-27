// ===== data.js (v2) : tuning constants, rooms, items, loot, shops =====
const CFG = {
  W: 22, H: 16, AP: 2, HP_PRISONER: 6, HP_GUARD: 6,
  VISION_LIT: 5, VISION_DARK: 1, HEAR: 3,
  NOISE: { move: 3, sneak: 1, run: 5, loot: 1, steal: 2, lockpick: 2, fight: 5, gun: 7, fence: 5, hack: 1, power: 2, alarm: 7 },
  PHASES: [
    { id: 'morning', name: 'Morning', len: 6, lights: true },
    { id: 'day', name: 'Day', len: 12, lights: true },
    { id: 'evening', name: 'Evening', len: 6, lights: true },
    { id: 'night', name: 'Lights out', len: 12, lights: false },
  ],
  DAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  CAMERA_RANGE: 2, HACK_TURNS: 8, POWER_TURNS: 6,
  GUARDS: 6, GUARDS_NIGHT: 4, NPCS: 10,
  METH: { high: 7, crash: 15 },
  NIGHT_WARN: 5, ROUTE_PRICE: 22, INTEL_PRICE: 4,
};

// cover: how well a hidden prisoner is concealed. open = corridors, yards (found within 2 tiles by day);
// mid = kitchen, dining and similar; room = closed small rooms. size is [w,h] in tiles (rotated at placement).
// allowed: where a prisoner may be by day without it being suspicious. At night only your own cell is allowed.
const DIFFS = {
  easy:   { name: 'Easy',   guards: 4, night: 3, desc: 'Fewer guards. You know the whole map. Being out of your cell at night is not a strike (they still hunt you).' },
  medium: { name: 'Medium', guards: 6, night: 4, desc: 'The standard prison.' },
  hard:   { name: 'Hard',   guards: 8, night: 6, desc: 'More guards on every shift.' },
};
const ROOMS = {
  cell:      { name: 'Cell',            size: [1, 1], allowed: true,  cover: 'room', lit: true,  spots: [1, 2], loot: 'cell' },
  solitary:  { name: 'Solitary',        size: [1, 1], allowed: false, cover: 'room', lit: false, spots: [0, 0], locked: true },
  common:    { name: 'Common Room',     size: [2, 2], allowed: true,  cover: 'mid',  lit: true,  spots: [2, 3], loot: 'common', routine: 'common' },
  dining:    { name: 'Dining Hall',     size: [2, 3], allowed: true,  cover: 'mid',  lit: true,  spots: [2, 3], loot: 'common', routine: 'dining', link: 'kitchen' },
  showers:   { name: 'Showers',         size: [1, 2], allowed: true,  cover: 'room', lit: true,  spots: [1, 1], loot: 'common', routine: 'showers' },
  library:   { name: 'Library',         size: [1, 2], allowed: true,  cover: 'mid',  lit: true,  spots: [1, 2], loot: 'common', work: true },
  workshop:  { name: 'Workshop',        size: [2, 1], allowed: true,  cover: 'mid',  lit: true,  spots: [2, 3], loot: 'workshop', work: true, salvage: true },
  laundry:   { name: 'Laundry',         size: [1, 2], allowed: true,  cover: 'mid',  lit: true,  spots: [1, 2], loot: 'laundry', work: true, salvage: true },
  kitchen:   { name: 'Kitchen',         size: [1, 2], allowed: true,  cover: 'mid',  lit: true,  spots: [2, 2], loot: 'kitchen', work: true, salvage: true, link: 'dining' },
  wc:        { name: 'WC',              size: [1, 1], allowed: true,  cover: 'room', lit: true,  spots: [0, 1], loot: 'wc', routine: 'wc' },
  closet:    { name: 'Supply Closet',   size: [1, 1], allowed: true,  cover: 'room', lit: false, spots: [1, 2], loot: 'closet', salvage: true },
  infirmary: { name: 'Infirmary',       size: [1, 2], allowed: true,  cover: 'room', lit: true,  spots: [1, 2], loot: 'infirmary' },
  visitor:   { name: 'Visitor Room',    size: [1, 1], allowed: true,  cover: 'room', lit: true,  spots: [0, 1], loot: 'common' },
  storage:   { name: 'Storage',         size: [1, 1], allowed: false, cover: 'room', lit: false, spots: [2, 3], loot: 'storage', salvage: true, locked: true, alarm: true },
  armory:    { name: 'Armory',          size: [1, 2], allowed: false, cover: 'room', lit: true,  spots: [2, 3], loot: 'armory', locked: true, alarm: true },
  guardroom: { name: 'Guard Room',      size: [2, 1], allowed: false, cover: 'room', lit: true,  spots: [1, 2], loot: 'guardroom', locked: true, alarm: true },
  warden:    { name: "Warden's Office", size: [2, 1], allowed: false, cover: 'room', lit: true,  spots: [2, 3], loot: 'warden', locked: true, alarm: true },
  control:   { name: 'Control Room',    size: [1, 1], allowed: false, cover: 'room', lit: true,  spots: [1, 1], loot: 'control', locked: true, alarm: true, terminal: true },
  electrical:{ name: 'Electrical Room', size: [1, 1], allowed: false, cover: 'room', lit: false, spots: [1, 1], loot: 'storage', locked: true, alarm: true, breaker: true },
  court:     { name: 'Basketball Court',size: [4, 3], allowed: true,  cover: 'open', lit: true,  spots: [1, 2], loot: 'yard', routine: 'yard', outdoor: true },
  yard:      { name: 'Yard',            allowed: true,  cover: 'open', lit: true,  spots: [0, 1], loot: 'yard', outdoor: true },
  corridor:  { name: 'Corridor',        allowed: true,  cover: 'open', lit: true,  spots: [0, 0] },
  door:      { name: 'Exit Door',       allowed: true,  cover: 'open', lit: true,  spots: [0, 0] },
  gate:      { name: 'Main Gate',       allowed: false, cover: 'open', lit: true,  spots: [0, 0], outdoor: true, exit: 'gate' },
  fence:     { name: 'Perimeter Fence', allowed: false, cover: 'open', lit: false, spots: [0, 0], outdoor: true, exit: 'fence' },
};
const FIXED_ROOMS = ['dining', 'common', 'kitchen', 'showers', 'library', 'workshop', 'laundry', 'infirmary', 'visitor', 'storage',
  'armory', 'guardroom', 'warden', 'control', 'electrical'];

const ITEMS = {
  cigs:      { name: 'Cigarettes', icon: 'C', value: 1, desc: 'Prison currency. Guards can never take it.' },
  scrap:     { name: 'Scrap', icon: 's', value: 1, desc: 'Metal and wire. Craft into tools.' },
  shiv:      { name: 'Shiv', icon: '/', value: 5, weapon: 2, contraband: true, desc: 'Melee weapon. High chance to kill.' },
  baton:     { name: 'Baton', icon: '|', value: 6, weapon: 2, contraband: true, desc: 'Melee weapon. Knocks people out.' },
  pistol:    { name: 'Pistol', icon: 'P', value: 20, weapon: 3, ranged: 2, contraband: true, desc: 'Needs ammo. Range 2. Very loud.' },
  ammo:      { name: 'Ammo', icon: '.', value: 3, contraband: true, desc: 'Pistol rounds.' },
  lockpick:  { name: 'Lockpick', icon: 'L', value: 6, contraband: true, desc: 'Opens locked doors. Most staff doors have alarms.' },
  jammer:    { name: 'Alarm Jammer', icon: 'J', value: 12, contraband: true, desc: 'One use. Lets a lockpick open an alarmed door quietly.' },
  wirecutters:{name: 'Wirecutters', icon: 'W', value: 14, contraband: true, desc: 'Cut through the perimeter fence.' },
  keycard:   { name: 'Keycard', icon: 'K', value: 25, contraband: true, desc: 'Opens any door without an alarm. Opens the main gate.' },
  usb:       { name: 'Hacker USB', icon: 'U', value: 16, contraband: true, desc: 'Hack the control room terminal.' },
  uniform:   { name: 'Guard Uniform', icon: 'G', value: 10, contraband: true, desc: 'Wear it to pass as staff. Close guards may see through it.' },
  flashlight:{ name: 'Flashlight', icon: 'F', value: 5, contraband: true, desc: 'See 3 tiles in the dark.' },
  dummy:     { name: 'Bed Dummy', icon: 'D', value: 4, contraband: true, desc: 'Prop it in your bed so night checks find "you" asleep.' },
  meth:      { name: 'Meth', icon: 'M', value: 8, contraband: true, desc: '3 AP for 7 turns, then a 15 turn crash at 1 AP.' },
  pills:     { name: 'Painkillers', icon: '+', value: 3, desc: 'Heal 2 HP.' },
  watch:     { name: 'Gold Watch', icon: 'o', value: 8, desc: 'Worth a lot to the right buyer.' },
  phone:     { name: 'Cell Phone', icon: 'T', value: 9, contraband: true, desc: 'Worth a lot to the right buyer.' },
};
const isContraband = it => !!(ITEMS[it] && ITEMS[it].contraband);

const RECIPES = [
  { out: 'shiv', cost: { scrap: 2 } },
  { out: 'lockpick', cost: { scrap: 3 } },
  { out: 'dummy', cost: { scrap: 3 } },
  { out: 'jammer', cost: { scrap: 4 } },
  { out: 'wirecutters', cost: { scrap: 5 } },
];

const LOOT = {
  wc:        [['cigs', 2, 1], ['scrap', 1, 1], ['pills', 1, 1], ['', 3, 0]],
  closet:    [['scrap', 5, [1, 2]], ['cigs', 2, 1], ['dummy', 0.6, 1], ['uniform', 0.5, 1], ['', 2, 0]],
  cell:      [['cigs', 4, [1, 3]], ['scrap', 3, 1], ['pills', 1, 1], ['phone', 0.6, 1], ['meth', 0.6, 1], ['', 3, 0]],
  common:    [['cigs', 4, [1, 3]], ['scrap', 2, 1], ['pills', 1, 1], ['watch', 0.5, 1], ['', 3, 0]],
  yard:      [['scrap', 4, 1], ['cigs', 2, 1], ['', 4, 0]],
  workshop:  [['scrap', 6, [1, 2]], ['lockpick', 1.5, 1], ['wirecutters', 0.8, 1], ['shiv', 1, 1], ['jammer', 0.6, 1], ['', 1, 0]],
  laundry:   [['uniform', 2, 1], ['scrap', 3, 1], ['dummy', 1, 1], ['cigs', 2, 1], ['', 2, 0]],
  kitchen:   [['shiv', 2, 1], ['scrap', 3, 1], ['cigs', 2, [1, 2]], ['', 2, 0]],
  storage:   [['scrap', 4, [1, 2]], ['flashlight', 2, 1], ['uniform', 1.5, 1], ['lockpick', 1, 1], ['wirecutters', 1, 1], ['jammer', 1, 1], ['', 1, 0]],
  infirmary: [['pills', 5, [1, 2]], ['meth', 0.8, 1], ['cigs', 1, 1], ['', 2, 0]],
  armory:    [['baton', 3, 1], ['pistol', 1.5, 1], ['ammo', 3, [2, 3]], ['keycard', 0.8, 1], ['', 1, 0]],
  guardroom: [['baton', 2, 1], ['keycard', 1, 1], ['cigs', 3, [2, 4]], ['flashlight', 2, 1], ['uniform', 1.5, 1], ['', 1, 0]],
  warden:    [['keycard', 2, 1], ['cigs', 4, [4, 8]], ['usb', 1.5, 1], ['watch', 2, 1], ['jammer', 1, 1], ['', 1, 0]],
  control:   [['usb', 3, 1], ['cigs', 2, [1, 3]], ['', 1, 0]],
};

// vendors are fixed NPCs in a room (present except at night); inmates carry a few random goods
const VENDORS = {
  dealer:    { name: 'Dealer',    room: 'common',    sells: { shiv: 8, lockpick: 9, wirecutters: 20, usb: 22, flashlight: 7, uniform: 14, scrap: 2, meth: 12, jammer: 15, dummy: 6 }, buys: true },
  orderly:   { name: 'Orderly',   room: 'infirmary', sells: { pills: 4 } },
  fixer:     { name: 'Fixer',     room: 'dining',    intel: true },
  informant: { name: 'Informant', room: 'library',   routes: true },
};
const INMATE_STOCK = { scrap: 3, pills: 5, shiv: 10, lockpick: 11, meth: 14, flashlight: 8, dummy: 7, cigs: 0 };

// bribery: base price multiplier by purpose
const BRIBE = {
  blind:   { label: 'Look the other way', mult: 1, desc: 'Next time he sees you doing something suspicious, he ignores it.' },
  alarm:   { label: 'Switch off door alarms', mult: 2, desc: 'During a time of day you choose, lockpicking will not trip alarms.' },
  release: { label: 'Let me go, now', mult: 2.5, desc: 'Only when a guard has stopped you. He drops it.' },
};
const OFFERS = [{ k: 'low', label: 'Low', f: 0.7 }, { k: 'fair', label: 'Fair', f: 1 }, { k: 'high', label: 'Generous', f: 1.5 }];

const PLAYER_COLORS = ['#e4572e', '#2e9be4', '#e4c12e', '#5ec269'];
const NPC_NAMES = ['Dutch', 'Mouse', 'Rico', 'Slim', 'Tiny', 'Ghost', 'Padre', 'Wolf', 'Cricket', 'Bones', 'Lenny', 'Moses'];
const GUARD_NAMES = ['Hobbs', 'Kowal', 'Reyes', 'Brandt', 'Novak', 'Dixon', 'Marsh', 'Pike', 'Voss', 'Quinn'];
