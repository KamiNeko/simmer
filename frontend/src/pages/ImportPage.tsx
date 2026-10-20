import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, FileText, ImagePlus, Link2, Loader2, Sparkles, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { BookmarkletGuide } from "@/components/BookmarkletGuide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type AIProvider, api, type ImportRequest } from "@/lib/api";
import { isBrowserPage, looksLikeHtml, READY, reducePage } from "@/lib/browserImport";
import { useAuth } from "@/lib/auth";
import { type LanguageCode, LANGUAGES } from "@/lib/languages";
import { cn } from "@/lib/utils";

import { PageFrame, Panel } from "./PageFrame";

/** Router state handed to the editor, which shows the draft for review. */
export interface ImportState {
  request: ImportRequest;
  result: Awaited<ReturnType<typeof api.importRecipe>>;
}

const DEFAULT = "default";
// Radix Select items can't have an empty value.
const KEEP = "keep";
const MAX_PHOTOS = 6;

type Mode = "url" | "text" | "photo";

function PhotoPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    // oxlint-disable-next-line react/set-state-in-effect -- object URLs are created and revoked with the files
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  return (
    <div className="flex flex-wrap gap-3">
      {previews.map((src, i) => (
        <div key={src} className="relative h-28 w-24 overflow-hidden rounded-lg border">
          <img src={src} alt={`Page ${i + 1}`} className="size-full object-cover" />
          <span className="bg-background/80 absolute bottom-1 left-1 rounded px-1.5 font-mono text-[10px]">{i + 1}</span>
          <button
            type="button"
            onClick={() => onChange(files.filter((_, j) => j !== i))}
            className="bg-background/80 hover:bg-background absolute top-1 right-1 rounded-full p-0.5"
            aria-label={`Remove photo ${i + 1}`}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {files.length < MAX_PHOTOS && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="bg-muted text-muted-foreground hover:border-primary/60 hover:text-foreground flex h-28 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs"
        >
          <ImagePlus className="size-5" /> Add photo
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, MAX_PHOTOS));
          e.target.value = "";
        }}
      />
    </div>
  );
}

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

/** The language to translate an import into, or "" to keep the recipe's language. */
export function LanguageSelect({
  value,
  onChange,
  className,
}: {
  value: LanguageCode | "";
  onChange: (value: LanguageCode | "") => void;
  className?: string;
}) {
  return (
    <Select value={value || KEEP} onValueChange={(v) => onChange(v === KEEP ? "" : (v as LanguageCode))}>
      <SelectTrigger className={className} aria-label="Language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={KEEP}>Keep the recipe's language</SelectItem>
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <SelectItem key={code} value={code}>
            Translate to {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const providerParam = (value: string) => (value === DEFAULT ? undefined : value);

export function ImportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const fromBrowser = params.get("from") === "browser";
  const [waiting, setWaiting] = useState(fromBrowser);
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: api.aiProviders });
  const [mode, setMode] = useState<Mode>("url");
  const [photos, setPhotos] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [provider, setProvider] = useState(DEFAULT);
  const [language, setLanguage] = useState<LanguageCode | "">(user?.import_language ?? "");

  const hasAI = (providers.data?.length ?? 0) > 0;
  // Pasted page source is read like a link, from the page's recipe data.
  const pageSource = mode === "text" && looksLikeHtml(text);
  const pageData = mode === "url" || pageSource;
  // Text and photos always need the AI, so "without AI" falls back to the default there.
  const choice = !hasAI ? "none" : !pageData && provider === "none" ? DEFAULT : provider;

  const run = useMutation({
    meta: { inlineError: true },
    mutationFn: (request: ImportRequest) => api.importRecipe(request).then((result) => ({ request, result })),
    onSuccess: (state: ImportState) => navigate("/new", { state: { imported: state } }),
  });

  // Opened by the Save to Simmer bookmark: ask the recipe tab for its page and import it.
  const { mutate } = run;
  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!fromBrowser || !providers.isSuccess || !opener) return;
    const receive = (e: MessageEvent) => {
      if (e.source !== opener || !isBrowserPage(e.data)) return;
      window.removeEventListener("message", receive);
      setWaiting(false);
      mutate({
        html: reducePage(e.data.html),
        url: e.data.url,
        provider: providers.data.length ? undefined : "none",
        translate_to: user?.import_language || undefined,
      });
    };
    window.addEventListener("message", receive);
    opener.postMessage(READY, "*");
    return () => window.removeEventListener("message", receive);
  }, [fromBrowser, providers.isSuccess, providers.data, mutate, user?.import_language]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const source =
      mode === "url" ? { url: url.trim() } : pageSource ? { html: reducePage(text) } : mode === "text" ? { text } : { photos };
    const translate = choice !== "none" && language ? { translate_to: language } : {};
    const request: ImportRequest = { ...source, provider: providerParam(choice), ...translate };
    run.mutate(request);
  };

  const tab = (value: Mode, icon: React.ReactNode, label: string) => (
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
        {fromBrowser && (waiting || run.isPending) && (
          <p className="border-primary/30 bg-primary/10 mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm">
            {window.opener ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Reading the recipe from your browser tab…
              </>
            ) : (
              "Open a recipe in your browser and click the Save to Simmer bookmark there."
            )}
          </p>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="bg-muted inline-flex gap-1 rounded-lg p-1">
            {tab("url", <Link2 />, "From a link")}
            {tab("text", <FileText />, "From text")}
            {tab("photo", <Camera />, "From photos")}
          </div>

          {mode === "photo" ? (
            <div className="space-y-2">
              <Label>Photos of the recipe</Label>
              <PhotoPicker files={photos} onChange={setPhotos} />
              <p className="text-muted-foreground text-xs">
                {hasAI || !providers.isSuccess
                  ? `Cookbook pages or a handwritten card, up to ${MAX_PHOTOS} photos in page order.`
                  : "Importing photos needs an AI provider. An admin can add one in AI providers."}
              </p>
            </div>
          ) : mode === "url" ? (
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
              <BookmarkletGuide />
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
              {pageSource ? (
                <p className="text-muted-foreground text-xs">This is a page's source, so Simmer reads the recipe data in it, like with a link.</p>
              ) : !hasAI && providers.isSuccess ? (
                <p className="text-muted-foreground text-xs">
                  Importing text needs an AI provider. An admin can add one in AI providers. Pasting a recipe page's source works without AI.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  You can also paste a recipe page's source (Ctrl+U on the page, then copy everything). Simmer then reads the page's recipe data.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            {hasAI ? (
              <>
                <div className="space-y-2">
                  <Label>AI provider</Label>
                  <ProviderSelect providers={providers.data!} value={choice} onChange={setProvider} allowNone={pageData} className="w-64" />
                </div>
                {choice !== "none" && (
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <LanguageSelect value={language} onChange={setLanguage} className="w-56" />
                  </div>
                )}
              </>
            ) : (
              // Text and photos have their own note: they can't be imported at all without AI.
              providers.isSuccess &&
              pageData && (
                <p className="text-muted-foreground max-w-md text-xs">
                  No AI provider is set up, so links are imported from the page's recipe data as is.
                  {user?.role === "admin" && " You can add one under AI providers."}
                </p>
              )
            )}
            <Button type="submit" className="ml-auto" disabled={run.isPending || (!pageData && !hasAI) || (mode === "photo" && !photos.length)}>
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
