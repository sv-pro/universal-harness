import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractKeys, seedKeys } from "../src/identity.ts";
import { pickup } from "../src/pickup.ts";
import { renderPickup } from "../src/pickup-render.ts";
import type { ExecResult } from "../src/providers/types.ts";
import { AgentRegistry, Project } from "../src/schema.ts";

const registry = AgentRegistry.parse({
  agents: [
    { id: "claude-code", name: "Claude Code", runs: ["local"], instructions: { entry: "CLAUDE.md" }, branch_prefixes: ["claude"] },
    { id: "grok-bot", name: "Grok Bot", runs: ["cloud"], instructions: { entry: "AGENTS.md" }, branch_prefixes: ["cursor"] },
  ],
});

function project(repo: string) {
  return Project.parse({
    project: { id: "demo", summary: "s", repo: { path: repo } },
    resources: [
      { id: "gh", kind: "issue-tracker", provider: "github", locator: "o/r", access: [{ via: "cli", tool: "gh" }] },
      { id: "lin", kind: "issue-tracker", provider: "linear", locator: "T", access: [{ via: "mcp", tool: "linear" }] },
    ],
    carriers: [
      { id: "linear-status", kind: "status", locator: "Linear", resource: "lin", key: "linear" },
      { id: "gh-issue", kind: "issue-state", locator: "issue", resource: "gh", key: "github" },
      { id: "gh-pr", kind: "pr-state", locator: "PR", resource: "gh", key: "branch" },
    ],
    flows: [
      {
        id: "change",
        summary: "s",
        items: ["issue"],
        carriers: { primary: "linear-status", mirrors: [{ carrier: "gh-issue" }, { carrier: "gh-pr", sync: "auto" }] },
        states: [
          { id: "open", values: { "linear-status": "todo", "gh-issue": "open" } },
          { id: "in-progress", values: { "linear-status": "in progress", "gh-issue": "open", "gh-pr": "draft" } },
          { id: "in-review", values: { "linear-status": "in review", "gh-issue": "open", "gh-pr": "open" } },
          { id: "closed", terminal: true, values: { "linear-status": "done", "gh-issue": "closed", "gh-pr": "merged" } },
        ],
        transitions: [
          { from: "open", to: "in-progress", by: "engine" },
          { from: "in-progress", to: "in-review", by: "engine" },
          { from: "in-review", to: "closed", by: "maintainer" },
        ],
      },
    ],
    roles: [
      { id: "engine", summary: "s", agents: ["claude-code", "grok-bot"] },
      { id: "maintainer", summary: "s", actor: "human" },
    ],
    identity: { keys: [{ id: "linear", pattern: "AI2-\\d+" }, { id: "github", pattern: "#\\d+" }] },
    continuity: { records: [{ level: "session", location: "HANDOFF.md", path: "HANDOFF.md", cadence: "often", reachable_by: ["local"] }] },
  });
}

const PR95 = { number: 95, title: "[AI2-25 / #87] Fixtures", state: "OPEN", isDraft: true, headRefName: "cursor/fixtures-87-15e5", url: "u95" };

/** Scripted exec: first matching prefix of "cmd arg arg…" wins; anything else fails. */
function scripted(script: [string, unknown][]) {
  const calls: string[] = [];
  const exec = (cmd: string, args: string[]): ExecResult => {
    const line = [cmd, ...args].join(" ");
    calls.push(line);
    const hit = script.find(([prefix]) => line.startsWith(prefix));
    if (!hit) return { ok: false, out: "", err: "not scripted" };
    const out = typeof hit[1] === "string" ? hit[1] : JSON.stringify(hit[1]);
    return { ok: true, out, err: "" };
  };
  return { exec, calls };
}

const noFetch = (async () => {
  throw new Error("no network in tests");
}) as unknown as typeof fetch;

test("identity: keys from text and from a ref", () => {
  const id = project(".").identity;
  assert.deepEqual(extractKeys(id, "[AI2-25 / #87] Fixtures"), { linear: "AI2-25", github: "#87" });
  assert.deepEqual(extractKeys(id, "codex/ai2-10-authorization"), { linear: "AI2-10" });
  assert.deepEqual(seedKeys(id, "95"), { github: "#95" });
  assert.deepEqual(seedKeys(id, "cursor/x"), { branch: "cursor/x" });
  assert.deepEqual(seedKeys(id, "hero-mcp-server"), { slug: "hero-mcp-server" });
});

