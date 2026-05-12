import {
  FormattingToolbar,
  getFormattingToolbarItems,
  PositionPopover,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import type { FloatingUIOptions, FormattingToolbarProps } from "@blocknote/react";
import {
  blockHasType,
  defaultProps,
  editorHasBlockWithType,
  type DefaultProps,
} from "@blocknote/core";
import type { BlockNoteEditor, BlockSchema, InlineContentSchema, StyleSchema } from "@blocknote/core";
import { FormattingToolbarExtension } from "@blocknote/core/extensions";
import { useEditorComposing } from "../../hooks/useEditorComposing";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactElement,
} from "react";
import { Button as MantineButton, CheckIcon as MantineCheckIcon, Menu as MantineMenu } from "@mantine/core";
import { Bold, ChevronDown, Code2, Italic, Strikethrough, type LucideIcon } from "lucide-react";

type BasicStyle = "bold" | "italic" | "strike" | "code";

const STYLE_TOOLTIPS: Record<BasicStyle, { label: string; mainTooltip: string; secondaryTooltip: string }> = {
  bold:   { label: "Bold",           mainTooltip: "Bold",           secondaryTooltip: "**strong**" },
  italic: { label: "Italic",         mainTooltip: "Italic",         secondaryTooltip: "*emphasis*" },
  strike: { label: "Strikethrough",  mainTooltip: "Strikethrough",  secondaryTooltip: "~~strike~~" },
  code:   { label: "Inline code",    mainTooltip: "Inline code",    secondaryTooltip: "`code`" },
};

const STYLE_ICONS: Record<BasicStyle, LucideIcon> = {
  bold: Bold, italic: Italic, strike: Strikethrough, code: Code2,
};

const BLOCK_TYPE_ITEMS = [
  { name: "Paragraph",       type: "paragraph",       props: undefined },
  { name: "Heading 1",       type: "heading",         props: { level: 1 } },
  { name: "Heading 2",       type: "heading",         props: { level: 2 } },
  { name: "Heading 3",       type: "heading",         props: { level: 3 } },
  { name: "Quote",           type: "quote",           props: undefined },
  { name: "Bullet List",     type: "bulletListItem",  props: undefined },
  { name: "Numbered List",   type: "numberedListItem", props: undefined },
  { name: "Checklist",       type: "checkListItem",   props: undefined },
  { name: "Code Block",      type: "codeBlock",       props: undefined },
] as const;

const HIDDEN_TOOLBAR_KEYS = new Set([
  "underlineStyleButton",
  "textAlignLeftButton",
  "textAlignCenterButton",
  "textAlignRightButton",
  "colorStyleButton",
  "fileDownloadButton",
]);

const FORMATTER_CLOSE_GRACE_MS = 160;

// ── Close-grace hook ────────────────────────────────────────────────────────

function useFormattingToolbarCloseGrace({
  show, toolbarHasFocus, toolbarHovered,
}: { show: boolean; toolbarHasFocus: boolean; toolbarHovered: boolean }) {
  const [closeGraceActive, setCloseGraceActive] = useState(false);
  const timerRef = useRef<number | null>(null);
  const prevShowRef = useRef(show);

  const clearGrace = useCallback(() => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    setCloseGraceActive(false);
  }, []);

  useEffect(() => {
    const active = show || toolbarHasFocus || toolbarHovered;
    if (active) {
      clearGrace();
    } else if (prevShowRef.current) {
      setCloseGraceActive(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setCloseGraceActive(false);
      }, FORMATTER_CLOSE_GRACE_MS);
    }
    prevShowRef.current = show;
  }, [clearGrace, show, toolbarHasFocus, toolbarHovered]);

  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);

  return { closeGraceActive, clearGrace };
}

// ── Store deduplication ────────────────────────────────────────────────────

function useDeduplicatedStore(store: { setState(open: boolean): void }, show: boolean) {
  const openRef = useRef(show);
  useEffect(() => { openRef.current = show; }, [show]);
  return useCallback((open: boolean) => {
    if (openRef.current === open) return;
    openRef.current = open;
    store.setState(open);
  }, [store]);
}

