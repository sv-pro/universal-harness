# Harness engineering: what is worth adopting

**Status:** reference and backlog source, not a model change. **Date:** 2026-11-08.
Each practice below says what it is, how good the evidence for it is, whether the
maintainer's projects already do it, and the task it would become. Nothing here is
adopted until a task for it is opened and done.

"Harness engineering" currently means two things. One is building an agent runtime: the
loop, the tools, the session and the evaluator. The maintainer's program for that is the
Claude Doc "Harness Engineering: программа" (2026-10-24), and it is not repeated here.
The other, which this note covers, is shaping the **repository and environment a coding
agent works in**, so that Claude Code, Codex and others produce reliable work in it. That
is the layer universal-harness owns.

The working definition, from Birgitta Böckeler (martinfowler.com, April 2026): a harness
is **guides**, which steer the agent before it acts (instruction files, skills, docs), and
**sensors**, which check what it did afterwards (linters, tests, reviews). Most teams
over-invest in guides and under-invest in sensors.

## How this list was filtered

Most "ultimate guides" recycle three primary sources: OpenAI's "Harness engineering"
(February 2026), Anthropic's posts on long-running harnesses (November 2025 and March 2026),
and Böckeler's articles. Two empirical studies now test some of their claims (ETH Zurich
on `AGENTS.md`; arXiv 2609.20804 on harness components). A practice is listed only if a
primary source states it and it applies to a repository the maintainer controls.
Leaderboard numbers quoted second-hand (Terminal-Bench "top 30 to top 5" and the like) are
left out. Evidence is graded:

- **strong**: measured in a controlled comparison;
- **medium**: one team's reported experience, with numbers;
- **weak**: argued, not measured.

## Summary

| # | Practice | Kind | Evidence | Status here | Priority |
|---|---|---|---|---|---|
| 1 | `AGENTS.md` is a map, not an encyclopedia | guide | strong | **not done**: the kernel's is 455 lines, all loaded every session | **1** |
| 2 | Never ship an unedited generated instruction file | guide | strong | done (hand-written) | — |
| 3 | The repository is the system of record | guide | medium | done (`DECISIONS.md`, `PLAN.md`, `docs/`) | — |
| 4 | Load rules on demand: skills, path-scoped files | guide | medium | partial (one skill) | 4 |
| 5 | Rules are enforced mechanically, and the messages teach the fix | sensor | medium | done for CI; messages not written for agents | 5 |
| 6 | Back-pressure: "done" is a predicate the agent cannot skip | sensor | medium | done in missionbound-dev; **not in the kernel** | **2** |
| 7 | The agent cannot edit its own harness | sensor | weak (but obvious) | done (D92 roots) | — |
| 8 | A separate, skeptical evaluator, with "done" agreed up front | sensor | medium | partial (correcting-reviewer, cross-review) | 3 |
| 9 | Behavioural sensors: run the thing as a user would | sensor | medium | partial (`check-demos.sh`) | — |
| 10 | Durable progress outside the context: task list with pass flags, progress log, init script | session | medium | partial (`HANDOFF.md`, `_tasks/`, `uh pickup`) | 6 |
| 11 | Plans are versioned artifacts, re-read each turn | session | strong (narrowly) | partial (`PLAN.md`, `_tasks/`) | — |
| 12 | Garbage collection: scheduled agents fight drift | maintenance | medium | partial (Radar, Pulse); **no drift gardener** | **2** |
| 13 | Every harness change records the failure that caused it | maintenance | medium | partial (findings, D-entries) | 7 |
| 14 | Re-test each component as models change (ablation) | maintenance | medium | not done | 8 |
| 15 | Measure the harness on a fixed task set, with model and date | measurement | strong (as method) | done for governance (govbench), not for the harness | 3 |
| 16 | Constrain the action space where it matters, not everywhere | action space | strong | done (scoped capabilities, "No shell") | — |
| 17 | One source of instructions for every agent, with role write scopes | multi-agent | weak | done (this repository) | see AI2-224 |

The rest of the note explains each row. The priorities are the maintainer's to change.

## Guides: before the agent acts

### 1. `AGENTS.md` is a map, not an encyclopedia

**What.** A short file, about a hundred lines, that says where things are and points to
deeper documents. Detail lives in `docs/` and is read when a task needs it.

**Evidence: strong.** OpenAI tried one large `AGENTS.md`, found it could not be checked
mechanically and drifted, and replaced it with a roughly 100-line index. The ETH Zurich
study (Gloaguen et al., ICLR 2026 workshop) measured context files across several agents.
They did not raise task success on average, cost over 20% more inference, and "overview"
sections did not help agents find relevant files. Developer-written files did a little
better (about +4%). A REAP study found that context files help weak harnesses and add
noise to strong ones.

