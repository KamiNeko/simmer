import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

import { Header } from "./Header";
import { RecipeList } from "./RecipeList";
import { Sidebar } from "./Sidebar";

/** Tailwind's lg breakpoint, from which the sidebar is a fixed column instead of a drawer. */
const DESKTOP = "(min-width: 64rem)";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function AppShell() {
  const location = useLocation();
  const desktop = useMediaQuery(DESKTOP);
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const returnFocus = useRef(false);
  const onIndex = location.pathname === "/";
  const drawerOpen = menuOpen && !desktop;

  // Close the menu whenever the page changes, or the window grows wide enough to show the sidebar.
  const page = location.pathname + location.search;
  const [menuPage, setMenuPage] = useState(page);
  if (page !== menuPage || (menuOpen && desktop)) {
    setMenuPage(page);
    setMenuOpen(false);
  }

  const openMenu = () => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMenuOpen(true);
  };
  /** Close without navigating, handing the focus back to whatever opened the menu. */
  const closeMenu = () => {
    returnFocus.current = true;
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!drawerOpen) {
      // Only once the page behind is no longer inert can it take the focus back.
      if (returnFocus.current) openerRef.current?.focus();
      returnFocus.current = false;
      return;
    }
    drawerRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      returnFocus.current = true;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: fixed column on desktop, slide-in panel on small screens */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={closeMenu}
        aria-hidden="true"
      />
      <aside
        id="app-menu"
        ref={drawerRef}
        // Off screen when closed, so out of the tab order and hidden from screen readers too.
        inert={!desktop && !drawerOpen}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen || undefined}
        aria-label={drawerOpen ? "Menu" : undefined}
        className={cn(
          "bg-sidebar fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r transition-transform lg:static lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar />
      </aside>

      {/* The page behind the open drawer can't be reached until it closes. */}
      <div className="flex min-w-0 flex-1 flex-col" inert={drawerOpen}>
        <Header onMenu={openMenu} menuOpen={drawerOpen} />
        <div className="flex min-h-0 flex-1">
          <section
            className={cn(
              "bg-panel w-full shrink-0 flex-col border-r md:flex md:w-[340px] xl:w-[380px]",
              onIndex ? "flex" : "hidden",
            )}
          >
            <RecipeList />
          </section>
          <main className={cn("bg-panel min-w-0 flex-1 overflow-y-auto md:block", onIndex ? "hidden" : "block")}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
