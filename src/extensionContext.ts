import * as vscode from 'vscode';

export class ExtensionContext {
    private static instance: ExtensionContext;
    private _context: vscode.ExtensionContext | undefined;

    private constructor() {}

    public static getInstance(): ExtensionContext {
        if (!ExtensionContext.instance) {
            ExtensionContext.instance = new ExtensionContext();
        }
        return ExtensionContext.instance;
    }

    public setContext(context: vscode.ExtensionContext) {
        this._context = context;
    }

    public getContext(): vscode.ExtensionContext {
        if (!this._context) {
            throw new Error('Extension context not set');
        }
        return this._context;
    }
}