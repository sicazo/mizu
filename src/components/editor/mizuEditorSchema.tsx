import {
  BlockNoteSchema,
  defaultInlineContentSpecs,
  createCodeBlockSpec,
} from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import katex from "katex";

export const MATH_INLINE_TYPE = "mathInline";
export const MATH_BLOCK_TYPE = "mathBlock";

function renderMathToHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      trust: false,
    });
  } catch {
    return latex;
  }
}

function MathDisplay({ latex, displayMode }: { latex: string; displayMode: boolean }) {
  return (
    <span
      aria-label={`Math: ${latex}`}
      className={displayMode ? "math math--block" : "math math--inline"}
      data-latex={latex}
      dangerouslySetInnerHTML={{ __html: renderMathToHtml(latex, displayMode) }}
      role="img"
    />
  );
}

export const MathInline = createReactInlineContentSpec(
  {
    type: MATH_INLINE_TYPE as "mathInline",
    propSchema: { latex: { default: "" } },
    content: "none",
  },
  {
    render: (props) => (
      <MathDisplay latex={props.inlineContent.props.latex} displayMode={false} />
    ),
  },
);

const MathBlock = createReactBlockSpec(
  {
    type: MATH_BLOCK_TYPE as "mathBlock",
    propSchema: { latex: { default: "" } },
    content: "none",
  },
  {
    render: (props) => (
      <div className="math-block-shell">
        <MathDisplay latex={props.block.props.latex} displayMode />
      </div>
    ),
  },
);

function supportsModernRegex(): boolean {
  try {
    new RegExp("", "d");
    new RegExp("[[]]", "v");
    new RegExp("(?<=a)b");
    return true;
  } catch {
    return false;
  }
}

function createMizuCodeBlockSpec() {
  const options = supportsModernRegex()
    ? { ...codeBlockOptions, defaultLanguage: "text" }
    : { defaultLanguage: "text" };
  return createCodeBlockSpec(options);
}

export const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mathInline: MathInline,
  },
}).extend({
  blockSpecs: {
    mathBlock: MathBlock(),
    codeBlock: createMizuCodeBlockSpec(),
  },
});

export type MizuSchema = typeof schema;
