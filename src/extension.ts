import { readFile } from "fs";
import * as vscode from "vscode";
import { CONSTRUCTOR_REGEX, IMPORT_STATEMENT_REGEX } from "./constants";
import { ImportStatement } from "./types";

// Access the neecessary configuration
let importStatementType: ImportStatement = "auto";
let componentFormats: string[];
let moduleFormats: string[];
let ignorableExtentions: string[];
let openSideBySide: boolean;

const uriSegmentsThatStopTheSearch = new Set([
  "features",
  "shared",
  "core",
  "app",
  "environments",
  "assets",
  "node_modules",
]);

// #region  Lifecycle methods
export function activate(context: vscode.ExtensionContext) {
  // Initializes the configuration variables, from this point onward the listener will keep them updated
  updateConfigurations();

  // Register the single command that we have
  const importCommand = vscode.commands.registerCommand(
    "angular-import.goToImportStatement",
    goToFileWithImportStatement
  );

  const componentImportCommand = vscode.commands.registerCommand(
    "angular-import.goToComponentImportStatement",
    goToComponentImportStatement
  );

  const moduleImportCommand = vscode.commands.registerCommand(
    "angular-import.goToModuleImportStatement",
    goToModuleImportStatement
  );

  const componentConstructorCommand = vscode.commands.registerCommand(
    "angular-import.goToConstructor",
    goToComponentConstructor
  );

  context.subscriptions.push(importCommand);
  context.subscriptions.push(componentImportCommand);
  context.subscriptions.push(moduleImportCommand);
  context.subscriptions.push(componentConstructorCommand);
}

export function deactivate() {
  configurationListener.dispose();
}
// #endregion

// #region Configuration-related methods
// Listens to configuration changes to update the configuration
const configurationListener = vscode.workspace.onDidChangeConfiguration(
  handleConfigurationChange
);

// Updates the configuration variables when the configuration for the extention changes
function handleConfigurationChange(
  event: vscode.ConfigurationChangeEvent
): void {
  if (event.affectsConfiguration("angular-import")) {
    updateConfigurations();
  }
}

// Fetches a snapshot of the configurations
function updateConfigurations() {
  const config = vscode.workspace.getConfiguration("angular-import");
  importStatementType =
    config.get<ImportStatement>("importStatementType") ?? "auto";
  componentFormats = config.get<string[]>("componentFormats")!;
  moduleFormats = config.get<string[]>("moduleFormats")!;
  ignorableExtentions = config.get<string[]>("fileTypeExtentions")!;
  openSideBySide = config.get<boolean>("openFileSideBySide")!;
}
// #endregion

// #region GOTO Methods
/** Finds the file that is supposed to have the imports statement, reads the configs to figure out if the project uses modules or standalone componets */
async function goToFileWithImportStatement() {
  switch (importStatementType) {
    case "module":
      await goToModuleImportStatement();
      break;
    case "component":
      await goToComponentImportStatement();
      break;
    case "auto":
      await goToImportAuto();
      break;
    default:
      break;
  }
}

// Look for the import statement in the module in the current directory
async function goToModuleImportStatement() {
  const editorInPlace = await tryToOpenRelatedFileByExtention(
    moduleFormats,
    fileIsModule,
    true
  );
  if (editorInPlace) {
    await goToLastCharacterInMatch(
      IMPORT_STATEMENT_REGEX,
      "]",
      "No module import statement found"
    );
  }
}

// Look for the import statement in the component in the current directory
async function goToComponentImportStatement() {
  const editorInPlace = await tryToOpenRelatedFileByExtention(
    componentFormats,
    fileIsComponent
  );
  if (editorInPlace) {
    await goToLastCharacterInMatch(
      IMPORT_STATEMENT_REGEX,
      "]",
      "No module import statement found"
    );
  }
}

