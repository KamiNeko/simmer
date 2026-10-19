// Applies the saved or system theme before the app renders, so the page doesn't flash light.
try {
  const t = localStorage.getItem("simmer-theme");
  if (t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
} catch {
  /* storage blocked */
}
