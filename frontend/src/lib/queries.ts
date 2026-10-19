import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

/** One recipe by slug, shared by the header, detail, cooking view and editor. */
export function useRecipe(slug: string | undefined) {
  return useQuery({ queryKey: ["recipe", slug], queryFn: () => api.recipe(slug!), enabled: !!slug });
}

/**
 * Slugs that changed when a recipe was renamed, old to new. History can still hold the old address
 * (the editor goes back to it after saving), so the recipe page sends it on to the new one.
 */
export const renamedSlugs = new Map<string, string>();
