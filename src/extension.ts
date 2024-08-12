import { format } from "path";
import path from "path";
import * as vscode from "vscode";

// Access the neecessary configuration
const config = vscode.workspace.getConfiguration("angular-import");
const importStatementType = config.get<string>("importStatementType")!;
const componentFormats = config.get<string[]>("componentFormats")!;
const moduleFormats = config.get<string[]>("moduleFormats")!;
let openSideBySide = config.get<boolean>("openFileSideBySide")!;

export function activate(context: vscode.ExtensionContext) {
  // Register the single command that we have
  const importCommand = vscode.commands.registerCommand(
    "angular-import.goToImportStatement",
    goToFileWithImportStatement
  );
}

export function deactivate() {}

async function goToFileWithImportStatement() {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  let currentFile = editor.document.fileName;
  let fileNameWithoutExtension = getFileNameWithoutExtension(currentFile);

  switch (importStatementType) {
    case "module":
      // traverse upwards looking for a module file and open it into the active editor.
      openCorrespondingFile(fileNameWithoutExtension, ...moduleFormats);
      break;
    case "component":
      // traverse upwards looking for a component file and open it into the active editor.
      break;
    default:
      break;
  }
}

/**
 * Relocates the cursor to the end of the last square bracket of
 * the imports array in the active file.
 */
async function goToImportStatement() {
  // Get the active text editor
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor found");
    return;
  }

  // Get the full text of the current file
  const currentFileCode = editor.document.getText();

  /** Matches the full multinile import statement capturing the content and the last square bracket */
  const importStetementRegex = /imports\s*:\s*\[([^\]]*)(\])/gm;
  const matchArray = importStetementRegex.exec(currentFileCode);

  // 0 for the full text, 1 for the imports content, 2 for the last square bracket
  const EXPECTED_MATCH_ARRAY_LENGTH = 3;
  // We either mathed the full import statement or there was no import statement
  if (matchArray?.length === EXPECTED_MATCH_ARRAY_LENGTH) {
    if (matchArray[1] === "") {
      // there is an import statement but no imports
      // figure out the index of the last ] and jump there
      const position = editor.document.positionAt(matchArray.index);
      const finalPosition = position.translate(0, matchArray[0].length - 1);
      editor.selection = new vscode.Selection(finalPosition, finalPosition);
      editor.revealRange(new vscode.Range(finalPosition, finalPosition));
    } else {
      // there is an import statement and imports
      const position = editor.document.positionAt(matchArray.index);
      const [offsetLines, offsetChars] = calcOffsetFromMatchToLastSquareBracket(
        matchArray[0]
      );
      const finalPosition = position.translate(offsetLines, offsetChars);
      editor.selection = new vscode.Selection(finalPosition, finalPosition);
      editor.revealRange(new vscode.Range(finalPosition, finalPosition));
    }
  } else {
    vscode.window.showInformationMessage("No import statement found");
  }
}

/**
 * Calculates the offset from the match to the last square bracket
 * @param fullMatch The full match of the import statement
 * @returns The offset in lines and characters
 */
function calcOffsetFromMatchToLastSquareBracket(
  fullMatch: string
): [number, number] {
  // find how many lines we need to jump by splitting on newlines.
  // This is slower than other ways of counting but we actually use the array
  const lineSplitMatch = fullMatch.split("\n");
  const offsetLines = lineSplitMatch.length - 1;
  // the last square bracket has to be in the last line of the match
  const lastLine = lineSplitMatch[lineSplitMatch.length - 1];
  // just get the offset of the last square bracket
  const offsetChars = lastLine.indexOf("]") - 2;
  return [offsetLines, offsetChars];
}

/** Shoutout angular2-switcher for the following functions*/
export function getFileNameWithoutExtension(path: string) {
  // Remove the file extension
  let parts = path.split(".");
  parts.pop();
  if (parts.length > 1) {
    if (parts[parts.length - 1] === "spec") {
      parts.pop();
    }
    if (parts[parts.length - 1] === "ng") {
      parts.pop();
    }
  }
  return parts.join(".");
}

async function openCorrespondingFile(
  fileNameWithoutExtension: string,
  ...formats: string[]
) {
  var editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  for (let index = 0; index < formats.length; index++) {
    const fileName = `${fileNameWithoutExtension}${formats[index]}`;
    const textEditor = vscode.window.visibleTextEditors.find(
      (textDocument) => textDocument.document.fileName === fileName
    );
    var succ = await openFile(fileName);
    if (succ) {
      break;
    }
  }
}

function fileIsComponent(filePath: string): boolean {
  return fileIs(filePath, ...componentFormats);
}

function fileIsModule(filePath: string): boolean {
  return fileIs(filePath, ...moduleFormats);
}

function fileIs(path: string, ...items: string[]): boolean {
  if (items) {
    for (var index = 0; index < items.length; index++) {
      if (path.endsWith(items[index].toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

async function openFile(fileName: string): Promise<boolean> {
  var editor = vscode.window.activeTextEditor;
  if (!editor) {
    return false;
  }

  try {
    let doc = await vscode.workspace.openTextDocument(fileName);
    if (doc) {
      await vscode.window.showTextDocument(
        doc,
        openSideBySide ? vscode.ViewColumn.Two : editor.viewColumn
      );
    }
    return true;
  } catch (error) {
    return false;
  }
}

async function getFilesInDirectoryOfActiveEditor() {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  let currentFile = editor.document.fileName;
  let fileNameWithoutExtension = getFileNameWithoutExtension(currentFile);

  //   get all files in the current directory
  const uri = vscode.Uri.file(currentFile);
  if (!uri) {
    return;
  }

  const currentFilesDirectory = path.dirname(uri.path);

  const filesInDirectory = await vscode.workspace.fs.readDirectory(
    vscode.Uri.parse(currentFilesDirectory)
  );
}
