import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { RequireLogin } from "./components/RequireLogin";
import { useAuth } from "./lib/auth";
import { EmptyState } from "./pages/EmptyState";
import { LoginPage } from "./pages/LoginPage";
import { RecipeDetail } from "./pages/RecipeDetail";
import { RecipeEditor } from "./pages/RecipeEditor";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { UsersPage } from "./pages/UsersPage";

export function App() {
  const { needsSetup, loading } = useAuth();
  if (loading) return null;
  if (needsSetup) {
    return (
      <Routes>
        <Route path="*" element={<SetupPage />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<EmptyState />} />
        <Route path="recipes/:slug" element={<RecipeDetail />} />
        <Route element={<RequireLogin />}>
          <Route path="new" element={<RecipeEditor />} />
          <Route path="recipes/:slug/edit" element={<RecipeEditor />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin/users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
