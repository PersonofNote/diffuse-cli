import path from "path";
import { Project } from "ts-morph";
import { RiskFactorType, riskWeights, ScoredRisk } from "./constants.js";
import { formatImportList, RenderContext } from "./setup/detectGithub.js";
import { FileFilter } from "./utils/index.js";

type GraphType =   {
  exports: string[];
  imports: { from: string; symbols: string[] }[];
  importedBy: string[];
  subsystem: string[];
  isPartial: boolean;
}

type UsageGraph = Record<
  string,
  GraphType
>;

function getTopLevelDir(filePath: string): string {
  const parts = filePath.split(path.sep);
  return parts.find(part => part && part !== 'src') ?? 'root';
}

function getUniqueSubtrees(graph: UsageGraph, filePath: string): Set<string> {
  const visited = new Set<string>();
  const queue = [filePath];
  const topLevels = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;

    visited.add(current);
    const dependents = graph[current]?.importedBy ?? [];
    for (const dep of dependents) {
      topLevels.add(getTopLevelDir(dep));
    }

    queue.push(...dependents);
  }

  return topLevels;
}

// TODO: expand this instead of approximating. This is MVP
function inferSubsystem(path: string): string {
  const parts = path.split("/");
  if (parts.includes("components")) return "UI";
  if (parts.includes("lib")) return "Library";
  if (parts.includes("hooks")) return "Hooks";
  if (parts.includes("pages")) return "Pages";
  if (parts.includes("api")) return "API";
  return parts[1] || "root";
}

// TODO: consider leveraging breaking changes to avoid redoing work (But might couple too tightly
export async function buildUsageGraph(project: Project, files: string[], options?: { verbose: boolean }): Promise<UsageGraph> {
  const graph: UsageGraph = {};
  
  // Use FileFilter to filter files consistently
  const fileFilter = FileFilter.createSourceFileFilter();
  const filteredFiles = fileFilter.filterFiles(files);

  for (const filePath of filteredFiles) {
    const absPath = path.resolve(filePath);
    const sourceFile = project.getSourceFile(absPath);

    if (!sourceFile) {
      console.warn(`Skipping untracked file: ${absPath}`);
      continue;
    }

    // Initialize 
    if (!graph[absPath]) {
      graph[absPath] = { exports: [], imports: [], importedBy: [], subsystem: [], isPartial: false };
    }

    const exportedSymbols = sourceFile.getExportSymbols().map((sym) => sym.getName());
    graph[absPath].exports = exportedSymbols;

    const importDecls = sourceFile.getImportDeclarations();

    for (const imp of importDecls) {
      let specNode;
      // Degrade gracefully for dynamic/unsupported import types
      try {
        specNode = imp.getModuleSpecifier();
      } catch (err) {
        graph[absPath].isPartial = true;
        if (options?.verbose) console.warn(`Failed to access module specifier in ${absPath}: ${err}`);
        continue;
      }

      if (!specNode || specNode.getKindName() !== "StringLiteral") {
        graph[absPath].isPartial = true;
        if (options?.verbose) console.warn(`Non-literal module specifier in ${absPath}`);
        continue;
      }

      const specifier = specNode.getLiteralText();
      if (!specifier) continue;

      const importedFile = specNode.getSourceFile();
      const importedPath = importedFile?.getFilePath();

      if (!importedPath) {
        graph[absPath].isPartial = true;
        if (options?.verbose) console.warn(`Could not resolve import "${specifier}" in ${absPath}`);
        continue;
      }

      const named = imp.getNamedImports().map((i) => i.getName());
      const defaultImp = imp.getDefaultImport()?.getText();
      const ns = imp.getNamespaceImport()?.getText();

      const symbols = [
        ...named,
        ...(defaultImp ? [defaultImp] : []),
        ...(ns ? [`* as ${ns}`] : []),
      ];

      graph[absPath].imports.push({
        from: importedPath,
        symbols,
      });

      if (!graph[importedPath]) {
        graph[importedPath] = { exports: [], imports: [], importedBy: [], subsystem: [], isPartial: false };
      }
      if (absPath !== importedPath && !graph[importedPath].importedBy.includes(absPath)) {
        graph[importedPath].importedBy.push(absPath);
      }

      const subsystem = inferSubsystem(absPath);
      if (!graph[importedPath].subsystem.includes(subsystem)) {
        graph[importedPath].subsystem.push(subsystem);
      }
    }
  }
  return graph;
}

export function calculateBlastRadius(graph: UsageGraph, filePath: string): number {
  const visited = new Set<string>();
  const queue = [filePath];

  let impactCount = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;

    visited.add(current);
    const dependents = graph[current]?.importedBy ?? [];
    impactCount += dependents.length;

    queue.push(...dependents);
  }
  return impactCount;
}

// TODO: Decide how useful this is. Tradeoff - don't want to artificially iflate numbers, but sometimes deep dependencies are a problem
function getMaxDependencyDepth(graph: UsageGraph, filePath: string): number {
  const visited = new Set<string>();

  function dfs(current: string, depth: number): number {
    if (visited.has(current)) return depth;
    visited.add(current);

    const dependents = graph[current]?.importedBy ?? [];
    if (dependents.length === 0) return depth;

    return Math.max(...dependents.map(dep => dfs(dep, depth + 1)));
  }

  return dfs(filePath, 0);
}


export function calculateGraphScore(graph: UsageGraph, changedFiles: string[], context?: RenderContext, options?: { verbose: boolean }): {
  totalScore: number;
  graphScore: ScoredRisk[];
} {
  const scores: ScoredRisk[] = [];
  let total = 0;

  for (const file of changedFiles) {
    const absPath = path.resolve(file);
    const radius = calculateBlastRadius(graph, absPath);
    const dependents = graph[absPath]?.importedBy ?? [];

    if (graph[absPath]?.isPartial) {
      scores.push({
        subject: file,
        factor: RiskFactorType.PartialImport,
        points: 0,
        explanation: `Dynamic or malformed import`,
      });
    }

    if (dependents.length === 0) continue;

    const radiusScore = radius * riskWeights[RiskFactorType.ImportedInFiles];
    const list = formatImportList(dependents, context, options?.verbose);


    if (graph[absPath]?.subsystem.length > 1) {
      scores.push({
        subject: file,
        factor: RiskFactorType.UsedInMultipleTrees,
        points: riskWeights[RiskFactorType.UsedInMultipleTrees],
        explanation: `Used across ${graph[absPath]?.subsystem.length} project areas ${options?.verbose ? `(${[...graph[absPath]?.subsystem].join(', ')})` : ''}`,
      });
    }

    scores.push({
      subject: file,
      factor: RiskFactorType.ImportedInFiles,
      points: radiusScore,
      explanation: `Imported by ${list}`,
    });
    total += radiusScore;

    // TODO: Subtree spread scoring temporarily disabled until project structure conventions are better defined
    /*
    const subtrees = getUniqueSubtrees(graph, absPath);
    if (subtrees.size > 1) {
      const spreadScore = riskWeights[RiskFactorType.UsedInMultipleTrees];
      scores.push({
        subject: file,
        factor: RiskFactorType.UsedInMultipleTrees,
        points: spreadScore,
        explanation: `Used across ${subtrees.size} project areas (${[...subtrees].join(', ')})`,
      });
      total += spreadScore;
    }
    */
  }

  return {
    totalScore: total,
    graphScore: scores,
  };
}
