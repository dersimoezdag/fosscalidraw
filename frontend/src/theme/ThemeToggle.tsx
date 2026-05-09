import { useTranslation } from "react-i18next";
import { useColorScheme } from "./useColorScheme";

export function ThemeToggle() {
  const { t } = useTranslation();
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? t("useLightMode") : t("useDarkMode")}
      title={isDark ? t("useLightMode") : t("useDarkMode")}
      onClick={toggleColorScheme}
    >
      <span className="theme-toggle__icon" aria-hidden="true">{isDark ? "☾" : "☀"}</span>
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__thumb" />
      </span>
    </button>
  );
}
