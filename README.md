# universal-harness

When one coding agent stops mid-task (a usage limit, a crash, a better agent for the
next step), another should pick the work up without a long explanation. That needs
each project's setup written down once in a form every agent can use: where things
live, what is authoritative, which flows work moves through, who does what, and where
the handoff record is.

This repo holds that model and a small tool around it.

- `docs/model.md`: the categories, each derived from a real project (`ai2rules`).
- `registry/agents.yaml`: your agents, defined once.
- `projects/<id>/project.yaml`: one manifest per project.

```bash
npm install
npm link                       # optional: puts `uh` on PATH (Node >= 24 runs the TypeScript directly)
```

Inside a described repo, `uh` finds the project by the current directory; elsewhere,
pass `-p <id>` (a directory under `projects/`) or a manifest path.

```bash
uh validate -p ai2rules                    # gaps: reach, bindings, continuity
uh brief -p ai2rules --agent grok-bot      # the brief, projected for one agent
uh pickup "#95" --agent claude-code        # continue Grok Bot's PR (run inside ai2rules)
uh pickup AI2-25                           # parent key: lists its PRs
uh provision                               # dry run: what would be written into the repo
uh provision --show                        # ... and the generated text
uh provision --write                       # write it; --check fails if anything is stale
```

`pickup` is read-only (it runs `git fetch` unless `--no-fetch`). It uses your `gh`
login for GitHub and `LINEAR_API_KEY` for Linear; whatever it cannot read is listed
under Gaps instead of guessed.

`provision` writes only inside the project's repo, and only what it owns: a marked
block in `AGENTS.md`, one per agent-specific entry file (`CLAUDE.md`), `.uh/brief.md`,
and missing servers in `.mcp.json`. Hand edits to its blocks are detected and refused.
User-level agent config (Codex, Grok Bot) is printed as manual steps.

Status: model, `validate`, `brief`, `pickup`, `provision`. This repo provisions itself
(`npm run check` fails if its generated files are stale).
