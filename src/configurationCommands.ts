import * as vscode from 'vscode';

export async function changeModel() {
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
}

export async function selectAnthropicModel() {
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
}

export async function selectOpenAIModel() {
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
}

export async function changeMaxTokens() {
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
}