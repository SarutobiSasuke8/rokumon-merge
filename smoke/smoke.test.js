"use strict";
// Browser smoke test: plays the real index.html in headless Chromium.
// Serves the repo from an in-process static server on a random local port and
// shuts it down at the end, so nothing is left running.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
// SMOKE_INDEX points the smoke at another build, for example to confirm it catches old defects.
const INDEX = process.env.SMOKE_INDEX || path.join(ROOT, "index.html");
const RUN_KEY = "rokumon-merge-run-v1";
const SETTINGS_KEY = "rokumon-merge-v1";
const HOST_PAGE = `<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="g" src="/index.html" style="width:420px;height:860px;border:0"></iframe>
<script>window.got=[];addEventListener("message",function(e){if(e.origin===location.origin)window.got.push(e.data);});</script>`;

let server;
let origin;
let browser;

function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      if (url === "/host.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(HOST_PAGE);
        return;
      }
      if (url !== "/index.html") {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(INDEX));
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
}

// Count oscillators so the test can prove mute silences everything.
function audioProbe() {
  window.__osc = 0;
  function Fake() {
    this.state = "running";
    this.currentTime = 0;
    this.destination = {};
  }
  Fake.prototype.resume = function () { return Promise.resolve(); };
  Fake.prototype.createOscillator = function () {
    window.__osc += 1;
    return { type: "", frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
  };
  Fake.prototype.createGain = function () {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  };
  window.AudioContext = Fake;
  window.webkitAudioContext = Fake;
}

async function open(opts = {}) {
  const context = await browser.newContext(opts.context || { viewport: { width: 1280, height: 800 } });
  await context.addInitScript(audioProbe);
  if (opts.storage) {
    await context.addInitScript((entries) => {
      if (sessionStorage.getItem("__seeded")) return;
      sessionStorage.setItem("__seeded", "1");
      for (const [k, v] of entries) localStorage.setItem(k, v);
    }, Object.entries(opts.storage));
  }
  const page = await context.newPage();
  const errors = [];
  const foreign = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) foreign.push(r.url()); });
  await page.goto(origin + (opts.path || "/index.html"));
  return { context, page, errors, foreign };
}

const settled = (page) => page.waitForTimeout(260);

async function ranks(page) {
  return page.evaluate(() => {
    const out = new Array(16).fill(0);
    document.querySelectorAll("#tiles .tile").forEach((t) => {
      const i = Number(t.style.getPropertyValue("--y")) * 4 + Number(t.style.getPropertyValue("--x"));
      out[i] = Math.max(out[i], Number(t.dataset.rank));
    });
    return out;
  });
}

async function dismissHow(page) {
  if (await page.isVisible("#how")) await page.keyboard.press("Escape");
  assert.equal(await page.isVisible("#how"), false);
}

function runSave(board, extra = {}) {
  return JSON.stringify(Object.assign({
    v: 1, mode: "free", runDate: "2026-11-13", bestAtStart: 0, undosLeft: 3, startedAt: 1,
    current: { board, score: 0, nextRank: 1, moves: 0, merges: 0, highest: Math.max(...board), rng: 12345 },
    undo: []
  }, extra));
}

const SEEN = JSON.stringify({ how: true, sound: true });
const ONE_GAP = [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 0, 3, 4, 5];

test.before(async () => {
  server = await serve();
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

test("desktop: first visit shows rules with focus, keyboard play scores, no errors", async () => {
  const { context, page, errors, foreign } = await open();
  assert.equal(await page.isVisible("#how"), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), "how-close", "rules dialog takes focus");
  await page.keyboard.press("Escape");
  assert.equal(await page.isVisible("#how"), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), "board", "focus returns to the board");
  assert.equal((await ranks(page)).filter(Boolean).length, 2);
  let changes = 0;
  const keys = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "a", "w", "d", "s"];
  for (let i = 0; i < 40; i++) {
    const before = (await ranks(page)).join();
    await page.keyboard.press(keys[i % keys.length]);
    await settled(page);
    if ((await ranks(page)).join() !== before) changes++;
    if (await page.isVisible("#result")) break;
  }
  assert.ok(changes >= 20, "keyboard moved the board " + changes + " times");
  assert.ok(Number((await page.textContent("#score")).replace(/,/g, "")) > 0, "score went up");
  assert.match(await page.textContent("#live"), /Score/, "moves are announced");
  assert.deepEqual(errors, []);
  assert.deepEqual(foreign, [], "no requests leave the page's own origin");
  await context.close();
});

