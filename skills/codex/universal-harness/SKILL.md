---
name: universal-harness
description: Use universal-harness (uh) across projects to pick up another agent's work, inspect workspace briefs, validate project manifests against the agent registry, and provision agent setup. Apply when the user invokes uh or requests these workflows for a project described by .uh/project.yaml. Not a general coding or universal-harness implementation skill.
---

# Universal Harness

Use the project's workspace model to establish what is known, what can be done next, and what must survive a handoff. The manifest describes the project; the shared registry describes the user's agents. The skill operates the existing tool and follows the target project's instructions.

## Locate the tool and target

Use `uh --help` for the installed CLI's current contract. On Windows PowerShell, use `uh.cmd` if the script shim is blocked. If neither is on PATH, use Node >= 24 with a universal-harness checkout:

```text
node "<checkout>/src/cli.ts" --help
```

Find the checkout rather than assuming one. If this skill directory is a link into a checkout (the install the harness README describes), resolve the link: the checkout is three levels above this `SKILL.md` (`skills/codex/universal-harness/`). Otherwise ask the user where it is. Verify `src/cli.ts` exists there before running it. This invocation avoids requiring a global installation. If neither CLI nor checkout is available, read the target branch's committed `HANDOFF.md` and its instructions, and report that live pickup is unavailable.

Run commands inside the target repo, or explicitly pass `-p` with its id, repo directory, or manifest path. When invoking from the harness checkout for a different project, always pass the target. `registry/projects.yaml` in the harness checkout maps project ids to local paths; `--agents <path>` selects an alternate agent registry. Verify the resolved repo before any writes, especially if the manifest specifies `project.repo.path`.

Do not create a new manifest just because the current branch lacks one: uh can read the project manifest from its default branch. That fallback describes the project; it does not make default-branch handoff files evidence about the requested item.

## Pick up work

For a takeover or status request, use the provided ref; omit it only to inspect the checked-out branch. Quote refs such as `"#95"` so the shell does not treat them as comments.

```text
uh pickup "<ref>" -p <target> --agent codex
uh brief -p <target> --agent codex
```

Use the actual registered agent id; omit the projection if unknown. Read the relevant normative files identified by the brief and the item's continuity records before changing work. An inspection request authorizes inspection; a continuation request also authorizes proceeding with the requested work under the project's rules.

Pickup reads GitHub through `gh` authentication and Linear through `LINEAR_API_KEY`, independently of the agent's MCP connectors. It does not change working files or trackers, but normally runs `git fetch origin` to update remote-tracking refs. Use `--no-fetch` for an offline/local inspection or when fetching is disallowed, and disclose that remote state may be stale. `--json` produces structured output.

Interpret the evidence carefully:

- Use the declared primary carrier for state; describe fallback evidence and mirror disagreements. A successful command or green CI does not establish that every tracker is complete.
- A parent key can identify multiple items, and GitHub issue and PR numbers share a namespace. Preserve Related items; resolve ambiguity from evidence or ask which item to continue before making item-specific changes.
- Keep unreadable or unavailable information under Gaps. Separate configuration and declared reach from a successful live read. Do not hide missing Linear access by assuming an MCP connection supplies the CLI's credential.
- Respect each continuity record's reported branch and source. Never attribute another branch's file to this item or imply an untracked record is available to cloud agents.
- Next transitions are candidates, not proof that gates passed or authorization to perform effects. Follow the relevant checks, path-triggered obligations, role limits, human handover points, and CI-only access routes.

When continuing, keep the target project's declared continuity records current at its required cadence. Follow its commit/push requirements and existing authorization; report any checkpoint that remains local. Do not impose this harness repo's handoff convention on every project.

## Inspect and validate setup

`uh brief -p <target>` renders the full model; add `--agent <id>` for an agent's projection. `uh validate -p <target>` checks the manifest, registry references, roles, reach, and local paths without writing.

Treat warnings and unverified facts as gaps even when validation exits successfully. `--no-paths` is appropriate for fixtures or unavailable checkouts, but skips local path and project MCP inspection; do not describe it as full local verification. `--quiet` hides informational findings, not warnings.

If the request requires changing a manifest or registry, read [references/manifest-edits.md](references/manifest-edits.md). Otherwise use the existing inputs.

## Provision agent setup

Preview with `uh provision -p <target> --show`. Inspect its resolved repo, planned files, warnings, conflicts, and manual steps. If the user requested setup or regeneration, apply the supported changes with `uh provision -p <target> --write` within that authorization. A preview or status request alone does not authorize writing.

The tool owns hashed blocks in instruction files, `.uh/brief.md`, and missing entries in project MCP configuration. Edit the source manifest or registry to change generated content. Preserve hand edits and existing MCP entries. Do not use `--force` as a routine retry; inspect the conflict and obtain authorization if resolving it requires discarding user edits. A write may apply other files even when one is blocked, so inspect actual changes after a nonzero exit.

Review `git diff` and untracked generated files, then run:

```text
uh validate -p <target>
uh provision -p <target> --check
```

Use one provisioning mode at a time: dry run, `--write`, or `--check`. User-level config changes and OAuth sign-in are reported as manual steps. Surface them with the responsible agent; do not claim the connection is live or expand a project setup request into unrelated user-level configuration changes.

Report the resolved project/item, supported state or files changed, checks performed, and actionable gaps or human steps. Distinguish generated setup from verified access.
