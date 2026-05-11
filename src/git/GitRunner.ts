import { execFile } from 'child_process';

const gitExecutable = 'git';

export class GitError extends Error {
  constructor(message: string, readonly stderr = '') {
    super(message);
  }
}

export function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(gitExecutable, args, { cwd, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new GitError(stderr || error.message, stderr));
        return;
      }
      resolve(stdout);
    });
  });
}

export function runGitBuffer(cwd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(gitExecutable, args, { cwd, encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr);
        reject(new GitError(message || error.message, message));
        return;
      }
      resolve(stdout);
    });
  });
}
