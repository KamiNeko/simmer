import * as React from "react";

import { cn } from "@/lib/utils";

/** A native checkbox drawn as a rounded box with a tick, in the primary colour when checked. */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "border-input checked:bg-primary checked:border-primary grid size-4.5 shrink-0 cursor-pointer appearance-none place-content-center rounded border-[1.5px] transition-colors outline-none",
        "before:hidden before:h-2.5 before:w-1.5 before:translate-y-[-1px] before:rotate-45 before:border-r-2 before:border-b-2 before:border-white before:content-[''] checked:before:block",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
