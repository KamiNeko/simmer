"""Canonical unit codes and their spellings in recipe text."""

UNIT_ALIASES: dict[str, list[str]] = {
    "g": ["g", "gram", "grams", "gr"],
    "kg": ["kg", "kilogram", "kilograms", "kilo", "kilos"],
    "mg": ["mg", "milligram", "milligrams"],
    "ml": ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
    "l": ["l", "liter", "liters", "litre", "litres"],
    "oz": ["oz", "ounce", "ounces"],
    "lb": ["lb", "lbs", "pound", "pounds"],
    "cup": ["cup", "cups", "c"],
    "tbsp": ["tbsp", "tbs", "tbl", "tablespoon", "tablespoons", "T", "EL"],
    "tsp": ["tsp", "teaspoon", "teaspoons", "t", "TL"],
    "fl_oz": ["fl oz", "fl. oz", "fl. oz.", "fluid ounce", "fluid ounces"],
    "pint": ["pint", "pints", "pt"],
    "quart": ["quart", "quarts", "qt"],
    "pinch": ["pinch", "pinches"],
    "clove": ["clove", "cloves"],
    "can": ["can", "cans"],
    "piece": ["piece", "pieces", "pc", "pcs"],
    "slice": ["slice", "slices"],
    "bunch": ["bunch", "bunches"],
    "stalk": ["stalk", "stalks"],
    "handful": ["handful", "handfuls"],
}

UNIT_LABELS: dict[str, str] = {"fl_oz": "fl oz"}


def _build_lookup() -> dict[str, str]:
    lookup: dict[str, str] = {}
    for code, aliases in UNIT_ALIASES.items():
        for alias in aliases:
            # Single-letter "T"/"t" are case sensitive (tablespoon vs teaspoon).
            key = alias if alias in ("T", "t") else alias.lower()
            lookup[key] = code
    return lookup


_LOOKUP = _build_lookup()


def normalize_unit(word: str) -> str | None:
    """Return the canonical unit code for a spelling, or None if it is not a unit."""
    cleaned = word.strip().rstrip(".")
    if cleaned in ("T", "t"):
        return _LOOKUP[cleaned]
    return _LOOKUP.get(cleaned.lower())


def multiword_aliases() -> list[tuple[str, str]]:
    """Aliases containing spaces, longest first, for matching before single words."""
    pairs = [
        (alias.lower(), code)
        for code, aliases in UNIT_ALIASES.items()
        for alias in aliases
        if " " in alias
    ]
    return sorted(pairs, key=lambda p: -len(p[0]))
