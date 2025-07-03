import { spawnSync, execSync } from 'child_process';
import fs from 'fs';
import { FileChange } from '../setup/getChangedFilesWithStatus.js';

export interface GitOptions {
  baseRef?: string;
  encoding?: BufferEncoding;
  verbose?: boolean;
}

export interface GitFileContent {
  content: string;
  success: boolean;
  error?: string;
}

export class GitService {
  private baseRef: string;
  private encoding: BufferEncoding;
  private verbose: boolean;

  constructor(options: GitOptions = {}) {
    this.baseRef = options.baseRef || 'origin/main';
    this.encoding = options.encoding || 'utf8';
    this.verbose = options.verbose || false;
  }

 isFileTouchedInDiff(filePath: string, baseRef: string): boolean {
    const result = spawnSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], { encoding: 'utf8' });
    if (result.status !== 0) return false;
    return result.stdout.split('\n').includes(filePath);
  }
  

  /**
   * Get all changed files in the working tree (unstaged + untracked)
   */
  getWorkingTreeChangedFiles(): string[] {
    const changed = spawnSync("git", ["diff", "--name-only"], { 
      encoding: this.encoding 
    });
    const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { 
      encoding: this.encoding 
    });

    const all = `${changed.stdout}\n${untracked.stdout}`
      .split("\n")
      .map(f => f.trim())
      .filter(Boolean);
    
    return [...new Set(all)]; // dedupe
  }

  /**
   * Get changed files since a specific base branch/ref
   */
  getChangedFilesSinceBase(baseBranch?: string): string[] {
    const branch = baseBranch || this.baseRef;
    
    try {
      const cmd = `git diff --name-only ${branch}...HEAD`;
      const output = execSync(cmd, { encoding: this.encoding });
      const files = output.split('\n').filter(Boolean);
  
      return files;
    } catch (err) {
      if (this.verbose) console.error(`Error getting changed files since ${branch}:`, err);
      return [];
    }
  }

  /**
   * Get file content from a specific git reference
   */
  getFileFromGit(ref: string, filePath: string): GitFileContent {
    const args = ['show', `${ref}:${filePath}`];
    const result = spawnSync('git', args, { encoding: this.encoding });

    if (result.status !== 0) {
      return {
        content: "Skipped",
        success: false,
        error: result.stderr
      };
    }
    
    return {
      content: result.stdout,
      success: true
    };
  }

  /**
   * Get file content from the current working tree
   */
  getCurrentFileContent(filePath: string): GitFileContent {
    try {
      const content = fs.readFileSync(filePath, this.encoding);
      return {
        content,
        success: true
      };
    } catch (err) {
      return {
        content: "Skipped",
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Get changed files with their git status
   */
  getChangedFilesWithStatus(baseRef?: string): FileChange[] {
    const ref = baseRef || this.baseRef;
    
    // If no base ref is provided, use working tree changes instead of comparing to remote
    const diffArgs = baseRef 
      ? ['diff', '--name-status', `${ref}...HEAD`]
      : ['diff', '--name-status'];
    
    
    const diffResult = spawnSync('git', diffArgs, { 
      encoding: this.encoding 
    });
    
    
    if (diffResult.status !== 0) {
      if (this.verbose) console.error('Failed to get git diff:', diffResult.stderr);
      return [];
    }

    const changes: FileChange[] = diffResult.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('\t');
        const statusRaw = parts[0];

        if (statusRaw.startsWith('R')) {
          // Might be overengineered - was trying to solve a problem that didn't originate here
            const renamedFrom = parts[1];
            const renamedTo = parts[2];
          
            const fromExistsResult = spawnSync('git', ['cat-file', '-e', `${ref}:${renamedFrom}`], {
              encoding: this.encoding,
            });
            const fromExistsInBase = fromExistsResult.status === 0;
          
            const touchedInPR = this.isFileTouchedInDiff(renamedFrom, ref) || this.isFileTouchedInDiff(renamedTo, ref);
            if (!fromExistsInBase && !fs.existsSync(renamedTo)) {
              if (this.verbose) console.warn(`Skipping phantom rename: ${renamedFrom} ➝ ${renamedTo} (neither side exists)`);
              return null;
            }
          
            if (!touchedInPR) {
              if (this.verbose) console.warn(`Skipping rename not introduced in PR: ${renamedFrom} ➝ ${renamedTo}`);
              return null;
            }
          
            return {
              status: 'R' as const,
              renamedFrom,
              path: renamedTo,
            };
          }
          
          
          

        const validStatuses = ['A', 'D', 'M'] as const;
        if (validStatuses.includes(statusRaw as any)) {
          return {
            status: statusRaw as 'A' | 'D' | 'M',
            path: parts[1],
          } as FileChange;
        } else {
          if (this.verbose) console.warn(`Unknown status "${statusRaw}" for line: ${line}`);
          return null;
        }
      })
      .filter((fc): fc is FileChange => fc !== null);

    // Add untracked files
    const untrackedResult = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { 
      encoding: this.encoding 
    });
    
    if (untrackedResult.status !== 0) {
      if (this.verbose) console.error('Failed to get untracked files:', untrackedResult.stderr);
      return changes;
    }

    const untrackedFiles: FileChange[] = untrackedResult.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((file) => ({
        status: 'U' as const,
        path: file,
      }));

    const allChanges = [...changes, ...untrackedFiles];
    const unique = new Map<string, FileChange>();
    
    for (const change of allChanges) {
      unique.set(change.path, change); // later entries overwrite earlier
    }

    const result = Array.from(unique.values());
    return result;
  }

  /**
   * Check if a file exists in the current working tree
   */
  fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Get the current git branch name
   */
  getCurrentBranch(): string {
    try {
      const result = spawnSync('git', ['branch', '--show-current'], { 
        encoding: this.encoding 
      });
      return result.stdout.trim();
    } catch {
      return 'main';
    }
  }

  /**
   * Check if we're in a git repository
   */
  isGitRepository(): boolean {
    try {
      const result = spawnSync('git', ['rev-parse', '--git-dir'], { 
        encoding: this.encoding 
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Get the git root directory
   */
  getGitRoot(): string {
    try {
      const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { 
        encoding: this.encoding 
      });
      return result.stdout.trim();
    } catch (err) {
      throw new Error('Not in a git repository');
    }
  }

  /**
   * Get line stats (added/removed) for each file in the working tree or since a base ref
   */
  getLineStats(baseRef?: string): Record<string, { added: number, removed: number, totalLines: number }> {
    // If baseRef is provided, compare to that; otherwise, use working tree
    const diffArgs = baseRef
      ? ['diff', '--numstat', `${baseRef}...HEAD`]
      : ['diff', '--numstat'];
    const diffResult = spawnSync('git', diffArgs, { encoding: this.encoding });
    const stats: Record<string, { added: number, removed: number, totalLines: number }> = {};
    if (diffResult.status !== 0) return stats;
    const lines = diffResult.stdout.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const [added, removed, file] = line.split(/\s+/);
      if (file) {
        // Get total lines in the current file
        const wcResult = spawnSync('wc', ['-l', file], { encoding: this.encoding });
        const totalLines = wcResult.status === 0 
          ? parseInt(wcResult.stdout.trim().split(/\s+/)[0]) || 0
          : 0;
        stats[file] = {
          added: isNaN(Number(added)) ? 0 : Number(added),
          removed: isNaN(Number(removed)) ? 0 : Number(removed),
          totalLines,
        };
      }
    }
    return stats;
  }
} 