import { Project, CompilerOptions } from "ts-morph";
import fs from "fs";
import path from "path";
import fg from "fast-glob";

type LoadOptions = {
  rootDir?: string;
  include?: string[]; // Optional globs
  verbose?: boolean;
};


export function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (!fs.existsSync(path.join(dir, ".git"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not find repo root");
    dir = parent;
  }
  return dir;
}


export function loadProjectWithFallback(options: LoadOptions = {}): Project {
  const {
    rootDir = process.cwd(),
    include = ["**/*.{ts,tsx,js,jsx}"],
    verbose = false,
  } = options;

  const tsconfigPath = path.join(rootDir, "tsconfig.json");
  let project: Project;

  if (fs.existsSync(tsconfigPath)) {
    if (verbose) console.log("✅ Using existing tsconfig.json");
    project = new Project({ tsConfigFilePath: tsconfigPath });
  } else {
    if (verbose) console.log("⚠️ No tsconfig.json found — using fallback compiler options");

    const compilerOptions: CompilerOptions = {
      allowJs: true,
      checkJs: false,
      jsx: 2, // React
      target: 99,
      module: 99,
      moduleResolution: 2,
      baseUrl: "./",
    };

    project = new Project({ compilerOptions });
    
    // Use fast-glob to avoid node_modules, dist, .next, etc.
    const exclude = ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**"];
    const patterns = [...include, ...exclude.map(p => `!${p}`)];
    const files = fg.sync(patterns, { cwd: rootDir, absolute: true });

    if (verbose) console.log(`Adding ${files.length} source files (fallback mode)`);

    const { added, skipped } = addSourceFiles(project, files, verbose);
    if (verbose) console.log(`Added ${added.length} files, skipped ${skipped.length}`);
  }

  return project;
}


export function addSourceFiles(project: Project, filePaths: string[], verbose = false) {
  const added: string[] = [];
  const skipped: string[] = [];

  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      project.createSourceFile(filePath, content, { overwrite: true });
      added.push(filePath);
    } catch (err) {
      skipped.push(filePath);
      if (verbose) {
        console.warn(`Skipping unparseable file: ${filePath}`);
      }
    }
  }

  return { added, skipped };
}

