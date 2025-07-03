import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { buildUsageGraph, calculateGraphScore } from './lib/buildUsageGraph.js';
import { analyzeBreakingChanges } from './lib/analyzeBreakingChanges.js';
import { readFileSync } from "fs";
import { generateReport } from "./lib/report.js";
import { detectGithubContext } from "./lib/setup/detectGithub.js";
import { loadProjectWithFallback, findRepoRoot } from "./lib/setup/loadProjectWithFallback.js";
import { GitService } from "./lib/services/index.js";

async function runCLI() {
  const program = new Command();

  program
    .name("diffuse")
    .description("Static risk analysis tool for code changes - analyzes breaking changes and usage patterns within a single repository.")
    .option("-s, --since <branch>", "Git base branch or ref to compare against (e.g., main)")
    .option("-o, --output <file>", "Write output to file")
    .option("--fail-on-high-risk", "Exit with code 1 if high risk detected")
    .option("--format <type>", "Report format: 'markdown' or 'plain' (default: plain)", "plain")
    .option('--no-suggestions', 'Suppress actionable suggestions in the output')
    .option("--no-tests", "Exclude tests from scoring")
    .option('--verbose', 'Enable verbose logging')
    .helpOption("-h, --help", "Show CLI usage information")
    .parse(process.argv);

  const options = program.opts();

  const context = detectGithubContext();

  const rootDir = findRepoRoot(process.cwd());
  const project = loadProjectWithFallback({ rootDir, verbose: true });
  
  // Initialize GitService with the base reference
  const gitService = new GitService({ 
    baseRef: options.since || undefined,
    verbose: options.verbose
  });

  function isTestFile(filePath: string): boolean {
    return /(^|\/)(test|tests|__tests__|__mocks__)(\/|$)/.test(filePath) || 
           /\.test\.(t|j)sx?$/.test(filePath) || 
           /\.spec\.(t|j)sx?$/.test(filePath);
  }

  const sourceFiles = project.getSourceFiles().map(f => f.getFilePath());
  const filteredFiles = sourceFiles.filter(p =>
    !p.includes("node_modules") &&
    !isTestFile(p)
  );

  (async () => {
    const changedFiles = (options.since 
      ? gitService.getChangedFilesSinceBase(options.since) 
      : gitService.getWorkingTreeChangedFiles()
    ).filter(p =>
      !p.includes("node_modules") && !isTestFile(p)
    );
    
    const changedFilesWithStatus = options.since
      ? gitService.getChangedFilesWithStatus(options.since)
      : gitService.getChangedFilesWithStatus();

    const lineStats = options.since
      ? gitService.getLineStats(options.since)
      : gitService.getLineStats();

    if (changedFiles.length === 0) {
      console.log('No changed files to analyze.');
      process.exit(0);
    }

    // Rebuild usage graph across whole repo (optionally could filter here too)
    const graph = await buildUsageGraph(project, filteredFiles, { verbose: options.verbose });

    const breakingChanges = analyzeBreakingChanges(changedFilesWithStatus, project, {
      getOldCode: (file) => {
        const result = gitService.getFileFromGit(options.since || "origin/main", file);
        return result.content;
      },
      getNewCode: (file) => {
        const result = gitService.getCurrentFileContent(file);
        return result.content;
      },
      verbose: options.verbose || false,
      includeTests: options.tests
    });

    const graphScore = calculateGraphScore(graph, changedFiles, context);
    const totalRiskScore = breakingChanges.totalScore + graphScore.totalScore;

    const data = {
      totalRiskScore,
      breakingChanges,
      graphScore,
      lineStats,
    }
    
    const report = generateReport(data, context, options);
    console.log(report);
   
    if (options.output) {
      fs.writeFileSync(path.resolve(options.output), report, "utf-8");
    }
  
    // Exit code if high risk detected and flag set
    if (options.failOnHighRisk && data.totalRiskScore >= 60) {
      process.exit(1);
    }
      
  })();
}

runCLI().catch((e) => {
  console.error(e);
  process.exit(1);
});