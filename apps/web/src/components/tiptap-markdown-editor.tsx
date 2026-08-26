"use client";

import {
  Code,
  Link as LinkIcon,
  ListBullets,
  Minus,
  Plus,
  Quotes,
  TextB,
  TextHTwo,
  TextItalic,
  TextT,
  TextUnderline,
} from "@phosphor-icons/react";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface TiptapMarkdownEditorProps {
  readonly value: string;
  readonly onChange: (markdown: string) => void;
}

interface MenuPosition {
  readonly left: number;
  readonly top: number;
}

interface FormatButtonProps {
  readonly active?: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

function FormatButton({
  active = false,
  label,
  onClick,
  children,
}: FormatButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-[#687279] transition hover:bg-[#f0f1ed] hover:text-[#172329]",
        active && "bg-[#172329] text-white hover:bg-[#172329] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

export function TiptapMarkdownEditor({
  value,
  onChange,
}: TiptapMarkdownEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [slashMenu, setSlashMenu] = useState<MenuPosition | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          defaultProtocol: "https",
          openOnClick: false,
        },
      }),
      Markdown.configure({ markedOptions: { gfm: true } }),
      Placeholder.configure({
        placeholder: "Start writing, or type / for blocks",
      }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        "aria-label": "Post content",
        class: "pw-tiptap-content",
      },
      handleKeyDown(view, event) {
        if (event.key === "Escape") {
          setSlashMenu(null);
          return false;
        }
        if (event.key !== "/") return false;
        const { selection } = view.state;
        if (!selection.empty || selection.$from.parent.textContent.length > 0)
          return false;
        const wrapper = wrapperRef.current;
        if (!wrapper) return false;
        const caret = view.coordsAtPos(selection.from);
        const bounds = wrapper.getBoundingClientRect();
        setSlashMenu({
          left: Math.max(
            0,
            Math.min(caret.left - bounds.left, bounds.width - 240),
          ),
          top: caret.bottom - bounds.top + 8,
        });
        event.preventDefault();
        return true;
      },
    },
    onSelectionUpdate() {
      setSlashMenu(null);
    },
    onUpdate({ editor: currentEditor }) {
      onChange(currentEditor.getMarkdown());
      setSlashMenu(null);
    },
  });

  const activeFormats = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      link: currentEditor?.isActive("link") ?? false,
      underline: currentEditor?.isActive("underline") ?? false,
    }),
  });

  useEffect(() => {
    if (!slashMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node))
        setSlashMenu(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [slashMenu]);

  if (!editor) {
    return (
      <div className="min-h-[520px] animate-pulse rounded-xl bg-[#f7f6f1]" />
    );
  }

  const setLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = window.prompt("Link URL", "https://");
    if (href) editor.chain().focus().setLink({ href }).run();
  };

  const blockItems = [
    {
      label: "Text",
      detail: "Plain paragraph",
      icon: TextT,
      command: () => editor.chain().focus().setParagraph().run(),
    },
    {
      label: "Heading",
      detail: "Start a section",
      icon: TextHTwo,
      command: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Bulleted list",
      detail: "Create a simple list",
      icon: ListBullets,
      command: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Quote",
      detail: "Highlight a quotation",
      icon: Quotes,
      command: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Code block",
      detail: "Add formatted code",
      icon: Code,
      command: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Divider",
      detail: "Separate two ideas",
      icon: Minus,
      command: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ] as const;

  return (
    <div ref={wrapperRef} className="pw-tiptap-editor relative">
      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        className="flex items-center gap-0.5 rounded-xl border border-[#d8dad4] bg-white p-1 shadow-xl"
      >
        <FormatButton
          label="Bold"
          active={activeFormats?.bold ?? false}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <TextB className="size-4" weight="bold" />
        </FormatButton>
        <FormatButton
          label="Italic"
          active={activeFormats?.italic ?? false}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <TextItalic className="size-4" />
        </FormatButton>
        <FormatButton
          label="Underline"
          active={activeFormats?.underline ?? false}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <TextUnderline className="size-4" />
        </FormatButton>
        <FormatButton
          label={activeFormats?.link ? "Remove link" : "Add link"}
          active={activeFormats?.link ?? false}
          onClick={setLink}
        >
          <LinkIcon className="size-4" />
        </FormatButton>
      </BubbleMenu>

      <EditorContent editor={editor} />

      <div className="mt-5 flex items-center gap-2 text-[11px] text-[#959da0]">
        <span className="grid size-6 place-items-center rounded-md border border-[#d8dad4] bg-[#f7f6f1] text-[#69757a]">
          /
        </span>
        Type / on an empty line to add a block
      </div>

      {slashMenu ? (
        <div
          role="menu"
          aria-label="Insert block"
          className="absolute z-30 w-60 overflow-hidden rounded-xl border border-[#d8dad4] bg-white p-1.5 shadow-2xl"
          style={{ left: slashMenu.left, top: slashMenu.top }}
        >
          <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-[#8a9397]">
            Add a block
          </p>
          {blockItems.map(({ label, detail, icon: Icon, command }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onMouseDown={(event) => {
                event.preventDefault();
                command();
                setSlashMenu(null);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#f4f3ee]"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#dedfd9] bg-[#fafaf7] text-[#647076]">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{label}</span>
                <span className="block text-[9px] text-[#8a9397]">
                  {detail}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        aria-label="Open block menu"
        onClick={() => {
          const bounds = wrapperRef.current?.getBoundingClientRect();
          if (!bounds) return;
          editor.chain().focus().run();
          requestAnimationFrame(() =>
            setSlashMenu({ left: 0, top: bounds.height - 18 }),
          );
        }}
        className="absolute -left-10 top-1 hidden size-7 place-items-center rounded-lg text-[#9aa1a4] transition hover:bg-[#f0f1ed] hover:text-[#172329] sm:grid"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
