import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { RequireLogin } from "./components/RequireLogin";
import { useAuth } from "./lib/auth";
import { AIProvidersPage } from "./pages/AIProvidersPage";
import { CookingView } from "./pages/CookingView";
import { EmptyState } from "./pages/EmptyState";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { RecipeDetail } from "./pages/RecipeDetail";
import { RecipeEditor } from "./pages/RecipeEditor";
import { SettingsPage } from "./pages/SettingsPage";
import { BackupPage } from "./pages/BackupPage";
import { PlanPage } from "./pages/PlanPage";
import { ShoppingPage } from "./pages/ShoppingPage";
import { SetupPage } from "./pages/SetupPage";
import { UsersPage } from "./pages/UsersPage";

/** A fresh editor for each recipe and each visit to /new, so no draft carries over. */
function EditorRoute() {
  const { slug } = useParams();
  const { key } = useLocation();
  return <RecipeEditor key={slug ?? key} />;
}

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
      <Route path="/recipes/:slug/cook" element={<CookingView />} />
      <Route element={<AppShell />}>
        <Route index element={<EmptyState />} />
        <Route path="recipes/:slug" element={<RecipeDetail />} />
        <Route element={<RequireLogin />}>
          <Route path="new" element={<EditorRoute />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="shopping" element={<ShoppingPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="recipes/:slug/edit" element={<EditorRoute />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="backup" element={<BackupPage />} />
          <Route path="admin/users" element={<UsersPage />} />
          <Route path="admin/ai" element={<AIProvidersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
