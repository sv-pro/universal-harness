# HANDOFF: universal-harness

Updated 2026-10-02 by Claude Code (desktop). Keep this current as you work.

## State

- `main`: model, registry, manifests, `uh validate|brief|pickup|provision`, Codex's
  `docs/claude-code-linear.md`, connection `evidence`, untracked-record labels,
  `~/` repo paths (a manifest is shared, a home directory is not).
  Published at https://github.com/sv-pro/universal-harness (public).
  `npm run check` green (22 tests).
- `uh` is on PATH on the Windows host (`npm link`); it finds the project by cwd.
- ai2rules: megaphone rebound to Claude Code → Codex → Antigravity (docs/FLYWHEEL.md
  still names Antigravity). Provisioning PR https://github.com/sv-pro/ai2rules/pull/96
  updated with the rebind. ai2rules' checkout is back on
  `fix/projection-effective-call-log-chain`, its untracked HANDOFF.md untouched.
- Linear: URL checked against docs (Codex), no live connection yet. `validate`
  counts `.mcp.json` as reach; that is configuration, not evidence of access.

## Open questions for the maintainer

1. Review and merge sv-pro/ai2rules#96; update docs/FLYWHEEL.md for the megaphone rebind?
2. After connecting Claude Code to Linear (docs/claude-code-linear.md): read AI2's
   workflow statuses so the `flywheel` and `change` flows can be mapped.

## Next

- Hooks that enforce the checkpoint obligation (e.g. remind to update HANDOFF.md).
- Procedures → skills/commands for agents other than Claude Code.
- A second, different real project to test the model.
