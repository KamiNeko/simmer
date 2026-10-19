"""Parse a free-text ingredient line such as "1 1/2 cups flour, sifted" into fields."""

import re
from dataclasses import dataclass

from .units import multiword_aliases, normalize_unit

_UNICODE_FRACTIONS = {
    "½": 0.5,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "¼": 0.25,
    "¾": 0.75,
    "⅕": 0.2,
    "⅖": 0.4,
    "⅗": 0.6,
    "⅘": 0.8,
    "⅙": 1 / 6,
    "⅚": 5 / 6,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
}

_NUMBER = r"(?:\d*\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+(?:[.,]\d+)?(?:\s+\d+/\d+)?|\d+/\d+)"
_QUANTITY_RE = re.compile(
    # Ranges are written with hyphens, en dashes or "to".
    rf"^\s*(?P<q1>{_NUMBER})(?:\s*(?:-|–|to)\s*(?P<q2>{_NUMBER}))?\s*",  # noqa: RUF001
    re.UNICODE,
)


@dataclass
class ParsedIngredient:
    quantity: float | None
    quantity_max: float | None
    unit: str | None
    name: str
    note: str
    original_text: str


def parse_number(text: str) -> float:
    """A number from text such as "1 1/2", "½" or "0,5"."""
    text = text.strip().replace(",", ".")
    total = 0.0
    for part in text.split():
        if part[-1] in _UNICODE_FRACTIONS:
            whole = part[:-1]
            total += (float(whole) if whole else 0.0) + _UNICODE_FRACTIONS[part[-1]]
        elif "/" in part:
            num, den = part.split("/", 1)
            total += float(num) / float(den)
        else:
            total += float(part)
    return total


def parse_ingredient(line: str) -> ParsedIngredient:
    """Split an ingredient line into quantity, unit, name and note."""
    original = line.strip()
    rest = re.sub(r"^[-*•\s]+", "", original)
    # Separate a glued unicode fraction ("1½") so the number regex sees it.
    rest = re.sub(r"(\d)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])", r"\1 \2", rest)

    quantity = quantity_max = None
    match = _QUANTITY_RE.match(rest)
    if match:
        quantity = parse_number(match.group("q1"))
        if match.group("q2"):
            quantity_max = parse_number(match.group("q2"))
        rest = rest[match.end() :]

    unit = None
    lowered = rest.lower()
    for alias, code in multiword_aliases():
        if lowered.startswith(alias + " "):
            unit = code
            rest = rest[len(alias) :].lstrip()
            break
    if unit is None:
        word_match = re.match(r"^([A-Za-z]+\.?)(?:\s+|$)", rest)
        if word_match:
            candidate = normalize_unit(word_match.group(1))
            # Single-letter units only count right after a number ("2 t salt").
            if candidate and (len(word_match.group(1).rstrip(".")) > 1 or quantity is not None):
                unit = candidate
                rest = rest[word_match.end() :]

    rest = re.sub(r"^of\s+", "", rest.strip())
    name, note = rest, ""
    paren = re.search(r"\s*\(([^)]*)\)\s*$", name)
    if paren:
        note = paren.group(1).strip()
        name = name[: paren.start()]
    if "," in name:
        name, extra = name.split(",", 1)
        note = ", ".join(n for n in (extra.strip(), note) if n)

    return ParsedIngredient(
        quantity=quantity,
        quantity_max=quantity_max,
        unit=unit,
        name=name.strip(),
        note=note.strip(),
        original_text=original,
    )
