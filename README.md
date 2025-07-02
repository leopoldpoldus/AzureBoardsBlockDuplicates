# AzureBoardsBlockDuplicates
Azure Boards Extension which blocks duplicate work item creation
The extension now calculates similarity using semantic embeddings generated in
the browser via transformers.js. Cosine similarity on these embeddings replaces
the previously used Dice coefficient approach.

# Requirements
- VSCode https://code.visualstudio.com/
- TypeScript https://www.typescriptlang.org/
- NodeJS https://nodejs.org/en/
- Node CLI for Azure DevOps https://github.com/Microsoft/tfs-cli

# Building/Packaging the Extension
 1. git clone https://github.com/keyoke/AzureBoardsBlockDuplicates.git
 2. npm install
 3. npm run package
