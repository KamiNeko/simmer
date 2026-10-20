import { useQuery } from "@tanstack/react-query";

import { api } from "./api";
import { BASE_LANGUAGE, type LanguageCode } from "./languages";

/** One recipe by slug, shared by the header, detail, cooking view and editor; English unless a language is given. */
export function useRecipe(slug: string | undefined, lang: LanguageCode = BASE_LANGUAGE) {
  return useQuery({ queryKey: ["recipe", slug, lang], queryFn: () => api.recipe(slug!, lang), enabled: !!slug });
}

/**
 * Slugs that changed when a recipe was renamed, old to new. History can still hold the old address
 * (the editor goes back to it after saving), so the recipe page sends it on to the new one.
 */
export const renamedSlugs = new Map<string, string>();
