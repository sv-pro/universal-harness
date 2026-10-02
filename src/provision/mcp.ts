// Which MCP connections each agent needs for a project, and how to give them.
import type { Agent, AgentRegistry, Connection, Project } from "../schema.ts";

export type Need = { agent: Agent; connection: Connection; roles: string[]; resources: string[] };

/** Connections an agent needs for the roles it may fill, and does not declare already. */
export function mcpNeeds(p: Project, reg: AgentRegistry): { needs: Need[]; unknown: string[] } {
  const byKey = new Map<string, Need>();
  const unknown = new Set<string>();
  for (const role of p.roles) {
    for (const resId of role.uses) {
      const res = p.resources.find((r) => r.id === resId);
      for (const a of res?.access ?? []) {
        if (a.via !== "mcp" || a.actor !== "agent" || !a.tool) continue;
        const conn = reg.connections.find((c) => c.id === a.tool);
        if (!conn) {
          unknown.add(a.tool);
          continue;
        }
        for (const agentId of role.agents) {
          const agent = reg.agents.find((x) => x.id === agentId);
          if (!agent || agent.status === "retired" || agent.connections.mcp.includes(conn.id)) continue;
          if (res && agent.connections.native.includes(res.provider)) continue;
          const key = `${agent.id}/${conn.id}`;
          const n = byKey.get(key) ?? { agent, connection: conn, roles: [], resources: [] };
          if (!n.roles.includes(role.id)) n.roles.push(role.id);
          if (!n.resources.includes(resId)) n.resources.push(resId);
          byKey.set(key, n);
        }
      }
    }
  }
  return { needs: [...byKey.values()], unknown: [...unknown] };
}

/** The server entry an agent's project MCP file expects. */
export function serverEntry(format: "mcp-json" | "gemini-settings", c: Connection): Record<string, string> {
  return format === "mcp-json" ? { type: "http", url: c.url! } : { httpUrl: c.url! };
}

export type JsonMerge =
  | { state: "created" | "updated" | "unchanged"; text: string; added: string[] }
  | { state: "conflict"; reason: string };

/** Add missing servers under `mcpServers`; never change or remove an existing entry. */
export function mergeMcpJson(file: string | undefined, servers: Record<string, Record<string, string>>): JsonMerge {
  let doc: { mcpServers?: Record<string, unknown> } & Record<string, unknown>;
  try {
    doc = file === undefined ? {} : (JSON.parse(file) as typeof doc);
  } catch (e) {
    return { state: "conflict", reason: `not valid JSON: ${(e as Error).message}` };
  }
  const existing = (doc.mcpServers ??= {});
  const added: string[] = [];
  for (const [name, entry] of Object.entries(servers)) {
    if (name in existing) {
      if (JSON.stringify(existing[name]) !== JSON.stringify(entry)) {
        return { state: "conflict", reason: `server '${name}' exists with a different config; left as is` };
      }
      continue;
    }
    existing[name] = entry;
    added.push(name);
  }
  if (!added.length) return { state: "unchanged", text: file ?? "", added };
  return { state: file === undefined ? "created" : "updated", text: `${JSON.stringify(doc, null, 2)}\n`, added };
}

/** Instructions for agents whose MCP config lives outside the repo. */
export function manualStep(n: Need): string {
  const c = n.connection;
  const custom = c.per_agent[n.agent.id];
  if (custom) return custom;
  if (!c.url) return `no portable endpoint for ${c.name}; connect it in ${n.agent.name} if it has an integration`;
  if (/config\.toml/.test(n.agent.mcp_config ?? "")) {
    return `add to ${n.agent.mcp_config ?? "~/.codex/config.toml"}:\n\n    [mcp_servers.${c.id}]\n    url = "${c.url}"`;
  }
  return `add MCP server '${c.id}' with URL ${c.url} in ${n.agent.mcp_config ?? `${n.agent.name}'s settings`}`;
}
