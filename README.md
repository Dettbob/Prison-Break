# Three Strikes (Prison Break)

A turn-based, top-down prison break game for 1 to 4 prisoners (hot-seat co-op or PvP race). Guards and inmates are run by AI. The guard side is built so a human "prison" player can take over later.

Play: open `dist/three-strikes.html` in a browser (single self-contained file, no server needed).

## Features
- XCOM-style 2 AP turns, tile = room or corridor piece, hearing 3, vision 5 lit / 1 dark, real line of sight (walls block it)
- Seeded random prison with fixed rooms, multi-tile rooms, cameras, fence and gate
- Weekly guard patrol routes (same every Monday morning), sold by the Informant
- Suspicious (yellow ?) vs dangerous (red !) offences, three strikes, bribes with counteroffers, stash, bed dummy, meth, jammers
- Inmates with routines, trading, hired brawls, extortion and betrayal
- Three difficulties (easy / medium / hard), automatic save, generative music and sfx with mute and volume

## Build and test
```
python3 build.py          # bundles src/*.js into dist/three-strikes.html
node sim2.js 100          # random-bot games, checks for engine errors
node mech2.js             # rule checks (fence, zones, night cells, strikes, routes, line of sight, difficulty)
node ui_smoke.js          # UI smoke test with a stub DOM, includes save/load round trip
```

## Layout
`src/data.js` tuning tables, `mapgen.js` map generator, `engine1-5.js` rules (world and suspicion, prisoner actions, trade and bribes and turn flow, guard AI, action list and tips, NPCs), `audio.js`, `ui_render.js`, `ui_app.js`. Design notes are in `docs/design-notes.md`.

Saves work by replay: the engine is deterministic from the seed, so a save is the setup plus the list of actions. Bump `SAVE_V` in `ui_app.js` when rules change.
