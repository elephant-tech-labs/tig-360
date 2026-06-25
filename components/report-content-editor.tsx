"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Merge,
  Minus,
  Redo2,
  RemoveFormatting,
  Rows3,
  Split,
  Table2,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import {
  parseRichDocument,
  richDocumentToPlainText,
  type RichTextDocument,
} from "@/lib/report-content";

type ReportContentEditorProps = {
  disabled?: boolean;
  initialJson?: unknown;
  initialText: string;
};

type ToolButtonProps = {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
};

function ToolButton({
  active = false,
  disabled = false,
  label,
  onClick,
  children,
}: ToolButtonProps) {
  return (
    <button
      aria-label={label}
      className={`rich-editor-tool${active ? " active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function ReportContentEditor({
  disabled = false,
  initialJson,
  initialText,
}: ReportContentEditorProps) {
  const initialDocument = parseRichDocument(initialJson, initialText);
  const [documentJson, setDocumentJson] = useState(() => JSON.stringify(initialDocument));
  const [plainText, setPlainText] = useState(initialText);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          autolink: true,
          defaultProtocol: "https",
          openOnClick: false,
        },
      }),
      TableKit.configure({
        table: { resizable: true },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: initialDocument,
    editorProps: {
      attributes: {
        class: "rich-editor-content",
      },
    },
    onUpdate({ editor: currentEditor }) {
      const nextDocument = currentEditor.getJSON() as RichTextDocument;
      setDocumentJson(JSON.stringify(nextDocument));
      setPlainText(richDocumentToPlainText(nextDocument));
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return <div className="rich-editor-loading">Loading editor...</div>;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const blockType = editor.isActive("heading", { level: 2 })
    ? "heading2"
    : editor.isActive("heading", { level: 3 })
      ? "heading3"
      : "paragraph";

  return (
    <div className={`rich-editor${disabled ? " disabled" : ""}`}>
      <input name="bodyJson" type="hidden" value={documentJson} />
      <textarea name="body" readOnly hidden value={plainText} />
      {!disabled ? (
        <div className="rich-editor-toolbar">
          <select
            aria-label="Text style"
            onChange={(event) => {
              const value = event.target.value;
              if (value === "heading2") editor.chain().focus().toggleHeading({ level: 2 }).run();
              else if (value === "heading3") editor.chain().focus().toggleHeading({ level: 3 }).run();
              else editor.chain().focus().setParagraph().run();
            }}
            value={blockType}
          >
            <option value="paragraph">Paragraph</option>
            <option value="heading2">Heading</option>
            <option value="heading3">Subheading</option>
          </select>

          <div className="rich-editor-tool-group">
            <ToolButton active={editor.isActive("bold")} label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolButton>
            <ToolButton active={editor.isActive("italic")} label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolButton>
            <ToolButton active={editor.isActive("underline")} label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline size={16} /></ToolButton>
          </div>

          <div className="rich-editor-tool-group">
            <ToolButton active={editor.isActive({ textAlign: "left" })} label="Align left" onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft size={16} /></ToolButton>
            <ToolButton active={editor.isActive({ textAlign: "center" })} label="Align center" onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter size={16} /></ToolButton>
            <ToolButton active={editor.isActive({ textAlign: "right" })} label="Align right" onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight size={16} /></ToolButton>
          </div>

          <div className="rich-editor-tool-group">
            <ToolButton active={editor.isActive("bulletList")} label="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></ToolButton>
            <ToolButton active={editor.isActive("orderedList")} label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolButton>
            <ToolButton active={editor.isActive("link")} label="Link" onClick={setLink}><LinkIcon size={16} /></ToolButton>
            <ToolButton label="Horizontal divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={16} /></ToolButton>
          </div>

          <div className="rich-editor-tool-group table-tools">
            <ToolButton label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} /></ToolButton>
            <ToolButton disabled={!editor.can().addRowAfter()} label="Add table row" onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 size={16} /></ToolButton>
            <ToolButton disabled={!editor.can().addColumnAfter()} label="Add table column" onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 size={16} /></ToolButton>
            <ToolButton disabled={!editor.can().mergeCells()} label="Merge selected cells" onClick={() => editor.chain().focus().mergeCells().run()}><Merge size={16} /></ToolButton>
            <ToolButton disabled={!editor.can().splitCell()} label="Split selected cell" onClick={() => editor.chain().focus().splitCell().run()}><Split size={16} /></ToolButton>
            <ToolButton disabled={!editor.can().deleteRow()} label="Delete table row" onClick={() => editor.chain().focus().deleteRow().run()}><Rows3 className="delete-icon" size={16} /></ToolButton>
            <ToolButton disabled={!editor.can().deleteColumn()} label="Delete table column" onClick={() => editor.chain().focus().deleteColumn().run()}><Columns3 className="delete-icon" size={16} /></ToolButton>
            <ToolButton disabled={!editor.can().deleteTable()} label="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 size={16} /></ToolButton>
          </div>

          <div className="rich-editor-tool-group">
            <ToolButton disabled={!editor.can().undo()} label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></ToolButton>
            <ToolButton disabled={!editor.can().redo()} label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></ToolButton>
            <ToolButton label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={16} /></ToolButton>
          </div>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
