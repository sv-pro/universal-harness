import assert from "node:assert/strict";
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
  for (const f of ["projects/ai2rules/project.yaml", "projects/universal-harness/project.yaml"]) {
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
  const p = loadProject("projects/ai2rules/project.yaml");
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
  const p = loadProject("projects/ai2rules/project.yaml");
  assert.ok(p.project.repo.path.startsWith(homedir()), p.project.repo.path);
});

test("unknown keys are rejected (YAML flow maps split unquoted commas into keys)", () => {
  const r = Project.safeParse({
    project: { id: "p", summary: "s", repo: { path: "." } },
    knowledge: [{ ref: "README.md", role: "overview", authority: "descriptive", "test counts": null }],
  });
  assert.equal(r.success, false);
});
