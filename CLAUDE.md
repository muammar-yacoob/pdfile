# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDFile is a comprehensive PDF utility toolkit that provides both CLI and GUI (Windows context menu) interfaces for PDF manipulation. It's designed to run on Windows with WSL (Windows Subsystem for Linux) and integrates with the Windows registry to provide right-click context menu functionality.

## Build & Development Commands

```bash
# Build the project
npm run build          # Compiles TypeScript to dist/, copies GUI assets, icons, and launcher.vbs

# Development mode (auto-rebuild on changes)
npm run dev            # tsup in watch mode

# Linting and formatting
npm run lint           # Check code with Biome
npm run lint:fix       # Auto-fix linting issues
npm run format         # Format code with Biome
npm run typecheck      # Run TypeScript type checking

# Local development installation
npm link               # Make pdfile globally available for testing
pdfile install         # Register Windows context menu entries
```

## Architecture Overview

### Dual-Mode System

PDFile operates in two distinct modes:

1. **CLI Mode**: Direct command-line tool execution (`pdfile merge`, `pdfile to-word`, etc.)
2. **GUI Mode**: Windows context menu integration that launches a browser-based GUI

### Key Components

#### 1. CLI Layer (`src/cli/`)
- **`cli.ts`**: Entry point with error handling
- **`index.ts`**: Command program setup, registers all commands
- **`commands/*.ts`**: Individual command implementations (merge, to-word, sign, etc.)
- **`tools.ts`**: Tool configuration registry
- **`utils.ts`**: CLI utilities
- **`registry.ts`**: Windows registry integration helpers

#### 2. Tool Implementation (`src/tools/`)
Contains the core PDF manipulation logic used by both CLI and GUI:
- **`merge-pdfs.ts`**: Combine multiple PDFs
- **`pdf-to-word.ts`**: Convert PDF to .docx
- **`add-signature.ts`**: Add PNG signature with background removal
- **`insert-date.ts`**: Insert formatted dates
- **`add-image-overlay.ts`**: Add watermarks/logos/stamps
- **`remove-pages.ts`**: Delete specific pages
- **`reorder-pages.ts`**: Rearrange page order
- **`pdfile-main.ts`**: Unified GUI tool that serves the web interface

#### 3. GUI Layer (`src/gui/`)
Browser-based interface served by Express:
- **`pdfile.html`**: Main GUI interface with accordion tools panel
- **`loading.hta`**: Windows HTA loading screen (displays while Node server starts)
- **`css/theme.css`**: Dark theme styling

#### 4. Library Layer (`src/lib/`)
- **`registry.ts`**: WSL/Windows registry interaction (path conversion, reg.exe commands)
- **`edge-launcher.ts`**: Launches Edge in app mode, signals HTA to close
- **`magick.ts`**: ImageMagick integration for signature background removal
- **`prompts.ts`**: Interactive CLI prompts
- **`paths.ts`**: Path resolution utilities
- **`config.ts`**: Configuration management
- **`banner.ts`**: CLI banner display

### Windows Integration Flow

When a user right-clicks a PDF file in Windows Explorer:

1. **Registry entry** triggers `launcher.vbs` (VBScript)
2. **VBScript** launches `loading.hta` (HTML Application) showing loading screen
3. **VBScript** starts Node.js via WSL: `wsl.exe pdfile gui <file>`
4. **Node server** (Express) starts on random port, serves GUI files
5. **`edge-launcher.ts`** opens Edge in app mode with server URL
6. **Edge opens**, signal file written to Windows temp directory
7. **HTA polls** temp file, closes itself when ready
8. **User interacts** with GUI in Edge app window

### WSL/Windows Bridge

The codebase handles bidirectional path conversion between WSL and Windows:
- **`wslToWindows()`**: Converts `/mnt/c/...` to `C:\...`
- **`windowsToWsl()`**: Converts `C:\...` to `/mnt/c/...`
- **Registry operations** use `reg.exe` through WSL interop
- **Temp file communication** via Windows %TEMP% directory

### PDF Processing Pattern

All PDF tools follow this pattern:

1. Load PDF with `PDFDocument.load()`
2. Perform manipulation (merge pages, add overlays, remove pages, etc.)
3. Save with compression: `pdf.save({ useObjectStreams: true })`
4. Output files use suffixes: `_merged`, `_signed`, `_dated`, `_overlay`, etc.

### Build Process (`tsup.config.ts`)

The build:
1. Compiles `src/cli.ts` to `dist/cli.js` (ESM)
2. Copies `src/icons/` → `dist/icons/` (for registry icon references)
3. Copies `src/gui/` → `dist/gui/` (HTML/CSS/images)
4. Copies `src/launcher.vbs` → `dist/launcher.vbs`
5. Adds shebang (`#!/usr/bin/env node`) to `dist/cli.js`

### Registry Structure

Context menu entries are created at:
```
HKEY_CLASSES_ROOT\.pdf\shell\PDFile\command
```

The command points to the launcher VBScript which handles GUI initialization.

## Important Patterns

### Error Handling in Registry Operations
Registry operations silently ignore WSL interop errors (when `reg.exe` can't run) to avoid spamming users with expected failures.

### Signature Background Removal
Uses ImageMagick with fuzz tolerance and feathering for clean signature edges. Falls back gracefully if ImageMagick is not installed.

### Express Server Lifecycle
The GUI server runs until the Edge window is closed (process exit). No explicit shutdown mechanism - relies on process cleanup.

### CLI Prompt System
Uses `prompts` library for interactive inputs (page selection, format selection, etc.). Supports `-y` flag to skip prompts with defaults.

## Platform Requirements

- **Windows** with WSL (Windows Subsystem for Linux)
- **Node.js** >= 18
- **ImageMagick** (optional, for signature background removal): `sudo apt install imagemagick`
- **WSL interop** enabled (ability to run `.exe` files from WSL)

## Testing Installation

After making changes:
```bash
npm run build
npm link              # Make available globally
pdfile install        # Re-register context menu
# Right-click a PDF in Windows Explorer to test GUI
# Or run CLI: pdfile merge test1.pdf test2.pdf
```
