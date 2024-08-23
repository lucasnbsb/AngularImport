# Angular-Import 📦

## Features

Jump to the imports statement to add a new import in one input!

Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> on Windows and Linux or <kbd>Shift</kbd> + <kbd>Option</kbd> + <kbd>Y</kbd> on MacOs and land on the end of the imports statement

You can also add to the constructor of the corresponding component by pressing <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>

## Requirements

If your project does not use the default CLI formats for file names you will need to configure the extention to recognize your formats

## Extension Settings

- `angular-import.importStatementType`: Where to look for imports first, modules, standalone components or auto-mode, which checks for modules first and then components
- `angular-import.componentFormats`: Format to recognize the end of a component's name, defaults to the CLI format
- `angular-import.moduleFormats`: Format to recognize the end of a module's name, defaults to the CLI format
- `angular-import.fileTypeExtentions`: Pseudo extentions appended in a period-separated manner to the end of a file's name, defaults to the extentions used by the CLI
- `angular-import.openFileSideBySide`: Open the file side by side with the active editor when adding an import

## Release Notes

### 1.0.0

Initial release, supports adding to the imports statement on modules and standalone components

### 1.2.0

Adds auto mode, which looks for modules first and then standalone components, auto mode is now the default

### 1.3.0

Adds go to constructor, navigates to the corresponding component and sets the cursor at the end of the constructor's parameters
