import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages, Loader2, PlugZap, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AIProvider, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BASE_LANGUAGE, type LanguageCode, LANGUAGES } from "@/lib/languages";

import { PageFrame, Panel } from "./PageFrame";

const KEY_LINKS: Record<AIProvider["kind"], string> = {
  anthropic: "https://platform.claude.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
};

function ProviderCard({ provider }: { provider: AIProvider }) {
  const client = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(provider.model);
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["admin-ai-providers"] });
    client.invalidateQueries({ queryKey: ["ai-providers"] });
  };

  const save = useMutation({
    mutationFn: (makeDefault: boolean) =>
      api.saveProvider(provider.kind, { api_key: apiKey.trim() || undefined, model: model.trim(), is_default: makeDefault }),
    onSuccess: () => {
      setApiKey("");
      refresh();
      toast.success(`${provider.label} saved`);
    },
  });
  const test = useMutation({
    mutationFn: () => api.testProvider(provider.kind),
    onSuccess: () => toast.success(`${provider.label} answered`),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteProvider(provider.kind),
    onSuccess: () => {
      refresh();
      toast.success(`${provider.label} removed`);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(provider.is_default);
  };

  return (
    <section className="bg-card rounded-xl border p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{provider.label}</h2>
          {provider.is_default && <Badge>Default</Badge>}
          {!provider.configured && <Badge variant="dashed">Not set up</Badge>}
          <a href={KEY_LINKS[provider.kind]} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground ml-auto text-xs underline-offset-2 hover:underline">
            Get an API key
          </a>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${provider.kind}-key`}>API key</Label>
            <Input
              id={`${provider.kind}-key`}
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider.configured ? `Saved, ends in ${provider.key_hint}` : "Paste the key"}
              required={!provider.configured}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${provider.kind}-model`}>Model</Label>
            <Input id={`${provider.kind}-model`} value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider.default_model} required />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={save.isPending}>
            Save
          </Button>
          {provider.configured && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
                {test.isPending ? <Loader2 className="animate-spin" /> : <PlugZap />} Test connection
              </Button>
              {!provider.is_default && (
                <Button type="button" variant="outline" size="sm" onClick={() => save.mutate(true)} disabled={save.isPending}>
                  Make default
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => remove.mutate()} disabled={remove.isPending}>
                <Trash2 /> Remove
              </Button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}

const TRANSLATABLE = (Object.keys(LANGUAGES) as LanguageCode[]).filter((code) => code !== BASE_LANGUAGE);

/** The languages recipes are translated into for sharing, and a button to translate the ones still missing. */
function TranslationsPanel({ hasAI }: { hasAI: boolean }) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["admin-translations"],
    queryFn: api.translationStatus,
    // Follow the background job while it runs.
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  });
  const updated = (data: Awaited<ReturnType<typeof api.translationStatus>>) => {
    client.setQueryData(["admin-translations"], data);
    client.invalidateQueries({ queryKey: ["languages"] });
  };
  const save = useMutation({ mutationFn: api.saveTranslationLanguages, onSuccess: updated });
  const fill = useMutation({ mutationFn: api.fillTranslations, onSuccess: updated });
  const data = status.data;
  const running = !!data?.running;
  const wasRunning = useRef(false);
  useEffect(() => {
    // When the job finishes, recipes have new translations to show.
    if (wasRunning.current && !running) {
      client.invalidateQueries({ queryKey: ["recipes"] });
      client.invalidateQueries({ queryKey: ["recipe"] });
    }
    wasRunning.current = running;
  }, [running, client]);
  if (!data) return null;

  const toggle = (code: LanguageCode) =>
    save.mutate(data.languages.includes(code) ? data.languages.filter((c) => c !== code) : [...data.languages, code]);

  return (
    <Panel
      title="Translations for sharing"
      description="Recipes are kept in English. Choose languages to share them in: new and edited recipes are then translated by the default AI provider, and readers can switch the language at the top of the page or open a shared link in it."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TRANSLATABLE.map((code) => (
          <label key={code} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={data.languages.includes(code)} onChange={() => toggle(code)} disabled={save.isPending} />
            {LANGUAGES[code]}
          </label>
        ))}
      </div>
      {data.languages.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
          <Languages className="text-muted-foreground size-4" />
          <span className="min-w-0 flex-1">
            {data.running
              ? `Translating… ${data.done} of ${data.total} done.`
              : data.missing === 0
                ? "Every recipe is translated."
                : `${data.missing} ${data.missing === 1 ? "translation is" : "translations are"} missing or outdated.`}
          </span>
          {data.missing > 0 && hasAI && (
            <Button size="sm" variant="outline" onClick={() => fill.mutate()} disabled={data.running || fill.isPending}>
              {data.running ? <Loader2 className="animate-spin" /> : <Languages />} Translate now
            </Button>
          )}
        </div>
      )}
      {!data.running && data.failed > 0 && (
        <p className="text-destructive text-sm">
          {data.failed} {data.failed === 1 ? "translation" : "translations"} failed{data.error ? `: ${data.error}` : ""}.
        </p>
      )}
      {!hasAI && data.languages.length > 0 && <p className="text-muted-foreground text-sm">Translating needs an AI provider. Set one up above.</p>}
    </Panel>
  );
}

export function AIProvidersPage() {
  const { isAdmin } = useAuth();
  const providers = useQuery({ queryKey: ["admin-ai-providers"], queryFn: api.adminProviders, enabled: isAdmin });
  if (!isAdmin) return <Navigate to="/" replace />;
  return (
    <PageFrame title="AI providers">
      <Panel
        title="AI for importing"
        description="Simmer uses the default provider to read imported recipes and to tidy up typed ones. Anyone with an account can switch provider on the import screen. Keys are stored encrypted and never shown again."
      >
        <p className="text-muted-foreground text-sm">Without a provider, links still import from the page's recipe data, just without grouping fixes and densities.</p>
      </Panel>
      {providers.data?.map((p) => <ProviderCard key={`${p.kind}-${p.configured}-${p.model}`} provider={p} />)}
      {providers.data && <TranslationsPanel hasAI={providers.data.some((p) => p.configured)} />}
    </PageFrame>
  );
}
