# AI import

Simmer can turn a link, pasted text or photos of a recipe into a draft in the editor. An AI provider sorts the ingredients into groups (main, marinade, sauce, ...), splits each line into amount, unit, name and note, and fills in densities so cups can become grams. You review the draft, with each ingredient's source line beside it, and nothing is saved until you press Save.

**Tidy up** in the editor uses the same providers to split typed ingredient lines into fields and suggest groups.

## Setting up a provider

Only admins can do this.

1. Get an API key from the provider:
   - Anthropic: https://platform.claude.com/settings/keys
   - OpenAI: https://platform.openai.com/api-keys
   - Google Gemini: https://aistudio.google.com/apikey
2. In Simmer, open **AI providers** in the admin section of the sidebar.
3. Paste the key, check the model name and save. The defaults are `claude-opus-5-5`, `gpt-5` and `gemini-2.5-flash`. Any model of that provider that supports images and structured JSON output should work.
4. Press **Test connection**. It sends a tiny request and shows the provider's error if the key or model is wrong.
5. If you set up more than one, pick the default. Members can switch provider on the import screen, and re-import a draft with another provider when a result looks wrong.

The Simmer server talks to the provider directly, so it needs outbound HTTPS to the provider's API. Each request may take up to 180 seconds. See the [reverse proxy notes](self-hosting.md#reverse-proxy) for the proxy timeout this needs.

## Recipes are kept in English

Simmer keeps every recipe in English. When an AI import finds a recipe written in another language, it translates it into English: title, description, group names, ingredient names and notes, steps and tags. Amounts and units stay as they are, and each ingredient's source line in the editor keeps the original wording, so you can check the translation before saving. The recipe page then says which language the recipe was originally in.

Imports without AI can't translate. When the page says it is in another language, the draft warns that the recipe stays as written.

## Translations for sharing

To share recipes with people who read another language, an admin picks languages under **Translations for sharing** at the bottom of **AI providers**. From then on:

- New recipes are translated into those languages right after they are saved, in the background, by the default provider. **Translate now** on the same page translates every recipe that has no up-to-date translation yet.
- Readers, including visitors without an account, switch the language with the language button at the top of the page. The recipe list, search, recipe pages and the cooking view then show the translation. Search finds recipes by their translated words, too.
- **Share** on a recipe page copies a link in the language you pick, such as `/recipes/gochujang-chicken?lang=de`. Whoever opens it reads in that language and keeps it while they browse. Over plain http browsers don't allow copying, so Simmer shows the link to copy by hand.
- Ingredient amounts come from the English recipe and show in the reader's units (metric unless they choose otherwise), with unit names in German ("2 EL", "1 Zehe") and a decimal comma. Measurements written inside the steps, like "350°F" or "1 cup", are converted to metric by the translation.
- When you edit a recipe, **Update the ... translation after saving** is ticked. Untick it for a small fix: the translation stays and is marked as made from an older version. **Translate again** on the recipe page brings it up to date. A translation that no longer lines up with the recipe, because steps or ingredients were added or removed, falls back to English until it is translated again.
- A recipe without a translation in the reader's language shows in English, with a **Translate now** button for signed-in users.

Tags are not translated. Translations are stored with the recipe, so each one is made once, and they are part of the recipe export.

## Without a provider

Links still work: Simmer reads the recipe data most recipe sites embed (schema.org JSON-LD, plus ingredient headings from the WP Recipe Maker and Tasty Recipes plugins) and builds the draft itself, without grouping fixes or densities. Pasted text, photos and Tidy up need a provider. For a link, the import screen also offers **Without AI (page data only)** even when a provider is set up.

## What leaves your server

Simmer sends only what the import needs, to the one provider chosen for that import. When languages are chosen under **Translations for sharing**, the text of new and edited recipes also goes to the default provider to be translated. Nothing is sent to a provider when you view recipes, and nothing is sent anywhere when no provider is used.

| Action | Sent to the provider |
| --- | --- |
| Import a link | The recipe from the page. When the page has recipe data, that is its title, description, yield, times, cuisine, category, keywords, ingredients and steps. Otherwise it is the page title and the readable text of the page's main content, at most 40,000 characters. The link itself is not sent. |
| Import pasted text | The text exactly as pasted. |
| Import photos | Each photo, re-encoded by Simmer as a JPEG of at most 2000 pixels on the long side. Camera metadata such as location is not included. Up to 6 photos per import. |
| Tidy up | The recipe in the editor as JSON: title, description, servings, times, tags, ingredient groups and steps. The source link is left out. The title and description you typed are kept as they are. |
| Translate a recipe | The English recipe's title, description, group names, ingredient names and notes, step sections and steps as JSON. Amounts, units, tags, the source link and photos are left out. |
| Test connection | A fixed health-check prompt. No recipe data. |

Every request also carries Simmer's instructions and the JSON format the answer must follow. If the answer is not a valid recipe, or a translation doesn't have the recipe's groups, ingredients and steps, Simmer asks once more, with the error, so one import or translation can make two requests.

Link imports are fetched by your Simmer server, not by the provider. Simmer only fetches public addresses, so imports can't reach services on your home network. The recipe's photo is downloaded by your server when you save, and is never sent to the provider.

Each provider's own terms decide how it handles what it receives.

## Where the API keys are stored

- Keys are stored in the database (`llm_providers` table), encrypted with Fernet (AES with an HMAC). The encryption key is derived from `SIMMER_SECRET_KEY`, or from `data/secret.key`, which Simmer generates with mode 600 on first use when the variable is unset.
- Only the last 4 characters are stored in plain text, to show which key is in use.
- Keys never reach the browser. The API only returns the provider, model, default flag and those last 4 characters. To change a key, enter a new one.
- Keys are decrypted only on the server, right before a request to the provider.
- The full backup includes `secret.key`, so a restored backup can still read the keys. Keep backups private for that reason. If the secret is lost or changed, Simmer reports that the stored key can't be decrypted, and you enter the keys again.
