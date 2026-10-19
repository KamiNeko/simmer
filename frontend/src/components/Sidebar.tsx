import { useQuery } from "@tanstack/react-query";
import { BookOpen, Hash, Plus, ShoppingBasket, Sparkles, User as UserIcon, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { Logo } from "./Logo";

function NavItem({ to, active, icon, children, count }: { to: string; active: boolean; icon: ReactNode; children: ReactNode; count?: number }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[15px] transition-colors",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className={cn("[&_svg]:size-4", active && "text-primary")}>{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 font-mono text-[10px]",
            active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const { user, isAdmin } = useAuth();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const tag = params.get("tag");
  const mine = params.get("mine") === "1";
  const tags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const shopping = useQuery({ queryKey: ["shopping"], queryFn: api.shopping, enabled: !!user });
  const onList = shopping.data ? shopping.data.recipes.length + shopping.data.extras.filter((x) => !x.checked).length : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b px-4">
        <Link to="/">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        <div className="space-y-0.5">
          <NavItem to="/" active={!tag && !mine && !pathname.startsWith("/admin") && pathname !== "/shopping"} icon={<BookOpen />}>
            All Recipes
          </NavItem>
          {user && (
            <NavItem to="/?mine=1" active={mine} icon={<UserIcon />}>
              My Recipes
            </NavItem>
          )}
          {user && (
            <NavItem to="/shopping" active={pathname === "/shopping"} icon={<ShoppingBasket />} count={onList || undefined}>
              Shopping list
            </NavItem>
          )}
        </div>

        <div>
          <div className="text-muted-foreground mb-1.5 flex items-center justify-between px-3 text-[11px] font-semibold tracking-wider uppercase">
            <span className="flex items-center gap-1.5">
              <Hash className="size-3" /> Tags
            </span>
          </div>
          {tags.data?.length ? (
            <div className="space-y-0.5">
              {tags.data.map((t) => (
                <NavItem
                  key={t.name}
                  to={`/?tag=${encodeURIComponent(t.name)}`}
                  active={tag?.toLowerCase() === t.name.toLowerCase()}
                  icon={<Hash />}
                  count={t.count}
                >
                  {t.name}
                </NavItem>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground px-3 text-xs italic">No tags</p>
          )}
        </div>

        {isAdmin && (
          <div>
            <div className="text-muted-foreground mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase">
              Admin
            </div>
            <NavItem to="/admin/users" active={pathname === "/admin/users"} icon={<Users />}>
              Users
            </NavItem>
            <NavItem to="/admin/ai" active={pathname === "/admin/ai"} icon={<Sparkles />}>
              AI providers
            </NavItem>
          </div>
        )}
      </nav>

      <div className="text-muted-foreground flex items-center justify-between border-t px-4 py-3 text-xs">
        {user ? (
          <>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Signed in as {user.display_name}
            </span>
            <Link to="/new" className="hover:text-foreground" title="New recipe">
              <Plus className="size-4" />
            </Link>
          </>
        ) : (
          <span>Read-only view</span>
        )}
      </div>
    </div>
  );
}
