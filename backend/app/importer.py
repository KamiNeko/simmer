"""Fetch recipe pages and read the structured recipe data most recipe sites embed."""

import html
import ipaddress
import json
import re
import socket
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin
from urllib.request import getproxies

import httpx
from bs4 import BeautifulSoup, Tag

from .ingredient_parser import parse_ingredient
from .schemas import GroupIn, IngredientIn, RecipeIn, StepIn

MAX_PAGE_BYTES = 5 * 1024 * 1024
MAX_TEXT_CHARS = 40_000
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0 Safari/537.36 Simmer/1.0"
)


class FetchError(Exception):
    pass


# Fetching


def _check_public(url: httpx.URL) -> None:
    """Refuse addresses on the home network, so imports can't probe local services."""
    if url.scheme not in ("http", "https"):
        raise FetchError("Only http and https links can be imported")
    host = url.host
    try:
        infos = socket.getaddrinfo(host, url.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        # Behind an HTTP proxy only the proxy resolves names; it decides what is reachable.
        if getproxies().get(url.scheme):
            return
        raise FetchError(f"Couldn't find the site {host}") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise FetchError("Links to local or private addresses can't be imported")


def fetch(url: str, max_bytes: int = MAX_PAGE_BYTES) -> tuple[bytes, str, str]:
    """Download a public URL and return (body, final URL, content type)."""

    def on_request(request: httpx.Request) -> None:
        _check_public(request.url)

    try:
        with (
            httpx.Client(
                follow_redirects=True,
                max_redirects=5,
                timeout=20,
                headers={"User-Agent": USER_AGENT, "Accept-Language": "en,de;q=0.8"},
                event_hooks={"request": [on_request]},
            ) as client,
            client.stream("GET", url) as response,
        ):
            if response.status_code >= 400:
                raise FetchError(f"The site answered with error {response.status_code}")
            chunks: list[bytes] = []
            size = 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    raise FetchError("The page is too large to import")
                chunks.append(chunk)
            content_type = response.headers.get("content-type", "")
            return b"".join(chunks), str(response.url), content_type
    except httpx.InvalidURL as exc:
        raise FetchError("That doesn't look like a valid link") from exc
    except httpx.HTTPError as exc:
        raise FetchError(f"Couldn't load the page: {exc}") from exc


# Page parsing


@dataclass
class PageData:
    url: str
    jsonld: dict[str, Any] | None = None
    # Ingredient headings from recipe plugins, when the page shows them.
    ingredient_groups: list[tuple[str, list[str]]] = field(default_factory=list)
    text: str = ""
    image_url: str | None = None
    title: str = ""


def _is_recipe(node: dict[str, Any]) -> bool:
    kind = node.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    return any(isinstance(k, str) and k.lower() == "recipe" for k in kinds)


def _find_recipe(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        for item in data:
            if found := _find_recipe(item):
                return found
    elif isinstance(data, dict):
        if _is_recipe(data):
            return data
        for key in ("@graph", "mainEntity", "mainEntityOfPage"):
            if key in data and (found := _find_recipe(data[key])):
                return found
    return None


def find_jsonld_recipe(soup: BeautifulSoup) -> dict[str, Any] | None:
    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text()
        if not raw:
            continue
        try:
            data = json.loads(raw, strict=False)
        except json.JSONDecodeError:
            continue
        if found := _find_recipe(data):
            return found
    return None


def _clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    text = BeautifulSoup(html.unescape(value), "html.parser").get_text(" ")
    return " ".join(text.split())


def find_ingredient_groups(soup: BeautifulSoup) -> list[tuple[str, list[str]]]:
    """Ingredient headings from WP Recipe Maker and Tasty Recipes, the common plugins."""
    groups: list[tuple[str, list[str]]] = []
    for group in soup.select(".wprm-recipe-ingredient-group"):
        heading = group.select_one(".wprm-recipe-group-name")
        lines = [
            " ".join(li.get_text(" ").split()) for li in group.select("li.wprm-recipe-ingredient")
        ]
        if lines:
            groups.append((heading.get_text(" ").strip() if heading else "", lines))
    if groups:
        return groups

    container = soup.select_one(".tasty-recipes-ingredients, .tasty-recipes-ingredients-body")
    if container:
        heading = ""
        for element in container.find_all(["h3", "h4", "p", "li"]):
            if element.name == "li":
                line = " ".join(element.get_text(" ").split())
                if not groups or groups[-1][0] != heading:
                    groups.append((heading, []))
                groups[-1][1].append(line)
            elif element.name in ("h3", "h4") or element.find("strong"):
                heading = " ".join(element.get_text(" ").split()).rstrip(":")
    return groups if any(name for name, _ in groups) else []


def _image_url(recipe: dict[str, Any] | None, soup: BeautifulSoup, base: str) -> str | None:
    image: Any = recipe.get("image") if recipe else None
    if isinstance(image, list):
        image = image[0] if image else None
    if isinstance(image, dict):
        image = image.get("url") or image.get("contentUrl")
    if not isinstance(image, str) or not image:
        meta = soup.find("meta", property="og:image")
        image = meta.get("content") if isinstance(meta, Tag) else None
    if isinstance(image, str) and image:
        return urljoin(base, image)
    return None


def page_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()
    root = soup.find("article") or soup.find("main") or soup.body or soup
    lines = [" ".join(line.split()) for line in root.get_text("\n").splitlines()]
    text = "\n".join(line for line in lines if line)
    return text[:MAX_TEXT_CHARS]


def parse_page(body: bytes, url: str) -> PageData:
    soup = BeautifulSoup(body, "html.parser")
    recipe = find_jsonld_recipe(soup)
    title_tag = soup.find("title")
    data = PageData(
        url=url,
        jsonld=recipe,
        ingredient_groups=find_ingredient_groups(soup),
        image_url=_image_url(recipe, soup, url),
        title=title_tag.get_text().strip() if title_tag else "",
    )
    data.text = page_text(soup)
    return data


# Schema.org values


def parse_duration(value: Any) -> int | None:
    """ISO 8601 durations like PT1H30M to minutes."""
    if not isinstance(value, str):
        return None
    match = re.fullmatch(
        r"P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+)S)?)?",
        value.strip().upper(),
    )
    if not match or not any(match.groups()):
        return None
    days, hours, minutes, seconds = (float(g) if g else 0.0 for g in match.groups())
    total = round(days * 1440 + hours * 60 + minutes + seconds / 60)
    return total or None


def parse_servings(value: Any) -> float | None:
    values = value if isinstance(value, list) else [value]
    for item in values:
        if isinstance(item, int | float) and item > 0:
            return float(item)
        if isinstance(item, str) and (match := re.search(r"\d+(?:[.,]\d+)?", item)):
            number = float(match.group().replace(",", "."))
            if number > 0:
                return number
    return None


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _tags(recipe: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    for key in ("recipeCuisine", "recipeCategory"):
        for item in _as_list(recipe.get(key)):
            if isinstance(item, str):
                tags.extend(part.strip() for part in item.split(","))
    keywords = recipe.get("keywords")
    if isinstance(keywords, str):
        tags.extend(part.strip() for part in keywords.split(","))
    elif isinstance(keywords, list):
        tags.extend(k.strip() for k in keywords if isinstance(k, str))
    cleaned = [t[:1].upper() + t[1:] for t in tags if t and len(t) <= 40]
    return list(dict.fromkeys(cleaned))[:8]


def _steps(value: Any, section: str = "") -> list[StepIn]:
    steps: list[StepIn] = []
    if isinstance(value, str):
        parts = (_clean_text(part) for part in re.split(r"\n+|<br\s*/?>", value))
        return [StepIn(section=section, text=part) for part in parts if part]
    for item in _as_list(value):
        if isinstance(item, str):
            steps.extend(_steps(item, section))
        elif isinstance(item, dict):
            kind = item.get("@type")
            if kind == "HowToSection" or "itemListElement" in item:
                name = _clean_text(item.get("name")) or section
                steps.extend(_steps(item.get("itemListElement"), name))
            else:
                text = _clean_text(item.get("text") or item.get("name"))
                if text:
                    steps.append(StepIn(section=section, text=text))
    return steps


def _ingredient(line: str) -> IngredientIn:
    parsed = parse_ingredient(line)
    return IngredientIn(
        quantity=parsed.quantity,
        quantity_max=parsed.quantity_max,
        unit=parsed.unit,
        name=(parsed.name or line)[:200],
        note=parsed.note[:300],
        original_text=line[:500],
    )


def draft_from_page(page: PageData) -> RecipeIn | None:
    """A recipe straight from the page data, without AI help."""
    recipe = page.jsonld
    if not recipe:
        return None
    if page.ingredient_groups:
        groups = [
            GroupIn(name=name, ingredients=[_ingredient(line) for line in lines if line])
            for name, lines in page.ingredient_groups
        ]
    else:
        lines = [_clean_text(i) for i in _as_list(recipe.get("recipeIngredient"))]
        groups = [GroupIn(name="", ingredients=[_ingredient(line) for line in lines if line])]
    return RecipeIn(
        title=(_clean_text(recipe.get("name")) or page.title or "Imported recipe")[:200],
        description=_clean_text(recipe.get("description")),
        source_url=page.url,
        servings=parse_servings(recipe.get("recipeYield")),
        prep_minutes=parse_duration(recipe.get("prepTime")),
        cook_minutes=parse_duration(recipe.get("cookTime")),
        total_minutes=parse_duration(recipe.get("totalTime")),
        tags=_tags(recipe),
        groups=[g for g in groups if g.ingredients],
        steps=_steps(recipe.get("recipeInstructions")),
    )


def llm_source(page: PageData) -> str:
    """The text the AI receives: the page's recipe data when present, else the page text."""
    draft = draft_from_page(page)
    if draft is None:
        return f"Page title: {page.title}\n\n{page.text}"
    lines = [f"Title: {draft.title}"]
    if draft.description:
        lines.append(f"Description: {draft.description}")
    recipe = page.jsonld or {}
    for label, key in (
        ("Yield", "recipeYield"),
        ("Prep time", "prepTime"),
        ("Cook time", "cookTime"),
        ("Total time", "totalTime"),
        ("Cuisine", "recipeCuisine"),
        ("Category", "recipeCategory"),
        ("Keywords", "keywords"),
    ):
        if value := recipe.get(key):
            lines.append(f"{label}: {json.dumps(value, ensure_ascii=False)}")
    lines.append("\nIngredients:")
    if page.ingredient_groups:
        for name, items in page.ingredient_groups:
            if name:
                lines.append(f"\n{name}:")
            lines.extend(f"- {item}" for item in items)
    else:
        lines.extend(f"- {_clean_text(item)}" for item in _as_list(recipe.get("recipeIngredient")))
    lines.append("\nInstructions:")
    section = None
    for number, step in enumerate(draft.steps, 1):
        if step.section and step.section != section:
            lines.append(f"\n{step.section}:")
            section = step.section
        lines.append(f"{number}. {step.text}")
    return "\n".join(lines)
