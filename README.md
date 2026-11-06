# Usage HUD

A compact Hermes Desktop status-bar view of OpenAI Codex account limits and the focused session's usage.

Click the status-bar item to see remaining 5-hour and weekly quota, reset times, context usage, model and token totals. Account bars show **remaining**; context shows **used**. Session total is the total reported by Hermes, not a sum of cached-token fields. Context may be marked as an estimate by Hermes.

## Requirements and limitations

- Hermes Desktop 0.23.0 or newer; OpenAI Codex must be configured for account limit windows. Other providers' account limits are not supported.
- Usage values depend on Hermes gateway data; unavailable, invalid or expired readings are hidden rather than guessed. Multiple account pools are not averaged.
- Reset times use the device's local timezone. Reads are normally refreshed every 60 seconds; the timestamp denotes the local RPC read, not guaranteed freshness of the upstream cache.
- The plugin uses Hermes's Desktop SDK and gateway RPC methods `session.usage` and `model.options`. Hermes may contact the provider to refresh account usage. The plugin does not read credential files, access tokens, invoke shell commands, or transmit telemetry to its author.

## Installation

The plugin can be installed from its GitHub repository using Hermes' plugin installer:

```sh
hermes plugins install aktogde1/hermes-usage-hud
```

In Hermes Desktop, open **Settings → Plugins**, find **Usage HUD**, and enable the Desktop plugin if it is off. Open a session using OpenAI Codex to see available account limits. The Git-based package-install path and cross-platform behavior have not yet been fully verified; the standalone Desktop SDK installation has been observed on Windows. The `desktop/plugin.js` file is the Desktop plugin entry point.

## Testing

Run `node --test tests/*.test.cjs`. The test fixture is synthetic and contains no account credentials or personal usage data.
