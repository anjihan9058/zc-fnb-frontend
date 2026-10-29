import { useLayoutEffect, useState } from 'react';

export const appThemes = [
  { id: 'blue', name: '차분한 파랑', color: '#2563eb', soft: '#eaf1ff' },
  { id: 'teal', name: '깊은 청록', color: '#0f766e', soft: '#e5f4f0' },
  { id: 'indigo', name: '인디고', color: '#4f46e5', soft: '#eeedff' },
] as const;
type ThemeId = (typeof appThemes)[number]['id'];
const key = 'zc-fnb-color-theme';
export function useAppTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(key);
      return appThemes.find((t) => t.id === saved)?.id ?? 'blue';
    } catch {
      return 'blue';
    }
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.colorTheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', appThemes.find((t) => t.id === theme)!.color);
    try {
      localStorage.setItem(key, theme);
    } catch {
      /* The chosen palette still works for this session. */
    }
  }, [theme]);
  return { theme, setTheme };
}
