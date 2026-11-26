// Selat Jakarta Run — input.
//
// Keyboard and mouse, both live at once. Keyboard: arrows or WASD for
// pitch and roll, Q/E for the rudder, Shift/Ctrl for the throttle, Space
// for the airbrake, P to pause, M to mute, R to restart, Enter to start.
// Mouse: moving the pointer steers toward it when mouse steering is on,
// and the wheel sets the throttle. Every control also has a button on
// screen, wired in main.js, so the game is playable either way.

class FlightInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, inside: false };
    this.mouseSteer = false;
    this.wheelDelta = 0; // consumed by the game loop each frame
    this.onKey = this.onKey.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onBlur = this.onBlur.bind(this);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mouseleave", this.onMouseLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: true });
  }

  onKey(e) {
    // Arrow keys and Space scroll the page by default; the game owns them.
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
    this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }

  onKeyUp(e) {
    this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }

  onBlur() {
    this.keys.clear();
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
    this.mouse.inside = true;
  }

  onMouseLeave() {
    this.mouse.inside = false;
  }

  onWheel(e) {
    this.wheelDelta += e.deltaY;
  }

  down(...names) {
    return names.some((n) => this.keys.has(n));
  }

  // Pitch stick, -1 (nose down) to +1 (nose up).
  pitch() {
    let v = 0;
    if (this.down("ArrowDown", "s")) v -= 1;
    if (this.down("ArrowUp", "w")) v += 1;
    if (this.mouseSteer && this.mouse.inside) {
      const rect = this.canvas.getBoundingClientRect();
      const ny = (this.mouse.y / rect.height - 0.5) * 2;
      v += Math.max(-1, Math.min(1, -ny * 1.4));
    }
    return Math.max(-1, Math.min(1, v));
  }

  // Roll stick, -1 (left) to +1 (right).
  roll() {
    let v = 0;
    if (this.down("ArrowLeft", "a")) v -= 1;
    if (this.down("ArrowRight", "d")) v += 1;
    if (this.mouseSteer && this.mouse.inside) {
      const rect = this.canvas.getBoundingClientRect();
      const nx = (this.mouse.x / rect.width - 0.5) * 2;
      v += Math.max(-1, Math.min(1, nx * 1.4));
    }
    return Math.max(-1, Math.min(1, v));
  }

  // Rudder, -1 (left) to +1 (right).
  yaw() {
    let v = 0;
    if (this.down("q")) v -= 1;
    if (this.down("e")) v += 1;
    return v;
  }

  throttleUp() {
    return this.down("Shift");
  }

  throttleDown() {
    return this.down("Control");
  }

  brake() {
    return this.down(" ");
  }

  // Edge-triggered keys: the game loop calls these once per press.
  pressed(name) {
    const key = name.length === 1 ? name.toLowerCase() : name;
    if (this.keys.has(key)) {
      this.keys.delete(key);
      return true;
    }
    return false;
  }

  takeWheel() {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }
}
