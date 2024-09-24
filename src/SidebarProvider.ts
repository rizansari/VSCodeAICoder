import * as vscode from "vscode";
import * as path from "path";

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this._extensionUri.fsPath, 'media')),
                this._extensionUri,
            ],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            console.log('Received message from the webview:', data);
            switch (data.type) {
                case "generateCode": {
                    if (!data.value) {
                        return;
                    }
                    vscode.commands.executeCommand("ai-coder.generateCode", data.value, data.files, webviewView);
                    break;
                }
                case "selectFiles": {
                    const files = await vscode.window.showOpenDialog({
                        canSelectMany: true,
                        openLabel: 'Select Files',
                        filters: {
                            'All files': ['*']
                        }
                    });
                    if (files && files.length > 0) {
                        const fileNames = files.map(file => file.fsPath);
                        webviewView.webview.postMessage({ type: 'filesSelected', files: fileNames });
                    }
                    break;
                }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
        );
        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
        );
        const styleMarkdownUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "markdown.css")
        );

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
        );
        const markedUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "node_modules", "marked", "marked.min.js")
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMarkdownUri}" rel="stylesheet">
                <script nonce="${nonce}" src="${markedUri}"></script>
			</head>
			<body>
				<textarea type="text" id="codePrompt" placeholder="Enter a description of the code you want to generate"></textarea>
				<button id="selectFilesBtn">Select Files</button>
				<div id="selectedFiles"></div>
				<button id="generateBtn">Generate Code</button>
                <button id="clearBtn">Clear</button>
                <div id="responsesContainer"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}