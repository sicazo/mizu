import { useEffect, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getNotesRoot, notesApi } from "../../lib/notesApi";
import {
  useCreateBlockNote,
  BlockNoteViewRaw,
  ComponentsContext,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { components } from "@blocknote/mantine";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { MantineProvider } from "@mantine/core";
import "@blocknote/mantine/style.css";
import "katex/dist/katex.min.css";

import { schema, MATH_BLOCK_TYPE, MATH_INLINE_TYPE } from "./mizuEditorSchema";
import { MizuFormattingToolbarController } from "./MizuFormattingToolbar";
import "./MizuEditorTheme.css";

interface MizuBlockNoteEditorProps {
  initialContent: string;
  noteId: string;
  courseId: string;
  onChange: (markdown: string) => void;
  editable?: boolean;
}

type MizuEditor = ReturnType<typeof useCreateBlockNote>;

function getMathSlashItem(editor: MizuEditor): DefaultReactSuggestionItem {
  return {
    title: "Math block",
    aliases: ["math", "latex", "equation", "$$"],
    group: "Media",
    icon: <span style={{ fontSize: 14, fontWeight: 600 }}>∑</span>,
    onItemClick: () => {
      const block = editor.getTextCursorPosition().block;
      editor.updateBlock(block, {
        type: MATH_BLOCK_TYPE as "mathBlock",
        props: { latex: "" },
      });
    },
    subtext: "Insert a LaTeX math block",
  };
}

function SharedBlockNoteView(
  props: React.ComponentProps<typeof BlockNoteViewRaw>,
) {
  const { children, className, theme, ...rest } = props;
  const colorScheme = theme === "dark" ? "dark" : "light";

  return (
    <MantineProvider
      withCssVariables={false}
      getRootElement={() => undefined}
    >
      <ComponentsContext.Provider value={components}>
        <BlockNoteViewRaw
          {...rest}
          className={["bn-mantine", className].filter(Boolean).join(" ")}
          data-mantine-color-scheme={colorScheme}
          theme={theme}
        >
          {children}
        </BlockNoteViewRaw>
      </ComponentsContext.Provider>
    </MantineProvider>
  );
}

export default function MizuBlockNoteEditor({
  initialContent,
  noteId,
  courseId,
  onChange,
  editable = true,
}: MizuBlockNoteEditorProps) {
  const handleUploadFile = useCallback(async (file: File) => {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return notesApi.importAttachment(courseId, file.name || "attachment", bytes);
  }, [courseId]);

  const editor = useCreateBlockNote({ schema, uploadFile: handleUploadFile });

  useEffect(() => {
    let cancelled = false;
    async function loadContent() {
      try {
        const processedMarkdown = preprocessMathMarkdown(initialContent);
        const blocks = await editor.tryParseMarkdownToBlocks(processedMarkdown);
        const withMath = injectMathInBlocks(blocks as any[]);
        const withResolvedAttachments = resolveAttachmentUrlsInBlocks(withMath, courseId);
        if (!cancelled) {
          editor.replaceBlocks(editor.document, withResolvedAttachments as any);
        }
      } catch (err) {
        console.warn("[MizuEditor] Failed to parse initial content:", err);
      }
    }
    loadContent();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const handleChange = useCallback(async () => {
    try {
      const markdown = await serializeMathAwareMarkdown(editor, courseId);
      onChange(markdown);
    } catch (err) {
      console.warn("[MizuEditor] Failed to serialize content:", err);
    }
  }, [editor, onChange, courseId]);

  const isDark =
    document.documentElement.dataset.theme === "dark" ||
    document.documentElement.classList.contains("dark");

  return (
    <div className="mizu-editor__container">
      <SharedBlockNoteView
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor={editor as any}
        editable={editable}
        theme={isDark ? "dark" : "light"}
        onChange={handleChange}
        formattingToolbar={false}
      >
        <MizuFormattingToolbarController />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const defaults = getDefaultReactSlashMenuItems(editor as any);
            const mathItem = getMathSlashItem(editor);
            return filterSuggestionItems([...defaults, mathItem], query);
          }}
        />
      </SharedBlockNoteView>
    </div>
  );
}

// ── Math markdown pre/post processing ───────────────────────────────────────

const INLINE_TOKEN_PREFIX = "@@MIZU_MATH_INLINE:";
const BLOCK_TOKEN_PREFIX = "@@MIZU_MATH_BLOCK:";
const TOKEN_SUFFIX = "@@";
const INLINE_TOKEN_RE = /@@MIZU_MATH_INLINE:([^@]+)@@/g;

function encodeLatex(latex: string): string {
  return encodeURIComponent(latex);
}

function decodeLatex(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashCount++;
  return slashCount % 2 === 1;
}

function isSingleDollar(text: string, index: number): boolean {
  return text[index] === "$" && text[index - 1] !== "$" && text[index + 1] !== "$";
}

function readInlineMath(text: string, index: number): { latex: string; end: number } | null {
  if (!isSingleDollar(text, index) || isEscaped(text, index)) return null;
  for (let i = index + 1; i < text.length; i++) {
    if (isSingleDollar(text, i) && !isEscaped(text, i)) {
      const latex = text.slice(index + 1, i);
      if (latex.trim() && !/^\s|\s$/.test(latex)) return { latex, end: i };
      return null;
    }
  }
  return null;
}

function replaceInlineMathInLine(line: string): string {
  let result = "";
  let index = 0;
  let inCode = false;
  while (index < line.length) {
    if (line[index] === "`") {
      inCode = !inCode;
      result += line[index++];
      continue;
    }
    const match = inCode ? null : readInlineMath(line, index);
    if (match) {
      result += `${INLINE_TOKEN_PREFIX}${encodeLatex(match.latex)}${TOKEN_SUFFIX}`;
      index = match.end + 1;
    } else {
      result += line[index++];
    }
  }
  return result;
}

function preprocessMathMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("```") || line.trimStart().startsWith("~~~")) {
      inFence = !inFence;
      result.push(line);
      continue;
    }
    if (inFence) {
      result.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "$$") {
      const end = lines.findIndex((l, j) => j > i && l.trim() === "$$");
      if (end !== -1) {
        const latex = lines.slice(i + 1, end).join("\n");
        result.push(`${BLOCK_TOKEN_PREFIX}${encodeLatex(latex)}${TOKEN_SUFFIX}`);
        i = end;
        continue;
      }
    }
    const singleLine = trimmed.match(/^\$\$(.+)\$\$$/);
    if (singleLine?.[1]) {
      result.push(`${BLOCK_TOKEN_PREFIX}${encodeLatex(singleLine[1].trim())}${TOKEN_SUFFIX}`);
      continue;
    }
    result.push(replaceInlineMathInLine(line));
  }
  return result.join("\n");
}

