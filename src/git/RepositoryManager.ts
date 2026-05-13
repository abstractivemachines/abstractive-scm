import * as path from 'path';
import * as vscode from 'vscode';
import { GitService } from './GitService';

export interface RepositoryAware {
  repoRoot?: string;
}

export class RepositoryManager implements vscode.Disposable {
  private readonly onDidChangeActiveRepositoryEmitter = new vscode.EventEmitter<GitService>();
  readonly onDidChangeActiveRepository = this.onDidChangeActiveRepositoryEmitter.event;

  private activeRoot: string;

  private constructor(private readonly items: GitService[]) {
    this.activeRoot = items[0]?.root ?? '';
  }

  static async create(): Promise<RepositoryManager | undefined> {
    const repositories = await GitService.discoverAll();
    if (repositories.length === 0) {
      return undefined;
    }

    const manager = new RepositoryManager(repositories);
    const activeFile = vscode.window.activeTextEditor?.document.uri;
    const activeRepository = activeFile?.scheme === 'file' ? manager.repositoryForUri(activeFile) : undefined;
    if (activeRepository) {
      manager.activeRoot = activeRepository.root;
    }
    return manager;
  }

  get repositories(): GitService[] {
    return this.items;
  }

  get hasMultipleRepositories(): boolean {
    return this.items.length > 1;
  }

  get activeRepository(): GitService {
    return this.repositoryForRoot(this.activeRoot) ?? this.items[0];
  }

  repositoryForRoot(root: string | undefined): GitService | undefined {
    return root ? this.items.find((item) => item.root === root) : undefined;
  }

  repositoryForUri(uri: vscode.Uri | undefined): GitService | undefined {
    if (!uri || uri.scheme !== 'file') {
      return undefined;
    }

    return this.items
      .filter((repository) => isInside(repository.root, uri.fsPath))
      .sort((left, right) => right.root.length - left.root.length)[0];
  }

  repositoryForArgument(arg: unknown): GitService | undefined {
    if (!arg) {
      return undefined;
    }

    if (arg instanceof vscode.Uri) {
      return this.repositoryForUri(arg);
    }

    const candidate = arg as RepositoryAware & { change?: RepositoryAware; commit?: RepositoryAware; stash?: RepositoryAware };
    return this.repositoryForRoot(candidate.repoRoot)
      ?? this.repositoryForRoot(candidate.change?.repoRoot)
      ?? this.repositoryForRoot(candidate.commit?.repoRoot)
      ?? this.repositoryForRoot(candidate.stash?.repoRoot);
  }

  async resolveRepository(arg?: unknown): Promise<GitService> {
    const fromArgument = this.repositoryForArgument(arg);
    if (fromArgument) {
      this.setActiveRepository(fromArgument);
      return fromArgument;
    }

    const fromEditor = this.repositoryForUri(vscode.window.activeTextEditor?.document.uri);
    if (fromEditor) {
      this.setActiveRepository(fromEditor);
      return fromEditor;
    }

    if (!this.hasMultipleRepositories) {
      return this.activeRepository;
    }

    return await this.pickRepository() ?? this.activeRepository;
  }

  setActiveRepository(repository: GitService): void {
    if (this.activeRoot === repository.root) {
      return;
    }

    this.activeRoot = repository.root;
    this.onDidChangeActiveRepositoryEmitter.fire(repository);
  }

  async switchRepository(): Promise<GitService | undefined> {
    const picked = await this.pickRepository();
    if (picked) {
      this.setActiveRepository(picked);
    }
    return picked;
  }

  async pickRepository(): Promise<GitService | undefined> {
    if (!this.hasMultipleRepositories) {
      return this.activeRepository;
    }

    const pick = await vscode.window.showQuickPick(
      this.items.map((repository) => ({
        label: repository.root === this.activeRoot ? `$(check) ${path.basename(repository.root)}` : path.basename(repository.root),
        description: repository.root,
        repository
      })),
      { title: 'Abstractive SCM Repository', placeHolder: 'Select the Git repository to use' }
    );

    return pick?.repository;
  }

  dispose(): void {
    this.onDidChangeActiveRepositoryEmitter.dispose();
  }
}

function isInside(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

