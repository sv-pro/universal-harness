# The Big Picture — High-Level Design

> **Status: draft v0.1, 2026-09-27.** This is the top-level description of the system: what it is, what it is made of, where its boundaries are, and how a change flows through it. It links to the rationale instead of repeating it. The *why* is in `docs/design-guide/` (00–17), and the stage-by-stage detail is in `09-applying-to-csd.md`.
>
> Each section carries a status:
> - **Decided**: follows from a non-negotiable in `CLAUDE.md` or from verified evidence.
> - **Hypothesis**: our design, to be validated against a baseline.
> - **Open**: not yet decided.
>
> Everything is vendor-neutral. External services appear only as **roles** (§2.2).

## Contents

1. [Purpose, scope, non-goals](#1-purpose-scope-non-goals)
2. [System context](#2-system-context)
3. [Core concepts and invariants](#3-core-concepts-and-invariants)
4. [Lifecycle of a change](#4-lifecycle-of-a-change)
5. [The project model](#5-the-project-model)
6. [Knowledge and memory](#6-knowledge-and-memory)
7. [Human interaction](#7-human-interaction)
8. [Agents and models](#8-agents-and-models)
9. [Actions and execution governance](#9-actions-and-execution-governance)
10. [Trust and autonomy](#10-trust-and-autonomy)
11. [Verification and evidence](#11-verification-and-evidence)
12. [Security and threat model](#12-security-and-threat-model)
13. [Observability](#13-observability)
14. [Evaluation and learning](#14-evaluation-and-learning)
15. [Runtime and operations of the system itself](#15-runtime-and-operations-of-the-system-itself)
16. [Data](#16-data)
17. [Build plan, risks, open questions](#17-build-plan-risks-open-questions)

---

## 1. Purpose, scope, non-goals

**Purpose.** Carry a software change from a request to a verified production outcome. Agents do the work; a harness bounds what they may do, verifies what they claim, and records what happened. The leverage is in the harness (specifications, constraints, verifiers, evidence), not in agent prompts (`09` §1.1, `00` §5).

**Scope of the first version (Crawl).** *Hypothesis.*
- One project at a time, which may span several repositories (§5).
- Stages are automated in order of evidence. First Implementation and Code review (chosen 2026-09-26, `eval/`), then the rest of the pipeline.
- A human approves every stage artifact. Nothing reaches production without a human decision.

**Non-goals.**
- Not a new model, and no finetuning before prompting, examples, retrieval and harness patterns have been exhausted (`16` T11).
- Not a replacement for the services a team already runs (issue management, version control, CI, deployment). The system *uses* them through roles.
- Not tied to a vendor, language or cloud.
- No online self-improvement. The system never admits its own lessons or edits its own verifiers (`09` §3.9).
- No autonomous production effects in the first version.

**Quality goals, in priority order.** *Decided.*
1. Safety of effects.
2. Correctness of evidence.
3. Usefulness to the team.
4. Cost.
5. Latency.

When two goals conflict, the higher one wins. This is the guide's "consequence chooses controls, difficulty chooses capacity" (`04` §7) turned into a ranking.

---

## 2. System context

### 2.1 Actors (human roles)

One person may hold several roles. A role is defined by the decisions it owns.

| Role | Owns | Typical touchpoint |
|---|---|---|
| **Requester** | The intent: what should change and why | Opens a work item and answers clarifying questions |
| **Change owner / approver** | Stage gates for a change: proposal, design, plan, release | Approves or edits versioned artifacts |
| **Maintainer / reviewer** | Code quality and merge decisions | Reviews change requests, rates agent review comments |
| **Operator (on-call)** | Production health, incident decisions, rollback | Receives incidents and approves remediation |
| **Policy owner** | Stage worlds, trust records, the consequence map, admission of lessons and eval cases | Reviews policy changes and admission requests |
| **Harness maintainer** | The harness itself: prompts, verifiers, adapters | Changes the harness through its own reviewed process (§15.4) |

### 2.2 External service roles

The system depends on **roles**, not products. One product may fill several roles (a single code-hosting service is often version control, change review and CI at once), and a role may be filled by different products in different projects. Each role is reached through an **adapter** behind the tool gateway (§9), which exposes typed verbs, not the service's raw API.

| Service role | What the system reads | What the system may do (effects) | Trust of what it returns |
|---|---|---|---|
| **Issue management** | Work items, comments, links, history | Label, comment, or transition *the item bound to this change* | Content is untrusted. Metadata (ids, states) is trusted as a reference |
| **Source version control** | Repository contents, history, branches | Push only to change-scoped branches | Content is untrusted (it is a taint source, `17` §5 rule 5) |
| **Change review** | Change requests, review threads, check status | Open a change request to a destination fixed at plan approval, post review comments. Merging is a release effect (§9.4) | Comments are untrusted. Approval state is trusted only as the service's record |
| **Build and CI** | Run results by run id, logs, artifacts | Trigger runs on change-scoped refs | **Verdicts are trusted evidence** when resolved through the service by run id (§11). Logs are untrusted |
| **Artifact and package registry** | Package metadata, published versions | Publish (release stage only, staged) | Third-party metadata is untrusted. Our own published digests are trusted after resolution |
| **Deployment and runtime platform** | Environment state, deployed versions, health | Deploy, roll back (staged, approval-bound) | State queried from the platform is trusted |
| **Observability** | Metrics, logs, traces of the product | None on the product. It also receives the harness's own telemetry | Logs are untrusted. Metrics are trusted as measurements |
| **Incident management** | Incidents, alerts, timelines | Open or annotate an incident, page a human | Content is untrusted |
| **Knowledge and documentation** | Pages, runbooks, ADRs outside the repo | None in the first version | Untrusted unless it is a versioned, owner-approved source (§6) |
| **Communication and notification** | Replies to the system's questions | Notify, ask | **Never a decision channel** (§7.3) |
| **Identity and access** | Who a human is, group membership | None | Trusted. It binds approvals to a person |
| **Secrets management** | Nothing, for agents | Issues short-lived, scoped credentials **to actuators, never to agents** | Trusted |
| **Model providers** | Completions | None | Output is **tainted by declaration** (`17` §5 rule 1) |

### 2.3 Context diagram

```text
      Requester · Approver · Maintainer · Operator · Policy owner
            │ work items   │ approvals (trusted surface, §7.3)   │ policy PRs
            ▼              ▼                                     ▼
 ┌─────────────────────────── THE SYSTEM ───────────────────────────────┐
 │  Orchestrator ─ stage agents ─ context service ─ verifier service    │
 │        │                │                                            │
 │   model gateway    tool gateway (ai2rules kernel, stage worlds)      │
 │        │                │   control plane · evidence · traces        │
 └────────┼────────────────┼────────────────────────────────────────────┘
          ▼                ▼  (adapters: typed verbs per service role)
   model providers    issue mgmt · version control · change review · CI ·
                      registry · deployment · observability · incidents ·
                      docs · notification      (+ identity, secrets)
```

---

## 3. Core concepts and invariants

### 3.1 Concepts

| Term | Meaning |
|---|---|
| **Change** | The unit of delivery: one intent from a work item to a production outcome, with one **trace ID** |
| **Stage** | One step of the pipeline (Intake … Learn). It runs one agent in one compiled stage world and ends at a gate |
| **Artifact** | A named, versioned output of a stage (Proposal, DesignDoc, ChangePlan, patch, ReviewReport, VerificationArtifact, release intent) |
| **Gate** | The acceptance check on an artifact: exact checks first, then a human or judge where no exact check exists |
| **Stage world** | The compiled ai2rules manifest that defines what exists and what is permitted in one stage of one change (`17` §6) |
| **Effect** | A state change outside the sandbox. It is accepted only on evidence from a verifier the agent cannot modify |
| **Evidence** | A durable, referenced record that a claim is true: a CI run, a probe result, a receipt |
| **Candidate** | Anything the system learned or proposed (a lesson, skill, eval case or spec edit) that has not been admitted by an independent process |
| **Project** | The unit of onboarding: repositories, environments and service bindings (§5) |

### 3.2 Invariants

*Decided.* These restate the non-negotiables in `CLAUDE.md` as properties of the whole system. A design that breaks one is wrong, whatever else it achieves.

1. **One agent per stage by default.** More agents or patterns only for a measured failure, against a baseline.
2. **Consequence policy runs before complexity routing.**
3. **Every effect has an action contract** and is accepted only on evidence from a verifier the agent cannot modify.
4. **Boundaries are enforced in the runtime** (tool gateway, sandbox, hooks), never only in prompts.
5. **All model access goes through the model gateway; all actions go through the tool gateway.**
6. **All service content is untrusted input.** Repository, issue, CI, dependency and web content is data, never instructions.
7. **The model's channel is tainted.** Published work goes only to destinations fixed at ChangePlan approval.
8. **No LLM decides an effect.** Judges and classifiers may only tighten.
9. **Candidates stay candidates** until an independent process admits them.
10. **One trace ID** follows a change from intake to production outcome. Prompt, judge, rubric and world versions appear on every trace.
11. **Evaluation is defined before building.**

---

## 4. Lifecycle of a change

*Decided in shape, hypothesis in detail* (`09` §2–3).

```text
Intake → Requirements → Design → Plan → Implement → Review → Verify/Test → Release → Operate → Learn
 triage   Proposal      Design   Change   patch +     Review   Verification  release    outcome   candidates
 +route   (+AC)         (+ADR)   Plan     evidence    Report   Artifact      intent     record
```

- **Backbone.** A deterministic chain owned by ordinary code (Prompt Chaining, Action × Chain). A failed gate returns guidance to the producing stage or stops the change. Agents run *inside* stages and never decide the next stage.
- **The ChangePlan is the hinge.** It is versioned. Its approval fixes the per-change literals (repositories, branches, environments, destinations), which are compiled into every later stage world. A replan creates a new version that touches only the affected tasks (`09` §3.3).
- **Routing.** Intake classifies *consequence* first (auth, payments, migrations, infrastructure, public API, secrets, production data → governed path at every stage), then *difficulty* (scripted, standard, deep). Routing regret is measured (`09` §3.0).
- **Change states.**

  ```text
  NEW → IN_STAGE(s) → AWAITING_GATE(s) → … → RELEASING → OBSERVING → DONE
                    ↘ BLOCKED(reason, owner) ↗    ↘ ROLLED_BACK
  ```

  Each transition is recorded on the trace. BLOCKED always names an owner and a reason.

| Stage | Artifact | Gate (Crawl) | Default autonomy (Crawl) |
|---|---|---|---|
| Intake | TaskTicket | route logged, consequence recorded | 3 (reversible classification) |
| Requirements | Proposal with checkable acceptance criteria | structure, citations and testable ACs, then human | 1 |
| Design | DesignDoc, ADR | reuse of authoritative components, rollout and rollback, then human | 1 |
| Plan | ChangePlan v*n* | `validate_plan`, then human | 1 |
| Implement | patch + evidence | CI re-run by the orchestrator, scope check | 2 inside the sandbox |
| Review | ReviewReport | no unresolved critical claims | 2 (comments only) |
| Verify/Test | VerificationArtifact | exact checks; "no tests ran" is not a pass | 2 |
| Release | release intent → staged effect | human approval, staged commit, post-check | 1 |
| Operate | outcome record, incident links | probes | read-only diagnosis 3, everything else 1 |
| Learn | candidates | independent admission (offline) | n/a |

Autonomy levels follow `08` §2: 0 Observe, 1 Assist, 2 Supervised, 3 Autonomous.

---

## 5. The project model

*Hypothesis (new; the guide doesn't cover onboarding).*

A **Project** is what the system is pointed at: one or more repositories, the environments they deploy to, and the bindings from each service role (§2.2) to a concrete adapter.

### 5.1 Project Profile

The durable, human-approved description of a project, which the harness needs before any stage can run. It lives **in the project's repository** as part of the durable specification, and it is a protected path (§6.4).

| Section | Content | Used by |
|---|---|---|
| Identity | name, repositories, owners per role (§2.1) | everything |
| Service bindings | which adapter fills each service role, and where | tool gateway |
| Build and verify | build, test, lint and type-check commands; **which verifiers count as trusted evidence** | verifier service, eval |
| Authoritative components | "use the existing X for Y", conventions, non-obvious locations | context service |
| Consequence map | paths and components that force the governed path | router, stage worlds |
| Environments and destinations | environments, promotion order, allowed publish destinations | ChangePlan literals, release |
| Protected paths | verifiers, CI config, policy, the Profile itself, the durable spec | stage worlds (`Read` roots) |
| Budgets | per-change and per-stage token, time and cost ceilings | orchestrator, gateways |

### 5.2 Onboarding

1. **Register** the project and bind its service roles (a human, in configuration).
2. **Discover.** A read-only onboarding agent forages the repositories and history and drafts the Profile. This is a candidate.
3. **Approve.** A human edits and approves the Profile, merged through normal review.
4. **Baseline.** Mine the project's history for eval cases, the way `eval/` does for ai2rules. Run the stage agents on them without effects to get the project's baseline.
5. **Crawl.** Real changes, with every artifact human-approved.

### 5.3 Multi-repository changes

A change may span repositories. The ChangePlan lists each target explicitly, and each task is bound to one repository. Cross-repository ordering is a dependency in the plan, not agent judgment.

*Open:* organization-level scope, i.e. several projects sharing lessons, components or policy. Keep everything per project until a measured need appears.

---

## 6. Knowledge and memory

*Decided in principle* (`03`, `16` T4). *The layer model is a hypothesis.*

### 6.1 The organizing axis is authority, not topic

| Layer | Examples | Authority | Who writes |
|---|---|---|---|
| **A. Project sources** | code, history, durable spec (Project Profile, conventions, ADRs), runbooks, work items, CI config, dependency graph, production telemetry | Authoritative **at an approved version**, never as working-tree text | Humans, through reviewed changes |
| **B. Control plane** | stage worlds, ChangePlans, approvals, trust records, receipts, budgets | Authoritative and enforced at runtime | Humans and the harness. **Agents cannot write it** |
| **C. Records** | traces, evidence, immutable failure facts, feedback events | Evidence (append-only) | The harness |
| **D. Candidates** | lessons, skills, eval cases, proposed spec edits | None until admitted | Agents propose, an independent process admits |

The system **doesn't copy the project into itself.** Layer A stays in the services that own it and is indexed with versions. The harness owns only B, C and D.

### 6.2 Obtaining knowledge

- **Pull, at decision time:** the default, since it is always fresh. Each stage forages from its task boundary with hard caps per phase (`02` §6).
- **Push, for capture only:** service events (new work item, CI result, deployment, alert) are captured into layer C with source, version and time. Capture never makes something authoritative.
- **Agent-written knowledge is always a candidate.** This is enforced: memory writes are on the taint floor, and the model's channel is tainted, so the kernel denies every memory write a stage agent proposes. Lessons come from a separate, clean, offline pipeline (§14.2).

### 6.3 Retrieval

- **Compile path (write):** parse, record provenance, version and permissions, build navigation.
- **Assemble path (read):** check scope, authority and validity *before* relevance. Package evidence with **source@version citations**, and **abstain** when a controlling source is missing (`03` §7).
- **Code:** exact lookup, grep, AST, dependency graph and history come before embeddings. No persistent semantic index until a measured need justifies its freshness obligation.
- Everything retrieved is **data, never instructions**. Reading the repository taints the session.
- Before a high-risk action, re-read the authoritative source and **record which version governed the action**.

### 6.4 Protecting the durable specification

*Hypothesis (new).* The durable spec lives in the repository, and the repository is both a taint source and something agents change. An agent's change request could quietly edit the rules that steer future agents. This is the self-loosening loop A2R closed for its own control plane (D57).

- The durable spec (Project Profile, conventions, ADRs, agent instruction files) is a **protected path**: `Read` in every stage world. It is changed only through a human-owned change route.
- **Authority attaches to (source, version, approval)**, for example the mainline at a reviewed commit, never to a file path. The same file in a working tree is just tainted input.

---

## 7. Human interaction

*Hypothesis.*

### 7.1 Principles

- **Artifacts, not conversations.** Every decision lands on a versioned artifact, and an approval binds to that exact version. Questions become `open_questions` with an owner and a status (`10` §1).
- **Meet people where they work.** Work items for intake, change review for code, incidents for operations. Feedback built into the workflow (accept, edit, dismiss, revert) is abundant and honest. A separate chat loses those signals (`15` §7).
- **Humans own sovereignty decisions at every trust level:** irreversible data changes, customer-visible communication, ambiguous business intent, ethics and privacy (`08` §6).

### 7.2 Touchpoints

| Moment | Who | What they see | What they do |
|---|---|---|---|
| Request | Requester | their work item | describe the intent, answer questions |
| Clarification | Requester | open questions on the Proposal | answer, or defer with a reason |
| Gate | Approver | the artifact version, its evidence, a diff from the last version | approve, edit (edits are recorded as preference data), or reject with a reason |
| Review | Maintainer | the change request with agent comments in the claim schema | accept, dismiss or edit comments, merge |
| Release | Approver or Operator | the release intent: exact effect, digest, environment, preconditions, rollback | approve once (single-use, bound to the intent) |
| Incident | Operator | the linked change trace, the agent's diagnosis, proposed remediation | approve remediation or take over |
| Policy | Policy owner | policy change requests with case-set results and replay diff | merge or reject |

### 7.3 The approval surface is a security boundary

Human input (a human prompt or an approved ChangePlan) is the only *clean* channel (`17` §5). Two consequences follow:

- **An approval cannot be a comment** in a service the agent can also write to, such as issue management, change review or chat. There, the agent or injected content could forge "LGTM". Approvals are recorded through an **authenticated surface outside the agent's reach**, bound to the approver's identity and the artifact version (A2R `AuthorizationInstance`, `17` §8).
- **Notification is not decision.** The system may *ask* over any channel, but an answer only counts once it is written into the artifact through a trusted path.

### 7.4 Attention budget (approval fatigue)

A design where humans approve everything fails when people start rubber-stamping. So:

- **Measure it:** approval latency, and the *rubber-stamp rate* (approvals faster than a reading time proportional to the artifact size). Treat a rising rate as a failure signal, not a success.
- **Spend attention on consequence:** batch low-consequence approvals, show diffs between versions rather than whole artifacts, and route by consequence. Autonomy grows per scope only on evidence (§10), which is how attention is freed.

---

## 8. Agents and models

*Decided in shape* (`00` §9, `15`). *Model choices are open.*

- **One agent per stage**, each running a perceive → reason → act loop inside its stage world. The orchestrator, not the agent, advances the change.
- **Sub-agents only at a structural wall:** context overflow, specialization, parallelism, or independence for adversarial review. For example, a read-only explorer for noisy searches, or an independent reviewer in a clean context. Each needs a measured failure against the single-agent baseline (`07`).
- **Context service:** context triage (P0–P3), compaction that protects failure evidence, progressive discovery. It emits a **PerceptionTrace** for every model call (`02`).
- **Model gateway:** the only path to models. It holds keys, enforces quotas and budgets per stage and change, provides fallbacks, masks secrets and PII on input, and logs the requested and the responding model version (`15` §3).
- **Router:** consequence policy first, then a difficulty tier, then a declarative model and effort table. It is evaluated by replay (`04` §7).
- **Prompt catalog:** prompts, judge prompts and rubrics are versioned files with metadata, and their versions are stamped on every trace (`10` §18).
- **Model selection:** start with the strongest model to establish feasibility, then work backwards to cheaper ones on the stage's eval set. A model upgrade needs fresh local evidence (`12` §4, `08` §6).

---

## 9. Actions and execution governance

*Decided* (`17`, `05`, `08`).

### 9.1 The tool gateway

It is the only execution path, and every call goes through it. Decisions are made by the **ai2rules kernel** over the stage world compiled for this change. The kernel answers three separate questions: does the action exist (ABSENT), is it permitted (ALLOW / DENY / ASK / REPLAN), and in what reality does it run (execute, simulate…). The gateway executes the kernel's **effective call**, not the model's proposal, and logs every stripped argument as an injection signal (`16` T19).

### 9.2 Stage worlds

There is one world per stage, compiled per change. The table of what is present and absent per stage is in `17` §6. Its main rules:

- no raw shell as a model-visible tool;
- publishing only through verbs whose destinations are fixed literals;
- verifiers, CI config, policy and the durable spec are read-only;
- `roots.default: Deny` for autonomous stages.

World changes are code changes: they must pass the case set, a lint and a trace replay (`policy/`).

### 9.3 Blast radius

- Each task runs in an isolated workspace and container, the L0 sandbox. It holds no credentials, egress is closed or allowlisted, and budgets and a kill switch sit outside the agent's reach.
- Policy and sandbox are **independent backstops**: "policy should not depend on the sandbox being perfect, and the sandbox should not depend on policy being perfect" (A2R §8).
- **Credentials go to actuators, never to agents.** Adapters obtain short-lived, scoped credentials from secrets management for one verb on one resource.

### 9.4 Effects with consequence

Merge, publish, deploy and rollback are **staged effects**. A sealed intent is approved by a human (single use, bound to the exact effect and the world version). An independent coordinator then revalidates the intent, consumes the approval, calls the actuator and records a receipt.

- **Outcomes are kept distinct:** committed, failed, rejected, duplicate, *ambiguous*.
- **An ambiguous attempt is never retried blindly.** It is queried by its commit identity (`17` §8, `09` §3.7).

---

## 10. Trust and autonomy

*Decided in principle* (`08` §6, `16` T14). *Thresholds are open.*

- **Trust is scoped:** agent × model version × capability × task class × project and environment × policy version. It is never an agent-wide reputation.
- **Crawl → Walk → Run** maps onto levels 1 → 2 → 3, per scope. Promotion needs time at the current level, coverage of the task classes the next level will handle, measured outcomes, and the owner's approval. **A model upgrade resets evidence.**
- **Demotion is automatic** after a significant incident.
- **The agent cannot write its own trust record.** Evidence comes from the harness and from production outcomes.
- **A trust level never grants a tool.** It changes only how the approval gate routes (what needs asking). An explicit DENY is never waived. Sovereignty decisions always go to a human (§7.1).

---

## 11. Verification and evidence

*Decided* (`05`, `06`, `09` §3.4, §3.6).

- **Verifier service:** build, test, lint, type-check and probe runners that agents cannot modify. It returns durable evidence ids.
- **CI as a trusted evidence adapter:** the orchestrator, not the agent, re-runs the applicable verifiers against the patch's base revision and resolves the results through the CI service by run id.
- **Evidence stack, cheapest decisive signal first:** schema → deterministic verifiers → execution trace → property and invariant checks → rubric review → human sample → production outcome.
- **"No tests ran" and "tool not installed" are unavailable evidence, never a pass.**
- **Tests are protected:** agents may add tests, but changing or deleting an existing test goes through a separate review route.
- **Evidence store:** append-only and hash-chained, referenced from traces rather than copied into them. Sensitive content stays access-controlled (`16` T5). *Not built yet.*

---

## 12. Security and threat model

*Decided in approach* (`14`, `17`). *Residual risks are open.*

| Asset | Threat | Primary control | Backstop |
|---|---|---|---|
| Production and publish destinations | injected instructions in repo, issue, dependency or web content steer an effect | tainted model channel, literal-pinned verbs, destinations fixed at plan approval | human approval on staged effects |
| Credentials | exfiltration by or through the agent | credentials only at actuators, never in agent context; egress allowlist | secrets masking in the model gateway |
| Verifiers and policy | an agent loosens its own rules or tests | protected read-only paths; policy changes need the case set, lint and replay | human-owned change routes |
| Approvals | forged or replayed approval | authenticated approval surface (§7.3), single-use approvals bound to the effect | signed, chained approval log (A2R D78) |
| Build and runtime | attacker-influenced code runs during tests | L0 sandbox, no credentials, closed egress | budgets, kill switch |
| Supply chain | a dependency suggested by the agent or from the web | new dependencies need verification; the lockfile is a protected path (`eval/`) | review route for dependency changes |
| Harness integrity | a compromised upstream service returns hostile data | all service content is untrusted; trusted fields only through typed adapters | trace replay |

**Assumption:** the reasoning layer is compromised from its first read (`17` §5). Safety must hold anyway.

**Measured continuously:** the violation rate on a red-team suite (direct and indirect injection in READMEs, comments, fixtures, commit messages) and the **false-deny rate** on legitimate work, per stage world (`09` §8).

**Known residual risks:**
- A saved approval-log head can roll back a store that a fresh process opens (A2R D78 known limit).
- There is no declassifier, so false denies must be watched (`17` G5).
- `manifest_hash` depends on where roots resolve (G3).

---

## 13. Observability

*Decided* (`08` §7, `15` §5).

- **One trace per change,** from intake to production outcome. It contains spans for stages, model calls (with prompt, model and PerceptionTrace ids), tool calls (with the kernel decision, stripped arguments and world version), gates, approvals and effects. It follows OpenTelemetry GenAI conventions where they fit.
- **Delivery metrics:** lead time, deployment frequency, change failure rate, time to restore, all attributable to changes through the trace.
- **Agent metrics:**
  - pass@1 per stage;
  - routing regret;
  - re-read ratio;
  - tokens per accepted outcome;
  - reflection errors (done claimed, checks failing);
  - false-deny rate;
  - approval latency and rubber-stamp rate (§7.4).
- **Drift:** diff prompts, rubrics and worlds on every deploy; alert on changes of responding-model version; track slice metrics weekly (`09` §7).

---

## 14. Evaluation and learning

*Decided in approach* (`12`, `06`). *v0 exists for two stages* (`eval/`).

### 14.1 Evaluation

- Each stage has an eval set with slices, a primary exact metric, optional versioned judges for text quality only, a holdout never used for tuning, and bootstrap intervals.
- Each component is evaluated, and so is the end-to-end change. A baseline is set before each component is added.
- Eval sets start from project history (§5.2 step 4). **Every incident becomes a regression case:** the bad case must now be blocked, *and* an ordinary valid case must still pass.

### 14.2 The learning loop

- It runs offline, as a clean process separate from any stage session:

  ```text
  failure fact (immutable) → candidate lesson / skill / eval case → independent admission
    (held-out slices, no regressions) → scoped, versioned, expiring → available to stages
  ```

- **Developer feedback** (edits to agent patches, dismissed comments, reverts, takeovers) enters as candidates, with de-biasing (leniency, position, sycophancy; `16` T10).
- **Consolidation review:** periodically measure the combined cost of all active rules and safeguards, and retire or merge what no longer earns its cost (`09` §3.9).

---

## 15. Runtime and operations of the system itself

*Hypothesis.*

### 15.1 Logical components

| Plane | Component | Responsibility | Key state |
|---|---|---|---|
| Control | **Orchestrator** | change lifecycle, gates, ChangePlan, checkpoints, commit identities | change store |
| Control | **Trust and policy service** | stage worlds, trust records, approvals, durable intents | control-plane store (agent-read-only) |
| Control | **Registry** | agents, adapters, prompts, worlds, versions, owners | catalog |
| Data | **Stage workers** | run one stage agent in a sandbox; stateless between checkpoints | none (checkpoints only) |
| Data | **Context service** | assembles context per call, PerceptionTrace | knowledge index (§6.3) |
| Data | **Tool gateway + adapters** | kernel decisions, effective calls, service-role verbs | audit log |
| Data | **Model gateway** | model access, budgets, masking | usage ledger |
| Data | **Verifier service** | trusted checks, evidence ids | evidence store |
| Data | **Commit coordinator** | staged effects, receipts, idempotency | commit log (chained) |
| Support | **Observability** | traces, metrics | trace store |
| Support | **Evaluation and learning** | eval sets, experiments, admission pipeline | candidate store |

### 15.2 Failure and recovery

- **Resume, don't restart.** A checkpoint holds the goal, acceptance, completed artifacts and evidence, pending decision, versions, receipts and idempotency keys (`03` §8). A crashed stage worker is replaced and continues from its checkpoint.
- **An effect never runs twice:** receipts and idempotency keys come first, and ambiguous outcomes are queried, not retried.
- **Service outage:** a stage that needs an unavailable service role goes BLOCKED with that reason. It never proceeds on missing evidence.
- **Harness outage mid-release:** the commit coordinator's log is the source of truth. On restart, every `AttemptStarted` without an outcome is resolved by querying the actuator.

### 15.3 Kill switch and budgets

- **Kill switch:** independent of the agents and outside their reach. It stops new effects at the tool gateway and the commit coordinator.
- **Budgets:** token, time and cost ceilings per stage and per change, enforced in the gateways. Exceeding one gives REPLAN or BLOCKED, never a silent overrun.

### 15.4 How the harness changes itself

The harness's prompts, worlds, verifiers and adapters are code. They are the most sensitive code in the system, because they define what every agent may do.

- Harness changes go through a **separate, human-owned change route**. The harness may *propose* changes to itself, as candidates in change requests, but never approve or merge them.
- **Policy changes** must pass the case set, lint and trace-replay gates (`policy/`, `17` §6). **Prompt and judge changes** must pass the relevant eval sets and are versioned in the catalog.
- *Open:* whether the harness should deliver non-control-plane changes to itself through its own pipeline (dogfooding), and where exactly that line sits.

---

## 16. Data

*Open* (`09` §6).

- **Classification:** code, work item content, telemetry, traces, evidence and feedback, each with an owner.
- **Retention:** traces and evidence need a policy per class. High-risk paths keep everything, the rest is stratified sampling (`16` T5).
- **Redaction:** secrets and PII are masked before model calls (model gateway) and before traces are written (as A2R masks secret-shaped spans inside trace values, D66).
- **Residency and provider choice:** which data may go to which model provider is a per-project setting in the Project Profile.
- **Feedback as user data:** people should know how their edits and ratings are used (`15` §7).

---

## 17. Build plan, risks, open questions

### 17.1 Build plan

Each step adds one module, measured against the previous baseline (`09` §5).

| Step | What | Status |
|---|---|---|
| 0 | Evaluation first: criteria tables and eval sets | **v0 for Implementation + Review** (`eval/`), candidates not yet admitted |
| 1 | Skeleton: single agent per stage, deterministic chain, trace ID, human approves everything | next, after a baseline run |
| 2 | Perception: context service, PerceptionTrace | — |
| 3 | Memory: durable spec, checkpoints, failure-fact capture | — |
| 4 | Reasoning: consequence policy, router, decision records | — |
| 5 | Action: tool gateway on ai2rules, sandbox, CI as trusted verifier | `csd-implement` world + 30 cases exist (`policy/`) |
| 6 | Reflection: generator-critic, self-heal with protected verifiers | — |
| 7 | Collaboration: only after a measured wall | — |
| 8 | Governance: durable intents, staged commits, trust ladder, kill switch | kernel pieces exist in ai2rules (prototype) |
| 9 | Learning: admission pipelines, consolidation review | — |

### 17.2 Top risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Approval fatigue** | Crawl depends on human attention, and rubber-stamping silently removes the main control | §7.4: measure it, spend attention on consequence, earn autonomy |
| **False denies from a strict taint floor** | Legitimate work blocked, and people route around the system | measure per stage world, design verbs (`17` §5), A2R trial T3 |
| **Evaluation that doesn't predict usefulness** | We optimize a proxy | tie metrics to delivery outcomes, run a human spot check as the north star (`12` §5) |
| **Single-project evidence** | v0 is one Rust repository | onboard a second, different project early (§5.2 step 4) |
| **Design ahead of evidence** | This document itself is untested | keep statuses honest, update on evidence (`CLAUDE.md`) |

### 17.3 Open questions

Carried over from `09` §6, plus new ones from this document:

- Onboarding: what is the minimum Project Profile needed to start, and who owns the consequence map?
- The approval surface (§7.3): its concrete form, and how it authenticates across service roles.
- Organization scope: sharing lessons and components across projects, and who admits them.
- Dogfooding: which harness changes may flow through the harness's own pipeline (§15.4).
- Retention, redaction and residency policy (§16).
- Per-scope promotion criteria and usefulness thresholds per stage.
- Which judges we can afford per stage, and how to detect judge drift.

### 17.4 Decision log

Decisions are recorded where they are argued. Cross-source tensions and our rule for each are in `16` (T1–T19); stage and component decisions are in `09`. Once decisions start outliving their chapters, move them into `docs/adr/`.
