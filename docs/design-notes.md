# Three Strikes: prototype design notes (v2)

Playable prototype (artifact): https://claude.ai/artifact/V6X19s6gUfhFrDH68ws2WL
Hot-seat, 1 to 4 prisoners, guards and inmates run by AI. Co-op or Race (PvP). Main menu, pause menu, sound settings, "?" tips corner.

## Core rules as built
- 2 AP per turn. Move 1 (noise 3), Sneak 2 (noise 1), Run 2 AP for up to 3 tiles (noise 5, suspicious), Hide 1, Attack 1, Takedown 2 (silent, needs hide or dark), Loot/Steal/Salvage/Work/Craft/Bribe/Lockpick/Hack 1, Cut fence 2.
- Map 22x16, seeded. Rooms are multi-tile (kitchen 1x2, dining 2x3, court 4x3), walls on every unlinked edge, corridors drawn as hallways. Fence and gate are exits only, never walked on. Players' cells are clustered together.
- Time: week of 7 days x (Morning 6, Day 12, Evening 6, Night 12 rounds). Guard patrol routes are seeded per weekday slot, so every Monday morning matches. The Informant sells a slot's routes (22 C each). Night warning 5 rounds before lights out. Sleep in your own cell to skip the night.
- Suspicion model: yellow ? = suspicious (looting, running, dealing contraband, bribing, restricted room). Caught: contraband searched and confiscated, no strike. Red ! = dangerous (out of cell at night, lingering in restricted rooms, violence, betrayal, empty bed at night without a dummy). Caught: strike. A guard who loses you goes to the last known tile, searches, then returns to patrol.
- When a guard stops you, play pauses on a decision: cooperate, bribe (low/fair/generous), attack, run.
- Hiding: open tiles (corridor, yard, court) guards within 2 may find you; mid tiles (kitchen, dining) same-tile small chance; closed rooms same-tile only, smaller. Night in the open: same tile only, medium chance.
- Strikes: 1 beaten, contraband and cell stash confiscated (cigarettes never), back to cell. 2 solitary and stripped. 3 transferred.
- Bribes: purposes are look the other way, switch off door alarms for a time of day, release now. Guard may accept, counter with a higher price, refuse, or issue a strike. Honest guards may arrest you.
- Lockpicking alarmed rooms raises the alarm unless you carry a jammer or bought an alarm-off slot. Other players' cells lock at night and their stash cannot be opened.
- Inmates: routines per phase (work, dining, court, showers, common), return to cells at night, some stay in cell in one phase. Trade, hire for a brawl (8 C, place + time), fight, steal from cells (occupied cell = he attacks). Inmates who see violence may demand a payoff or betray you. Shiv kills silently; a found body raises the alarm; unseen kills are not treated as dangerous.
- Items: meth (3 AP for 7 turns, then 1 AP for 15), bed dummy, jammer, shiv, lockpick, wirecutters, uniform, keycard, USB, pills. Cigarettes are currency, not contraband.
- Audio: generative WebAudio music (calm / night / alert) and sfx, mute plus music and effects sliders, saved locally.

## Architecture (single HTML bundle built from src/*.js by build.py)
data, mapgen, engine1 (world, light, vision, suspicion), engine2 + engine2b (prisoner actions, trade, bribes, pending decisions, strikes, turn flow), engine3 (guard AI, routes, `guardAct`), engine4 (action list, modal data, tips), engine5 (NPCs), audio, ui_render, ui_app.

## Prison player (planned)
Guards act only through `guardAct(world, guard, action)` (move, arrest, search, wait). Set `world.controllers.guards = 'human'` so `continueGuards` stops, let the UI call `guardAct`, then `finishRound`. Needs camera view and lockdown.

## Testing
Node vm tests: map generation (1,200 seeds), 200-game random-bot sim with no engine errors, mechanics checks (fence, zones, night cells, strikes, routes by weekday, dummy), UI smoke with stub DOM, and Chromium screenshots.

## Open questions
- Balance has not been human-playtested (cost of wirecutters 20 C vs income from work shifts, alarm and bribe prices).
- RTS variant, online play (engine is deterministic from seed plus action list).

## Added after v2
- Difficulty: easy (4 guards, 3 at night, whole map known, being out at night is not a strike but guards still hunt you), medium (6/4), hard (8/6).
- Automatic save by deterministic replay (setup plus action log) in localStorage.
- Sight display: red eye and red tint when a guard sees you, grey slashed eye and blue tint for guards in view that do not.
- Real line of sight (walls block), daily loot restock, camera, loot and salvage icons.
