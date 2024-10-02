import * as vscode from 'vscode';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { SidebarProvider } from './SidebarProvider';
import path = require('path');
import axios from 'axios';

type ConversationMessage =
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | { role: 'function'; content: string; name: string };

let conversationHistory: ConversationMessage[] = [];

interface DiffInfo {
    originalUri: vscode.Uri;
    generatedUri: vscode.Uri;
    fileName: string;
    content: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "ai-coder" is now active!');

    const sidebarProvider = new SidebarProvider(context.extensionUri);

    let currentDiffIndex = 0;
    let diffs: DiffInfo[] = [];

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("aiCodeGenerator", sidebarProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.acceptChanges', async () => {
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
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.rejectChanges', async () => {
            await moveToNextDiff();
        })
    );

    async function showCurrentDiff() {
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
        }
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

    let acceptChangesItem: vscode.StatusBarItem;
    let rejectChangesItem: vscode.StatusBarItem;

    function updateStatusBarItems() {
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

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.generateCode', async (prompt: string, files: string[], webviewView: vscode.WebviewView, includeHistory: boolean) => {
            console.log('Generating code for: ' + prompt);
            const config = vscode.workspace.getConfiguration('ai-coder');
            const provider = config.get('provider') as string;
            let apiKey = config.get(`${provider}ApiKey`) as string;
            const model = config.get(`${provider}Model`) as string;
            const maxTokens = config.get('maxTokens') as number;
            const customBackend = config.get('customBackend') as string;
            let isCustom = false;

            if (customBackend && customBackend.trim() !== '') {
                isCustom = true;
                apiKey = config.get('customApiKey') as string;

                if (!apiKey || apiKey.trim() === '') {
                    vscode.window.showWarningMessage(`Please set your Custom API Key in the extension settings.`);
                    return;
                }
            } else {
                if (!apiKey || apiKey.trim() === '') {
                    vscode.window.showWarningMessage(`Please set your ${provider.toUpperCase()} API Key in the extension settings.`);
                    return;
                }
            }

            if (!apiKey || apiKey.trim() === '') {
                vscode.window.showWarningMessage(`Please set your ${provider.toUpperCase()} API Key in the extension settings.`);
                return;
            }

            if (!prompt || prompt.trim() === '') {
                vscode.window.showWarningMessage('Please provide a prompt to generate code.');
                return;
            }

            try {
                let fullResponse = '';
                const responseId = Date.now().toString();

                // Initialize the response container
                webviewView.webview.postMessage({
                    type: 'initializeResponse',
                    id: responseId,
                    prompt: prompt
                });

                let messages: ConversationMessage[];
                if (includeHistory) {
                    messages = [...conversationHistory, { role: 'user', content: prompt }];
                } else {
                    messages = [{ role: 'user', content: prompt }];
                }

                let fullPrompt;

                if (files.length > 0) {
                    // Read file contents
                    const fileContents = await Promise.all(files.map(async (file) => {
                        const content = await fs.promises.readFile(file, 'utf8');
                        return `File: ${file}\n\n${content}\n\n`;
                    }));

                    messages[messages.length - 1].content += `\n\nHere are the contents of the files:\n\n${fileContents.join('\n')}`;
                }

                if (isCustom) {
                    await generateWithAIProxy(apiKey, customBackend, provider, model, maxTokens, messages, responseId, webviewView, (text) => {
                        fullResponse += text;
                    });
                } else {
                    if (provider === 'anthropic') {
                        await generateWithAnthropic(apiKey, model, maxTokens, messages, responseId, webviewView, (text) => {
                            fullResponse += text;
                        });
                    } else if (provider === 'openai') {
                        await generateWithOpenAI(apiKey, model, maxTokens, messages, responseId, webviewView, (text) => {
                            fullResponse += text;
                        });
                    } else {
                        throw new Error('Unsupported provider');
                    }
                }

                // Send the final, complete response
                webviewView.webview.postMessage({
                    type: 'finalizeGeneratedCode',
                    id: responseId,
                    value: fullResponse
                });

                // Update conversation history
                conversationHistory.push({ role: 'user', content: prompt });
                conversationHistory.push({ role: 'assistant', content: fullResponse });

                // add prompt to the top of the response with new line markdown
                let fullResponseEx = `PROMPT\n======\n${prompt}\n\nMODEL\n=====\n${model}\n\n\nRESPONSE\n========\n\n${fullResponse}`;

                // open new untitled document with the generated code
                const doc = await vscode.workspace.openTextDocument({
                    content: fullResponseEx, language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);

                const codeBlocks = extractCodeBlocks(fullResponse, files);

                diffs = [];

                for (const file of files) {
                    const originalUri = vscode.Uri.file(file);
                    const fileName = path.basename(file);
                    const scheme = `generated-${encodeURIComponent(fileName)}`;
                    const generatedUri = vscode.Uri.parse(`${scheme}:${fileName}`);

                    diffs.push({
                        originalUri,
                        generatedUri,
                        fileName,
                        content: codeBlocks[file] || ''
                    });

                    // Register a TextDocumentContentProvider for the generated content
                    context.subscriptions.push(
                        vscode.workspace.registerTextDocumentContentProvider(scheme, {
                            provideTextDocumentContent: () => codeBlocks[file] || ''
                        })
                    );
                }

                if (diffs.length > 0) {
                    currentDiffIndex = 0;
                    showCurrentDiff();
                }

            } catch (error: any) {
                vscode.window.showErrorMessage('Error generating code: ' + error.message);
            }
        })
    );

    function extractCodeBlocks(fullResponse: string, files: string[]): { [filePath: string]: string } {
        const codeBlocks: { [filePath: string]: string } = {};

        // If there's only one file, assume the entire code block belongs to it
        if (files.length === 1) {
            const match = fullResponse.match(/```[\s\S]*?```/);
            if (match) {
                codeBlocks[files[0]] = match[0].replace(/```[\s\S]*?\n/, '').replace(/```$/, '').trim();
            }
            return codeBlocks;
        }

        // If there are multiple files, split the response by file markers
        const fileBlocks = fullResponse.split(/File: .+/);
        fileBlocks.shift(); // Remove the part before the first file marker

        files.forEach((file, index) => {
            if (index < fileBlocks.length) {
                const block = fileBlocks[index];
                const match = block.match(/```[\s\S]*?```/);
                if (match) {
                    codeBlocks[file] = match[0].replace(/```[\s\S]*?\n/, '').replace(/```$/, '').trim();
                }
            }
        });

        return codeBlocks;
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.changeModel', async () => {

            const defaultSettingsSchemaResource = vscode.Uri.parse('vscode://schemas/settings/default');
            const textDocument = await vscode.workspace.openTextDocument(defaultSettingsSchemaResource);
            const jsonObject = JSON.parse(textDocument.getText());

            const providers = jsonObject.properties['ai-coder.provider'].enum;
            const providerDescriptions = jsonObject.properties['ai-coder.provider'].enumDescriptions;


            const config = vscode.workspace.getConfiguration('ai-coder');


            // create model options
            const modelProviders = providers.map((model: string, index: number) => {
                return {
                    label: model,
                    description: providerDescriptions[index]
                };
            });

            const selectedProvider: any = await vscode.window.showQuickPick(modelProviders, {
                placeHolder: 'Select the AI provider to use',
            });


            if (selectedProvider) {
                await config.update('provider', selectedProvider.label, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Switched to the '${selectedProvider.label}' provider.`);
            }


        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.selectAnthropicModel', async () => {
            const defaultSettingsSchemaResource = vscode.Uri.parse('vscode://schemas/settings/default');
            const textDocument = await vscode.workspace.openTextDocument(defaultSettingsSchemaResource);
            const jsonObject = JSON.parse(textDocument.getText());

            const models = jsonObject.properties['ai-coder.anthropicModel'].enum;
            const modelDescriptions = jsonObject.properties['ai-coder.anthropicModel'].enumDescriptions;


            const config = vscode.workspace.getConfiguration('ai-coder');


            // create model options
            const modelOptions = models.map((model: string, index: number) => {
                return {
                    label: model,
                    description: modelDescriptions[index]
                };
            });

            const selectedModel: any = await vscode.window.showQuickPick(modelOptions, {
                placeHolder: 'Select the Anthropic model to use',
            });


            if (selectedModel) {
                await config.update('anthropicModel', selectedModel.label, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Switched to the '${selectedModel.label}' model.`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.selectOpenAIModel', async () => {
            const defaultSettingsSchemaResource = vscode.Uri.parse('vscode://schemas/settings/default');
            const textDocument = await vscode.workspace.openTextDocument(defaultSettingsSchemaResource);
            const jsonObject = JSON.parse(textDocument.getText());

            const models = jsonObject.properties['ai-coder.openaiModel'].enum;
            const modelDescriptions = jsonObject.properties['ai-coder.openaiModel'].enumDescriptions;


            const config = vscode.workspace.getConfiguration('ai-coder');


            // create model options
            const modelOptions = models.map((model: string, index: number) => {
                return {
                    label: model,
                    description: modelDescriptions[index]
                };
            });

            const selectedModel: any = await vscode.window.showQuickPick(modelOptions, {
                placeHolder: 'Select the OpenAI model to use',
            });


            if (selectedModel) {
                await config.update('openaiModel', selectedModel.label, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Switched to the '${selectedModel.label}' model.`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.changeMaxTokens', async () => {
            const defaultSettingsSchemaResource = vscode.Uri.parse('vscode://schemas/settings/default');
            const textDocument = await vscode.workspace.openTextDocument(defaultSettingsSchemaResource);
            const jsonObject = JSON.parse(textDocument.getText());

            const options = jsonObject.properties['ai-coder.maxTokens'].enum;
            const optionDescriptions = jsonObject.properties['ai-coder.maxTokens'].enumDescriptions;


            const config = vscode.workspace.getConfiguration('ai-coder');



            const showOptions = options.map((option: number, index: number) => {
                return {
                    label: option.toString(),
                    description: optionDescriptions[index]
                };
            });

            const selectedModel: any = await vscode.window.showQuickPick(showOptions, {
                placeHolder: 'Select the max tokens to use',
            });


            if (selectedModel) {
                await config.update('maxTokens', Number.parseInt(selectedModel.label), vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Switched to the '${selectedModel.label}' max tokens.`);
            }
        })
    );
}

