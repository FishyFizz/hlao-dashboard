import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "./MarkdownText";

describe("MarkdownText", () => {
  it("renders GFM blocks, breaks, and copyable code", () => {
    const html = renderToStaticMarkup(
      <MarkdownText
        text={[
          "# Plan",
          "",
          "First line",
          "second line",
          "",
          "- one",
          "- two",
          "",
          "- [x] shipped",
          "- [ ] pending",
          "",
          "| Area | State |",
          "| --- | --- |",
          "| auth | done |",
          "",
          "```ts",
          "const answer = 42;",
          "```",
        ].join("\n")}
      />,
    );

    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toMatch(/First line<br\/>\s*second line/);
    expect(html).toMatch(/<li>\s*<p>one<\/p>/);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
    expect(html).toContain("language-ts");
    expect(html).toContain("Copy ts block");
  });

  it("keeps raw HTML inert", () => {
    const html = renderToStaticMarkup(
      <MarkdownText text={'<img src="https://tracker.example/pixel" onerror="alert(1)">'} />,
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("onerror=&quot;");
  });

  it("shows remote images as explicit links instead of loading them", () => {
    const html = renderToStaticMarkup(
      <MarkdownText text={"![diagram](https://example.com/architecture.png)"} />,
    );

    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://example.com/architecture.png"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("opens external links explicitly and strips unsafe URLs", () => {
    const html = renderToStaticMarkup(
      <MarkdownText text={"[docs](https://example.com/docs) [bad](javascript:alert(1))"} />,
    );

    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("javascript:");
  });
});
