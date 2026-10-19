import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type UnitSystem } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { PageFrame, Panel } from "./PageFrame";

export function SettingsPage() {
  const { user, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [units, setUnits] = useState<UnitSystem>(user?.unit_system ?? "metric");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const profile = useMutation({
    mutationFn: () => api.updateMe({ display_name: displayName, unit_system: units }),
    onSuccess: () => {
      refresh();
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const password = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast.success("Password changed");
    },
    onError: (e) => toast.error(e.message),
  });

  const onProfile = (e: FormEvent) => {
    e.preventDefault();
    profile.mutate();
  };
  const onPassword = (e: FormEvent) => {
    e.preventDefault();
    password.mutate();
  };

  return (
    <PageFrame title="Settings">
      <Panel title="Profile">
        <form onSubmit={onProfile} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display name</Label>
              <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Units</Label>
              <Select value={units} onValueChange={(v) => setUnits(v as UnitSystem)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">Metric (g, kg, ml)</SelectItem>
                  <SelectItem value="us">US (cups, oz, lb)</SelectItem>
                  <SelectItem value="original">As written in the recipe</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">How amounts, temperatures and sizes are shown by default. Each recipe page can switch for a single view.</p>
            </div>
          </div>
          <Button type="submit" size="sm" disabled={profile.isPending}>
            Save
          </Button>
        </form>
      </Panel>

      <Panel title="Password">
        <form onSubmit={onPassword} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="current">Current password</Label>
            <Input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div>
            <Button type="submit" size="sm" disabled={password.isPending}>
              Change password
            </Button>
          </div>
        </form>
      </Panel>
    </PageFrame>
  );
}
