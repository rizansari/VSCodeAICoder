import * as vscode from 'vscode';

export interface DiffInfo {
    originalUri: vscode.Uri;
    generatedUri: vscode.Uri;
    fileName: string;
    content: string;
}