(function () {
    const vscode = acquireVsCodeApi();
    let selectedFiles = [];

    document.addEventListener('DOMContentLoaded', (event) => {
        const codePrompt = document.getElementById('codePrompt');
        const generateBtn = document.getElementById('generateBtn');
        const clearBtn = document.getElementById('clearBtn');
        const selectFilesBtn = document.getElementById('selectFilesBtn');
        const selectedFilesDiv = document.getElementById('selectedFiles');
        const responsesContainer = document.getElementById('responsesContainer');

        const providerSpan = document.getElementById('provider');
        const modelSpan = document.getElementById('model');
        const maxTokensSpan = document.getElementById('maxTokens');

        generateBtn.addEventListener('click', () => {
            const prompt = codePrompt.value;
            if (prompt) {
                vscode.postMessage({ type: 'generateCode', value: prompt, files: selectedFiles });
                responsesContainer.style.display = 'block';
            }
        });

        clearBtn.addEventListener('click', () => {
            codePrompt.value = '';
            responsesContainer.innerHTML = '';
            selectedFiles = [];
            selectedFilesDiv.innerHTML = '';
        });

        selectFilesBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'selectFiles' });
        });

        function updateSelectedFilesUI() {
            selectedFilesDiv.innerHTML = '';
            selectedFiles.forEach((file, index) => {
                const fileElement = document.createElement('div');
                fileElement.className = 'selected-file';
                fileElement.innerHTML = `
                    <button class="remove-file" data-index="${index}">×</button>
                    <span>${file}</span>
                `;
                selectedFilesDiv.appendChild(fileElement);
            });

            // Add event listeners for remove buttons
            document.querySelectorAll('.remove-file').forEach(button => {
                button.addEventListener('click', (e) => {
                    const index = parseInt(e.target.getAttribute('data-index'));
                    selectedFiles.splice(index, 1);
                    updateSelectedFilesUI();
                });
            });
        }


        // Function to parse and format the raw text
        function parseAndFormatContent(rawText) {
            // Replace triple backticks with proper Markdown code blocks
            let formattedText = rawText.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
                return `\n\`\`\`${language || ''}\n${code.trim()}\n\`\`\`\n`;
            });

            // Replace numbered lists with proper Markdown lists
            formattedText = formattedText.replace(/^\d+\.\s/gm, '1. ');

            // Custom renderer to prevent treating '#' as a heading in code blocks
            const renderer = new marked.Renderer();
            const originalCodeRenderer = renderer.code.bind(renderer);
            renderer.code = (code, language) => {
                // Escape '#' at the start of lines in code blocks
                const escapedCode = code.replace(/^#/gm, '\\#');
                return originalCodeRenderer(escapedCode, language);
            };

            // Use the custom renderer when parsing the Markdown
            return marked.parse(formattedText, { renderer: renderer });
        }

        // Handle the message inside the webview
        window.addEventListener('message', event => {
            const message = event.data;
            console.log(message);
            switch (message.type) {
                case 'initializeResponse':
                    const responseDiv = document.createElement('div');
                    responseDiv.className = 'response-container';
                    responseDiv.id = `response-${message.id}`;
                    responseDiv.innerHTML = `
                        <h3>${message.prompt}</h3>
                        <div class="markdown-body"></div>
                        <div class="raw-code"></div>
                    `;
                    responsesContainer.insertBefore(responseDiv, responsesContainer.firstChild);
                    break;
                case 'updateGeneratedCode':
                    const markdownElement = document.querySelector(`#response-${message.id} .markdown-body`);
                    if (markdownElement) {
                        const currentContent = markdownElement.textContent || '';
                        const newContent = currentContent + message.value;
                        markdownElement.innerHTML = parseAndFormatContent(newContent);
                    }
                    break;
                case 'finalizeGeneratedCode':
                    const markdownElement2 = document.querySelector(`#response-${message.id} .markdown-body`);
                    if (markdownElement2) {
                        markdownElement2.innerHTML = '';
                    }
                    const rawCodeElement = document.querySelector(`#response-${message.id} .raw-code`);
                    if (rawCodeElement) {
                        rawCodeElement.innerHTML = parseAndFormatContent(message.value);
                    }
                    break;

                case 'filesSelected':
                    // Merge new files with existing ones, removing duplicates
                    selectedFiles = [...new Set([...selectedFiles, ...message.files])];
                    updateSelectedFilesUI();
                    break;

                case 'updateConfig':
                    providerSpan.textContent = `Provider: ${message.provider}`;
                    modelSpan.textContent = `Model: ${message.model}`;
                    maxTokensSpan.textContent = `Max Tokens: ${message.maxTokens}`;
                    break;
            }
        });
    });
}());