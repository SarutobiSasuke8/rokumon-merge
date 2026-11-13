"use strict";
// Guards the shipping rule: index.html is one self-contained file with no
// network access, no external assets and no analytics.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { INDEX } = require("./load-logic");

const html = fs.readFileSync(INDEX, "utf8");

test("index.html loads nothing from anywhere", () => {
  for (const [name, pattern] of Object.entries({
    "absolute URL": /https?:\/\//i,
    "protocol-relative URL": /["'(]\/\/[a-z0-9]/i,
    "external script": /<script[^>]+src=/i,
    "stylesheet link": /<link[^>]+href=/i,
    "css import": /@import/i,
    "fetch": /\bfetch\s*\(/,
    "XMLHttpRequest": /XMLHttpRequest/,
    "beacon": /sendBeacon/,
    "WebSocket": /WebSocket/,
    "dynamic import": /\bimport\s*\(/,
    "image or media src": /<(img|audio|video|source|iframe)\b/i
  })) {
    assert.doesNotMatch(html, pattern, name);
  }
});

test("index.html stays well inside the hub bundle budget", () => {
  const bytes = fs.statSync(INDEX).size;
  assert.ok(bytes < 200 * 1024, "index.html is " + bytes + " bytes");
});
