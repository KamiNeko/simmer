/** Importing pages the browser already loaded, for sites that block Simmer's own download. */

/** The message a recipe page sends to Simmer after Simmer says it's ready. */
export interface BrowserPage {
  type: "simmer-page";
  url: string;
  html: string;
}

export const READY = "simmer-ready";

// The page's recipe data, the ingredient headings of the common recipe plugins and its photo.
const KEEP = [
  'script[type="application/ld+json"]',
  ".wprm-recipe-ingredient-group",
  ".tasty-recipes-ingredients",
  ".tasty-recipes-ingredients-body",
  'meta[property="og:image"]',
].join(",");
const DROP = "script,style,noscript,nav,footer,header,aside,form,svg,iframe,img,picture,video,button";
const MAX_TEXT = 40_000;

/** True when pasted text is a page's source rather than the recipe itself. */
export function looksLikeHtml(text: string): boolean {
  return /<html[\s>]|<!doctype html|application\/ld\+json/i.test(text.slice(0, 200_000));
}

/** Only the parts of a page Simmer reads, so even a large page fits in one request. */
export function reducePage(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = document.implementation.createHTMLDocument(doc.title);
  for (const element of doc.querySelectorAll(KEEP)) {
    // Skip lists nested in a kept container; the container already has them.
    if (element.parentElement?.closest(KEEP)) continue;
    out.body.append(out.importNode(element, true));
  }
  const main = (doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body)?.cloneNode(true) as HTMLElement | undefined;
  if (main) {
    main.querySelectorAll(DROP).forEach((e) => e.remove());
    const article = out.createElement("article");
    article.textContent = (main.textContent ?? "").replace(/\n\s*\n+/g, "\n").slice(0, MAX_TEXT);
    out.body.append(article);
  }
  return `<!doctype html>${out.documentElement.outerHTML}`;
}

/**
 * The script of the Save to Simmer bookmark. It opens Simmer's import page and, once that
 * page says it's ready, hands over the page the browser shows. Messages go only to Simmer's
 * address, and only Simmer's window is answered.
 */
export function bookmarklet(origin: string): string {
  const code = `(()=>{const o=${JSON.stringify(origin)},w=window.open(o+"/import?from=browser");if(!w){alert("Allow pop-ups for this site to save recipes to Simmer.");return}const d={type:"simmer-page",url:location.href,html:document.documentElement.outerHTML};addEventListener("message",e=>{if(e.origin===o&&e.source===w&&e.data===${JSON.stringify(READY)})w.postMessage(d,o)})})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function isBrowserPage(data: unknown): data is BrowserPage {
  const page = data as BrowserPage | null;
  return page?.type === "simmer-page" && typeof page.url === "string" && typeof page.html === "string";
}
