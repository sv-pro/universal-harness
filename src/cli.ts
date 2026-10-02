// uh: validate a project manifest, or render its agent brief.
//   node src/cli.ts validate <project.yaml> [--agents <agents.yaml>] [--no-paths] [--quiet]
//   node src/cli.ts brief    <project.yaml> [--agents <agents.yaml>] [--agent <id>]
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { brief } from "./brief.ts";
import { LoadError, loadAgents, loadProject } from "./load.ts";
import { validate } from "./validate.ts";

const DEFAULT_AGENTS = join(dirname(fileURLToPath(import.meta.url)), "..", "registry", "agents.yaml");

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    agents: { type: "string", default: DEFAULT_AGENTS },
    agent: { type: "string" },
    "no-paths": { type: "boolean", default: false },
    quiet: { type: "boolean", short: "q", default: false },
  },
});

const [cmd, file] = positionals;
if (!cmd || !file || !["validate", "brief"].includes(cmd)) {
  console.error("usage: uh validate|brief <project.yaml> [--agents file] [--agent id]");
  process.exit(2);
}

try {
  const project = loadProject(file);
  const registry = loadAgents(values.agents);
  if (cmd === "brief") {
    process.stdout.write(brief(project, registry, values.agent));
  } else {
    const findings = validate(project, registry, { checkPaths: !values["no-paths"] });
    const shown = values.quiet ? findings.filter((f) => f.level !== "info") : findings;
    for (const f of shown) console.log(`${f.level.padEnd(5)} ${f.where}: ${f.message}`);
    const count = (l: string) => findings.filter((f) => f.level === l).length;
    console.log(`\n${project.project.id}: ${count("error")} errors, ${count("warn")} warnings, ${count("info")} notes`);
    process.exit(count("error") ? 1 : 0);
  }
} catch (e) {
  if (e instanceof LoadError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
