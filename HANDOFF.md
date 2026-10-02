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

- 2026-10-02: **manifests moved into their repos** (`.uh/project.yaml`; harness keeps
  `registry/agents.yaml` + `registry/projects.yaml`); uh falls back to the default
  branch's manifest when a checkout lacks it. ai2rules' manifest landed with
  sv-pro/ai2rules#97 (merged, bf505fa); `uh` works in ai2rules on any branch.
- 2026-10-02: **coding-agent-harness merged in as `design/`** (subtree, history kept,
  pushed) **without the design guide**: it distills two books, one a Manning MEAP
  (personal-use license), so it was filtered out of the imported history and is
  git-ignored in `design/docs/design-guide/`; its home stays the local
  `coding-agent-harness` repo. Its open items, from
  `design/HANDOFF-2026-09-26.md`: eval step 0 (58 + 90 candidate cases) awaits the owner's
  admit/reject, then a baseline run; world lint, trace-replay gate, other stage worlds,
  L0 sandbox and evidence store are specified, not built.

## Open questions for the maintainer

1. Merge the sv-pro/ai2rules PR with the Linear status mapping (change flow). The
   flywheel flow's Linear mapping is still unknown: which status is "development"?

## Next

- **Trial #95 done (A, B, C) 2026-10-02:** results in `docs/trials/2026-10-pickup-95.md`
  §6. A 10/12, C 11/12 (Claude Code subagents, contaminated by the parent's memory);
  B 12/12 (Codex via `codex exec`, after the fixes: help, closing refs, related-work
  drift, obligations vs changed files, clearer `uh` line). B read Linear itself: AI2-25
  is **Done** in Linear while #87/#95 and #84–#86 are open on GitHub.
  ai2rules restored to `fix/projection-effective-call-log-chain` with its HANDOFF.md.
  PR sv-pro/ai2rules#97 (clearer pickup instructions, manifest in the repo) merged.
- Codex `app-server` (experimental) can surface `item/tool/requestUserInput` to an
  orchestrator: a possible route for forwarding one agent's questions to another.
- Hooks that enforce the checkpoint obligation (e.g. remind to update HANDOFF.md).
- Procedures → skills/commands for agents other than Claude Code.
- A second, different real project to test the model.
