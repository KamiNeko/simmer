import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlugZap, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AIProvider, api } from "@/lib/api";

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

export function AIProvidersPage() {
  const providers = useQuery({ queryKey: ["admin-ai-providers"], queryFn: api.adminProviders });
  return (
    <PageFrame title="AI providers">
      <Panel
        title="AI for importing"
        description="Simmer uses the default provider to read imported recipes and to tidy up typed ones. Anyone with an account can switch provider on the import screen. Keys are stored encrypted and never shown again."
      >
        <p className="text-muted-foreground text-sm">Without a provider, links still import from the page's recipe data, just without grouping fixes and densities.</p>
      </Panel>
      {providers.data?.map((p) => <ProviderCard key={`${p.kind}-${p.configured}-${p.model}`} provider={p} />)}
    </PageFrame>
  );
}
