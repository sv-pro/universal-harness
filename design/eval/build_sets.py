#!/usr/bin/env python3
"""Build the implement and review eval sets from curated seeds plus git history.

The seeds (eval/sources/<repo>.seeds.yaml) hold what a human must write: the problem
statement, the review finding, the slice labels. Everything checkable is derived
here from the repository so it cannot drift from the history it claims to describe:
base/fix revisions, fail-to-pass test names, the write partition, seeded-defect
hunks and their locations, SZZ-introducing commits, the dev/holdout split.

Usage:
    python3 eval/build_sets.py [--repo ../ai2rules] [--seeds eval/sources/ai2rules.seeds.yaml]
    python3 eval/build_sets.py --materialize DIR   # also write each review case's diff

Output: eval/sets/implement.v0.yaml, eval/sets/review.v0.yaml. Deterministic for a
given seeds file and repository history; re-running must produce no diff.
Needs: git, PyYAML.
"""
import argparse
import hashlib
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
BUILDER_VERSION = "0.1"
HOLDOUT_PERCENT = 30

# Files an implementing agent may never touch: the verifiers and the rules (09 §3.4).
PROTECTED = [
    ".github/", "rust-toolchain.toml", "rustfmt.toml", "clippy.toml", "deny.toml",
    "scripts/check-", "Cargo.lock",
]
DOC_SUFFIXES = (".md", ".mdx")
TEST_FN = re.compile(r"^\+\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)")
HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def git(repo: Path, *args: str) -> str:
    out = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True,
                         encoding="utf-8", errors="replace")
    if out.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {out.stderr.strip()}")
    return out.stdout


def is_test_path(path: str) -> bool:
    return "/tests/" in path or path.startswith("tests/") or path.endswith(("_test.rs", ".test.ts", ".spec.ts"))


def is_code(path: str) -> bool:
    return path.endswith((".rs", ".ts", ".js", ".mjs", ".py", ".sh", ".yaml", ".yml", ".toml")) \
        and not path.startswith(("blog/", "docs/"))


def test_module_start(repo: Path, rev: str, path: str) -> int | None:
    """First line of the inline `#[cfg(test)]` module in `path` at `rev`, if any."""
    try:
        text = git(repo, "show", f"{rev}:{path}")
    except RuntimeError:
        return None
    for n, line in enumerate(text.splitlines(), 1):
        if line.strip() == "#[cfg(test)]":
            return n
    return None


def parse_diff(repo: Path, fix: str):
    """Per file: hunks as (old_start, old_len, new_start, new_len, body lines)."""
    files = defaultdict(list)
    current = None
    for line in git(repo, "diff", "--no-color", "-U0", "--no-renames", f"{fix}^", fix).splitlines():
        if line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("--- "):
            continue
        elif (m := HUNK.match(line)) and current:
            a, b, c, d = (int(x) if x is not None else 1 for x in m.groups())
            files[current].append([a, b, c, d, []])
        elif current and files[current] and line[:1] in "+-":
            files[current][-1][4].append(line)
    return files


def matches(value: str, filters) -> bool:
    return not filters or any(f in value for f in filters)


def analyse(repo: Path, seed: dict):
    fix = git(repo, "rev-parse", "--short=12", str(seed["commit"])).strip()
    base = git(repo, "rev-parse", "--short=12", f"{fix}^").strip()
    diff = parse_diff(repo, fix)
    tests, src_hunks, touched = [], defaultdict(list), set()
    for path, hunks in diff.items():
        touched.add(path)
        tmod = test_module_start(repo, fix, path) if path.endswith(".rs") else None
        for h in hunks:
            # A #[test] is a test wherever it sits: with -U0 a new file is one hunk
            # from line 1, straddling its own test module.
            body = h[4]
            for i, line in enumerate(body):
                if re.match(r"^\+\s*#\[(tokio::)?test\]", line):
                    for nxt in body[i + 1:i + 5]:
                        if (m := TEST_FN.match(nxt)):
                            name = f"{path}::{m.group(1)}"
                            if matches(name, seed.get("tests")):
                                tests.append(name)
                            break
            in_test = is_test_path(path) or (tmod is not None and h[2] >= tmod)
            if not in_test and is_code(path) and matches(path, seed.get("paths")):
                src_hunks[path].append(h)
    size = sum(sum(1 for l in h[4]) for hs in src_hunks.values() for h in hs)
    return fix, base, sorted(set(tests)), dict(src_hunks), sorted(touched), size


