import * as vscode from 'vscode';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { SidebarProvider } from './SidebarProvider';

type ConversationMessage = 
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | { role: 'function'; content: string; name: string };

let conversationHistory: ConversationMessage[] = [];

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "ai-coder" is now active!');

    const sidebarProvider = new SidebarProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("aiCodeGenerator", sidebarProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.generateCode', async (prompt: string, files: string[], webviewView: vscode.WebviewView, includeHistory: boolean) => {
            console.log('Generating code for: ' + prompt);
            const config = vscode.workspace.getConfiguration('ai-coder');
            const provider = config.get('provider') as string;
            const apiKey = config.get(`${provider}ApiKey`) as string;
            const model = config.get(`${provider}Model`) as string;
            const maxTokens = config.get('maxTokens') as number;

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
                fullResponse = `PROMPT\n======\n${prompt}\n\nMODEL\n=====\n${model}\n\n\nRESPONSE\n========\n\n${fullResponse}`;

                // open new untitled document with the generated code
                const doc = await vscode.workspace.openTextDocument({
                    content: fullResponse, language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);

            } catch (error: any) {
                vscode.window.showErrorMessage('Error generating code: ' + error.message);
            }
        })
    );

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

export function deactivate() { }