interface InlineItem {
  type: string;
  text?: string;
  props?: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content?: any;
}

function expandInlineTokens(content: InlineItem[]): InlineItem[] {
  return content.flatMap((item) => {
    if (item.type !== "text" || typeof item.text !== "string") return [item];
    const parts = item.text.split(INLINE_TOKEN_RE);
    const result: InlineItem[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      if (i % 2 === 0) {
        result.push({ ...item, text: part });
      } else {
        result.push({ type: MATH_INLINE_TYPE, props: { latex: decodeLatex(part) }, content: undefined });
      }
    }
    return result;
  });
}

function readBlockToken(content: unknown): string | null {
  if (!Array.isArray(content) || content.length !== 1) return null;
  const item = content[0] as InlineItem;
  if (item.type !== "text" || typeof item.text !== "string") return null;
  const text: string = item.text;
  if (!text.startsWith(BLOCK_TOKEN_PREFIX) || !text.endsWith(TOKEN_SUFFIX)) return null;
  return decodeLatex(text.slice(BLOCK_TOKEN_PREFIX.length, -TOKEN_SUFFIX.length));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function restoreMathInBlocks(blocks: any[]): any[] {
  return blocks.map((block) => {
    if (block.type === MATH_BLOCK_TYPE && typeof block.props?.latex === "string") {
      return block;
    }
    const content = Array.isArray(block.content)
      ? block.content.map((item: InlineItem) =>
          item.type === MATH_INLINE_TYPE && item.props?.latex
            ? { type: "text", text: `$${item.props.latex}$` }
            : item,
        )
      : block.content;
    const children = Array.isArray(block.children) ? restoreMathInBlocks(block.children) : block.children;
    return { ...block, content, children };
  });
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeForCompare(value: string): string {
  return decodeSafe(value).replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}

function courseAttachmentsDir(courseId: string): string | null {
  const notesRoot = getNotesRoot();
  if (!notesRoot) return null;
  const sep = notesRoot.includes("\\") && !notesRoot.includes("/") ? "\\" : "/";
  const root = notesRoot.replace(/[\\/]+$/, "");
  return `${root}${sep}${courseId}${sep}attachments`;
}

function absolutizeAttachmentUrl(url: string, courseId: string): string {
  const trimmed = url.trim();
  const rel = trimmed.replace(/^\.\//, "").replace(/\\/g, "/");
  if (!/^attachments\//i.test(rel)) return url;

  const dir = courseAttachmentsDir(courseId);
  if (!dir) return url;
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  const absPath = `${dir}${sep}${rel.slice("attachments/".length).replace(/\//g, sep)}`;
  return convertFileSrc(absPath);
}

function relativizeAttachmentUrl(url: string, courseId: string): string {
  const rel = url.trim().replace(/^\.\//, "").replace(/\\/g, "/");
  if (/^attachments\//i.test(rel)) return `attachments/${rel.slice("attachments/".length)}`;

  const dir = courseAttachmentsDir(courseId);
  if (!dir) return url;

  const dirNorm = normalizeForCompare(dir);
  const candidates = [url, decodeSafe(url)];

  for (const candidate of candidates) {
    const normalized = normalizeForCompare(candidate);
    const idx = normalized.indexOf(`${dirNorm}/`);
    if (idx !== -1) {
      const tail = decodeSafe(candidate).replace(/\\/g, "/").slice(idx + dirNorm.length + 1);
      return `attachments/${tail}`;
    }
  }

  return url;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAttachmentUrlsInValue(value: any, courseId: string, mapUrl: (url: string, courseId: string) => string): any {
  if (Array.isArray(value)) return value.map((item) => mapAttachmentUrlsInValue(item, courseId, mapUrl));
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "url" || key === "src" || key === "href") && typeof val === "string") {
      out[key] = mapUrl(val, courseId);
    } else {
      out[key] = mapAttachmentUrlsInValue(val, courseId, mapUrl);
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAttachmentUrlsInBlocks(blocks: any[], courseId: string): any[] {
  return blocks.map((b) => mapAttachmentUrlsInValue(b, courseId, absolutizeAttachmentUrl));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function relativizeAttachmentUrlsInBlocks(blocks: any[], courseId: string): any[] {
  return blocks.map((b) => mapAttachmentUrlsInValue(b, courseId, relativizeAttachmentUrl));
}

async function serializeMathAwareMarkdown(editor: MizuEditor, courseId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks = editor.document as any[];
  const chunks: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending: any[] = [];

  const flush = async () => {
    if (pending.length === 0) return;
    const restored = restoreMathInBlocks(pending);
    const withRelativeAttachments = relativizeAttachmentUrlsInBlocks(restored, courseId);
    const md = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await editor.blocksToMarkdownLossy(withRelativeAttachments as any)
    ).trimEnd();
    if (md) chunks.push(md);
    pending.length = 0;
  };

  for (const block of blocks) {
    if (block.type === MATH_BLOCK_TYPE && typeof block.props?.latex === "string") {
      await flush();
      chunks.push(`$$\n${block.props.latex}\n$$`);
    } else {
      pending.push(block);
    }
  }
  await flush();
  return chunks.join("\n\n");
}

// Used during markdown pre-processing to inject inline math tokens back into blocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectMathInBlocks(blocks: any[]): any[] {
  return blocks.map((block) => {
    const latex = readBlockToken(block.content);
    if (latex !== null) {
      return { ...block, type: MATH_BLOCK_TYPE, props: { ...block.props, latex }, content: undefined, children: [] };
    }
    const content = Array.isArray(block.content) ? expandInlineTokens(block.content as InlineItem[]) : block.content;
    const children = Array.isArray(block.children) ? injectMathInBlocks(block.children) : block.children;
    return { ...block, content, children };
  });
}

