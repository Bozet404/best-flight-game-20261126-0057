// Selat Jakarta Run — mission constants.
//
// One mission: take off from the Jakarta coast, fly north across the strait
// (Selat Jakarta) through eight rings over the Thousand Islands
// (Kepulauan Seribu), then put the plane down on the little airstrip on
// Pulau Pari. All distances are metres, all altitudes are metres above the
// sea, all angles are radians unless a name says degrees.

const CONFIG = {
  title: "Selat Jakarta Run",
  // The plane starts over the Jakarta coast, nose pointing north.
  start: { x: 0, z: -200, y: 300, heading: 0, speed: 70 },
  // The sea ends and Java begins south of this z. The coast is where the
  // runway of the story starts: Tanjung Priok is just behind the start.
  coastZ: -300,
  // The city of Jakarta fills this rectangle on the mainland.
  city: { xMin: -2600, xMax: 2600, zMin: -2600, zMax: -300, ground: 12 },
  // The big mountains of West Java rise far to the south.
  mountainZ: -3500,
  mountainHeight: 1750,
  // Islands of the Thousand Islands, each a smooth bump out of the sea.
  // name is shown on the HUD when the plane flies near one.
  islands: [
    { x: 800, z: 2400, r: 520, h: 26, name: "Pulau Untung Jawa" },
    { x: -950, z: 4100, r: 660, h: 30, name: "Pulau Tidung" },
    { x: 350, z: 5900, r: 560, h: 22, name: "Pulau Pari Kecil" },
    { x: -650, z: 7500, r: 720, h: 28, name: "Pulau Harapan" },
    { x: 900, z: 8200, r: 480, h: 20, name: "Pulau Kelapa" },
    // The landing island: a wide, low, flat-topped island with the strip.
    { x: -200, z: 9000, r: 950, h: 12, name: "Pulau Pari", flat: true },
  ],
  // Eight rings along the course. Fly through the middle of each one.
  rings: [
    { x: 150, z: 1200, y: 260, r: 48 },
    { x: -420, z: 2600, y: 220, r: 48 },
    { x: 480, z: 4000, y: 300, r: 48 },
    { x: -700, z: 5300, y: 240, r: 48 },
    { x: 250, z: 6500, y: 320, r: 48 },
    { x: -350, z: 7600, y: 260, r: 48 },
    { x: 500, z: 8300, y: 220, r: 48 },
    { x: -200, z: 8300, y: 150, r: 52 },
  ],
  // The airstrip on Pulau Pari: a north-south strip, 900 m long, 40 m wide.
  runway: { x: -200, z: 9000, length: 900, width: 40 },
  // Flight model limits.
  flight: {
    minSpeed: 28, // m/s, below this the wing stops flying
    maxSpeed: 135, // m/s at full throttle, level
    cruiseSpeed: 78, // m/s the plane settles at with half throttle
    stallSpeed: 42, // m/s, below this the nose drops on its own
    maxPitch: 0.61, // about 35 degrees, up or down
    maxBank: 1.05, // about 60 degrees
    pitchRate: 0.9, // radians per second at full stick
    rollRate: 1.6, // radians per second at full stick
    yawRate: 0.25, // radians per second of rudder
    throttleRate: 0.55, // per second while the key is held
    climbFactor: 1.0,
  },
  // Scoring.
  score: {
    ring: 100,
    landing: 500,
    smoothLanding: 150, // gentle touchdown on the strip
    timeBonusPerSecond: 2, // up to this many points a second under par
    parSeconds: 300, // five minutes: beat it for a time bonus
  },
  // How far the camera can see before the haze swallows the world.
  viewDistance: 5600,
  fogStart: 2600,
  // The mission area. Stray outside it and the HUD warns the pilot.
  bounds: { x: 6500, zMin: -3200, zMax: 10800 },
};

// The course in words, for the menu screen and the mission readout.
const MISSION_STEPS = [
  "Lepas landas dari pantai Jakarta",
  "Terbang ke utara melewati 8 ring di atas Kepulauan Seribu",
  "Mendarat di landasan Pulau Pari",
];