**Status here: not done.** The kernel's `AGENTS.md` is 455 lines. `CLAUDE.md` imports it
whole, so every Claude Code session pays for test counts, the crate map, CI tiers and
Antigravity quirks, whatever the task. This repository's own `AGENTS.md` (79 lines) is
already close to the target.

**Task.** Cut the kernel's `AGENTS.md` to a map of about 100 lines: invariants, where
things are, how to check, and links. Move the rest to `docs/` or to path-scoped files
(item 4). Then measure it (item 15): the same ten real tasks, before and after.

### 2. Never ship an unedited generated instruction file

**What.** `/init`-style generated files restate what the agent can see for itself.

**Evidence: strong.** ETH Zurich found LLM-generated context files did worse than none in
some settings.

**Status here: done.** Instruction files are hand-written, and the `uh` blocks are
generated from a hand-written manifest, which is a different thing. Keep it that way for
new projects: a template (AI2-224) must not ship a generated `AGENTS.md` body.

### 3. The repository is the system of record

**What.** Knowledge an agent needs lives in versioned files in the repository: decisions,
plans, architecture, quality notes. Chat logs, wikis and people's heads do not count.

**Evidence: medium.** OpenAI reports this as a key decision of an agent-written codebase
of about a million lines over five months.

**Status here: done.** `DECISIONS.md` (D1–D114), `PLAN.md`, `docs/`, `_tasks/`. Linear
holds state by design, and the `uh` brief says where each thing is authoritative.

### 4. Load rules on demand

**What.** Rules that apply to one area are loaded only when the agent touches that area:
skills, path-scoped rule files, subdirectory `AGENTS.md`.

**Evidence: medium.** Thoughtworks and HumanLayer recommend it for keeping the context
small. It is the mechanism that makes item 1 possible without losing anything.

**Status here: partial.** The kernel has one skill (`/review-blog`) and the blog has its
own section in the root file. `design/` here has its own `AGENTS.md`, which is the pattern.

**Task.** Pair it with item 1: move host-specific sections (Antigravity, Claude Code
dogfooding, WASM rebuild, benchmark regeneration) into files next to the code they
govern, or into skills.

## Sensors: after the agent acts

### 5. Enforce rules mechanically, with messages that teach the fix

**What.** A rule that matters is a linter, a structural test or a CI gate, not a sentence
in a prompt. Its failure message says what to do, because the agent reads it.

**Evidence: medium.** OpenAI encoded "golden principles" as custom lints whose error text
contains the remediation. Böckeler's sensor articles start from static analysis.

**Status here: done for CI.** clippy with `-D warnings`, the WASM freshness check,
`check-demos.sh`, the governance-bench drift check and `committed_worlds.rs` all pin rules
that once broke. What is missing is the second half: most messages are written for a
person who already knows the history.

**Task (small).** Audit the kernel's custom checks for one thing: does each failure name
the command that fixes it? `check-wasm-freshness.mjs` and `check-demos.sh` first.

### 6. Back-pressure: "done" is a predicate the agent cannot skip

**What.** The agent may not finish while required checks fail. In Claude Code that is a
`Stop` hook that runs the fast checks and feeds failures back, with a cap on retries.

**Evidence: medium.** HumanLayer's main example is an agent that kept declaring broken
code finished until a typecheck was wired into the loop. arXiv 2605.18747 argues that
termination should depend on required checks, not on the model's confidence.

**Status here: split.** missionbound-dev does exactly this (`mission hook stop`, bounded by
`limits.stop_blocks`). The kernel does not: its hooks are `PreToolUse` and `SubagentStop`.
"Run fmt, clippy and tests before committing" is a sentence in `AGENTS.md`, and CI is
manual on branches (D109). So an agent can stop with a red build and nobody finds out
until later.

**Task.** A `Stop` hook in the kernel that runs `cargo fmt --check` and clippy on the
changed crates, plus their tests when the change touches code, with a retry limit. Reuse
missionbound-dev's implementation rather than writing a new one.

### 7. The agent cannot edit its own harness

**What.** Hooks, lint configs, CI files and mission files are outside the agent's write
scope, or the agent can switch the sensors off.

**Status here: done.** The kernel's starter `roots` make `.claude/` and `.agents/`
read-only (D92). missionbound-dev always protects `mission.yaml`, `.mission/` and
`.claude/`. Extend the same rule to lint configs and `.github/workflows/` when the next
world is written.

### 8. A separate, skeptical evaluator, with "done" agreed up front

**What.** The agent that wrote the work does not grade it. A second agent, tuned to be
skeptical, checks it against criteria agreed before the work started (Anthropic calls
this a "sprint contract").

**Evidence: medium.** Anthropic's March 2026 post found that tuning a separate evaluator
to be skeptical was much easier than making the generator judge itself honestly.
Generators skew positive about their own work.

