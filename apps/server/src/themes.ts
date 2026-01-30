import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";

export type ThemePackage = {
  manifest: {
    id: string;
    name: string;
    author?: string;
  };
  css: string;
  locales: Record<string, string>;
};

const THEMES_DIR = join(process.cwd(), "themes");

export async function loadTheme(themeId: string): Promise<ThemePackage> {
  const dir = join(THEMES_DIR, themeId);

  try {
    const [manifestRaw, css, localesRaw] = await Promise.all([
      readFile(join(dir, "manifest.json"), "utf-8"),
      readFile(join(dir, "style.css"), "utf-8"),
      readFile(join(dir, "locales.json"), "utf-8"),
    ]);

    return {
      manifest: JSON.parse(manifestRaw),
      css,
      locales: JSON.parse(localesRaw),
    };
  } catch (e: any) {
    throw new Error(`failed to load theme '${themeId}': ${e.message}`);
  }
}

export async function listAvailableThemes(): Promise<string[]> {
  try {
    const entries = await readdir(THEMES_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return ["default"];
  }
}
