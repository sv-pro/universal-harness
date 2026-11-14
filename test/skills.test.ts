// The agent skills in skills/ are installed on other machines: they must not name this
// one, their links must resolve, and every command and flag they teach must exist.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";

const skills = readdirSync("skills", { recursive: true, encoding: "utf8" })
  .filter((f) => basename(f) === "SKILL.md")
  .map((f) => join("skills", f));
const files = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".md") || f.endsWith(".yaml"))
    .map((f) => join(dir, f));
const help = execFileSync(process.execPath, ["src/cli.ts", "--help"], { encoding: "utf8" });

test("skills exist", () => assert.ok(skills.length > 0));

for (const skill of skills) {
  const dir = dirname(skill);

  test(`${dir}: frontmatter names the skill and says when to use it`, () => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(skill, "utf8"))?.[1] ?? "";
    assert.match(fm, new RegExp(`^name: ${basename(dir)}$`, "m"));
    assert.match(fm, /^description: \S/m);
  });

  test(`${dir}: no machine-specific paths`, () => {
    for (const f of files(dir)) {
      const text = readFileSync(f, "utf8");
      for (const bad of [/\$HOME\b/, /(^|[\s"'`(])~\/\w/m, /\b[A-Z]:[\\/]/, /\/(Users|home)\//]) {
        assert.doesNotMatch(text, bad, f);
      }
    }
  });

  test(`${dir}: relative links resolve`, () => {
    for (const f of files(dir)) {
      for (const [, target] of readFileSync(f, "utf8").matchAll(/\]\(([^)#:]+)\)/g)) {
        assert.ok(existsSync(join(dirname(f), target!)), `${f} -> ${target}`);
      }
    }
  });

  test(`${dir}: every uh command and flag it uses exists`, () => {
    const text = files(dir).map((f) => readFileSync(f, "utf8")).join("\n");
    for (const [, cmd] of text.matchAll(/(?:^|`)uh (\w+)/gm)) assert.match(help, new RegExp(`^uh ${cmd}\\b`, "m"), cmd);
    for (const [flag] of text.matchAll(/(?<![\w-])--[a-z][\w-]*/g)) assert.ok(flag === "--help" || help.includes(flag), flag);
  });
}