// Automatically finds the import statement trying modules first then looking for standalone components upwards in the directory structure
async function goToImportAuto() {
  const searchResult = await lookForImportFiles();
  switch (searchResult) {
    case "module":
      await goToModuleImportStatement();
      break;
    case "component":
      await goToComponentImportStatement();
      break;
    case "failure":
      vscode.window.showInformationMessage(
        "No module or standalone component import statement found in the current directory or its parents."
      );
      break;
  }
}
// #endregion

// #region File searching
// Look for modules and standalone components in the active directory and upwards untill we find a stop segment or a file
async function lookForImportFiles(): Promise<
  "module" | "component" | "failure"
> {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "failure";
  }
  // Gets the full filename of the active editor
  let currentFilePath = editor.document.uri.path;
  let firstCheck = false;

  // Traverse upwards looking for a matching file in parent directories
  const segments = currentFilePath.split("/");
  while (
    segments.length > 0 &&
    !uriSegmentsThatStopTheSearch.has(segments[segments.length - 1])
  ) {
    segments.pop(); // Remove the last segment (the file name)
    // parent directory module is just a module with the same name as the parent directory
    const parentDirectory =
      segments.join("/") + "/" + segments[segments.length - 1];

    // If the current file is a component, check it before looking for modules, then go about your way.
    if (
      !firstCheck &&
      componentFormats.some((format) => currentFilePath.includes(format))
    ) {
      const firstCheckForStandalone =
        await isThereAStandaloneComponentInCurrentDirectory(
          parentDirectory,
          componentFormats
        );
      if (firstCheckForStandalone) {
        await openCorrespondingFile(parentDirectory, ...componentFormats);
        return "component";
      }
      firstCheck = true;
    }

    // Try to open the model file that matches the parent directory
    const openedFile = await openCorrespondingFile(
      parentDirectory,
      ...moduleFormats
    );
    if (openedFile) {
      return "module";
    }

    // If a model is not found, look for a standalone component with the same name
    // if a standalone component is found, open it and return true
    const standaloneComponentFound =
      await isThereAStandaloneComponentInCurrentDirectory(
        parentDirectory,
        componentFormats
      );
    if (standaloneComponentFound) {
      await openCorrespondingFile(parentDirectory, ...componentFormats);
      return "component";
    }
  }
  return "failure";
}

