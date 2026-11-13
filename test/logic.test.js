"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadLogic, plain } = require("./load-logic");

const L = loadLogic();
const { LEFT, RIGHT, UP, DOWN } = { LEFT: 0, RIGHT: 1, UP: 2, DOWN: 3 };

const board = (ranks) => L.fromRanks(ranks).cells;
const ranks = (cells) => plain(L.toRanks(cells));
const slideRanks = (r, dir) => ranks(L.slide(board(r), dir, 100).next);
const total = (cells) => cells.reduce((s, t) => s + (t ? L.valueOf(t.rank) : 0), 0);
const row = (a) => a.concat(new Array(16 - a.length).fill(0));
const col = (a) => {
  const out = new Array(16).fill(0);
  a.forEach((v, i) => { out[i * 4] = v; });
  return out;
};

// Counts calls so tests can prove when randomness is or is not drawn.
function countingRand(seed) {
  const rng = L.makeRng(seed);
  const fn = () => { fn.calls += 1; return rng.next(); };
  fn.calls = 0;
  fn.rng = rng;
  return fn;
}

test("exports the documented rules", () => {
  assert.equal(L.SIZE, 4);
  assert.equal(L.MAX_RANK, 12);
  assert.equal(L.UNDO_LIMIT, 3);
  assert.deepEqual(plain(L.NAMES), ["Spark", "Ember", "Coal", "Bloom", "Ingot", "Blank", "Tanto", "Wakizashi", "Katana", "Odachi", "Spirit", "Rokumon"]);
  assert.equal(L.valueOf(1), 2);
  assert.equal(L.valueOf(12), 4096);
});

test("left slides and merges toward column 0", () => {
  assert.deepEqual(slideRanks(row([0, 0, 0, 1]), LEFT), row([1, 0, 0, 0]));
  assert.deepEqual(slideRanks(row([1, 1, 0, 1]), LEFT), row([2, 1, 0, 0]));
  assert.deepEqual(slideRanks(row([0, 3, 0, 3]), LEFT), row([4, 0, 0, 0]));
});

test("right slides and merges toward column 3", () => {
  assert.deepEqual(slideRanks(row([1, 0, 0, 0]), RIGHT), row([0, 0, 0, 1]));
  assert.deepEqual(slideRanks(row([1, 0, 1, 1]), RIGHT), row([0, 0, 1, 2]));
  assert.deepEqual(slideRanks(row([2, 2, 0, 0]), RIGHT), row([0, 0, 0, 3]));
});

test("up slides and merges toward row 0", () => {
  assert.deepEqual(slideRanks(col([0, 0, 0, 1]), UP), col([1, 0, 0, 0]));
  assert.deepEqual(slideRanks(col([1, 0, 1, 1]), UP), col([2, 1, 0, 0]));
});

test("down slides and merges toward row 3", () => {
  assert.deepEqual(slideRanks(col([1, 0, 0, 0]), DOWN), col([0, 0, 0, 1]));
  assert.deepEqual(slideRanks(col([1, 1, 1, 0]), DOWN), col([0, 0, 1, 2]));
});

test("each tile merges at most once per move", () => {
  assert.deepEqual(slideRanks(row([1, 1, 1, 1]), LEFT), row([2, 2, 0, 0]), "four sparks make two embers");
  assert.deepEqual(slideRanks(row([1, 1, 1, 1]), RIGHT), row([0, 0, 2, 2]));
  assert.deepEqual(slideRanks(row([2, 1, 1, 0]), LEFT), row([2, 2, 0, 0]), "a new ember does not merge again in the same move");
  assert.deepEqual(slideRanks(row([1, 1, 2, 0]), LEFT), row([2, 2, 0, 0]));
  assert.deepEqual(slideRanks(row([2, 2, 3, 0]), LEFT), row([3, 3, 0, 0]), "no chain merges");
  assert.deepEqual(slideRanks(row([3, 3, 2, 2]), LEFT), row([4, 3, 0, 0]));
});

