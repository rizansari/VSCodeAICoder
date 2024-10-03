(function () {
    const vscode = acquireVsCodeApi();


    document.addEventListener('DOMContentLoaded', (event) => {
        let selectedFiles = [];

        const codePrompt = document.getElementById('codePrompt');
        const generateBtn = document.getElementById('generateBtn');
        const clearBtn = document.getElementById('clearBtn');
        const selectFilesBtn = document.getElementById('selectFilesBtn');
        const selectedFilesDiv = document.getElementById('selectedFiles');
        const responsesContainer = document.getElementById('responsesContainer');

        const providerSpan = document.getElementById('provider');
        const modelSpan = document.getElementById('model');
        const maxTokensSpan = document.getElementById('maxTokens');

        const includeHistoryCheckbox = document.getElementById('includeHistory');

        generateBtn.addEventListener('click', () => {
            const prompt = codePrompt.value;
            const includeHistory = includeHistoryCheckbox.checked;
            if (prompt) {
                vscode.postMessage({
                    type: 'generateCode',
                    value: prompt,
                    files: selectedFiles,
                    includeHistory: includeHistory
                });
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

        document.getElementById('providerSelect').addEventListener('change', (event) => {
            vscode.postMessage({ type: 'changeProvider', value: event.target.value });
        });
        
        document.getElementById('modelSelect').addEventListener('change', (event) => {
            vscode.postMessage({ type: 'changeModel', value: event.target.value });
        });
        
        document.getElementById('maxTokensSelect').addEventListener('change', (event) => {
            vscode.postMessage({ type: 'changeMaxTokens', value: event.target.value });
        });

        // Initialize the selected files div with "No files selected" message
        updateSelectedFilesUI();

        function updateSelectedFilesUI() {
            selectedFilesDiv.innerHTML = '';
            if (selectedFiles.length > 0) {
                const filesList = document.createElement('ul');
                filesList.className = 'selected-files-list';
                selectedFiles.forEach((file, index) => {
                    const fileItem = document.createElement('li');
                    fileItem.className = 'selected-file-item';
                    fileItem.innerHTML = `
                        <span class="file-name">${file.split('/').pop()}</span>
                        <button class="remove-file" data-index="${index}" title="Remove file">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-x">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    `;
                    filesList.appendChild(fileItem);
                });
                selectedFilesDiv.appendChild(filesList);
            } else {
                selectedFilesDiv.innerHTML = '<p class="no-files">No files selected</p>';
            }

            // Add event listeners for remove buttons
            document.querySelectorAll('.remove-file').forEach(button => {
                button.addEventListener('click', (e) => {
                    const index = parseInt(e.target.closest('.remove-file').getAttribute('data-index'));
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

        // simple markdown parser
        function parseMarkdown(text) {
            const renderer = new marked.Renderer();
            return marked.parse(text, { renderer: renderer });
        }

        let currentProvider, currentModel, currentMaxTokens;

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
                        markdownElement.innerHTML = parseMarkdown(newContent);
                    }
                    break;
                case 'finalizeGeneratedCode':
                    const markdownElement2 = document.querySelector(`#response-${message.id} .markdown-body`);
                    if (markdownElement2) {
                        markdownElement2.innerHTML = '';
                    }
                    const rawCodeElement = document.querySelector(`#response-${message.id} .raw-code`);
                    if (rawCodeElement) {
                        rawCodeElement.innerHTML = parseMarkdown(message.value);
                    }
                    break;

                case 'filesSelected':
                    // Merge new files with existing ones, removing duplicates
                    selectedFiles = [...new Set([...selectedFiles, ...message.files])];
                    updateSelectedFilesUI();
                    break;

                case 'updateConfig':
                    currentProvider = message.provider;
                    currentModel = message[`${message.provider}Model`];
                    currentMaxTokens = message.maxTokens;

                    updateDropdown('providerSelect', message.providers, currentProvider);
                    updateDropdown('modelSelect', message[`${currentProvider}Models`], currentModel);
                    updateDropdown('maxTokensSelect', message.maxTokensOptions, currentMaxTokens);
                    break;
            }
        });

        function updateDropdown(id, options, currentValue) {
            const select = document.getElementById(id);
            select.innerHTML = '';
            options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option;
                optionElement.textContent = option;
                optionElement.selected = option === currentValue;
                select.appendChild(optionElement);
            });
        }
    });
}());