test("desktop: a move that changes nothing does not spawn a tile", async () => {
  const board = [1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const { context, page, errors } = await open({ storage: { [SETTINGS_KEY]: SEEN, [RUN_KEY]: runSave(board) } });
  assert.deepEqual(await ranks(page), board, "saved board restored");
  await page.keyboard.press("ArrowLeft");
  await settled(page);
  assert.deepEqual(await ranks(page), board, "left changes nothing");
  await page.keyboard.press("ArrowUp");
  await settled(page);
  assert.deepEqual(await ranks(page), board, "up changes nothing");
  assert.match(await page.textContent("#live"), /Nothing slides up/);
  await page.keyboard.press("ArrowDown");
  await settled(page);
  assert.equal((await ranks(page)).filter(Boolean).length, 5, "a real move spawns exactly one tile");
  assert.deepEqual(errors, []);
  await context.close();
});

test("desktop: on-screen arrows, undo key and modifier keys", async () => {
  const { context, page, errors } = await open({ storage: { [SETTINGS_KEY]: SEEN } });
  const start = (await ranks(page)).join();
  for (const label of ["Slide left", "Slide up", "Slide right", "Slide down"]) {
    await page.getByRole("button", { name: label }).click();
    await settled(page);
  }
  assert.notEqual((await ranks(page)).join(), start, "arrow buttons move tiles");
  const beforeUndo = await ranks(page);
  const scoreBefore = await page.textContent("#score");
  let made = 0;
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    if (made === 2) break;
    const b = (await ranks(page)).join();
    await page.keyboard.press(k);
    await settled(page);
    if ((await ranks(page)).join() !== b) made++;
  }
  assert.equal(made, 2, "made two real moves");
  await page.keyboard.press("u");
  await settled(page);
  await page.keyboard.press("u");
  await settled(page);
  assert.deepEqual(await ranks(page), beforeUndo, "two undos rewind two moves");
  assert.equal(await page.textContent("#score"), scoreBefore);
  assert.equal(await page.textContent("#undo"), "Undo · 1");
  const prevented = await page.evaluate(() => {
    const e = new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  assert.equal(prevented, false, "Alt+Arrow is left to the browser");
  assert.deepEqual(errors, []);
  await context.close();
});

test("reload mid-game restores the same board, score and undo count", async () => {
  const { context, page, errors } = await open({ storage: { [SETTINGS_KEY]: SEEN } });
  for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
    await page.keyboard.press(k);
    await settled(page);
  }
  await page.keyboard.press("u");
  await settled(page);
  const board = await ranks(page);
  const score = await page.textContent("#score");
  const undo = await page.textContent("#undo");
  const next = await page.textContent("#next-name");
  await page.reload();
  await settled(page);
  assert.deepEqual(await ranks(page), board);
  assert.equal(await page.textContent("#score"), score);
  assert.equal(await page.textContent("#undo"), undo);
  assert.equal(await page.textContent("#next-name"), next);
  // The restored dealer continues the same sequence: compare one more move in two tabs.
  await page.keyboard.press("ArrowDown");
  await settled(page);
  const a = await ranks(page);
  await page.keyboard.press("u");
  await settled(page);
  await page.reload();
  await settled(page);
  await page.keyboard.press("ArrowDown");
  await settled(page);
  assert.deepEqual(await ranks(page), a, "same move after reload deals the same tile");
  assert.deepEqual(errors, []);
  await context.close();
});

test("malformed saves reset safely", async () => {
  const bad = [
    { [SETTINGS_KEY]: '{"freeBest":null,"sound":"false"}', [RUN_KEY]: "{not json" },
    { [SETTINGS_KEY]: "null", [RUN_KEY]: runSave([13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { [SETTINGS_KEY]: '{"freeBest":{"x":1},"how":true}', [RUN_KEY]: '{"v":1,"mode":"free","current":{"board":"x"}}' },
    { [SETTINGS_KEY]: "[]", [RUN_KEY]: "42" }
  ];
  for (const storage of bad) {
    const { context, page, errors } = await open({ storage });
    await dismissHow(page);
    assert.deepEqual(errors, [], JSON.stringify(storage));
    assert.equal((await ranks(page)).filter(Boolean).length, 2, "fresh board");
    assert.equal(await page.textContent("#best"), "0");
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), RUN_KEY);
    assert.equal(saved.v, 1, "bad run replaced by a valid one");
    const settings = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SETTINGS_KEY);
    assert.equal(typeof settings.sound, "boolean");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowDown");
    await settled(page);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("game over: result dialog, focus, hub events through the built-in bridge", async () => {
  const { context, page, errors } = await open({
    path: "/host.html",
    storage: { [SETTINGS_KEY]: SEEN, [RUN_KEY]: runSave(ONE_GAP, { current: { board: ONE_GAP, score: 24, nextRank: 1, moves: 9, merges: 3, highest: 5, rng: 7 } }) }
  });
  const frame = page.frameLocator("#g");
  const game = page.frames().find((f) => f.url().endsWith("/index.html"));
  await game.waitForSelector("#tiles .tile");
  await frame.locator("#board").focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  assert.equal(await game.isVisible("#result"), true, "forge cooled");
  assert.equal(await game.evaluate(() => document.activeElement.id), "share");
  assert.equal(await game.evaluate(() => document.getElementById("app").inert), true, "page behind the dialog is inert");
  assert.match(await game.textContent("#live"), /Forge cooled/);
  const got = await page.evaluate(() => window.got);
  const types = got.map((m) => m.type + (m.name ? ":" + m.name : ""));
  assert.ok(types.includes("hub:ready"), types.join());
  assert.ok(types.includes("hub:score"));
  assert.ok(types.includes("hub:event:run-ended"));
  assert.ok(types.includes("hub:gameover"));
  const ended = got.find((m) => m.name === "run-ended").data;
  assert.deepEqual(Object.keys(ended).sort(), ["bestRank", "daily", "merges", "moves", "score", "value"]);
  assert.equal(ended.score, 24);
  const over = got.find((m) => m.type === "hub:gameover");
  assert.equal(typeof over.durationMs, "number");
  // Reloading a finished run shows the result again without re-reporting it.
  await page.evaluate(() => { window.got = []; });
  await game.evaluate(() => location.reload());
  await page.waitForTimeout(500);
  const game2 = page.frames().find((f) => f.url().endsWith("/index.html"));
  assert.equal(await game2.isVisible("#result"), true);
  const again = await page.evaluate(() => window.got.map((m) => m.type));
  assert.ok(!again.includes("hub:gameover"), "no duplicate game over on reload");
  await game2.click("#result-undo");
  await page.waitForTimeout(200);
  assert.equal(await game2.isVisible("#result"), false, "undo works after the forge cools");
  assert.equal(await game2.evaluate(() => document.getElementById("app").inert), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("dialogs keep focus inside and Escape cancels the confirm", async () => {
  const { context, page, errors } = await open({ storage: { [SETTINGS_KEY]: SEEN } });
  await page.keyboard.press("ArrowLeft");
  await settled(page);
  await page.keyboard.press("ArrowRight");
  await settled(page);
  await page.click("#anew");
  assert.equal(await page.isVisible("#confirm"), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), "confirm-no");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => !document.activeElement.closest("#app")), "focus stays out of the inert page");
  }
  await page.keyboard.press("Escape");
  assert.equal(await page.isVisible("#confirm"), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), "anew", "focus returns to the opener");
  assert.deepEqual(errors, []);
  await context.close();
});

test("mute silences every sound", async () => {
  const { context, page } = await open({ storage: { [SETTINGS_KEY]: JSON.stringify({ how: true, sound: false }) } });
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowLeft"]) {
    await page.keyboard.press(k);
    await settled(page);
  }
  await page.click("#undo");
  assert.equal(await page.evaluate(() => window.__osc), 0, "no oscillators while muted");
  await page.click("#sound");
  assert.equal(await page.getAttribute("#sound", "aria-pressed"), "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowDown");
  await settled(page);
  assert.ok((await page.evaluate(() => window.__osc)) > 0, "sound plays when on");
  await context.close();
});

test("reduced motion turns transitions off", async () => {
  const { context, page, errors } = await open({
    context: { viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" },
    storage: { [SETTINGS_KEY]: SEEN }
  });
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector("#tiles .tile")).transitionDuration);
  assert.equal(duration, "0s");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(60);
  assert.equal(await page.locator(".floater").count(), 0, "no score floaters");
  assert.deepEqual(errors, []);
  await context.close();
});

