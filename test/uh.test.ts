import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { brief } from "../src/brief.ts";
import { loadAgents, loadProject } from "../src/load.ts";
import { AgentRegistry, Project } from "../src/schema.ts";
import { reachGap, validate } from "../src/validate.ts";

const registry = loadAgents("registry/agents.yaml");
const errors = (p: Project, reg = registry) => validate(p, reg).filter((f) => f.level === "error");
const warns = (p: Project, reg = registry) => validate(p, reg).filter((f) => f.level === "warn");

const base = () =>
  Project.parse({
    project: { id: "p", summary: "s", repo: { path: "." } },
    resources: [{ id: "code", kind: "code-host", provider: "github", locator: "o/r", access: [{ via: "cli", tool: "gh" }] }],
    carriers: [{ id: "c", kind: "folder", locator: "x" }],
    flows: [
      {
        id: "f",
        summary: "s",
        items: ["t"],
        carriers: { primary: "c" },
        states: [{ id: "a" }, { id: "b", terminal: true }],
        transitions: [{ from: "a", to: "b", by: "eng" }],
      },
    ],
    roles: [{ id: "eng", summary: "s", uses: ["code"], agents: ["claude-code"] }],
    continuity: { records: [{ level: "session", location: "HANDOFF.md", cadence: "often", reachable_by: ["local"] }] },
  });

test("real manifests have no errors", () => {
  for (const f of ["test/fixtures/ai2rules.project.yaml", ".uh/project.yaml"]) {
    assert.deepEqual(errors(loadProject(f)), [], f);
  }
});

test("minimal project is clean", () => {
  assert.deepEqual(errors(base()), []);
  assert.deepEqual(warns(base()), []);
});

test("transition with unknown role and state is an error", () => {
  const p = base();
  p.flows[0]!.transitions.push({ from: "a", to: "zz", by: "nobody", checks: ["nope"], effects: [] });
  const msgs = errors(p).map((f) => f.message).join("\n");
  assert.match(msgs, /unknown state 'zz'/);
  assert.match(msgs, /unknown role 'nobody'/);
  assert.match(msgs, /unknown check 'nope'/);
});

test("required capability no bound agent has is an error; falling back is a warning", () => {
  const p = base();
  p.roles[0]!.requires = ["image-generation"];
  assert.match(errors(p)[0]!.message, /no bound agent has image-generation/);
  p.roles[0]!.agents = ["claude-code", "antigravity"];
  assert.deepEqual(errors(p), []);
  assert.ok(warns(p).some((f) => /falls to 'antigravity'/.test(f.message)));
});

test("reach: mcp/cli need a declared connection, native covers the provider", () => {
  const reg = AgentRegistry.parse({
    agents: [
      { id: "a", name: "A", runs: ["local"], instructions: { entry: "AGENTS.md" }, connections: { cli: ["gh"] } },
      { id: "b", name: "B", runs: ["cloud"], instructions: { entry: "AGENTS.md" }, connections: { native: ["github"] } },
      { id: "c", name: "C", runs: ["local"], instructions: { entry: "AGENTS.md" } },
    ],
  });
  const res = base().resources[0]!;
  assert.equal(reachGap(reg.agents[0]!, res), undefined);
  assert.equal(reachGap(reg.agents[1]!, res), undefined);
  assert.equal(reachGap(reg.agents[2]!, res), "cli:gh");
});

test("a local-only record level is flagged when a cloud-only agent may take over", () => {
  const p = base();
  p.roles[0]!.agents = ["claude-code", "grok-bot"];
  assert.ok(warns(p).some((f) => /session record is local only: grok-bot/.test(f.message)));
  p.continuity.records[0]!.reachable_by = ["local", "cloud"];
  assert.ok(!warns(p).some((f) => f.where === "continuity"));
});

test("unreachable and dead-end states are warned", () => {
  const p = base();
  p.flows[0]!.states.splice(1, 0, { id: "stuck", terminal: false, values: {} });
  const w = warns(p).map((f) => `${f.where}: ${f.message}`).join("\n");
  assert.match(w, /f\.stuck: non-terminal state has no way out/);
  assert.match(w, /f\.stuck: unreachable/);
});

test("brief projected for an agent shows its roles and reach gaps", () => {
  const p = loadProject("test/fixtures/ai2rules.project.yaml");
  const all = brief(p, registry);
  assert.match(all, /## Work flows/);
  assert.match(all, /\*\*correcting-review\*\*.*Defined in .*review-blog\.md.*Claude Code: `\/review-blog`/);
  assert.match(all, /\*\*human only\*\*/);
  const grok = brief(p, registry, "grok-bot");
  assert.match(grok, /\*\*engine\*\*.*fallback #2/);
  assert.match(grok, /⚠ you lack mcp:linear/);
  assert.match(grok, /cannot see local, uncommitted files/);
});

test("a ~/ repo path is expanded per machine", async () => {
  const { homedir } = await import("node:os");
  const p = loadProject("test/fixtures/ai2rules.project.yaml");
  assert.ok(p.project.repo.path.startsWith(homedir()), p.project.repo.path);
  const own = loadProject(".uh/project.yaml");
  assert.equal(resolve(own.project.repo.path), resolve("."), "a manifest in <repo>/.uh/ belongs to that repo");
});

test("unknown keys are rejected (YAML flow maps split unquoted commas into keys)", () => {
  const r = Project.safeParse({
    project: { id: "p", summary: "s", repo: { path: "." } },
    knowledge: [{ ref: "README.md", role: "overview", authority: "descriptive", "test counts": null }],
  });
  assert.equal(r.success, false);
});

test("locate: a repo directory, a known id, or the repo above the current directory", async () => {
  const { locate } = await import("../src/locate.ts");
  const here = resolve(".");
  assert.equal(resolve(locate(undefined, resolve("src/provision")).project.project.repo.path), here);
  assert.equal(resolve(locate(".", "/").project.project.repo.path), here);
  assert.equal(resolve(locate("universal-harness", "/").project.project.repo.path), here);
  assert.throws(() => locate("no-such-project", "/"), /no project 'no-such-project'/);
});

test("locate: a checkout without the manifest reads it from the default branch", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { locate } = await import("../src/locate.ts");
  const repo = mkdtempSync(join(tmpdir(), "uh-locate-"));
  const git = (...a: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "ignore" });
  git("init", "-q", "-b", "main");
  git("commit", "-q", "--allow-empty", "-m", "base");
  git("switch", "-q", "-c", "old-feature");
  git("switch", "-q", "main");
  mkdirSync(join(repo, ".uh"));
  writeFileSync(join(repo, ".uh", "project.yaml"), "project: { id: demo, summary: s, repo: {} }\n");
  git("add", ".");
  git("commit", "-q", "-m", "manifest");
  git("switch", "-q", "old-feature");
  const found = locate(undefined, repo);
  assert.equal(found.project.project.id, "demo");
  assert.equal(found.file, "main:.uh/project.yaml");
  assert.equal(resolve(found.project.project.repo.path), resolve(repo));
});
