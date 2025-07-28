import {
  Project,
  FunctionDeclaration,
  InterfaceDeclaration,
  Type,
  SourceFile,
  TypeFormatFlags,
} from "ts-morph";
import { ScoredRisk, RiskFactorType } from "./constants.js";
import { FileChange } from "./setup/getChangedFilesWithStatus.js";
import { FileFilter } from "./utils/index.js";
import { ResolvedConfig } from "./config.js";

export type FileContentProvider = {
  getOldCode: (filePath: string) => string;
  getNewCode: (filePath: string) => string;
};

export function analyzeBreakingChanges(
  files: FileChange[],
  project: Project,
  options: FileContentProvider & { verbose: boolean, includeTests: boolean },
  config: ResolvedConfig
): { issues: string[]; scores: any; totalScore: number; skippedFiles: { unsupported: string[], failed: string[], empty: string[], tests: string[] } } {
  const issues: string[] = [];
  const scores: any = {};
  let totalScore: number = 0;
  const skippedFiles: { unsupported: string[], failed: string[], empty: string[], tests: string[] } = {
    unsupported: [],
    failed: [],
    empty: [],
    tests: []
  };

  const testFileFilter = FileFilter.createTestFileFilter();
  const allTestFiles = project.getSourceFiles().filter(f => 
    testFileFilter.shouldInclude(f.getFilePath())
  );

  const sourceFileFilter = FileFilter.createSourceFileFilter();

  for (const file of files) {

    if (testFileFilter.shouldInclude(file.path)) {
      skippedFiles.tests.push(file.path);
      continue;
    }
    
    if (!sourceFileFilter.shouldInclude(file.path)) {
      if (options.verbose) console.log("skipping unsupported file: " + file.path);
      skippedFiles.unsupported.push(file.path);
      continue;
    }
  
    if (!sourceFileFilter.hasSupportedExtension(file.path)) {
      if (options.verbose) console.log("skipping unsupported file: " + file.path);
      skippedFiles.unsupported.push(file.path);
      continue;
    }

    const oldText = options.getOldCode(file.path);
    const newText = options.getNewCode(file.path);

    if (oldText === "Skipped" || newText === "Skipped") {
      if (options.verbose) console.log("skipping failed fetch: " + file.path);
      skippedFiles["failed"].push(file.path);
      continue;
    }

    if (oldText.trim() === "" || newText.trim() === "") {
      if (options.verbose) console.log("skipping empty file: " + file.path);
      skippedFiles["empty"].push(file.path);
      continue;
    }
    
    // Flag removed files
    if (file.status === 'D') {
      issues.push("File removed");
      scores[file.path] = {
        scores: [ 
          {
            subject: file.path,
            factor: RiskFactorType.FileRemoved,
            points: config.riskWeights[RiskFactorType.FileRemoved],
            explanation: `File \`${file.path}\` was removed`,
          }
        ]
      };
      totalScore += config.riskWeights[RiskFactorType.FileRemoved];
      continue; // no need to fetch contents or analyze further
    }

    // Flag new files
    if (file.status === 'A' || file.status === 'U') {
      issues.push("New file");
      scores[file.path] = {
        scores: [ 
          {
            subject: file.path,
            factor: RiskFactorType.FileAdded,
            points: config.riskWeights[RiskFactorType.FileAdded],
            explanation: `File \`${file.path}\` was added`,
          }
        ]
      };
      totalScore += config.riskWeights[RiskFactorType.FileAdded];
    }

    // Flag renames
    if (file.status === 'R' && file.renamedFrom) {
      issues.push(`Renamed from ${file.renamedFrom}`);
      scores[file.path] = {
        scores: [ 
          {
            subject: file.path,
            factor: RiskFactorType.FileRenamed,
            points: config.riskWeights[RiskFactorType.FileRenamed],
            explanation: `File \`${file.path}\` was renamed from \`${file.renamedFrom}\``,
          }
        ]
      };
      totalScore += config.riskWeights[RiskFactorType.FileRenamed];
    }
  
    
    const oldProject = new Project();
    const oldSourceFile = oldProject.createSourceFile(file.path, oldText, {
      overwrite: true,
    });

    const newSourceFile = project.createSourceFile(file.path, newText, {
      overwrite: true,
    });
    
    const { issues: fileIssues, changedExports, scores: fileScores, fileScore } = analyzeFile(newSourceFile, oldSourceFile, project, config);

    if (fileIssues.length > 0) {
      issues.push(`\n\n### \`${file.path}\`\n` + fileIssues.map(i => `- ${i}`).join("\n"));
    }

    if (fileScores.length > 0) {
      scores[file.path] = {
        scores: fileScores,
        fileScore,
      };
      totalScore += fileScore;
    }

    if (options.includeTests === true) {
      const untested = findUntestedChanges(changedExports.length ? changedExports : ['(file)'], allTestFiles);
    
      if (untested.length > 0) {
        issues.push(
          `\n\n### ⚠️ Potentially Untested Changes\n` +
          untested.map(n => `- \`${n}\` changed but no related test was updated`).join("\n")
        );
        if(!!scores[file.path] && !!scores[file.path].scores) {
          scores[file.path].scores.push({
            subject: file.path,
            factor: RiskFactorType.MissingTest,
            points: config.riskWeights[RiskFactorType.MissingTest],
            explanation: `No associated test changes`,
          });
        } else { 
          scores[file.path] = {
            scores: [ 
              {
                subject: file.path,
                factor: RiskFactorType.MissingTest,
                points: config.riskWeights[RiskFactorType.MissingTest],
                explanation: `No associated test changes`,
              }
            ]
          };
        };
        scores[file.path].fileScore += config.riskWeights[RiskFactorType.MissingTest];
        totalScore += config.riskWeights[RiskFactorType.MissingTest];
      }
  }
}

  return { issues, scores, totalScore, skippedFiles };
}

