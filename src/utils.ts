import { DiffComputer, IDiffComputerOpts } from "vscode-diff";

export function extractCodeBlocks(fullResponse: string, files: string[]): { [filePath: string]: string } {
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

export function mergeCode(originalCode: string, generatedCode: string): string {
    const originalLines = originalCode.split('\n');
        const generatedLines = generatedCode.split('\n');
      
        const options: IDiffComputerOpts = {
          shouldComputeCharChanges: false,
          shouldPostProcessCharChanges: false,
          shouldIgnoreTrimWhitespace: false,
          shouldMakePrettyDiff: true,
          maxComputationTime: 0
        };
      
        const diffComputer = new DiffComputer(originalLines, generatedLines, options);
        const lineChanges = diffComputer.computeDiff().changes;
      
        const mergedLines: string[] = [];
        let originalIndex = 0;
      
        for (const change of lineChanges) {
          // Add unchanged lines from original
          while (originalIndex < change.originalStartLineNumber - 1) {
            mergedLines.push(originalLines[originalIndex]);
            originalIndex++;
          }
      
          if (change.originalEndLineNumber === 0) {
            // This is an insertion
            for (let i = change.modifiedStartLineNumber; i <= change.modifiedEndLineNumber; i++) {
              mergedLines.push(generatedLines[i - 1]);
            }
          } else if (change.modifiedEndLineNumber === 0) {
            // This is a deletion, keep it
            mergedLines.push(...originalLines.slice(change.originalStartLineNumber - 1, change.originalEndLineNumber));
            originalIndex = change.originalEndLineNumber;
          } else {
            // This is a modification, use generated lines
            for (let i = change.modifiedStartLineNumber; i <= change.modifiedEndLineNumber; i++) {
              mergedLines.push(generatedLines[i - 1]);
            }
            originalIndex = change.originalEndLineNumber;
          }
        }
      
        // Add any remaining unchanged lines from original
        while (originalIndex < originalLines.length) {
          mergedLines.push(originalLines[originalIndex]);
          originalIndex++;
        }
      
        return mergedLines.join('\n');
}