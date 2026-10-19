import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { AuthCard } from "./AuthCard";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const next = params.get("next");
  const login = useMutation({
    meta: { inlineError: true },
    mutationFn: () => api.login(username, password),
    onSuccess: async () => {
      await refresh();
      navigate(next?.startsWith("/") ? next : "/", { replace: true });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <AuthCard title="Log in" subtitle="Log in to add and edit recipes.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {login.isError && <p className="text-destructive text-sm">{login.error.message}</p>}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          Log in
        </Button>
        <Link to="/" className="text-muted-foreground hover:text-foreground block text-center text-sm">
          Browse recipes without logging in
        </Link>
      </form>
    </AuthCard>
  );
}