test("a PR number resolves to its issue, branch and last agent; a draft PR means in progress", async () => {
  const { exec } = scripted([
    ["git branch --show-current", "main\n"],
    ["gh pr view 95", PR95],
    ["gh issue view 87", { state: "OPEN", title: "Fixtures", url: "u87" }],
  ]);
  const r = await pickup(project("."), registry, { exec, fetch: noFetch, env: {} }, { ref: "#95", agent: "claude-code", fetch: false });
  assert.equal(r.keys.pr, "95");
  assert.equal(r.keys.github, "#87");
  assert.equal(r.keys.linear, "AI2-25");
  assert.equal(r.keys.branch, "cursor/fixtures-87-15e5");
  assert.equal(r.lastAgent, "grok-bot");
  const change = r.flows.find((f) => f.flow === "change")!;
  assert.deepEqual(change.states, ["in-progress"]);
  assert.equal(change.basis, "mirrors");
  assert.equal(change.next[0]?.to, "in-review");
  assert.ok(r.gaps.some((g) => /linear-status: LINEAR_API_KEY/.test(g)));
  const md = renderPickup(r, project("."), registry);
  assert.match(md, /You are taking over from Grok Bot/);
  assert.match(md, /in-progress → \*\*in-review\*\* by engine .*← you can do this/);
});

test("the primary carrier wins, and a mirror that disagrees is reported", async () => {
  const { exec } = scripted([
    ["git branch --show-current", "main\n"],
    ["gh pr view 95", PR95],
    ["gh issue view 87", { state: "OPEN", title: "Fixtures", url: "u87" }],
  ]);
  const fetch = (async () => new Response(JSON.stringify({ data: { issue: { title: "t", url: "l", state: { name: "Done" } } } }))) as unknown as typeof globalThis.fetch;
  const r = await pickup(project("."), registry, { exec, fetch, env: { LINEAR_API_KEY: "k" } }, { ref: "#95", fetch: false });
  const change = r.flows.find((f) => f.flow === "change")!;
  assert.deepEqual(change.states, ["closed"]);
  assert.equal(change.basis, "primary");
  assert.ok(change.disagreements.some((d) => /gh-pr says draft/.test(d)));
  assert.ok(change.disagreements.some((d) => /gh-issue says open/.test(d)));
});

test("a parent key with several open PRs lists candidates and picks none", async () => {
  const other = { ...PR95, number: 96, title: "[AI2-25 / #88] Other", headRefName: "claude/other" };
  const { exec } = scripted([
    ["git branch --show-current", "main\n"],
    ["gh pr list --state all --search", [PR95, other]],
  ]);
  const r = await pickup(project("."), registry, { exec, fetch: noFetch, env: {} }, { ref: "AI2-25", fetch: false });
  assert.equal(r.keys.pr, undefined);
  assert.equal(r.candidates.length, 2);
});

test("a session record is never read from another branch's working tree", async () => {
  const repo = mkdtempSync(join(tmpdir(), "uh-"));
  writeFileSync(join(repo, "HANDOFF.md"), "# someone else's handoff\n");
  const { exec } = scripted([
    ["git branch --show-current", "main\n"],
    ["git rev-parse --verify --quiet refs/heads/main", "abc\n"],
  ]);
  const p = project(repo);

  const bySlug = await pickup(p, registry, { exec, fetch: noFetch, env: {} }, { ref: "unrelated-task", fetch: false });
  assert.deepEqual(bySlug.records[0]!.found, []);

  const checkedOut = await pickup(p, registry, { exec, fetch: noFetch, env: {} }, { ref: "main", fetch: false });
  assert.match(checkedOut.records[0]!.found[0]!.text, /someone else's handoff/);
});

test("a fresh branch (tip == main) is open, not merged", async () => {
  const p = Project.parse({
    project: { id: "u", summary: "s", repo: { path: "." } },
    resources: [{ id: "code", kind: "code-host", provider: "local-git", locator: ".", access: [{ via: "cli", tool: "git" }] }],
    carriers: [{ id: "branch", kind: "branch", locator: "git branch", resource: "code", key: "branch" }],
    flows: [
      {
        id: "change",
        summary: "s",
        items: ["change"],
        carriers: { primary: "branch" },
        states: [{ id: "wip", values: { branch: "open" } }, { id: "done", terminal: true, values: { branch: "merged" } }],
        transitions: [{ from: "wip", to: "done", by: "m" }],
      },
    ],
    roles: [{ id: "m", summary: "s", actor: "human" }],
  });
  const at = (tipOfBranch: string) =>
    scripted([
      ["git branch --show-current", "claude/x\n"],
      ["git rev-parse --verify --quiet refs/heads/claude/x", "t\n"],
      ["git rev-parse --verify --quiet main", "m\n"],
      ["git rev-parse refs/heads/claude/x", `${tipOfBranch}\n`],
      ["git rev-parse main", "m\n"],
      ["git merge-base --is-ancestor", ""],
    ]).exec;
  const state = async (tip: string) =>
    (await pickup(p, registry, { exec: at(tip), fetch: noFetch, env: {} }, { ref: "claude/x", fetch: false })).flows[0]!.states;
  assert.deepEqual(await state("m"), ["wip"]);
  assert.deepEqual(await state("older"), ["done"]);
});
