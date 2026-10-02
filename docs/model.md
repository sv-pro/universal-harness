# The workspace model

What a coding agent needs to know about a project to pick up work cold, expressed
as **categories**. Each category below was found as concrete instances in a real
project first (`ai2rules`, see `projects/ai2rules/project.yaml`) and generalized
only as far as those instances justify. When a second project disagrees with a
category, the category changes, not the project.

A project is described by one manifest (`project.yaml`). Agents are described once,
per user (`agents.yaml`). The harness reads both and produces each agent's setup.

---

## 1. Resource: something outside the repo that the project uses

| Instance in ai2rules | Kind | Reached via |
|---|---|---|
| `github.com/sv-pro/ai2rules` | `code-host` | `gh` CLI, GitHub MCP |
| GitHub issues **and** Linear team AI2, kept in sync by hand | `issue-tracker` ×2 | `gh`, Linear MCP |
| GitHub Actions (`ci.yml`, `release.yml`) | `ci` | `gh run` |
| Cloudflare Pages serving `ai2rules.dev` | `hosting` | dashboard, **human only** |
| Namecheap (domain), Google Search Console | `registrar`, `analytics` | dashboard, human only |
| npm `ai2rules-harness` + 4 platform packages | `package-registry` | **only through CI** (tag-gated) |
| GitHub Releases (binaries) | `artifact-release` | only through CI |
| Google Docs | `document-store` | Drive MCP |
| Reddit, Hacker News (seeding posts) | `channel` | human only |
| HN API, arXiv cs.CR, RSS | `feed` | HTTP |

**Category.** `Resource = {id, kind, provider, locator, access[]}`. `kind` is an open
vocabulary (a known list gives defaults, but any string is valid). `provider` is
deliberately separate from `kind`: the same project could move issues from Linear
to Jira without any flow changing.

**Access** is the part that matters to an agent: `{via: mcp | cli | api | ci | web,
actor: agent | human}`. Three distinctions came out of the instances:
- some resources are **human-only** (dashboards): an agent must stop and ask, not guess;
- some are **reachable only through CI** (npm publish): the agent's job is to trigger
  the pipeline correctly, never to publish directly;
- whether a given agent can reach a resource depends on **that agent's**
  connections, so access is checked per agent (see §7).

## 2. Knowledge: what the project knows about itself

| Instance | Role | Authority | Lifetime |
|---|---|---|---|
| `AGENTS.md` (+ `CLAUDE.md` = `@AGENTS.md`) | conventions | normative | permanent |
| `PLAN.md` | plan, "task source of truth" for scope | normative | permanent |
| `DECISIONS.md` (D1–D80) | decision log, append-only | normative | permanent |
| `docs/GLOSSARY.md` | vocabulary | normative | permanent |
| `docs/THESIS.md`, `docs/harness-architecture.md` | design canon | descriptive | permanent |
| `docs/FLYWHEEL.md` | **process, in prose** | normative | permanent |
| `README.md` | overview, status, test counts | descriptive, public | permanent |
| `CHANGELOG.md` | release notes | descriptive | per release |
| `blog/DEPLOY.md` | runbook | descriptive | permanent |
| `HANDOFF.md` | session handoff | ephemeral | one session |
| `_tasks/**/*.md` | work-item records | ephemeral | one item |
| Google Docs | design notes outside the repo | varies | varies |

