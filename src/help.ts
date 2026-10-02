// Usage text. Each command says what it reads and what it writes, because an agent
// deciding whether it may run `uh` needs exactly that (trial #95: one agent read the
// source to find out, another skipped the tool).

const COMMON = `The project is the repo containing the current directory: its manifest is
.uh/project.yaml. Or pass -p <id> (listed in registry/projects.yaml), -p <repo dir>, or
-p <manifest.yaml>.`;

export const COMMANDS: Record<string, string> = {
  validate: `uh validate [-p project] [--quiet] [--no-paths]
  Check the project manifest against your agents: roles, reach, flows, handoff records.
  Reads:  the manifest, the agent registry, files in the project repo.
  Writes: nothing.`,
  brief: `uh brief [-p project] [--agent <id>]
  Print the full workspace brief, or one agent's view of it with --agent.
  Reads:  the manifest and the agent registry.
  Writes: nothing.`,
  pickup: `uh pickup [ref] [-p project] [--agent <id>] [--no-fetch] [--json]
  Everything needed to continue one item of work: identity, state in every tracker,
  next steps and their gates, the branch, the PR, checks, obligations the changes
  trigger, related work, and the handoff records.
  ref: an issue key (AI2-25), a number (#95), a branch, or a task slug; none = the
  checked-out branch.
  Reads:  git, GitHub (through your gh login), Linear (LINEAR_API_KEY), repo files.
  Writes: nothing in the repo, on GitHub or in Linear. Runs \`git fetch origin\`, which
          updates remote-tracking refs only; --no-fetch skips it.`,
  provision: `uh provision [-p project] [--write | --check] [--show] [--force]
  Generate what every agent reads: a block in AGENTS.md, one per agent-specific entry
  file (CLAUDE.md), .uh/brief.md, and missing MCP servers in .mcp.json.
  Reads:  the manifest, the agent registry, the target files.
  Writes: nothing by default (dry run). --write writes only its own marked blocks and
          files, never a block edited by hand (unless --force), never an existing MCP
          entry. --check exits 1 if anything is stale. --show prints the generated text.`,
};

export function usage(cmd?: string): string {
  if (cmd && COMMANDS[cmd]) return `${COMMANDS[cmd]}\n\n${COMMON}\n`;
  return [
    "uh: one workspace picture per project, so any coding agent can pick up another's work.",
    "",
    Object.values(COMMANDS).join("\n\n"),
    "",
    COMMON,
    "",
    "Common options: --agents <registry.yaml> (default: registry/agents.yaml of universal-harness).",
    "Source and docs: https://github.com/sv-pro/universal-harness",
    "",
  ].join("\n");
}
