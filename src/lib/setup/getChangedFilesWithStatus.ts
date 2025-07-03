import { spawnSync } from 'child_process';

type ChangeStatus = 'A' | 'D' | 'M' | 'R' | 'U'; // U = Untracked

export interface FileChange {
  path: string;
  status: ChangeStatus;
  renamedFrom?: string;
}

export function getChangedFilesWithStatus(baseRef = 'origin/main'): FileChange[] {

  const diffResult = spawnSync('git', ['diff', '--name-status', `${baseRef}...HEAD`], { encoding: 'utf8' });
  if (diffResult.status !== 0) {
    console.error('Failed to get git diff:', diffResult.stderr);
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
      return {
        status: 'R',
        renamedFrom: parts[1],
        path: parts[2],
      };
    }

    const validStatuses: ChangeStatus[] = ['A', 'D', 'M'];
    if (validStatuses.includes(statusRaw as ChangeStatus)) {
      return {
        status: statusRaw as ChangeStatus,
        path: parts[1],
      };
    } else {
      console.warn(`Unknown status "${statusRaw}" for line: ${line}`);
      return null;
    }
  })
  .filter((fc): fc is FileChange => fc !== null)


  const untrackedResult = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (untrackedResult.status !== 0) {
    console.error('Failed to get untracked files:', untrackedResult.stderr);
    return changes;
  }

  const untrackedFiles: FileChange[] = untrackedResult.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((file) => ({
      status: 'U' as ChangeStatus,
      path: file,
    }));

  const allChanges = [...changes, ...untrackedFiles];
  const unique = new Map<string, FileChange>();
  for (const change of allChanges) {
    unique.set(change.path, change); // later entries overwrite earlier
  }

  return Array.from(unique.values());
}
