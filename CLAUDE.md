# Coding Agent Harness

Goal: an agentic system for Continuous Software Delivery — requirements analysis, design, implementation, code review, testing, release, and operation.

## Design guidance

Architecture decisions in this repo follow `docs/design-guide/`, distilled from two books and one codebase:
- **[DAA]** *Designing AI Agents*, J. Huang, Manning MEAP v3 — patterns, harness, governance (files 00–08).
- **[AIE]** *AI Engineering*, C. Huyen, O'Reilly 2024 — evaluation, prompts/RAG/adaptation, security, architecture and operations (files 12–15).
- **[A2R]** `sv-pro/ai2rules` v0.6.0 — the deterministic execution-governance kernel we build the tool gateway on (file 17; executable stage worlds in `policy/`).

`16-cross-book-synthesis.md` records where the sources disagree and which rule we follow.

- Before designing or changing a harness component, read `docs/design-guide/README.md`, then the chapter file for the affected cognitive function.
- Name patterns by coordinates (e.g., *Tool Dispatch (Action × Route)*) and write component designs with the template in `docs/design-guide/10-contracts-and-templates.md` §14.
- Before building a component, write its criteria table and eval set (`12`, `10` §15–17).
- Run the checklists in `docs/design-guide/11-checklists-and-metrics.md` before merging a design.
- `docs/design-guide/09-applying-to-csd.md` is our current architecture hypothesis; update it when evidence changes a decision.

## Non-negotiables (from the guide)

- Start with one agent; add agents or patterns only for a measured failure, against a baseline.
- Consequence policy runs before complexity routing.
- Every state-changing action has an action contract and is accepted only on evidence from a verifier the agent cannot modify.
- Enforce boundaries in the runtime (tool gateway, sandbox, hooks), not only in prompts.
- Skills and lessons are candidates until an independent process admits them.
- One trace ID follows a change from intake to production outcome.
- Define the evaluation before building; gate on exact/functional checks first, versioned AI judges only for text quality.
- Repository, issue, CI, dependency, and web content is untrusted input; all model access goes through the model gateway and all actions through the tool gateway.
- Prompts, judge configs, and rubrics are versioned in the catalog; their versions appear on every trace.
- Every stage runs in a compiled ai2rules stage world; the model's channel is tainted; published work goes only to destinations fixed at ChangePlan approval. Changes under `policy/` require a green `python3 policy/run-cases.py` and a trace-replay diff.
- No LLM decides an effect: judges and classifiers may only tighten.