test("the pair nearest the wall merges first", () => {
  assert.deepEqual(slideRanks(row([1, 1, 1, 0]), LEFT), row([2, 1, 0, 0]));
  assert.deepEqual(slideRanks(row([1, 1, 1, 0]), RIGHT), row([0, 0, 1, 2]));
  assert.deepEqual(slideRanks(col([0, 1, 1, 1]), UP), col([2, 1, 0, 0]));
  assert.deepEqual(slideRanks(col([0, 1, 1, 1]), DOWN), col([0, 0, 1, 2]));
});

test("the Rokumon crest never combines", () => {
  const res = L.slide(board(row([0, 12, 12, 0])), LEFT, 0);
  assert.deepEqual(ranks(res.next), row([12, 12, 0, 0]));
  assert.equal(res.born.length, 0);
  assert.equal(res.gained, 0);
  assert.equal(L.slide(board(row([11, 11])), LEFT, 0).born[0].rank, 12);
  const crests = new Array(16).fill(12);
  assert.equal(L.hasMoves(board(crests)), false);
});

test("score gained is the value of each tile created", () => {
  const res = L.slide(board(row([1, 1, 3, 3])), LEFT, 0);
  assert.equal(res.gained, 4 + 16);
  assert.deepEqual(plain(res.born.map((b) => b.value)), [4, 16]);
  assert.deepEqual(plain(res.vanished).length, 4);
});

