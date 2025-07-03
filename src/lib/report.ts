import chalk from 'chalk';
import { ScoredRisk } from './constants.js';
import { RenderContext } from './setup/detectGithub.js';
import { riskSuggestions, RiskFactorType, riskWeights, encodeGitHubFilePath, escapeMarkdownLinkText } from './constants.js';


function riskLevel(score: number, mode: 'terminal' | 'markdown' = 'terminal'): string {
  if (mode === 'terminal') {
    if (score >= 80) return chalk.magenta('🔥 Very High Risk');
    if (score >= 60) return chalk.red('⚠️ High Risk');
    if (score >= 40) return chalk.yellow('🟡 Medium Risk');
    return chalk.green('✅ Low Risk');
  } else {
    if (score >= 80) return '🔥 **Very High Risk**';
    if (score >= 60) return '⚠️ **High Risk**';
    if (score >= 40) return '🟡 **Medium Risk**';
    return '✅ **Low Risk**';
  }
}

function extractSummary(fileRisks: Record<string, { total: number; risks: ScoredRisk[] }>, lineStats: Record<string, { added: number, removed: number, totalLines: number }> = {}) {
  const LARGE_CHANGE_PERCENTAGE_THRESHOLD = 20;
  
  const finalScores = Object.entries(fileRisks).map(([file, { total, risks }]) => {
    const stats = lineStats[file] || { added: 0, removed: 0, totalLines: 0 };
    const totalChanged = stats.added + stats.removed;
    const percentageChanged = stats.totalLines > 0 ? (totalChanged / stats.totalLines) * 100 : 0;
    
    let finalScore = total;
    if (percentageChanged > LARGE_CHANGE_PERCENTAGE_THRESHOLD) {
      finalScore += riskWeights[RiskFactorType.LargeChange];
    }
    
    return { file, finalScore };
  });
  
  finalScores.sort((a, b) => b.finalScore - a.finalScore);
  const topFile = finalScores[0]?.file || null;

  let returnTypeChanges = 0;
  let missingTests = 0;
  const filesWithMultiImports = new Set<string>();

  for (const { risks } of Object.values(fileRisks)) {
    for (const r of risks) {
      if (r.factor === RiskFactorType.ReturnTypeChanged) returnTypeChanges++;
      if (r.factor === RiskFactorType.MissingTest) missingTests++;
      if (r.factor === RiskFactorType.ImportedInFiles) {
        const count = Math.round(r.points / riskWeights[RiskFactorType.ImportedInFiles]);
        if (count >= 3) {
          filesWithMultiImports.add(r.subject);
        }
      }
    }
  }

  return { topFile, returnTypeChanges, missingTests, filesWithMultiImports, totalFiles: finalScores.length };
}

