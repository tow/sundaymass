# Repository instructions

## Browser testing

- Chrome MCP is available for interactive UI testing. Use it to open, inspect, and
  exercise the locally served app after user-interface changes.
- Do not conclude that browser testing is unavailable merely because a generic
  in-app-browser connector is absent; discover and use the Chrome MCP tools.
- Treat mobile as the primary viewport. Test at 390 × 844 as well as a desktop width,
  checking for horizontal overflow, focus or keyboard disruption, full-screen dialog
  behavior, and reachable actions.
- For editor changes, verify both signed-in editing and public viewing. In particular,
  confirm that public plan requests and rendered pages never contain song lyrics.
- Also run the automated tests and production build; Chrome MCP testing complements
  rather than replaces them.

## Pushing and CI budget

- Push once per finished piece of work, not per commit. Every push to `main` runs the
  full CI suite and, unless it touches only Markdown, redeploys the site, which spends
  the CI budget and reloads every open planner page.
- Commit as often as useful, but keep commits local until the feature is complete and
  verified locally (`npm run check`, plus browser checks for UI changes), then push them
  together. Push a single change on its own only when it fixes something already broken
  in production.
- Do not discover bugs by deploying: run what CI would run before pushing.
