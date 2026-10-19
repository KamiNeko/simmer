export type Role = "admin" | "member";
export type UnitSystem = "metric" | "us" | "original";

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  unit_system: UnitSystem;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  needs_setup: boolean;
}

export interface Ingredient {
  id?: number;
  quantity: number | null;
  quantity_max: number | null;
  unit: string | null;
  name: string;
  note: string;
  original_text: string;
  grams_per_ml: number | null;
}

export interface IngredientGroup {
  id?: number;
  name: string;
  ingredients: Ingredient[];
}

export interface Step {
  id?: number;
  section: string;
  text: string;
}

export interface RecipeSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  servings: number | null;
  total_minutes: number | null;
  tags: string[];
  author: { id: number; display_name: string } | null;
  ingredient_preview: string;
  photo_url: string | null;
  thumb_url: string | null;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  avg_rating: number | null;
  rating_count: number;
  cooked_count: number;
  my_rating: number | null;
  my_cooked_count: number;
  my_last_cooked_at: string | null;
}

export interface Recipe extends RecipeSummary {
  source_url: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  groups: IngredientGroup[];
  steps: Step[];
}

export interface RecipeInput {
  title: string;
  description: string;
  source_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  groups: IngredientGroup[];
  steps: Step[];
}

export interface Comment {
  id: number;
  text: string;
  done: boolean;
  created_at: string;
  cook_log_id: number | null;
  cooked_at: string | null;
}

export interface Cook {
  id: number;
  cooked_at: string;
}

export interface Journal {
  rating: number | null;
  cooks: Cook[];
  comments: Comment[];
}

export interface Tag {
  name: string;
  count: number;
}

export type ProviderKind = "anthropic" | "openai" | "google";

export interface AIProvider {
  kind: ProviderKind;
  label: string;
  model: string;
  is_default: boolean;
  configured: boolean;
  key_hint: string;
  default_model: string;
}

export interface ImportRequest {
  /** The page to download, or with html the address that page came from. */
  url?: string;
  text?: string;
  /** A page the browser already loaded. */
  html?: string;
  photos?: File[];
  /** A provider kind, "none" to skip AI, or undefined for the default. */
  provider?: string;
}

export interface ImportResult {
  recipe: RecipeInput;
  image_url: string | null;
  provider: ProviderKind | null;
  model: string | null;
  warning: string | null;
}

export interface ShoppingExtra {
  id: number;
  text: string;
  checked: boolean;
}

export interface ShoppingList {
  recipes: { servings: number; recipe: Recipe }[];
  extras: ShoppingExtra[];
  checked: string[];
}

export interface PlanEntry {
  id: number;
  /** YYYY-MM-DD */
  day: string;
  servings: number | null;
  note: string;
  recipe: RecipeSummary | null;
  added_by: { id: number; display_name: string } | null;
}

export interface PlanEntryInput {
  day: string;
  recipe?: string;
  servings?: number;
  note?: string;
}

export interface ImportFileResult {
  imported: { slug: string; title: string }[];
  skipped: string[];
  failed: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  // For bodies that aren't JSON, such as a proxy's HTML login or error page.
  const unexpected = `The server sent an unexpected response (status ${response.status})`;
  if (!response.ok) {
    let message = response.statusText || unexpected;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((d: { msg: string }) => d.msg).join(", ");
    } catch {
      /* keep status text */
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  try {
    return await response.json();
  } catch {
    throw new ApiError(response.status, unexpected);
  }
}

export const api = {
  me: () => request<AuthState>("GET", "/api/auth/me"),
  setup: (data: { username: string; display_name: string; password: string }) =>
    request<User>("POST", "/api/auth/setup", data),
  login: (username: string, password: string) => request<User>("POST", "/api/auth/login", { username, password }),
  logout: () => request<void>("POST", "/api/auth/logout"),
  updateMe: (data: Partial<Pick<User, "display_name" | "unit_system">>) =>
    request<User>("PATCH", "/api/auth/me", data),
  changePassword: (current_password: string, new_password: string) =>
    request<void>("POST", "/api/auth/password", { current_password, new_password }),

  users: () => request<User[]>("GET", "/api/users"),
  createUser: (data: { username: string; display_name: string; password: string; role: Role }) =>
    request<User>("POST", "/api/users", data),
  updateUser: (id: number, data: { display_name?: string; role?: Role; password?: string }) =>
    request<User>("PATCH", `/api/users/${id}`, data),
  deleteUser: (id: number) => request<void>("DELETE", `/api/users/${id}`),

  recipes: (params: { q?: string; tag?: string; author?: number; sort?: string }) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
    return request<RecipeSummary[]>("GET", `/api/recipes?${search}`);
  },
  recipe: (slug: string) => request<Recipe>("GET", `/api/recipes/${encodeURIComponent(slug)}`),
  createRecipe: (data: RecipeInput) => request<Recipe>("POST", "/api/recipes", data),
  updateRecipe: (slug: string, data: RecipeInput) =>
    request<Recipe>("PUT", `/api/recipes/${encodeURIComponent(slug)}`, data),
  deleteRecipe: (slug: string) => request<void>("DELETE", `/api/recipes/${encodeURIComponent(slug)}`),
  uploadPhoto: (slug: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Recipe>("PUT", `/api/recipes/${encodeURIComponent(slug)}/photo`, form);
  },
  deletePhoto: (slug: string) => request<Recipe>("DELETE", `/api/recipes/${encodeURIComponent(slug)}/photo`),