function getFileRisks(data: any): Record<string, { total: number; risks: ScoredRisk[] }> {
  const fileRisks: Record<string, { total: number; risks: ScoredRisk[] }> = {};
  const allScores = [
    ...Object.entries(data.breakingChanges.scores || {}).flatMap(([file, obj]: [string, any]) =>
      (obj.scores || []).map((score: ScoredRisk) => ({ file, score }))
    ),
    ...(data.graphScore.graphScore || []).map((score: ScoredRisk) => ({
      file: score.subject,
      score,
    })),
  ];

  for (const { file, score } of allScores) {
    if (!fileRisks[file]) fileRisks[file] = { total: 0, risks: [] };
    fileRisks[file].total += score.points;
    fileRisks[file].risks.push(score);
  }

  return fileRisks;
}
// TODO: if we omit tests, we end up teling users we analyzed a smaller number of files than we did. Maybe remove suggestion and add 0 points but still return the file?
export function generateTerminalReport(data: any, options?: { suggestions?: boolean, verbose?: boolean, tests?: boolean }): string {
  const fileRisks = getFileRisks(data);
  const lineStats = data.lineStats || {};
  const { topFile, returnTypeChanges, missingTests, filesWithMultiImports, totalFiles } = extractSummary(fileRisks, lineStats);
  
  // Calculate final scores including Large Change factor for sorting
  const finalScores = Object.entries(fileRisks).map(([file, { total, risks }]) => {
    const stats = lineStats[file] || { added: 0, removed: 0, totalLines: 0 };
    const totalChanged = stats.added + stats.removed;
    const percentageChanged = stats.totalLines > 0 ? (totalChanged / stats.totalLines) * 100 : 0;
    
    let finalScore = total;
    if (percentageChanged > 20) {
      finalScore += riskWeights[RiskFactorType.LargeChange];
    }
    
    return { file, finalScore, total, risks };
  });
  
  // Sort by final score (highest first)
  finalScores.sort((a, b) => b.finalScore - a.finalScore);
  
  const averageRisk = data.totalRiskScore / totalFiles;
  const LARGE_CHANGE_PERCENTAGE_THRESHOLD = 20; // 20% of file changed

  let output = '\n' + chalk.bold.underline('🚨 RISK ANALYSIS REPORT\n') + '\n';
  
  const totalSkipped = Object.values(data.breakingChanges.skippedFiles).flat().length;
  if (options?.verbose) {
    output += `Git found ${totalFiles + totalSkipped} files. ${totalFiles} were analyzed. ${data.breakingChanges.skippedFiles.unsupported.length} unsupported file extensions, 
    ${data.breakingChanges.skippedFiles.failed.length} failed, ${data.breakingChanges.skippedFiles.empty.length} empty, and ${data.breakingChanges.skippedFiles.tests.length} tests were skipped\n\n`;
  } else {
    output += `Git found ${totalFiles + totalSkipped} files, including metadata, ghost changes, tests, and unsupported file extensions. ${totalFiles} were analyzed\n\n`;
  }

  output += `Overall Risk Score: ${chalk.bold(data.totalRiskScore.toFixed(2))} ${riskLevel(data.totalRiskScore)}\n`;
  output += `Average Risk Score: ${chalk.bold(averageRisk.toFixed(2))} ${riskLevel(averageRisk)}\n`;

  if (data.totalRiskScore >= 60 && averageRisk < 40) {
    output += `\n${chalk.bold.red('Note: This PR touches many files with individually low-risk changes.\nThe volume increases review complexity and regression risk.\n')}`;
  }

  if (topFile) output += `\n🔥 Highest risk file to review: ${chalk.bold(topFile)}\n`;
  output += `\n📊 ${totalFiles} files changed · ${returnTypeChanges} with return type changes · ${options?.tests ? missingTests + " with no test deltas ·" : ""} ${filesWithMultiImports.size} imported by multiple files\n\n`;

  for (const { file, finalScore, total, risks } of finalScores) {
    const stats = lineStats[file] || { added: 0, removed: 0, totalLines: 0 };
    const totalChanged = stats.added + stats.removed;
    const percentageChanged = stats.totalLines > 0 ? (totalChanged / stats.totalLines) * 100 : 0;
    let fileRisksWithLarge = [...risks];
    if (percentageChanged > LARGE_CHANGE_PERCENTAGE_THRESHOLD) {
      fileRisksWithLarge = [
        ...fileRisksWithLarge,
        {
          subject: file,
          factor: RiskFactorType.LargeChange,
          points: riskWeights[RiskFactorType.LargeChange],
          explanation: `Large change: +${stats.added}/-${stats.removed} lines (${percentageChanged.toFixed(1)}% of file)`,
        },
      ];
    }
    output += `\n${chalk.bold(file)}\n`;
    output += `Lines changed: +${chalk.green(stats.added)}/-${chalk.red(stats.removed)} (${percentageChanged.toFixed(1)}% of ${stats.totalLines} lines)\n`;
    output += `Total Score: ${chalk.bold(finalScore.toFixed(2))} ${riskLevel(finalScore)}\n`;
    for (const risk of fileRisksWithLarge) {
      const importCount = Math.round(risk.points / riskWeights[RiskFactorType.ImportedInFiles]);
      let suggestion = '';

      if (risk.factor === RiskFactorType.ImportedInFiles && importCount >= 3) {
        suggestion = riskSuggestions[RiskFactorType.ImportedInFiles];
      } else if (risk.factor !== RiskFactorType.ImportedInFiles) {
        suggestion = riskSuggestions[risk.factor];
      }

      output += `${risk.explanation} ${chalk.dim(`(${risk.points.toFixed(2)} pts)`)}\n`;
      if (options?.suggestions && suggestion) {
        output += `${chalk.blue(`  -${suggestion}`)}\n`;
      }
    }
  }

  output += '\n';
  output += '\n---\n';
  output += 'This report was generated by Diffuse (Open Source)\n';
  output += 'Got feedback? [I\'d love to hear it](https://docs.google.com/forms/d/e/1FAIpQLScu4x26hKju8MhxG6dhSctWDuG7A3RT0DrckzyK0E_optgZmA/viewform?usp=header)\n';
  return output;
}

