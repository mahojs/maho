import { join } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

export type ThemePackage = {
  id: string;
  css: string;
  locales: Record<string, string>;
};

export function createThemeLoader(internalPath: string, appDataPath: string) {
  const getSearchPaths = (customPath?: string) =>
    [customPath, appDataPath, internalPath].filter((p): p is string => !!p);

  const findPath = async (themeId: string, customPath?: string) => {
    for (const root of getSearchPaths(customPath)) {
      const p = join(root, themeId);
      try {
        if ((await stat(p)).isDirectory()) return p;
      } catch {
        continue;
      }
    }
    return null;
  };

  return {
    async list(customPath?: string) {
      const themes = new Set<string>();
      for (const root of getSearchPaths(customPath)) {
        try {
          const entries = await readdir(root, { withFileTypes: true });
          entries
            .filter((e) => e.isDirectory())
            .forEach((e) => themes.add(e.name));
        } catch {}
      }
      return Array.from(themes);
    },

    async load(themeId: string, customPath?: string): Promise<ThemePackage> {
      const targetDir = await findPath(themeId, customPath);
      if (!targetDir) throw new Error(`theme '${themeId}' not found`);

      const [css, localesRaw] = await Promise.all([
        readFile(join(targetDir, "style.css"), "utf-8"),
        readFile(join(targetDir, "locales.json"), "utf-8"),
      ]);

      return {
        id: themeId,
        css,
        locales: JSON.parse(localesRaw),
      };
    },
  };
}

export type ThemeLoader = ReturnType<typeof createThemeLoader>;
