/**
 * Jira extension for pi — mirrors the atlassian-jira_* MCP tools available in
 * Copilot so existing skills work unchanged in either harness.
 *
 * Credentials are read from environment variables. Add to ~/.config/fish/config.local.fish
 * (gitignored, machine-local) and restart pi:
 *
 *   set -gx JIRA_URL        "https://your-org.atlassian.net"
 *   set -gx JIRA_EMAIL      "you@your-org.com"
 *   set -gx JIRA_API_TOKEN  "your-api-token"  # id.atlassian.com → Security → API tokens
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─── Credentials ─────────────────────────────────────────────────────────────

const JIRA_URL = (process.env.JIRA_URL ?? "").replace(/\/$/, "");
const JIRA_EMAIL = process.env.JIRA_EMAIL ?? "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN ?? "";

const CREDS_OK = JIRA_URL && JIRA_EMAIL && JIRA_API_TOKEN;
const AUTH = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`;

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function apiUrl(path: string, base: "rest/api/3" | "rest/agile/1.0" = "rest/api/3") {
  return `${JIRA_URL}/${base}${path}`;
}

async function jiraFetch(
  url: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    signal,
    headers: {
      Authorization: AUTH,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.errorMessages?.join(", ") ?? parsed.message ?? text;
    } catch { /* keep raw text */ }
    throw new Error(`Jira ${res.status}: ${detail}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function ok(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  if (!CREDS_OK) {
    pi.on("session_start", async (_e, ctx) => {
      ctx.ui.notify(
        "Jira extension: add JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN to ~/.config/fish/config.local.fish to enable Jira tools.",
        "warning",
      );
    });
    return;
  }

  // ── Search ────────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_search",
    label: "Jira: Search",
    description:
      "Search Jira issues using JQL (Jira Query Language). Returns matching issues with key, summary, status, assignee, and other fields.",
    parameters: Type.Object({
      jql: Type.String({ description: 'JQL query string. Examples: "project = DS AND status = \\"In Progress\\"", "assignee = currentUser() AND updated >= -7d"' }),
      fields: Type.Optional(Type.String({ description: 'Comma-separated fields to return. Default: summary,status,assignee,priority,issuetype,created,updated' })),
      limit: Type.Optional(Type.Number({ description: "Max results (1–100, default 25)", default: 25 })),
      start_at: Type.Optional(Type.Number({ description: "Pagination offset (0-based)", default: 0 })),
    }),
    async execute(_id, params, signal) {
      const fields = (params.fields ?? "summary,status,assignee,priority,issuetype,created,updated,labels,components,fixVersions").split(",").map((f) => f.trim());
      const body: Record<string, unknown> = {
        jql: params.jql,
        fields,
        maxResults: params.limit ?? 25,
      };
      // New /search/jql uses cursor-based pagination; startAt is not supported
      // Pass nextPageToken if start_at is provided as a stringified token
      if (params.start_at) body.nextPageToken = String(params.start_at);
      const data = await jiraFetch(
        apiUrl("/search/jql"),
        { method: "POST", body: JSON.stringify(body) },
        signal,
      );
      return { content: [{ type: "text", text: ok(data) }] };
    },
  });

  // ── Get issue ─────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_get_issue",
    label: "Jira: Get Issue",
    description: "Get a Jira issue by key. Returns full issue detail including description, comments, linked issues, and custom fields.",
    parameters: Type.Object({
      issue_key: Type.String({ description: "Jira issue key, e.g. DS-1234" }),
      fields: Type.Optional(Type.String({ description: 'Fields to return. Use "*all" for everything, or omit for defaults.' })),
    }),
    async execute(_id, params, signal) {
      const fields = params.fields ? `?fields=${encodeURIComponent(params.fields)}` : "";
      const data = await jiraFetch(apiUrl(`/issue/${params.issue_key}${fields}`), {}, signal);
      return { content: [{ type: "text", text: ok(data) }] };
    },
  });

  // ── Create issue ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_create_issue",
    label: "Jira: Create Issue",
    description: "Create a new Jira issue.",
    parameters: Type.Object({
      project_key: Type.String({ description: "Project key, e.g. DS" }),
      summary: Type.String({ description: "Issue title/summary" }),
      issue_type: Type.String({ description: 'Issue type, e.g. "Story", "Bug", "Task"' }),
      description: Type.Optional(Type.String({ description: "Description in Markdown" })),
      additional_fields: Type.Optional(Type.String({ description: 'JSON string of extra fields, e.g. {"labels":["x"],"priority":{"name":"Minor"}}' })),
    }),
    async execute(_id, params, signal) {
      const extra = params.additional_fields ? JSON.parse(params.additional_fields) : {};
      const body: Record<string, unknown> = {
        fields: {
          project: { key: params.project_key },
          summary: params.summary,
          issuetype: { name: params.issue_type },
          ...(params.description ? { description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: params.description }] }] } } : {}),
          ...extra,
        },
      };
      const data = await jiraFetch(apiUrl("/issue"), { method: "POST", body: JSON.stringify(body) }, signal);
      return { content: [{ type: "text", text: ok(data) }] };
    },
  });

  // ── Update issue ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_update_issue",
    label: "Jira: Update Issue",
    description: "Update fields on an existing Jira issue.",
    parameters: Type.Object({
      issue_key: Type.String({ description: "Jira issue key, e.g. DS-1234" }),
      fields: Type.String({ description: 'JSON string of fields to update, e.g. {"summary":"New title","assignee":{"accountId":"..."}}' }),
    }),
    async execute(_id, params, signal) {
      const fields = JSON.parse(params.fields);
      await jiraFetch(
        apiUrl(`/issue/${params.issue_key}`),
        { method: "PUT", body: JSON.stringify({ fields }) },
        signal,
      );
      return { content: [{ type: "text", text: `Updated ${params.issue_key}` }] };
    },
  });

  // ── Add comment ───────────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_add_comment",
    label: "Jira: Add Comment",
    description: "Add a comment to a Jira issue.",
    parameters: Type.Object({
      issue_key: Type.String({ description: "Jira issue key, e.g. DS-1234" }),
      body: Type.String({ description: "Comment text in Markdown" }),
    }),
    async execute(_id, params, signal) {
      const body = {
        body: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: params.body }] }],
        },
      };
      const data = await jiraFetch(
        apiUrl(`/issue/${params.issue_key}/comment`),
        { method: "POST", body: JSON.stringify(body) },
        signal,
      );
      return { content: [{ type: "text", text: ok(data) }] };
    },
  });

  // ── Get transitions ───────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_get_transitions",
    label: "Jira: Get Transitions",
    description: "Get the available status transitions for a Jira issue. Call this before transition_issue to get valid transition IDs.",
    parameters: Type.Object({
      issue_key: Type.String({ description: "Jira issue key, e.g. DS-1234" }),
    }),
    async execute(_id, params, signal) {
      const data = await jiraFetch(apiUrl(`/issue/${params.issue_key}/transitions`), {}, signal);
      return { content: [{ type: "text", text: ok(data) }] };
    },
  });

  // ── Transition issue ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_transition_issue",
    label: "Jira: Transition Issue",
    description: "Move a Jira issue to a new status. Call atlassian-jira_get_transitions first to get valid transition IDs.",
    parameters: Type.Object({
      issue_key: Type.String({ description: "Jira issue key, e.g. DS-1234" }),
      transition_id: Type.String({ description: "Transition ID from get_transitions, e.g. \"11\"" }),
      fields: Type.Optional(Type.String({ description: "Optional JSON string of fields required by this transition" })),
    }),
    async execute(_id, params, signal) {
      const body: Record<string, unknown> = { transition: { id: params.transition_id } };
      if (params.fields) body.fields = JSON.parse(params.fields);
      await jiraFetch(
        apiUrl(`/issue/${params.issue_key}/transitions`),
        { method: "POST", body: JSON.stringify(body) },
        signal,
      );
      return { content: [{ type: "text", text: `Transitioned ${params.issue_key} (transition ${params.transition_id})` }] };
    },
  });

  // ── Get sprints from board ─────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_get_sprints_from_board",
    label: "Jira: Get Sprints",
    description: "Get sprints for a Jira board. Filter by state: active, future, or closed.",
    parameters: Type.Object({
      board_id: Type.String({ description: "Board ID, e.g. \"9978\"" }),
      state: Type.Optional(Type.String({ description: "Sprint state filter: active, future, or closed" })),
      limit: Type.Optional(Type.Number({ description: "Max results (default 10)", default: 10 })),
      start_at: Type.Optional(Type.Number({ description: "Pagination offset", default: 0 })),
    }),
    async execute(_id, params, signal) {
      const state = params.state ? `&state=${params.state}` : "";
      const data = await jiraFetch(
        apiUrl(`/board/${params.board_id}/sprint?maxResults=${params.limit ?? 10}&startAt=${params.start_at ?? 0}${state}`, "rest/agile/1.0"),
        {},
        signal,
      );
      return { content: [{ type: "text", text: ok(data) }] };
    },
  });

  // ── Add issues to sprint ──────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_add_issues_to_sprint",
    label: "Jira: Add to Sprint",
    description: "Add one or more issues to a Jira sprint.",
    parameters: Type.Object({
      sprint_id: Type.String({ description: "Sprint ID" }),
      issue_keys: Type.String({ description: "Comma-separated issue keys, e.g. DS-1,DS-2" }),
    }),
    async execute(_id, params, signal) {
      const keys = params.issue_keys.split(",").map((k) => k.trim());
      const data = await jiraFetch(
        apiUrl(`/sprint/${params.sprint_id}/issue`, "rest/agile/1.0"),
        { method: "POST", body: JSON.stringify({ issues: keys }) },
        signal,
      );
      return { content: [{ type: "text", text: ok(data) }] };
    },
  });

  // ── Get all projects ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_get_all_projects",
    label: "Jira: Get Projects",
    description: "List all Jira projects accessible to the current user.",
    parameters: Type.Object({
      include_archived: Type.Optional(Type.Boolean({ description: "Include archived projects (default false)", default: false })),
    }),
    async execute(_id, params, signal) {
      const archived = params.include_archived ? "true" : "false";
      const data = await jiraFetch(
        apiUrl(`/project?expand=description&archived=${archived}`),
        {},
        signal,
      );
      return { content: [{ type: "text", text: ok(data) }] };
    },
  });

  // ── Get agile boards ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_get_agile_boards",
    label: "Jira: Get Boards",
    description: "List Jira agile boards, optionally filtered by name or project.",
    parameters: Type.Object({
      project_key: Type.Optional(Type.String({ description: "Filter by project key" })),
      board_name: Type.Optional(Type.String({ description: "Filter by board name (fuzzy)" })),
      board_type: Type.Optional(Type.String({ description: "Board type: scrum or kanban" })),
    }),
    async execute(_id, params, signal) {
      const qs = new URLSearchParams();
      if (params.project_key) qs.set("projectKeyOrId", params.project_key);
      if (params.board_name) qs.set("name", params.board_name);
      if (params.board_type) qs.set("type", params.board_type);
      const data = await jiraFetch(
        apiUrl(`/board?${qs.toString()}`, "rest/agile/1.0"),
        {},
        signal,
      );
      return { content: [{ type: "text", text: ok(data) }] };
    },
  });

  // ── Delete issue ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "atlassian-jira_delete_issue",
    label: "Jira: Delete Issue",
    description: "Delete a Jira issue. Irreversible — confirm with the user before calling.",
    parameters: Type.Object({
      issue_key: Type.String({ description: "Jira issue key, e.g. DS-1234" }),
    }),
    async execute(_id, params, signal) {
      await jiraFetch(apiUrl(`/issue/${params.issue_key}`), { method: "DELETE" }, signal);
      return { content: [{ type: "text", text: `Deleted ${params.issue_key}` }] };
    },
  });
}
