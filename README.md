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
node src/cli.ts validate projects/ai2rules/project.yaml        # gaps: reach, bindings, continuity
node src/cli.ts brief projects/ai2rules/project.yaml           # the agent-facing brief
node src/cli.ts brief projects/ai2rules/project.yaml --agent grok-bot
node src/cli.ts pickup projects/ai2rules/project.yaml "#95" --agent claude-code   # continue Grok Bot's PR
node src/cli.ts pickup projects/ai2rules/project.yaml AI2-25                      # parent key: lists its PRs
node src/cli.ts pickup projects/universal-harness/project.yaml                    # the checked-out branch
```

`pickup` is read-only (it runs `git fetch` unless `--no-fetch`). It uses your `gh`
login for GitHub and `LINEAR_API_KEY` for Linear; whatever it cannot read is listed
under Gaps instead of guessed.

Status: model, `validate`, `brief`, `pickup`. Next: provisioning each agent's native
config from the manifest.