def protected(path: str) -> bool:
    return any(path.startswith(p) for p in PROTECTED)


def partition(src_files, touched):
    roots = set()
    for p in src_files:
        parts = p.split("/")
        roots.add("/".join(parts[:2]) + "/" if parts[0] == "crates" and len(parts) > 2 else p)
    docs = sorted(p for p in touched if p.endswith(DOC_SUFFIXES))
    return [p for p in sorted(roots) + docs if not protected(p)]


def size_bucket(n: int) -> str:
    return "S" if n < 50 else "M" if n < 300 else "L" if n < 1000 else "XL"


def split_of(case_id: str) -> str:
    return "holdout" if hashlib.sha256(case_id.encode()).digest()[0] % 100 < HOLDOUT_PERCENT else "dev"


def crates_of(paths):
    return sorted({p.split("/")[1] for p in paths if p.startswith("crates/")}) or ["(none)"]


def plan_section(repo: Path, base: str, ref: str) -> str:
    doc, _, epic = ref.partition("#")
    text = git(repo, "show", f"{base}:{doc}")
    m = re.search(rf"^### {re.escape(epic)} — .*?(?=^### |\Z)", text, re.S | re.M)
    if not m:
        raise RuntimeError(f"{ref} not found at {base}")
    return m.group(0).strip()


