"""Languages recipes are detected in on import and can be translated into.

Recipes are stored in English; other languages are translations made from it.
"""

from typing import Literal, get_args

LanguageCode = Literal[
    "en",
    "de",
    "fr",
    "es",
    "it",
    "nl",
    "pt",
    "pl",
    "sv",
    "da",
    "nb",
    "fi",
    "cs",
    "tr",
    "ja",
    "ko",
    "zh",
    "ru",
    "uk",
]

NAMES: dict[str, str] = {
    "en": "English",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "it": "Italian",
    "nl": "Dutch",
    "pt": "Portuguese",
    "pl": "Polish",
    "sv": "Swedish",
    "da": "Danish",
    "nb": "Norwegian",
    "fi": "Finnish",
    "cs": "Czech",
    "tr": "Turkish",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ru": "Russian",
    "uk": "Ukrainian",
}

BASE = "en"

assert set(NAMES) == set(get_args(LanguageCode))
