import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

import { Header } from "./Header";
import { RecipeList } from "./RecipeList";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const onIndex = location.pathname === "/";

  // Close the menu whenever the page changes.
  const page = location.pathname + location.search;
  const [menuPage, setMenuPage] = useState(page);
  if (page !== menuPage) {
    setMenuPage(page);
    setMenuOpen(false);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: fixed column on desktop, slide-in panel on small screens */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "bg-sidebar fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r transition-transform lg:static lg:translate-x-0",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setMenuOpen(true)} />
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