async function generateWithAnthropic(
    apiKey: string,
    model: string,
    maxTokens: number,
    messages: ConversationMessage[],
    responseId: string,
    webviewView: vscode.WebviewView,
    onChunk: (text: string) => void
) {
    const client = new Anthropic({
        apiKey: apiKey
    });

    // Convert ConversationMessage[] to Anthropic's expected format
    const anthropicMessages = messages.map(msg => {
        if (msg.role === 'user' || msg.role === 'assistant') {
            return { role: msg.role, content: msg.content };
        } else {
            // For 'system' and 'function' roles, convert to 'user'
            return { role: 'user' as const, content: `[${msg.role.toUpperCase()}]: ${msg.content}` };
        }
    });

    const stream = await client.messages.stream({
        messages: anthropicMessages,
        model: model,
        max_tokens: maxTokens,
    }).on('text', (text) => {
        onChunk(text);
        webviewView.webview.postMessage({
            type: 'updateGeneratedCode',
            id: responseId,
            value: text
        });
    });

    await stream.finalMessage();
}

async function generateWithOpenAI(
    apiKey: string,
    model: string,
    maxTokens: number,
    messages: ConversationMessage[],
    responseId: string,
    webviewView: vscode.WebviewView,
    onChunk: (text: string) => void
) {
    const openai = new OpenAI({ apiKey });

    const openaiMessages = messages.map(msg => {
        if (msg.role === 'function') {
            return {
                role: msg.role,
                content: msg.content,
                name: msg.name
            };
        } else {
            return {
                role: msg.role,
                content: msg.content
            };
        }
    });

    const stream = await openai.chat.completions.create({
        model: model,
        messages: openaiMessages,
        max_tokens: maxTokens,
        stream: true,
    });

    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
            onChunk(content);
            webviewView.webview.postMessage({
                type: 'updateGeneratedCode',
                id: responseId,
                value: content
            });
        }
    }
}

async function generateWithAIProxy(
    apiKey: string,
    proxyUrl: string,
    provider: string,
    model: string,
    maxTokens: number,
    messages: ConversationMessage[],
    responseId: string,
    webviewView: vscode.WebviewView,
    onChunk: (text: string) => void
) {
    // const proxyUrl = 'http://localhost:3000/chat'; // Update this URL if your proxy is hosted elsewhere

    try {
        const response = await axios.post(proxyUrl, {
            apiKey,
            provider,
            model,
            maxTokens,
            messages
        }, {
            responseType: 'stream'
        });

        response.data.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf-8');
            onChunk(text);
            webviewView.webview.postMessage({
                type: 'updateGeneratedCode',
                id: responseId,
                value: text
            });
        });

        await new Promise((resolve, reject) => {
            response.data.on('end', resolve);
            response.data.on('error', reject);
        });

    } catch (error) {
        console.error('Error calling AI proxy:', error);
        throw error;
    }
}

export function deactivate() { }