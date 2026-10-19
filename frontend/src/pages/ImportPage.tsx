import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Link2, Loader2, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type AIProvider, api, type ImportRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { PageFrame, Panel } from "./PageFrame";

/** Router state handed to the editor, which shows the draft for review. */
export interface ImportState {
  request: ImportRequest;
  result: Awaited<ReturnType<typeof api.importRecipe>>;
}

const DEFAULT = "default";

export function ProviderSelect({
  providers,
  value,
  onChange,
  allowNone = true,
  className,
}: {
  providers: AIProvider[];
  value: string;
  onChange: (value: string) => void;
  allowNone?: boolean;
  className?: string;
}) {
  const fallback = providers.find((p) => p.is_default);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label="AI provider">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fallback && <SelectItem value={DEFAULT}>Default ({fallback.label})</SelectItem>}
        {providers.map((p) => (
          <SelectItem key={p.kind} value={p.kind}>
            {p.label} · {p.model}
          </SelectItem>
        ))}
        {allowNone && <SelectItem value="none">Without AI (page data only)</SelectItem>}
      </SelectContent>
    </Select>
  );
}

export const providerParam = (value: string) => (value === DEFAULT ? undefined : value);

export function ImportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: api.aiProviders });
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [provider, setProvider] = useState(DEFAULT);

  const hasAI = (providers.data?.length ?? 0) > 0;
  const choice = hasAI ? provider : "none";

  const run = useMutation({
    mutationFn: (request: ImportRequest) => api.importRecipe(request).then((result) => ({ request, result })),
    onSuccess: (state: ImportState) => navigate("/new", { state: { imported: state } }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const request: ImportRequest =
      mode === "url" ? { url: url.trim(), provider: providerParam(choice) } : { text, provider: providerParam(choice) };
    run.mutate(request);
  };

  const tab = (value: "url" | "text", icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors [&_svg]:size-4",
        mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon} {label}
    </button>
  );

  return (
    <PageFrame title="Import recipe">
      <Panel
        title="Import a recipe"
        description="Simmer reads the recipe, sorts the ingredients into groups and shows it to you in the editor before anything is saved."
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="bg-muted inline-flex gap-1 rounded-lg p-1">
            {tab("url", <Link2 />, "From a link")}
            {tab("text", <FileText />, "From text")}
          </div>

          {mode === "url" ? (
            <div className="space-y-2">
              <Label htmlFor="import-url">Recipe link</Label>
              <Input
                id="import-url"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                autoFocus
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="import-text">Recipe text</Label>
              <Textarea
                id="import-text"
                required
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the whole recipe: title, ingredients and steps."
                autoFocus
              />
              {!hasAI && providers.isSuccess && (
                <p className="text-muted-foreground text-xs">Importing text needs an AI provider. An admin can add one in AI providers.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            {hasAI ? (
              <div className="space-y-2">
                <Label>AI provider</Label>
                <ProviderSelect providers={providers.data!} value={provider} onChange={setProvider} allowNone={mode === "url"} className="w-64" />
              </div>
            ) : (
              providers.isSuccess && (
                <p className="text-muted-foreground max-w-md text-xs">
                  No AI provider is set up, so links are imported from the page's recipe data as is.
                  {user?.role === "admin" && " You can add one under AI providers."}
                </p>
              )
            )}
            <Button type="submit" className="ml-auto" disabled={run.isPending || (mode === "text" && !hasAI)}>
              {run.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {run.isPending ? "Reading the recipe…" : "Import"}
            </Button>
          </div>
          {run.isPending && choice !== "none" && (
            <p className="text-muted-foreground text-xs">The AI usually needs between a few seconds and a minute.</p>
          )}
          {run.isError && (
            <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">{run.error.message}</p>
          )}
        </form>
      </Panel>
    </PageFrame>
  );
}