**Category.** `Knowledge = {ref, role, authority, lifetime}` where `ref` is a repo path
or a resource locator. Authority tells an agent what wins in a conflict ("decisions
outrank code" is an ai2rules rule; it is an instance of an *authority ordering*).

**Sync obligations** are a separate category found in `AGENTS.md`: *"keep README
current on every commit"*, *"keep PLAN checkboxes in sync"*, *"an item done on one
tracker is not done until the other reflects it"*. Form: **when X changes, Y must
change in the same unit of work**. See §5 (Checks).

## 3. Work: item types, flows, state carriers

ai2rules has **several flows at once**, most of them only in prose:

| Flow | Where it is defined | States |
|---|---|---|
| Flywheel (finding → defense → content) | `docs/FLYWHEEL.md` | discovery → development → advocacy → (review pass) → done |
| Change (issue → merged code) | `AGENTS.md` conventions + branch names | open → branch → PR → merged → closed in **both** trackers |
| Release | `release.yml`, `CHANGELOG.md`, D70 | unreleased → bump PR → tag `v*` → CI publishes npm + GitHub Release |
| Blog post | `blog/`, `/review-blog`, `check:*` scripts, `DEPLOY.md` | draft → hero image → correcting review → merged → deployed → seeded → feedback |
| Decision | `DECISIONS.md` | proposed → recorded (D<n>) → reviewed/superseded |

**Category.** A **flow** is a small state machine: `states`, `transitions {from, to,
by: role, guards: checks[], effects: actions[]}`. Item types (`finding`, `change`,
`post`, `release`, `epic`, `decision`) are bound to flows. This is the Jira-like part,
specialized to dev/ops: transitions are gated by **checks that run** (tests, builds),
not by a form field.

**State carriers.** The same item's state lives in several places at once:
the `_tasks/<phase>/` folder, the Linear status, the GitHub issue/PR state, a branch,
a PLAN checkbox. Each flow declares its carriers: one **primary** (the truth) and
**mirrors** with a sync mode (`manual` everywhere in ai2rules today). Most "what's the
status of X?" explanations exist because the carriers disagree.

**Identity.** An item has one identity across carriers, made of **keys**, each a
pattern that finds it in any text: `[AI2-25 / #87]` in a PR title yields
`linear=AI2-25` and `github=#87`; `codex/ai2-10-…` yields `linear=AI2-10`. Each carrier
declares the key that locates an item in it (Linear by `linear`, issues by `github`,
PRs by `branch`, the `_tasks` folder by `slug`). `branch`, `slug` and `pr` are built in.
What reading real data showed (`uh pickup`):
- **Keys are not 1:1.** `AI2-25` is a parent spanning PRs #92–#95; `#87` is one child.
  A ref can name several items, so pickup lists candidates instead of guessing.
- **GitHub numbers are shared** between issues and PRs: `#95` is a PR whose issue is `#87`.
- **The branch prefix names the agent.** Grok Bot pushes `cursor/<slug>-<n>-<hash>`,
  so `branch_prefixes` in the registry tells who worked on an item last.
- **Carrier values need the provider's full vocabulary.** An open *draft* PR is work in
  progress, not review; the PR reader reports `draft` as its own value.

## 4. Role: a responsibility that some agent fills

From `FLYWHEEL.md`: **Radar** (Codex), **Engine** (Claude Code), **Megaphone**
(Antigravity), **Critic** (Claude Code, a pass, not a phase), plus the **Maintainer**
(human: triage, approvals, dashboards). Each role has an inbox (a flow state), a write
domain (paths it may change) and sometimes a required capability: heroes go to
Antigravity because it **generates images**, not because of who it is.

**Category.** `Role = {id, inbox: state[], writes: glob[], requires: capability[]}`,
bound to agents by **preference list**, not by identity. This is the swap point: when
Grok Bot hits its limit, the role stays, the binding moves to the next agent that has
the required capabilities and access. Since Antigravity is rarely used now, its roles
already need rebinding; the model makes that a one-line change.

## 5. Procedure and check: how work gets done and verified

| Instance | Category |
|---|---|
| `cargo build/test/fmt/clippy` recipe | procedure, enforced by CI (`ci.yml`) |
| WASM refresh after touching `harness-preview` or `compiler` | **conditional** procedure (path trigger), enforced by CI (`check-wasm-freshness`) |
| Governance benchmark after kernel/ABI changes | conditional procedure, enforced by CI (`governance-bench`) |
| `check-demos.sh` after kernel changes | conditional procedure, enforced by CI |
| Release rehearsal (`assemble-npm-packages.sh`) | procedure, enforced by CI (`release-dry-run`) |
| `/review-blog` + `correcting-reviewer` subagent | procedure with a **Claude-only entry point** |
| "Never `git add repos/`" | prohibition, **prose only** |
| "README current on every commit" | sync obligation, **prose only** |

**Category.** `Procedure = {id, steps | run, when?: path-trigger, enforced_by?:
ci-job | hook | none, entry?: {agent: command}}`. The `enforced_by` field matters to
an agent's trust: a CI-enforced rule fails loudly; a prose-only rule fails silently
(ai2rules has the scars: a WASM artifact seven weeks stale with CI green). A
procedure's agent-specific entry point (a slash command, a skill) is a **projection**
of the procedure, not the procedure itself.

## 6. Policy: what an agent may do here

ai2rules governs its own agents (`.claude/cc-world.yaml`, `.agents/agy-world.yaml`,
hooks, `.opencode/plugin`). **Category:** per-agent enforcement of a project policy.
Role write-domains (§4) are policy expressed as intent; an engine like ai2rules can
enforce them. The harness should **reference** a project's policy and wire it per
agent, not reimplement enforcement.

## 7. Agent (host): who can fill roles, and how it is configured

| Instance | Instructions entry | Extensions | Runs |
|---|---|---|---|
| Claude Code | `CLAUDE.md` → `@AGENTS.md` | hooks, subagents, commands/skills, plugins, MCP | local + cloud; desktop, CLI, VS Code, mobile |
| Codex | `AGENTS.md` | skills, rules, plugins, MCP, automations | local + cloud; desktop, CLI, VS Code |
| Antigravity / Gemini CLI | `AGENTS.md`, `.agents/rules/` | hooks (`.agents/hooks.json`), MCP | local; **image generation** |
| OpenCode | `AGENTS.md` | plugins (`.opencode/plugin`) | local |
| Grok Bot | unverified (Cursor-based) | MCP (`mcpBoxServers`), routines | cloud, local exec daemon |

**Category.** `Agent = {id, capabilities[], instructions: entry, extension points,
mcp config location, runs: local | cloud}`. Defined **once per user**, not per project.
Agent-specific quirks (agy hooks run with cwd `.agents/`; print mode ignores project
hooks) are knowledge attached to the agent, not to the project.

## 8. Continuity: how work survives a change of agent

| Instance | Level |
|---|---|
| `HANDOFF.md` on the working branch | session |
| Appending a summary to the `_tasks` file, then `mv` to the next folder | item (ownership transfer) |
| Branch naming `<agent>/<issue>-<slug>` | item identity + who had it last |
| Tracker comments / status | item, visible to cloud agents |

Found by `uh pickup` on Grok Bot's PR #95: its **PR description** is a rich item record
(summary, test matrix, known divergences), written for every push. But Grok Bot's own
"Run failed" status exists only inside Grok Bot: GitHub shows 14/14 checks green. A
record no other agent can reach is, for continuity, no record.

**Category.** A **continuity record** at three levels (session, item, project) with a
**location reachable by every agent that may take over**. A cloud agent (Grok Bot,
Codex cloud) cannot see an uncommitted local file, so the record lives on the pushed
branch or in the tracker. Today ai2rules writes the session record *at the end*;
an agent that hits a limit never reaches the end. The model makes the handoff a
**checkpoint obligation** (update after each meaningful step), i.e. a sync obligation
from §2 with a time trigger.

---

## What the harness does with the model

1. **Validate** a project manifest against the agent registry: every role has a bound
   agent with the required capabilities; every resource an agent role needs is
   reachable by that agent; every flow transition names a role and its checks exist.
2. **Brief**: render the manifest into the agent-facing instructions block
   (resources, flows, roles, procedures, continuity rules), included from `AGENTS.md`.
3. **Pick up**: given a ref (key, PR, branch, slug, or nothing = the checked-out
   branch), resolve the item's keys, read every carrier that can locate it, infer the
   flow state (primary first, mirrors as fallback, disagreements reported), list the
   next transitions with their gates, and attach the branch, PR, checks and continuity
   records. Read-only. Provider code (git, GitHub via `gh`, Linear via its API, files)
   lives in `src/providers/`; the core knows only carriers, flows and keys.
4. **Provision**: write into the project's repo what every agent reads.
   - `AGENTS.md` gets a compact **workspace and handoff** block (how to pick up, which
     records to keep current, how to name things, where state is kept by hand, when to
     stop and ask, role bindings). Compact because the file is shared with the
     project's own conventions and Codex reads only its first 32 KiB (ai2rules'
     `AGENTS.md` is already 19 KB); the full brief goes to `.uh/brief.md`.
   - An agent with an entry file of its own (Claude Code: `CLAUDE.md`) gets its
     **projection**: its roles, the resources it cannot reach, its entry points.
   - MCP servers each agent needs for its roles go into the agent's **project-scoped
     config** when it has one (`.mcp.json`); otherwise (Codex `config.toml`, Grok Bot
     settings) they become **manual steps**, because those files are user-level.
   - The harness owns only marked blocks and its own files, each with a content hash:
     a hand edit is detected and refused, an existing MCP entry is never changed.

   Connections (MCP endpoints) are a per-user catalog in `registry/agents.yaml`, next
   to the agents: the manifest names a connection (`tool: linear`), the catalog says
   how to reach it, the registry says where each agent keeps it.

## Open points (to be settled by a second project, not by guessing)

- Are flows per project, or a shared library with per-project overrides? ai2rules
  alone cannot tell; its flows look generic (change, release) and specific (flywheel).
- Do mirrors ever sync automatically, or is "manual + check" enough?
- Is a role ever filled by two agents concurrently (parallel engines)?