// ── Editor helpers ─────────────────────────────────────────────────────────

type AnyEditor = BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>;
type AnyBlock = ReturnType<AnyEditor["getTextCursorPosition"]>["block"];

function getSelectedBlocks(editor: AnyEditor): AnyBlock[] {
  try { const sel = editor.getSelection()?.blocks; if (sel?.length) return sel as AnyBlock[]; } catch {}
  try { return [editor.getTextCursorPosition().block as AnyBlock]; } catch {}
  return [];
}

function getCursorBlock(editor: AnyEditor): AnyBlock | null {
  try { return editor.getTextCursorPosition().block as AnyBlock; } catch { return null; }
}

function textAlignToPlacement(align: DefaultProps["textAlignment"]) {
  if (align === "center") return "top";
  if (align === "right") return "top-end";
  return "top-start";
}

function supportsTextStyle(style: BasicStyle, editor: AnyEditor) {
  const s = Reflect.get(editor.schema.styleSchema, style) as { type?: string; propSchema?: unknown } | undefined;
  return style in editor.schema.styleSchema && s?.type === style && s.propSchema === "boolean";
}

function selectionSupportsInline(editor: AnyEditor) {
  return getSelectedBlocks(editor).some((b) => b.content !== undefined);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StyleButton({ style }: { style: BasicStyle }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) return undefined;
      if (!supportsTextStyle(style, editor)) return undefined;
      if (!selectionSupportsInline(editor)) return undefined;
      return { active: style in editor.getActiveStyles() };
    },
  });

  const toggle = useCallback(() => { editor.focus(); editor.toggleStyles({ [style]: true } as never); }, [style, editor]);
  if (state === undefined) return null;

  const Icon = STYLE_ICONS[style];
  const copy = STYLE_TOOLTIPS[style];
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test={style}
      onClick={toggle}
      isSelected={state.active}
      label={copy.label}
      mainTooltip={copy.mainTooltip}
      secondaryTooltip={copy.secondaryTooltip}
      icon={<Icon />}
    />
  );
}

function BlockTypeSelect() {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();
  const selectedBlocks = useEditorState({
    editor,
    selector: ({ editor }): AnyBlock[] => getSelectedBlocks(editor),
  });
  const first = selectedBlocks[0] ?? null;

  const items = useMemo(() => {
    if (!first) return [];
    return BLOCK_TYPE_ITEMS.filter((item) =>
      editorHasBlockWithType(
        editor,
        item.type,
        Object.fromEntries(
          Object.entries(item.props ?? {}).map(([k, v]) => [k, typeof v]),
        ) as Record<string, "string" | "number" | "boolean">,
      ),
    ).map((item) => ({
      ...item,
      isSelected: item.type === first.type &&
        Object.entries(item.props ?? {}).every(([k, v]) => Reflect.get(first.props, k) === v),
    }));
  }, [editor, first]);

  const selected = items.find((i) => i.isSelected);
  if (!selected || !editor.isEditable) return null;

  return (
    <MantineMenu withinPortal={false} transitionProps={{ exitDuration: 0 }}>
      <MantineMenu.Target>
        <MantineButton
          onMouseDown={(e) => { e.preventDefault(); e.currentTarget.focus(); }}
          leftSection={<span style={{ fontSize: 12 }}>{selected.name.slice(0, 1)}</span>}
          rightSection={<ChevronDown size={14} />}
          size="xs"
          variant="subtle"
        >
          {selected.name}
        </MantineButton>
      </MantineMenu.Target>
      <MantineMenu.Dropdown className="bn-select">
        {items.map((item) => (
          <MantineMenu.Item
            key={item.name}
            onClick={() => {
              editor.focus();
              editor.transact(() => {
                for (const block of selectedBlocks) {
                  editor.updateBlock(block, { type: item.type as never, props: (item.props ?? {}) as never });
                }
              });
            }}
            rightSection={item.isSelected ? <MantineCheckIcon size={10} className="bn-tick-icon" /> : <div className="bn-tick-space" />}
          >
            {item.name}
          </MantineMenu.Item>
        ))}
      </MantineMenu.Dropdown>
    </MantineMenu>
  );
}

