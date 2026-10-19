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
  created_at: string;
  updated_at: string;
  can_edit: boolean;
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

export interface Tag {
  name: string;
  count: number;
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
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((d: { msg: string }) => d.msg).join(", ");
    } catch {
      /* keep status text */
    }
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
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
  tags: () => request<Tag[]>("GET", "/api/tags"),
  parseIngredients: (lines: string[]) => request<Ingredient[]>("POST", "/api/parse-ingredients", { lines }),
};