export function analyzeFile(
  newSourceFile: SourceFile,
  oldSourceFile: SourceFile,
  project: Project,
  config: ResolvedConfig
): { issues: string[]; changedExports: string[]; scores: ScoredRisk[]; fileScore: number } {
  const issues: string[] = [];
  const changedExports: string[] = []; // Collect for test detection
  const scores: ScoredRisk[] = [];
  let fileScore = 0;

  const oldExports = oldSourceFile.getExportedDeclarations();
  const newExports = newSourceFile.getExportedDeclarations();

  const allNames = new Set([
    ...Array.from(oldExports.keys()),
    ...Array.from(newExports.keys()),
  ]);
/*
  for (const name of allNames) {
    const oldDecl = oldExports.get(name)?.[0];
    const newDecl = newExports.get(name)?.[0];

    if (!oldDecl && newDecl) {
      changedExports.push(name);
      issues.push(`Export \`${name}\` was added`);
      scores.push({
        subject: name,
        factor: RiskFactorType.ExportAdded,
        points: config.riskWeights[RiskFactorType.ExportAdded],
        explanation: `Export \`${name}\` was added`,
      });
      fileScore += config.riskWeights[RiskFactorType.ExportAdded];
    } else if (oldDecl && !newDecl) {
      changedExports.push(name);
      issues.push(`Export \`${name}\` was removed`);
      scores.push({
        subject: name,
        factor: RiskFactorType.ExportRemoved,
        points: config.riskWeights[RiskFactorType.ExportRemoved],
        explanation: `Export \`${name}\` was removed`,
      });
      fileScore += config.riskWeights[RiskFactorType.ExportRemoved];
    }

    const kind = newDecl?.getKindName();

    if (kind === "FunctionDeclaration") {
      const changes = compareFunctionSignature(
        oldDecl as FunctionDeclaration,
        newDecl as FunctionDeclaration,
        project
      );
      changedExports.push(name);
      issues.push(...changes.map(c => `Function \`${name}\`: ${c}`));
      scores.push(...changes.map(c => ({
        subject: name,
        factor: RiskFactorType.ReturnTypeChanged,
        points: config.riskWeights[RiskFactorType.ReturnTypeChanged],
        explanation: `Return type changed in \`${name}\``,
      })));
      fileScore += changes.length * config.riskWeights[RiskFactorType.ReturnTypeChanged];
    }

    if (kind === "InterfaceDeclaration") {
      const changes = compareInterfaces(
        oldDecl as InterfaceDeclaration,
        newDecl as InterfaceDeclaration
      );
      changedExports.push(name);
      issues.push(...changes.map(c => `Interface \`${name}\`: ${c}`));
      scores.push(...changes.map(c => ({
        subject: name,
        factor: RiskFactorType.PropsChanged,
        points: config.riskWeights[RiskFactorType.PropsChanged],
        explanation: `Props changed in \`${name}\``,
      })));
      fileScore += changes.length * config.riskWeights[RiskFactorType.PropsChanged];
    }
  }
    */
  for (const name of allNames) {
    const oldDecl = oldExports.get(name)?.[0];
    const newDecl = newExports.get(name)?.[0];
  
    // Added
    if (!oldDecl && newDecl) {
      changedExports.push(name);
      issues.push(`Export \`${name}\` was added`);
      scores.push({
        subject: name,
        factor: RiskFactorType.ExportAdded,
        points: config.riskWeights[RiskFactorType.ExportAdded],
        explanation: `Export \`${name}\` was added`,
      });
      fileScore += config.riskWeights[RiskFactorType.ExportAdded];
      continue; // no need to compare further
    }
  
    // Removed
    if (oldDecl && !newDecl) {
      changedExports.push(name);
      issues.push(`Export \`${name}\` was removed`);
      scores.push({
        subject: name,
        factor: RiskFactorType.ExportRemoved,
        points: config.riskWeights[RiskFactorType.ExportRemoved],
        explanation: `Export \`${name}\` was removed`,
      });
      fileScore += config.riskWeights[RiskFactorType.ExportRemoved];
      continue;
    }
  
    if (!oldDecl || !newDecl) {
      continue;
    }
  
    const kindOld = oldDecl.getKindName();
    const kindNew = newDecl.getKindName();
  
    if (kindOld === "FunctionDeclaration" && kindNew === "FunctionDeclaration") {
      const changes = compareFunctionSignature(
        oldDecl as FunctionDeclaration,
        newDecl as FunctionDeclaration,
        project
      );
      if (changes.length > 0) {
        changedExports.push(name);
        issues.push(...changes.map(c => `Function \`${name}\`: ${c}`));
        scores.push(...changes.map(c => ({
          subject: name,
          factor: RiskFactorType.ReturnTypeChanged,
          points: config.riskWeights[RiskFactorType.ReturnTypeChanged],
          explanation: `Return type changed in \`${name}\``,
        })));
        fileScore += changes.length * config.riskWeights[RiskFactorType.ReturnTypeChanged];
      }
    } else if (kindOld === "InterfaceDeclaration" && kindNew === "InterfaceDeclaration") {
      const changes = compareInterfaces(
        oldDecl as InterfaceDeclaration,
        newDecl as InterfaceDeclaration
      );
      if (changes.length > 0) {
        changedExports.push(name);
        issues.push(...changes.map(c => `Interface \`${name}\`: ${c}`));
        scores.push(...changes.map(c => ({
          subject: name,
          factor: RiskFactorType.PropsChanged,
          points: config.riskWeights[RiskFactorType.PropsChanged],
          explanation: `Props changed in \`${name}\``,
        })));
        fileScore += changes.length * config.riskWeights[RiskFactorType.PropsChanged];
      }
    } else {
     // TODO: Handle other kinds
    }
  }
  

  return { issues, changedExports, scores, fileScore };
}

