import pytest

from app.ingredient_parser import parse_ingredient


@pytest.mark.parametrize(
    ("line", "quantity", "quantity_max", "unit", "name", "note"),
    [
        ("2 tbsp gochujang", 2, None, "tbsp", "gochujang", ""),
        ("1 1/2 cups all-purpose flour, sifted", 1.5, None, "cup", "all-purpose flour", "sifted"),
        ("½ tsp salt", 0.5, None, "tsp", "salt", ""),
        (
            "1½ lb chicken thighs (boneless, skinless)",
            1.5,
            None,
            "lb",
            "chicken thighs",
            "boneless, skinless",
        ),
        ("2-3 cloves garlic, minced", 2, 3, "clove", "garlic", "minced"),
        ("3 green onions", 3, None, None, "green onions", ""),
        ("Salt to taste", None, None, None, "Salt to taste", ""),
        ("200 g Mehl", 200, None, "g", "Mehl", ""),
        ("1 T sugar", 1, None, "tbsp", "sugar", ""),
        ("1 t sugar", 1, None, "tsp", "sugar", ""),
        ("4 fl oz milk", 4, None, "fl_oz", "milk", ""),
        ("1,5 kg Kartoffeln", 1.5, None, "kg", "Kartoffeln", ""),
        ("1 cup of water", 1, None, "cup", "water", ""),
    ],
)
def test_parse(line, quantity, quantity_max, unit, name, note):
    parsed = parse_ingredient(line)
    assert (
        parsed.quantity == pytest.approx(quantity)
        if quantity is not None
        else parsed.quantity is None
    )
    assert parsed.quantity_max == quantity_max
    assert parsed.unit == unit
    assert parsed.name == name
    assert parsed.note == note
    assert parsed.original_text == line
