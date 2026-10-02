// Behaviour added after trial #95 (docs/trials/2026-10-pickup-95.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { globToRegex, matchesAny } from "../src/glob.ts";
import { usage } from "../src/help.ts";
import { checkObligations, pickup } from "../src/pickup.ts";
import { renderPickup } from "../src/pickup-render.ts";
import type { ExecResult } from "../src/providers/types.ts";
import { AgentRegistry, Procedure, Project } from "../src/schema.ts";

test("help says what every command reads and writes", () => {
  const all = usage();
  for (const cmd of ["validate", "brief", "pickup", "provision"]) assert.match(all, new RegExp(`uh ${cmd}`));
  assert.equal((all.match(/Writes:/g) ?? []).length, 4);
  assert.match(usage("pickup"), /Writes: nothing in the repo, on GitHub or in Linear/);
  assert.match(usage("pickup"), /--no-fetch skips it/);
});

test("globs: ** spans directories, * stays in one segment", () => {
  assert.ok(matchesAny("crates/cli-harness/tests/doctor.rs", ["crates/*/tests/**"]));
  assert.ok(!matchesAny("crates/cli-harness/src/doctor.rs", ["crates/*/tests/**"]));
  assert.ok(matchesAny("blog/public/vendor/harness-wasm/harness_wasm.js", ["blog/public/vendor/harness-wasm/**"]));
  assert.ok(matchesAny("README.md", ["README.md"]));
  assert.ok(!matchesAny("docs/README.md", ["README.md"]));
  assert.ok(globToRegex("**/x.md").test("x.md") && globToRegex("**/x.md").test("a/b/x.md"));
});

test("an obligation triggered by the changes reports the files it still needs", () => {
  const readme = Procedure.parse({
    id: "readme-sync", kind: "obligation", summary: "Update test counts",
    when: { paths: ["crates/*/tests/**"] }, touches: ["README.md", "AGENTS.md"],
  });
  const unrelated = Procedure.parse({ id: "wasm", kind: "obligation", summary: "s", when: { paths: ["crates/compiler/**"] } });
  const [o, ...rest] = checkObligations([readme, unrelated], ["crates/cli-harness/tests/doctor.rs", "AGENTS.md"]);
  assert.equal(rest.length, 0);
  assert.deepEqual(o!.missing, ["README.md"]);
  assert.deepEqual(o!.triggeredBy, ["crates/cli-harness/tests/doctor.rs"]);
  assert.deepEqual(checkObligations([readme], ["README.md"]), []);
});

const registry = AgentRegistry.parse({
  agents: [{ id: "grok-bot", name: "Grok Bot", runs: ["cloud"], instructions: { entry: "AGENTS.md" }, branch_prefixes: ["cursor"] }],
});

const project = Project.parse({
  project: { id: "demo", summary: "s", repo: { path: "." } },
  resources: [{ id: "gh", kind: "issue-tracker", provider: "github", locator: "o/r", access: [{ via: "cli", tool: "gh" }] }],
  carriers: [{ id: "gh-pr", kind: "pr-state", locator: "PR", resource: "gh", key: "branch" }],
  flows: [{
    id: "change", summary: "s", items: ["issue"], carriers: { primary: "gh-pr" },
    states: [{ id: "wip", values: { "gh-pr": "draft" } }, { id: "done", terminal: true, values: { "gh-pr": "merged" } }],
    transitions: [{ from: "wip", to: "done", by: "m" }],
  }],
  roles: [{ id: "m", summary: "s", actor: "human" }],
  procedures: [{
    id: "readme-sync", kind: "obligation", summary: "Update test counts",
    when: { paths: ["crates/*/tests/**"] }, touches: ["README.md"],
  }],
  identity: { keys: [{ id: "linear", pattern: "AI2-\\d+" }, { id: "github", pattern: "#\\d+" }] },
});

test("pickup: what merging closes, open siblings, and unmet obligations", async () => {
  const pr = (n: number, state: string, issue: number, extra = {}) => ({
    number: n, title: `[AI2-25 / #${issue}] part ${n}`, state, isDraft: state === "OPEN",
    headRefName: `cursor/part-${n}`, url: `u${n}`, closingIssuesReferences: [], ...extra,
  });
  const script: [string, unknown][] = [
    ["git branch --show-current", "main\n"],
    ["git rev-parse --verify --quiet refs/remotes/origin/cursor/part-95", "abc\n"],
    ["git rev-parse --verify --quiet main", "m\n"],
    ["git diff --name-only main...refs/remotes/origin/cursor/part-95", "crates/cli-harness/tests/doctor.rs\n"],
    ["gh pr view 95 --json number,title,state,headRefName,url,isDraft,updatedAt,body", { ...pr(95, "OPEN", 87), body: "Part of #87", baseRefName: "main", statusCheckRollup: [], comments: [] }],
    ["gh pr view 95", pr(95, "OPEN", 87)],
    ["gh pr list --state all --search", [pr(92, "MERGED", 84), pr(93, "MERGED", 85, { closingIssuesReferences: [{ number: 85 }] }), pr(95, "OPEN", 87)]],
    ["gh issue view 84", { state: "OPEN" }],
    ["gh issue view 85", { state: "CLOSED" }],
  ];
  const exec = (cmd: string, args: string[]): ExecResult => {
    const line = [cmd, ...args].join(" ");
    const hit = script.find(([p]) => line.startsWith(p));
    return hit ? { ok: true, out: typeof hit[1] === "string" ? hit[1] : JSON.stringify(hit[1]), err: "" } : { ok: false, out: "", err: "not scripted" };
  };
  const noFetch = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const r = await pickup(project, registry, { exec, fetch: noFetch, env: {} }, { ref: "#95", fetch: false });
  const md = renderPickup(r, project, registry);

  assert.match(md, /Merging closes no issue\./);
  assert.match(md, /\*\*#87 stays open after merge\*\*/);
  assert.match(md, /## Related work under AI2-25/);
  assert.match(md, /#92 merged \(#84\).*⚠ #84 is still open \(the PR did not close it\)/);
  assert.doesNotMatch(md, /#85 is still open/);
  assert.match(md, /1 issue\(s\) still open after their PR merged/);
  assert.match(md, /⚠ \*\*readme-sync\*\*.*does not change `README\.md`/);
});
