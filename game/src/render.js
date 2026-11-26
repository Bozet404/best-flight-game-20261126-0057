// Selat Jakarta Run — rendering.
//
// A chase camera sits behind and above the plane and looks where the nose
// points. The world is drawn with a plain perspective projection: every
// terrain corner is turned into camera space (right, up, forward) and
// divided by its depth. The sky, the sun and the clouds are screen-space
// or projected the same way, the plane itself is drawn in screen space at
// the bottom centre, banking with the roll. No image is loaded anywhere:
// the sea, the islands, the city and the mountains are all coloured
// polygons, and the plane is drawn from paths.

// Camera basis from the plane's heading, pitch and bank.
function cameraBasis(heading, pitch, bank) {
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Forward: where the nose points.
  const f = [sh * cp, sp, ch * cp];
  // Right, level with the horizon.
  const r0 = [ch, 0, -sh];
  // Up, before the bank is applied.
  const u0 = [-sp * sh, cp, -sp * ch];
  const cb = Math.cos(bank);
  const sb = Math.sin(bank);
  // Bank rolls right and up around the forward axis.
  const r = [
    r0[0] * cb + u0[0] * sb,
    r0[1] * cb + u0[1] * sb,
    r0[2] * cb + u0[2] * sb,
  ];
  const u = [
    u0[0] * cb - r0[0] * sb,
    u0[1] * cb - r0[1] * sb,
    u0[2] * cb - r0[2] * sb,
  ];
  return { f, r, u };
}

// Project a world point into screen space. Returns null when it is behind
// the camera or too close to it to draw.
function projectPoint(cam, p, W, H, focal) {
  const dx = p[0] - cam.pos[0];
  const dy = p[1] - cam.pos[1];
  const dz = p[2] - cam.pos[2];
  const cz = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
  if (cz < 3) return null;
  const cx = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2];
  const cy = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
  return {
    x: W / 2 + (cx / cz) * focal,
    y: H * 0.52 - (cy / cz) * focal,
    depth: cz,
  };
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function css(c) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const SKY_TOP = [38, 110, 190];
const SKY_HORIZON = [198, 226, 238];
const FOG_COLOR = [198, 226, 238];

// Fixed cloud puffs over the strait, drawn as projected ellipses.
const CLOUDS = [];
for (let i = 0; i < 16; i++) {
  const seed = i * 2.39996; // golden angle: spreads them without clumping
  CLOUDS.push({
    x: Math.sin(seed) * 4200 + Math.sin(seed * 2.7) * 900,
    z: -800 + i * 640 + Math.cos(seed * 1.3) * 260,
    y: 700 + ((i * 137) % 260),
    rx: 200 + ((i * 89) % 160),
  });
}

class WorldRenderer {
  constructor(ctx) {
    this.ctx = ctx;
  }

  drawSky(W, H, pitch, bank, heading, time) {
    const ctx = this.ctx;
    const focal = H * 1.0;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-bank);
    ctx.translate(-W / 2, -H / 2);
    const g = ctx.createLinearGradient(0, -H * 0.4, 0, H * 1.1);
    g.addColorStop(0, css(SKY_TOP));
    g.addColorStop(0.55, css(mixColor(SKY_TOP, SKY_HORIZON, 0.55)));
    g.addColorStop(1, css(SKY_HORIZON));
    ctx.fillStyle = g;
    ctx.fillRect(-H, -H, W + 2 * H, H * 3);
    ctx.restore();

