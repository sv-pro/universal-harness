# policy/ — stage worlds for the execution kernel

The executable part of `docs/design-guide/17-execution-governance.md`: the stage worlds the tool gateway decides over, and the expected verdicts that pin their behavior. It uses the [ai2rules](https://github.com/sv-pro/ai2rules) kernel (v0.6.0).

| Path | What |
|---|---|
| `worlds/<stage>.world.yaml` | ai2rules WorldManifest for one CSD stage. It is a template, and the per-change literals (repo, branches, environments) are filled in at ChangePlan approval. |
| `cases/<stage>.cases.yaml` | GateRequests with expected verdicts. They cover every ABSENT, DENY, ASK and REPLAN path, plus the known gaps. |
| `run-cases.py` | Runs every case through `harness gate` and fails on any mismatch. |

```bash
npm install -g ai2rules-harness     # or: cargo install --git https://github.com/sv-pro/ai2rules cli-harness
pip install pyyaml
python3 policy/run-cases.py         # HARNESS_BIN=/path/to/harness to override
```

Status (2026-09-26): `csd-implement` passes 30/30 on the ai2rules fix branch `fix/projection-effective-call-log-chain` (re-run at commit `5750e5b`, manifest_hash `13804bd01e35`), and 27/27 with 3 skipped on released v0.6.0. Cases marked `requires:` need kernel features from that branch; the runner probes the binary and skips them when absent.

Rules for changing anything here (17 §6):

- Changes are PRs. Agents have read-only access to this folder in every stage world.
- The case set must stay green. A new failure mode gets a case first.
- Replay recent traces against the new world and explain every verdict that changes.
- The world lint (planned) rejects:
  - newly projected actions;
  - widened roots;
  - removed transition policies;
  - a missing `default_to`;
  - incomplete argument roles on effects covered by the taint floor.
