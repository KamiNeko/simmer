import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, ShoppingBasket, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ServingsStepper } from "@/components/ServingsStepper";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api, type ShoppingList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { combineIngredients, listAsText } from "@/lib/shopping";
import { cn } from "@/lib/utils";

import { PageFrame } from "./PageFrame";

function CheckRow({ checked, onToggle, children, onRemove }: { checked: boolean; onToggle: () => void; children: React.ReactNode; onRemove?: () => void }) {
  return (
    <li className="group flex items-start gap-3 py-2">
      <label className="flex flex-1 cursor-pointer items-start gap-3">
        <Checkbox checked={checked} onChange={onToggle} className="mt-0.5 size-5" />
        <span className={cn("leading-snug", checked && "text-muted-foreground line-through")}>{children}</span>
      </label>
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground p-0.5 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Remove item">
          <X className="size-4" />
        </button>
      )}
    </li>
  );
}

export function ShoppingPage() {
  const client = useQueryClient();
  const { user } = useAuth();
  const list = useQuery({ queryKey: ["shopping"], queryFn: api.shopping });
  const [extra, setExtra] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const update = useMutation({
    mutationFn: (fn: () => Promise<ShoppingList>) => fn(),
    onSuccess: (data) => client.setQueryData(["shopping"], data),
  });

  if (!list.data) return <PageFrame title="Shopping list">{list.isError ? "Couldn't load the list." : null}</PageFrame>;
  const data = list.data;
  const lines = combineIngredients(data, user?.unit_system ?? "metric");
  const checked = new Set(data.checked);
  const open = lines.filter((l) => !checked.has(l.key));
  const done = lines.filter((l) => checked.has(l.key));
  const empty = !data.recipes.length && !data.extras.length;

  const addExtra = (e: FormEvent) => {
    e.preventDefault();
    if (!extra.trim()) return;
    update.mutate(() => api.shoppingAddExtra(extra.trim()));
    setExtra("");
  };

  const copy = async () => {
    const text = listAsText(
      open,
      data.extras.filter((x) => !x.checked).map((x) => x.text),
    );
    try {
      await navigator.clipboard.writeText(text);
      toast.success("List copied");
    } catch {
      toast.error("Copying isn't allowed in this browser");
    }
  };

  const line = (l: (typeof lines)[0]) => (
    <CheckRow key={l.key} checked={checked.has(l.key)} onToggle={() => update.mutate(() => api.shoppingCheck(l.key, !checked.has(l.key)))}>
      {l.amount && <span className="font-semibold">{l.amount} </span>}
      {l.name}
      {data.recipes.length > 1 && <span className="text-muted-foreground block text-xs">{l.recipes.join(" · ")}</span>}
    </CheckRow>
  );

  return (
    <PageFrame
      title="Shopping list"
      actions={
        !empty && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={copy}>
              <Copy /> Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
              <Trash2 /> Clear
            </Button>
          </div>
        )
      }
    >
      {empty && (
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-12 text-center text-sm">
          <ShoppingBasket className="size-10 opacity-50" />
          <p>
            Your list is empty. Use <span className="text-foreground font-medium">Add to list</span> on a recipe, or add items below.
          </p>
        </div>
      )}

      {data.recipes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Recipes</h2>
          <div className="flex flex-wrap gap-2">
            {data.recipes.map(({ recipe, servings }) => (
              <div key={recipe.id} className="bg-card flex items-center gap-1 rounded-lg border py-1 pr-1 pl-3 text-sm">
                <Link to={`/recipes/${recipe.slug}`} className="max-w-48 truncate font-medium hover:underline">
                  {recipe.title}
                </Link>
                <ServingsStepper
                  title={recipe.title}
                  servings={servings}
                  perServing={!!recipe.servings}
                  onChange={(value) => update.mutate(() => api.shoppingPutRecipe(recipe.slug, value))}
                  className="ml-1 border-0"
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground p-1"
                  onClick={() => update.mutate(() => api.shoppingRemoveRecipe(recipe.slug))}
                  aria-label={`Remove ${recipe.title} from the list`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-card rounded-xl border px-4 py-2">
        <ul className="divide-y">
          {open.map(line)}
          {data.extras
            .filter((x) => !x.checked)
            .map((x) => (
              <CheckRow
                key={`x${x.id}`}
                checked={false}
                onToggle={() => update.mutate(() => api.shoppingUpdateExtra(x.id, { checked: true }))}
                onRemove={() => update.mutate(() => api.shoppingDeleteExtra(x.id))}
              >
                {x.text}
              </CheckRow>
            ))}
        </ul>
        <form onSubmit={addExtra} className="flex gap-2 py-2">
          <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Add an item, e.g. kitchen paper" aria-label="Add an item" />
          <Button type="submit" variant="outline" disabled={!extra.trim()}>
            <Plus /> Add
          </Button>
        </form>
      </section>

      {(done.length > 0 || data.extras.some((x) => x.checked)) && (
        <section className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">In the basket</h2>
            {data.extras.some((x) => x.checked) && (
              <Button variant="ghost" size="sm" onClick={() => update.mutate(() => api.shoppingClear(true))}>
                Remove ticked items
              </Button>
            )}
          </div>
          <ul className="divide-y px-4">
            {done.map(line)}
            {data.extras
              .filter((x) => x.checked)
              .map((x) => (
                <CheckRow
                  key={`x${x.id}`}
                  checked
                  onToggle={() => update.mutate(() => api.shoppingUpdateExtra(x.id, { checked: false }))}
                  onRemove={() => update.mutate(() => api.shoppingDeleteExtra(x.id))}
                >
                  {x.text}
                </CheckRow>
              ))}
          </ul>
        </section>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the shopping list?</AlertDialogTitle>
            <AlertDialogDescription>This removes all recipes and items from your list.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => update.mutate(() => api.shoppingClear())}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
