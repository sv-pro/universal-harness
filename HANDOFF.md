# HANDOFF: universal-harness

Updated 2026-10-02 by Claude Code (desktop). Keep this current as you work.

## State

- `main` (8d5ae95): model, registry, manifests, `uh validate|brief|pickup|provision`,
  Codex's `docs/claude-code-linear.md`, connection `evidence` (none/docs/live), pickup
  labels untracked working-tree records. `npm run check` green (21 tests).
- **ai2rules provisioned**: branch `claude/uh-workspace` (7d92e75) pushed,
  PR https://github.com/sv-pro/ai2rules/pull/96 open, CI was pending when opened.
  ai2rules' checkout is back on `fix/projection-effective-call-log-chain`, its
  untracked HANDOFF.md untouched.
- Linear: URL checked against docs (Codex), no live connection yet. `validate`
  counts `.mcp.json` as reach; that is configuration, not evidence of access.

## Open questions for the maintainer

1. Review and merge sv-pro/ai2rules#96.
2. After connecting Claude Code to Linear (docs/claude-code-linear.md): read AI2's
   workflow statuses so the `flywheel` and `change` flows can be mapped.
3. `npm link` here, so the `uh pickup` the AGENTS.md block mentions exists on PATH?
4. Antigravity is first choice for megaphone/illustrator but rarely used: rebind?

## Next

- Hooks that enforce the checkpoint obligation (e.g. remind to update HANDOFF.md).
- Procedures → skills/commands for agents other than Claude Code.
- A second, different real project to test the model.
