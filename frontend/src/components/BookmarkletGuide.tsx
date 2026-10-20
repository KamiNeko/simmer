import { Bookmark, Check, ChevronDown, Copy } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { bookmarklet } from "@/lib/browserImport";

/** A browser window drawn small, with a tab strip, an address bar and a bookmarks bar. */
function Browser({ address, bookmarks, highlightBar, children }: { address: string; bookmarks?: ReactNode; highlightBar?: boolean; children?: ReactNode }) {
  return (
    <g>
      <rect x="0.5" y="0.5" width="219" height="129" rx="6" className="fill-background stroke-border" />
      <path d="M0.5 6.5a6 6 0 0 1 6-6h207a6 6 0 0 1 6 6V20H0.5z" className="fill-muted" />
      <circle cx="10" cy="10" r="2.5" className="fill-muted-foreground/40" />
      <circle cx="18" cy="10" r="2.5" className="fill-muted-foreground/40" />
      <circle cx="26" cy="10" r="2.5" className="fill-muted-foreground/40" />
      <rect x="36" y="5" width="176" height="11" rx="5.5" className="fill-background" />
      <text x="44" y="13.5" className="fill-muted-foreground" fontSize="7">
        {address}
      </text>
      <rect
        x="2"
        y="21"
        width="216"
        height="14"
        rx={highlightBar ? 3 : 0}
        className={highlightBar ? "fill-primary/15 stroke-primary" : "fill-muted/60"}
        strokeDasharray={highlightBar ? "3 2" : undefined}
      />
      {bookmarks}
      {children}
    </g>
  );
}

/** A bookmark in a drawn bookmarks bar. */
function DrawnBookmark({ x, label, strong }: { x: number; label: string; strong?: boolean }) {
  return (
    <g>
      <rect x={x} y="23.5" width={label.length * 4 + 14} height="9" rx="2" className={strong ? "fill-primary/20" : "fill-background"} />
      <path d={`M${x + 3.5} 25.5h3v5l-1.5-1-1.5 1z`} className={strong ? "fill-primary" : "fill-muted-foreground/60"} />
      <text x={x + 9.5} y="30.5" fontSize="6.5" className={strong ? "fill-primary" : "fill-muted-foreground"} fontWeight={strong ? 600 : 400}>
        {label}
      </text>
    </g>
  );
}

/** Grey lines standing in for page content. */
function Lines({ y, widths }: { y: number; widths: number[] }) {
  return (
    <g>
      {widths.map((w, i) => (
        <rect key={i} x="14" y={y + i * 9} width={w} height="4" rx="2" className="fill-muted-foreground/20" />
      ))}
    </g>
  );
}

function ShowBarPicture() {
  return (
    <svg viewBox="0 0 220 130" role="img" aria-label="A browser window with its bookmarks bar shown below the address bar">
      <Browser address="any page" highlightBar bookmarks={<DrawnBookmark x={6} label="News" />}>
        <text x="150" y="31" fontSize="7" className="fill-primary" fontWeight={600}>
          bookmarks bar
        </text>
        <Lines y={48} widths={[120, 170, 150, 90, 160, 130]} />
        <rect x="128" y="96" width="80" height="22" rx="4" className="fill-foreground" />
        <text x="168" y="110" fontSize="8" textAnchor="middle" className="fill-background" fontWeight={600}>
          Ctrl + Shift + B
        </text>
      </Browser>
    </svg>
  );
}

function DragPicture() {
  return (
    <svg viewBox="0 0 220 130" role="img" aria-label="Dragging the Save to Simmer button from Simmer's import page up into the bookmarks bar">
      <Browser address="simmer · Import recipe" highlightBar bookmarks={<DrawnBookmark x={6} label="News" />}>
        <g opacity="0.55">
          <DrawnBookmark x={42} label="Save to Simmer" strong />
        </g>
        <Lines y={46} widths={[110, 150]} />
        <rect x="14" y="84" width="74" height="18" rx="4" className="fill-background stroke-primary" />
        <path d="M21 89h4v8l-2-1.5-2 1.5z" className="fill-foreground" />
        <text x="30" y="96" fontSize="7.5" className="fill-foreground" fontWeight={600}>
          Save to Simmer
        </text>
        <path d="M70 84 C 90 64, 92 50, 76 36" fill="none" className="stroke-primary" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d="M72 41l4-6 3 7" fill="none" className="stroke-primary" strokeWidth="1.5" />
        <path d="M82 96l9 4-4 1.5 3 5-2 1-3-5-3 3z" className="fill-foreground stroke-background" strokeWidth="0.8" />
      </Browser>
    </svg>
  );
}

