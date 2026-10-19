import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, FileUp, Loader2 } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { PageFrame, Panel } from "./PageFrame";

export function BackupPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const run = useMutation({
    mutationFn: (f: File) => api.importFile(f),
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: ["recipes"] });
      client.invalidateQueries({ queryKey: ["tags"] });
      setFile(null);
      if (input.current) input.current.value = "";
      const n = result.imported.length;
      toast.success(n ? `Imported ${n} ${n === 1 ? "recipe" : "recipes"}` : "Nothing new to import");
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (file) run.mutate(file);
  };

  const result = run.data;

  return (
    <PageFrame title="Export & backup">
      <Panel
        title="Export recipes"
        description="Downloads every recipe with its ingredient groups, steps, tags and photo as a zip. Another Simmer can import it below. Ratings, cook logs and notes stay here."
      >
        <Button asChild>
          <a href="/api/export" download>
            <Download /> Download recipes
          </a>
        </Button>
      </Panel>

      <Panel title="Import recipes" description="Adds the recipes from a Simmer export. Recipes with a title that already exists here are skipped, and you become the author of the new ones.">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="file:bg-muted file:text-foreground text-muted-foreground min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            aria-label="Export file"
          />
          <Button type="submit" variant="outline" disabled={!file || run.isPending}>
            {run.isPending ? <Loader2 className="animate-spin" /> : <FileUp />} Import
          </Button>
        </form>
        {result && (
          <div className="space-y-2 text-sm">
            {result.imported.length > 0 && (
              <p>
                Imported:{" "}
                {result.imported.map((r, i) => (
                  <span key={r.slug}>
                    {i > 0 && ", "}
                    <Link to={`/recipes/${r.slug}`} className="text-primary hover:underline">
                      {r.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {result.skipped.length > 0 && <p className="text-muted-foreground">Already here, skipped: {result.skipped.join(", ")}</p>}
            {result.failed.length > 0 && (
              <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3">
                <p className="font-medium">Couldn't import:</p>
                <ul className="list-disc pl-5">
                  {result.failed.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Panel>

      {user?.role === "admin" && (
        <Panel
          title="Full backup"
          description="A copy of everything in the data folder: the database with users, ratings, notes, the meal plan and shopping lists, all photos, and the key that encrypts the AI provider keys. Keep it somewhere safe."
        >
          <Button variant="outline" asChild>
            <a href="/api/admin/backup" download>
              <Archive /> Download full backup
            </a>
          </Button>
          <p className="text-muted-foreground text-xs leading-relaxed">
            To restore, stop Simmer, unpack the zip into the data folder (<code className="font-mono">./data</code> with Docker Compose), and start it again.
          </p>
        </Panel>
      )}
    </PageFrame>
  );
}
