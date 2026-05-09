import { useEffect, useState } from "react";

export type ColorScheme = "light" | "dark";

const storageKey = "fosscalidraw.colorScheme";
const changeEvent = "fosscalidraw:color-scheme";

export function getStoredColorScheme(): ColorScheme {
  return window.localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
}

export function useColorScheme() {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(getStoredColorScheme);

  useEffect(() => {
    document.documentElement.dataset.theme = colorScheme;
    window.localStorage.setItem(storageKey, colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    const syncColorScheme = () => setColorSchemeState(getStoredColorScheme());
    const syncColorSchemeEvent = (event: Event) => {
      const nextColorScheme = (event as CustomEvent<ColorScheme>).detail;
      setColorSchemeState(nextColorScheme === "dark" ? "dark" : "light");
    };
    window.addEventListener("storage", syncColorScheme);
    window.addEventListener(changeEvent, syncColorSchemeEvent);
    return () => {
      window.removeEventListener("storage", syncColorScheme);
      window.removeEventListener(changeEvent, syncColorSchemeEvent);
    };
  }, []);

  function setColorScheme(nextColorScheme: ColorScheme) {
    setColorSchemeState(nextColorScheme);
    window.dispatchEvent(new CustomEvent(changeEvent, { detail: nextColorScheme }));
  }

  function toggleColorScheme() {
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  }

  return { colorScheme, setColorScheme, toggleColorScheme };
}