test("a move that changes nothing reports no move and draws nothing", () => {
  const cells = board([1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const state = { cells, score: 0, nextRank: 1, seq: 4, moves: 0, merges: 0, highest: 4, forged: false, over: false };
  const rand = countingRand(7);
  for (const dir of [LEFT, UP]) {
    const out = L.applyMove(state, dir, rand);
    assert.equal(out.moved, false);
    assert.equal(out.state, state, "state object is returned unchanged");
  }
  assert.equal(rand.calls, 0, "no tile spawned and no random number drawn");
  assert.equal(L.applyMove(state, DOWN, rand).moved, true);
  assert.equal(rand.calls, 2, "a real move draws a cell and the next rank");
});

test("applyMove spawns exactly one tile and keeps counters straight", () => {
  const cells = board(row([1, 1, 2]));
  const state = { cells, score: 8, nextRank: 2, seq: 3, moves: 4, merges: 1, highest: 2, forged: false, over: false };
  const out = L.applyMove(state, LEFT, () => 0);
  assert.equal(out.moved, true);
  assert.deepEqual(ranks(out.state.cells), [2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "rand 0 picks the first empty cell for the Ember");
  assert.equal(out.state.score, 12);
  assert.equal(out.state.moves, 5);
  assert.equal(out.state.merges, 2);
  assert.equal(out.state.nextRank, 2, "rand 0 rolls an Ember");
  assert.equal(out.spawned.at, 2);
  assert.equal(out.newHighest, 0, "an Ember is not higher than the existing Ember");
  assert.notEqual(out.state, state);
  assert.deepEqual(ranks(state.cells), row([1, 1, 2]), "input state is not mutated");
});

test("newHighest and forgedNow fire only on a merge that beats the run", () => {
  const cells = board(row([11, 11]));
  const state = { cells, score: 0, nextRank: 1, seq: 2, moves: 0, merges: 0, highest: 11, forged: false, over: false };
  const out = L.applyMove(state, LEFT, () => 0.5);
  assert.equal(out.newHighest, 12);
  assert.equal(out.forgedNow, true);
  assert.equal(out.state.forged, true);
  const again = L.applyMove(out.state, RIGHT, () => 0.5);
  assert.equal(again.forgedNow, false);
});

test("game over: full board with no equal neighbours", () => {
  const dead = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) dead.push((r + c) % 2 ? 2 : 1);
  assert.equal(L.hasMoves(board(dead)), false);
  const vertical = dead.slice();
  vertical[4] = vertical[0];
  assert.equal(L.hasMoves(board(vertical)), true, "a vertical pair is a move");
  const horizontal = dead.slice();
  horizontal[1] = horizontal[0];
  assert.equal(L.hasMoves(board(horizontal)), true, "a horizontal pair is a move");
  const gap = dead.slice();
  gap[15] = 0;
  assert.equal(L.hasMoves(board(gap)), true, "an empty cell is a move");
});

test("applyMove marks over when the spawned tile locks the board", () => {
  const oneGap = [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 0, 3, 4, 5];
  const mk = (nextRank) => ({ cells: board(oneGap), score: 0, nextRank, seq: 15, moves: 0, merges: 0, highest: 5, forged: false, over: false });
  const out = L.applyMove(mk(1), LEFT, () => 0.5);
  assert.deepEqual(ranks(out.state.cells).slice(12), [3, 4, 5, 1]);
  assert.equal(out.state.over, true, "the spark fills the last cell and nothing pairs");
  assert.equal(L.applyMove(out.state, UP, () => 0).moved, false, "no moves once over");
  const live = L.applyMove(mk(2), LEFT, () => 0.5);
  assert.deepEqual(ranks(live.state.cells).slice(12), [3, 4, 5, 2]);
  assert.equal(live.state.over, false, "an ember under an ember can still merge");
});

test("spawn uses the injected rand and copes with out-of-range values", () => {
  const cells = board(row([1, 0, 1, 0]));
  const empties = plain(L.emptyIndexes(cells));
  assert.equal(empties.length, 14);
  assert.equal(L.spawn(cells, 2, () => 0, 9).at, 1);
  assert.equal(L.spawn(cells, 2, () => 0.9999, 9).at, 15);
  assert.equal(L.spawn(cells, 2, () => 1, 9).at, 15, "rand 1 is clamped");
  assert.equal(L.spawn(cells, 2, () => NaN, 9).at, 1, "NaN falls back to the first empty");
  const s = L.spawn(cells, 2, () => 0, 9);
  assert.equal(s.tile.id, 10);
  assert.equal(s.seq, 10);
  assert.equal(cells[1], null, "input not mutated");
  assert.equal(L.spawn(board(new Array(16).fill(1)), 1, () => 0, 0), null);
  assert.equal(L.rollRank(() => 0.11), 2);
  assert.equal(L.rollRank(() => 0.12), 1);
});

test("daily deals match release 1.0.0 exactly", () => {
  // Golden values captured from the 1.0.0 code path for these seeds and this move list.
  const dirs = "032110322103321003211032210332100321103221033210032110322103".split("").map(Number);
  const golden = {
    20261110: { open: [0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], board: [1, 0, 0, 2, 5, 5, 4, 0, 2, 4, 2, 0, 1, 2, 1, 2], score: 356, next: 1, rng: 196932101 },
    20261113: { open: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], board: [1, 3, 2, 1, 1, 5, 3, 2, 4, 2, 4, 3, 2, 3, 1, 2], score: 272, next: 1, rng: 2724274784 }
  };
  for (const seed of Object.keys(golden)) {
    const want = golden[seed];
    const rng = L.makeRng(Number(seed));
    let state = L.newRun(rng.next);
    assert.deepEqual(ranks(state.cells), want.open, "opening board for " + seed);
    for (const d of dirs) state = L.applyMove(state, d, rng.next).state;
    assert.deepEqual(ranks(state.cells), want.board, "board for " + seed);
    assert.equal(state.score, want.score);
    assert.equal(state.nextRank, want.next);
    assert.equal(rng.state(), want.rng);
  }
  assert.equal(L.dateSeed("2026-11-10"), 20261110);
});

test("rng state and restore rewind exactly", () => {
  const a = L.makeRng(42);
  a.next();
  const saved = a.state();
  const n1 = a.next();
  const n2 = a.next();
  a.restore(saved);
  assert.equal(a.next(), n1);
  assert.equal(a.next(), n2);
  const b = L.makeRng(42);
  const c = L.makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(b.next(), c.next());
});

// ---- property test -----------------------------------------------------------

function checkBoard(cells, msg) {
  assert.equal(cells.length, 16, msg);
  const ids = new Set();
  for (const t of cells) {
    if (t === null) continue;
    assert.ok(Number.isInteger(t.rank) && t.rank >= 1 && t.rank <= 12, msg + " rank " + t.rank);
    assert.ok(!ids.has(t.id), msg + " duplicate id " + t.id);
    ids.add(t.id);
  }
}

function packed(cells, dir) {
  // After a slide every line is gap-free from the wall it moved towards.
  for (let line = 0; line < 4; line++) {
    let seenGap = false;
    for (let step = 0; step < 4; step++) {
      const [r, c] = dir === 0 ? [line, step] : dir === 1 ? [line, 3 - step] : dir === 2 ? [step, line] : [3 - step, line];
      const t = cells[r * 4 + c];
      if (!t) seenGap = true;
      else if (seenGap) return false;
    }
  }
  return true;
}

test("property: 400 seeded games played to game over keep the board valid and value conserved", () => {
  let movesChecked = 0;
  let noops = 0;
  let overs = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = countingRand(seed * 2654435761);
    const pick = L.makeRng(seed);
    let state = L.newRun(rand);
    checkBoard(state.cells, "seed " + seed + " opening");
    assert.equal(state.cells.filter(Boolean).length, 2);
    for (let step = 0; step < 600 && !state.over; step++) {
      const dir = Math.floor(pick.next() * 4);
      const callsBefore = rand.calls;
      const before = state;
      const out = L.applyMove(state, dir, rand);
      const where = "seed " + seed + " step " + step + " dir " + dir;
      if (!out.moved) {
        noops++;
        assert.equal(out.state, before, where + " no-op returned a new state");
        assert.equal(rand.calls, callsBefore, where + " no-op drew randomness");
        continue;
      }
      movesChecked++;
      const res = out.slide;
      checkBoard(res.next, where + " after slide");
      assert.equal(total(res.next), total(before.cells), where + " slide changed the value total");
      assert.equal(res.next.filter(Boolean).length, before.cells.filter(Boolean).length - res.born.length, where + " tile count");
      assert.ok(packed(res.next, dir), where + " gaps left after slide");
      assert.equal(res.gained, res.born.reduce((s, b) => s + b.value, 0), where + " gained");
      assert.equal(rand.calls, callsBefore + 2, where + " one spawn and one roll per move");
      state = out.state;
      checkBoard(state.cells, where + " after spawn");
      assert.equal(total(state.cells), total(res.next) + L.valueOf(out.spawned.tile.rank), where + " spawn value");
      assert.equal(state.cells.filter(Boolean).length, res.next.filter(Boolean).length + 1, where + " spawn count");
      assert.ok(out.spawned.tile.rank === 1 || out.spawned.tile.rank === 2);
      assert.equal(state.score, before.score + res.gained, where + " score");
      assert.equal(state.score % 4, 0);
      assert.equal(state.over, !L.hasMoves(state.cells), where + " over flag");
      assert.ok(state.highest >= Math.max(...state.cells.map((t) => (t ? t.rank : 0))), where + " highest");
      const snap = L.snapshotOf(state, rand.rng.state());
      const clean = L.validateSnapshot(JSON.parse(JSON.stringify(snap)));
      assert.ok(clean, where + " snapshot must validate");
      assert.deepEqual(ranks(L.restoreSnapshot(clean).cells), ranks(state.cells));
    }
    if (state.over) overs++;
  }
  assert.ok(movesChecked > 40000, "enough moves exercised: " + movesChecked);
  assert.ok(noops > 0, "no-op moves were exercised");
  assert.equal(overs, 400, "games reached game over: " + overs);
});

test("property: replaying a seed and move list is deterministic", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const play = () => {
      const rng = L.makeRng(seed);
      const pick = L.makeRng(seed + 999);
      let state = L.newRun(rng.next);
      for (let i = 0; i < 200 && !state.over; i++) state = L.applyMove(state, Math.floor(pick.next() * 4), rng.next).state;
      return JSON.stringify([ranks(state.cells), state.score, state.nextRank, rng.state()]);
    };
    assert.equal(play(), play());
  }
});
