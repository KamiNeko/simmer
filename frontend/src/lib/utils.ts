import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeDate(iso: string): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  if (days === 0) return "today";
  if (days > -7) return rtf.format(days, "day");
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatMinutes(minutes: number | null | undefined): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
