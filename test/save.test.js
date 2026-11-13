"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadLogic, plain } = require("./load-logic");

const L = loadLogic();

function goodRun() {
  const rng = L.makeRng(5);
  let state = L.newRun(rng.next);
  const undo = [];
  for (const d of [0, 2, 1]) {
    const before = rng.state();
    const out = L.applyMove(state, d, rng.next);
    if (!out.moved) continue;
    undo.push(L.snapshotOf(state, before));
    state = out.state;
  }
  return JSON.parse(JSON.stringify({
    v: 1, mode: "daily", runDate: "2026-11-13", bestAtStart: 120, undosLeft: 2, startedAt: 1763000000000,
    current: L.snapshotOf(state, rng.state()), undo
  }));
}

test("settings: garbage falls back to defaults without throwing", () => {
  const defaults = plain(L.defaultSettings());
  for (const raw of [null, undefined, 0, "x", [], [1, 2], true, { __proto__: null }]) {
    assert.deepEqual(plain(L.validateSettings(raw)), defaults, JSON.stringify(raw));
  }
});

test("settings: each bad field is replaced on its own", () => {
  const out = plain(L.validateSettings({
    sound: "false", how: 1, freeBest: null, freeRank: 13, dailyDate: "2026-13-01", dailyBest: 400,
    dailyRank: 3, dailyEver: -4, dailyEverRank: 2.5
  }));
  assert.equal(out.sound, true, "string 'false' is not a boolean");
  assert.equal(out.how, false);
  assert.equal(out.freeBest, 0);
  assert.equal(out.freeRank, 0);
  assert.equal(out.dailyDate, "");
  assert.equal(out.dailyBest, 0, "a daily best without a valid date is dropped");
  assert.equal(out.dailyRank, 0);
  assert.equal(out.dailyEver, 0);
  assert.equal(out.dailyEverRank, 0);
  for (const bad of [Infinity, NaN, "12", 1e12, { x: 1 }]) {
    assert.equal(L.validateSettings({ freeBest: bad }).freeBest, 0, String(bad));
  }
});

test("settings: good values survive", () => {
  const good = { v: 1, sound: false, how: true, freeBest: 1556, freeRank: 7, dailyDate: "2026-11-13", dailyBest: 400, dailyRank: 6, dailyEver: 900, dailyEverRank: 8 };
  assert.deepEqual(plain(L.validateSettings(good)), good);
});

test("run: a real saved run validates and restores", () => {
  const raw = goodRun();
  const run = L.validateRun(raw);
  assert.ok(run);
  assert.equal(run.mode, "daily");
  assert.equal(run.undo.length, raw.undo.length);
  const state = L.restoreSnapshot(run.current);
  assert.deepEqual(plain(L.toRanks(state.cells)), raw.current.board);
  assert.equal(state.score, raw.current.score);
  assert.equal(state.over, !L.hasMoves(state.cells));
});

test("run: every kind of corruption is rejected", () => {
  const cases = {
    "not an object": () => "run",
    "array": () => [],
    "wrong version": (r) => { r.v = 2; },
    "bad mode": (r) => { r.mode = "zen"; },
    "bad date": (r) => { r.runDate = "13/11/2026"; },
    "short board": (r) => { r.current.board.pop(); },
    "rank too high": (r) => { r.current.board[0] = 13; },
    "string rank": (r) => { r.current.board[0] = "1"; },
    "fractional rank": (r) => { r.current.board[0] = 1.5; },
    "empty board": (r) => { r.current.board = new Array(16).fill(0); },
    "negative score": (r) => { r.current.score = -4; },
    "impossible score": (r) => { r.current.score = 6; },
    "score not a number": (r) => { r.current.score = "8"; },
    "next rank 3": (r) => { r.current.nextRank = 3; },
    "highest below board": (r) => { r.current.highest = 0; },
    "rng out of range": (r) => { r.current.rng = -1; },
    "rng huge": (r) => { r.current.rng = 2 ** 32; },
    "moves negative": (r) => { r.current.moves = -1; },
    "undosLeft too many": (r) => { r.undosLeft = 4; },
    "undo not array": (r) => { r.undo = {}; },
    "undo too long": (r) => { r.undo = [r.current, r.current, r.current, r.current]; },
    "bad undo entry": (r) => { r.undo = [{ board: [] }]; },
    "missing current": (r) => { delete r.current; }
  };
  for (const [name, mutate] of Object.entries(cases)) {
    let raw = goodRun();
    const replaced = mutate(raw);
    if (replaced !== undefined) raw = replaced;
    assert.equal(L.validateRun(raw), null, name);
  }
});

test("run: optional fields fall back instead of failing", () => {
  const raw = goodRun();
  raw.bestAtStart = "lots";
  raw.startedAt = -5;
  const run = L.validateRun(raw);
  assert.ok(run);
  assert.equal(run.bestAtStart, 0);
  assert.equal(run.startedAt, 0);
});

test("dates: only real-looking YYYY-MM-DD keys pass", () => {
  assert.equal(L.isDateKey("2026-11-13"), true);
  for (const bad of ["2026-1-13", "2026-00-10", "2026-11-32", "", null, 20261113]) assert.equal(L.isDateKey(bad), false, String(bad));
});
