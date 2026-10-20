import {
  Children,
  isValidElement,
  memo,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn";
import { CopyButton } from "./ui";

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

function nodeText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children);
  }
  return "";
}

function codeLanguage(children: ReactNode): string | null {
  const first = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string }>(first)) return null;
  const match = /(?:^|\s)language-([^\s]+)/.exec(first.props.className ?? "");
  return match?.[1] ?? null;
}

function MarkdownPre({ children }: { children?: ReactNode }) {
  const language = codeLanguage(children);
  return (
    <div className="markdown__code">
      <div className="markdown__code-head">
        <span>{language ?? "code"}</span>
        <CopyButton
          text={nodeText(children)}
          label={`${language ?? "code"} block`}
          className="markdown__copy"
        />
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function externalHref(href: string | undefined): boolean {
  return Boolean(href && /^https?:\/\//i.test(href));
}

const COMPONENTS: Components = {
  a({ href, title, children }) {
    const external = externalHref(href);
    return (
      <a
        href={href}
        title={title ?? (external ? href : undefined)}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
        referrerPolicy={external ? "no-referrer" : undefined}
      >
        {children}
      </a>
    );
  },
  img({ src, alt, title }) {
    const label = alt || src || "image";
    if (!src) {
      return <span className="markdown__media">{label}</span>;
    }
    const external = externalHref(src);
    return (
      <span className="markdown__media" title={title ?? src}>
        <span className="markdown__media-label">image</span>
        <a
          href={src}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          referrerPolicy={external ? "no-referrer" : undefined}
        >
          {label}
        </a>
      </span>
    );
  },
  pre({ children }) {
    return <MarkdownPre>{children}</MarkdownPre>;
  },
  table({ children }) {
    return (
      <div className="markdown__table">
        <table>{children}</table>
      </div>
    );
  },
};

export const MarkdownText = memo(function MarkdownText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown", className)}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
