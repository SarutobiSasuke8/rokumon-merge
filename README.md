# Rokumon Merge

A forge merge puzzle for the Rokumon catalogue. Slide a 4×4 board, combine matching metals into the next blade, and chase the six-gate crest. The whole game is `index.html`: no build step, no server, no external images, fonts or scripts, and no network requests.

Everything else in this repo (`package.json`, `test/`, `smoke/`, `.github/`) is dev-only tooling. None of it is needed to play.

## Rules

This is a sliding merge in the 2048 tradition, not a free-drop or physics merge. Every run is deterministic from its seed, so the daily forge is the same sequence for everyone.

1. The board is 4×4. A move slides every tile as far as it will go in that direction.
2. Two tiles of the **same rank** that collide combine into the next rank. Each tile merges at most once per move, and the pair nearest the wall merges first. Four sparks become two embers, not one coal. Three sparks slid left give an ember on the left and a spark beside it.
3. A merge scores the **value of the tile it creates**. Values double each rank: Spark 2, Ember 4, Coal 8 … Rokumon 4,096.
4. After a move that changes the board, one new tile appears in a random empty cell: a Spark 88% of the time, an Ember 12%. A move that changes nothing does not count and spawns nothing. The **Next** panel shows the tile already chosen for the following spawn.
5. The Rokumon crest (rank 12) does not combine further. Reaching it opens the six gates, and the run continues until the board locks.
6. The forge cools when every cell is full and no neighbouring pair can merge. That is the only game over.

### The ladder

| Rank | Name | Value |
| --- | --- | --- |
| 1 | Spark | 2 |
| 2 | Ember | 4 |
| 3 | Coal | 8 |
| 4 | Bloom | 16 |
| 5 | Ingot | 32 |
| 6 | Blank | 64 |
| 7 | Tanto | 128 |
| 8 | Wakizashi | 256 |
| 9 | Katana | 512 |
| 10 | Odachi | 1,024 |
| 11 | Spirit | 2,048 |
| 12 | Rokumon | 4,096 |

## Controls

- **Swipe** the board (touch), or drag it with a mouse. The board does not scroll the page.
- **Arrow keys** or **WASD**. Keys with Ctrl, Alt or Cmd held are left to the browser.
- **Arrow buttons** under the board slide the same way, for anyone who prefers tapping or uses a switch or screen reader.
- **Undo** (button or **U**) recalls the last slide. Three recalls per run, and up to the last three slides can be recalled. Undo still works after the forge cools if any recalls remain. Recalling does not refund a recall.
- **New forge** starts another run. If the current run is still alive it asks first. Best scores stay saved.
- **Free / Daily** switches mode. The info button reopens the rules. The speaker button toggles sound.
- **Escape** closes the rules or cancels the "Abandon this forge?" question.

### Accessibility

- The board is focusable (Tab to it) and shows a gold focus ring. Dialogs take focus when they open, keep it while open (the page behind is made `inert`), and hand it back when they close.
- A polite live region announces each move: what was forged, new highest tiles, the score, moves that do nothing, undo, and the game over summary. The board's description lists every row for screen readers.
- `prefers-reduced-motion: reduce` turns off sliding, pop, float and shake animations. The game reacts if the setting changes mid-session.
- Text contrast is at least 4.5:1 by calculation, including the value badges on every tile.

Sound is synthesized with the Web Audio API (no audio files). It starts on the first tap or key press. When sound is off nothing is played and no audio context is created.

## Daily forge

**Daily** deals from a `mulberry32` generator seeded by the **local** calendar date (`year * 10000 + month * 100 + day`). The opening tiles and every later spawn, including the spark-or-ember roll, come from that generator. Everyone on that local date who plays Daily gets the same sequence for the same moves. The deal order is unchanged from release 1.0.0, and a unit test pins it.

You may retry the daily forge as many times as you like; the seed does not change until the next local midnight. A run keeps the seed and date it started with, even across midnight or a reload, and finishing it late never wipes a later day's best.

**Free** draws a fresh seed each new forge.

## Saved on this device

Two `localStorage` keys. Nothing is sent anywhere by the game itself.

`rokumon-merge-v1`, settings and bests:

| Field | Meaning |
| --- | --- |
| `sound` | Sound on/off |
| `how` | Rules overlay has been dismissed |
| `freeBest`, `freeRank` | Best free-play score and highest rank |
| `dailyDate` | Local date the daily best belongs to |
| `dailyBest`, `dailyRank` | Best score and rank for that date |
| `dailyEver`, `dailyEverRank` | Best daily score and rank across dates |

`rokumon-merge-run-v1`, the run in progress, written after every move, undo and new forge: mode, run date, the board as ranks, score, next tile, move and merge counts, highest rank, the dealer's generator state, recalls left and up to three undo snapshots. Reloading or closing the tab puts you back exactly where you were, and the next spawn is the same one you would have got. A finished run is restored to its result card.

