"use client";

import { useState, useRef, useEffect, useCallback, useDeferredValue, memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  Bold,
  Italic,
  Link,
  Code,
  List,
  ListOrdered,
  Quote,
  Table,
  Image as ImageIcon,
  FileDown,
  Eye,
  PenLine,
  Columns,
  Moon,
  Sun,
  Heading1,
  Heading2,
  Heading3,
} from "lucide-react";

// memo 包裹：只要 props 不变就不会重新渲染
const IconButton = memo(({ icon: Icon, onClick, title, active }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`inline-flex items-center justify-center shrink-0 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 w-9 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-neutral-50 ${active
      ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-50"
      : "text-neutral-500 dark:text-neutral-400"
      }`}
  >
    <Icon className="h-4 w-4" />
  </button>
));
IconButton.displayName = "IconButton";

// 插件数组提到组件外，避免每次渲染都创建新数组引用，导致 ReactMarkdown 不必要地重新解析
const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize, rehypeKatex];

export default function MarkdownEditor() {
  const defaultContent = "# 欢迎使用 Markdown 编辑器\n\n在这里开始写作...";
  const [content, setContent] = useState(defaultContent);
  const [isMounted, setIsMounted] = useState(false);
  const [viewMode, setViewMode] = useState("split"); // "edit", "preview", "split"
  const [theme, setTheme] = useState("light"); // "light", "dark"
  const textareaRef = useRef(null);
  const previewRef = useRef(null);       // 预览区滚动容器
  const rafRef = useRef(null);           // requestAnimationFrame 句柄，用于防抖

  // 初始化：读取 localStorage 内容 + 恢复用户上次选择的主题
  useEffect(() => {
    setIsMounted(true);
    const savedContent = localStorage.getItem("md-editor-content");
    if (savedContent) setContent(savedContent);

    // 优先读用户手动保存的主题偏好，没有则回退到系统偏好
    const savedTheme = localStorage.getItem("md-editor-theme");
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  // 防抖保存到 localStorage（500ms 停止输入后才写入）
  useEffect(() => {
    if (!isMounted) return;
    const handler = setTimeout(() => {
      localStorage.setItem("md-editor-content", content);
    }, 500);
    return () => clearTimeout(handler);
  }, [content, isMounted]);

  // 同步主题到 <html> class，并持久化到 localStorage
  useEffect(() => {
    if (!isMounted) return; // 避免 SSR 阶段操作 DOM
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("md-editor-theme", theme);
  }, [theme, isMounted]);

  // useDeferredValue：让打字输入框优先级高于 Markdown 渲染，避免长文档卡顿
  const deferredContent = useDeferredValue(content);

  /**
   * 滚动同步方案：基于光标所在行号的比例，驱动预览区滚动到对应位置
   * 原理：光标在第 N 行 / 总 M 行 = 比例 R，预览区滚动到其可滚动高度的 R * 100%
   */
  const syncScrollFromCursor = useCallback(() => {
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;

    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    const linesBeforeCursor = text.substring(0, cursorPos).split("\n").length - 1;
    const totalLines = text.split("\n").length;
    const ratio = totalLines <= 1 ? 0 : linesBeforeCursor / (totalLines - 1);

    const targetY = ratio * (preview.scrollHeight - preview.clientHeight);
    // smooth 滚动体验更好
    preview.scrollTo({ top: targetY, behavior: "smooth" });
  }, []);

  /**
   * 滚动同步方案₂：用户主动滚动编辑区时，预览区按比例同步
   * 使用 rAF 防抖，避免高频触发导致帧率下降
   */
  const syncScrollFromScroll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      const preview = previewRef.current;
      if (!textarea || !preview) return;

      const ratio = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight) || 0;
      preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
    });
  }, []);

  // useCallback：只在函数定义本身不变时保持引用稳定，避免工具栏按钮无意义 re-render
  const insertText = useCallback((before, after = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    // 直接读 textarea.value 而非 content state，避免闭包 stale value 问题
    const val = textarea.value;
    const selectedText = val.substring(start, end);
    const newText = val.substring(0, start) + before + selectedText + after + val.substring(end);
    setContent(newText);

    // 还原光标位置到插入内容之后/选区内
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selectedText.length
      );
    }, 0);
  }, []);

  // 处理回车键（列表续行 / 退出列表）
  const handleKeyDown = useCallback((e) => {
    if (e.key !== "Enter") return;

    const textarea = e.target;
    const start = textarea.selectionStart;
    const val = textarea.value;

    // 找到当前行文本
    const currentLine = val.substring(0, start).split("\n").pop();
    const listMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)(\s*)(.*)$/);
    if (!listMatch) return;

    e.preventDefault();

    const [, indent, bullet, space, textContent] = listMatch;

    if (space !== "" && textContent.trim() === "") {
      // 空列表项 → 退出列表
      const newContent = val.substring(0, start - currentLine.length) + "\n" + val.substring(start);
      setContent(newContent);
      const newPos = start - currentLine.length + 1;
      setTimeout(() => {
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
      }, 0);
    } else {
      // 续行：追加新列表符号（有序列表数字递增）
      const isUnordered = /[-*+]/.test(bullet);
      const newBullet = isUnordered
        ? `${indent}${bullet} `
        : `${indent}${Number(bullet) + 1}. `;

      const newContent = val.substring(0, start) + "\n" + newBullet + val.substring(start);
      setContent(newContent);

      const newPos = start + 1 + newBullet.length;
      setTimeout(() => {
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
      }, 0);
    }
  }, []);

  // 提取一级标题作为建议文件名
  const getSuggestedFilename = useCallback(() => {
    const match = content.match(/^#\s+(.+)$/m);
    const raw = match ? match[1].trim() : "document";
    return raw.replace(/[><:"/\\|?*\x00-\x1F]/g, "").substring(0, 50) || "document";
  }, [content]);

  // 保存到本地文件（优先使用 File System Access API）
  const handleSaveToLocal = useCallback(async () => {
    const suggestedName = `${getSuggestedFilename()}.md`;
    try {
      if ("showSaveFilePicker" in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: "Markdown File", accept: { "text/markdown": [".md"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } else {
        // 降级：Blob 下载
        const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: suggestedName });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("保存失败", error);
        alert("保存失败: " + error.message);
      }
    }
  }, [content, getSuggestedFilename]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  // 工具栏按钮配置（提到渲染函数外，避免每次渲染重新生成数组）
  // 使用 useCallback 稳定的 insertText
  const toolbarButtons = [
    { icon: Heading1, title: "标题 1", action: () => insertText("# ") },
    { icon: Heading2, title: "标题 2", action: () => insertText("## ") },
    { icon: Heading3, title: "标题 3", action: () => insertText("### ") },
    null, // 分隔符
    { icon: Bold, title: "粗体", action: () => insertText("**", "**") },
    { icon: Italic, title: "斜体", action: () => insertText("*", "*") },
    null,
    { icon: Quote, title: "引用", action: () => insertText("> ") },
    { icon: Code, title: "代码块", action: () => insertText("```\n", "\n```") },
    { icon: Link, title: "链接", action: () => insertText("[", "](https://)") },
    { icon: ImageIcon, title: "插入图片", action: () => insertText("![", "](https://)") },
    null,
    { icon: List, title: "无序列表", action: () => insertText("- ") },
    { icon: ListOrdered, title: "有序列表", action: () => insertText("1. ") },
    { icon: Table, title: "插入表格", action: () => insertText("\n| 列 1 | 列 2 |\n| ---- | ---- |\n| 内容 | 内容 |\n") },
  ];

  // Markdown 组件渲染器
  const mdComponents = {
    a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
    img: ({ node, src, alt, ...props }) => {
      if (!src) return (
        <span className="text-neutral-400 text-sm italic border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 inline-flex my-2">
          [无效图片链接或空链接]
        </span>
      );
      return (
        <img
          src={src}
          alt={alt || ""}
          {...props}
          className="max-w-full h-auto block rounded-md my-4"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      );
    },
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 font-sans overflow-hidden transition-colors">

      {/* 顶部工具栏 */}
      <header className="flex-none h-14 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between px-4 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm z-10 w-full">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pr-4 flex-1">
          {toolbarButtons.map((btn, i) =>
            btn === null
              ? <div key={i} className="w-px h-6 bg-neutral-200 dark:bg-neutral-700 mx-1 shrink-0" />
              : <IconButton key={btn.title} icon={btn.icon} title={btn.title} onClick={btn.action} />
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* 视图模式切换 */}
          <div className="hidden sm:flex bg-neutral-100 dark:bg-neutral-800 rounded-md p-0.5 mr-2">
            <IconButton icon={PenLine} title="仅编辑" active={viewMode === "edit"} onClick={() => setViewMode("edit")} />
            <IconButton icon={Columns} title="分屏" active={viewMode === "split"} onClick={() => setViewMode("split")} />
            <IconButton icon={Eye} title="仅预览" active={viewMode === "preview"} onClick={() => setViewMode("preview")} />
          </div>

          {/* 主题切换 */}
          <div className="flex bg-neutral-100 dark:bg-neutral-800 rounded-md p-0.5 ml-2">
            <IconButton
              icon={theme === "dark" ? Sun : Moon}
              title="切换主题"
              active={false}
              onClick={toggleTheme}
            />
          </div>

          <button
            onClick={handleSaveToLocal}
            className="ml-2 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-neutral-900 text-neutral-50 shadow hover:bg-neutral-900/90 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-50/90 h-9 px-4 py-2 gap-2"
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">保存</span>
          </button>
        </div>
      </header>

      {/* 主体区域 */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* 编辑区 */}
        {(viewMode === "edit" || viewMode === "split") && (
          <div className={`flex-1 flex flex-col min-h-0 relative ${viewMode === "split" ? "md:max-w-[50%] border-r border-neutral-200 dark:border-neutral-700" : "max-w-full"}`}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              // 任何键盘操作后同步光标位置对应的预览滚动
              onKeyUp={syncScrollFromCursor}
              // 鼠标点击移动光标时同步
              onClick={syncScrollFromCursor}
              // 手动滚动编辑区时按比例驱动预览滚动
              onScroll={syncScrollFromScroll}
              placeholder="在此输入 Markdown..."
              className="flex-1 w-full resize-none bg-transparent p-6 sm:p-8 lg:p-12 focus:outline-none text-[15px] sm:text-base text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
          </div>
        )}

        {/* 预览区：加 ref 以接收滚动同步指令 */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div
            ref={previewRef}
            className={`flex-1 overflow-y-auto bg-neutral-50/50 dark:bg-neutral-900/50 min-h-0 ${viewMode === "split" ? "md:max-w-[50%]" : "max-w-full"}`}
          >
            <div className="p-6 sm:p-8 lg:p-12 mx-auto max-w-3xl prose prose-neutral dark:prose-invert prose-a:font-medium prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800 prose-pre:text-neutral-900 dark:prose-pre:text-neutral-50 hover:prose-a:text-neutral-900 dark:hover:prose-a:text-neutral-50 prose-img:rounded-md prose-img:shadow-sm break-words">
              {deferredContent ? (
                <ReactMarkdown
                  remarkPlugins={REMARK_PLUGINS}
                  rehypePlugins={REHYPE_PLUGINS}
                  components={mdComponents}
                >
                  {deferredContent}
                </ReactMarkdown>
              ) : (
                <div className="text-neutral-400 dark:text-neutral-600 text-center mt-20 italic">预览区域</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
