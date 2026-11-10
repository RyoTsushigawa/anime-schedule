# Visual checks

These checks render the real app with fixed, fake list and sheet responses. No real account, sheet or bot is accessed. Covers and dates are deterministic.

Run `npm ci` in `tests/` and `tools/visual/`, then `npx playwright install chromium` and `npm test` in `tools/visual/`. CI uses Ubuntu and Playwright 1.49.1 so reference images are comparable.

The Visual checks workflow runs for UI pull requests. Screenshot differences fail the check and produce a report. Review intentional differences before updating references using the manual workflow with `update_baselines: true`. Download its baseline artifact, review the images, and commit them. Normal runs never accept new screenshots automatically.

For direct API publishing, dispatch the workflow against a candidate branch and wait for success before updating main. GitHub Pages' existing direct-main publishing is not replaced by this workflow.