test("phone 390x844: touch swipes play, no horizontal scroll, page does not scroll", async () => {
  const { context, page, errors } = await open({
    context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
  });
  await page.tap("#how-close");
  const cdp = await context.newCDPSession(page);
  async function swipe(dx, dy) {
    const box = await page.locator("#board").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let k = 1; k <= 6; k++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * k) / 6, y: y + (dy * k) / 6 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await settled(page);
  }
  const dirs = [[-110, 0], [0, -110], [110, 0], [0, 110]];
  let changes = 0;
  for (let i = 0; i < 24; i++) {
    const before = (await ranks(page)).join();
    await swipe(...dirs[i % 4]);
    if ((await ranks(page)).join() !== before) changes++;
  }
  assert.ok(changes >= 16, "swipes moved the board " + changes + "/24 times");
  const dims = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight, y: scrollY
  }));
  assert.ok(dims.sw <= dims.iw, "no horizontal scroll: " + JSON.stringify(dims));
  assert.ok(dims.sh <= dims.ih, "fits a 390x844 screen: " + JSON.stringify(dims));
  assert.equal(dims.y, 0, "swipes do not scroll the page");
  const overflow = await page.evaluate(() => [...document.querySelectorAll(".app *")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5);
  }).map((el) => el.id || el.className).slice(0, 5));
  assert.deepEqual(overflow, [], "nothing pokes past the screen edge");
  assert.deepEqual(errors, []);
  await context.close();
});

test("common screens fit the whole game without scrolling", async () => {
  for (const [width, height] of [[1280, 800], [1366, 768], [390, 844], [375, 667]]) {
    const { context, page } = await open({ context: { viewport: { width, height } }, storage: { [SETTINGS_KEY]: SEEN } });
    const dims = await page.evaluate(() => ({
      bottom: document.getElementById("anew").getBoundingClientRect().bottom,
      sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth
    }));
    assert.ok(dims.bottom <= height, width + "x" + height + " controls in view " + JSON.stringify(dims));
    assert.ok(dims.sh <= height && dims.sw <= width, width + "x" + height + " no scroll " + JSON.stringify(dims));
    await context.close();
  }
});

test("small phone 320x568: still no horizontal scroll", async () => {
  const { context, page, errors } = await open({
    context: { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true },
    storage: { [SETTINGS_KEY]: SEEN }
  });
  const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  assert.ok(dims.sw <= dims.iw, JSON.stringify(dims));
  assert.deepEqual(errors, []);
  await context.close();
});