Both keys are validated field by field on load. A bad settings field falls back to its default; a run with anything impossible in it (wrong length, unknown rank, impossible score, bad generator state, too many undos) is discarded and a fresh forge starts. Storage being blocked (private mode, full quota) is ignored and the game still plays.

A best updates the moment you pass it, and it stays if you undo.

## Share

When the forge cools, **Share result** opens the system share sheet when the browser offers one, or copies a text summary:

```
Rokumon Merge 2026-11-10
4,820 · Katana
⬛🟥⬛⬛
🟧⬛🟨⬛
⬛⬛⬛⬛
✨⬛⬛⬛
```

Free play uses the heading `Rokumon Merge · Free forge`. If the clipboard is blocked, the same text is shown on the card so it can be selected.

## Hub bridge

The game speaks Rokumon Games bridge protocol v1 (see `docs/GAME_EVENT_API.md` in the hub repo). It never depends on it:

- If the page has a `window.Hub` (for example the hub's `/hub-bridge.js`), the game calls it.
- Otherwise, when the game runs inside a frame, it posts the same v1 messages `hub-bridge.js` would send to `window.parent`, targeted at the game's own origin. This is what makes the bridge work when the hub embeds this single file as-is.
- Opened on its own, every call is a silent no-op. Errors in the bridge are swallowed.

Calls and messages:

| Call | Message | When |
| --- | --- | --- |
| `Hub.ready()` | `{ type: "hub:ready", version: 1 }` | Board ready: page load (new or restored run) and each new forge |
| `Hub.score(n)` | `{ type: "hub:score", score }` | After every move, every undo, a restored run, and at game over |
| `Hub.event("highest-tile", data)` | `{ type: "hub:event", version: 1, name, data }` | A merge creates a rank higher than anything in the run so far. `data`: `rank`, `value`, `name`, `score`, `daily` |
| `Hub.event("run-ended", data)` | same envelope | The board locks. `data`: `score`, `bestRank`, `value`, `daily`, `moves`, `merges` |
| `Hub.gameOver(score, durationMs)` | `{ type: "hub:gameover", score, durationMs }` | Straight after `run-ended`. `durationMs` is wall-clock time since the run started, including time away |

`rank` and `bestRank` are ladder steps from 1 to 12. `value` is that tile's points (`2^rank`). `daily` is true on the date-seeded mode. These match the `bridge.events` declared in `game-hub-manifest.json`.

Leaderboards should treat **score** as the ranked value and keep the **maximum**: a player can undo after a game over and finish again, which sends `run-ended` and `gameOver` again. Reloading a finished run does not re-send them. As the hub docs say, the bridge is an honesty mechanism, not anti-cheat.

## Checks

Dev-only. Needs Node 20 or later.

```sh
npm install
npm test        # rules, save validation, single-file guard (node --test)
npm run smoke   # plays index.html in headless Chromium (Playwright)
```

- `npm test` loads the `<script id="rokumon-merge-logic">` block straight out of `index.html` into a Node VM, so it tests the exact code that ships. It covers every direction, the merge-once and wall-first rules, the crest cap, no-op moves drawing no randomness, game-over detection, the 1.0.0 daily deal, save validation against many kinds of corruption, and a property test over 400 seeded random games played to game over (about 46,000 moves) checking that slides conserve the value total, spawns add exactly one tile, the board never holds an invalid tile and every position round-trips through a save.
- `npm run smoke` serves the repo from an in-process server on a random local port (closed at the end), then plays by keyboard, arrow buttons and touch swipes at desktop and phone sizes. It checks for console errors, requests to other origins, horizontal scroll, layout fit on common screens, reload restore, malformed saves, game over and the bridge messages from inside an iframe, dialog focus, mute and reduced motion. Set `SMOKE_INDEX=/path/to/other/index.html` to point it at another build.
- `.github/workflows/checks.yml` runs both on every pull request.

If Playwright asks for a browser, run `npx playwright install chromium`.

## Known limits

- Phone landscape (for example 844×390) needs a short scroll; the board has a 260 px floor.
- Only tested in Chromium (headless) at emulated phone sizes. Safari, Firefox and real phones have not been checked by a person yet.
- Tile art is placeholder-grade: Bloom and the Rokumon crest share a six-petal shape, Tanto and Wakizashi are both blue with similar blades, and Katana and Rokumon are both gold. The value badge tells them apart.
- Sounds are simple synthesized blips.
- The free-play seed and generator state live in `localStorage`, so a player can edit their way to any position. Scores are not trustworthy for prizes.

## Catalogue

`game-hub-manifest.json` is the embedded release descriptor.

- Runtime: iframe, entry `/games/rokumon-merge/index.html`
- Bundle: one HTML file, well under 1 MB
- Controls: keyboard, mouse, touch. Single player. Portrait or landscape.

Drop `index.html` on any static host, or open it from disk. No install step.
