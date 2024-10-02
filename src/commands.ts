import * as vscode from 'vscode';
import { generateCode } from './codeGeneration';
import { changeModel, selectAnthropicModel, selectOpenAIModel, changeMaxTokens } from './configurationCommands';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('ai-coder.generateCode', generateCode),
        vscode.commands.registerCommand('ai-coder.changeModel', changeModel),
        vscode.commands.registerCommand('ai-coder.selectAnthropicModel', selectAnthropicModel),
        vscode.commands.registerCommand('ai-coder.selectOpenAIModel', selectOpenAIModel),
        vscode.commands.registerCommand('ai-coder.changeMaxTokens', changeMaxTokens)
    );
}