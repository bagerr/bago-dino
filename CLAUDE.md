# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This repository is a self-contained static HTML project with no build system, package manager, bundler, or dependency install step. There is nothing to compile — open the HTML file directly in a browser to run it.

Two builds of the same game live here, both self-contained single-file HTML5 Canvas arcade platformers sharing the same sibling PNGs:

- [index.html](index.html) — **NEON DINO-AGE**, the pure arcade build. Treat it as the stable baseline; it is the fallback if a story-mode change goes wrong.
- [index2.html](index2.html) — **NEON DINO-AGE: RESCUE PROTOCOL**, the current build. Same engine plus the story layer (radio transmissions, the rescue train, the mission debrief). **New work goes here unless the request says otherwise.**

The two files have drifted apart, so a fix that belongs in both has to be applied to both — there is no shared module to edit. Keep both on LF line endings. This bites in two ways: a Python rewrite on Windows silently converts the whole file to CRLF unless you pass `newline=''`, and this machine's git has `core.autocrlf=true` globally — either one breaks every exact-match patch anchor. [.gitattributes](.gitattributes) pins `*.html`/`*.js`/`*.md` to `eol=lf` and the repo sets `core.autocrlf=false` locally, so git is handled; the Python trap is still yours to avoid. A third one: **backslash escapes do not survive a bash heredoc here** — `[\\s\\S]` arrives as `[\s\S]` and a template literal then eats it down to `[sS]`. Write patch scripts to a file rather than piping them through a heredoc.

The project is a git repository (`main`, identity set locally to Bago / bagerrsakalli@gmail.com — change it with `git config user.name` if that is wrong). Commit whenever a system reaches a working state; this is a single 150KB file being edited by exact-string patching, and being able to diff or roll back one change is worth more here than usual.

(An earlier coffee-roastery demo page also used to live here; it is gone.)

## The game (both builds)

A ~900×506 Canvas game rendered with plain 2D context calls — no framework, no build step, no external JS libraries. Everything (game logic, rendering, audio synthesis) lives in one `<script>` block. Sprite art is loaded from the sibling PNGs — `bagodino.png` (player), `baby.png` (the caged captive you rescue), `enemy_fly.png`/`enemy_ground.png` (regular enemies), `enemyboss.png` (final boss), `beam.png`/`beam_hyper.png` (laser), `lava_wall.png`/`lava_ceiling.png` (cave decor — **index.html only now**), and in index2.html `portal.png` (the evacuation rift) and `ground.png` (the walking surface) — so do not rename these files without updating their `new Image().src` assignments.

**About the boss art.** `boss_stage1.jpg` and `boss_stage2.jpg` are WebP despite the extension, and `boss_stage1_rage.src.png` is a PNG with no alpha channel at all — all three arrived with an opaque white background. The keyed, cropped, alpha versions the game actually loads are `boss_stage1.png`, `boss_stage2.png` and `boss_stage1_rage.png`, produced by the same WIC recipe as `portal.png`. Keep the sources; regenerate rather than pointing a sprite at a raw drop.

**About the terrain.** index2.html no longer draws `lava_wall.png` or `lava_ceiling.png` at all. The left-edge lava seam, the two procedural "lava falls" pinned at world x=0 and x=1100, the near-foreground obsidian outcrop layer (which scrolled at 0.92× and therefore read as a dark column hanging under every floating ledge) and the translucent orange box that used to mark each lava pit are all gone. index.html still uses them; do not "restore" any of it in index2.html.

**About `ground.png`.** It is a 1024×1024 RGBA sheet: transparent down to row ~176, ragged spires from there, **fully opaque from row 424**, two bright molten seams (rows ~432 and ~536), then a mirrored hanging-rock underside that fades out past row ~656. `drawGroundCap()` uses the band starting at row 424 precisely because that is the first fully opaque row, which gives the strip a clean flat top edge — and that edge is drawn at exactly `p.y`, the same line the collision resolver stands the player on, so the dino's feet touch the texture instead of hovering over it. Do not move `GROUND_SRC_Y` up into the spires without also deciding what happens to that guarantee. The strip is **mirror-tiled** (every other tile flipped horizontally) because the art is not seamless; two flipped copies share an identical edge, so the repeat is invisible. Tile phase is anchored to world x, not screen x, or the texture swims when the camera scrolls.

