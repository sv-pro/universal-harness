#!/usr/bin/env node
// uh: describe a workspace once, hand work between agents.
//   uh validate  [--project p] [--no-paths] [--quiet]
//   uh brief     [--project p] [--agent id]
//   uh pickup    [ref] [--project p] [--agent id] [--no-fetch] [--json]
//   uh provision [--project p] [--write | --check] [--force] [--show]
// The project is a manifest path or id; by default, the one whose repo contains the
// current directory. For compatibility, a first positional ending in .yaml is the project.
import { join } from "node:path";
import { parseArgs } from "node:util";
import { brief } from "./brief.ts";
import { LoadError, loadAgents } from "./load.ts";
import { HOME, locate } from "./locate.ts";
import { pickup } from "./pickup.ts";
import { renderPickup } from "./pickup-render.ts";
import { apply, plan, renderContent, renderPlan } from "./provision/plan.ts";
import { realExec } from "./providers/types.ts";
import { projectMcpServers, validate } from "./validate.ts";

const COMMANDS = ["validate", "brief", "pickup", "provision"];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: "string", short: "p" },
    agents: { type: "string", default: join(HOME, "registry", "agents.yaml") },
    agent: { type: "string" },
    "no-paths": { type: "boolean", default: false },
    "no-fetch": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    quiet: { type: "boolean", short: "q", default: false },
    write: { type: "boolean", default: false },
    check: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    show: { type: "boolean", default: false },
  },
});

const [cmd, ...rest] = positionals;
if (!cmd || !COMMANDS.includes(cmd)) {
  console.error(`usage: uh ${COMMANDS.join("|")} [ref] [--project id|path] [--agent id]`);
  process.exit(2);
}
const projectArg = values.project ?? (rest[0]?.match(/\.ya?ml$/) ? rest.shift() : undefined);
const ref = rest[0];

try {
  const { project } = locate(projectArg, process.cwd());
  const registry = loadAgents(values.agents);
  if (values.agent && !registry.agents.some((a) => a.id === values.agent)) {
    throw new LoadError(`unknown agent '${values.agent}'; known: ${registry.agents.map((a) => a.id).join(", ")}`);
  }

  if (cmd === "brief") {
    process.stdout.write(brief(project, registry, values.agent));
  } else if (cmd === "pickup") {
    const base = { exec: realExec(project.project.repo.path), fetch, env: process.env };
    const report = await pickup(project, registry, base, {
      ...(ref ? { ref } : {}),
      ...(values.agent ? { agent: values.agent } : {}),
      fetch: !values["no-fetch"],
    });
    process.stdout.write(values.json ? JSON.stringify(report, null, 2) : renderPickup(report, project, registry));
  } else if (cmd === "provision") {
    const pl = plan(project, registry, { force: values.force });
    const mode = values.write ? "write" : values.check ? "check" : "dry-run";
    const written = values.write ? apply(project, pl) : [];
    if (values.show) console.log(renderContent(pl));
    console.log(renderPlan(project, pl, mode, written));
    const blocked = pl.changes.some((c) => c.state === "hand-edited" || c.state === "conflict");
    const pending = pl.changes.some((c) => c.state === "created" || c.state === "updated");
    process.exit(blocked || (mode === "check" && pending) ? 1 : 0);
  } else {
    const findings = validate(project, registry, {
      checkPaths: !values["no-paths"],
      ...(values["no-paths"] ? {} : { projectMcp: (a) => projectMcpServers(project, a) }),
    });
    const shown = values.quiet ? findings.filter((f) => f.level !== "info") : findings;
    for (const f of shown) console.log(`${f.level.padEnd(5)} ${f.where}: ${f.message}`);
    const count = (l: string) => findings.filter((f) => f.level === l).length;
    console.log(`\n${project.project.id}: ${count("error")} errors, ${count("warn")} warnings, ${count("info")} notes`);
    process.exit(count("error") ? 1 : 0);
  }
} catch (e) {
  if (e instanceof LoadError || (e instanceof Error && /^no project/.test(e.message))) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
