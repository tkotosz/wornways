// The version shown under the name in the header, worked out once per build.
//
// - A release build shows its tag (v0.5.1): the Deploy workflow passes it in WORNWAYS_RELEASE.
// - Any other build shows the branch and the commit (main@6080656), with "-dirty" when the
//   checkout has changes not committed yet. A checkout of a bare commit, as CI makes, has no
//   branch: WORNWAYS_BRANCH names it then, or the commit is shown alone.
// - Without git (a copy of the files only), it is "unknown".

import { execFileSync } from 'node:child_process';

export function appVersion(): string {
  const release = process.env['WORNWAYS_RELEASE'];
  if (release) return release;

  const commit = git('rev-parse', '--short', 'HEAD');
  if (!commit) return 'unknown';
  const branch = process.env['WORNWAYS_BRANCH'] || git('branch', '--show-current');
  const dirty = git('status', '--porcelain') ? '-dirty' : '';
  return `${branch ? `${branch}@` : ''}${commit}${dirty}`;
}

/** The trimmed output of a git command, or an empty string when git fails. */
function git(...args: string[]): string {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}
