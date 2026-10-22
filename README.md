# Кототанки — Защити дом!

**Commercial candidate, not a published paid release.** A lightweight single-file HTML5 arcade game in Russian, with 30 stages, local progression, stars, rewards, cosmetic cat looks and upgrades.

## Play

Open \`index.html\` in a modern browser. Touch buttons: arrows for movement, sausage for shooting, bomb for area attack, center menu for pause/settings. Keyboard: arrows/WASD, Space and B. Works offline as a local HTML document after it has been downloaded.

## Development

- No paid APIs, external analytics or third-party runtime dependencies.
- No player account or server is required. Progress lives in \`localStorage\` on the current browser/device, and can be lost when browser storage is cleared.
- Built-in reproducible smoke checks (Node 20+): \`npm test\`.
- Run browser/device checks on Chrome Android (portrait and landscape), Safari iOS and desktop before releasing.

## Safety and release state

The public GitHub Pages build follows \`main\`. This candidate lives on \`feature/commercial-candidate-20261022\`, and intentionally does not affect the public game until explicitly approved.

Consult \`COMMERCIAL_READINESS.md\` for the detailed release gate. **Do not claim commercial rights for bundled sprites without provenance.** Do not enable in-app purchases, ads, paid distribution or public launches without user approval.

## Open-source code and assets

No redistribution or commercial license is asserted here. Rights must be confirmed for all sprites, illustrations, audio, code, and third-party dependencies (if added), before sale. The current sprites are embedded in \`index.html\` as PNG data.