**About the portal asset.** `portal.jpg` is the original drop and is *not* a JPEG: it is a lossless WebP with an **opaque white background** (browsers decode it fine by content, so the extension is harmless). Drawn as-is it would put a white box over the cave, and keying the white out at runtime is impossible because reading pixels back from a `file://` image taints the canvas. `portal.png` is that file with the white keyed out and cropped to content, generated once with Windows Imaging Component — `BitmapDecoder` → `FormatConvertedBitmap` to Bgra32 → zero the alpha of low-saturation near-white pixels → `CroppedBitmap` → `PngBitmapEncoder`. Both files are tracked: `portal.jpg` is the source drop and `portal.png` is what the game actually loads, so the recipe above stays re-runnable. If the art is ever replaced, regenerate `portal.png` the same way rather than pointing the sprite at the raw drop — and keep `portal.jpg` around, since the sprite's `onerror` chain falls back to it before it gives up and draws the procedural arch. The sprite path itself tries `portal.png`, falls back to `portal.jpg` via `onerror`, and if neither loads the procedural obsidian arch keeps rendering on its own.

**Every sprite path needs a fallback**, because images load asynchronously and the first frames render before they arrive. Existing code follows this consistently (procedural beam rectangles, a red placeholder box for the player, etc.); keep new sprite work the same way, and exercise both branches in the smoke test.

Open the file directly in a browser to test — there's no dev server. Controls: arrows/WASD to move, Space/W/Up to jump (hold to jetpack), F/J to fire, Shift to air-dash.

### Shipping it, and playing it on a tablet

See [README-BUILD.md](README-BUILD.md). Two things matter here.

**The game is not self-contained on its own.** `index2.html` loads art from sibling files, so sending that file alone gives the other person a game with no graphics. `node build-standalone.js` writes `neon-dino-age.html` with every sprite inlined as a `data:` URI. The mechanism is one function: `assetURL(name)` checks `window.__ASSETS` and falls back to the filename, so the same source serves both the folder build and the bundle. **Every new `new Image().src` must go through `assetURL()`** or that sprite will be missing from every bundle. `build-standalone.js` fails loudly when a referenced asset is not in the manifest, which is the backstop.

Four sheets must keep their exact pixel grid when the art is re-encoded — `ground.png`, `forest_ground.png`, `ice_ground.png`, `ice_icicle.png` — because the game samples hard-coded source rows out of them. Rescaling one moves the walking surface off the collision line without any error.

Inlined art also stops tainting the canvas the way a `file://` image does, so `computeSpriteBBox` measures properly in the bundle.

**Touch.** `touchMode` is detected from the device (or forced with `?touch=1`). The on-screen pad drives the same `K[]` table the keyboard does, so nothing downstream of input knows a finger is involved; buttons are hit-tested in canvas space, so they line up at any window size. The pad is drawn only in a stage — every other screen wants a single tap instead, which is why a tap confirms a debrief or a continue and a tap on a map node starts that world.

### Testing

```
node smoke-test.js                    # tests index2.html — the default
node smoke-test.js index.html         # or any other build
node smoke-test.js neon-dino-age.html # including the bundle you are about to send
```

Run it against the bundle before sending one: it proves the file actually works rather than merely that it built. The harness concatenates **every** `<script>` block, because the bundle keeps its inlined art in a tag of its own.

[smoke-test.js](smoke-test.js) is the whole test setup: no framework, no dependencies, no dev server, one file. Run it after **every** change to either build; it is far faster than clicking through three stages by hand and it is the only practical way to catch runtime errors (TDZ, undefined refs, stage-transition breakage). Exit code is 0 only if every check in both passes passed, so it drops straight into a hook or CI if you ever want one.

How it works: it extracts the `<script>` body, runs it under `node:vm` against a stubbed `document`/`window`/`Image`/`localStorage`, captures the `requestAnimationFrame` callback and drives real frames through it — these are genuine simulation runs, not mocks of the game's own logic. A `globalThis.__g = {...}` accessor block is appended to the extracted source to reach `let`-scoped internals (top-level `let`/`const` in a vm script are script-scoped, not on the sandbox global); **add a getter there when you need to assert on something new.** The stubbed 2D context records a couple of things (`drawStats`) so a scenario can assert on what was actually drawn, which is how the ground strip's source row is checked.

