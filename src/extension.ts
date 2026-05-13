import * as vscode from 'vscode';
import { AbstractiveScmController } from './activation/AbstractiveScmController';
import { registerNoRepositoryCommands, registerNoRepositoryViews } from './activation/commandRegistry';
import { RepositoryManager } from './git';

let controller: AbstractiveScmController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const repositories = await RepositoryManager.create();
  if (!repositories) {
    registerNoRepositoryCommands(context);
    registerNoRepositoryViews(context);
    return;
  }

  controller = new AbstractiveScmController(context, repositories);
  context.subscriptions.push(controller);
  await controller.refresh();
}

export function deactivate(): void {
  controller?.dispose();
}
