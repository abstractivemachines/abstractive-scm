import * as vscode from 'vscode';

const storageKey = 'abstractiveScm.changelists';
export const defaultChangelistName = 'Default';

interface ChangelistState {
  names: string[];
  assignments: Record<string, string>;
  userCreated: string[];
}

export class ChangelistManager {
  constructor(private readonly memento: vscode.Memento) {}

  get names(): string[] {
    return this.read().names;
  }

  get userCreatedNames(): string[] {
    return this.read().userCreated;
  }

  changelistFor(filePath: string): string {
    const state = this.read();
    const assigned = state.assignments[filePath];
    return assigned && state.names.includes(assigned) ? assigned : defaultChangelistName;
  }

  async create(name: string): Promise<void> {
    const state = this.read();
    if (state.names.includes(name)) {
      return;
    }

    state.names.push(name);
    state.userCreated.push(name);
    await this.write(state);
  }

  async delete(name: string): Promise<void> {
    if (name === defaultChangelistName) {
      return;
    }

    const state = this.read();
    state.names = state.names.filter((item) => item !== name);
    state.userCreated = state.userCreated.filter((item) => item !== name);
    for (const [filePath, assigned] of Object.entries(state.assignments)) {
      if (assigned === name) {
        delete state.assignments[filePath];
      }
    }
    await this.write(state);
  }

  async assign(filePath: string, name: string): Promise<void> {
    const state = this.read();
    if (!state.names.includes(name)) {
      state.names.push(name);
    }

    if (name === defaultChangelistName) {
      delete state.assignments[filePath];
    } else {
      state.assignments[filePath] = name;
    }

    await this.write(state);
  }

  async cleanup(existingFilePaths: string[]): Promise<void> {
    const existing = new Set(existingFilePaths);
    const state = this.read();
    let changed = false;

    for (const filePath of Object.keys(state.assignments)) {
      if (!existing.has(filePath)) {
        delete state.assignments[filePath];
        changed = true;
      }
    }

    if (changed) {
      await this.write(state);
    }
  }

  private read(): ChangelistState {
    const stored = this.memento.get<ChangelistState>(storageKey);
    const names = Array.from(new Set([defaultChangelistName, ...(stored?.names ?? [])]));
    return {
      names,
      assignments: { ...(stored?.assignments ?? {}) },
      userCreated: (stored?.userCreated ?? []).filter((name) => name !== defaultChangelistName)
    };
  }

  private async write(state: ChangelistState): Promise<void> {
    const names = Array.from(new Set([defaultChangelistName, ...state.names.filter(Boolean)]));
    const userCreated = Array.from(new Set(state.userCreated.filter((name) => name && name !== defaultChangelistName)));
    await this.memento.update(storageKey, { names, assignments: state.assignments, userCreated });
  }
}
