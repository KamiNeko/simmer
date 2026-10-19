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
        ("1/2 cup flour", 0.5, None, "cup", "flour", ""),
        ("3/4 tsp salt", 0.75, None, "tsp", "salt", ""),
        ("1 1/2 cups", 1.5, None, "cup", "", ""),
        ("1½ cups", 1.5, None, "cup", "", ""),
        ("1/2-3/4 cup milk", 0.5, 0.75, "cup", "milk", ""),
        # A zero denominator is no quantity, and the text is kept as written.
        ("1 1/0 cup water", None, None, None, "1 1/0 cup water", ""),
        ("2 0/0 eggs", None, None, None, "2 0/0 eggs", ""),
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


def test_parse_endpoint_survives_zero_denominator(admin):
    response = admin.post(
        "/api/parse-ingredients", json={"lines": ["1 1/0 cup water", "1/2 cup flour"]}
    )
    assert response.status_code == 200
    first, second = response.json()
    assert first["quantity"] is None
    assert (second["quantity"], second["unit"], second["name"]) == (0.5, "cup", "flour")
