import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from "@blocknote/core";
import { useEffect, useRef, useState } from "react";

const COMPOSITION_SETTLE_MS = 250;

function compositionEventTargetsEditor(editorElement: Element, event: CompositionEvent) {
  const target = event.target;
  if (target instanceof Node && editorElement.contains(target)) return true;
  const active = editorElement.ownerDocument.activeElement;
  if (active instanceof Node && editorElement.contains(active)) return true;
  const anchor = editorElement.ownerDocument.getSelection()?.anchorNode;
  return anchor instanceof Node && editorElement.contains(anchor);
}

export function useEditorComposing<
  BSchema extends BlockSchema,
  ISchema extends InlineContentSchema,
  SSchema extends StyleSchema,
>(editor: BlockNoteEditor<BSchema, ISchema, SSchema>) {
  const [isComposing, setIsComposing] = useState(false);
  const composingRef = useRef(false);
  const settleTimeoutRef = useRef<number | null>(null);
  const editorElement = editor.domElement ?? null;

  useEffect(() => {
    const clearSettle = () => {
      if (settleTimeoutRef.current === null) return;
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    };

    const update = (next: boolean) => {
      if (composingRef.current === next) return;
      composingRef.current = next;
      setIsComposing(next);
    };

    const start = () => { clearSettle(); update(true); };
    const finish = () => {
      clearSettle();
      settleTimeoutRef.current = window.setTimeout(() => {
        settleTimeoutRef.current = null;
        update(false);
      }, COMPOSITION_SETTLE_MS);
    };

    clearSettle();
    update(false);
    if (!editorElement) return;

    const onStart = (e: CompositionEvent) => { if (compositionEventTargetsEditor(editorElement, e)) start(); };
    const onUpdate = (e: CompositionEvent) => { if (compositionEventTargetsEditor(editorElement, e)) start(); };
    const onEnd = (e: CompositionEvent) => {
      if (!composingRef.current && !compositionEventTargetsEditor(editorElement, e)) return;
      finish();
    };
    const onCancel: EventListener = (e) => {
      if (e instanceof CompositionEvent) { onEnd(e); return; }
      if (!composingRef.current) return;
      finish();
    };

    document.addEventListener("compositionstart", onStart, true);
    document.addEventListener("compositionupdate", onUpdate, true);
    document.addEventListener("compositionend", onEnd, true);
    document.addEventListener("compositioncancel", onCancel, true);

    return () => {
      clearSettle();
      document.removeEventListener("compositionstart", onStart, true);
      document.removeEventListener("compositionupdate", onUpdate, true);
      document.removeEventListener("compositionend", onEnd, true);
      document.removeEventListener("compositioncancel", onCancel, true);
    };
  }, [editorElement]);

  return isComposing;
}
