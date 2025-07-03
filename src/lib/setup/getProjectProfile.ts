import fs from "fs";
import path from "path";

type ProjectProfile = {
  framework: "next" | "vite" | "react" | "node" | "monorepo" | "unknown";
  language: "ts" | "js" | "mixed";
  usesJsx: boolean;
  hasTests: boolean;
  monorepoTool?: "turbo" | "nx" | "lerna" | "pnpm-workspace" | "rush";
  entryPoints: string[];
};

export function detectProjectProfile(rootDir: string = process.cwd()): ProjectProfile {
  const read = (p: string) => fs.existsSync(path.join(rootDir, p));
  const pkgJsonPath = path.join(rootDir, "package.json");
  const pkg = read("package.json") ? JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) : {};

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const has = (lib: string) => Object.keys(deps).includes(lib);

  const files = fs.readdirSync(rootDir, { withFileTypes: true });

  // Detect framework
  let framework: ProjectProfile["framework"] = "unknown";
  if (has("next")) framework = "next";
  else if (has("vite")) framework = "vite";
  else if (has("react")) framework = "react";
  else if (read("index.js") || read("index.ts")) framework = "node";

  // Detect JSX / TS / test presence
  const allFiles = walkDir(rootDir);
  const hasJsx = allFiles.some(f => f.endsWith(".jsx") || f.endsWith(".tsx"));
  const hasTs = allFiles.some(f => f.endsWith(".ts") || f.endsWith(".tsx"));
  const hasJs = allFiles.some(f => f.endsWith(".js") || f.endsWith(".jsx"));
  const hasTests = allFiles.some(f => /test|__tests__/.test(f));

  // Detect monorepo
  let monorepoTool: ProjectProfile["monorepoTool"] | undefined;
  if (read("turbo.json")) monorepoTool = "turbo";
  else if (read("nx.json")) monorepoTool = "nx";
  else if (read("lerna.json")) monorepoTool = "lerna";
  else if (read("pnpm-workspace.yaml")) monorepoTool = "pnpm-workspace";
  else if (read("rush.json")) monorepoTool = "rush";

  if (monorepoTool) framework = "monorepo";

  // Entry point heuristics
  const entryPoints: string[] = [];
  ["src/index.ts", "src/main.ts", "src/app.ts", "index.ts", "main.ts", "server.ts"].forEach(p => {
    if (read(p)) entryPoints.push(p);
  });

  return {
    framework,
    language: hasTs && hasJs ? "mixed" : hasTs ? "ts" : "js",
    usesJsx: hasJsx,
    hasTests,
    monorepoTool,
    entryPoints,
  };
}

function walkDir(dir: string, collected: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith("node_modules") || entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, collected);
    } else {
      collected.push(fullPath);
    }
  }
  return collected;
}
