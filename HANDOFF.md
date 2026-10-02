# HANDOFF: universal-harness

Updated 2026-10-02 by Claude Code (desktop). Keep this current as you work.

## State

- Initial commit on `main`: model, registry, two manifests, `uh validate`, `uh brief`.
- `npm run check` green: tsc, 9 tests, both manifests validate with 0 errors.
- Done: `docs/model.md` (8 categories, each with its ai2rules instances),
  `registry/agents.yaml`, `projects/ai2rules/project.yaml`,
  `projects/universal-harness/project.yaml`, `uh validate`, `uh brief [--agent]`.

## Open questions for the maintainer

1. How do agents reach Linear today? No agent declares a Linear connection, so
   `validate` reports `engine` cannot reach `linear` for every agent.
2. Linear statuses for the `flywheel` and `change` flows (mapping unknown).
3. Does Grok Bot read `AGENTS.md`, and can it see GitHub Actions results?
4. Is `HANDOFF.md` in ai2rules meant to stay uncommitted? If so, cloud agents can never
   read it (validate: "session record is local only").

## Next

- `uh pickup <item|branch>`: assemble one item's state from all its carriers plus the
  latest continuity record.
- A second, different real project to test the model (open points in `docs/model.md`).
- Provisioning: write each agent's native config from the manifest.
