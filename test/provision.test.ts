import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tempDir } from "./tmp.ts";
import { generatedFile, upsertBlock } from "../src/provision/blocks.ts";
import { mergeMcpJson } from "../src/provision/mcp.ts";
import { apply, plan } from "../src/provision/plan.ts";
import { AgentRegistry, Project } from "../src/schema.ts";
import { projectMcpServers, validate } from "../src/validate.ts";

test("blocks: append, stay idempotent, update, keep CRLF", () => {
  const original = "# AGENTS.md\r\n\r\nOwn rules.\r\n";
  const a = upsertBlock(original, "workspace", "one");
  assert.equal(a.state, "updated");
  assert.ok(a.text.startsWith(original.trimEnd()));
  assert.ok(!/[^\r]\n/.test(a.text), "every line ending stays CRLF");
  assert.equal(upsertBlock(a.text, "workspace", "one").state, "unchanged");
  const b = upsertBlock(a.text, "workspace", "two");
  assert.equal(b.state, "updated");
  assert.match(b.text, /Own rules\.[\s\S]*two/);
  assert.doesNotMatch(b.text, /one/);
});

test("blocks: a hand-edited block is refused unless forced", () => {
  const a = upsertBlock(undefined, "workspace", "generated", { prefix: "@AGENTS.md" });
  assert.equal(a.state, "created");
  assert.ok(a.text.startsWith("@AGENTS.md\n\n<!-- uh:begin workspace"));
  const edited = a.text.replace("generated", "generated, plus my note");
  assert.equal(upsertBlock(edited, "workspace", "new").state, "hand-edited");
  assert.equal(upsertBlock(edited, "workspace", "new", { force: true }).state, "updated");
});

test("generated files: a file we did not write is never overwritten", () => {
  assert.equal(generatedFile("my own notes\n", "brief", "m").state, "hand-edited");
  const ours = generatedFile(undefined, "brief v1", "m");
  assert.equal(generatedFile(ours.text, "brief v1", "m").state, "unchanged");
  assert.equal(generatedFile(ours.text, "brief v2", "m").state, "updated");
  assert.equal(generatedFile(ours.text.replace("v1", "v1!"), "brief v2", "m").state, "hand-edited");
});

test("mcp json: add missing servers, never touch existing ones", () => {
  const linear = { type: "http", url: "https://l" };
  const created = mergeMcpJson(undefined, { linear });
  assert.equal(created.state, "created");
  const mine = JSON.stringify({ mcpServers: { mine: { command: "x" } } });
  const merged = mergeMcpJson(mine, { linear });
  assert.equal(merged.state, "updated");
  assert.deepEqual(Object.keys(JSON.parse((merged as { text: string }).text).mcpServers), ["mine", "linear"]);
  assert.equal(mergeMcpJson((merged as { text: string }).text, { linear }).state, "unchanged");
  assert.equal(mergeMcpJson(JSON.stringify({ mcpServers: { linear: { url: "other" } } }), { linear }).state, "conflict");
  assert.equal(mergeMcpJson("{ not json", { linear }).state, "conflict");
});

const registry = AgentRegistry.parse({
  agents: [
    {
      id: "claude-code", name: "Claude Code", runs: ["local"],
      instructions: { entry: "CLAUDE.md", imports: "@AGENTS.md" },
      project_mcp: { path: ".mcp.json", format: "mcp-json" },
    },
    {
      id: "codex", name: "Codex", runs: ["local"], mcp_config: "~/.codex/config.toml",
      instructions: { entry: "AGENTS.md", max_bytes: 3000 },
    },
  ],
  connections: [{ id: "linear", name: "Linear", url: "https://mcp.linear.app/mcp" }],
});

function project(repo: string) {
  return Project.parse({
    project: { id: "demo", summary: "A demo project.", repo: { path: repo } },
    resources: [{ id: "lin", kind: "issue-tracker", provider: "linear", locator: "T", access: [{ via: "mcp", tool: "linear" }] }],
    roles: [{ id: "engine", summary: "Builds things", uses: ["lin"], agents: ["claude-code", "codex"] }],
    continuity: { records: [{ level: "session", location: "HANDOFF.md", path: "HANDOFF.md", cadence: "after every step", reachable_by: ["local"] }] },
  });
}

test("plan → apply → plan is a no-op, and validate sees the provisioned MCP server", () => {
  const repo = tempDir("uh-prov-");
  writeFileSync(join(repo, "AGENTS.md"), "# AGENTS.md\n\nHouse rules.\n");
  const p = project(repo);

  const before = validate(p, registry, { projectMcp: (a) => projectMcpServers(p, a) });
  assert.ok(before.some((f) => /claude-code cannot reach 'lin'/.test(f.message)));

  const first = plan(p, registry);
  const states = Object.fromEntries(first.changes.map((c) => [c.path, c.state]));
  assert.deepEqual(states, { ".uh/brief.md": "created", "AGENTS.md": "updated", "CLAUDE.md": "created", ".mcp.json": "created" });
  assert.ok(first.manual.some((m) => m.agent === "Codex" && /\[mcp_servers\.linear\]/.test(m.step)));
  apply(p, first);

  assert.match(readFileSync(join(repo, "AGENTS.md"), "utf8"), /House rules\.[\s\S]*uh:begin workspace/);
  const claude = readFileSync(join(repo, "CLAUDE.md"), "utf8");
  assert.ok(claude.startsWith("@AGENTS.md"));
  assert.doesNotMatch(claude, /cannot reach/, "linear comes from .mcp.json, so no gap is reported");
  assert.deepEqual(JSON.parse(readFileSync(join(repo, ".mcp.json"), "utf8")), { mcpServers: { linear: { type: "http", url: "https://mcp.linear.app/mcp" } } });

  const again = plan(p, registry);
  assert.ok(again.changes.every((c) => c.state === "unchanged"), JSON.stringify(again.changes.map((c) => [c.path, c.state])));

  const after = validate(p, registry, { projectMcp: (a) => projectMcpServers(p, a) });
  assert.ok(!after.some((f) => /claude-code cannot reach/.test(f.message)));
  assert.ok(after.some((f) => /codex cannot reach 'lin'/.test(f.message)), "Codex still needs its user-level config");
});

test("an entry file beyond an agent's size limit is warned about", () => {
  const repo = tempDir("uh-prov-");
  writeFileSync(join(repo, "AGENTS.md"), `# AGENTS.md\n\n${"x".repeat(3000)}\n`);
  const w = plan(project(repo), registry).warnings;
  assert.ok(w.some((x) => /AGENTS\.md is \d+ bytes; Codex reads only the first 3000/.test(x)), w.join("\n"));
});