function isTypeNarrowed(oldType: Type, newType: Type, project: Project): boolean {
  const checker = project.getTypeChecker();

  const oldToNew = checker.isTypeAssignableTo(oldType, newType);
  const newToOld = checker.isTypeAssignableTo(newType, oldType);

  return newToOld && !oldToNew;
}

function compareFunctionSignature(
  oldFn: FunctionDeclaration,
  newFn: FunctionDeclaration,
  project: Project
): string[] {
  const issues: string[] = [];

  const oldRet = !!oldFn && "getReturnType" in oldFn ? oldFn.getReturnType() : undefined;
  const newRet = !!newFn && "getReturnType" in newFn ? newFn.getReturnType() : undefined;
  if (!oldRet && !newRet) return [];

  if (oldRet && newRet && isTypeNarrowed(oldRet, newRet, project)) {
    issues.push(`Return type narrowed from \`${oldRet.getText(undefined, TypeFormatFlags.UseFullyQualifiedType)}\` to \`${newRet.getText(undefined, TypeFormatFlags.UseFullyQualifiedType)}\``);
  } 

  const oldParams = !!oldFn && "getParameters" in oldFn ? oldFn.getParameters() : [];
  const newParams = !!newFn && "getParameters" in newFn ? newFn.getParameters() : [];

  if (!oldParams && !newParams) return [];

  if (newParams.length < oldParams.length) {
    issues.push(`Removed ${oldParams.length - newParams.length} parameter(s)`);
  } else if (newParams.length > oldParams.length) {
    issues.push(`Added ${newParams.length - oldParams.length} parameter(s)`);
  } else {
    for (let i = 0; i < oldParams.length; i++) {
      const oldType = oldParams[i].getType();
      const newType = newParams[i].getType();

      if (oldType && newType && isTypeNarrowed(oldType, newType, project)) {
        issues.push(
          `Parameter ${i + 1} type narrowed from \`${oldType.getText(undefined, TypeFormatFlags.UseFullyQualifiedType)}\` to \`${newType.getText(undefined, TypeFormatFlags.UseFullyQualifiedType)}\``
        );
      }
    }
  }

  return issues;
}

function compareInterfaces(
  oldInterface: InterfaceDeclaration,
  newInterface: InterfaceDeclaration
): string[] {
  const issues: string[] = [];

  const oldProps = !!oldInterface && "getProperties" in oldInterface ? Object.fromEntries(
    oldInterface.getProperties().map(p => [p.getName(), p])
  ) : {};
  const newProps = !!newInterface && "getProperties" in newInterface ? Object.fromEntries(
    newInterface.getProperties().map(p => [p.getName(), p])
  ) : {};

  if (!oldProps && !newProps) return [];

  for (const name in oldProps) {
    if (!newProps[name]) {
      issues.push(`Prop \`${name}\` was removed`);
      continue;
    }

    const wasOptional = oldProps[name].hasQuestionToken();
    const isOptional = newProps[name].hasQuestionToken();

    if (wasOptional && !isOptional) {
      issues.push(`Prop \`${name}\` is now required`);
    }
  }

  for (const name in newProps) {
    if (!oldProps[name]) {
      issues.push(`Prop \`${name}\` was added`);
    }
  }

  return issues;
}

function findUntestedChanges(
  changedExports: string[],
  testFiles: SourceFile[],
): string[] {
  const testFileText = testFiles.length > 0
    ? testFiles.map(f => f.getFullText()).join("\n")
    : "";

  const untested = changedExports.filter(name => {
    // Check if any test file includes the name
    return !testFileText.includes(name);
  });

  return untested;
}
