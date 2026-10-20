/**
 * The language a reader wants recipes in. Recipes are stored in English; other languages
 * show the stored translation when there is one. A shared link can carry ?lang=de, which is
 * remembered on that device so the reader keeps browsing in German.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "./api";
import { BASE_LANGUAGE, isLanguage, type LanguageCode } from "./languages";

const KEY = "simmer-language";
const listeners = new Set<() => void>();

function stored(): LanguageCode {
  try {
    const value = localStorage.getItem(KEY);
    return isLanguage(value) ? value : BASE_LANGUAGE;
  } catch {
    return BASE_LANGUAGE;
  }
}

let current: LanguageCode = stored();

export function setReadingLanguage(language: LanguageCode) {
  if (language === current) return;
  current = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {
    /* private mode */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The languages recipes are shared in, English first. */
export function useLanguages() {
  const query = useQuery({ queryKey: ["languages"], queryFn: api.languages, staleTime: 5 * 60_000 });
  return query.data ? [query.data.base, ...query.data.translations] : null;
}

/** The language to show recipes in: the link's ?lang, else the reader's last choice. */
export function useReadingLanguage(): LanguageCode {
  const [params] = useSearchParams();
  const chosen = useSyncExternalStore(subscribe, () => current);
  const fromLink = params.get("lang");
  const linked = isLanguage(fromLink) ? fromLink : null;
  useEffect(() => {
    if (linked) setReadingLanguage(linked);
  }, [linked]);
  const languages = useLanguages();
  const language = linked ?? chosen;
  // A language the admin no longer shares in falls back to English once the list is known.
  return languages && !languages.includes(language) ? BASE_LANGUAGE : language;
}
