/** Languages recipes are detected in on import and can be translated into, matching the server's list. */
export const LANGUAGES = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  nb: "Norwegian",
  fi: "Finnish",
  cs: "Czech",
  tr: "Turkish",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  uk: "Ukrainian",
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

/** The language recipes are stored in; everything else is a translation of it. */
export const BASE_LANGUAGE: LanguageCode = "en";

/** Each language's name in itself, for the switch readers pick their language with. */
export const NATIVE_NAMES: Record<LanguageCode, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  nl: "Nederlands",
  pt: "Português",
  pl: "Polski",
  sv: "Svenska",
  da: "Dansk",
  nb: "Norsk",
  fi: "Suomi",
  cs: "Čeština",
  tr: "Türkçe",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  ru: "Русский",
  uk: "Українська",
};

export const isLanguage = (value: unknown): value is LanguageCode => typeof value === "string" && value in LANGUAGES;
