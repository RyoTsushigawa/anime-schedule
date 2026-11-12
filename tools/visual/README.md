# Visual checks

These checks render the real app with fixed, fake list and sheet responses. No real account, sheet or bot is accessed. Covers and dates are deterministic.

Run `npm ci` in `tests/` and `tools/visual/`, then `npx playwright install chromium` and `npm test` in `tools/visual/`. CI uses Ubuntu and Playwright 1.49.1 so reference images are comparable.

The Visual checks workflow runs for UI pull requests (all tests in `tests/` run in `check.yml`): each view (Zeitplan, Einstellungen, Verspätung, Catch-up) on phone (dark/light) and desktop. It fails when a view
doesn't render or scrolls sideways. Screenshots are kept as the `visual-review` artifact for a look, not compared
against reference images, so intended design changes don't fail the check. Locally:
`PW_CHROMIUM=/path/to/chromium npm test` uses an installed browser.
