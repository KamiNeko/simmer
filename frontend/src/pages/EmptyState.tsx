import { CookingPot } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function EmptyState() {
  const { user } = useAuth();
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <CookingPot className="size-10 opacity-50" />
      <p className="text-sm">Pick a recipe from the list.</p>
      {user && (
        <Button variant="outline" size="sm" asChild>
          <Link to="/new">Add a recipe</Link>
        </Button>
      )}
    </div>
  );
}
