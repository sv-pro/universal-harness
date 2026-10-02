# HANDOFF — coding-agent-harness

Written 2026-09-26 at the end of a Claude Cowork session, for the next session
(Claude Code or a human). Read this, then `CLAUDE.md`. Delete or update it once acted on.

## What this project is

An agentic system for **Continuous Software Delivery** (intake → requirements →
design → planning → implementation → review → testing → release → operate → learn).
So far it is **design only**: no harness code exists yet.

## What exists

- `docs/design-guide/` — the guide, distilled from three sources:
  - **[DAA]** *Designing AI Agents* (J. Huang, Manning MEAP v3, ch. 1–9) → files 00–08
  - **[AIE]** *AI Engineering* (C. Huyen, O'Reilly 2024) → files 12–15, plus [AIE] boxes in 00–08
  - **[A2R]** `sv-pro/ai2rules` v0.6.0 (the user's own execution-governance kernel) → file 17
  - ours: `09-applying-to-csd.md` (architecture hypothesis, build order §5, per-stage
    evaluation §7), `10-contracts-and-templates.md` (YAML contracts §1–21),
    `11-checklists-and-metrics.md`, `16-cross-book-synthesis.md` (agreements + tensions
    **T1–T19** with "our rule"), `glossary.md`, `README.md` (index).
  - The two books live as PDFs in the claude.ai Project "Coding Agent Harness", which a
    Claude Code session can't read — the guide is the distilled substitute.
- `policy/` — executable stage worlds for the ai2rules kernel:
  - `worlds/csd-implement.world.yaml` (implementation stage; template instantiated per
    change: repo/branches are literals fixed at ChangePlan approval; model channel
    declared tainted; `create_pull_request` hidden behind `open_change_pr`)
  - `cases/csd-implement.cases.yaml` (30 expected verdicts; `requires:` marks cases that
    need kernel features D79/D80)
  - `run-cases.py` (probes the `harness` binary, skips unsupported cases). Needs Python
    3 + PyYAML + `harness` (`npm i -g ai2rules-harness`, or a build of the ai2rules
    fix branch). Status: 30/30 on the fix branch; 27/27 + 3 skipped on v0.6.0.

## Where things stand / next steps

1. **ai2rules fix branch**: committed (`f85d511`, `d4f962c`, `5750e5b`), verified on the
   pinned 1.97.1 in Docker (378 tests, WASM rebuilt, demos 10/10, bench no drift), and
   pushed. Still open: the PR (gh isn't logged in; the description was drafted in the
   2026-09-26 session), Linear, and a 0.7.0 bump PR. See that repo's `HANDOFF.md`.
   Once released, `policy/` cases stop skipping.
2. **Step 0 (evaluation first): v0 built, not admitted.** The stages are Implementation +
   Code review (the user chose them 2026-09-26), sourced from ai2rules history. See
   `eval/README.md`: 58 implementation + 90 review candidate cases, criteria tables in
   `eval/criteria.md`, and oracle results from `eval/verify_oracles.py`. **Next:** the
   owner admits or rejects cases (the labels are Claude's), a baseline run (single agent,
   no harness), then set the *(cal.)* thresholds. After that: step 1 skeleton (single
   agent, trace ID from day one), then the tool gateway on the ai2rules kernel (execute
   `GateResponse.effective`, log `stripped`).
3. **Not built yet, only specified:** the world lint (`17` §6), trace-replay gate for
   world changes, stage worlds other than `csd-implement` (table in `17` §6), the L0
   sandbox (container + egress proxy, `17` G4), evidence store with hash chain.
4. **Open questions:** `09` §6; `17` §7 G3 (record manifest git blob hash + runtime
   `manifest_hash`) and G5 (no declassifier — watch the false-deny rate, A2R trial T3);
   DAA ch. 10–11 unpublished.

## How the user likes to work

- Wants positions **challenged, not agreed with by default** (cross-critique). File 16
  and the gap tables are written in that spirit — keep disputing, with evidence.
- Working rule so far (not a stated preference): verify claims against source before stating them, and say what was not run.
