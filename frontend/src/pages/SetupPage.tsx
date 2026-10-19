import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { AuthCard } from "./AuthCard";

export function SetupPage() {
  const [form, setForm] = useState({ username: "", display_name: "", password: "" });
  const { refresh } = useAuth();
  const setup = useMutation({
    meta: { inlineError: true }, mutationFn: () => api.setup(form), onSuccess: () => refresh() });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setup.mutate();
  };

  return (
    <AuthCard title="Welcome to Simmer" subtitle="Create the admin account to get started.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display_name">Your name</Label>
          <Input id="display_name" value={form.display_name} onChange={set("display_name")} autoFocus required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" autoComplete="username" value={form.username} onChange={set("username")} pattern="[A-Za-z0-9_.\-]+" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} required />
          <p className="text-muted-foreground text-xs">At least 8 characters.</p>
        </div>
        {setup.isError && <p className="text-destructive text-sm">{setup.error.message}</p>}
        <Button type="submit" className="w-full" disabled={setup.isPending}>
          Create admin account
        </Button>
      </form>
    </AuthCard>
  );
}
