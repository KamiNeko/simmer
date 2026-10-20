// Fills an empty Simmer with a demo household and takes the README screenshots.
//
//   SIMMER_DATA_DIR=$(mktemp -d) SIMMER_STATIC_DIR=../frontend/dist uvicorn app.main:app --port 8080
//   npm run screenshots                       # writes ../docs/images/*.png
//
// Never point it at a Simmer with real data: it only runs against one that still shows setup.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { dishSvg } from "./dishes.mjs";
import { RECIPES } from "./demo-recipes.mjs";

const BASE = process.env.SIMMER_URL ?? "http://localhost:8080";
const OUT = path.resolve(import.meta.dirname, "../../docs/images");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const admin = await browser.newContext({ baseURL: BASE });
const api = admin.request;

async function call(method, url, data) {
  const response = await api.fetch(url, { method, data });
  if (!response.ok()) throw new Error(`${method} ${url}: ${response.status()} ${await response.text()}`);
  return response.status() === 204 ? null : response.json();
}

const state = await call("GET", "/api/auth/me");
if (!state.needs_setup) {
  console.error(`${BASE} already has accounts. Run this against an empty Simmer only.`);
  process.exit(1);
}

// People and recipes
await call("POST", "/api/auth/setup", { username: "alex", display_name: "Alexander", password: "demo-password" });
await call("POST", "/api/users", { username: "sam", display_name: "Sam", password: "demo-password", role: "member" });
const painter = await browser.newPage({ viewport: { width: 1200, height: 792 } });
for (const { dish, ...recipe } of RECIPES) {
  const { slug } = await call("POST", "/api/recipes", recipe);
  await painter.setContent(`<body style="margin:0">${dishSvg(dish)}</body>`);
  const photo = await painter.screenshot({ type: "jpeg", quality: 88 });
  const response = await api.put(`/api/recipes/${slug}/photo`, { multipart: { file: { name: `${slug}.jpg`, mimeType: "image/jpeg", buffer: photo } } });
  if (!response.ok()) throw new Error(`photo for ${slug}: ${response.status()}`);
}

// A lived-in journal and shopping list
const stars = { "gochujang-chicken-meal-prep": 5, shakshuka: 5, "kimchi-fried-rice": 4, "mushroom-risotto": 4, "classic-banana-bread": 5, "thai-green-curry": 4 };
for (const [slug, value] of Object.entries(stars)) await call("PUT", `/api/recipes/${slug}/rating`, { stars: value });
for (const slug of ["gochujang-chicken-meal-prep", "gochujang-chicken-meal-prep", "shakshuka", "kimchi-fried-rice"])
  await call("POST", `/api/recipes/${slug}/cooked`, {});
await call("POST", "/api/recipes/gochujang-chicken-meal-prep/cooked", { note: "Half the honey next time, it was a bit too sweet." });
const done = await call("POST", "/api/recipes/gochujang-chicken-meal-prep/comments", { text: "Try with tofu for Sam." });
await call("PATCH", `/api/comments/${done.id}`, { done: true });

await call("PUT", "/api/shopping/recipes/gochujang-chicken-meal-prep", { servings: 4 });
await call("PUT", "/api/shopping/recipes/shakshuka", { servings: 2 });
await call("PUT", "/api/shopping/recipes/thai-green-curry", { servings: 4 });
for (const text of ["Oat milk", "Kitchen paper"]) await call("POST", "/api/shopping/extras", { text });
for (const key of ["garlic|clove", "olive oil|ml"]) await call("PUT", "/api/shopping/checked", { key, checked: true });
// A provider so the import screen shows its options; the key is never used.
await call("PUT", "/api/admin/ai/providers/anthropic", { api_key: "demo-key-not-real", model: "claude-sonnet-5-5", is_default: true });

// Screenshots
const cookie = (await admin.storageState()).cookies;
async function shot(name, url, { dark = true, phone = false, before } = {}) {
  const context = await browser.newContext({
    baseURL: BASE,
    colorScheme: dark ? "dark" : "light",
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: phone,
    hasTouch: phone,
  });
  await context.addCookies(cookie);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`${name}: ${e.message}`));
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  if (before) await before(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`docs/images/${name}.png`);
  await context.close();
}

const scrollTo = (text) => async (page) => {
  await page.getByRole("heading", { name: text }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
};

await shot("recipe-dark", "/recipes/gochujang-chicken-meal-prep");
await shot("recipe-ingredients", "/recipes/gochujang-chicken-meal-prep", { before: scrollTo("Ingredients") });
await shot("recipe-light", "/recipes/classic-banana-bread", { dark: false, before: scrollTo("Ingredients") });
await shot("cooking", "/recipes/gochujang-chicken-meal-prep/cook", {
  before: async (page) => {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
  },
});
await shot("shopping-list", "/shopping");
await shot("import", "/import", { dark: false });
await shot("mobile-recipe", "/recipes/shakshuka", { phone: true });
await shot("mobile-cooking", "/recipes/shakshuka/cook", { phone: true });

await browser.close();