// ── Toolbar ────────────────────────────────────────────────────────────────

function buildToolbarItems(items: ReactElement[]): ReactElement[] {
  const filtered = items.filter((item) => !HIDDEN_TOOLBAR_KEYS.has(String(item.key)));
  return filtered.flatMap((item) => {
    switch (String(item.key)) {
      case "blockTypeSelect": return [<BlockTypeSelect key={item.key} />];
      case "boldStyleButton": return [<StyleButton style="bold" key={item.key} />];
      case "italicStyleButton": return [<StyleButton style="italic" key={item.key} />];
      case "strikeStyleButton": return [
        <StyleButton style="strike" key={item.key} />,
        <StyleButton style="code" key="codeStyleButton" />,
      ];
      default: return [item];
    }
  });
}

export function MizuFormattingToolbar() {
  return <FormattingToolbar>{buildToolbarItems(getFormattingToolbarItems())}</FormattingToolbar>;
}

// ── Controller ────────────────────────────────────────────────────────────

export function MizuFormattingToolbarController(props: {
  formattingToolbar?: FC<FormattingToolbarProps>;
  floatingUIOptions?: FloatingUIOptions;
}) {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();
  const formattingToolbar = useExtension(FormattingToolbarExtension, { editor });
  const show = useExtensionState(FormattingToolbarExtension, { editor });
  const isComposing = useEditorComposing(editor);
  const [hasFocus, setHasFocus] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { closeGraceActive, clearGrace } = useFormattingToolbarCloseGrace({ show, toolbarHasFocus: hasFocus, toolbarHovered: hovered });
  const setOpen = useDeduplicatedStore(formattingToolbar.store, show);

  const isOpen = !isComposing && (show || hasFocus || hovered || closeGraceActive);
  const hasAnchor = editor.domElement?.firstElementChild instanceof Element &&
    (editor.domElement.firstElementChild as Element).isConnected;
  const shouldRender = isOpen && hasAnchor;

  const position = useEditorState({
    editor,
    selector: ({ editor }) => shouldRender
      ? { from: editor.prosemirrorState.selection.from, to: editor.prosemirrorState.selection.to }
      : undefined,
  });

  const placement = useEditorState({
    editor,
    selector: ({ editor }) => {
      const block = getCursorBlock(editor);
      if (!block) return "top-start";
      if (!blockHasType(block, editor, block.type, { textAlignment: defaultProps.textAlignment })) return "top-start";
      return textAlignToPlacement((block.props as DefaultProps).textAlignment);
    },
  });

  const floatingUIOptions = useMemo<FloatingUIOptions>(() => ({
    ...props.floatingUIOptions,
    useFloatingOptions: {
      open: shouldRender,
      onOpenChange: (open, _event, reason) => {
        setOpen(open);
        if (!open) { setHasFocus(false); setHovered(false); clearGrace(); }
        if (reason === "escape-key") editor.focus();
      },
      placement,
      ...props.floatingUIOptions?.useFloatingOptions,
    },
    elementProps: {
      style: { zIndex: 40 },
      ...props.floatingUIOptions?.elementProps,
    },
  }), [clearGrace, editor, placement, props.floatingUIOptions, setOpen, shouldRender]);

  const Component = props.formattingToolbar ?? MizuFormattingToolbar;

  const isFocusWithin = (currentTarget: Element, relatedTarget: EventTarget | null) =>
    relatedTarget instanceof Node && currentTarget.contains(relatedTarget);

  return (
    <PositionPopover position={position} {...floatingUIOptions}>
      {shouldRender && (
        <div
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={(e) => { if (!isFocusWithin(e.currentTarget, e.relatedTarget)) setHovered(false); }}
          onFocusCapture={() => setHasFocus(true)}
          onBlurCapture={(e) => {
            if (isFocusWithin(e.currentTarget, e.relatedTarget)) return;
            setHasFocus(false);
            setOpen(false);
          }}
        >
          <Component />
        </div>
      )}
    </PositionPopover>
  );
}
