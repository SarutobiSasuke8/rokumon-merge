"use strict";
// Loads the rules block straight out of index.html into a fresh VM context, so the
// shipped file stays a single self-contained page and the tests run the exact code
// players get.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX = path.join(__dirname, "..", "index.html");

function loadLogic() {
  const html = fs.readFileSync(INDEX, "utf8");
  const match = html.match(/<script id="rokumon-merge-logic">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('index.html has no <script id="rokumon-merge-logic"> block');
  const context = vm.createContext({});
  vm.runInContext(match[1], context, { filename: "index.html#rokumon-merge-logic" });
  if (!context.RokumonMergeLogic) throw new Error("logic block did not define RokumonMergeLogic");
  return context.RokumonMergeLogic;
}

// Values from the VM realm have foreign prototypes; compare them as plain JSON.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { loadLogic, plain, INDEX };
