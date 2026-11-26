// Selat Jakarta Run — sound.
//
// Every sound is synthesised with WebAudio: a two-oscillator engine hum
// whose pitch follows the throttle, wind noise whose loudness follows the
// airspeed, and short chimes and thuds for rings, landings and crashes.
// No audio file is loaded, and nothing is fetched from the network.

class FlightAudio {
  constructor() {
    this.ctx = null; // created on the first user gesture, never before
    this.muted = false;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windSource = null;
    this.windGain = null;
    this.windFilter = null;
    this.master = null;
  }

  // Start the audio graph. Called from the Start button, so the browser
  // allows it. Safe to call twice.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    // Engine: a low sawtooth and its octave, slightly detuned.
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = "sawtooth";
    this.engineOsc1.frequency.value = 58;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = "square";
    this.engineOsc2.frequency.value = 116;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc1.connect(engineFilter);
    this.engineOsc2.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc1.start();
    this.engineOsc2.start();

    // Wind: looped white noise through a band-pass filter.
    const len = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.windSource.start();
  }

  // Called every frame while flying: engine pitch follows throttle,
  // wind loudness follows airspeed.
  update(throttle, speedKnots) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const base = 52 + throttle * 46;
    this.engineOsc1.frequency.setTargetAtTime(base, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(base * 2 + 3, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.075, t, 0.1);
    const wind = Math.min(0.16, Math.max(0, (speedKnots - 40) / 600));
    this.windGain.gain.setTargetAtTime(wind, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + speedKnots * 4, t, 0.2);
  }

  // Silence the continuous sounds (pause, crash, end of flight).
  idle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0, t, 0.1);
    this.windGain.gain.setTargetAtTime(0, t, 0.1);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  // One short tone: a sine that rises or falls, with a quick fade.
  blip(freqStart, freqEnd, duration, volume) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // Ring passed: a bright two-note chime.
  ring() {
    this.blip(880, 880, 0.12, 0.22);
    setTimeout(() => this.blip(1318, 1318, 0.22, 0.22), 90);
  }

  // A soft UI click for buttons.
  click() {
    this.blip(660, 520, 0.06, 0.12);
  }

  // Crash: a burst of filtered noise and a low thud.
  crash() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    this.blip(120, 38, 0.5, 0.4);
    this.idle();
  }

  // Landing: a warm three-note fanfare.
  land() {
    this.blip(523, 523, 0.15, 0.2);
    setTimeout(() => this.blip(659, 659, 0.15, 0.2), 130);
    setTimeout(() => this.blip(784, 784, 0.35, 0.22), 260);
    this.idle();
  }

  // Stall warning: two low beeps.
  stallWarn() {
    this.blip(220, 220, 0.12, 0.18);
    setTimeout(() => this.blip(220, 220, 0.12, 0.18), 180);
  }
}
