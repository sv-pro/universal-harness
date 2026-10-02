# Connecting Claude Code to Linear

For Claude Code working on universal-harness and ai2rules. Written 2026-10-02.
Official setup documentation was checked; no live connection was tested.

## Claude Code: use Linear MCP

Linear hosts its MCP server at `https://mcp.linear.app/mcp`. Use HTTP with browser
OAuth; no personal API key is required. The `/sse` endpoint is a deprecated
fallback. For inspection only, use `https://mcp.linear.app/mcp/readonly`.
Source: [Linear MCP documentation](https://linear.app/docs/mcp).

Inspect existing configuration in the terminal where Claude Code runs:

```powershell
claude mcp list
claude mcp get linear
```

Reuse an existing Linear entry, including one under another name. If none exists,
add a personal connection available across projects on this machine:

```powershell
claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp
```

Start Claude Code and run `/mcp`. Select Linear and authenticate in the browser
with the intended account and workspace. Check connection status in `/mcp` or
with `claude mcp get linear`.

User scope is stored in `~/.claude.json`. For shared repository configuration,
run the add command from that repository with `--scope project` instead of
`--scope user`. This writes `.mcp.json`; preserve its existing entries. Project
servers may require approval in Claude Code. Sharing configuration does not
authenticate another user.
Source: [Claude Code MCP reference](https://code.claude.com/docs/en/mcp).

## Verify access and record evidence

Ask Claude Code:

> Use the connected Linear tools to read AI2-25. Report its identifier, title,
> URL, team and current status. List the AI2 team's workflow statuses. Do not
> change any issues.

Use the tools actually exposed by the server; do not assume tool names. If the
issue cannot be read, report the error and confirm workspace and team access.
AI2 identifiers in the manifest are not evidence of authenticated access.

The registry currently does not declare Claude Code connected to Linear. Only
after a successful read, record the tested surface and add `linear` to its
`connections.mcp` in `registry/agents.yaml`. A generated `.mcp.json` is configuration,
not verification. A working Windows session does not establish WSL or cloud access.

Read actual team statuses before mapping `linear-status` values in
`projects/ai2rules/project.yaml`. These mappings are currently unspecified.
`src/providers/linear.ts` lowercases status names; use that form in mappings.
Do not infer Linear statuses from GitHub states. AI2-25 can span multiple PRs,
so its state alone does not establish the state of every child item.

## `uh pickup`: a separate API connection

The harness provider in `src/providers/linear.ts` calls Linear's GraphQL API
directly. It does not reuse Claude Code's MCP OAuth session. Without
`LINEAR_API_KEY`, the Linear carrier is unreadable and appears under Gaps.

Create a personal API key in Linear's Security & access settings, with only the
access the reader needs. Personal keys use the raw key as the GraphQL
Authorization header, matching the provider. Source:
[Linear GraphQL authentication](https://linear.app/developers/graphql).

From universal-harness with Node 24 or newer, this PowerShell example prompts
without putting the key in command history. It temporarily sets the variable
for this shell and the child process, then removes it:

```powershell
$linearCredential = Read-Host 'Linear API key' -AsSecureString
$env:LINEAR_API_KEY = [System.Net.NetworkCredential]::new('', $linearCredential).Password
try {
    npm run uh -- pickup AI2-25 --project ai2rules --agent claude-code
} finally {
    Remove-Item Env:LINEAR_API_KEY -ErrorAction SilentlyContinue
    Remove-Variable linearCredential
}
```

Verify a real Linear carrier reading in the output. A mocked test does not verify
live API access. A readable status still needs manifest mappings for flow inference.
Never put credentials in manifests, source files, handoffs or committed MCP config.

## Troubleshooting and handoff

- Authentication needed: complete the `/mcp` browser flow.
- Project approval pending: open Claude Code in that repository and approve
  the server through its interface.
- Wrong workspace or inaccessible issue: confirm account, workspace and team access.
- Missing configuration on another host: inspect that host's `/mcp` state.
- MCP works but pickup reports a missing key: supply `LINEAR_API_KEY` to the
  harness process using the separate API route above.

Keep `HANDOFF.md` current with the tested surface, readable issue, discovered
statuses and remaining gaps. Record evidence, never credentials. This guide
does not establish a live connection or authorize tracker changes.
