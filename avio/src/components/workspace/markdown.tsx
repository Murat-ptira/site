"use client";

import { isValidElement, memo, useRef, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { CopyButton } from "./copy-button";

/** A fenced code block with its language and a copy button. */
function CodeBlock({ children }: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const className = isValidElement<{ className?: string }>(children)
    ? children.props.className
    : undefined;
  const language = /language-([\w+#-]+)/.exec(className ?? "")?.[1];

  return (
    <div className="code-block overflow-hidden rounded-xl border border-line bg-code">
      <div className="flex h-9 items-center justify-between border-b border-line pr-1 pl-3.5">
        <span className="font-mono text-[0.6875rem] text-subtle">{language ?? "text"}</span>
        <CopyButton label="Copy code" getText={() => ref.current?.innerText ?? ""} />
      </div>
      <pre ref={ref} className="overflow-x-auto p-3.5 font-mono text-[0.8125rem] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

const components: Components = {
  pre: CodeBlock,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  // Model output is untrusted. Loading an image it names would let a reply
  // send data to any server, so images are shown as plain links instead.
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {alt || "image"}
      </a>
    ) : null,
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
};

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

/**
 * Renders a model reply. react-markdown never interprets raw HTML, so markup
 * inside a reply is displayed as text rather than executed.
 */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-reply">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
