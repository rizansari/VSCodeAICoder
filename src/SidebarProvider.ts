import * as vscode from "vscode";
import * as path from "path";

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;

    constructor(private readonly _extensionUri: vscode.Uri) { }

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

        // Listen for when the view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.updateConfigInfo(webviewView);
            }
        });

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(() => {
            this.updateConfigInfo(webviewView);
        });

        // Initial update of configuration info
        this.updateConfigInfo(webviewView);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            console.log('Received message from the webview:', data);
            switch (data.type) {
                case "generateCode": {
                    if (!data.value) {
                        return;
                    }
                    vscode.commands.executeCommand("ai-coder.generateCode", data.value, data.files, webviewView, data.includeHistory);
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
                case "changeProvider": {
                    await vscode.workspace.getConfiguration().update('ai-coder.provider', data.value, vscode.ConfigurationTarget.Global);
                    this.updateConfigInfo(webviewView);
                    break;
                }
                case "changeModel": {
                    const provider = vscode.workspace.getConfiguration().get('ai-coder.provider');
                    const setting = provider === 'openai' ? 'openaiModel' : provider === 'anthropic' ? 'anthropicModel' : 'deepseekModel';
                    await vscode.workspace.getConfiguration().update(setting, data.value, vscode.ConfigurationTarget.Global);
                    this.updateConfigInfo(webviewView);
                    break;
                }
                case "changeMaxTokens": {
                    await vscode.workspace.getConfiguration().update('ai-coder.maxTokens', parseInt(data.value), vscode.ConfigurationTarget.Global);
                    this.updateConfigInfo(webviewView);
                    break;
                }
                case "requestConfig": {
                    // Handle request for configuration data
                    this.updateConfigInfo(webviewView);
                    break;
                }
            }
        });
    }

    private async updateConfigInfo(webviewView: vscode.WebviewView) {
        const config = vscode.workspace.getConfiguration('ai-coder');
        const provider = config.get('provider');
        const openaiModel = config.get('openaiModel');
        const anthropicModel = config.get('anthropicModel');
        const deepseekModel = config.get('deepseekModel');
        const maxTokens = config.get('maxTokens');

        const defaultSettingsSchemaResource = vscode.Uri.parse('vscode://schemas/settings/default');
        const textDocument = await vscode.workspace.openTextDocument(defaultSettingsSchemaResource);
        const jsonObject = JSON.parse(textDocument.getText());

        const providers = jsonObject.properties['ai-coder.provider'].enum;
        const openaiModels = jsonObject.properties['ai-coder.openaiModel'].enum;
        const anthropicModels = jsonObject.properties['ai-coder.anthropicModel'].enum;
        const deepseekModels = jsonObject.properties['ai-coder.deepseekModel'].enum;
        const maxTokensOptions = jsonObject.properties['ai-coder.maxTokens'].enum;

        webviewView.webview.postMessage({
            type: 'updateConfig',
            provider,
            openaiModel,
            anthropicModel,
            deepseekModel,
            maxTokens,
            providers,
            openaiModels,
            anthropicModels,
            deepseekModels,
            maxTokensOptions
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
                <div id="configInfo">
                    <div class="config-item">
                        <label for="providerSelect">Provider:</label>
                        <select id="providerSelect"></select>
                    </div>
                    <div class="config-item">
                        <label for="modelSelect">Model:</label>
                        <select id="modelSelect"></select>
                    </div>
                    <div class="config-item">
                        <label for="maxTokensSelect">Max Tokens:</label>
                        <select id="maxTokensSelect"></select>
                    </div>
				</div>
				<textarea type="text" id="codePrompt" placeholder="Enter a description of the code you want to generate"></textarea>
                    <div class="button-container">
                        <div class="left-buttons">
                            <button id="clearBtn" class="icon-button" title="Clear">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                            </button>
                            <button id="selectFilesBtn" class="icon-button" title="Select Files">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                </svg>
                            </button>
                        </div>
                        <div class="right-buttons">
                            <button id="generateBtn" class="icon-button" title="Generate Code">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <polyline points="12 5 19 12 12 19"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
				<div id="selectedFiles"></div>
                <div class="historyToggle">
                    <label class="switch">
                        <input type="checkbox" id="includeHistory">
                        <span class="slider round"></span>
                    </label>
                    <span class="toggle-label">Include conversation history</span>
                </div>
                <div id="responsesContainer"></div>
                <script nonce="${nonce}">
                    // Request configuration data when the webview becomes visible
                    document.addEventListener('visibilitychange', function() {
                        if (!document.hidden) {
                            vscode.postMessage({ type: 'requestConfig' });
                        }
                    });
                </script>
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