// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { bookmarklet, isBrowserPage, looksLikeHtml, reducePage } from "./browserImport";

describe("browser import", () => {
  it("keeps only what Simmer reads from a page", () => {
    const page = `<!doctype html><html><head><title>Beans</title><meta property="og:image" content="https://x.example/b.jpg">
      <script type="application/ld+json">{"@type":"Recipe"}</script><script>tracking()</script></head>
      <body><nav>Menu</nav><article><h1>Beans</h1><div class="wprm-recipe-ingredient-group"><li class="wprm-recipe-ingredient">1 lb beans</li></div><script>ads()</script></article></body></html>`;
    const reduced = reducePage(page);
    expect(reduced).toContain("<title>Beans</title>");
    expect(reduced).toContain('{"@type":"Recipe"}');
    expect(reduced).toContain('content="https://x.example/b.jpg"');
    expect(reduced).toContain("wprm-recipe-ingredient-group");
    expect(reduced).not.toContain("tracking()");
    expect(reduced).not.toContain("ads()");
    expect(reduced).not.toContain("Menu");
  });

  it("tells page source from a pasted recipe", () => {
    expect(looksLikeHtml("<!DOCTYPE html><html>")).toBe(true);
    expect(looksLikeHtml("Beans\n1 lb beans\nFry them < 5 minutes")).toBe(false);
  });

  it("builds a bookmark that only talks to Simmer", () => {
    const code = decodeURIComponent(bookmarklet("http://192.168.1.5:8080").slice("javascript:".length));
    expect(code).toContain('"http://192.168.1.5:8080"');
    expect(code).toContain("e.origin===o&&e.source===w");
    expect(() => new Function(code)).not.toThrow();
  });

  it("accepts only page messages", () => {
    expect(isBrowserPage({ type: "simmer-page", url: "https://a", html: "" })).toBe(true);
    expect(isBrowserPage("simmer-ready")).toBe(false);
    expect(isBrowserPage(null)).toBe(false);
  });
});
