import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Lock, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, type Comment, type Journal, type Recipe } from "@/lib/api";
import { cn, formatDate, relativeDate } from "@/lib/utils";

import { StarInput } from "./Stars";

function useJournal(slug: string) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["journal", slug], queryFn: () => api.journal(slug) });
  const refresh = (journal?: Journal) => {
    if (journal) client.setQueryData(["journal", slug], journal);
    else client.invalidateQueries({ queryKey: ["journal", slug] });
    client.invalidateQueries({ queryKey: ["recipe", slug] });
    client.invalidateQueries({ queryKey: ["recipes"] });
  };
  return { journal: query.data, refresh };
}

/** Rating and "I cooked this" controls shown under the recipe title. */
export function CookBar({ recipe, actions }: { recipe: Recipe; actions?: ReactNode }) {
  const { journal, refresh } = useJournal(recipe.slug);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const rate = useMutation({
    mutationFn: (stars: number | null) => (stars ? api.rate(recipe.slug, stars) : api.unrate(recipe.slug)),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const undo = useMutation({ mutationFn: api.undoCooked, onSuccess: () => refresh() });
  const cook = useMutation({
    mutationFn: () => api.cooked(recipe.slug, note),
    onSuccess: (j) => {
      refresh(j);
      setOpen(false);
      setNote("");
      const latest = j.cooks[0];
      toast.success("Logged as cooked", { action: { label: "Undo", onClick: () => undo.mutate(latest.id) } });
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    cook.mutate();
  };

  return (
    <div className="bg-card flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Your rating</span>
        <StarInput value={journal?.rating ?? recipe.my_rating} onChange={(s) => rate.mutate(s)} disabled={rate.isPending} />
      </div>
      <div className="text-muted-foreground text-xs">
        {recipe.my_cooked_count > 0 && recipe.my_last_cooked_at
          ? `You cooked this ${recipe.my_cooked_count}× · last ${relativeDate(recipe.my_last_cooked_at)}`
          : "You haven't cooked this yet"}
      </div>
      <div className="ml-auto flex gap-2">
        {actions}
        <Button size="sm" onClick={() => setOpen(true)}>
          <ChefHat /> I cooked this
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Cooked {recipe.title}</DialogTitle>
              <DialogDescription>Anything to remember for next time? The note is only visible to you.</DialogDescription>
            </DialogHeader>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Needs more salt, sauce was too thick" rows={3} autoFocus />
            <DialogFooter>
              <Button type="submit" disabled={cook.isPending}>
                {note.trim() ? "Save with note" : "Log without note"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteItem({ comment, slug }: { comment: Comment; slug: string }) {
  const { refresh } = useJournal(slug);
  const update = useMutation({
    mutationFn: (done: boolean) => api.updateComment(comment.id, { done }),
    onSuccess: () => refresh(),
  });
  const remove = useMutation({ mutationFn: () => api.deleteComment(comment.id), onSuccess: () => refresh() });
  return (
    <li className="group flex items-start gap-3 py-3">
      <input
        type="checkbox"
        checked={comment.done}
        onChange={(e) => update.mutate(e.target.checked)}
        title={comment.done ? "Mark as open" : "Mark as worked into the recipe"}
        className="border-input checked:bg-primary checked:border-primary mt-0.5 grid size-4.5 shrink-0 cursor-pointer appearance-none place-content-center rounded border-[1.5px] transition-colors before:hidden before:h-2.5 before:w-1.5 before:translate-y-[-1px] before:rotate-45 before:border-r-2 before:border-b-2 before:border-white before:content-[''] checked:before:block"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("leading-snug whitespace-pre-line", comment.done && "text-muted-foreground line-through")}>{comment.text}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {comment.cooked_at ? (
            <span className="inline-flex items-center gap-1">
              <ChefHat className="size-3" /> After cooking on {formatDate(comment.cooked_at)}
            </span>
          ) : (
            formatDate(comment.created_at)
          )}
          {comment.done && " · worked into the recipe"}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="opacity-60 group-hover:opacity-100"
        onClick={() => remove.mutate()}
        aria-label="Delete note"
      >
        <Trash2 />
      </Button>
    </li>
  );
}

/** Private notes and cooking history at the bottom of a recipe. */
export function NotesSection({ slug }: { slug: string }) {
  const { journal, refresh } = useJournal(slug);
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: () => api.addComment(slug, text),
    onSuccess: () => {
      setText("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const undo = useMutation({ mutationFn: api.undoCooked, onSuccess: () => refresh() });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) add.mutate();
  };
  const comments = [...(journal?.comments ?? [])].sort((a, b) => Number(a.done) - Number(b.done));

  return (
    <section className="mt-12 border-t pt-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Your notes</h2>
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <Lock className="size-3" /> Only you can see these
        </span>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note, e.g. try it with tofu next time" rows={1} className="min-h-9 flex-1" />
        <Button type="submit" variant="outline" disabled={!text.trim() || add.isPending}>
          Add note
        </Button>
      </form>
      {comments.length > 0 && (
        <ul className="mt-2 divide-y">
          {comments.map((c) => (
            <NoteItem key={c.id} comment={c} slug={slug} />
          ))}
        </ul>
      )}
      {journal && journal.cooks.length > 0 && (
        <div className="mt-6">
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Cooking history</h3>
          <div className="flex flex-wrap gap-1.5">
            {journal.cooks.map((c) => (
              <span key={c.id} className="bg-muted group inline-flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-xs">
                {formatDate(c.cooked_at)}
                <button
                  type="button"
                  onClick={() => undo.mutate(c.id)}
                  className="text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100"
                  aria-label={`Remove cook on ${formatDate(c.cooked_at)}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
