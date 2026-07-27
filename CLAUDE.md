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