The suite is also the design review. Two real problems in the POW pass showed up as red checks rather than as bad play: the stray hatchling being re-grabbed on the frame it panicked, and a grade check so loose that a build awarding full rescue points for zero rescues still passed. Write the check so that only the intended behaviour satisfies it.

It runs every scenario **twice** — once with the `Image` stub firing `onload` and once with it never firing — so both the sprite and the fallback draw paths execute. The fallbacks in this project are load-bearing, not decoration.

**A test that never fails is not protection.** When adding coverage, plant the regression you think you are catching and confirm the suite goes red: three planted breaks (follower cap, boss hit-stop duration, ground source row) were how the missing ground-row assertion was found — the first two were caught and the third sailed through. Also note the sim has real randomness, so scenarios needing a live simulation should force `STATE='playing'` plus full HP/invulnerability first, or the dino may die mid-scenario and `update()` will early-return, silently making later assertions meaningless.

Two more traps worth knowing before writing a scenario:

- **Teleporting the player forward doesn't work at ground height.** Parking it at `y=300` and nudging `x` each frame wedges it against the left face of a floating ledge, and the x-resolution shoves it straight back — the dino never advances and the scenario quietly tests nothing. Fly it along at `y=140` with `vy=0` instead, clear of every platform.
- **The boss trigger is gated on the arena wave.** To reach it, first mark every enemy with `arenaEnemy` as `dead`, otherwise the camera lock pins the player inside the band and `arenaCleared` never flips.
- **`drawPlatforms()` culls off-screen platforms.** Any probe that measures what the exit portal draws has to scroll `camX` onto the goal platform first, or it measures an empty loop body and passes for the wrong reason.
- **A crashing test file reports every planted regression as caught.** A duplicate `const` in a new scenario made the whole suite exit non-zero, so a plant run printed CAUGHT three times while proving nothing. Run `node --check smoke-test.js` before trusting a plant sweep.
- **A planted change is not automatically a regression.** Raising a rung out of jump range still passed the geometry audit — correctly, because a bounce cap covers that rung. Confirm the plant is really a break before calling the check too loose.
- **Pin the state a physics assertion depends on.** Two vine checks were flaky for the same reason: a pendulum sampled at a fixed frame count can be anywhere in its arc. Measuring the pump from a random start read as "no movement" when it swung out and back; the release velocity read as zero when the dino landed in a shelf on the release frame and the collision resolver zeroed `vx`. Set the angle, the velocity and the surroundings first, then measure.
- **A beam collects pickups it sweeps.** A curtain scenario was quietly having its weapon swapped mid-test because the spread beam reached a capsule behind the curtain. If a scenario cares which weapon is equipped, clear `weaponPickups` first.
- **Do not simulate a slow process in real time.** Waiting out the full fog rise is forty seconds of frames. Put the state just short of its limit and assert that it clamps.
- **Isolate the scenario from the rest of the stage.** The canopy is full of things that shoot: a spitter's spore ball was being measured as if the dragonfly had dropped it, and a second spitter fired during an "out of range" check. Kill everything you are not measuring.
- **Vary the input you claim to be testing.** A spitter's tracking was checked only from the right, where the correct answer and a hardcoded `1` agree; testing from both sides is what catches it. Same failure mode as the grade weighting and the grounded shockwave rule.
- **A flag is data; the transform is the behaviour.** Asserting `portalSpin === false` passed with the `if(art.spin)` guard deleted — the gate still span. The stub records `ctx.rotate` calls in `drawStats.rotations`, which is what actually pins it.
- **Check the drawing, not just the physics.** A mis-anchored platform sprite passes every collision test ever written — the dino still stands at `p.y`, the art is just in the wrong place. The stubbed context records `drawImage` calls in `drawStats.images`, which is how both `ground.png`'s source row and `forest_ground.png`'s three bands are pinned. Note `drawPlatforms()` draws every visible platform, so narrow the recorded bands to the one ledge being measured.
- **Persistence has to be checked at the store.** Asserting on the in-memory progress object passes even when the `localStorage.setItem` is deleted. The harness returns its stubbed store so a scenario can read back what was actually written.
- **Off-screen hazards are culled.** Shockwaves despawn once they leave the camera view, so a scenario that parks the camera at x=0 and stomps at x=1450 kills every wave on the frame it spawns. Stand the fight up where a real one happens: player beside the boss, `camX` on it.
- **Make the check fail for the right reason.** The airborne shockwave test passed with the "must be grounded" rule deleted, because parking the dino at y=200 put it outside the wave's vertical range anyway. A hop has to stay near the ground line to actually test the rule.
- **A hit-stop freezes the whole simulation.** `loop()` skips `update(dt)` entirely while `hitStopTimer > 0`, so anything that triggers one — a parry, a boss kill, a beam tick — leaves the next several `step(1)` calls simulating nothing. Place your test entity *after* burning the freeze off, or the scenario silently tests an empty frame. This cost a debugging round on the parry scenario.
- **Never assert `player.onGround` on a single frame.** A resting player sits at exactly `p.y - PLAYER_H`, where `overlaps()` is false by a hair (it tests `a.y+a.h > b.y`, not `>=`). So the engine alternates between a settle frame and a resolve frame, and `onGround` flickers while the foot line wobbles by a fraction of a pixel. This is original engine behaviour, not a regression — assert on the worst deviation across a run of frames instead.

