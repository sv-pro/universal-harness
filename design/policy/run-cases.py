#!/usr/bin/env python3
"""Check world manifests against their expected-verdict case sets.

Uses the ai2rules `harness gate` wire ABI (sv-pro/ai2rules, D24): one GateRequest
JSON on stdin, one GateResponse JSON on stdout. The kernel is the oracle; this
script only builds requests and compares verdicts.

Usage:
    python3 policy/run-cases.py [--harness PATH] [WORLD CASES]...
    # default: every policy/worlds/<name>.world.yaml with policy/cases/<name>.cases.yaml

Needs: the `harness` binary (npm i -g ai2rules-harness, or build sv-pro/ai2rules)
and PyYAML. Exit code 0 = all cases pass.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent


def build_workspace(root: Path) -> None:
    """A scratch repo layout so `roots` resolve against real, canonical paths."""
    for d in ["src", ".github/workflows", "ci", "policy/worlds", ".claude"]:
        (root / d).mkdir(parents=True, exist_ok=True)
    for f in ["README.md", ".env", "src/a.go", ".github/workflows/ci.yml"]:
        (root / f).write_text("x\n")


def merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = merge(out[k], v)
        else:
            out[k] = v
    return out


def substitute(obj, ws: str):
    if isinstance(obj, str):
        return obj.replace("{{ws}}", ws)
    if isinstance(obj, list):
        return [substitute(x, ws) for x in obj]
    if isinstance(obj, dict):
        return {k: substitute(v, ws) for k, v in obj.items()}
    return obj


PROBE_WORLD = """
world_id: run-cases-probe
capabilities:
  - { trust: Trusted, actions: [Mcp] }
base_actions:
  - { name: base, action_type: Mcp, side_effect: External, projected: false }
scoped_capabilities:
  - { name: verb, base_action: base }
"""


def gate(harness: str, world: Path, req: dict, cwd: str) -> dict:
    proc = subprocess.run(
        [harness, "gate", "--world", str(world.resolve())],
        input=json.dumps(req), capture_output=True, text=True, cwd=cwd,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"exit {proc.returncode}: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def probe_features(harness: str) -> set:
    """Which optional kernel features this harness binary has (see cases header)."""
    features = set()
    with tempfile.TemporaryDirectory() as tmp:
        world = Path(tmp) / "probe.yaml"
        world.write_text(PROBE_WORLD)
        ctx = {"taint": "clean", "source_channel": "user_prompt", "mode": "interactive"}
        base = gate(harness, world, {"v": 1, "tool": "base", "arguments": {}, "context": ctx}, tmp)
        verb = gate(harness, world, {"v": 1, "tool": "verb", "arguments": {}, "context": ctx}, tmp)
    if base.get("decision") == "ABSENT":
        features.add("hidden_base")
    if "effective" in verb:
        features.add("effective_call")
    return features


def subset(want, have) -> bool:
    if isinstance(want, dict):
        return isinstance(have, dict) and all(k in have and subset(v, have[k]) for k, v in want.items())
    return want == have


def run(harness: str, world: Path, cases_file: Path, features: set) -> int:
    spec = yaml.safe_load(cases_file.read_text())
    defaults = spec.get("defaults", {})
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        ws = str(Path(tmp).resolve())
        build_workspace(Path(ws))
        skipped = 0
        for case in spec["cases"]:
            missing = [f for f in case.get("requires", []) if f not in features]
            if missing:
                print(f"SKIP {case['name']}: harness lacks {', '.join(missing)}")
                skipped += 1
                continue
            req = substitute(merge({"v": 1, **defaults}, case["request"]), ws)
            req["context"] = {k: v for k, v in req.get("context", {}).items() if v is not None}
            try:
                resp = gate(harness, world, req, ws)
            except RuntimeError as e:
                print(f"ERROR {case['name']}: {e}")
                failures += 1
                continue
            got = {
                "decision": resp.get("decision"),
                "rule": resp.get("rule"),
                "action": resp.get("action"),
                "taint": (resp.get("context") or {}).get("taint"),
            }
            got["effective"] = resp.get("effective")
            bad = {k: (v, got.get(k)) for k, v in case["expect"].items() if not subset(v, got.get(k))}
            status = "FAIL" if bad else "ok  "
            print(f"{status} {case['name']}: {got['decision']} rule={got['rule']} action={got['action']} taint={got['taint']}")
            for k, (want, have) in bad.items():
                print(f"       expected {k}={want!r}, got {have!r}")
            failures += bool(bad)
        ran = len(spec["cases"]) - skipped
        print(f"-- {world.name}: {ran - failures}/{ran} passed, {skipped} skipped, manifest_hash={resp.get('manifest_hash')}")
    return failures


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--harness", default=os.environ.get("HARNESS_BIN") or shutil.which("harness") or "harness")
    ap.add_argument("pairs", nargs="*")
    args = ap.parse_args()
    if args.pairs:
        pairs = [(Path(args.pairs[i]), Path(args.pairs[i + 1])) for i in range(0, len(args.pairs), 2)]
    else:
        pairs = []
        for w in sorted((HERE / "worlds").glob("*.world.yaml")):
            c = HERE / "cases" / w.name.replace(".world.yaml", ".cases.yaml")
            if c.exists():
                pairs.append((w, c))
    features = probe_features(args.harness)
    print(f"harness features: {', '.join(sorted(features)) or 'none beyond 0.6.0'}")
    failures = sum(run(args.harness, w, c, features) for w, c in pairs)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
