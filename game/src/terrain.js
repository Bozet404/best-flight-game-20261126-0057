// Selat Jakarta Run — terrain.
//
// The world is one height function over a flat sea. Java and its city sit
// to the south, the Thousand Islands rise out of the strait to the north,
// and the big volcanoes of West Java stand on the far southern horizon.
// Everything here is deterministic: the same (x, z) always gives the same
// height, so the ground never shifts under the plane.

// A small deterministic wobble, so hills and shores are not perfectly
// smooth. It is a hash of the coordinates, not a random call.
function wobble(x, z) {
  const s = Math.sin(x * 0.021 + z * 0.017) * 0.6
    + Math.sin(x * 0.043 - z * 0.031) * 0.3
    + Math.sin(x * 0.008 + z * 0.011) * 0.5;
  return s;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Height in metres above the sea at world position (x, z).
function terrainHeight(x, z) {
  let h = 0;

  // The Java mainland rises south of the coast, gently at first and then
  // into hills. The city itself is flattened separately, below.
  if (z < CONFIG.coastZ) {
    const inland = -CONFIG.coastZ - z;
    h += smoothstep(0, 1400, inland) * 85;
    h += smoothstep(1400, 3200, inland) * 260;
    // Far to the south the volcanoes rise: Salak and Gede on the horizon.
    if (z < CONFIG.mountainZ) {
      const deep = -CONFIG.mountainZ - z;
      const ridge = 0.55 + 0.45 * Math.sin(x * 0.0009 + 1.7)
        * Math.sin(x * 0.0023 - 0.6);
      h += smoothstep(0, 2600, deep) * CONFIG.mountainHeight * Math.max(0, ridge);
    }
    h += wobble(x, z) * 6 * smoothstep(0, 800, inland);
  }

  // Jakarta: flat built-up ground, a little above the sea.
  const c = CONFIG.city;
  if (x > c.xMin && x < c.xMax && z > c.zMin && z < c.zMax) {
    const edge = Math.min(
      (x - c.xMin) / 400, (c.xMax - x) / 400,
      (z - c.zMin) / 400, (c.zMax - z) / 400,
    );
    const blend = smoothstep(0, 1, clamp(edge, 0, 1));
    h = h * (1 - blend) + c.ground * blend + wobble(x, z) * 1.5 * blend;
  }

  // The islands: smooth bumps, flat-topped on the landing island.
  for (const island of CONFIG.islands) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < island.r) {
      const t = d / island.r;
      let bump = island.h * Math.pow(Math.cos(t * Math.PI * 0.5), 0.8);
      if (island.flat) bump = island.h * (t < 0.75 ? 1 : Math.cos((t - 0.75) / 0.25 * Math.PI * 0.5));
      if (bump > h) h = bump;
    }
  }

  return h;
}

// What the ground is at (x, z): water, beach sand, island grass, city
// blocks, the airstrip, or high mountain rock. The renderer colours by it.
function terrainKind(x, z) {
  const r = CONFIG.runway;
  if (Math.abs(x - r.x) < r.width / 2 && Math.abs(z - r.z) < r.length / 2) {
    return "runway";
  }
  const h = terrainHeight(x, z);
  if (h <= 0.5) return "water";
  if (h < 3) return "sand";
  const c = CONFIG.city;
  if (x > c.xMin && x < c.xMax && z > c.zMin && z < c.zMax && h < 40) {
    return "city";
  }
  if (h > 700) return "mountain";
  if (h > 120) return "hill";
  return "grass";
}

// True when (x, z) is on the airstrip.
function onRunway(x, z) {
  const r = CONFIG.runway;
  return Math.abs(x - r.x) < r.width / 2 && Math.abs(z - r.z) < r.length / 2;
}

// The nearest named island to (x, z), within 1200 m, or null.
function nearestIsland(x, z) {
  let best = null;
  let bestD = 1200;
  for (const island of CONFIG.islands) {
    const d = Math.hypot(x - island.x, z - island.z);
    if (d < bestD) {
      bestD = d;
      best = island;
    }
  }
  return best;
}
