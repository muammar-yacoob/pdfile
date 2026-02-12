<div align="center">

<img src="https://raw.githubusercontent.com/muammar-yacoob/PDFile/main/src/imgs/pdfile-logo.png" alt="PDFile Logo" width="200"/>

### Comprehensive PDF Utility Toolkit for Windows

[![npm version](https://img.shields.io/npm/v/@spark-apps/pdfile?color=blue)](https://www.npmjs.com/package/@spark-apps/pdfile)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/muammar-yacoob?label=Sponsor&logo=github-sponsors&logoColor=white&color=pink)](https://github.com/sponsors/muammar-yacoob)
[![Buy Me Coffee](https://img.shields.io/badge/Buy%20Me%20Coffee-FFDD00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/spark88)
[![Report Bug](https://img.shields.io/badge/Report-Bug-red?logo=github&logoColor=white)](https://github.com/muammar-yacoob/PDFile/issues)
[![Downloads](https://img.shields.io/npm/dt/@spark-apps/pdfile?color=success)](https://www.npmjs.com/package/@spark-apps/pdfile)
[![GitHub Stars](https://img.shields.io/github/stars/muammar-yacoob/PDFile?style=social)](https://github.com/muammar-yacoob/PDFile)

</div>

---

## ✨ Features

* **Merge PDFs** - Combine multiple PDF files into one
* **PDF to Word** - Convert PDFs to editable .docx format
* **Add Signature** - Add PNG signatures with automatic background removal
* **Insert Date** - Add today's date in various formats
* **Remove Pages** - Delete specific pages from PDFs
* **Reorder Pages** - Rearrange or move pages up/down
* **Rotate Pages** - Rotate pages 90°, 180°, or 270°

*All PDF exports are automatically compressed for optimal file size.*

---

## 📥 Installation

```bash
npm install -g @spark-apps/pdfile
pdfile install    # Add Windows context menu
```

**Requirements:**
- Windows with WSL (Windows Subsystem for Linux)
- Node.js >= 18
- ImageMagick (optional, for signature background removal): `sudo apt install imagemagick`

---

## 📖 Usage

### CLI Commands

```bash
# Merge PDFs
pdfile merge file1.pdf file2.pdf -o output.pdf

# Convert to Word
pdfile to-word document.pdf

# Add signature (auto-removes background)
pdfile sign document.pdf signature.png

# Insert date
pdfile insert-date document.pdf -f "MM/DD/YYYY"

# Remove pages
pdfile remove-pages document.pdf -p "1,3,5"

# Reorder pages
pdfile reorder document.pdf -n "3,1,2"
pdfile move-page document.pdf 2 up

# Rotate pages
pdfile rotate document.pdf -r 90
```

### Windows Context Menu

Right-click any PDF in Windows Explorer to access tools via GUI:

```bash
pdfile install     # Enable context menu
pdfile uninstall   # Disable context menu
```

---

## 🔧 Technical Details

Built with [pdf-lib](https://pdf-lib.js.org/), [pdf-parse](https://www.npmjs.com/package/pdf-parse), and [docx](https://docx.js.org/). All PDFs are compressed with object streams for optimal file size.

---

## 🌱 Support & Contributions

⭐ Star the repo & I power up like Mario 🍄  
☕ Devs run on coffee  
🤝 Contributions are welcome

### 💖 Sponsor

If you find PDFile useful, please consider sponsoring the project! Your support helps maintain and improve the toolkit.

[![GitHub Sponsors](https://img.shields.io/github/sponsors/muammar-yacoob?label=Sponsor&logo=github-sponsors&logoColor=white&color=pink)](https://github.com/sponsors/muammar-yacoob)

---

<div align="center">

Released under [AGPL-3.0 License](./LICENSE) | [Privacy Policy](./PRIVACY.md)

</div>