def szz(repo: Path, fix: str, src_hunks):
    """Commits that last touched the lines the fix changed or removed (SZZ). Pure
    additions blame nothing: a missing guard has no line to blame."""
    blamed = Counter()
    lines = defaultdict(list)
    for path, hunks in src_hunks.items():
        for a, b, _c, _d, body in hunks:
            if not any(l.startswith("-") for l in body):
                continue
            out = git(repo, "blame", "--porcelain", "-L", f"{a},+{b}", f"{fix}^", "--", path)
            for line in out.splitlines():
                parts = line.split()
                if len(parts) >= 3 and re.fullmatch(r"[0-9a-f]{40}", parts[0]):
                    blamed[parts[0][:12]] += 1
                    lines[(parts[0][:12], path)].append(int(parts[1]))
    return blamed, lines


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=str(HERE.parent.parent / "ai2rules"))
    ap.add_argument("--seeds", default=str(HERE / "sources" / "ai2rules.seeds.yaml"))
    ap.add_argument("--out", default=str(HERE / "sets"))
    ap.add_argument("--materialize", help="write each review case's diff under this directory")
    args = ap.parse_args()
    repo = Path(args.repo)
    src = yaml.safe_load(Path(args.seeds).read_text(encoding="utf-8"))
    seeds = src["seeds"]
    ids = [s["id"] for s in seeds]
    if len(ids) != len(set(ids)):
        sys.exit("duplicate seed ids")

    impl, positives, fixes, intro = [], [], [], {}
    for seed in seeds:
        fix, base, tests, src_hunks, touched, size = analyse(repo, seed)
        if "statement_ref" in seed:
            statement = plan_section(repo, base, seed["statement_ref"])
            statement_source = f"{seed['statement_ref']} @ {base}"
        else:
            statement, statement_source = seed["statement"], "seed (curated from commit history)"
        slices = {
            "repo": src["repo"], "language": "rust", "task_class": seed["task_class"],
            "consequence": seed["consequence"], "size": size_bucket(size),
            "crates": crates_of(src_hunks),
        }
        if not tests:
            print(f"warning: {seed['id']}: no added tests found; no fail-to-pass oracle", file=sys.stderr)
        impl.append({
            "id": f"impl-{seed['id']}",
            "stage": "implementation",
            "slices": slices,
            "input": {"repo": src["repo"], "base": base, "statement": statement,
                      "statement_source": statement_source},
            "expected": {
                "exact": [
                    "cargo fmt --all -- --check",
                    "cargo clippy --workspace --all-targets -- -D warnings",
                    "cargo test --workspace (pass_to_pass: every test green at base stays green)",
                ],
                "fail_to_pass": tests,
                "write_partition": partition(src_hunks, touched),
                "forbidden": ["modify or delete a test that exists at base", *[f"touch {p}*" for p in PROTECTED]],
            },
            "reference": {"fix": fix, "src_lines_changed": size},
            "oracle_note": None if tests else "no added tests: needs a human-written acceptance test before admission",
            # The historical fix changed a verifier the agent may not touch. The case
            # stays, but the reference solution is not reachable inside the partition.
            "reference_touches_protected": sorted(p for p in touched if protected(p)) or None,
            "provenance": {"source": "historical_pr", "commit": fix, "label_by": "claude (seed)",
                           "admitted_by": None},
            "status": "candidate",
            "split": split_of(f"impl-{seed['id']}"),
        })
        if seed.get("finding"):
            locations = [{"file": p, "lines": [a, a + max(b, 1) - 1],
                          "kind": "changed" if any(l.startswith("-") for l in body) else "missing_code"}
                         for p, hs in src_hunks.items() for a, b, _c, _d, body in hs]
            common = {"task_class": seed["task_class"], "defect_class": seed["defect_class"],
                      "consequence": seed["consequence"], "size": size_bucket(size),
                      "crates": crates_of(src_hunks)}
            positives.append({
                "id": f"review-seeded-{seed['id']}",
                "stage": "code_review",
                "kind": "seeded_revert",
                "slices": {**common, "origin": "revert_seeded"},
                "input": {"repo": src["repo"],
                          "diff_recipe": {"kind": "revert_src_hunks", "commit": fix,
                                          "paths": sorted(src_hunks)},
                          "context": "diff only; CI results withheld"},
                "expected": {"findings": [{"defect_class": seed["defect_class"], "severity": "critical"
                                           if seed["consequence"] == "governed" else "major",
                                           "summary": seed["finding"], "locations": locations}],
                             "match_rule": "same file and within ±5 lines of a location; class must match for class-credit"},
                "provenance": {"source": "historical_pr", "commit": fix, "label_by": "claude (seed)",
                               "admitted_by": None},
                "status": "candidate",
                "split": split_of(f"review-seeded-{seed['id']}"),
            })
            fixes.append((seed, fix, src_hunks, common))
            blamed, blamed_lines = szz(repo, fix, src_hunks)
            for sha, _n in blamed.most_common(1):
                intro.setdefault(sha, []).append((seed, fix, blamed_lines, sha, common))

    # Historical (SZZ) positives: the commit that introduced the code a fix changed.
    historical = []
    implicated = set(intro)
    for sha, hits in sorted(intro.items()):
        full = git(repo, "rev-parse", "--short=12", sha).strip()
        subject = git(repo, "log", "-1", "--format=%s", full).strip()
        if len(git(repo, "rev-list", "--parents", "-n1", full).split()) != 2:
            continue  # root or merge commit: no single parent diff to review
        findings = []
        for seed, fix, blamed_lines, s, _common in hits:
            locs = [{"file": p, "lines": [min(ls), max(ls)], "kind": "introduced"}
                    for (bs, p), ls in sorted(blamed_lines.items()) if bs == s]
            findings.append({"defect_class": seed["defect_class"], "summary": seed["finding"],
                             "fixed_by": fix, "locations": locs})
        cid = f"review-szz-{full[:8]}"
        historical.append({
            "id": cid, "stage": "code_review", "kind": "historical_szz",
            "slices": {"origin": "szz", "defect_class": sorted({f["defect_class"] for f in findings}),
                       "crates": crates_of([l["file"] for f in findings for l in f["locations"]])},
            "input": {"repo": src["repo"], "diff_recipe": {"kind": "commit", "commit": full},
                      "subject": subject, "context": "diff only; CI results withheld"},
            "expected": {"findings": findings,
                         "match_rule": "same file and within ±5 lines of a location"},
            "label_confidence": "low (SZZ: blame of changed lines; a human must confirm the introducing commit)",
            "provenance": {"source": "historical_pr", "commit": full, "label_by": "szz", "admitted_by": None},
            "status": "candidate", "split": split_of(cid),
        })

    # Negatives: corrected code (fix diffs) and plain controls. A fix that SZZ blames
    # for a later defect is not clean, so it is left out.
    negatives = []
    for seed, fix, src_hunks, common in fixes:
        if fix in implicated:
            continue
        cid = f"review-clean-{seed['id']}"
        negatives.append({
            "id": cid, "stage": "code_review", "kind": "clean_fix",
            "slices": {**common, "origin": "fix_diff"},
            "input": {"repo": src["repo"], "diff_recipe": {"kind": "commit_src_hunks", "commit": fix,
                                                           "paths": sorted(src_hunks)},
                      "context": "diff only; CI results withheld"},
            "expected": {"findings": [], "max_severity_allowed": "minor"},
            "label_confidence": "medium (no later fix blames this diff, as of the repo head used)",
            "provenance": {"source": "historical_pr", "commit": fix, "label_by": "claude (seed)",
                           "admitted_by": None},
            "status": "candidate", "split": split_of(cid),
        })
    for c in src.get("clean_controls", []):
        full = git(repo, "rev-parse", "--short=12", str(c)).strip()
        if full in implicated:
            continue
        cid = f"review-control-{full[:8]}"
        negatives.append({
            "id": cid, "stage": "code_review", "kind": "clean_control",
            "slices": {"origin": "control"},
            "input": {"repo": src["repo"], "diff_recipe": {"kind": "commit", "commit": full},
                      "subject": git(repo, "log", "-1", "--format=%s", full).strip(),
                      "context": "diff only; CI results withheld"},
            "expected": {"findings": [], "max_severity_allowed": "minor"},
            "label_confidence": "medium",
            "provenance": {"source": "historical_pr", "commit": full, "label_by": "claude (seed)",
                           "admitted_by": None},
            "status": "candidate", "split": split_of(cid),
        })

    head = git(repo, "rev-parse", "--short=12", "HEAD").strip()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    review = positives + historical + negatives
    for name, cases in [("implement", impl), ("review", review)]:
        counts = {}
        for k in ["task_class", "consequence", "size", "origin", "defect_class"]:
            tally = Counter()
            for c in cases:
                v = c["slices"].get(k)
                tally.update(v if isinstance(v, list) else [v] if v is not None else [])
            if tally:
                counts[k] = dict(sorted(tally.items()))
        doc = {
            "eval_set": f"{name}.v0",
            "status": "candidate — not admitted; labels unreviewed by the owner",
            "generated_by": f"eval/build_sets.py {BUILDER_VERSION}",
            "source": {"repo": src["repo"], "head": head, "seeds": Path(args.seeds).name},
            "size": len(cases),
            "splits": dict(sorted(Counter(c["split"] for c in cases).items())),
            "slices": counts,
            "cases": cases,
        }
        text = "# GENERATED by eval/build_sets.py — edit the seeds, not this file.\n" + \
            yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=100)
        (out / f"{name}.v0.yaml").write_text(text, encoding="utf-8", newline="\n")
        print(f"{name}.v0: {len(cases)} cases {doc['splits']}")

    if args.materialize:
        mdir = Path(args.materialize)
        mdir.mkdir(parents=True, exist_ok=True)
        for case in review:
            r = case["input"]["diff_recipe"]
            if r["kind"] == "commit":
                patch = git(repo, "show", "--format=", r["commit"])
            elif r["kind"] == "revert_src_hunks":
                # Reverting whole files would also revert inline tests; the recipe
                # keeps tests, so reverse only hunks above #[cfg(test)].
                patch = reverse_src_only(repo, r["commit"], r["paths"])
            else:
                patch = git(repo, "diff", f"{r['commit']}^", r["commit"], "--", *r["paths"])
            (mdir / f"{case['id']}.patch").write_text(patch, encoding="utf-8", newline="\n")
        print(f"materialized {len(review)} review diffs under {mdir}")
    return 0


def reverse_src_only(repo: Path, fix: str, paths) -> str:
    """The seeded-defect diff: the fix's non-test hunks, reversed, against the fix."""
    out = []
    for path in paths:
        raw = git(repo, "diff", "-R", "-U3", f"{fix}^", fix, "--", path)
        tmod = test_module_start(repo, fix, path) if path.endswith(".rs") else None
        header, hunks = [], []
        for line in raw.splitlines():
            if HUNK.match(line):
                hunks.append([line])
            elif hunks:
                hunks[-1].append(line)
            else:
                header.append(line)
        # Reversed diff: the "old" side is the fix, so test-module hunks start at or after tmod.
        keep = [h for h in hunks if tmod is None or int(HUNK.match(h[0]).group(1)) < tmod]
        if keep:
            out += header + [l for h in keep for l in h]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    sys.exit(main())
