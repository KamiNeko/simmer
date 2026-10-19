import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Plus, Shield, Trash2, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Role, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

import { PageFrame } from "./PageFrame";

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const client = useQueryClient();
  const [form, setForm] = useState({ username: "", display_name: "", password: "", role: "member" as Role });
  const create = useMutation({
    mutationFn: () => api.createUser(form),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["users"] });
      toast.success(`Account for ${form.display_name} created`);
      setForm({ username: "", display_name: "", password: "", role: "member" });
      onOpenChange(false);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-username">Username</Label>
              <Input id="new-username" value={form.username} pattern="[A-Za-z0-9_.\-]+" onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Password</Label>
              <Input id="new-password" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const reset = useMutation({
    mutationFn: () => api.updateUser(user!.id, { password }),
    onSuccess: () => {
      toast.success(`Password for ${user!.display_name} reset`);
      setPassword("");
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    reset.mutate();
  };
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {user?.display_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" required autoFocus />
          <DialogFooter>
            <Button type="submit" disabled={reset.isPending}>
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPage() {
  const { user: me, isAdmin } = useAuth();
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const users = useQuery({ queryKey: ["users"], queryFn: api.users, enabled: isAdmin });
  const update = useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) => api.updateUser(id, { role }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["users"] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["users"] });
      toast.success("Account deleted");
    },
  });

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <PageFrame
      title="Users"
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> New account
        </Button>
      }
    >
      <div className="bg-card divide-y rounded-xl border">
        {users.data?.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-4">
            <div className="bg-primary/15 text-primary flex size-9 items-center justify-center rounded-full text-sm font-semibold uppercase">
              {u.display_name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {u.display_name}
                {u.role === "admin" && <Badge variant="secondary">Admin</Badge>}
                {u.id === me?.id && <span className="text-muted-foreground text-xs">(you)</span>}
              </div>
              <div className="text-muted-foreground text-xs">
                @{u.username} · since {formatDate(u.created_at)}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.display_name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setResetting(u)}>
                  <KeyRound /> Reset password
                </DropdownMenuItem>
                {u.role === "member" ? (
                  <DropdownMenuItem onSelect={() => update.mutate({ id: u.id, role: "admin" })}>
                    <Shield /> Make admin
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => update.mutate({ id: u.id, role: "member" })}>
                    <UserRound /> Make member
                  </DropdownMenuItem>
                )}
                {u.id !== me?.id && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => confirm(`Delete the account of ${u.display_name}? Their recipes stay.`) && remove.mutate(u.id)}
                    >
                      <Trash2 /> Delete account
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">There is no public sign-up. Members can add recipes and edit their own; admins can edit everything and manage accounts.</p>
      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </PageFrame>
  );
}
