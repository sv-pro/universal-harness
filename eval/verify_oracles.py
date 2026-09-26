#!/usr/bin/env python3
"""Check that each implement case's oracle holds at its reference fix.

For every case: check out `reference.fix`, run `cargo test --workspace --no-fail-fast`
under that revision's own pinned toolchain, and record whether every fail_to_pass test
ran and passed, and whether anything failed. A case whose oracle does not hold at its
own reference solution cannot be admitted.

It does NOT yet check the other half (the fail_to_pass tests fail at `base` once
applied there); tests added by the fix don't exist at base, so that needs the test
files transplanted. Listed in eval/README.md as open.

Run inside a Linux container with Rust, git and PyYAML, against an LF clone:
    python3 eval/verify_oracles.py --repo /src --set eval/sets/implement.v0.yaml --out results.json
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import yaml

RESULT = re.compile(r"^test (\S+) \.\.\. (ok|FAILED|ignored)", re.M)


def sh(cmd, cwd, timeout=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, errors="replace",
                          timeout=timeout)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--set", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", nargs="*", help="case ids to run")
    args = ap.parse_args()
    cases = yaml.safe_load(Path(args.set).read_text(encoding="utf-8"))["cases"]
    out_path = Path(args.out)
    results = json.loads(out_path.read_text()) if out_path.exists() else {}
    for case in cases:
        cid = case["id"]
        if (args.only and cid not in args.only) or cid in results:
            continue  # resumable: a finished case is not re-run
        fix = case["reference"]["fix"]
        t0 = time.time()
        sh(["git", "checkout", "-q", "--force", fix], args.repo)
        sh(["git", "clean", "-qfdx", "-e", "target"], args.repo)
        try:
            run = sh(["cargo", "test", "--workspace", "--no-fail-fast"], args.repo, timeout=3600)
            log, code = run.stdout + run.stderr, run.returncode
        except subprocess.TimeoutExpired:
            log, code = "", "timeout"
        seen = {}
        for name, status in RESULT.findall(log):
            seen.setdefault(name.rsplit("::", 1)[-1], []).append(status)
        f2p = {}
        for t in case["expected"]["fail_to_pass"]:
            fn = t.rsplit("::", 1)[-1]
            st = seen.get(fn)
            f2p[t] = "missing" if not st else "ok" if all(s == "ok" for s in st) else "failed"
        failed = sorted({n for n, s in RESULT.findall(log) if s == "FAILED"})
        results[cid] = {
            "fix": fix,
            "cargo_exit": code,
            "compiled": bool(RESULT.search(log)),
            "tests_run": len(RESULT.findall(log)),
            "fail_to_pass": f2p,
            "oracle_holds": code == 0 and all(v == "ok" for v in f2p.values()) and bool(f2p),
            "failed_tests": failed[:20],
            "seconds": round(time.time() - t0),
        }
        out_path.write_text(json.dumps(results, indent=1, sort_keys=True))
        r = results[cid]
        print(f"{cid:40} exit={r['cargo_exit']} run={r['tests_run']:4} "
              f"f2p={sum(v == 'ok' for v in f2p.values())}/{len(f2p)} holds={r['oracle_holds']} "
              f"{r['seconds']}s", flush=True)
    held = sum(r["oracle_holds"] for r in results.values())
    print(f"== oracle holds for {held}/{len(results)} cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
