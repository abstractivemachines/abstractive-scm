import * as vscode from 'vscode';
import { AbstractiveScmController } from './activation/AbstractiveScmController';
import { registerNoRepositoryCommands } from './activation/commandRegistry';
import { GitService } from './git';

let controller: AbstractiveScmController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const git = await GitService.discover();
  if (!git) {
    registerNoRepositoryCommands(context);
    return;
  }

  controller = new AbstractiveScmController(context, git);
  context.subscriptions.push(controller);
  await controller.refresh();
}

export function deactivate(): void {
  controller?.dispose();
}