**Status here: partial.** The kernel has the `correcting-reviewer` subagent and the
critic role. missionbound-codex is used for cross-review between vendors. What is
missing is the contract: reviews start from the diff, not from criteria written before
the code.

**Task.** For every engine task, write its acceptance criteria into the `_tasks/` file
before coding (the "Done when" sections in Linear are close already). Have the reviewer
check against that list first and the diff second.

### 9. Behavioural sensors: run the thing as a user would

**What.** Besides tests, a sensor that exercises the real product: a browser driver, a
CLI run against fixtures, a demo whose output is asserted.

**Evidence: medium.** OpenAI wired Chrome DevTools into the agent runtime so Codex could
reproduce and verify UI bugs. Anthropic's evaluator drove the app with Playwright.

**Status here: partial, and good where it exists.** `check-demos.sh` asserts the verdict
lines each demo claims. The console and app-console UIs have no behavioural sensor.

**Task (later).** A Playwright smoke run for `harness console`, when UI work resumes.

## Session: work that outlives one context

### 10. Durable progress outside the context

**What.** A long task keeps its state in files: a task list with a pass flag per item, a
progress log, a script that brings the environment up, and a commit per step. Each new
session reads them first.

**Evidence: medium.** Anthropic's November 2025 post: an initializer agent writes
`init.sh`, a progress file and a feature list, and each later session takes the next
unfinished feature. They report that JSON was less likely than Markdown to be rewritten by
the model.

**Status here: partial, in its own shape.** `HANDOFF.md`, the `_tasks/` files, Linear and
`uh pickup` cover the progress log and who did what. Missing: a machine-checkable list of
acceptance items with pass flags, so "how far along is this" is computed, not read.

**Task (fits uh).** Let a task file carry an acceptance list that `uh pickup` reports as
"3 of 5 checks passing". This is model work for this repository, so it needs the instance
that forces it (`AGENTS.md`, "Instance first").

### 11. Plans are versioned artifacts, re-read each turn

**What.** The plan is a file the agent keeps up to date and reads fresh, not something
buried in the conversation.

**Evidence: strong, but narrow.** arXiv 2609.20804 (176 matched settings) found that
planning changes where runs stop more than how well they do. Context management matters
more under tight budgets: at a 32k budget, unmanaged agents overflowed in 79% of tasks.

**Status here: partial.** `PLAN.md` at epic level and `_tasks/` at task level. Nothing to
add until a task shows a lost plan.

## Maintenance: harnesses decay

### 12. Garbage collection: scheduled agents fight drift

**What.** Background jobs look for stale docs, broken links, dead code and violated
constraints, and open small fix-up PRs.

**Evidence: medium.** OpenAI found a weekly manual cleanup of agent output (about 20% of
the week) did not scale, and replaced it with background agents. Böckeler names garbage
collection as one of three harness parts.

**Status here: partial.** Radar and Pulse run on a schedule, but they look outward (new
threats, project state), not at the repository's own drift. The kernel's `AGENTS.md`
says "keep README current on every commit" and test counts are updated by hand, which is
the kind of rule that drifts. The kernel's CI does not run `uh provision --check`, so a
stale generated block is found only by hand.

**Task.** (a) Add `uh provision --check` to the kernel's CI. (b) A scheduled gardener
that checks the counts and links stated in `README.md` and `AGENTS.md` against the code,
and opens one small PR when they differ.

### 13. Every harness change records the failure that caused it

**What.** A rule in the harness carries its reason: the failure it prevents. A change to
the harness records evidence, root cause and expected effect, so the rule can be removed
when the reason is gone.

**Evidence: medium.** The AHE paper (arXiv 2604.25850) evolved a harness through such a
change manifest. Ten iterations raised Terminal-Bench 2 pass@1 from 69.7% to 77.0%. The
gains came from tools, middleware and memory, not from the system prompt. Its authors
note that predicted regressions were mostly missed. Thoughtworks recommends tying each
rule to a concrete failure.

**Status here: partial.** The kernel already writes "this exists because finding #18 ..."
next to several rules, and D-entries record alternatives. Instruction-file edits do not
carry this.

**Task (cheap).** A convention: each rule in an `AGENTS.md` that is not self-evident links
the finding, decision or incident behind it. Rules with no reason are the first
candidates for item 14.

### 14. Re-test each component as models change

**What.** A harness is a hypothesis about what the model cannot do yet. When the model
improves, some components become dead weight and should go.

**Evidence: medium.** Anthropic reports that context resets became unnecessary as models
improved (Managed Agents post, April 2026).

**Status here: not done.** Stage 8 of the October program ("ablation") covers it for a
runtime. For instruction files it is easy: drop a section, rerun the task set from
item 15, keep the section only if a number moves.

## Measurement

### 15. Measure the harness on a fixed task set

