// Carriers that are files in the repo: a folder per state (a filesystem kanban),
// or a frontmatter field in a per-item file.
import { slugMatches } from "../identity.ts";
import type { Provider, Reading } from "./types.ts";

export const filesProvider: Provider = {
  id: "files",
  reads: (c) => c.kind === "folder" || c.kind === "frontmatter",

  async read(c, keys, ctx): Promise<Reading> {
    const key = keys[c.key ?? "slug"];
    if (!key) return { status: "absent", detail: `no ${c.key ?? "slug"} key` };

    if (c.kind === "folder") {
      // The item file sits in one of the state folders, named after the item.
      for (const dir of ctx.valuesOf(c.id)) {
        const listing = ctx.exec("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", dir]);
        for (const f of listing.out.split("\n").filter(Boolean)) {
          if (slugMatches(key, f)) return { status: "found", value: dir, detail: f };
        }
      }
      return { status: "absent", detail: `no ${key}.md in ${ctx.valuesOf(c.id).join(", ")}` };
    }

    for (const tpl of c.paths) {
      const path = tpl.replaceAll("{slug}", key);
      const file = ctx.readFile(path, keys);
      if (!file) continue;
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(file.text)?.[1] ?? "";
      const m = new RegExp(`^${c.field}\\s*:\\s*(.+)$`, "m").exec(fm);
      return { status: "found", value: (m?.[1] ?? "").trim().replace(/^["']|["']$/g, ""), detail: file.from };
    }
    return { status: "absent", detail: `none of ${c.paths.join(", ")}` };
  },
};
