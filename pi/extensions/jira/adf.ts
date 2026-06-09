/**
 * Markdown → ADF (Atlassian Document Format) converter.
 *
 * Dependency-free, line-by-line parser ported from the mcp-atlassian fork
 * (src/mcp_atlassian/models/jira/adf.py). Jira Cloud v3 rich-text fields
 * (description, environment) and comment bodies must be ADF doc objects, not
 * strings — passing a bare string yields a 400. Use markdownToAdf() to wrap.
 *
 * Supports: inline marks (bold/italic/code/strike/links/status), headings,
 * blockquotes, ordered/unordered lists, fenced code, horizontal rules, tables,
 * panel blocks ({info}/{note}/{warning}/{error}/{success}/{tip}), and
 * expand/collapse blocks ({expand:Title}...{expand}).
 */

type AdfNode = Record<string, unknown>;
export interface AdfDoc {
  version: number;
  type: "doc";
  content: AdfNode[];
}

const VALID_STATUS_COLORS = new Set([
  "neutral",
  "purple",
  "blue",
  "red",
  "yellow",
  "green",
]);

const STATUS_RE = /\{status:(?:color=(?<color>\w+)\|)?title=(?<title>[^}]+)\}/g;

const INLINE_RE =
  /`(?<code_inner>[^`]+)`|\*\*(?<bold_inner>.+?)\*\*|~~(?<strike_inner>.+?)~~|\[(?<link_text>[^\]]+)\]\((?<link_href>[^)]+)\)|(?<!\*)\*(?!\*)(?<italic_inner>.+?)(?<!\*)\*(?!\*)/g;

/** Parse inline Markdown formatting into ADF inline nodes. */
function parseInlineFormatting(text: string): AdfNode[] {
  if (!text) return [];

  const nodes: AdfNode[] = [];
  const statusPlaceholders = new Map<string, AdfNode>();
  let placeholderIdx = 0;

  // Pre-pass: replace status lozenges with placeholders.
  const withPlaceholders = text.replace(STATUS_RE, (_m, color, title) => {
    let c = (color as string) || "neutral";
    if (!VALID_STATUS_COLORS.has(c)) c = "neutral";
    const key = `\x00STATUS${placeholderIdx}\x00`;
    statusPlaceholders.set(key, {
      type: "status",
      attrs: { text: title, color: c, style: "" },
    });
    placeholderIdx += 1;
    return key;
  });

  let pos = 0;
  for (const m of withPlaceholders.matchAll(INLINE_RE)) {
    const start = m.index ?? 0;
    if (start > pos) {
      const plain = withPlaceholders.slice(pos, start);
      if (plain) nodes.push({ type: "text", text: plain });
    }

    const g = m.groups ?? {};
    if (g.code_inner != null) {
      nodes.push({ type: "text", text: g.code_inner, marks: [{ type: "code" }] });
    } else if (g.bold_inner != null) {
      nodes.push({ type: "text", text: g.bold_inner, marks: [{ type: "strong" }] });
    } else if (g.strike_inner != null) {
      nodes.push({ type: "text", text: g.strike_inner, marks: [{ type: "strike" }] });
    } else if (g.link_text != null) {
      nodes.push({
        type: "text",
        text: g.link_text,
        marks: [{ type: "link", attrs: { href: g.link_href } }],
      });
    } else if (g.italic_inner != null) {
      nodes.push({ type: "text", text: g.italic_inner, marks: [{ type: "em" }] });
    }

    pos = start + m[0].length;
  }

  if (pos < withPlaceholders.length) {
    const remaining = withPlaceholders.slice(pos);
    if (remaining) nodes.push({ type: "text", text: remaining });
  }

  if (nodes.length === 0 && withPlaceholders) {
    nodes.push({ type: "text", text: withPlaceholders });
  }

  // Post-pass: expand status placeholders into ADF status nodes.
  if (statusPlaceholders.size > 0) {
    const expanded: AdfNode[] = [];
    for (const node of nodes) {
      const t = node.type === "text" ? (node.text as string) : "";
      if (node.type === "text" && t.includes("\x00STATUS")) {
        const parts = t.split(/(\x00STATUS\d+\x00)/u);
        const marks = node.marks;
        for (const part of parts) {
          if (statusPlaceholders.has(part)) {
            expanded.push(statusPlaceholders.get(part)!);
          } else if (part) {
            const n: AdfNode = { type: "text", text: part };
            if (marks) n.marks = marks;
            expanded.push(n);
          }
        }
      } else {
        expanded.push(node);
      }
    }
    return expanded;
  }

  return nodes;
}

function makeParagraph(text: string): AdfNode {
  const content = parseInlineFormatting(text);
  return {
    type: "paragraph",
    content: content.length ? content : [{ type: "text", text: "" }],
  };
}

function makeListItem(text: string): AdfNode {
  return { type: "listItem", content: [makeParagraph(text)] };
}

const PANEL_TYPES = ["info", "note", "warning", "error", "success", "tip"] as const;
const PANEL_TYPE_MAP: Record<string, string> = {
  info: "info",
  note: "note",
  warning: "warning",
  error: "error",
  success: "success",
  tip: "success",
};

/** Convert Markdown text to an ADF document. */
export function markdownToAdf(markdownText: string): AdfDoc {
  const doc: AdfDoc = { version: 1, type: "doc", content: [] };

  if (!markdownText) {
    doc.content.push({ type: "paragraph", content: [] });
    return doc;
  }

  const lines = markdownText.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // --- Expand/collapse block ---
    const expandMatch = /^\{expand(?::(.+?))?\}\s*$/u.exec(line);
    if (expandMatch) {
      const title = expandMatch[1] ?? "";
      const inner: string[] = [];
      i += 1;
      while (i < lines.length && !/^\{expand\}\s*$/u.test(lines[i])) {
        inner.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing {expand}
      const innerDoc = markdownToAdf(inner.join("\n"));
      doc.content.push({
        type: "expand",
        attrs: { title },
        content: innerDoc.content,
      });
      continue;
    }

    // --- Panel blocks ---
    const panelOpen = new RegExp(
      `^\\{(${PANEL_TYPES.join("|")})(?::title=(.+?))?\\}\\s*$`,
      "u",
    ).exec(line);
    if (panelOpen) {
      const panelType = panelOpen[1];
      const panelTitle = panelOpen[2] ?? "";
      const adfPanelType = PANEL_TYPE_MAP[panelType] ?? "info";
      const closeRe = new RegExp(`^\\{${panelType}\\}\\s*$`, "u");
      const inner: string[] = [];
      i += 1;
      while (i < lines.length && !closeRe.test(lines[i])) {
        inner.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing tag
      const innerDoc = markdownToAdf(inner.join("\n"));
      let panelContent = innerDoc.content;
      if (panelTitle) {
        panelContent = [
          {
            type: "paragraph",
            content: [{ type: "text", text: panelTitle, marks: [{ type: "strong" }] }],
          },
          ...panelContent,
        ];
      }
      doc.content.push({
        type: "panel",
        attrs: { panelType: adfPanelType },
        content: panelContent,
      });
      continue;
    }

    // --- Fenced code block ---
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing ```
      doc.content.push({
        type: "codeBlock",
        attrs: lang ? { language: lang } : {},
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      continue;
    }

    const stripped = line.trim();

    // --- Horizontal rule ---
    if (
      (stripped === "---" || stripped === "***" || stripped === "___" ||
        (stripped.length >= 3 &&
          [...stripped].every((c) => c === stripped[0]) &&
          "-*_".includes(stripped[0]))) &&
      !line.startsWith("- ") &&
      !line.startsWith("* ")
    ) {
      doc.content.push({ type: "rule" });
      i += 1;
      continue;
    }

    // --- Heading ---
    const headingMatch = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (headingMatch) {
      doc.content.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: parseInlineFormatting(headingMatch[2]),
      });
      i += 1;
      continue;
    }

    // --- Blockquote ---
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i += 1;
      }
      doc.content.push({
        type: "blockquote",
        content: quoteLines.map(makeParagraph),
      });
      continue;
    }

    // --- Unordered list ---
    if (/^[-*]\s+/u.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^[-*]\s+/u.test(lines[i])) {
        items.push(makeListItem(lines[i].replace(/^[-*]\s+/u, "")));
        i += 1;
      }
      doc.content.push({ type: "bulletList", content: items });
      continue;
    }

    // --- Ordered list ---
    if (/^\d+\.\s+/u.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^\d+\.\s+/u.test(lines[i])) {
        items.push(makeListItem(lines[i].replace(/^\d+\.\s+/u, "")));
        i += 1;
      }
      doc.content.push({ type: "orderedList", content: items });
      continue;
    }

    // --- Table ---
    if (line.startsWith("|") && line.slice(1).includes("|")) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableRows.push(lines[i]);
        i += 1;
      }
      const dataRows: string[][] = [];
      for (const rowLine of tableRows) {
        const cells = rowLine.replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((c) => c.trim());
        if (cells.filter((c) => c).every((c) => /^:?-+:?$/u.test(c))) continue;
        dataRows.push(cells);
      }
      if (dataRows.length) {
        const adfRows: AdfNode[] = dataRows.map((cells, idx) => {
          const cellType = idx === 0 ? "tableHeader" : "tableCell";
          return {
            type: "tableRow",
            content: cells.map((cellText) => {
              const content = parseInlineFormatting(cellText);
              return {
                type: cellType,
                content: [
                  { type: "paragraph", content: content.length ? content : [{ type: "text", text: "" }] },
                ],
              };
            }),
          };
        });
        doc.content.push({
          type: "table",
          attrs: { isNumberColumnEnabled: false, layout: "default" },
          content: adfRows,
        });
      }
      continue;
    }

    // --- Empty line ---
    if (!stripped) {
      i += 1;
      continue;
    }

    // --- Paragraph (default) ---
    doc.content.push(makeParagraph(line));
    i += 1;
  }

  if (doc.content.length === 0) {
    doc.content.push({ type: "paragraph", content: [] });
  }

  return doc;
}
