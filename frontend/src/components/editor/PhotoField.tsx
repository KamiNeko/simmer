import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export type PhotoChange = { kind: "keep" } | { kind: "replace"; file: File } | { kind: "url"; url: string } | { kind: "remove" };

export function PhotoField({ current, value, onChange }: { current: string | null; value: PhotoChange; onChange: (c: PhotoChange) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (value.kind !== "replace") {
      // oxlint-disable-next-line react/set-state-in-effect -- object URLs are created and revoked with the file
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    // oxlint-disable-next-line react/set-state-in-effect
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const shown = value.kind === "replace" ? preview : value.kind === "url" ? value.url : value.kind === "remove" ? null : current;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="bg-muted text-muted-foreground hover:border-primary/60 flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed"
        aria-label="Choose photo"
      >
        {shown ? <img src={shown} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : <ImagePlus className="size-6" />}
      </button>
      <div className="flex flex-col items-start gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          {shown ? "Replace photo" : "Add photo"}
        </Button>
        {shown && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(current ? { kind: "remove" } : { kind: "keep" })}>
            <Trash2 /> Remove
          </Button>
        )}
        <p className="text-muted-foreground text-xs">
          {value.kind === "url" ? "From the recipe page, saved with the recipe." : "JPEG, PNG or WebP up to 20 MB."}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange({ kind: "replace", file });
          e.target.value = "";
        }}
      />
    </div>
  );
}
