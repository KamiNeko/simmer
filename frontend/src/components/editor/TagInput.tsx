import { X } from "lucide-react";
import { useState } from "react";

export function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (tags: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, "");
    if (tag && !value.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...value, tag]);
    setText("");
  };
  return (
    <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-[3px]">
      {value.map((tag) => (
        <span key={tag} className="bg-secondary flex items-center gap-1 rounded px-2 py-0.5 text-xs">
          {tag}
          <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove ${tag}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        list="simmer-tags"
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
        placeholder={value.length ? "" : "Add tags, e.g. Korean, Meal prep"}
        className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
      />
      <datalist id="simmer-tags">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
