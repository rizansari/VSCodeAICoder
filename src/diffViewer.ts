import * as vscode from 'vscode';
import * as path from 'path';
import { DiffInfo } from './types';
import * as fs from 'fs';
import { ExtensionContext } from './extensionContext';

let currentDiffIndex = 0;
let diffs: DiffInfo[] = [];

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.acceptChanges', acceptChanges),
        vscode.commands.registerCommand('ai-coder.rejectChanges', rejectChanges)
    );
}

let acceptChangesItem: vscode.StatusBarItem;
let rejectChangesItem: vscode.StatusBarItem;

async function updateStatusBarItems() {
    const context = ExtensionContext.getInstance().getContext();
    
    if (!acceptChangesItem) {
        acceptChangesItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        acceptChangesItem.text = "$(check) Accept Changes";
        acceptChangesItem.command = 'ai-coder.acceptChanges';
        context.subscriptions.push(acceptChangesItem);
    }

    if (!rejectChangesItem) {
        rejectChangesItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        rejectChangesItem.text = "$(x) Reject Changes";
        rejectChangesItem.command = 'ai-coder.rejectChanges';
        context.subscriptions.push(rejectChangesItem);
    }

    if (currentDiffIndex < diffs.length) {
        acceptChangesItem.show();
        rejectChangesItem.show();
    } else {
        acceptChangesItem.hide();
        rejectChangesItem.hide();
    }
}

export async function showCurrentDiff() {
    if (currentDiffIndex >= 0 && currentDiffIndex < diffs.length) {
        const diff = diffs[currentDiffIndex];
        await vscode.commands.executeCommand('vscode.diff',
            diff.originalUri,
            diff.generatedUri,
            `${diff.fileName} (${currentDiffIndex + 1}/${diffs.length}) (Original ↔ Generated)`
        );
        updateStatusBarItems();
    } else {
        await closeAllDiffViews();
        vscode.window.showInformationMessage('All diffs have been reviewed.');
        diffs = [];
        currentDiffIndex = 0;
        updateStatusBarItems();
    }
}

export async function resetCurrentDiffIndex() {
    currentDiffIndex = 0;
}

export async function resetDiffs() {
    diffs = [];
}

export async function addDiff(diff: DiffInfo) {
    diffs.push(diff);
}

export function diffExists() {
    return diffs.length > 0;
}

async function moveToNextDiff() {
    currentDiffIndex++;
    await showCurrentDiff();
}

async function closeAllDiffViews() {
    const diffEditors = vscode.window.visibleTextEditors.filter(
        editor => editor.document.uri.scheme.startsWith('generated-')
    );

    for (const editor of diffEditors) {
        await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
}

async function acceptChanges() {
    if (currentDiffIndex >= 0 && currentDiffIndex < diffs.length) {
        const diff = diffs[currentDiffIndex];
        try {
            await fs.promises.writeFile(diff.originalUri.fsPath, diff.content, 'utf8');
            vscode.window.showInformationMessage(`Changes accepted and saved to ${diff.fileName}`);
            await moveToNextDiff();
        } catch (error) {
            vscode.window.showErrorMessage(`Error saving changes: ${error}`);
        }
    }
}

async function rejectChanges() {
    await moveToNextDiff();
}