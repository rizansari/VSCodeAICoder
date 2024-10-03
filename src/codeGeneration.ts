import * as vscode from 'vscode';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import axios from 'axios';
import { extractCodeBlocks, mergeCode } from './utils';
import path = require('path');
import { DiffInfo } from './types';
import { addDiff, diffExists, resetCurrentDiffIndex, resetDiffs, showCurrentDiff } from './diffViewer';
import { ExtensionContext } from './extensionContext';

type ConversationMessage =
    | { role: 'system' | 'user' | 'assistant'; content: string }
    | { role: 'function'; content: string; name: string };

let conversationHistory: ConversationMessage[] = [];

export async function generateCode(prompt: string, files: string[], webviewView: vscode.WebviewView, includeHistory: boolean) {

    const context = ExtensionContext.getInstance().getContext();

    const config = vscode.workspace.getConfiguration('ai-coder');
    const provider = config.get('provider') as string;
    let apiKey = config.get(`${provider}ApiKey`) as string;
    const model = config.get(`${provider}Model`) as string;
    const maxTokens = config.get('maxTokens') as number;
    const customBackend = config.get('customBackend') as string;
    const isOpenDiffView = config.get('openDiffView') as boolean;
    const isDiffViewAutoMerge = config.get('diffViewAutoMerge') as boolean;
    const isAutoSaveGeneratedCode = config.get('autoSaveGeneratedCode') as boolean;
    const saveGeneratedCodePath = config.get('saveGeneratedCodePath') as string;

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



        if (isAutoSaveGeneratedCode) {
            // get workspace path
            const workspaceFolders = vscode.workspace.workspaceFolders;
            let workspacePath = '';
            if (workspaceFolders) {
                workspacePath = workspaceFolders[0].uri.fsPath;
            } else {
                // default to home directory
                workspacePath = require('os').homedir();
            }
            
            // save the generated code to a file
            const savePath = path.join(workspacePath, saveGeneratedCodePath, `generated-code-${Date.now()}.md`);

            // create the directory if it doesn't exist
            await fs.promises.mkdir(path.dirname(savePath), { recursive: true });

            await fs.promises.writeFile
                (savePath, fullResponseEx);
            vscode.window.showInformationMessage(`Generated code saved to ${savePath}`);

            // open the saved file
            const doc = await vscode.workspace.openTextDocument(savePath);
            await vscode.window.showTextDocument(doc);
        } else {
            // open new untitled document with the generated code
            const doc = await vscode.workspace.openTextDocument({
                content: fullResponseEx, language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        }

        if (isOpenDiffView) {
            const codeBlocks = extractCodeBlocks(fullResponse, files);

            resetDiffs();

            for (const file of files) {
                const originalUri = vscode.Uri.file(file);
                const fileName = path.basename(file);
                const scheme = `generated-${encodeURIComponent(fileName)}`;
                const generatedUri = vscode.Uri.parse(`${scheme}:${fileName}`);

                let mergedCode = '';

                if (isDiffViewAutoMerge) {
                    mergedCode = mergeCode(fs.readFileSync(file, 'utf8'), codeBlocks[file] || '');
                } else {
                    mergedCode = codeBlocks[file] || '';
                }

                addDiff({
                    originalUri,
                    generatedUri,
                    fileName,
                    content: mergedCode || ''
                });


                // Register a TextDocumentContentProvider for the generated content
                context.subscriptions.push(
                    vscode.workspace.registerTextDocumentContentProvider(scheme, {
                        provideTextDocumentContent: () => mergedCode || ''
                    })
                );
            }

            if (diffExists()) {
                resetCurrentDiffIndex();
                showCurrentDiff();
            }
        }

    } catch (error: any) {
        vscode.window.showErrorMessage('Error generating code: ' + error.message);
    }
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