The shape that works: drive real frames through `loop()`, assert on state through the `__g` accessor, and call the draw functions directly (`drawRadio`, `drawMissionReport`, `drawArenaBanners`, `drawPlatforms`, `drawWin`, `drawGameOver`) so the render paths are exercised even though the stubbed context draws nothing.

A quick syntax-only check: `node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1])"`.

### Worlds, stages and biomes

The game opens on **MISSION SELECT** (`STATE="map"`), not in a stage. `WORLDS` is the map: four nodes, each owning a run of `levels` indices into `LEVELS`. `startWorld(i)` is the only way into a stage and treats a world as a fresh mission — score, credits, arsenal and run tally all reset, which is what makes a per-world grade and rescue tally mean anything. `finishWorld()` stamps the map, unlocks the next node and returns there; if nothing playable is left it shows the victory screen instead. Lock state lives in `localStorage` under `neonDinoWorlds` via `worldState(i)` / `markWorldCleared(i)`, and a world with no `levels` can never be entered however it is flagged. Anything that used to count stages globally (`levelIndex+1` of `LEVELS.length`) must now go through `stageInWorld()`.

Each stage names a **biome** with `theme`, and `THEMES` holds that biome's liquid, surface, glow and spark colours. The pit liquid, the backdrop and the platform surface all read off it, so a new biome is one table entry plus its art — not a new branch in six draw functions. `isForest()` gates the pieces that are genuinely different: the backdrop image, the mossy platform cap and skipping the cave ceiling.

**`forest_ground.png` is one block, not a tileable strip.** `drawForestCap` uses three bands of it — grass tufts (rows 348–425), the solid body (426–1065) and hanging vines (1074–1170) — and row **426 is blitted exactly at `p.y`**, the collision line. Tufts are drawn above that line and vines below a floating ledge, which is the only reason one block sprite can serve every platform width: the bands are scaled independently, horizontally by a fixed 96px tile and vertically by the platform. Moss is noise and takes non-uniform scaling without complaint. `forest_bg.png` is portrait, so it is scaled to the canvas height and mirror-tiled sideways at a fifth of the level's scroll speed.

### Frozen Peaks

The third world, and the first one whose biome changes how the dino *moves*. `THEMES.ice` carries `slip`, `snow` and `pitSpikes` alongside the usual colours, plus `bg` and `cap` — the backdrop and the platform sheet are ordinary theme fields now, so `drawBiomeBG()` and `drawForestCap()` serve every block-sheet biome and a fourth one is a table entry rather than two more globals and another draw function.

**Slippery footing** lowers the acceleration and raises the coast: `grip` 3.2 instead of 10, `slide` 0.72 instead of 0.05. It reads `player.groundT < 0.12` rather than `player.onGround`, because a resting player's `onGround` flickers frame to frame and reading it directly gave ice back half its grip — the smoke test measured exactly that.

**The chill** (`player.chilled`) halves top speed for a second. An ice sentry's round carries `chill:true` on an ordinary `lavaBalls` entry, so gravity, damage and cleanup were already written; the Titan's breath sets it too.

**Icicles** hang from the ceiling until you walk under one: `ICICLE_WARN` of shaking, then they drop and shatter, then they reload. `dropAllIcicles()` arms every hanging one at once, which is what the Titan's slam calls.

**The frozen hostage** is a cage with `species:"frozen"`: the plasma beam bounces off it and says so, and only FLAME melts it — the same "a weapon letter is a key" idea as the canopy's vine curtain. The sheet IS the block, so a thawed hatchling runs as an ordinary `baby`.