async function isThereAStandaloneComponentInCurrentDirectory(
  pathWithoutFormat: string,
  formats: string[]
): Promise<boolean> {
  var editor = vscode.window.activeTextEditor;
  if (!editor) {
    return false;
  }

  // Run through the formats checking if a file has the standalone decorator
  for (let index = 0; index < formats.length; index++) {
    const fileName = `${pathWithoutFormat}.${formats[index]}`;
    try {
      // Read the file content
      const fileContent = await new Promise<string>((resolve, reject) => {
        readFile(fileName, "utf8", (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });
      // Error reading the file, continue to the next format
      if (typeof fileContent !== "string") {
        continue;
      }
      // Check if the file contains the standalone decorator
      if (fileContent.includes("standalone: true")) {
        return true;
      }
    } catch (error) {
      // If the file does not exist, continue to the next format
      continue;
    }
  }
  return false;
}

// Returns true if the active editor ended up in a file with a matching extention
async function tryToOpenRelatedFileByExtention(
  extentions: string[],
  currentFileIsOfType: (path: string) => boolean,
  tryUpwardsDirectories = false
) {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  // Gets the full filename of the active editor
  let currentFilePath = editor.document.uri.path;
  let currentFile = editor.document.fileName;
  let fileNameWithoutExtension = getFileNameWithoutExtension(currentFile);

  if (!currentFileIsOfType(currentFilePath)) {
    const found = await openCorrespondingFile(
      fileNameWithoutExtension,
      ...extentions
    );

    // Traverse upwards looking for a matching file in parent directories
    if (!found && tryUpwardsDirectories) {
      // Try one level higher in the folder structure
      const segments = currentFilePath.split("/");
      while (
        segments.length > 0 &&
        !uriSegmentsThatStopTheSearch.has(segments[segments.length - 1])
      ) {
        segments.pop(); // Remove the last segment (the file name)
        // parent directory module is just a module with the same name as the parent directory
        const parentDirectory =
          segments.join("/") + "/" + segments[segments.length - 1];
        // Try to open the model file that matches the parent directory
        const openedFile = await openCorrespondingFile(
          parentDirectory,
          ...extentions
        );
        if (openedFile) {
          return true;
        }
      }
      return false;
    }
    return found;
  }
  return true;
}

/** Shoutout angular2-switcher for the following functions*/
function getFileNameWithoutExtension(path: string) {
  // get the path segments ( operates on normalized paths, no specific OS separators)
  let segments = path.split("/");
  // get the name of the file, with the extention
  let fileName = segments.pop();
  let fileNameParts = fileName?.split(".");
  // removes the file extention. and pseudoextentions, like .spec.ts.
  // It's better to do it this way to keep the extention working even on files with dots in the middle of the name
  if (fileNameParts) {
    fileNameParts?.pop();
    while (
      fileNameParts &&
      ignorableExtentions.includes(fileNameParts[fileNameParts?.length - 1])
    ) {
      fileNameParts?.pop();
    }
  }
  return segments.join("/") + "/" + fileNameParts?.join(".");
}
//#endregion

//#region Open file helpers
// Open a file that matches the given name and one of the given formats
// Returns true if a file was opened, false otherwise
async function openCorrespondingFile(
  fileNameWithoutExtension: string,
  ...formats: string[]
) {
  var editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  for (let index = 0; index < formats.length; index++) {
    const fileName = `${fileNameWithoutExtension}.${formats[index]}`;
    var succ = await openFile(fileName);
    if (succ) {
      return true;
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
    let doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(fileName)
    );
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
// #endregion

//#region In-file cursor navigation
async function goToComponentConstructor() {
  const editorInPlace = await tryToOpenRelatedFileByExtention(
    componentFormats,
    fileIsComponent
  );
  if (editorInPlace) {
    await goToLastCharacterInMatch(
      CONSTRUCTOR_REGEX,
      ")",
      "No constructor method found"
    );
  }
}

/**
 * Relocates the cursor to the end of the last square bracket of
 * the imports array in the active file.
 */
async function goToLastCharacterInMatch(
  regexToMatch: RegExp,
  charactrerToFind: string,
  notFoundMessage: string
) {
  // Get the active text editor
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor found");
    return;
  }

  // Get the full text of the current file
  const currentFileCode = editor.document.getText();

  /** Matches the full multinile import statement capturing the content and the last square bracket */
  const matchArray = regexToMatch.exec(currentFileCode);

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
      const [offsetLines, offsetChars] = calcOffsetFromMatchToLastOfCharacter(
        matchArray[0],
        position,
        charactrerToFind
      );
      const finalPosition = position.translate(offsetLines, offsetChars);
      editor.selection = new vscode.Selection(finalPosition, finalPosition);
      editor.revealRange(new vscode.Range(finalPosition, finalPosition));
    }
  } else {
    vscode.window.showInformationMessage(notFoundMessage);
  }
}

/**
 * Calculates the offset from the match to the last square bracket
 * @param fullMatch The full match of the import statement
 * @returns The offset in lines and characters
 */
function calcOffsetFromMatchToLastOfCharacter(
  fullMatch: string,
  position: vscode.Position,
  character: string
): [number, number] {
  // find how many lines we need to jump by splitting on newlines.
  // This is slower than other ways of counting but we actually use the array
  const lineSplitMatch = fullMatch.split("\n");
  const offsetLines = lineSplitMatch.length - 1;
  // the last square bracket has to be in the last line of the match
  const lastLine = lineSplitMatch[lineSplitMatch.length - 1];
  // just get the offset of the last square bracket
  let offsetChars = lastLine.indexOf(character);
  // For some reason if the last line is empty offset starts counting the newline and indentation
  if (offsetLines > 0) {
    offsetChars = offsetChars - position.character;
  }

  return [offsetLines, offsetChars];
}
//#endregion

// #region File type checkers
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
//#endregion
