# HANDOFF: universal-harness

Updated 2026-10-02 by Claude Code (desktop). Keep this current as you work.

## State

- `main`: model, registry, manifests, `uh validate`, `uh brief`, `uh pickup`.
- `claude/provision` (this branch): `uh provision` (owned blocks in AGENTS.md and
  CLAUDE.md, `.uh/brief.md`, `.mcp.json`, manual steps for user-level config),
  connection catalog in `registry/agents.yaml`, project lookup by cwd/id, `bin: uh`.
  `npm run check` green (21 tests, includes `provision --check` on this repo).
- This repo is provisioned (`--write` done here). **ai2rules is not**: dry run only,
  waiting for the maintainer's go-ahead (it writes AGENTS.md, CLAUDE.md, .uh/brief.md,
  .mcp.json in that repo).
- Unverified: the Linear and GitHub MCP URLs in the catalog; Codex's 32 KiB limit;
  Linear API reading in pickup.

## Open questions for the maintainer

1. Provision ai2rules (`uh provision --write` inside it), and commit there?
2. How do agents reach Linear today? (Provisioning adds Linear MCP to `.mcp.json` for
   Claude Code; Codex and Grok Bot get manual steps.)
3. Linear status names for the `flywheel` and `change` flows.
4. Antigravity is first choice for megaphone/illustrator but used rarely: rebind?
5. Is ai2rules' `HANDOFF.md` meant to stay uncommitted? Cloud agents never see it.

## Next

- Hooks that enforce the checkpoint obligation (e.g. remind to update HANDOFF.md).
- Procedures → skills/commands for agents other than Claude Code.
- A second, different real project to test the model.
