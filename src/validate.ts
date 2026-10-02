// Cross-reference checks between a project manifest and the agent registry.
// Schema shape is checked at load time; this is about the parts fitting together.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Access, Agent, AgentRegistry, Project, Resource } from "./schema.ts";

export type Finding = { level: "error" | "warn" | "info"; where: string; message: string };

export type ValidateOptions = { checkPaths?: boolean };

export function validate(p: Project, reg: AgentRegistry, opts: ValidateOptions = {}): Finding[] {
  const out: Finding[] = [];
  const err = (where: string, message: string) => out.push({ level: "error", where, message });
  const warn = (where: string, message: string) => out.push({ level: "warn", where, message });
  const info = (where: string, message: string) => out.push({ level: "info", where, message });

  const agents = indexBy(reg.agents, "registry.agents", err);
  const resources = indexBy(p.resources, "resources", err);
  const procedures = indexBy(p.procedures, "procedures", err);
  const carriers = indexBy(p.carriers, "carriers", err);
  const flows = indexBy(p.flows, "flows", err);
  const roles = indexBy(p.roles, "roles", err);

  if (p.project.repo.resource && !resources.has(p.project.repo.resource)) {
    err("project.repo", `unknown resource '${p.project.repo.resource}'`);
  }

  // knowledge
  for (const k of p.knowledge) {
    const where = `knowledge[${k.ref}]`;
    const res = resourceRef(k.ref);
    if (res !== undefined) {
      if (!resources.has(res)) err(where, `unknown resource '${res}'`);
    } else if (opts.checkPaths && !existsSync(join(p.project.repo.path, k.ref))) {
      warn(where, `not found in ${p.project.repo.path}`);
    }
  }

  // procedures
  for (const pr of p.procedures) {
    for (const a of Object.keys(pr.entry)) {
      if (!agents.has(a)) err(`procedures.${pr.id}.entry`, `unknown agent '${a}'`);
    }
    if (pr.kind !== "recipe" && !pr.enforced_by) {
      info(`procedures.${pr.id}`, `${pr.kind} is prose only: nothing fails if it is broken`);
    }
  }

  // carriers
  for (const c of p.carriers) {
    if (c.resource && !resources.has(c.resource)) err(`carriers.${c.id}`, `unknown resource '${c.resource}'`);
  }

  // flows
  for (const f of p.flows) {
    const where = `flows.${f.id}`;
    const flowCarriers = [f.carriers.primary, ...f.carriers.mirrors.map((m) => m.carrier)];
    for (const c of flowCarriers) if (!carriers.has(c)) err(where, `unknown carrier '${c}'`);

    const states = new Set(f.states.map((s) => s.id));
    if (states.size !== f.states.length) err(where, "duplicate state ids");
    if (!f.states.some((s) => s.terminal)) warn(where, "no terminal state");

    for (const s of f.states) {
      for (const c of Object.keys(s.values)) {
        if (!flowCarriers.includes(c)) err(`${where}.${s.id}`, `value for carrier '${c}' not used by this flow`);
      }
    }
    // A mirror may reflect only some states; one that reflects none is an unknown mapping.
    for (const m of f.carriers.mirrors) {
      if (carriers.has(m.carrier) && !f.states.some((s) => m.carrier in s.values)) {
        info(where, `mirror '${m.carrier}' has no state mapping: an agent cannot read or set this flow's state there`);
      }
    }

    const outgoing = new Set<string>();
    const reached = new Set<string>([f.states[0]!.id]);
    for (const t of f.transitions) {
      const from = Array.isArray(t.from) ? t.from : [t.from];
      for (const s of [...from, t.to]) if (!states.has(s)) err(where, `transition uses unknown state '${s}'`);
      if (!roles.has(t.by)) err(where, `transition ${from.join("|")}→${t.to}: unknown role '${t.by}'`);
      for (const c of t.checks) {
        if (!procedures.has(c)) err(where, `transition ${from.join("|")}→${t.to}: unknown check '${c}'`);
      }
      from.forEach((s) => outgoing.add(s));
    }
    // reachability from the first state
    for (let grew = true; grew; ) {
      grew = false;
      for (const t of f.transitions) {
        const from = Array.isArray(t.from) ? t.from : [t.from];
        if (from.some((s) => reached.has(s)) && !reached.has(t.to)) {
          reached.add(t.to);
          grew = true;
        }
      }
    }
    for (const s of f.states) {
      if (!s.terminal && !outgoing.has(s.id)) warn(`${where}.${s.id}`, "non-terminal state has no way out");
      if (!reached.has(s.id)) warn(`${where}.${s.id}`, `unreachable from '${f.states[0]!.id}'`);
    }
  }

  // roles: bindings, capabilities, reach
  for (const r of p.roles) {
    const where = `roles.${r.id}`;
    for (const ib of r.inbox) {
      const [flowId, stateId] = ib.split(".");
      const f = flowId ? flows.get(flowId) : undefined;
      if (!f || !f.states.some((s) => s.id === stateId)) err(where, `unknown inbox '${ib}'`);
    }
    for (const u of r.uses) if (!resources.has(u)) err(where, `unknown resource '${u}'`);

    if (r.actor !== "agent") {
      if (r.agents.length) warn(where, `${r.actor} role lists agents`);
      continue;
    }
    if (!r.agents.length) {
      err(where, "no agent bound");
      continue;
    }
    const bound = r.agents.flatMap((a) => {
      const ag = agents.get(a);
      if (!ag) err(where, `unknown agent '${a}'`);
      return ag ? [ag] : [];
    });
    const able = bound.filter((a) => a.status !== "retired" && r.requires.every((c) => a.capabilities.includes(c)));
    if (bound.length && !able.length) {
      err(where, `no bound agent has ${r.requires.join(", ")}`);
    } else if (able[0] && able[0] !== bound[0]) {
      warn(where, `first choice '${bound[0]!.id}' cannot fill it; falls to '${able[0].id}'`);
    }
    for (const a of bound) {
      if (a.status === "retired") warn(where, `agent '${a.id}' is retired`);
      for (const u of r.uses) {
        const res = resources.get(u);
        if (!res) continue;
        const gap = reachGap(a, res);
        if (gap) warn(where, `${a.id} cannot reach '${u}' (needs ${gap})`);
      }
    }
    if (r.agents.length < 2) info(where, "single agent bound: no fallback when it hits a limit");
  }

  // continuity must be reachable by every agent that may take over
  const bindable = new Set(p.roles.flatMap((r) => r.agents).filter((a) => agents.has(a)));
  const cloudOnly = [...bindable].filter((a) => !agents.get(a)!.runs.includes("local"));
  if (cloudOnly.length) {
    for (const level of new Set(p.continuity.records.map((c) => c.level))) {
      const ok = p.continuity.records.some((c) => c.level === level && c.reachable_by.includes("cloud"));
      if (!ok) warn("continuity", `${level} record is local only: ${cloudOnly.join(", ")} cannot read or write it`);
    }
  }
  if (!p.continuity.records.length) warn("continuity", "no continuity records: a handoff starts from zero");

  for (const pol of p.policy) if (!agents.has(pol.agent)) err("policy", `unknown agent '${pol.agent}'`);

  return out;
}

