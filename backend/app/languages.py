"""Languages an imported recipe can be translated into."""

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
}

assert set(NAMES) == set(get_args(LanguageCode))