**The Glacier Titan** is `kind:"titan"` — pinned to the floor like a walker, with a telegraphed horizontal freeze breath (`breathState`: none → wind → blow) and a slam that brings the ceiling down. It shatters rather than exploding.

**The map is clickable.** A `pointerdown` maps client coordinates back through the canvas's CSS scale and starts the node under the cursor, gated on `worldState(i).playable`.

### Vertical traversal

`camY` finally does something. It is how far the VIEW has lifted, and it is applied **once**, in `loop()`'s world transform — so nothing else in the file had to learn about vertical scroll. Two passes had to move out of that transform to stay screen-space: `drawBG()` (otherwise climbing drags a hole up from under the backdrop) and `drawFeverOverlay()`. A stage only lifts if it declares `camRise`, and `camY` eases back to zero everywhere else, so every pre-existing stage renders exactly as before.

**Refuelling has two special cases, and both had to be written by hand.** Hanging on a vine refuels the pack, because the vine branch returns early from `update()` and the ordinary regen only runs while `onGround` — which a vine forces false. A bouncy cap hands over a fixed `BOUNCE_FUEL` slug rather than a `dt`-scaled trickle, because contact lasts exactly one frame and a per-second rate gives the player essentially nothing.

**Vines** are pendulums. Brushing a tip in mid-air grabs it, left/right pumps the swing, and jump releases with the tangential velocity (`cos/-sin` of the angle times `angVel*len`) plus a small lift — a released swing carries further than any jump, which is the point. While `vineGrab` is set, `update()` returns early: the pendulum owns the dino's position, so its own gravity and collision must not run. `vineCooldown` stops an instant re-grab.

**Reachability is measured against the jetpack, not a plain jump.** The pack is always available and its fuel regenerates, so roughly 300px of lift and 260px of carry is the honest bound for "can you get there at all". Measuring against the 99px jump flagged eleven ledges across stages that have always been playable. The plain-jump rhythm check stays, but only for the climb, where the rungs are deliberately spaced.

**Level geometry is checkable, so check it.** The reach numbers fall straight out of the constants: a plain jump rises `JUMP_VY²/(2·GRAV)` ≈ 99px and carries ≈ 166px across; a bouncy cap rises ≈ 295px. Two rules follow, and the suite enforces both for every stage. A cap needs **clear sky** — nothing may hang in the column it rises through, or the dino cracks its head on that platform's underside and the cap achieves nothing (this shipped once: the first CANOPY CLIMB cap sat directly under a shelf). And a cap needs **somewhere to land** inside its arc. For rungs, ask the order-independent question — can this one be arrived at from below, by jump, bounce or vine — rather than walking a y-sorted list pairwise, which quietly borrows a neighbour's vine when a rung moves sideways.

**Mushroom shelves** (`crumble`) and **bouncy caps** (`bounce`) are platform flags with runtime state living on the platform objects themselves — safe because `loadLevel` copies them per stage. A `gone` shelf is skipped by both the collision loop and the draw pass; it rattles harder the closer it is to letting go, then grows back.

### Canopy hazards and the seed

**The rising tide** (`fog` on a stage) is the only pressure in the game that is not an enemy: `fogY` climbs at `rise` px/s, clamps at `topY`, and burns anything under it on a cooldown rather than every frame. You cannot fight it or wait it out, only out-climb it.

**Vine curtains** are platforms with `curtain:true`. They are solid — the ordinary AABB resolver does the blocking — until FLAME sweeps them, which is the first time a weapon letter is a key rather than a damage number. A burned curtain sets `respawnT = Infinity` so it reuses the crumbling-shelf `gone` plumbing without ever growing back.

**Crumbling shelves take their passengers down**: when one drops, any ground enemy standing on it dies with it, which makes the terrain a weapon.

**T — SİSMİK TOHUM** is the canopy's letter: a seed lobbed on an arc that erupts into a vine burst with a 110px radius (the rocket's is 70) and throws its debris upward. It reuses `playerBombs` with `seed:true`, so gravity, contact detonation and splash already work; only the radius, the particles and the fuse differ.

### Species

