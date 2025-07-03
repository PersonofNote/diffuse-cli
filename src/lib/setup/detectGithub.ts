import path from "path";

export interface RenderContext {
  repoUrl?: string;
  prBranch?: string;
  basePath?: string;
}

export function detectGithubContext(): RenderContext | undefined {
  const repo = process.env.GITHUB_REPOSITORY;
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const workspace = process.env.GITHUB_WORKSPACE;
  const refName = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;

  if (!repo || !workspace) return undefined;

  return {
    repoUrl: `${serverUrl}/${repo}`,
    prBranch: refName ?? 'main',
    basePath: workspace,
  };
}


export function formatImportList(dependents: string[], context?: RenderContext, verbose = true): string {
    const shortPaths = dependents.slice(0, 3).map(dep => {
      const relativePath = path.relative(context?.basePath ?? process.cwd(), dep);
      if (context?.repoUrl) {
        const branch = context.prBranch ?? 'main';
        return `[${relativePath}](${context.repoUrl}/blob/${branch}/${relativePath})`;
      }
      return relativePath;
    });
  
    const moreCount = dependents.length - shortPaths.length;
    return shortPaths.join(', ') + (moreCount > 0 ? `, and ${moreCount} more` : '');
  }
  
/*
  export function formatImportList(dependents: string[], context?: RenderContext, verbose = true): string {
    const unique = Array.from(new Set(dependents));
    
    if (!verbose) return `${unique.length} files`;
  
    const shortPaths = unique.slice(0, 3).map(dep => {
      const relativePath = path.relative(context?.basePath ?? process.cwd(), dep);
      if (context?.repoUrl) {
        const branch = context.prBranch ?? 'main';
        return `[${relativePath}](${context.repoUrl}/blob/${branch}/${relativePath})`;
      }
      return relativePath;
    });
  
    const moreCount = unique.length - shortPaths.length;
    return shortPaths.join(', ') + (moreCount > 0 ? `, and ${moreCount} more` : '');
  }
    */
  
  
