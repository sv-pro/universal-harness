# HANDOFF: universal-harness

Updated 2026-10-02 by Claude Code (desktop). Keep this current as you work.

## State

- `main`: model, registry, two manifests, `uh validate`, `uh brief`.
- `claude/pickup` (this branch, committed, not merged): `uh pickup`, identity keys,
  providers (git, github via gh, linear via API, files). `npm run check` green (15 tests).
- Tried on real ai2rules data: `#95` (Grok Bot's draft PR), `AI2-25` (parent, 4 PRs),
  the checked-out branch, the `hero-mcp-server` task. Output reviewed by hand.
- Linear reading is implemented but **untested against the real API** (no
  `LINEAR_API_KEY` here); covered only by a mocked test.

## Open questions for the maintainer

1. How do agents reach Linear today? No agent declares a Linear connection.
2. Linear status names for the `flywheel` and `change` flows (mapping unknown).
3. Grok Bot's "Run failed" for #95 is visible only inside Grok Bot (GitHub: 14/14 green).
   Can Grok Bot write its run outcome somewhere reachable (PR comment)?
4. Is `HANDOFF.md` in ai2rules meant to stay uncommitted? Then cloud agents never see it.

## Next

- Merge `claude/pickup` into `main` (maintainer).
- Readers for the remaining carrier kinds only when a flow needs them (checkbox, section, tag, version).
- Provisioning: write each agent's native config (instructions block, MCP) from the manifest.
- A second, different real project to test the model.
