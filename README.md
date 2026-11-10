# Rokumon Merge

A forge merge puzzle for the Rokumon catalogue. Slide a 4×4 board, combine matching metals into the next blade, and chase the six-gate crest. The whole game is `index.html` — no build step, no server, no external images or fonts.

## Rules

This is a **sliding merge in the 2048 tradition**, not a free-drop / physics merge.

That model is the cleaner fit here: every run is deterministic from its seed, so the daily forge is the same sequence for everyone, swipe input is reliable on a phone, and the board never depends on a physics tick.

1. The board is 4×4. A move slides every tile as far as it will go in that direction.
2. Two tiles of the **same rank** that collide combine into the next rank. Each tile merges at most once per move. Four sparks become two embers, not one coal.
3. The merge scores the **value of the tile you created**. Values double each rank: Spark 2, Ember 4, Coal 8 … Rokumon 4,096.
4. After a move that changes the board, one new tile appears in a random empty cell. It is a Spark about 88% of the time and an Ember about 12%. The **Next** panel shows the tile already chosen for the following spawn.
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

- **Swipe** the board (touch).
- **Arrow keys** or **WASD**.
- **Undo** recalls the last slide. Three recalls per run. Undo still works after the forge cools, if any recalls remain. Recalling does not refund a recall.
- **New** starts another forge. If the current run is still alive it asks first. Best scores stay saved.
- **Free / Daily** switches mode. The info button reopens the rules. The speaker toggles sound.

Sound is synthesized with the Web Audio API (no audio files). The context starts on the first tap or key press. The preference is stored on this device.

## Daily forge

**Daily** deals from a `mulberry32` generator seeded by the **local** calendar date (`year * 10000 + month * 100 + day`). The opening tiles and every later spawn, including the spark-or-ember roll, come from that generator. Everyone on that local date who plays Daily gets the same sequence.

The daily best score and best tile reset when the date changes. An all-time daily best is kept separately in storage but the board shows today's best. You may retry the daily forge as many times as you like; the seed does not change until the next local midnight. A run keeps the seed it started with.

**Free** draws a fresh seed each new forge.

## Saved on this device

`localStorage` key `rokumon-merge-v1`:

| Field | Meaning |
| --- | --- |
| `sound` | Sound on/off |
| `how` | Rules overlay has been dismissed |
| `freeBest`, `freeRank` | Best free-play score and highest rank |
| `dailyDate` | Local date the daily best belongs to |
| `dailyBest`, `dailyRank` | Best score and rank for that date |
| `dailyEver`, `dailyEverRank` | Best daily score and rank across dates |

A best updates the moment you pass it, and it stays if you undo. Nothing is sent to a server by the game itself.

## Share

When the forge cools, **Share result** copies a text summary (or opens the system share sheet when the browser offers one):

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

If the host page installs `window.Hub`, the game calls it. A missing bridge is ignored, so the file still runs on its own.

- `Hub.ready()` once the board is ready, and again each time a new forge starts
- `Hub.score(n)` whenever the score changes (including after an undo restores a lower score)
- `Hub.event('highest-tile', { rank, value, name, score, daily })` when a merge sets a new highest rank for the run
- `Hub.event('run-ended', { score, bestRank, value, daily, moves, merges })` when the board locks
- `Hub.gameOver(score, 0)` immediately after `run-ended`

`score` is the forge score. `bestRank` / `rank` are ladder steps from 1 to 12. `value` is that tile's points (`2^rank`). `daily` is true on the date-seeded mode.

Leaderboards should treat **score** as the ranked value and keep the **maximum** if a player undoes after a game over and finishes again. `highest-tile` is the clean signal for a highest-tile board.

## Catalogue

`game-hub-manifest.json` is the embedded release descriptor.

- Runtime: iframe, entry `/games/rokumon-merge/index.html`
- Bundle: one HTML file, well under 1 MB
- Controls: keyboard, mouse, touch. Single player. Portrait or landscape.

Drop `index.html` on any static host, or open it from disk. No install step.
