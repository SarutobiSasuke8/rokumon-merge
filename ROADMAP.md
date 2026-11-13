# Roadmap

## Now

- [x] Pure, deterministic move logic with an injectable random source
- [x] Save the run in progress and restore it on reload
- [x] Validate saved settings and runs; bad data resets safely
- [x] Fix boot crash on a malformed best score
- [x] Make the hub bridge work when embedded without `hub-bridge.js`
- [x] Keyboard focus, dialog focus handling, live announcements, arrow buttons
- [x] Contrast fixes on tile value badges and two tile colours
- [x] Fit common phone and laptop screens without scrolling
- [x] Unit tests, property test, browser smoke test and CI on pull requests
- [ ] Human playtest on a real iPhone (Safari) and an Android phone
- [ ] Hub intake: bump the manifest version and release, then copy `index.html` into the hub

## Next

- [ ] Tile art pass so every rank reads at a glance (Bloom vs Rokumon crest, Tanto vs Wakizashi, Katana vs Rokumon gold)
- [ ] Sound pass: richer forge sounds that still respect mute
- [ ] Check Safari and Firefox with the smoke test (Playwright WebKit and Firefox)
- [ ] Screenshots, cover and logo for the hub listing
- [ ] Decide whether the README and manifest should keep naming "2048"

## Later

- [ ] Daily streaks and a seven-day history on this device
- [ ] A short opening tutorial board instead of the rules sheet
- [ ] Server-side check of daily scores before any reward depends on them
