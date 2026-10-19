import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

import { SortableItem, SortableList } from "./Sortable";
import { emptyRow, type GroupDraft, type IngredientRow, rowFromIngredient } from "./types";

const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "oz", "lb", "fl_oz", "pinch", "clove", "can", "piece", "slice", "bunch"];

function PasteDialog({ open, onOpenChange, onRows }: { open: boolean; onOpenChange: (o: boolean) => void; onRows: (rows: IngredientRow[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (!lines.length) return;
    setBusy(true);
    try {
      const parsed = await api.parseIngredients(lines);
      onRows(parsed.map(rowFromIngredient));
      setText("");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paste ingredients</DialogTitle>
          <DialogDescription>One ingredient per line, for example “2 tbsp gochujang” or “1 ½ lb chicken thighs, diced”.</DialogDescription>
        </DialogHeader>
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-sm" autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !text.trim()}>
            Add ingredients
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GroupEditor({
  group,
  onChange,
  onRemove,
  onMove,
  isFirst,
  isLast,
  showSource = false,
}: {
  group: GroupDraft;
  onChange: (group: GroupDraft) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
  /** Show each ingredient's source line, for checking an import. */
  showSource?: boolean;
}) {
  const [pasting, setPasting] = useState(false);
  const setRows = (rows: IngredientRow[]) => onChange({ ...group, rows });
  const updateRow = (key: string, patch: Partial<IngredientRow>) =>
    setRows(group.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="bg-card space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Input
          value={group.name}
          onChange={(e) => onChange({ ...group, name: e.target.value })}
          placeholder="Group name, e.g. Marinade (leave empty for main ingredients)"
          className="font-semibold"
        />
        <Button type="button" variant="ghost" size="icon-sm" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move group up">
          <ArrowUp />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={isLast} onClick={() => onMove(1)} aria-label="Move group down">
          <ArrowDown />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove group">
          <Trash2 />
        </Button>
      </div>

      <div className="text-muted-foreground hidden grid-cols-[5rem_5.5rem_1fr_10rem_2rem] gap-2 pl-6 text-[11px] font-medium tracking-wide uppercase sm:grid">
        <span>Amount</span>
        <span>Unit</span>
        <span>Ingredient</span>
        <span>Note</span>
      </div>
      <SortableList items={group.rows} onChange={setRows}>
        <div className="space-y-4 sm:space-y-2">
          {group.rows.map((row) => (
            <SortableItem key={row.key} id={row.key}>
              {/* Phones: amount and unit share the first line, then the name and note get a line each. */}
              <div className="grid grid-cols-[5rem_5.5rem_1fr_2rem] gap-2 sm:grid-cols-[5rem_5.5rem_1fr_10rem_2rem]">
                <Input value={row.qty} onChange={(e) => updateRow(row.key, { qty: e.target.value })} placeholder="1 ½" aria-label="Amount" />
                <Input value={row.unit} onChange={(e) => updateRow(row.key, { unit: e.target.value })} placeholder="unit" list="simmer-units" aria-label="Unit" />
                <Input
                  value={row.name}
                  onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  placeholder="Ingredient"
                  aria-label="Ingredient"
                  className="col-span-3 col-start-1 row-start-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto"
                />
                <Input
                  value={row.note}
                  onChange={(e) => updateRow(row.key, { note: e.target.value })}
                  placeholder="Note"
                  aria-label="Note"
                  className="col-span-3 col-start-1 row-start-3 sm:col-span-1 sm:col-start-auto sm:row-start-auto"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="col-start-4 row-start-1 mt-0.5 sm:col-start-auto sm:row-start-auto"
                  onClick={() => setRows(group.rows.filter((r) => r.key !== row.key))}
                  aria-label="Remove ingredient"
                >
                  <X />
                </Button>
                {showSource && row.original_text && (
                  <p className="text-muted-foreground col-span-full truncate pl-1 font-mono text-[11px]" title={row.original_text}>
                    <span className="text-primary">source</span> {row.original_text}
                  </p>
                )}
              </div>
            </SortableItem>
          ))}
        </div>
      </SortableList>
      <datalist id="simmer-units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="flex flex-wrap gap-2 pl-6">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows([...group.rows, emptyRow()])}>
          <Plus /> Ingredient
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPasting(true)}>
          <ClipboardPaste /> Paste lines
        </Button>
      </div>
      <PasteDialog
        open={pasting}
        onOpenChange={setPasting}
        onRows={(rows) => setRows([...group.rows.filter((r) => r.name.trim() || r.qty.trim()), ...rows])}
      />
    </div>
  );
}