Forest enemies are not a parallel system: they are ordinary entries in `enemies` / `groundEnemies` carrying a `species`, which is why the laser, the escort's fireballs, rockets, scoring, chain, drops and death all work on them with no new integration. `SPECIES` holds each sheet's art, **which way it was drawn** and its hitbox — the sheets disagree (the dragonfly and the spitter face left, the crawler and the trike face right), so everything mirrors off that field rather than a guess. `drawSpeciesArt()` fits art by its trimmed bbox and returns false when the sheet has not loaded, so every caller still draws a silhouette instead of nothing.

Three behaviours ride on flags rather than types: `turret` (never walks, tracks the player, lobs on an arc), `shield` (blocked from the front, so you flank it or stomp it) and `species==="forest_flyer"` (holds altitude and drips acid when lined up overhead). Acid drips and spore balls are `lavaBalls` with `acid:true` — that array already does gravity, player damage and cleanup, and the flag only changes the colour and makes them non-parryable.

**Shield facing is read from `Math.sign(e.vx)`, not `e.faceDir`.** `faceDir` is refreshed later in the frame by the ground-enemy pass, so reading it during beam damage let one tick through on the frame a crawler turned around.

### Stage structure

The game runs **three hand-authored stages**, and only the last one has a boss. Everything stage-specific (platforms, lava pits, coins, enemy spawns, pickups, cages, arena band, boss, and in index2.html the debrief's `escapeLine`) lives in the `LEVELS` table; `loadLevel(i)` rebuilds every live entity array from it, so no other system needs to know which stage is running. Stages 1–2 end at an exit portal that starts already open (`gateOpen = !bossSpec`); stage 3's portal stays sealed until the boss dies. Score, HP and power-ups carry across stages; `loadLevel()` resets position, camera and entities.

In index2.html every stage carries **exactly three cages**, because the debrief tallies "X / 3". Keep it that way when editing the table. Keep stage 3's cages *before* `BOSS_TRIGGER_X` too — a cage inside the boss arena is one the player has to fight around to reach, and the encounter is busy enough.

A stage no longer ends by itself. In the original build, killing the boss counted down `stageClearDelay` and then called `endLevel()` outright; in index2.html that countdown only fires the evacuation transmission, and the stage ends when the player physically walks the rescue train into the rift. If you add a stage-ending condition, route it through `startPortalWarp()` so the warp animation still plays.

`loadLevel(0)` is deliberately called at the *bottom* of the script, after every `let` it touches has been initialised — calling it earlier hits the temporal dead zone.

### Story systems (index2.html only)

Three systems sit on top of the arcade engine. All three are deliberately thin: none of them can stall the simulation.

**Radio transmissions** are a pixel comms window in the top-left (`RADIO_X/RADIO_Y`, screen space — never apply `camX` in that block). `queueRadio(key,title,lines,opts)` is dedupe-keyed per stage via `radioFired`, which `loadLevel()` clears; `opts.urgent` pre-empts whatever is on the air and pushes it back onto the queue rather than dropping it. Lines are **pre-wrapped by hand** — there is no runtime text measuring — so keep them under ~40 characters at 12px Courier or they run out of the window. `updateRadio(dt)` is called from `loop()`, *not* from `update()`, so a transmission keeps playing through a hit-stop freeze and never costs the player a frame of control.

**The rescue train**: a hatchling freed from a cage joins `followers` (max 3) instead of vanishing. Each link replays the player's own recorded path a fixed delay behind the link ahead of it (`playerTrail` + `trailSampleAt(delay)`), which is what makes them scamper and hover exactly where you went instead of homing in a straight line. `playerTrail` is world space. Any code that **teleports** the player (the lava/fall respawn) must call `snapFollowersToPlayer()`, or the chain whips across the level chasing a trail that no longer connects to anything.

**Each biome can name its own rift.** `THEMES[x].portalArt` picks the sheet and `portalSpin` says whether it turns: a free-floating vortex spins, a built gate does not — the canopy's `forest_portal.png` is a stone arch wrapped in vines, and rotating it reads as the masonry tumbling. `portalArtNow()` resolves which art to use and returns null when it has not arrived, so the procedural arch stands in. A biome that names its own art deliberately does **not** fall back to the volcano vortex; a stone gate and a free vortex are not interchangeable.

**The evacuation portal** is `portal.png` drawn over the procedural arch on the goal platform, spinning slowly on its own axis with a breathing scale pulse and an additive (`globalCompositeOperation = "lighter"`) neon bloom behind it. It materialises via `portalReveal` (0→1), which `initBoss()` sets to 1 on bossless stages and `killBoss()` resets to 0 so the rift spins up out of nothing when the Alpha falls. The procedural obsidian arch underneath it is a **stand-in, not scenery**: it is drawn only while the gate is sealed, or if `portal.png` never loads. `portal.png` has transparent gaps, so anything drawn behind it shows through as a door silhouette — which is exactly what the arch did until it was gated behind `showArch`. For the same reason the exit ledge uses the ordinary platform body and `ground.png` cap rather than the flat grey slab it used to have. Touching it calls `startPortalWarp()` and switches to `STATE="warp"`: `drawWarped()` scales, spins and fades everything it wraps about the rift's centre, which pulls the dino and every hatchling in proportionally in one transform instead of animating each entity separately. `goalPortalPos()` is the single source of truth for where the rift is, in world space.

**The POW model.** A hatchling on the train is equipment, not a counter. Anything that would hurt the player scares one off (`followerHazardAt`); it bolts, and `PANIC_SECONDS` later `loseBaby()` takes a point off both `rescuedThisLevel` and `rescuedTotal`. Two guards make the mechanic work at all and both were found by the test suite rather than by playing: `CATCH_LOCK` stops the stray being re-grabbed on the frame it panics (the train rides on top of a standing player, so without it the mechanic never fired), and `REJOIN_GRACE` gives a freed or recaptured hatchling i-frames so one contact cannot cost two. `followerPower()` is the single source of the escort's payout — beam interval at 1, fuel regen at 2, return fire at 3 — so a new buff goes there and nowhere else.

**Continues and the checkpoint.** Losing the last heart opens `STATE="continue"`, a ten-second countdown, not an instant wipe. `useContinue()` deliberately calls `loadLevel(levelIndex)` to rebuild the stage from scratch and *then* places the player at `LEVELS[i].checkpoint` — restoring half the entity state is where respawn bugs live. `checkpointUsed` has to be re-armed after that reload because `loadLevel` clears it. Checkpoints sit past each stage's arena band on purpose, so a death to the wave or to the Alpha does not replay the run-up.

**The grade** (`computeGrade`) weights the brood at 40, the best chain at 25, taking no hits at 20 and beating `parTime` at 15. Best per stage persists in `localStorage` under `neonDinoGrades`. When testing it, vary one input and hold the rest — asserting only on the letter is too loose to catch a broken weighting.

**The arsenal.** `WEAPONS` holds four entries and `weapon`/`weaponAmmo` hold the equipped one. Ammo is **seconds of fire for every weapon**, including the rocket pod, so the HUD bar means one thing. SPREAD fires three parallel lances (`rayOffsets`) and FLAME a short fat cone; both set `piercing`, so the raycast runs once per ray and dedupes its hits. The rocket pod is not a beam: it nulls `laser` and auto-fires `playerBombs` entries flagged `straight` (no gravity, contact detonation, short fuse). Two places must stay in step with a multi-ray beam: `drawLaserAll()`, which replays the single-ray renderer once per `laser.ys` entry rather than touching that renderer, and `inLaserSweep()`, which tests every ray so a cage under the low lance still breaks.

**The parry** is the skill move. Boss shots carry `parry:true` and render magenta with a ring — Cuphead's rule, if it is pink you can hit it. Dashing into one calls `parryShot()`: no damage, +300, a four-step chain jump, a freeze-frame and a refunded dash. The check sits **before** the damage test and is deliberately not gated on `player.invuln`, because the dash grants i-frames of its own and gating it there would mean the parry could never fire.

**All three stages have a boss now**, so no stage starts with an open rift. `LEVELS[i].boss` carries `kind` ("flyer" or "walker"), `sprite`, an optional `rageSprite`, `w`/`h`, `hp`, `name` and `title`. `BOSS_ART` is a lazy sprite registry — each boss names its own art, art is fitted by `computeSpriteBBox` rather than stretched, and it is mirrored when the player is behind it because every source sheet faces left. A walker is pinned to `GROUND_Y - h/2`, closes on the player and stomps `shockwaves` that only damage a **grounded** player, so that fight rewards getting airborne while the flyers punish it. Flyers keep the hover-and-bob plus a telegraphed swoop (`diveState`: none → telegraph → swoop). Walkers are excluded from the aerial flame column.

**Boss phases and cards are data.** `LEVELS[i].boss` now carries `hp`, `name` and `title`; `initBoss` reads them and `drawBoss` prints the name on the health bar. `boss.phase` flips to 2 at half health via `enterBossPhase2()` — faster cooldowns, a three-way fan instead of a single shot, an additive red wash over the sprite and a banner. Everything phase-dependent reads `boss.phase`, so a mini-boss opts in just by having the field. `bossCardTimer` drives the Sunset-Riders-style name card, armed when the intro reaches `descending`.

**The mission debrief** replaces the old between-stage banner: reaching the portal calls `endLevel()`, which scores the rescue and combo bonuses and switches to `STATE="report"`. The card is a retro typewriter driven entirely off `reportTimer` — it holds no per-line state, so it is a pure function of elapsed time and nothing needs resetting. `drawMissionReport()` publishes its own finish time as `reportTypeEnd` so the update step knows how long to keep clacking. If you add or reword a line, re-check that the typing time still lands comfortably inside `REPORT_AUTO`.

**Coordinate spaces — the single most important thing to get right here.** Entity positions (`player.x/y`, enemy/coin/drop `x/y`, platform coordinates) are stored in *world space* and are camera-independent. `camX` is the camera's horizontal scroll offset, subtracted only at draw time (`entity.x - camX`) to get a screen coordinate. Several real bugs in this codebase's history came from adding `camX` a second time into a value that was already world-space (e.g. treating `player.x + camX` as if it needed converting when it didn't), which silently desyncs collision/visual math as soon as the camera starts scrolling. When touching collision, spawn-position, or hit-testing code, check whether each coordinate is already world-space before applying `camX`. Note that `drawParticles()` renders particle positions with no further camX subtraction, so anything pushed into the `particles` array must already be in screen space at spawn time (convert with `x - camX` when spawning from a world-space position).

**Timing is delta-time based**, not fixed-frame. `update(dt)` receives real elapsed seconds every call; all movement, cooldowns, particle lifetimes, and timers are scaled by `dt`, not by an assumed frame rate — keep new code consistent with this or it will run at the wrong speed on different refresh rates. `hitStopTimer > 0` causes `loop()` to skip calling `update(dt)` entirely for a freeze-frame effect on impactful hits.

**Entity lifecycle pattern.** Enemies and the boss share a `dying → deathTimer countdown → dead` pattern (a brief full-bright flash frame before the actual kill/explosion resolves) rather than being removed on the frame their HP hits zero. The boss additionally has an `introState` machine (`pending → warning → descending → active`) gating whether it can be targeted, attack, or deal contact damage — any state-dispatch code must handle `pending` explicitly (a bare fallthrough `else` for the "active" branch is a bug that was fixed once already, since `pending` would otherwise inherit full active-fight behavior before the encounter is even triggered).

**Sprite fitting.** Sprites are drawn from a bounding box computed once on image load (`computeSpriteBBox`), not from the raw image dimensions — source PNGs carry a lot of transparent margin, and scaling the whole frame into a fixed box shrinks the art and throws off where the feet land. The helper takes an `excludeGroundSmoke` flag that also discards near-white low-contrast pixels; that was needed for an older player PNG with a baked-in dust puff. Pass `false` for clean art (e.g. `baby.png`), or the heuristic can eat legitimate white details.

**Anything anchored to the player's art must use `playerSpriteMetrics()`**, not `PLAYER_W`/`PLAYER_H`. The drawn sprite is `SPRITE_SCALE`× the physics hitbox and is anchored at the feet, so hitbox-relative offsets land in the wrong place — this is exactly what put the jetpack flame out of the dino's hip instead of its backpack. The helper returns the drawn rect plus a facing-mirrored nozzle position.

**Jetpack thrust is a real force**, applied every frame the button is held, with gravity fighting it — so `JET_THRUST` must comfortably exceed `GRAV` or holding jump merely hovers. The rise cap is a *soft* terminal velocity (excess bled off exponentially), not a clamp: a hard clamp snapped velocity the instant you held jump after a jump kick, and a "only thrust while below the cap" guard instead created a dead zone that burned fuel with zero thrust.

**Audio is fully synthesized** via the Web Audio API (oscillators/noise buffers) — there are no external sound files. Background music and sound effects only start after the first user gesture (`ensureAudio`, bound to the first keydown/pointerdown), per browser autoplay policy.
