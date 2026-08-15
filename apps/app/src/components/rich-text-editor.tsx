"use client";

import { cn } from "@everband/ui/lib/utils";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  QuotesIcon,
  TextBIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
} from "@phosphor-icons/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type React from "react";

export interface RichTextValue {
  html: string;
  text: string;
}

export interface RichTextEditorProps {
  value: string;
  onChange: (value: RichTextValue) => void;
  placeholder?: string;
  className?: string;
}

interface ToolDef {
  label: string;
  icon: React.ReactElement;
  action: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
  disabled?: (editor: Editor) => boolean;
}

const TOOLS: ToolDef[] = [
  {
    label: "Bold",
    icon: <TextBIcon size={16} />,
    action: (editor) => editor.chain().focus().toggleBold().run(),
    active: (editor) => editor.isActive("bold"),
  },
  {
    label: "Italic",
    icon: <TextItalicIcon size={16} />,
    action: (editor) => editor.chain().focus().toggleItalic().run(),
    active: (editor) => editor.isActive("italic"),
  },
  {
    label: "Strikethrough",
    icon: <TextStrikethroughIcon size={16} />,
    action: (editor) => editor.chain().focus().toggleStrike().run(),
    active: (editor) => editor.isActive("strike"),
  },
  {
    label: "Heading 2",
    icon: <TextHTwoIcon size={16} />,
    action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (editor) => editor.isActive("heading", { level: 2 }),
  },
  {
    label: "Heading 3",
    icon: <TextHThreeIcon size={16} />,
    action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    active: (editor) => editor.isActive("heading", { level: 3 }),
  },
  {
    label: "Bullet list",
    icon: <ListBulletsIcon size={16} />,
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
    active: (editor) => editor.isActive("bulletList"),
  },
  {
    label: "Numbered list",
    icon: <ListNumbersIcon size={16} />,
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    active: (editor) => editor.isActive("orderedList"),
  },
  {
    label: "Blockquote",
    icon: <QuotesIcon size={16} />,
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
    active: (editor) => editor.isActive("blockquote"),
  },
  {
    label: "Undo",
    icon: <ArrowCounterClockwiseIcon size={16} />,
    action: (editor) => editor.chain().focus().undo().run(),
    disabled: (editor) => !editor.can().undo(),
  },
  {
    label: "Redo",
    icon: <ArrowClockwiseIcon size={16} />,
    action: (editor) => editor.chain().focus().redo().run(),
    disabled: (editor) => !editor.can().redo(),
  },
];

/**
 * 富文本编辑器（TipTap + StarterKit）。
 * SSR 安全：immediatelyRender: false，服务端输出空容器，挂载后再渲染。
 * 邮件正文：html 发 HTML 版本，text 发纯文本兜底。
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: RichTextEditorProps): React.ReactElement {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose-sm min-h-40 w-full px-3 py-2 text-foreground outline-none placeholder:text-muted-foreground/72 [&_p.is-editor-empty]:before:content-[attr(data-placeholder)] [&_p.is-editor-empty]:before:pointer-events-none [&_p.is-editor-empty]:before:float-left [&_p.is-editor-empty]:before:h-0 [&_p.is-editor-empty]:before:text-muted-foreground/72",
        "data-placeholder": placeholder ?? "Write your message…",
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange({ html: instance.getHTML(), text: instance.getText() });
    },
  });

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-input bg-background shadow-xs/5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/24 sm:text-sm",
        className,
      )}
    >
      <div className="flex flex-wrap gap-0.5 border-b border-border px-1.5 py-1">
        {editor &&
          TOOLS.map((tool) => {
            const enabled = !tool.disabled?.(editor);
            const active = tool.active?.(editor);
            return (
              <button
                aria-label={tool.label}
                aria-pressed={active}
                className={cn(
                  "inline-flex size-7.5 items-center justify-center rounded-md text-muted-foreground transition-colors",
                  "hover:bg-accent hover:text-foreground",
                  active && "bg-accent text-foreground",
                  !enabled && "pointer-events-none opacity-40",
                )}
                disabled={!enabled}
                key={tool.label}
                onClick={() => tool.action(editor)}
                type="button"
              >
                {tool.icon}
              </button>
            );
          })}
      </div>
      <div className="max-h-105 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
