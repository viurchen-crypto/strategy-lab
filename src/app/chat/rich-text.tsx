import { Fragment } from "react";

/**
 * The small subset of Markdown a tutor actually uses: fenced blocks, inline
 * code, bold, and paragraphs. Everything is rendered as React nodes rather
 * than injected HTML, so a model that emits a `<script>` tag produces the
 * text "<script>" and nothing else.
 */
export function RichText({ children }: { children: string }) {
  const blocks = children.split(/```/);

  return (
    <>
      {blocks.map((block, index) =>
        index % 2 === 1 ? (
          <pre className="chat-code" key={index}>
            {block.replace(/^[a-z-]*\n/i, "").trimEnd()}
          </pre>
        ) : (
          <Fragment key={index}>
            {block
              .split(/\n{2,}/)
              .filter((paragraph) => paragraph.trim().length > 0)
              .map((paragraph, position) => (
                <p key={position}>{inline(paragraph.trim())}</p>
              ))}
          </Fragment>
        ),
      )}
    </>
  );
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/g;

function inline(text: string): React.ReactNode[] {
  return text.split(INLINE).map((piece, index) => {
    if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) {
      return <code key={index}>{piece.slice(1, -1)}</code>;
    }
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
      return <b key={index}>{piece.slice(2, -2)}</b>;
    }
    return <Fragment key={index}>{piece}</Fragment>;
  });
}
