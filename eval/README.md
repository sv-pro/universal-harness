# eval/ — evaluation sets, before any agent code

This is `09` §5 step 0: the criteria tables and labelled eval cases for the first two stages we automate, **3.4 Implementation** and **3.5 Code review**. It sits next to `policy/`: `policy/` pins what the tool gateway decides, and `eval/` pins what the agents must achieve.

| Path | What |
|---|---|
| `criteria.md` | Criteria tables (`10` §15) for both stages: metrics, hard requirements, usefulness thresholds, and what v0 can and cannot detect. |
| `sources/ai2rules.seeds.yaml` | **Hand-written** labels, one per historical commit of `sv-pro/ai2rules`: the problem statement (without the fix), the finding a reviewer should raise, and the slice labels. |
| `build_sets.py` | Derives everything checkable from git: base/fix revisions, fail-to-pass tests, the write partition, seeded-defect hunks and their locations, SZZ-introducing commits, the dev/holdout split. Deterministic. |
| `sets/implement.v0.yaml`, `sets/review.v0.yaml` | **Generated.** Edit the seeds, not these files. |
| `verify_oracles.py` | Runs each implement case's tests at its reference fix and records whether the oracle holds. |

```bash
pip install pyyaml
python3 eval/build_sets.py                        # --repo ../ai2rules by default
python3 eval/build_sets.py --materialize /tmp/rv  # also write each review case's diff
# oracle check: Linux + Rust, against an LF clone of ai2rules (see verify_oracles.py)
```

## What's in v0

**implement.v0 — 58 cases** (36 dev / 22 holdout): 28 security fixes, 7 bug fixes, 23 features (including the E1–E7 epics, whose statement is the PLAN.md section at the base revision). Each case has a base revision, a statement, `fail_to_pass` tests (the tests the fix added), `pass_to_pass` (the whole workspace), a write partition, and forbidden paths (verifiers, CI, toolchain, lockfile, existing tests).

**review.v0 — 90 cases** (61 dev / 29 holdout):
- 34 `seeded_revert` positives: the fix's non-test hunks reversed onto the fixed tree. The expected finding and its location are known exactly.
- 20 `historical_szz` positives: the commit that SZZ blames for the lines a fix changed, reviewed as it was originally proposed. This is the realistic slice, with noisy labels.
- 36 negatives: 30 fix diffs (corrected code, never blamed by a later fix) and 6 plain controls (formatting, renames).

## Status: candidates, not admitted

Every case has `status: candidate` and `admitted_by: null`. Skills and lessons are candidates until an independent process admits them (CLAUDE.md), and so are eval cases (`09` §3.9: validate, strip solution hints, record provenance). The labels were written by Claude from commit history on 2026-09-26.

To admit a case, the owner:
1. reads the statement and checks that it states the problem, not the fix;
2. for implementation cases, checks that the `fail_to_pass` tests don't depend on a specific API design. Tests that call new public items (e.g. `effective_call`) need the interface named in the statement, or an alternative correct design fails to compile;
3. for SZZ cases, confirms that the blamed commit really introduced the defect;
4. sets `admitted_by` and the date in the seed, since the generated file is rebuilt from the seeds.

## Oracle check, 2026-09-26

`verify_oracles.py` ran in Docker (`rust:1-bookworm`, each revision's own pinned toolchain) against an LF clone of ai2rules. **The oracle holds for 58/58 implementation cases**: at every reference fix, the workspace is green and every `fail_to_pass` test ran and passed. Results: `results/oracles.implement.v0.json`.

## Open (not done yet)

- **Oracle, second half.** `verify_oracles.py` checks that the tests pass at the fix. It doesn't yet check that they fail at the base once transplanted there; tests added by a fix don't exist at the base, so that needs the test files applied first.
- **17 implementation cases** have a reference fix that touched a protected path (`Cargo.lock` for new dependencies, CI workflows, `scripts/check-wasm-freshness.mjs`). They carry `reference_touches_protected`. Decide per case whether the dependency path gets its own approval route or the case leaves the set.
- **Size and breadth.** v0 is short of the ~100 cases per stage that `09` §5 asks for, and covers one Rust repo. More repos and languages are the next source, followed by incident history once the pipeline runs (`09` §3.8: every incident becomes a regression case).
- **Out-of-scope and injection slice** (`11` §7): no case yet where the right answer is to escalate, such as instructions embedded in the issue text or a fix that needs a protected verifier changed. History doesn't provide these; they have to be written.
- **Audit-mode review variant.** Give the reviewer the defective file state instead of a revert diff, to remove the "safeguard deleted" giveaway.
- **Scoring harness.** The match rules are stated per case (file, ±5 lines, class). The scorer that applies them is built together with the step 1 skeleton.
