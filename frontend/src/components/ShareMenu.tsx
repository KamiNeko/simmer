import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { BASE_LANGUAGE, type LanguageCode, NATIVE_NAMES } from "@/lib/languages";
import { useLanguages } from "@/lib/readingLanguage";

/** The address of a recipe that opens in a language; English links carry no ?lang. */
export function shareLink(slug: string, language: LanguageCode) {
  const url = new URL(`/recipes/${encodeURIComponent(slug)}`, window.location.origin);
  if (language !== BASE_LANGUAGE) url.searchParams.set("lang", language);
  return url.toString();
}

/** Copy a link to the recipe in one of the shared languages. */
export function ShareMenu({ slug }: { slug: string }) {
  const languages = useLanguages() ?? [BASE_LANGUAGE];
  // Over plain http browsers have no clipboard access, so the link is shown to copy by hand.
  const [shown, setShown] = useState<string | null>(null);

  const share = async (language: LanguageCode) => {
    const link = shareLink(slug, language);
    try {
      await navigator.clipboard.writeText(link);
      toast.success(language === BASE_LANGUAGE ? "Link copied" : `Link in ${NATIVE_NAMES[language]} copied`);
    } catch {
      setShown(link);
    }
  };

  return (
    <>
      {languages.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" aria-label="Share" title="Copy a link to this recipe">
              <Share2 /> <span className="hidden sm:inline">Share</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Copy a link in</DropdownMenuLabel>
            {languages.map((code) => (
              <DropdownMenuItem key={code} onSelect={() => share(code)}>
                <Copy /> {NATIVE_NAMES[code]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button size="sm" variant="outline" aria-label="Share" title="Copy a link to this recipe" onClick={() => share(BASE_LANGUAGE)}>
          <Share2 /> <span className="hidden sm:inline">Share</span>
        </Button>
      )}
      <Dialog open={shown !== null} onOpenChange={(open) => !open && setShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to this recipe</DialogTitle>
            <DialogDescription>Copy the link and send it. Anyone who can reach Simmer can open it without an account.</DialogDescription>
          </DialogHeader>
          <Input readOnly value={shown ?? ""} aria-label="Link" autoFocus onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" className="justify-self-end" onClick={() => setShown(null)}>
            <Check /> Done
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
