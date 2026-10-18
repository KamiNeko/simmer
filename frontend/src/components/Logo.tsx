import { CookingPot } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="bg-primary/15 text-primary border-primary/30 flex size-8 items-center justify-center rounded-lg border">
        <CookingPot className="size-4.5" />
      </div>
      <span className="text-[15px] font-bold tracking-tight">Simmer</span>
    </div>
  );
}
