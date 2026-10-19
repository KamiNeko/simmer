// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTheme } from "./theme";

/** A stand-in for the OS colour scheme that tests can flip. */
function fakeSystem(dark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const query = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", () => query);
  return (next: boolean) => {
    dark = next;
    listeners.forEach((fn) => fn({ matches: next } as MediaQueryListEvent));
  };
}

const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});

describe("useTheme", () => {
  it("follows the system without saving a choice", () => {
    const setSystem = fakeSystem(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.dark).toBe(true);
    expect(isDark()).toBe(true);
    expect(localStorage.getItem("simmer-theme")).toBeNull();

    act(() => setSystem(false));
    expect(result.current.dark).toBe(false);
    expect(isDark()).toBe(false);
    expect(localStorage.getItem("simmer-theme")).toBeNull();
  });

  it("saves the toggle and then ignores the system", () => {
    const setSystem = fakeSystem(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.dark).toBe(true);
    expect(localStorage.getItem("simmer-theme")).toBe("dark");

    act(() => setSystem(false));
    expect(isDark()).toBe(true);
  });

  it("uses a saved choice over the system", () => {
    fakeSystem(true);
    localStorage.setItem("simmer-theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.dark).toBe(false);
    expect(isDark()).toBe(false);
  });

  it("copes without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useTheme());
    expect(result.current.dark).toBe(false);
  });
});