/** What an agent lacks to reach a resource, or undefined if some path works. */
export function reachGap(agent: Agent, res: Resource): string | undefined {
  const paths = res.access.filter((x) => x.actor === "agent");
  if (!paths.length) return undefined; // human-only: not a gap, a handover point
  if (agent.connections.native.includes(res.provider)) return undefined;
  if (paths.some((x) => canUse(agent, x))) return undefined;
  return paths.map((x) => `${x.via}:${x.tool ?? "?"}`).join(" or ");
}

function canUse(agent: Agent, x: Access): boolean {
  switch (x.via) {
    case "mcp":
      return !!x.tool && agent.connections.mcp.includes(x.tool);
    case "cli":
      return !!x.tool && agent.connections.cli.includes(x.tool);
    case "ci": // reached by pushing to the code host, which every coding agent does
    case "api":
    case "web":
      return true;
  }
}

export function resourceRef(ref: string): string | undefined {
  const m = /^([a-z0-9][a-z0-9-]*):(?!\/\/)/.exec(ref);
  return m?.[1];
}

function indexBy<T extends { id: string }>(xs: T[], where: string, err: (w: string, m: string) => void) {
  const m = new Map<string, T>();
  for (const x of xs) {
    if (m.has(x.id)) err(where, `duplicate id '${x.id}'`);
    m.set(x.id, x);
  }
  return m;
}