    // The sun sits low in the west, so morning light comes over the sea.
    const sunAz = -1.15; // radians from north, westward
    // Sun in screen space: fixed by heading difference, simple and stable.
    let rel = sunAz - heading;
    while (rel > Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    if (Math.abs(rel) < 1.2) {
      const sx = W / 2 + Math.tan(rel) * focal;
      const sy = H * 0.24 + Math.tan(pitch) * focal;
      const pulse = 1 + Math.sin(time * 0.8) * 0.02;
      const rg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90 * pulse);
      rg.addColorStop(0, "rgba(255,246,200,0.95)");
      rg.addColorStop(0.25, "rgba(255,224,130,0.55)");
      rg.addColorStop(1, "rgba(255,224,130,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(sx, sy, 90 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff7cf";
      ctx.beginPath();
      ctx.arc(sx, sy, 26 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawClouds(cam, W, H, focal) {
    const ctx = this.ctx;
    for (const cloud of CLOUDS) {
      const p = projectPoint(cam, [cloud.x, cloud.y, cloud.z], W, H, focal);
      if (!p || p.depth > CONFIG.viewDistance) continue;
      const scale = focal / p.depth;
      const rx = cloud.rx * scale;
      if (rx < 4) continue;
      const alpha = Math.max(0, 0.85 - p.depth / CONFIG.viewDistance);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, rx * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x - rx * 0.4, p.y + rx * 0.06, rx * 0.6, rx * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x + rx * 0.45, p.y + rx * 0.05, rx * 0.55, rx * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Colour of one terrain cell, by kind and by distance haze. The colour
  // varies on a wavelength much longer than a cell, so neighbouring cells
  // blend into one continuous sea or meadow instead of a checkerboard.
  cellColor(kind, x, z, h, depth) {
    let base;
    const slow = wobble(x * 0.12, z * 0.12);
    if (kind === "water") {
      const shimmer = slow * 4;
      base = [24 + shimmer, 104 + shimmer, 150 + shimmer];
    } else if (kind === "sand") {
      base = [216, 196, 138];
    } else if (kind === "grass") {
      const v = slow * 6;
      base = [86 + v, 158 + v, 74 + v];
    } else if (kind === "city") {
      base = slow > 0.2 ? [122, 126, 134] : [96, 100, 110];
    } else if (kind === "hill") {
      base = [74, 125, 58];
    } else if (kind === "mountain") {
      base = h > 1400 ? [232, 238, 242] : [112, 122, 138];
    } else if (kind === "runway") {
      // White centreline dashes down the middle of the strip.
      const along = Math.abs(z - CONFIG.runway.z) % 70;
      const centre = Math.abs(x - CONFIG.runway.x) < 2.5;
      base = centre && along < 38 ? [235, 235, 230] : [52, 55, 62];
    } else {
      base = [90, 140, 90];
    }
    const fog = clamp((depth - CONFIG.fogStart) / (CONFIG.viewDistance - CONFIG.fogStart), 0, 1);
    return css(mixColor(base, FOG_COLOR, fog * 0.85));
  }

  drawTerrain(cam, plane, W, H, focal) {
    const ctx = this.ctx;
    const step = 200;
    const x0 = Math.floor((plane.x - 2400) / step) * step;
    const zFar = Math.floor((plane.z + 5200) / step) * step;
    const zNear = Math.floor((plane.z - 1400) / step) * step;
    const cols = 25;
    const rows = Math.round((zFar - zNear) / step) + 1;

    // Heights for the grid, one row at a time from far to near.
    for (let ri = 0; ri < rows - 1; ri++) {
      const zA = zFar - ri * step;
      const zB = zA - step;
      for (let ci = 0; ci < cols; ci++) {
        const xA = x0 + ci * step;
        const xB = xA + step;
        const hA = terrainHeight(xA, zA);
        const hB = terrainHeight(xB, zA);
        const hC = terrainHeight(xB, zB);
        const hD = terrainHeight(xA, zB);
        const pA = projectPoint(cam, [xA, hA, zA], W, H, focal);
        const pB = projectPoint(cam, [xB, hB, zA], W, H, focal);
        const pC = projectPoint(cam, [xB, hC, zB], W, H, focal);
        const pD = projectPoint(cam, [xA, hD, zB], W, H, focal);
        if (!pA || !pB || !pC || !pD) continue;
        const cx = xA + step / 2;
        const cz = zA - step / 2;
        const depth = (pA.depth + pB.depth + pC.depth + pD.depth) / 4;
        if (depth > CONFIG.viewDistance) continue;
        const kind = terrainKind(cx, cz);
        const ch = (hA + hB + hC + hD) / 4;
        ctx.fillStyle = this.cellColor(kind, cx, cz, ch, depth);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.lineTo(pC.x, pC.y);
        ctx.lineTo(pD.x, pD.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // The airstrip, drawn as its own projected polygon on top of the
  // terrain: the strip is only 40 m wide, narrower than one terrain cell,
  // so sampling it per cell would never show it at all.
  drawRunway(cam, W, H, focal) {
    const ctx = this.ctx;
    const r = CONFIG.runway;
    const top = 12.6; // just above the flat island top, so it never z-fights
    const corners = [
      [r.x - r.width / 2, top, r.z - r.length / 2],
      [r.x + r.width / 2, top, r.z - r.length / 2],
      [r.x + r.width / 2, top, r.z + r.length / 2],
      [r.x - r.width / 2, top, r.z + r.length / 2],
    ];
    const pts = corners.map((c) => projectPoint(cam, c, W, H, focal));
    if (pts.some((p) => !p)) return;
    const depth = pts.reduce((a, p) => a + p.depth, 0) / 4;
    if (depth > CONFIG.viewDistance) return;
    ctx.fillStyle = css(mixColor([52, 55, 62], FOG_COLOR, clamp((depth - CONFIG.fogStart) / (CONFIG.viewDistance - CONFIG.fogStart), 0, 1) * 0.85));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    // White centreline dashes down the middle of the strip.
    ctx.strokeStyle = "rgba(235,235,230,0.9)";
    ctx.lineWidth = Math.max(1.5, (3 * focal) / depth);
    ctx.setLineDash([(14 * focal) / depth, (18 * focal) / depth]);
    const a = projectPoint(cam, [r.x, top + 0.1, r.z - r.length / 2 + 20], W, H, focal);
    const b = projectPoint(cam, [r.x, top + 0.1, r.z + r.length / 2 - 20], W, H, focal);
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Threshold bars at both ends of the strip.
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(2, (5 * focal) / depth);
    for (const zend of [r.z - r.length / 2 + 30, r.z + r.length / 2 - 30]) {
      const p1 = projectPoint(cam, [r.x - r.width / 2 + 3, top + 0.1, zend], W, H, focal);
      const p2 = projectPoint(cam, [r.x + r.width / 2 - 3, top + 0.1, zend], W, H, focal);
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }

  drawRings(cam, rings, W, H, focal, time) {
    const ctx = this.ctx;
    rings.forEach((ring, i) => {
      if (ring.passed) return;
      const p = projectPoint(cam, [ring.x, ring.y, ring.z], W, H, focal);
      if (!p || p.depth < 4 || p.depth > CONFIG.viewDistance) return;
      const radius = (ring.r * focal) / p.depth;
      if (radius < 3) return;
      const next = rings.findIndex((r) => !r.passed) === i;
      const pulse = next ? 1 + Math.sin(time * 4) * 0.08 : 1;
      ctx.lineWidth = Math.max(2, radius * 0.1);
      ctx.strokeStyle = next ? "#ff8c1a" : "#ffb35c";
      ctx.globalAlpha = next ? 1 : 0.75;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radius * pulse, radius * 0.92 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = Math.max(4, radius * 0.22);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radius * pulse, radius * 0.92 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (radius > 26) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.max(13, Math.round(radius * 0.32))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), p.x, p.y - radius - 14);
      }
    });
  }

  // The plane, seen from behind and above: wings, fuselage, tail fin and
  // blinking navigation lights. It banks with the roll and pitches a
  // little with the climb.
  drawPlane(W, H, bank, pitch, time) {
    const ctx = this.ctx;
    const cx = W / 2;
    const cy = H * 0.62;
    const s = Math.min(W, H) / 620; // scale: the plane is ~200 px wide at 720p
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bank);
    ctx.translate(0, -pitch * 60 * s);

    // Main wings, with a slight dihedral: wide, so the plane reads as a
    // plane even from directly behind.
    ctx.fillStyle = "#e8e4da";
    ctx.strokeStyle = "#b9b2a2";
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(-138 * s, 6 * s);
    ctx.lineTo(-14 * s, -6 * s);
    ctx.lineTo(14 * s, -6 * s);
    ctx.lineTo(138 * s, 6 * s);
    ctx.lineTo(130 * s, 16 * s);
    ctx.lineTo(0, 10 * s);
    ctx.lineTo(-130 * s, 16 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fuselage, seen from the tail: a short rounded body, wider at the
    // belly, so the plane reads as a plane and not a tower.
    const body = ctx.createLinearGradient(-16 * s, 0, 16 * s, 0);
    body.addColorStop(0, "#c8452c");
    body.addColorStop(0.5, "#e85a33");
    body.addColorStop(1, "#a93220");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-13 * s, -34 * s);
    ctx.quadraticCurveTo(-19 * s, -6 * s, -15 * s, 26 * s);
    ctx.quadraticCurveTo(-8 * s, 36 * s, 0, 36 * s);
    ctx.quadraticCurveTo(8 * s, 36 * s, 15 * s, 26 * s);
    ctx.quadraticCurveTo(19 * s, -6 * s, 13 * s, -34 * s);
    ctx.quadraticCurveTo(0, -40 * s, -13 * s, -34 * s);
    ctx.closePath();
    ctx.fill();

    // Tail fin on top.
    ctx.fillStyle = "#e85a33";
    ctx.beginPath();
    ctx.moveTo(-4 * s, -34 * s);
    ctx.lineTo(-3 * s, -50 * s);
    ctx.lineTo(5 * s, -50 * s);
    ctx.lineTo(8 * s, -34 * s);
    ctx.closePath();
    ctx.fill();

    // Horizontal stabiliser.
    ctx.fillStyle = "#e8e4da";
    ctx.beginPath();
    ctx.moveTo(-46 * s, 22 * s);
    ctx.lineTo(46 * s, 22 * s);
    ctx.lineTo(40 * s, 30 * s);
    ctx.lineTo(-40 * s, 30 * s);
    ctx.closePath();
    ctx.fill();

    // Windows: two dark panes on the tail cone.
    ctx.fillStyle = "#20242c";
    ctx.beginPath();
    ctx.ellipse(-6 * s, -20 * s, 4.5 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6 * s, -20 * s, 4.5 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Registration on the belly.
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `bold ${Math.round(11 * s)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PK-SJR", 0, 12 * s);

    // Navigation lights, blinking once a second.
    const blink = Math.sin(time * 6) > 0;
    ctx.fillStyle = "#ff2d2d";
    ctx.beginPath();
    ctx.arc(-136 * s, 10 * s, 4.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2dff5e";
    ctx.beginPath();
    ctx.arc(136 * s, 10 * s, 4.5 * s, 0, Math.PI * 2);
    ctx.fill();
    if (blink) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, -50 * s, 4 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
