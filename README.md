<div align="center">

# PDFile

**Comprehensive PDF utility toolkit for document manipulation • CLI & Context Menu**

[![npm version](https://img.shields.io/npm/v/@spark-apps/pdfile?color=blue)](https://www.npmjs.com/package/@spark-apps/pdfile)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/muammar-yacoob?label=Sponsor&logo=github-sponsors&logoColor=white&color=pink)](https://github.com/sponsors/muammar-yacoob)
[![Report Bug](https://img.shields.io/badge/Report-Bug-red?logo=github&logoColor=white)](https://github.com/muammar-yacoob/PDFile/issues)

</div>

---

## Features & Tools

<table>
<thead>
<tr>
<th width="180">Feature</th>
<th>Description</th>
<th>Output</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Merge PDFs</strong></td>
<td>Combine multiple PDF files into a single document</td>
<td>Compressed PDF</td>
</tr>
<tr>
<td><strong>PDF to Word</strong></td>
<td>Convert PDF documents to editable Word (.docx) format</td>
<td>DOCX file</td>
</tr>
<tr>
<td><strong>Add Signature</strong></td>
<td>Add PNG signature with automatic background removal and feathering</td>
<td>Compressed PDF</td>
</tr>
<tr>
<td><strong>Insert Date</strong></td>
<td>Insert today's date in multiple formats (MM/DD/YYYY, YYYY-MM-DD, etc.)</td>
<td>Compressed PDF</td>
</tr>
<tr>
<td><strong>Add Image Overlay</strong></td>
<td>Add images as overlays (watermarks, logos, stamps) to PDFs</td>
<td>Compressed PDF</td>
</tr>
<tr>
<td><strong>Remove Pages</strong></td>
<td>Delete specific pages from a PDF document</td>
<td>Compressed PDF</td>
</tr>
<tr>
<td><strong>Reorder Pages</strong></td>
<td>Rearrange pages in any order or move pages up/down</td>
<td>Compressed PDF</td>
</tr>
</tbody>
</table>

**All PDF exports are automatically compressed for optimal file size.**

---

## Installation

### Desktop Version (Windows with WSL)

```bash
npm install -g @spark-apps/pdfile
pdfile install    # Add Windows context menu
```

**Requirements:**
- Windows with WSL (Windows Subsystem for Linux)
- Node.js >= 18
- ImageMagick (optional, for signature background removal): `sudo apt install imagemagick`

### Development (Local)

```bash
npm install
npm run build
npm link          # Make pdfile globally available
pdfile install    # Add Windows context menu
```

---

## Usage

### ⌨️ CLI Mode (Command Line)

#### Merge Multiple PDFs

```bash
# Merge two or more PDFs
pdfile merge file1.pdf file2.pdf file3.pdf

# Merge with custom output path
pdfile merge *.pdf -o combined.pdf

# Skip prompts with defaults
pdfile merge file1.pdf file2.pdf -y
```

#### Convert PDF to Word

```bash
# Convert PDF to Word document
pdfile to-word document.pdf

# Specify output path
pdfile to-word document.pdf -o output.docx

# Skip prompts
pdfile to-word document.pdf -y
```

#### Add Signature

```bash
# Add signature to PDF (automatically removes white background)
pdfile sign document.pdf signature.png

# Add signature with custom opacity
pdfile sign document.pdf signature.png --opacity 0.8

# Position signature at specific coordinates
pdfile sign document.pdf signature.png --x 50 --y 50

# Add to specific pages (default: last page only)
pdfile sign document.pdf signature.png -p "1,3,5"

# Skip background removal
pdfile sign document.pdf signature.png --no-remove-bg

# Customize background removal (fuzz tolerance and feathering)
pdfile sign document.pdf signature.png --fuzz 20 --feather 3
```

#### Insert Date

```bash
# Insert today's date (interactive format selection)
pdfile insert-date document.pdf

# Use specific date format
pdfile insert-date document.pdf -f "MM/DD/YYYY"
pdfile insert-date document.pdf -f "YYYY-MM-DD"
pdfile insert-date document.pdf -f "Month DD, YYYY"

# Position date at specific coordinates
pdfile insert-date document.pdf --x 50 --y 50

# Customize font size
pdfile insert-date document.pdf -s 14

# Add to specific pages
pdfile insert-date document.pdf -p "1,3,5"
```

#### Add Image Overlay

```bash
# Add logo to PDF (centered by default)
pdfile add-image document.pdf logo.png

# Add watermark with custom opacity
pdfile add-image document.pdf watermark.png --opacity 0.5

# Position image at specific coordinates
pdfile add-image document.pdf logo.png --x 50 --y 50 -w 100 -h 100

# Add image to specific pages only
pdfile add-image document.pdf logo.png -p "1,3,5"

# Specify output path
pdfile add-image document.pdf logo.png -o output.pdf
```

#### Remove Pages

```bash
# Remove specific pages (interactive)
pdfile remove-pages document.pdf

# Remove pages 1, 3, and 5
pdfile remove-pages document.pdf -p "1,3,5"

# With custom output path
pdfile remove-pages document.pdf -p "1,3,5" -o cleaned.pdf
```

#### Reorder Pages

```bash
# Reorder pages (interactive)
pdfile reorder document.pdf

# Specify new order (e.g., move page 3 to front)
pdfile reorder document.pdf -n "3,1,2"

# Move a specific page up or down
pdfile move-page document.pdf 2 up
pdfile move-page document.pdf 5 down
```

### 🖱️ GUI Mode (Right-Click Integration)

Right-click any PDF file in Windows Explorer to access PDFile tools:

```bash
# Re-register context menu entries
pdfile install

# Remove context menu entries
pdfile uninstall
```

### Registry Management

```bash
# Uninstall completely
npm uninstall -g @spark-apps/pdfile
```

---

## Examples

```bash
# Merge all PDFs in a directory
pdfile merge *.pdf -o combined_document.pdf

# Convert resume to Word for editing
pdfile to-word resume.pdf

# Sign a contract with your signature
pdfile sign contract.pdf my_signature.png

# Add today's date to invoice
pdfile insert-date invoice.pdf -f "Month DD, YYYY"

# Add company logo watermark to all pages
pdfile add-image contract.pdf logo.png --opacity 0.3

# Remove cover page and last 2 pages
pdfile remove-pages document.pdf -p "1,48,49"

# Rearrange presentation slides
pdfile reorder slides.pdf -n "1,3,2,5,4,6"

# Move the conclusion page to page 2
pdfile move-page report.pdf 10 up
```

---

## Technical Details

### PDF Compression

All exported PDFs use object stream compression (`useObjectStreams: true`) for optimal file sizes without quality loss.

### Supported Image Formats

For image overlays:
- PNG (with transparency support)
- JPG/JPEG

### Libraries Used

Built on industry-standard libraries:
- **[pdf-lib](https://pdf-lib.js.org/)** - PDF creation and manipulation
- **[pdf-parse](https://www.npmjs.com/package/pdf-parse)** - PDF text extraction
- **[docx](https://docx.js.org/)** - Word document generation

---

## Support & Contributions

⭐ Star the repo to support development!<br>
🤝 [Contributions](https://github.com/muammar-yacoob/PDFile/fork) are welcome.

---

<div align="center">
<sub>Released under <a href="./LICENSE">AGPL-3.0 License</a> | <a href="./PRIVACY.md">Privacy Policy</a> | Powered by <a href="https://pdf-lib.js.org/">pdf-lib</a></sub>
</div>
