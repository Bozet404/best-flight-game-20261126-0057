// CDP play-test harness for Selat Jakarta Run.
// Drives headless Chromium over the DevTools protocol with the built-in
// WebSocket client: navigates, clicks real buttons, presses real keys,
// reads window.__game state, collects console errors and failed requests,
// and saves JPEG screenshots. Usage:
//   node test/cdp-test.mjs <mode>
// modes: smoke | fly | ring | land | crash | shots
// Screenshots land in ~/workspace/makefun/best-flight-game-20261126-0057/test/shots/

import { execFile, spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "test", "shots");
mkdirSync(SHOTS, { recursive: true });

const CHROME =
  process.env.CHROME ||
  `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 9333;
const URL = "http://127.0.0.1:8080/index.html";
const MODE = process.argv[2] || "smoke";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sh(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(" ")}: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error("evaluate failed: " + JSON.stringify(r.exceptionDetails).slice(0, 500));
  }
  return r.result?.value;
}

async function key(type, keyName, code, keyCode) {
  await send("Input.dispatchKeyEvent", {
    type,
    key: keyName,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

async function keyPress(keyName, code, keyCode) {
  await key("keyDown", keyName, code, keyCode);
  await sleep(50);
  await key("keyUp", keyName, code, keyCode);
}

async function keyHold(keyName, code, keyCode, ms) {
  await key("keyDown", keyName, code, keyCode);
  await sleep(ms);
  await key("keyUp", keyName, code, keyCode);
}

async function click(x, y) {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function clickButton(selector) {
  const box = await evalJs(`(() => {
    const el = document.querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, visible: r.width > 0 && getComputedStyle(el).display !== 'none' };
  })()`);
  if (!box) throw new Error(`button not found: ${selector}`);
  if (!box.visible) throw new Error(`button not visible: ${selector}`);
  await click(box.x, box.y);
  return box;
}

async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
  writeFileSync(join(SHOTS, name), Buffer.from(r.data, "base64"));
  console.log(`shot: ${name}`);
}

async function state() {
  return evalJs(`(() => {
    const g = window.__game;
    if (!g) return { error: "no __game" };
    const p = g.plane;
    return {
      phase: g.phase, score: g.score, ringsPassed: g.ringsPassed,
      x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z),
      heading: Math.round(p.heading * 180 / Math.PI),
      pitch: +p.pitch.toFixed(2), bank: +p.bank.toFixed(2),
      speed: Math.round(p.speed), throttle: +p.throttle.toFixed(2),
      elapsed: Math.round(g.elapsed), muted: g.audio.muted,
      mouseSteer: g.input.mouseSteer, outOfBounds: g.outOfBounds,
      ground: Math.round(terrainHeight(p.x, p.z)),
    };
  })()`);
}

async function main() {
  // Static server for game/.
  const server = spawn("python3", ["-m", "http.server", "8080", "--bind", "127.0.0.1"], {
    cwd: join(ROOT, "game"),
    stdio: "ignore",
  });
  await sleep(1200);

  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--window-size=1280,800",
    "--autoplay-policy=no-user-gesture-required",
    "about:blank",
  ], { stdio: "ignore" });
  await sleep(2500);

  const errors = [];
  const failedReqs = [];
  try {
    let list = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        list = await res.json();
        break;
      } catch {
        await sleep(500);
      }
    }
    if (!list) throw new Error("DevTools /json/list never answered");
    const page = list.find((t) => t.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        errors.push("EXCEPTION: " + JSON.stringify(msg.params.exceptionDetails).slice(0, 400));
      }
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        errors.push("CONSOLE ERROR: " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
      }
      if (msg.method === "Network.loadingFailed") {
        failedReqs.push("FAILED REQ: " + JSON.stringify(msg.params).slice(0, 300));
      }
      if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400) {
        failedReqs.push(`HTTP ${msg.params.response.status}: ${msg.params.response.url}`);
      }
    };
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: URL });
    await sleep(2500);

    const loaded = await evalJs(`({ game: !!window.__game, title: document.title })`);
    console.log("loaded:", JSON.stringify(loaded));
    if (!loaded.game) throw new Error("window.__game missing — game did not boot");
    await shot(`${MODE}-1-menu.jpg`);
    console.log("menu state:", JSON.stringify(await state()));

    if (MODE === "smoke") {
      // Start via the real Start button.
      await clickButton("#btn-start");
      await sleep(1500);
      console.log("after start:", JSON.stringify(await state()));
      await shot(`${MODE}-2-flying.jpg`);
      // Pitch up briefly, then roll.
      await keyHold("ArrowUp", "ArrowUp", 38, 900);
      await keyHold("ArrowRight", "ArrowRight", 39, 700);
      await sleep(400);
      console.log("after keys:", JSON.stringify(await state()));
      // Throttle up with Shift.
      await keyHold("Shift", "ShiftLeft", 16, 1200);
      console.log("after shift:", JSON.stringify(await state()));
      // Pause via button, resume via button.
      await clickButton("#btn-pause");
      await sleep(300);
      console.log("paused:", JSON.stringify(await state()));
      await shot(`${MODE}-3-paused.jpg`);
      await clickButton("#btn-resume");
      await sleep(300);
      console.log("resumed:", JSON.stringify(await state()));
      // Mute toggle via button.
      await clickButton("#btn-mute");
      await sleep(200);
      console.log("muted:", JSON.stringify(await state()));
      await clickButton("#btn-mute");
      // Restart via R key.
      await keyPress("r", "KeyR", 82);
      await sleep(500);
      console.log("after R:", JSON.stringify(await state()));
    }

    if (MODE === "fly") {
      await clickButton("#btn-start");
      await sleep(1000);
      // Hold pitch up a touch and fly straight for 12s; watch altitude/speed.
      await keyHold("ArrowUp", "ArrowUp", 38, 1500);
      for (let i = 0; i < 6; i++) {
        await sleep(2000);
        console.log(`t+${(i + 1) * 2 + 2}s:`, JSON.stringify(await state()));
      }
      await shot(`${MODE}-2-cruise.jpg`);
    }

    if (MODE === "ring") {
      await clickButton("#btn-start");
      await sleep(800);
      // Teleport the plane just before ring 1, aligned, and fly through.
      await evalJs(`(() => { const g = window.__game; const r = g.rings[0];
        g.plane.x = r.x; g.plane.y = r.y; g.plane.z = r.z - 400; g.plane.heading = 0; g.plane.pitch = 0; g.plane.bank = 0; g.plane.speed = 80; g.plane.throttle = 0.6; })()`);
      await sleep(6000);
      console.log("after ring 1:", JSON.stringify(await state()));
      await shot(`${MODE}-2-ring.jpg`);
    }

    if (MODE === "land") {
      await clickButton("#btn-start");
      await sleep(800);
      // Place the plane on final approach to the strip, low and slow, then
      // hold the stick down in pulses until the flare puts it on the strip.
      await evalJs(`(() => { const g = window.__game;
        g.plane.x = -200; g.plane.y = 170; g.plane.z = 7600; g.plane.heading = 0;
        g.plane.pitch = 0; g.plane.bank = 0; g.plane.speed = 58; g.plane.throttle = 0.3; })()`);
      for (let i = 0; i < 60; i++) {
        const s = await state();
        console.log(`t+${(i + 1) * 0.5}s:`, JSON.stringify(s));
        if (s.phase === "landed" || s.phase === "crashed") break;
        if (s.y - s.ground > 40) {
          await keyHold("ArrowDown", "ArrowDown", 40, 300);
        } else {
          await sleep(500);
        }
      }
      await shot(`${MODE}-2-end.jpg`);
      const end = await evalJs(`(() => ({ title: document.getElementById('end-title')?.textContent, reason: document.getElementById('end-reason')?.textContent, score: document.getElementById('end-score')?.textContent, breakdown: document.getElementById('end-breakdown')?.innerText }))()`);
      console.log("end screen:", JSON.stringify(end));
      // Play again via the real button.
      await clickButton("#btn-restart-end");
      await sleep(600);
      console.log("after play-again:", JSON.stringify(await state()));
    }

    if (MODE === "crash") {
      await clickButton("#btn-start");
      await sleep(800);
      // Hold the nose down into the sea: the stick centres itself, so the
      // key must stay held for the whole dive.
      await evalJs(`(() => { const g = window.__game;
        g.plane.y = 120; g.plane.speed = 80; g.plane.throttle = 0.7; })()`);
      await key("keyDown", "ArrowDown", "ArrowDown", 40);
      for (let i = 0; i < 10; i++) {
        await sleep(1000);
        const s = await state();
        console.log(`t+${i + 1}s:`, JSON.stringify(s));
        if (s.phase === "crashed") break;
      }
      await key("keyUp", "ArrowDown", "ArrowDown", 40);
      await shot(`${MODE}-2-crashed.jpg`);
      const end = await evalJs(`(() => ({ title: document.getElementById('end-title')?.textContent, reason: document.getElementById('end-reason')?.textContent }))()`);
      console.log("end screen:", JSON.stringify(end));
      // Back to the menu via the real button.
      await clickButton("#btn-menu-end");
      await sleep(400);
      console.log("after menu:", JSON.stringify(await state()));
    }

    if (MODE === "controls") {
      // Start with Enter, pause with P, resume with P, mute with M.
      await keyPress("Enter", "Enter", 13);
      await sleep(800);
      console.log("after Enter:", JSON.stringify(await state()));
      await keyPress("p", "KeyP", 80);
      await sleep(300);
      console.log("after P (paused?):", JSON.stringify(await state()));
      await keyPress("p", "KeyP", 80);
      await sleep(300);
      console.log("after P again:", JSON.stringify(await state()));
      await keyPress("m", "KeyM", 77);
      await sleep(200);
      console.log("after M (muted?):", JSON.stringify(await state()));
      // Back to menu via R restart then topbar? Use Escape-free path:
      // pause, then click Menu Utama.
      await keyPress("p", "KeyP", 80);
      await sleep(300);
      await clickButton("#btn-menu");
      await sleep(400);
      console.log("back in menu:", JSON.stringify(await state()));
      // Toggle Cara main open/closed and mouse steering on/off.
      await clickButton("#btn-how");
      await sleep(200);
      const howOpen = await evalJs(`document.getElementById('howto').classList.contains('open')`);
      console.log("howto open:", howOpen);
      await clickButton("#btn-how");
      await sleep(200);
      console.log("howto open after 2nd click:", await evalJs(`document.getElementById('howto').classList.contains('open')`));
      await clickButton("#btn-mouse");
      await sleep(200);
      console.log("mouse steer after toggle:", JSON.stringify(await state()));
      await clickButton("#btn-mouse");
      await sleep(200);
      console.log("mouse steer after 2nd toggle:", JSON.stringify(await state()));
      // Mouse steering: turn it on, move the pointer right, watch the bank.
      await clickButton("#btn-mouse");
      await clickButton("#btn-start");
      await sleep(800);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1000, y: 400 });
      await sleep(1200);
      console.log("bank with mouse right:", JSON.stringify(await state()));
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 300, y: 400 });
      await sleep(1200);
      console.log("bank with mouse left:", JSON.stringify(await state()));
      // Mouse wheel throttle.
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: -240 });
      await sleep(500);
      console.log("throttle after wheel up:", JSON.stringify(await state()));
    }

    if (MODE === "shots") {
      // Beauty shots for screenshots/: menu, flight, rings, end.
      await shot("1-menu.jpg");
      await clickButton("#btn-start");
      await sleep(1000);
      await keyHold("ArrowUp", "ArrowUp", 38, 800);
      await sleep(2500);
      await shot("2-play.jpg");
      await evalJs(`(() => { const g = window.__game; const r = g.rings[2];
        g.rings[0].passed = true; g.rings[1].passed = true; g.ringsPassed = 2; g.score = 200;
        g.plane.x = r.x - 60; g.plane.y = r.y + 30; g.plane.z = r.z - 500; g.plane.heading = 0.05; g.plane.pitch = 0.05; g.plane.bank = 0.1; })()`);
      await sleep(1200);
      await shot("3-ring.jpg");
      await evalJs(`(() => { const g = window.__game;
        for (const r of g.rings) r.passed = true; g.ringsPassed = 8; g.score = 800;
        g.plane.x = -200; g.plane.y = 90; g.plane.z = 8400; g.plane.heading = 0; g.plane.pitch = -0.05; g.plane.bank = 0; g.plane.speed = 60; g.plane.throttle = 0.35; })()`);
      await sleep(1500);
      await shot("4-approach.jpg");
    }

    console.log("console errors:", errors.length ? errors : "none");
    console.log("failed requests:", failedReqs.length ? failedReqs : "none");
    if (errors.length || failedReqs.length) process.exitCode = 1;
  } finally {
    try { ws?.close(); } catch {}
    chrome.kill("SIGKILL");
    server.kill("SIGKILL");
    await sleep(300);
  }
}

main().catch((e) => {
  console.error("TEST FAILED:", e.message);
  process.exit(1);
});
