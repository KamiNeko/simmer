import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type User } from "./api";

export function useAuth() {
  const query = useQuery({ queryKey: ["auth"], queryFn: api.me, staleTime: 60_000 });
  const client = useQueryClient();
  const user: User | null = query.data?.user ?? null;
  return {
    user,
    isAdmin: user?.role === "admin",
    needsSetup: query.data?.needs_setup ?? false,
    loading: query.isLoading,
    refresh: () => client.invalidateQueries(),
  };
}
