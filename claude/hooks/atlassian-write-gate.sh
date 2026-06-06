#!/usr/bin/env bash
# PreToolUse gate for the mcp-atlassian MCP server.
#
# Reads (get/search/download/batch_get) and jira_transition_issue auto-approve;
# every other Atlassian tool prompts. Fail-safe by design: anything not matched
# as a known read falls through to "ask", so new upstream write tools prompt
# automatically and never slip through silently.
#
# Inert on machines without the server: the matcher only fires for
# mcp__mcp-atlassian__* tools, and this script defers anything else.

input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // ""')

case "$tool" in
  mcp__mcp-atlassian__*) ;;
  *) exit 0 ;; # not ours — let normal permission rules decide
esac

if [[ "$tool" =~ ^mcp__mcp-atlassian__(jira|confluence)_(get|search|download|batch_get) ]] \
  || [[ "$tool" == "mcp__mcp-atlassian__jira_transition_issue" ]]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Atlassian read/transition — auto-approved"}}\n'
else
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Atlassian write — confirm before mutating Jira/Confluence"}}\n'
fi
