import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

/** One recipe by slug, shared by the header, detail, cooking view and editor. */
export function useRecipe(slug: string | undefined) {
  return useQuery({ queryKey: ["recipe", slug], queryFn: () => api.recipe(slug!), enabled: !!slug });
}
