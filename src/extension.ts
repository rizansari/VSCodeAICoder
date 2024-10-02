import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { activate as activateCommands } from './commands';
import { activate as activateDiffViewer } from './diffViewer';
import { ExtensionContext } from './extensionContext';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "ai-coder" is now active!');

    ExtensionContext.getInstance().setContext(context);

    const sidebarProvider = new SidebarProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("aiCodeGenerator", sidebarProvider)
    );

    activateCommands(context);
    activateDiffViewer(context);
}

export function deactivate() {}