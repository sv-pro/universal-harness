// Linear through its GraphQL API. Needs LINEAR_API_KEY; without it the carrier is
// reported unreadable (agents with a Linear MCP connection can still read it themselves).
import type { Provider, Reading } from "./types.ts";

const QUERY = "query($id: String!) { issue(id: $id) { identifier title url state { name } } }";

export const linearProvider: Provider = {
  id: "linear",
  reads: (c, res) => res?.provider === "linear" && c.kind === "status",

  async read(c, keys, ctx): Promise<Reading> {
    const id = c.key ? keys[c.key] : undefined;
    if (!id) return { status: "absent", detail: `no ${c.key ?? "linear"} key` };
    const token = ctx.env.LINEAR_API_KEY;
    if (!token) return { status: "unreadable", reason: "LINEAR_API_KEY is not set" };
    try {
      const res = await ctx.fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: token },
        body: JSON.stringify({ query: QUERY, variables: { id } }),
      });
      if (!res.ok) return { status: "unreadable", reason: `Linear API ${res.status}` };
      type Body = { data?: { issue?: { title: string; url: string; state: { name: string } } }; errors?: { message: string }[] };
      const body = (await res.json()) as Body;
      const issue = body.data?.issue;
      if (!issue) return { status: "absent", detail: body.errors?.[0]?.message ?? `${id} not found` };
      return { status: "found", value: issue.state.name.toLowerCase(), url: issue.url, detail: issue.title };
    } catch (e) {
      return { status: "unreadable", reason: (e as Error).message };
    }
  },
};
