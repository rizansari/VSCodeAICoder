import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { activate as activateCommands } from './commands';
import { activate as activateDiffViewer } from './diffViewer';
import { ExtensionContext } from './extensionContext';
import { MarkdownCodeLensProvider } from './markdownCodeLensProvider';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "ai-coder" is now active!');

    ExtensionContext.getInstance().setContext(context);

    const sidebarProvider = new SidebarProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("aiCodeGenerator", sidebarProvider)
    );

    activateCommands(context);
    activateDiffViewer(context);

    // Register Markdown CodeLens provider
    const markdownCodeLensProvider = new MarkdownCodeLensProvider();
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'markdown' }, markdownCodeLensProvider));

    // Register command to copy code block
    context.subscriptions.push(vscode.commands.registerCommand("markdown.copyCodeBlock", (code: string) => {
        vscode.env.clipboard.writeText(code).then(() => {
            vscode.window.showInformationMessage('Code block copied to clipboard!');
        });
    }));

    // Register command to open code block
    context.subscriptions.push(vscode.commands.registerCommand("markdown.openCodeBlock", (code: string) => {
        // create a new untitled file and open it without saving it and paste the code block content
        vscode.workspace.openTextDocument({ content: code }).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    }));
}

export function deactivate() {}