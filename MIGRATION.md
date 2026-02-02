# Migration from PicLet to PDFile

This document summarizes the conversion from PicLet (image processing tool) to PDFile (PDF utility tool).

## Changes Made

### Branding & Naming
- **Package name**: `@spark-apps/piclet` → `@spark-apps/pdfile`
- **Binary name**: `piclet` → `pdfile`
- **Application name**: PicLet → PDFile
- **Output directory**: `PicLet/` → `PDFile/`
- **Config directory**: `~/.config/piclet/` → `~/.config/pdfile/`

### File Extensions
- **Supported extensions**: `.png, .jpg, .gif, etc.` → `.pdf`
- All registry entries now target `.pdf` files only
- Legacy image extension entries are cleaned up during uninstall

### Features Replaced

#### Old Image Tools (Removed)
- Make Icon
- Remove Background
- Scale/Resize Image
- Icon Pack
- Store Pack
- Extract GIF Frames
- Image Filters
- Image Borders
- Recolor

#### New PDF Tools (Added)
- **Merge PDFs** - Combine multiple PDF files
- **PDF to Word** - Convert PDF to DOCX format
- **Add Image Overlay** - Watermarks, logos, stamps
- **Remove Pages** - Delete specific pages
- **Reorder Pages** - Rearrange or move pages up/down

### Technical Changes

#### Dependencies
- **Removed**: ImageMagick dependency
- **Added**:
  - `pdf-lib@1.17.1` - PDF manipulation
  - `pdf-parse@1.1.1` - PDF text extraction
  - `docx@9.0.1` - Word document generation

#### Configuration
```typescript
// Old PicLet Config
{
  removeBg: { fuzz, trim, preserveInner, makeSquare },
  rescale: { defaultScale, makeSquare },
  iconpack: { platforms }
}

// New PDFile Config
{
  compression: { enabled, quality },
  output: { useSubdirectory, subdirectoryName }
}
```

#### Registry Integration
- Registry path: `HKCU\...\shell\PicLet` → `HKCU\...\shell\PDFile`
- Context menu appears on `.pdf` files only
- Launcher VBS script updated to call `pdfile` instead of `piclet`
- Legacy cleanup removes old PicLet entries from image extensions

### Files Updated
- `package.json` - Dependencies, name, binary
- `README.md` - Complete rewrite for PDF tools
- `src/cli/index.ts` - Updated commands and help
- `src/cli/registry.ts` - Registry paths and extensions
- `src/cli/tools.ts` - Replaced tool definitions
- `src/cli/utils.ts` - Registry base path
- `src/lib/banner.ts` - Branding and colors
- `src/lib/config.ts` - Configuration structure
- `src/lib/paths.ts` - Output directory naming
- `src/launcher.vbs` - Command name
- `.releaserc` - Package name in release notes

### Files Created
- `src/tools/merge-pdfs.ts`
- `src/tools/pdf-to-word.ts`
- `src/tools/add-image-overlay.ts`
- `src/tools/remove-pages.ts`
- `src/tools/reorder-pages.ts`
- `src/tools/pdfile-main.ts`
- `src/cli/commands/merge-pdfs.ts`
- `src/cli/commands/pdf-to-word.ts`
- `src/cli/commands/add-image-overlay.ts`
- `src/cli/commands/remove-pages.ts`
- `src/cli/commands/reorder-pages.ts`

## Testing

All core features have been tested:
- ✅ CLI help displays correctly
- ✅ Install command shows PDFile branding
- ✅ Config command shows PDFile configuration
- ✅ Merge PDFs works
- ✅ Remove pages works
- ✅ Reorder pages works
- ✅ All exports use compression

## Usage

```bash
# Install
npm run build
npm install -g .

# Basic commands
pdfile merge file1.pdf file2.pdf
pdfile to-word document.pdf
pdfile add-image doc.pdf logo.png --opacity 0.5
pdfile remove-pages doc.pdf -p "1,3,5"
pdfile reorder doc.pdf -n "3,1,2"
pdfile move-page doc.pdf 2 up
```

## Legacy Cleanup

When users uninstall PDFile, it will automatically clean up:
- All `.pdf` file associations
- Old PicLet entries from image file extensions (`.png`, `.jpg`, `.gif`, etc.)
- All known legacy tool names from previous versions
