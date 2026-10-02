// uh provision: from a manifest and the agent registry, the changes that give
// every agent the same picture of the project. Repo files only; anything outside
// the repo (user-level agent config) becomes a manual step.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brief } from "../brief.ts";
import type { AgentRegistry, Project } from "../schema.ts";
import { generatedFile, upsertBlock } from "./blocks.ts";
import { manualStep, mcpNeeds, mergeMcpJson, serverEntry } from "./mcp.ts";
import { agentBlock, BRIEF_PATH, essentials } from "./render.ts";

export type Change = {
  path: string; // repo-relative
  state: "created" | "updated" | "unchanged" | "hand-edited" | "conflict";
  why: string;
  text?: string; // new content when created/updated
};

export type Plan = { changes: Change[]; manual: { agent: string; step: string }[]; warnings: string[] };

export type ProvisionOptions = { force?: boolean };

const SHARED_ENTRY = "AGENTS.md";

export function plan(p: Project, reg: AgentRegistry, opts: ProvisionOptions = {}): Plan {
  const repo = p.project.repo.path;
  const read = (rel: string) => (existsSync(join(repo, rel)) ? readFileSync(join(repo, rel), "utf8") : undefined);
  const changes: Change[] = [];
  const manual: Plan["manual"] = [];
  const warnings: string[] = [];
  const active = reg.agents.filter((a) => a.status !== "retired" && p.roles.some((r) => r.agents.includes(a.id)));

  // 1. the full brief, a file of its own
  const b = generatedFile(read(BRIEF_PATH), brief(p, reg), ".uh/project.yaml", opts);
  changes.push({ path: BRIEF_PATH, state: b.state, why: "full workspace brief", text: b.text });

  // 2. the shared entry file: a compact block every agent reads
  const shared = upsertBlock(read(SHARED_ENTRY), "workspace", essentials(p, reg), opts);
  changes.push({ path: SHARED_ENTRY, state: shared.state, why: "workspace and handoff essentials, read by every agent", text: shared.text });
  for (const a of active) {
    const limit = a.instructions.entry === SHARED_ENTRY ? a.instructions.max_bytes : undefined;
    const bytes = Buffer.byteLength(shared.text, "utf8");
    if (limit && bytes > limit) warnings.push(`${SHARED_ENTRY} is ${bytes} bytes; ${a.name} reads only the first ${limit}`);
  }

  // MCP connections each agent needs for its roles (written in step 4)
  const { needs, unknown } = mcpNeeds(p, reg);
  const viaRepo = (agentId: string) =>
    needs.filter((n) => n.agent.id === agentId && n.agent.project_mcp && n.connection.url).map((n) => n.connection.id);

  // 3. agent-specific entry files (CLAUDE.md): that agent's projection
  for (const a of active) {
    const entry = a.instructions.entry;
    if (entry === SHARED_ENTRY) continue;
    const r = upsertBlock(read(entry), `agent-${a.id}`, agentBlock(p, reg, a, viaRepo(a.id)), {
      ...opts,
      ...(a.instructions.imports ? { prefix: a.instructions.imports } : {}),
    });
    changes.push({ path: entry, state: r.state, why: `${a.name}'s own view: roles, reach gaps, entry points`, text: r.text });
  }

  // 4. MCP connections into the agents' project-scoped config files
  for (const t of unknown) warnings.push(`resource access names MCP '${t}', which is not in the registry's connections`);
  const byFile = new Map<string, { format: "mcp-json" | "gemini-settings"; servers: Record<string, Record<string, string>>; agents: Set<string> }>();
  for (const n of needs) {
    const pm = n.agent.project_mcp;
    if (pm && n.connection.url) {
      const f = byFile.get(pm.path) ?? { format: pm.format, servers: {}, agents: new Set<string>() };
      f.servers[n.connection.id] = serverEntry(pm.format, n.connection);
      f.agents.add(n.agent.name);
      byFile.set(pm.path, f);
      const ev = n.connection.evidence;
      if (ev !== "live") {
        warnings.push(`${n.connection.name} MCP URL ${ev === "docs" ? "checked against the provider's docs, not tested live" : "is unverified"}: ${n.connection.url}`);
      }
      continue;
    }
    manual.push({ agent: n.agent.name, step: `${n.connection.name} (for ${n.roles.join(", ")}): ${manualStep(n)}` });
  }
  for (const [path, f] of byFile) {
    const m = mergeMcpJson(read(path), f.servers);
    const why = `MCP servers for ${[...f.agents].join(", ")}`;
    if (m.state === "conflict") changes.push({ path, state: "conflict", why: `${why}: ${m.reason}` });
    else changes.push({ path, state: m.state, why: m.added.length ? `${why}: add ${m.added.join(", ")}` : why, text: m.text });
    if (m.state !== "conflict" && m.added.length) {
      manual.push({ agent: [...f.agents].join(", "), step: `approve and sign in to ${m.added.join(", ")} on first use (OAuth is per agent)` });
    }
  }

  return { changes, manual, warnings: [...new Set(warnings)] };
}

/** Write created/updated files. Returns the paths written. */
export function apply(p: Project, pl: Plan): string[] {
  const written: string[] = [];
  for (const c of pl.changes) {
    if ((c.state !== "created" && c.state !== "updated") || c.text === undefined) continue;
    const full = join(p.project.repo.path, c.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, c.text);
    written.push(c.path);
  }
  return written;
}

/** The generated text of each pending change: the owned blocks of shared files, or whole generated files. */
export function renderContent(pl: Plan): string {
  const L: string[] = [];
  for (const c of pl.changes) {
    if ((c.state !== "created" && c.state !== "updated") || c.text === undefined) continue;
    const blocks = [...c.text.matchAll(/<!-- uh:begin [\s\S]*?<!-- uh:end [^>]*-->/g)].map((m) => m[0]);
    L.push(`===== ${c.path} (${c.state}${blocks.length ? ", owned block only" : ""})`, "", (blocks.length ? blocks.join("\n\n") : c.text).replaceAll("\r\n", "\n").trimEnd(), "");
  }
  return L.join("\n");
}

export function renderPlan(p: Project, pl: Plan, mode: "dry-run" | "write" | "check", written: string[] = []): string {
  const L: string[] = [];
  const mark = { created: "+", updated: "~", unchanged: "=", "hand-edited": "!", conflict: "!" } as const;
  L.push(`${p.project.id} (${p.project.repo.path}): ${mode}`, "");
  for (const c of pl.changes) {
    const note = c.state === "hand-edited" ? "edited by hand since last provision; not touched (--force to overwrite)" : c.why;
    L.push(`  ${mark[c.state]} ${c.path.padEnd(14)} ${c.state.padEnd(11)} ${note}`);
  }
  if (pl.warnings.length) L.push("", "Warnings:", ...pl.warnings.map((w) => `  - ${w}`));
  if (pl.manual.length) L.push("", "Manual steps (outside the repo):", ...pl.manual.map((m) => `  - ${m.agent}: ${m.step.replaceAll("\n", "\n    ")}`));
  const pending = pl.changes.filter((c) => c.state === "created" || c.state === "updated").length;
  L.push("");
  if (mode === "write") L.push(`Wrote ${written.length} file(s). Review with git diff, then commit.`);
  else if (pending) L.push(`${pending} file(s) would change. Run with --write to apply.`);
  else L.push("Up to date.");
  return L.join("\n");
}
