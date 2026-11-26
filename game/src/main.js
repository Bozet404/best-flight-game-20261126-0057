// Selat Jakarta Run — game loop and rules.
//
// States: menu → flying ⇄ paused → landed / crashed → (restart) → flying.
// The plane is an arcade flight model: throttle sets the target speed,
// pitch sets the climb, bank turns the heading, and the rudder nudges it.
// Rings score 100 each; a gentle touchdown on the Pulau Pari strip scores
// 500 plus a smooth-landing bonus and a time bonus. Touching the sea, an
// island, the city or a mountain anywhere else is a crash.

const MS_PER_KNOT = 1.94384;
const M_PER_FOOT = 3.28084;

function freshPlane() {
  return {
    x: CONFIG.start.x,
    y: CONFIG.start.y,
    z: CONFIG.start.z,
    heading: CONFIG.start.heading,
    pitch: 0,
    bank: 0,
    speed: CONFIG.start.speed,
    throttle: 0.55,
    verticalSpeed: 0,
  };
}

function freshRings() {
  return CONFIG.rings.map((r) => ({ ...r, passed: false }));
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.renderer = new WorldRenderer(this.ctx);
    this.hud = new Hud(this.ctx);
    this.audio = new FlightAudio();
    this.input = new FlightInput(canvas);
    this.plane = freshPlane();
    this.rings = freshRings();
    this.phase = "menu"; // menu | flying | paused | landed | crashed
    this.score = 0;
    this.ringsPassed = 0;
    this.elapsed = 0;
    this.startTime = 0;
    this.lastTime = 0;
    this.time = 0; // seconds since the page loaded, for animation
    this.outOfBounds = false;
    this.endReason = "";
    this.endBreakdown = [];
    this.best = 0;
    try {
      this.best = Number(localStorage.getItem("sjr-best") || 0) || 0;
    } catch (e) {
      this.best = 0;
    }
    this.stallWarnedAt = 0;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.bindButtons();
    this.updateOverlays();
    requestAnimationFrame((t) => this.frame(t));
    // Exposed for automated play-testing only: the game itself never reads
    // window.__game, and no network request is ever made.
    window.__game = this;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.W = w;
    this.H = h;
    this.dpr = dpr;
  }

  bindButtons() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", () => {
        this.audio.ensure();
        this.audio.click();
        fn();
      });
    };
    on("btn-start", () => this.start());
    on("btn-resume", () => this.resume());
    on("btn-restart", () => this.restart());
    on("btn-restart-end", () => this.restart());
    on("btn-menu", () => this.toMenu());
    on("btn-menu-end", () => this.toMenu());
    on("btn-pause", () => this.pause());
    on("btn-mute", () => this.toggleMute());
    on("btn-mute-menu", () => this.toggleMute());
    on("btn-mouse", () => this.toggleMouseSteer());
    on("btn-how", () => this.toggleHow());
  }

  // ---- State transitions ----

  start() {
    this.plane = freshPlane();
    this.rings = freshRings();
    this.score = 0;
    this.ringsPassed = 0;
    this.elapsed = 0;
    this.startTime = this.time;
    this.phase = "flying";
    this.endReason = "";
    this.endBreakdown = [];
    this.audio.ensure();
    this.updateOverlays();
  }

  restart() {
    this.start();
  }

  pause() {
    if (this.phase !== "flying") return;
    this.phase = "paused";
    this.audio.idle();
    this.updateOverlays();
  }

  resume() {
    if (this.phase !== "paused") return;
    this.phase = "flying";
    this.audio.ensure();
    this.updateOverlays();
  }

  toMenu() {
    this.phase = "menu";
    this.plane = freshPlane();
    this.rings = freshRings();
    this.score = 0;
    this.ringsPassed = 0;
    this.elapsed = 0;
    this.audio.idle();
    this.updateOverlays();
  }

  toggleMute() {
    this.audio.ensure();
    this.audio.setMuted(!this.audio.muted);
    this.updateMuteButtons();
  }

  toggleMouseSteer() {
    this.input.mouseSteer = !this.input.mouseSteer;
    this.updateOverlays();
  }

  toggleHow() {
    const el = document.getElementById("howto");
    if (el) el.classList.toggle("open");
  }

  // ---- Scoring and endings ----

  land() {
    const p = this.plane;
    const gentle = Math.abs(p.verticalSpeed) < 3 && p.speed < 75;
    const timeBonus = Math.max(
      0,
      Math.round((CONFIG.score.parSeconds - this.elapsed) * CONFIG.score.timeBonusPerSecond),
    );
    this.score += CONFIG.score.landing;
    if (gentle) this.score += CONFIG.score.smoothLanding;
    this.score += timeBonus;
    this.endBreakdown = [
      ["Ring", `${this.ringsPassed} × ${CONFIG.score.ring} = ${this.ringsPassed * CONFIG.score.ring}`],
      ["Mendarat di Pulau Pari", `+${CONFIG.score.landing}`],
    ];
    if (gentle) this.endBreakdown.push(["Pendaratan halus", `+${CONFIG.score.smoothLanding}`]);
    if (timeBonus > 0) this.endBreakdown.push(["Bonus waktu", `+${timeBonus}`]);
    this.endReason = gentle
      ? "Pendaratan halus di landasan Pulau Pari. Misi selesai!"
      : "Mendarat di landasan Pulau Pari. Misi selesai!";
    this.finish("landed");
    this.audio.land();
  }

  crash(reason) {
    this.endReason = reason;
    this.endBreakdown = [
      ["Ring", `${this.ringsPassed} × ${CONFIG.score.ring} = ${this.ringsPassed * CONFIG.score.ring}`],
      ["Mendarat", "+0"],
    ];
    this.finish("crashed");
    this.audio.crash();
  }

  finish(phase) {
    this.phase = phase;
    if (this.score > this.best) {
      this.best = this.score;
      try {
        localStorage.setItem("sjr-best", String(this.best));
      } catch (e) {
        // Private mode or no storage: the best score just is not kept.
      }
    }
    this.updateOverlays();
  }

  // ---- Per-frame update ----

  frame(t) {
    const dt = Math.min(0.05, (t - this.lastTime) / 1000 || 0.016);
    this.lastTime = t;
    this.time = t / 1000;
    this.handleHotkeys();
    if (this.phase === "flying") this.update(dt);
    this.render();
    requestAnimationFrame((nt) => this.frame(nt));
  }

  handleHotkeys() {
    if (this.input.pressed("p") || this.input.pressed("P")) {
      if (this.phase === "flying") this.pause();
      else if (this.phase === "paused") this.resume();
    }
    if (this.input.pressed("m") || this.input.pressed("M")) this.toggleMute();
    if (this.input.pressed("r") || this.input.pressed("R")) {
      if (this.phase === "flying" || this.phase === "paused" || this.phase === "landed" || this.phase === "crashed") {
        this.restart();
      }
    }
    if (this.input.pressed("Enter")) {
      if (this.phase === "menu" || this.phase === "landed" || this.phase === "crashed") {
        this.start();
      } else if (this.phase === "paused") {
        this.resume();
      }
    }
    if (this.input.pressed("Escape") && this.phase === "paused") this.resume();
  }

  update(dt) {
    const p = this.plane;
    const f = CONFIG.flight;
    const prevZ = p.z;

    // Throttle: Shift up, Ctrl down, mouse wheel in steps.
    if (this.input.throttleUp()) p.throttle += f.throttleRate * dt;
    if (this.input.throttleDown()) p.throttle -= f.throttleRate * dt;
    const wheel = this.input.takeWheel();
    if (wheel !== 0) p.throttle -= Math.sign(wheel) * 0.06;
    p.throttle = Math.max(0, Math.min(1, p.throttle));

    // Airbrake: Space sheds speed fast.
    const braking = this.input.brake();

    // Speed chases the throttle's target; drag grows with the square of
    // speed, so the plane settles instead of accelerating forever.
    const target = f.minSpeed + p.throttle * (f.maxSpeed - f.minSpeed);
    const rate = braking ? 3.2 : 0.55;
    p.speed += (target - p.speed) * Math.min(1, rate * dt);
    if (braking) p.speed = Math.max(f.minSpeed, p.speed - 18 * dt);

    // Pitch and bank chase the stick, then ease back toward level.
    const pitchIn = this.input.pitch();
    const rollIn = this.input.roll();
    p.pitch += pitchIn * f.pitchRate * dt;
    p.pitch = Math.max(-f.maxPitch, Math.min(f.maxPitch, p.pitch));
    if (pitchIn === 0) p.pitch *= Math.max(0, 1 - 1.4 * dt);
    p.bank += rollIn * f.rollRate * dt;
    p.bank = Math.max(-f.maxBank, Math.min(f.maxBank, p.bank));
    if (rollIn === 0) p.bank *= Math.max(0, 1 - 1.8 * dt);

    // A stall drops the nose: below stall speed the wing cannot hold the
    // pitch the pilot asks for.
    if (p.speed < f.stallSpeed) {
      p.pitch -= (f.stallSpeed - p.speed) * 0.02 * dt * 10;
      p.pitch = Math.max(-f.maxPitch, p.pitch);
      if (this.time - this.stallWarnedAt > 2.5) {
        this.stallWarnedAt = this.time;
        this.audio.stallWarn();
      }
    }

    // Bank turns the heading; the rudder nudges it either way.
    p.heading += -p.bank * (p.speed / 420) * dt;
    p.heading += this.input.yaw() * f.yawRate * dt;

    // Move forward and climb with the pitch.
    const cp = Math.cos(p.pitch);
    const vx = Math.sin(p.heading) * cp * p.speed;
    const vz = Math.cos(p.heading) * cp * p.speed;
    p.verticalSpeed = Math.sin(p.pitch) * p.speed;

    // Ground effect over the strip: the air cushions the plane as it
    // nears the runway, so a descent flares itself into a gentle
    // touchdown instead of a slam. Without it, landing on a 900 m strip
    // would need a descent so steep it could never be gentle.
    const groundBelow = terrainHeight(p.x, p.z);
    if (onRunway(p.x, p.z) && p.verticalSpeed < 0) {
      const above = p.y - groundBelow;
      if (above < 60) {
        p.verticalSpeed *= Math.max(0.25, above / 60);
      }
    }
    // Settle assist: low and slow over the strip, the plane sinks gently
    // onto the runway on its own, so a player who lines up the approach
    // and throttles back is rewarded with a landing instead of floating
    // past the end of the strip forever.
    if (onRunway(p.x, p.z) && p.speed < 85 && p.y - groundBelow < 25 && p.y - groundBelow > 1.5) {
      p.verticalSpeed = Math.min(p.verticalSpeed, -2.5);
    }
    p.x += vx * dt;
    p.z += vz * dt;
    p.y += p.verticalSpeed * dt;
    if (p.y > 1200) p.y = 1200; // service ceiling

    this.elapsed = this.time - this.startTime;

    // Mission area.
    const b = CONFIG.bounds;
    this.outOfBounds = Math.abs(p.x) > b.x || p.z < b.zMin || p.z > b.zMax;

    // Rings: crossing a ring's plane inside its circle scores it.
    for (const ring of this.rings) {
      if (ring.passed) continue;
      const crossed = (prevZ < ring.z && p.z >= ring.z) || (prevZ > ring.z && p.z <= ring.z);
      if (!crossed) continue;
      const dx = p.x - ring.x;
      const dy = p.y - ring.y;
      if (Math.hypot(dx, dy) <= ring.r) {
        ring.passed = true;
        this.ringsPassed++;
        this.score += CONFIG.score.ring;
        this.audio.ring();
      }
    }

    // Ground contact.
    const ground = terrainHeight(p.x, p.z);
    if (p.y <= ground + 1.5) {
      p.y = ground + 1.5;
      if (onRunway(p.x, p.z) && p.speed >= 30 && p.speed <= 95 && Math.abs(p.verticalSpeed) < 12 && Math.abs(p.pitch) < 0.3) {
        this.land();
        return;
      }
      const what = ground <= 0.5
        ? "Pesawat jatuh ke laut."
        : onRunway(p.x, p.z)
          ? "Pendaratan terlalu keras — pesawat rusak di landasan."
          : `Pesawat menabrak daratan (${nearestIsland(p.x, p.z)?.name || "pantai"}).`;
      this.crash(what);
      return;
    }

    this.audio.update(p.throttle, p.speed * MS_PER_KNOT);
  }

  // ---- Rendering ----

  render() {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = this.plane;
    const focal = H * 1.0;
    const basis = cameraBasis(p.heading, p.pitch, p.bank);
    const camPos = [
      p.x - basis.f[0] * 26 + basis.u[0] * 6.5,
      p.y - basis.f[1] * 26 + basis.u[1] * 6.5,
      p.z - basis.f[2] * 26 + basis.u[2] * 6.5,
    ];
    const cam = { pos: camPos, ...basis };

    this.renderer.drawSky(W, H, p.pitch, p.bank, p.heading, this.time);
    this.renderer.drawClouds(cam, W, H, focal);
    this.renderer.drawTerrain(cam, p, W, H, focal);
    this.renderer.drawRunway(cam, W, H, focal);
    this.renderer.drawRings(cam, this.rings, W, H, focal, this.time);
    if (this.phase !== "menu") {
      this.renderer.drawPlane(W, H, p.bank, p.pitch, this.time);
    }
    if (this.phase === "flying" || this.phase === "paused") {
      this.hud.draw(this, W, H);
    }
    if (this.phase === "menu") this.drawMenuScene(W, H);
  }

  // A quiet attract scene behind the menu: the plane cruising over the
  // strait, so the first thing a player sees is the game itself.
  drawMenuScene(W, H) {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(10,18,28,0.45)";
    ctx.fillRect(0, H - 150, W, 54);
    ctx.fillStyle = "#ffffff";
    ctx.font = "15px sans-serif";
    ctx.fillText("Kepulauan Seribu — Selat Jakarta, pagi hari", W / 2, H - 132);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "13px sans-serif";
    ctx.fillText("Terbang melewati 8 ring, lalu mendarat di Pulau Pari", W / 2, H - 108);
  }

  // ---- Overlays (HTML) ----

  updateOverlays() {
    const show = (id, on) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("hidden", !on);
    };
    show("menu", this.phase === "menu");
    show("pause", this.phase === "paused");
    show("end", this.phase === "landed" || this.phase === "crashed");
    show("topbar", this.phase === "flying" || this.phase === "paused");

    if (this.phase === "menu") {
      const bestEl = document.getElementById("best-score");
      if (bestEl) bestEl.textContent = this.best > 0 ? `Skor terbaik: ${this.best}` : "";
      const mouseBtn = document.getElementById("btn-mouse");
      if (mouseBtn) mouseBtn.textContent = this.input.mouseSteer ? "Mouse: ON" : "Mouse: OFF";
    }
    if (this.phase === "landed" || this.phase === "crashed") {
      const title = document.getElementById("end-title");
      const reason = document.getElementById("end-reason");
      const scoreEl = document.getElementById("end-score");
      const table = document.getElementById("end-breakdown");
      if (title) {
        title.textContent = this.phase === "landed" ? "MISI SELESAI ✈" : "PESAWAT JATUH";
        title.className = this.phase === "landed" ? "end-title win" : "end-title lose";
      }
      if (reason) reason.textContent = this.endReason;
      if (scoreEl) scoreEl.textContent = `Skor: ${this.score}`;
      if (table) {
        table.innerHTML = this.endBreakdown
          .map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`)
          .join("");
      }
      const bestEl = document.getElementById("end-best");
      if (bestEl) bestEl.textContent = `Skor terbaik: ${this.best}`;
    }
    this.updateMuteButtons();
  }

  updateMuteButtons() {
    for (const id of ["btn-mute", "btn-mute-menu"]) {
      const el = document.getElementById(id);
      if (el) el.textContent = this.audio.muted ? "🔇 Suara: OFF" : "🔊 Suara: ON";
    }
  }
}

// Start the game once the page has loaded.
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game");
  new Game(canvas);
});