export function generateMarkdownReport(data: any, context?: RenderContext, options?: { suggestions?: boolean, tests?: boolean, verbose?: boolean }): string {
  const fileRisks = getFileRisks(data);
  const lineStats = data.lineStats || {};
  const { topFile, returnTypeChanges, missingTests, filesWithMultiImports, totalFiles } = extractSummary(fileRisks, lineStats);
  
  // Calculate final scores including Large Change factor for sorting
  const finalScores = Object.entries(fileRisks).map(([file, { total, risks }]) => {
    const stats = lineStats[file] || { added: 0, removed: 0, totalLines: 0 };
    const totalChanged = stats.added + stats.removed;
    const percentageChanged = stats.totalLines > 0 ? (totalChanged / stats.totalLines) * 100 : 0;
    
    let finalScore = total;
    if (percentageChanged > 20) { // LARGE_CHANGE_PERCENTAGE_THRESHOLD
      finalScore += 7; // riskWeights[RiskFactorType.LargeChange]
    }
    
    return { file, finalScore, total, risks };
  });
  
  // Sort by final score (highest first)
  finalScores.sort((a, b) => b.finalScore - a.finalScore);
  
  const averageRisk = data.totalRiskScore / totalFiles;
  const LARGE_CHANGE_PERCENTAGE_THRESHOLD = 20; // 20% of file changed

  let output = `# 🚨 RISK ANALYSIS REPORT\n\n`;
  const totalSkipped = Object.values(data.breakingChanges.skippedFiles).flat().length;
  if (options?.verbose) {
    output += `Git found ${totalFiles + totalSkipped} files. ${totalFiles} were analyzed. ${data.breakingChanges.skippedFiles.unsupported.length} unsupported file extensions, 
    ${data.breakingChanges.skippedFiles.failed.length} failed, ${data.breakingChanges.skippedFiles.empty.length} empty, and ${data.breakingChanges.skippedFiles.tests.length} tests were skipped\n\n`;
  } else {
    output += `Git found ${totalFiles + totalSkipped} files, including metadata, ghost changes, tests, and unsupported file extensions. ${totalFiles} were analyzed\n\n`;
  }

 
  output += `**Overall Risk Score:** ${data.totalRiskScore.toFixed(2)} — ${riskLevel(data.totalRiskScore, 'markdown')}\n`;
  output += `**Average Risk Score:** ${averageRisk.toFixed(2)} — ${riskLevel(averageRisk, 'markdown')}\n`;

  if (data.totalRiskScore >= 60 && averageRisk < 40) {
    output += `\n> ⚠️ *This PR touches many files with individually low-risk changes. The volume increases review complexity and regression risk.*\n`;
  }

  if (topFile) output += `\n🔥 **Highest risk file to review:** \`${topFile}\`\n`;
  output += `\n📊 **${totalFiles} files changed** · **${returnTypeChanges} with return type changes** · ${options?.tests ? "**" + missingTests + " with no test deltas ·**" : ""} · **${filesWithMultiImports.size} imported by multiple files**\n\n`;

  for (const { file, finalScore, total, risks } of finalScores) {
    const stats = lineStats[file] || { added: 0, removed: 0, totalLines: 0 };
    const totalChanged = stats.added + stats.removed;
    const percentageChanged = stats.totalLines > 0 ? (totalChanged / stats.totalLines) * 100 : 0;
    let fileRisksWithLarge = [...risks];
    if (percentageChanged > LARGE_CHANGE_PERCENTAGE_THRESHOLD) {
      fileRisksWithLarge = [
        ...fileRisksWithLarge,
        {
          subject: file,
          factor: RiskFactorType.LargeChange,
          points: riskWeights[RiskFactorType.LargeChange],
          explanation: `Large change: +${stats.added}/-${stats.removed} lines (${percentageChanged.toFixed(1)}% of file)`,
        },
      ];
    }
    output += `\n## ${file}\n`;
    output += `**Lines changed:** +${stats.added}/-${stats.removed} (${percentageChanged.toFixed(1)}% of ${stats.totalLines} lines)\n`;
    output += `**Total Score:** ${finalScore.toFixed(2)} — ${riskLevel(finalScore, 'markdown')}\n\n`;
    for (const risk of fileRisksWithLarge) {
      const importCount = Math.round(risk.points / riskWeights[RiskFactorType.ImportedInFiles]);
      let suggestion = '';

      if (risk.factor === RiskFactorType.ImportedInFiles && importCount >= 3) {
        suggestion = riskSuggestions[RiskFactorType.ImportedInFiles];
      } else if (risk.factor !== RiskFactorType.ImportedInFiles) {
        suggestion = riskSuggestions[risk.factor];
      }

      let explanation = risk.explanation;
      if (context?.repoUrl) {
        explanation = explanation.replace(
          /\b([\w./()\-]+\.(tsx?|jsx?|js))\b/g,
          (match) => {
            const branch = context.prBranch || 'main';
            const encodedPath = encodeGitHubFilePath(match);
            const safeLabel = escapeMarkdownLinkText(match);
            return `${safeLabel}`;
          }
        );
      }

      output += `- ${explanation} (${risk.points.toFixed(2)} pts)\n`;
      if (options?.suggestions && suggestion) {
        output += `  - ${suggestion}\n`;
      }
    }
  }

  output += `\n---\n_This report was generated by **Diffuse** (Open Source)_\n`;
  output += `_Got feedback? [I'd love to hear it](https://docs.google.com/forms/d/e/1FAIpQLScu4x26hKju8MhxG6dhSctWDuG7A3RT0DrckzyK0E_optgZmA/viewform?usp=header)_\n`;
  return output;
}

export function generateReport(data: any, context?: RenderContext, options?: { suggestions?: boolean }): string {
  return context?.repoUrl ? generateMarkdownReport(data, context, options) : generateTerminalReport(data, options);
}
