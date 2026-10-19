import { Archive, ChevronRight, LogIn, LogOut, Menu, Moon, Search, Settings, Sparkles, Sun, Users } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRecipe } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

function useCrumb(): string | null {
  const { pathname } = useLocation();
  const { slug } = useParams();
  const recipe = useRecipe(slug);
  if (pathname === "/new") return "New recipe";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/admin/users") return "Users";
  if (pathname === "/admin/ai") return "AI providers";
  if (pathname === "/import") return "Import recipe";
  if (pathname === "/shopping") return "Shopping list";
  if (pathname === "/plan") return "Meal plan";
  if (pathname === "/backup") return "Export & backup";
  if (slug) return recipe.data?.title ?? null;
  return null;
}

export function Header({ onMenu, menuOpen = false }: { onMenu: () => void; menuOpen?: boolean }) {
  const { user, isAdmin, refresh } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);
  const crumb = useCrumb();
  const tag = params.get("tag");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const search = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    if (pathname === "/") setParams(next, { replace: true });
    else navigate(`/?${next}`);
  };

  const logout = async () => {
    await api.logout();
    await refresh();
    navigate("/");
  };

  return (
    <header className="bg-sidebar flex h-16 shrink-0 items-center gap-3 border-b px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onMenu}
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="app-menu"
      >
        <Menu />
      </Button>

      <nav className="text-muted-foreground hidden min-w-0 items-center gap-2 text-sm sm:flex">
        <Link to={tag ? `/?tag=${encodeURIComponent(tag)}` : "/"} className="hover:text-foreground shrink-0">
          {tag ?? "All Recipes"}
        </Link>
        {crumb && (
          <>
            <ChevronRight className="size-3.5 shrink-0" />
            <span className="text-foreground truncate font-semibold">{crumb}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <label className="bg-background/60 text-muted-foreground focus-within:border-ring flex h-9 w-44 items-center gap-2 rounded-lg border px-3 text-sm sm:w-72">
          <Search className="size-4 shrink-0" />
          <input
            ref={searchRef}
            defaultValue={params.get("q") ?? ""}
            key={params.get("q") ?? ""}
            onKeyDown={(e) => e.key === "Enter" && search(e.currentTarget.value.trim())}
            onBlur={(e) => e.currentTarget.value.trim() !== (params.get("q") ?? "") && search(e.currentTarget.value.trim())}
            placeholder="Search recipes…"
            className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent outline-none"
          />
          <kbd className="hidden rounded border px-1.5 font-mono text-[10px] sm:block">Ctrl K</kbd>
        </label>

        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle dark mode" className="text-primary">
          {dark ? <Moon /> : <Sun />}
        </Button>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="bg-primary/8 text-primary border-primary/30 flex size-9 items-center justify-center rounded-full border text-sm font-semibold uppercase"
                aria-label="Account menu"
              >
                {user.display_name.slice(0, 1)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div>{user.display_name}</div>
                <div className="text-muted-foreground text-xs font-normal">@{user.username}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/settings")}>
                <Settings /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/backup")}>
                <Archive /> Export & backup
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onSelect={() => navigate("/admin/users")}>
                  <Users /> Users
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem onSelect={() => navigate("/admin/ai")}>
                  <Sparkles /> AI providers
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={logout}>
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/login?next=${encodeURIComponent(pathname)}`}>
              <LogIn /> Log in
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
