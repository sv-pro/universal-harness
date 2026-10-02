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
  updated in the same PR). Provisioning PR https://github.com/sv-pro/ai2rules/pull/96
  updated with the rebind. ai2rules' checkout is back on
  `fix/projection-effective-call-log-chain`, its untracked HANDOFF.md untouched.
- 2026-10-02: ai2rules#96 **merged** (acd6bf7, squash). Trial setup done: ai2rules is
  on `main`; the fix branch's HANDOFF.md is in `git stash` as `fix-branch-HANDOFF`
  (restore steps in the trial doc, section 7).
- Linear: URL checked against docs (Codex), no live connection yet. `validate`
  counts `.mcp.json` as reach; that is configuration, not evidence of access.

## Open questions for the maintainer

1. After connecting Claude Code to Linear (docs/claude-code-linear.md): read AI2's
   workflow statuses so the `flywheel` and `change` flows can be mapped.

## Next

- **Trial run (A, C) 2026-10-02:** results in `docs/trials/2026-10-pickup-95.md` §6.
  Both scored well (10/12, 11/12) and both missed "merging #95 must not close #87".
  Both runs are contaminated by the parent session's memory; C is not a clean baseline.
  Candidate increments from it: `uh --help` (what each command reads/writes); the block
  should say how to check for `uh`; pickup shows "Part of" vs "Closes", checks
  obligations against changed files, and flags children whose PR merged but issue is
  open. B (Codex) not run: feasible with the bundled `codex exec`.
  ai2rules is still on `main` with the fix branch's HANDOFF.md stashed (restore: §7).
- Codex `app-server` (experimental) can surface `item/tool/requestUserInput` to an
  orchestrator: a possible route for forwarding one agent's questions to another.
- Hooks that enforce the checkpoint obligation (e.g. remind to update HANDOFF.md).
- Procedures → skills/commands for agents other than Claude Code.
- A second, different real project to test the model.
