# HANDOFF: universal-harness

Updated 2026-10-02 by Claude Code (desktop). Keep this current as you work.

## State

- `main` (fb3eafb): model, registry, manifests, `uh validate|brief|pickup|provision`,
  Codex's `docs/claude-code-linear.md`, connection `evidence` (none/docs/live).
- `claude/untracked-records` (this branch, not merged): pickup labels a working-tree
  record that git does not track ("not tied to this branch"). Found when an
  uncommitted ai2rules HANDOFF.md followed a branch switch. `npm run check` green.
- **ai2rules provisioned** on its branch `claude/uh-workspace` (23ef35e, from
  origin/main, not pushed): AGENTS.md block + layout + per-assistant note, CLAUDE.md
  block, `.uh/brief.md`, `.mcp.json` (Linear). ai2rules' checkout was switched back
  to `fix/projection-effective-call-log-chain`, its untracked HANDOFF.md untouched.
- Linear: URL checked against docs (Codex), no live connection yet. `validate`
  counts `.mcp.json` as reach; that is configuration, not evidence of access.

## Open questions for the maintainer

1. Push `claude/uh-workspace` in ai2rules and open a PR?
2. After connecting Claude Code to Linear (docs/claude-code-linear.md): read AI2's
   workflow statuses so the `flywheel` and `change` flows can be mapped.
3. `npm link` here, so the `uh pickup` the AGENTS.md block mentions exists on PATH?
4. Antigravity is first choice for megaphone/illustrator but rarely used: rebind?

## Next

- Hooks that enforce the checkpoint obligation (e.g. remind to update HANDOFF.md).
- Procedures → skills/commands for agents other than Claude Code.
- A second, different real project to test the model.
