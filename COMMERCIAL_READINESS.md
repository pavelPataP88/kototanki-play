# Кототанки — commercial release gate

**Date:** 2026-10-22
**Status:** development candidate, **NOT** verified market-ready or commercially licensed.

## Existing baseline

- Single-file HTML Canvas game, 416 x 512 world coordinates.
- 30 progressively harder stages, 5 dog types, destructible obstacles, bonuses, 2 control methods, audio on/off.
- Source includes 6 embedded PNG sprites (cat plus 5 dog types), but no independently verified commercial asset provenance.
- Public game: GitHub Pages from \`main\`. Development remains on a separate branch.

## Implemented in this candidate

- Menu, level selector and completion history; locked and completed stages.
- Browser-local progression, best score and settings, fail-safe for storage denial/corruption.
- Star grades and earned soft currency for each clear; reduced replay farming rewards.
- Three upgrade categories (health, house health, rate of fire) with fixed rank caps.
- Two cosmetic cat color variants unlocked through collected stars.
- Touch/keyboard navigation, pause and background-tab pause.
- No IAP/ads/telemetry/online dependencies.

## Commercial blockers (stop before claiming "ready to sell")

1. **Rights/licensing:** provenance and written commercial usage rights for each original sprite, artwork, sound and source component. The embedded PNGs are NOT verified licensed.
2. **Real devices:** verify Android phone/tablet portrait + landscape (multiple sizes), iOS Safari, desktop Chrome/Firefox/Edge. Test back/forward navigation, phone calls, rotate, refresh, touch held movement and 30-60min sessions.
3. **Gameplay quality:** human playtest from level 1 to 30, reward pacing, shop costs, frustration/churn metrics, exploits and performance on low-memory phones; tune after evidence.
4. **Accessibility:** audit colors for contrast, keyboard focus and screen-reader status. Document any gameplay access limitations.
5. **Packaging:** sales platform asset sizes, screenshots, preview video, icon, title art, help/privacy/terms and any localizations. Not done.
6. **Business readiness:** market positioning and willingness-to-pay test. A live page alone is NOT evidence that customers will pay.
7. **Publication:** prepare release artifacts and separate explicit approval before merging to \`main\`, launching a store page or accepting money.

## Suggested low-cost commercialization route

A downloadable, DRM-free HTML5 ZIP sold on itch.io is a plausible route. Per official itch.io docs, HTML5 games playable directly in-browser can receive donations; to sell access use its **Downloadable** game type, subject to platform rules. See https://itch.io/docs/creators/html5

A native Android sale would additionally require packaging, review and Play Console policy compliance. As of Aug 31, 2026 new Google Play Android apps must target Android 16 / API 36 or higher (official Android Play Console policy). This project has NOT been built as an APK.

## Verification labels

- \`SOURCE_EDITED\`: main game file changed in commercial candidate branch.
- \`JS_PARSED\`: all inline JS compiled in V8 isolate on 2026-10-22.
- \`SIMULATED_SMOKE\`: 19 targeted game and local-save checks passed in simulated DOM, **not device playtesting**.
- \`NODE_TESTS\`: see GitHub Actions job evidence; do NOT label passing unless a real run returns success.
- \`DEVICE_PLAYTEST\`: **NOT PERFORMED**.
- \`SALE_READY\`: **NO**.

No money spent, no user-facing storefront created, and \`main\` unchanged.