**What.** Ten to thirty real tasks with an objective oracle (tests pass or not), run with
a fixed model and version, recording success, tokens, cost and time. Every harness change
is judged on the same set.

**Evidence: strong as a method.** This is how every result above was obtained. Without it,
"this AGENTS.md helps" is an opinion.

**Status here: done for governance, not for the harness.** govbench measures the kernel's
security claims. agent-harness has one hard task and branches per model. Nothing measures
whether the kernel's instruction files help an agent work in the kernel.

**Task.** Ten closed kernel issues with their tests as oracle. Replay each from its parent
commit with the current harness, then with the trimmed one from item 1. Record model and
date. This is the smallest experiment that turns items 1, 4 and 14 into numbers.

## Action space and multi-agent work

### 16. Constrain the action space where it matters, not everywhere

**What.** Typed verbs for consequential actions, a plain shell for the rest.

**Evidence: strong.** arXiv 2609.20804 found bash-native agents cheaper on Terminal-Bench,
because Unix pipes chain steps, and less prone to re-patching the same file. Typed tools
pay off where an action is irreversible or reaches outside.

**Status here: done, and it is the product.** Scoped capabilities, `command_classes`,
the "No shell" profile and the fixed-verb upstream (AI2-189). The study is a useful
counterweight: do not take the shell away from a coding agent in its own repository unless
a world needs it.

### 17. One source of instructions for every agent

**What.** One file every agent reads, with thin per-agent pointers, and roles with
explicit write scopes.

**Status here: done.** That is what universal-harness provisions. The open part is
inheritance across projects, tracked in AI2-224.

## What to skip

- **Giant prompt and rule libraries.** They are the opposite of item 1, and the measured
  effect of instruction files is small at best.
- **Generated `AGENTS.md` bodies** (item 2).
- **Multi-agent swarms without an evaluator.** More agents producing more unverified work
  is not a harness.
- **Leaderboard numbers from guides.** Most come from vendors or second-hand retellings.
  Trust a number only from the source that ran the experiment.

## The first three tasks

If only three things happen:

1. **Trim the kernel's `AGENTS.md` to a map, and measure it.** Items 1, 4 and 15 together.
   This is the largest measured effect available, and it costs a day.
2. **Back-pressure and drift checks for the kernel.** A `Stop` hook (item 6) and
   `uh provision --check` in CI (item 12a). Both reuse code that already exists.
3. **"Done" agreed before the work.** Acceptance items written into the task before coding,
   and the reviewer checks those first (item 8).

## Sources

Primary:

- OpenAI, "Harness engineering: leveraging Codex in an agent-first world", 2026-02-11:
  <https://openai.com/index/harness-engineering/>
- Birgitta Böckeler, "Harness Engineering - first thoughts" (memo) and "Harness Engineering
  for Coding Agent Users" (2026-04-02), martinfowler.com:
  <https://martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html>,
  <https://martinfowler.com/tags/2026.html>
- Anthropic, "Effective harnesses for long-running agents":
  <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>
- Anthropic, "Harness design for long-running application development", March 2026:
  <https://www.anthropic.com/engineering/harness-design-long-running-apps>
- Anthropic, "Scaling Managed Agents: Decoupling the brain from the hands", April 2026:
  <https://www.anthropic.com/engineering/managed-agents>
- HumanLayer, "Skill Issue: Harness Engineering for Coding Agents", 2026-03-12:
  <https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents>
- Thoughtworks, "Engineering the harness: a practical pattern for reliable coding agents":
  <https://www.thoughtworks.com/en-us/insights/blog/architecture/engineering-the-harness-a-practical-pattern-for-reliable-coding-agents>

Empirical:

- Gloaguen, Mündler, Müller, Raychev, Vechev, "Evaluating AGENTS.md: Are Repository-Level
  Context Files Helpful for Coding Agents?", ETH Zurich, ICLR 2026 workshop:
  <https://www.sri.inf.ethz.ch/publications/gloaguen2026agentsmd>
- "An Empirical Study of Harness Design for Coding Agents", arXiv 2609.20804, September 2026:
  <https://arxiv.org/abs/2609.20804>
- "Agentic Harness Engineering: Observability-Driven Automatic Evolution of Coding-Agent
  Harnesses", arXiv 2604.25850: <https://arxiv.org/abs/2604.25850>
- "Code as Agent Harness", arXiv 2605.18747: <https://arxiv.org/abs/2605.18747>
- "REAP: Automatic Curation of Coding Agent Benchmarks from Interactive Production Usage",
  arXiv 2604.01527: <https://arxiv.org/abs/2604.01527>

Caveat: this note was written from the sources' abstracts, their own summaries and
secondary write-ups. The environment that produced it could not open most of the pages
directly. Before a task relies on a specific number, check it in the source.