function ClickPicture() {
  return (
    <svg viewBox="0 0 220 130" role="img" aria-label="Clicking the Save to Simmer bookmark on a recipe page, which opens the recipe in Simmer">
      <Browser address="recipe-site.com/string-beans" bookmarks={<DrawnBookmark x={6} label="Save to Simmer" strong />}>
        <path d="M44 29l9 4-4 1.5 3 5-2 1-3-5-3 3z" className="fill-foreground stroke-background" strokeWidth="0.8" />
        <text x="14" y="52" fontSize="9" className="fill-foreground" fontWeight={600}>
          Dry-Fried String Beans
        </text>
        <Lines y={60} widths={[90, 70, 80]} />
        <path d="M110 92h28" className="stroke-primary" strokeWidth="1.5" />
        <path d="M134 88l5 4-5 4" fill="none" className="stroke-primary" strokeWidth="1.5" />
        <rect x="144" y="70" width="68" height="50" rx="4" className="fill-background stroke-primary" />
        <rect x="144" y="70" width="68" height="10" rx="4" className="fill-primary/15" />
        <text x="150" y="77.5" fontSize="6" className="fill-primary" fontWeight={600}>
          Simmer · Review
        </text>
        <rect x="150" y="85" width="50" height="4" rx="2" className="fill-foreground/70" />
        <rect x="150" y="94" width="40" height="3" rx="1.5" className="fill-muted-foreground/30" />
        <rect x="150" y="101" width="54" height="3" rx="1.5" className="fill-muted-foreground/30" />
        <rect x="150" y="108" width="34" height="3" rx="1.5" className="fill-muted-foreground/30" />
      </Browser>
    </svg>
  );
}

function Step({ number, title, picture, children }: { number: number; title: string; picture: ReactNode; children: ReactNode }) {
  return (
    <li className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-start">
      <div className="space-y-1">
        <p className="font-medium">
          <span className="bg-primary text-primary-foreground mr-2 inline-flex size-5 items-center justify-center rounded-full text-xs">{number}</span>
          {title}
        </p>
        <div className="text-muted-foreground space-y-1">{children}</div>
      </div>
      <div className="max-w-[260px]">{picture}</div>
    </li>
  );
}

function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } finally {
    area.remove();
  }
}

/** The Save to Simmer bookmark to drag to the bookmarks bar, with a guide to setting it up. */
export function BookmarkletGuide() {
  const link = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);
  const code = bookmarklet(window.location.origin);
  // React refuses javascript: links, so the bookmark's script replaces the href after rendering.
  useEffect(() => link.current?.setAttribute("href", code), [code]);

  const [showCode, setShowCode] = useState(false);
  const text = decodeURIComponent(code);
  const copy = async () => {
    try {
      // The clipboard API needs https; Simmer on a plain http address falls back to the older copy command.
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else if (!copyWithSelection(text)) throw new Error("copy refused");
      setCopied(true);
      toast.success("Bookmark address copied");
    } catch {
      setShowCode(true);
    }
  };

  return (
    <div className="bg-muted/50 space-y-3 rounded-lg border p-3 text-sm">
      <p className="text-muted-foreground">
        Some sites block Simmer from downloading their pages. For those, add this button to your browser's bookmarks bar once,
        then click the bookmark on the recipe page.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          ref={link}
          href="/import"
          title="Drag me to your bookmarks bar"
          className="bg-background hover:border-primary/60 inline-flex cursor-grab items-center gap-2 rounded-md border px-3 py-1.5 font-medium [&_svg]:size-4"
        >
          <Bookmark /> Save to Simmer
        </a>
        <span className="text-muted-foreground text-xs">Drag this button to your bookmarks bar.</span>
      </div>
      <details className="group">
        <summary className="text-primary flex cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" /> How does the bookmark work?
        </summary>
        <ol className="mt-3 space-y-5">
          <Step number={1} title="Show the bookmarks bar" picture={<ShowBarPicture />}>
            <p>
              Press <kbd className="bg-background rounded border px-1 font-mono text-xs">Ctrl+Shift+B</kbd> (
              <kbd className="bg-background rounded border px-1 font-mono text-xs">⌘+Shift+B</kbd> on a Mac) in Chrome, Edge or Firefox.
              The bar appears below the address bar.
            </p>
          </Step>
          <Step number={2} title="Drag the button onto the bar" picture={<DragPicture />}>
            <p>Hold the Save to Simmer button above, drag it into the bookmarks bar and let go. You only do this once.</p>
            <p>
              Can't drag it, for example in Safari? Copy the bookmark address, add any page as a bookmark, then edit it: name it
              "Save to Simmer" and paste the copied text as its address.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />} Copy bookmark address
            </Button>
            {showCode && (
              <>
                <p>Your browser didn't allow copying. Select this text and copy it yourself:</p>
                <textarea
                  readOnly
                  value={text}
                  rows={3}
                  aria-label="Bookmark address"
                  onFocus={(e) => e.currentTarget.select()}
                  className="bg-background w-full rounded-md border p-2 font-mono text-xs"
                />
              </>
            )}
          </Step>
          <Step number={3} title="Click it on a recipe page" picture={<ClickPicture />}>
            <p>
              Open a recipe on any site and click the bookmark. Simmer opens in a new tab with the recipe ready to review, the
              same as after a link import. Nothing is saved until you press Save.
            </p>
            <p>
              The bookmark reads the recipe from the page your browser already loaded, so it works on sites that block Simmer.
              If your browser blocks the new tab, allow pop-ups for that recipe site and click again.
            </p>
          </Step>
        </ol>
        <p className="text-muted-foreground mt-4 text-xs">
          Bookmarks like this need a desktop browser. On a phone, copy the recipe text and use From text instead.
        </p>
      </details>
    </div>
  );
}
