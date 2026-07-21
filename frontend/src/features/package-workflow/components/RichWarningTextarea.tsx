import { useLayoutEffect, useRef } from "react";
import type { FormEvent, KeyboardEvent } from "react";

const WARNING_LEAD_IN = "GOVERNMENT WARNING:";

interface RichWarningTextareaProps {
  "aria-label": string;
  className: string;
  id: string;
  isLeadInBold: boolean;
  onBoldChange: (isBold: boolean) => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
}

export function RichWarningTextarea({
  "aria-label": ariaLabel,
  className,
  id,
  isLeadInBold,
  onBoldChange,
  onBlur,
  onChange,
  placeholder,
  readOnly = false,
  value
}: RichWarningTextareaProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRenderedRef = useRef<{ isLeadInBold: boolean; value: string } | null>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const nextHtml = warningHtml(value, isLeadInBold);
    const previous = lastRenderedRef.current;
    const isFocused = document.activeElement === editor;
    const textAlreadyCurrent = editor.textContent === value;
    const boldStateUnchanged = previous?.isLeadInBold === isLeadInBold;
    const htmlAlreadyCurrent = editor.innerHTML === nextHtml;

    if (isFocused && textAlreadyCurrent && boldStateUnchanged && htmlAlreadyCurrent) {
      lastRenderedRef.current = { isLeadInBold, value };
      return;
    }

    if (!htmlAlreadyCurrent) {
      const caretOffset = isFocused ? selectionTextOffset(editor) : null;
      editor.innerHTML = nextHtml;
      if (caretOffset !== null) {
        restoreCaretAtTextOffset(editor, caretOffset);
      }
    }
    lastRenderedRef.current = { isLeadInBold, value };
  }, [isLeadInBold, value]);

  function handleInput(event: FormEvent<HTMLDivElement>) {
    onChange(event.currentTarget.textContent ?? "");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      if (!readOnly) {
        onBoldChange(!isLeadInBold);
      }
    }
  }

  return (
    <div
      aria-label={ariaLabel}
      aria-multiline="true"
      className={className}
      contentEditable={!readOnly}
      data-empty={!value.trim()}
      data-placeholder={placeholder}
      id={id}
      onBlur={onBlur}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      ref={editorRef}
      role="textbox"
      suppressContentEditableWarning
      tabIndex={readOnly ? -1 : 0}
    />
  );
}

function warningHtml(value: string, isLeadInBold: boolean): string {
  if (!isLeadInBold || !value.startsWith(WARNING_LEAD_IN)) {
    return escapeHtml(value);
  }

  return `<strong>${escapeHtml(WARNING_LEAD_IN)}</strong>${escapeHtml(
    value.slice(WARNING_LEAD_IN.length)
  )}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function selectionTextOffset(container: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!container.contains(range.endContainer)) {
    return null;
  }

  const precedingText = range.cloneRange();
  precedingText.selectNodeContents(container);
  precedingText.setEnd(range.endContainer, range.endOffset);
  return precedingText.toString().length;
}

function restoreCaretAtTextOffset(container: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remainingOffset = offset;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;
    if (remainingOffset <= textLength) {
      setCaret(currentNode, remainingOffset);
      return;
    }

    remainingOffset -= textLength;
    currentNode = walker.nextNode();
  }

  setCaret(container, container.childNodes.length);
}

function setCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
