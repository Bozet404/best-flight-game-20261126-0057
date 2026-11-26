[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Bozet404/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Bozet404/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Selat Jakarta Run

A flight game for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057).

Take off from the Jakarta coast on a bright morning, fly north across the
strait through eight rings over the Thousand Islands (Kepulauan Seribu), and
put the little red prop plane down on the airstrip on Pulau Pari. The world
is a chase-camera view over recognisable terrain — the Java coast and the
city of Jakarta behind you, islands and open sea ahead, the volcanoes of
West Java on the southern horizon — with a lit instrument panel (attitude
indicator, airspeed and altimeter dials, throttle gauge) and a HUD showing
altitude, speed, heading, score and the bearing to the next ring.

## How to play

- **W/S** or **↑/↓** — pitch up / down
- **A/D** or **←/→** — bank left / right
- **Q/E** — rudder
- **Shift/Ctrl** — throttle up / down (mouse wheel works too)
- **Space** — airbrake
- **Mouse** — steer toward the pointer (toggle it in the menu)
- **P** — pause, **M** — mute, **R** — restart, **Enter** — start

Fly through all 8 rings (+100 each), then land gently on the Pulau Pari
strip (+500, plus a smooth-landing bonus and a time bonus). Touch the sea,
an island, the city or a mountain and the flight is over. Keep the speed
above stall and mind the terrain warning.

## Run it

Serve the `game/` folder with any static server and open it in desktop
Chrome, for example:

```sh
cd game && python3 -m http.server 8080
```

All art is drawn procedurally on canvas and all sound is synthesised with
WebAudio — the game makes no network requests and loads no external assets.

## Files

- `game/index.html` — the page, menus and buttons
- `game/src/config.js` — the mission: course, rings, islands, runway
- `game/src/terrain.js` — the height function for Java, the sea and the islands
- `game/src/render.js` — chase camera, sky, terrain, rings and the plane
- `game/src/hud.js` — compass tape, readouts, warnings and instruments
- `game/src/audio.js` — synthesised engine, wind, chimes and thuds
- `game/src/input.js` — keyboard and mouse
- `game/src/main.js` — game loop, flight model, scoring and rules
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json`
