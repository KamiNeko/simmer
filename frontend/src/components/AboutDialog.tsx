import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";

const REPO = "https://github.com/KamiNeko/simmer";

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const info = useQuery({ queryKey: ["version"], queryFn: api.version, enabled: open, staleTime: Infinity });
  const commit = info.data?.commit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>About Simmer</DialogTitle>
          <DialogDescription>A self-hosted recipe manager for your household.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono">{info.data?.version ?? (info.isError ? "Unknown" : "…")}</dd>
          <dt className="text-muted-foreground">Commit</dt>
          <dd className="font-mono">
            {commit ? (
              <a href={`${REPO}/commit/${commit}`} target="_blank" rel="noreferrer" className="hover:underline">
                {commit.slice(0, 7)}
              </a>
            ) : info.data ? (
              "Built from source"
            ) : (
              "…"
            )}
          </dd>
        </dl>
        <p className="text-muted-foreground text-xs">Please include the version when you report a bug.</p>
        <nav className="text-primary flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:underline">
            GitHub
          </a>
          <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" className="hover:underline">
            Changelog
          </a>
          <a href={`${REPO}/issues/new`} target="_blank" rel="noreferrer" className="hover:underline">
            Report an issue
          </a>
        </nav>
      </DialogContent>
    </Dialog>
  );
}
