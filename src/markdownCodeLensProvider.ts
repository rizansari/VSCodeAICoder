import * as vscode from 'vscode';

export class MarkdownCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const regex = /```((?:(?!```)[\s\S])*?)```/g; // Regular expression to match code block content

        let match;
        while ((match = regex.exec(text)) !== null) {
            const startLine = document.positionAt(match.index).line;
            const range = new vscode.Range(startLine, 3, startLine, match[0].length - 3);

            codeLenses.push(new vscode.CodeLens(range, {
                title: "Copy Code Block",
                command: "markdown.copyCodeBlock",
                arguments: [match[1].trim().split('\n').slice(1).join('\n')], // Get the content inside the code block
            }));

            codeLenses.push(new vscode.CodeLens(range, {
                title: "Open Code Block",
                command: "markdown.openCodeBlock",
                arguments: [match[1].trim().split('\n').slice(1).join('\n')], // Get the content inside the code block
            }));
        }
        return codeLenses;
    }

    resolveCodeLens(codeLens: vscode.CodeLens): vscode.CodeLens {
        return codeLens;
    }
}