  journal: (slug: string) => request<Journal>("GET", `/api/recipes/${encodeURIComponent(slug)}/journal`),
  rate: (slug: string, stars: number) =>
    request<Journal>("PUT", `/api/recipes/${encodeURIComponent(slug)}/rating`, { stars }),
  unrate: (slug: string) => request<Journal>("DELETE", `/api/recipes/${encodeURIComponent(slug)}/rating`),
  cooked: (slug: string, note: string) =>
    request<Journal>("POST", `/api/recipes/${encodeURIComponent(slug)}/cooked`, { note }),
  undoCooked: (id: number) => request<void>("DELETE", `/api/cooked/${id}`),
  addComment: (slug: string, text: string) =>
    request<Comment>("POST", `/api/recipes/${encodeURIComponent(slug)}/comments`, { text }),
  updateComment: (id: number, data: { text?: string; done?: boolean }) =>
    request<Comment>("PATCH", `/api/comments/${id}`, data),
  deleteComment: (id: number) => request<void>("DELETE", `/api/comments/${id}`),

  photoFromUrl: (slug: string, url: string) =>
    request<Recipe>("PUT", `/api/recipes/${encodeURIComponent(slug)}/photo/from-url`, { url }),

  aiProviders: () => request<AIProvider[]>("GET", "/api/ai/providers"),
  adminProviders: () => request<AIProvider[]>("GET", "/api/admin/ai/providers"),
  saveProvider: (kind: ProviderKind, data: { api_key?: string; model: string; is_default: boolean }) =>
    request<AIProvider>("PUT", `/api/admin/ai/providers/${kind}`, data),
  deleteProvider: (kind: ProviderKind) => request<void>("DELETE", `/api/admin/ai/providers/${kind}`),
  testProvider: (kind: ProviderKind) => request<{ status: string }>("POST", `/api/admin/ai/providers/${kind}/test`),
  importRecipe: ({ photos, ...data }: ImportRequest) => {
    if (!photos?.length) return request<ImportResult>("POST", "/api/import", data);
    const form = new FormData();
    for (const photo of photos) form.append("files", photo);
    if (data.provider) form.append("provider", data.provider);
    return request<ImportResult>("POST", "/api/import/photos", form);
  },
  tidy: (recipe: RecipeInput, provider?: string) => request<RecipeInput>("POST", "/api/ai/tidy", { recipe, provider }),

  shopping: () => request<ShoppingList>("GET", "/api/shopping"),
  shoppingPutRecipe: (slug: string, servings: number) =>
    request<ShoppingList>("PUT", `/api/shopping/recipes/${encodeURIComponent(slug)}`, { servings }),
  shoppingRemoveRecipe: (slug: string) => request<ShoppingList>("DELETE", `/api/shopping/recipes/${encodeURIComponent(slug)}`),
  shoppingAddExtra: (text: string) => request<ShoppingList>("POST", "/api/shopping/extras", { text }),
  shoppingUpdateExtra: (id: number, data: { text?: string; checked?: boolean }) =>
    request<ShoppingList>("PATCH", `/api/shopping/extras/${id}`, data),
  shoppingDeleteExtra: (id: number) => request<ShoppingList>("DELETE", `/api/shopping/extras/${id}`),
  shoppingCheck: (key: string, checked: boolean) => request<ShoppingList>("PUT", "/api/shopping/checked", { key, checked }),
  shoppingClear: (checkedOnly = false) => request<ShoppingList>("POST", `/api/shopping/clear${checkedOnly ? "?checked_only=true" : ""}`),

  plan: (start: string, end: string) => request<PlanEntry[]>("GET", `/api/plan?start=${start}&end=${end}`),
  planAdd: (data: PlanEntryInput) => request<PlanEntry>("POST", "/api/plan", data),
  planUpdate: (id: number, data: { day?: string; servings?: number; note?: string }) => request<PlanEntry>("PATCH", `/api/plan/${id}`, data),
  planDelete: (id: number) => request<void>("DELETE", `/api/plan/${id}`),
  planToShopping: (start: string, end: string) => request<ShoppingList>("POST", "/api/plan/to-shopping", { start, end }),

  importFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImportFileResult>("POST", "/api/import/file", form);
  },

  tags: () => request<Tag[]>("GET", "/api/tags"),
  parseIngredients: (lines: string[]) => request<Ingredient[]>("POST", "/api/parse-ingredients", { lines }),
};
