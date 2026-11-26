// Selat Jakarta Run — HUD and instruments.
//
// The heads-up display is drawn on the same canvas as the world: a compass
// tape across the top, altitude/speed/throttle readouts at the left, the
// score and the mission step at the right, and a lit instrument panel along
// the bottom — an attitude indicator, an airspeed dial, an altimeter and a
// throttle gauge — plus stall and terrain warnings when they matter.

function formatFeet(metres) {
  return `${Math.round(metres * 3.28084).toLocaleString("en-US")} ft`;
}

function formatKnots(ms) {
  return `${Math.round(ms * 1.94384)} kt`;
}

function compassLabel(degrees) {
  const dirs = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"];
  const idx = Math.round(degrees / 45) % 8;
  return dirs[idx];
}

class Hud {
  constructor(ctx) {
    this.ctx = ctx;
  }

  draw(state, W, H) {
    const ctx = this.ctx;
    const p = state.plane;
    const headingDeg = ((p.heading * 180) / Math.PI % 360 + 360) % 360;
    const knots = p.speed * 1.94384;
    const vsFpm = p.verticalSpeed * 196.85;

    ctx.textBaseline = "middle";

    // ---- Compass tape across the top ----
    const tapeY = 26;
    ctx.fillStyle = "rgba(10,18,28,0.55)";
    ctx.fillRect(0, 6, W, 40);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `${String(Math.round(headingDeg)).padStart(3, "0")}° ${compassLabel(headingDeg)}`,
      W / 2, tapeY,
    );
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let d = -120; d <= 120; d += 15) {
      const deg = Math.round(headingDeg + d);
      const x = W / 2 + d * 2.4;
      if (x < 8 || x > W - 8) continue;
      const norm = ((deg % 360) + 360) % 360;
      const major = norm % 45 === 0;
      ctx.fillRect(x - 0.5, tapeY - 14, 1, major ? 10 : 6);
      if (major) {
        ctx.fillText(
          norm === 0 ? "U" : norm === 90 ? "T" : norm === 180 ? "S" : norm === 270 ? "B" : String(norm),
          x, tapeY + 12,
        );
      }
    }
    // Centre caret.
    ctx.fillStyle = "#ffb020";
    ctx.beginPath();
    ctx.moveTo(W / 2 - 7, 6);
    ctx.lineTo(W / 2 + 7, 6);
    ctx.lineTo(W / 2, 16);
    ctx.closePath();
    ctx.fill();

    // ---- Left readouts: altitude, speed, vertical speed, throttle ----
    const lx = 18;
    let ly = 66;
    const readout = (label, value, accent) => {
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(10,18,28,0.55)";
      ctx.fillRect(lx - 8, ly - 15, 168, 30);
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "11px sans-serif";
      ctx.fillText(label, lx, ly - 5);
      ctx.fillStyle = accent || "#ffffff";
      ctx.font = "bold 17px sans-serif";
      ctx.fillText(value, lx, ly + 8);
      ly += 38;
    };
    readout("KETINGGIAN", formatFeet(p.y), p.y < 60 ? "#ffcf4d" : "#ffffff");
    readout("KECEPATAN", formatKnots(p.speed), p.speed < CONFIG.flight.stallSpeed ? "#ff5a4d" : "#ffffff");
    readout("VERTIKAL", `${vsFpm >= 0 ? "+" : ""}${Math.round(vsFpm)} ft/mnt`, vsFpm >= 0 ? "#7ddb8a" : "#ffb020");
    // Throttle bar under the readouts.
    ctx.fillStyle = "rgba(10,18,28,0.55)";
    ctx.fillRect(lx - 8, ly - 12, 168, 34);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "11px sans-serif";
    ctx.fillText(`THROTTLE ${Math.round(p.throttle * 100)}%`, lx, ly + 2);
    ctx.fillStyle = "#12324a";
    ctx.fillRect(lx, ly + 10, 152, 8);
    ctx.fillStyle = p.throttle > 0.85 ? "#ff5a4d" : "#37b6ff";
    ctx.fillRect(lx, ly + 10, 152 * p.throttle, 8);

    // ---- Right: score, rings, time, mission (below the topbar buttons) ----
    const rx = W - 18;
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(10,18,28,0.55)";
    ctx.fillRect(rx - 190, 100, 190, 108);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "11px sans-serif";
    ctx.fillText("SKOR", rx - 10, 114);
    ctx.fillStyle = "#ffd34d";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(String(state.score), rx - 10, 136);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(
      `RING ${state.ringsPassed} / ${CONFIG.rings.length}`,
      rx - 10, 162,
    );
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "12px sans-serif";
    const elapsed = Math.floor(state.elapsed);
    ctx.fillText(
      `WAKTU ${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`,
      rx - 10, 184,
    );
    const island = nearestIsland(p.x, p.z);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "12px sans-serif";
    ctx.fillText(
      island ? `Di atas ${island.name}` : "Di atas Selat Jakarta",
      rx - 10, 202,
    );

    // Next-ring bearing hint, under the compass. The rings the game
    // tracks (state.rings) carry the passed flags, not CONFIG.rings.
    const nextRing = state.rings.find((r) => !r.passed);
    if (nextRing && state.phase === "flying") {
      const dx = nextRing.x - p.x;
      const dz = nextRing.z - p.z;
      const bearing = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
      let diff = bearing - headingDeg;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      const dist = Math.round(Math.hypot(dx, dz));
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(10,18,28,0.55)";
      const label = `RING ${state.ringsPassed + 1} • ${dist} m • ${diff > 8 ? "belok kanan" : diff < -8 ? "belok kiri" : "lurus"}`;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(W / 2 - tw / 2 - 10, 52, tw + 20, 22);
      ctx.fillStyle = "#ffb020";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(label, W / 2, 63);
    }

    // ---- Warnings ----
    let warnY = H - 178;
    const warn = (text, color) => {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(10,18,28,0.6)";
      const tw = ctx.measureText(text).width;
      ctx.fillRect(W / 2 - tw / 2 - 12, warnY - 13, tw + 24, 26);
      ctx.fillStyle = color;
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(text, W / 2, warnY);
      warnY -= 32;
    };
    if (state.phase === "flying" && p.speed < CONFIG.flight.stallSpeed) {
      warn("⚠ STALL — TAMBAH THROTTLE", "#ff5a4d");
    }
    if (state.phase === "flying" && p.y - terrainHeight(p.x, p.z) < 45) {
      warn("⚠ TERRAIN — NAIK!", "#ffb020");
    }
    if (state.outOfBounds) {
      warn("⚠ KELUAR AREA MISI — BALIK KE JALUR", "#ffb020");
    }

    this.drawPanel(state, W, H);
  }

  drawPanel(state, W, H) {
    const ctx = this.ctx;
    const p = state.plane;
    const panelH = 108;
    const panelY = H - panelH;
    ctx.fillStyle = "rgba(8,16,26,0.78)";
    ctx.fillRect(0, panelY, W, panelH);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(0, panelY, W, 1);

    const cx = W / 2;
    const cy = panelY + panelH / 2 + 4;
    const R = 40;

    // ---- Attitude indicator (artificial horizon) ----
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-p.bank);
    const pitchPx = p.pitch * R * 1.6;
    ctx.fillStyle = "#2f7fc4";
    ctx.fillRect(-R - 2, -R - 2 - pitchPx, 2 * R + 4, R + 2 + pitchPx);
    ctx.fillStyle = "#8a5a33";
    ctx.fillRect(-R - 2, pitchPx, 2 * R + 4, R + 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-R, pitchPx);
    ctx.lineTo(R, pitchPx);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "#c8d2da";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings of the indicator.
    ctx.fillStyle = "#ffd34d";
    ctx.fillRect(cx - R - 2, cy - 2, 16, 4);
    ctx.fillRect(cx + R - 14, cy - 2, 16, 4);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ATTITUDE", cx, panelY + 12);

    // ---- Airspeed dial (left of attitude) ----
    this.drawDial(cx - 110, cy, R - 6, p.speed, CONFIG.flight.maxSpeed, "KT", Math.round(p.speed * 1.94384), "#37b6ff");

    // ---- Altimeter dial (right of attitude) ----
    this.drawDial(cx + 110, cy, R - 6, p.y, 900, "FT", Math.round(p.y * 3.28084), "#7ddb8a");

    // ---- Flaps/gear style status lights at the far right ----
    const lights = [
      { label: "RING", on: state.ringsPassed > 0, color: "#37b6ff" },
      { label: "STRIP", on: onRunway(p.x, p.z), color: "#7ddb8a" },
      { label: "MESIN", on: p.throttle > 0.05, color: "#ffd34d" },
    ];
    let lx = W - 170;
    ctx.textAlign = "center";
    for (const light of lights) {
      ctx.fillStyle = light.on ? light.color : "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(lx, cy - 12, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "10px sans-serif";
      ctx.fillText(light.label, lx, cy + 16);
      lx += 52;
    }

    // ---- Throttle lever at the far left ----
    const tx = 56;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(tx - 4, cy - R, 8, 2 * R);
    ctx.fillStyle = "#37b6ff";
    const leverY = cy + R - p.throttle * 2 * R;
    ctx.fillRect(tx - 12, leverY - 5, 24, 10);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "10px sans-serif";
    ctx.fillText("THR", tx, panelY + 12);
  }

  drawDial(cx, cy, R, value, max, unit, shown, color) {
    const ctx = this.ctx;
    ctx.fillStyle = "#0d1a26";
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c8d2da";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    const frac = Math.max(0, Math.min(1, value / max));
    const angle = -Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (R - 6), cy + Math.sin(angle) * (R - 6));
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(shown), cx, cy + 5);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "9px sans-serif";
    ctx.fillText(unit, cx, cy + 18);
  }
}
