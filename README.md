# DocDrop

An [Obsidian](https://obsidian.md) plugin that converts documents, spreadsheets, images, and more to Markdown using Microsoft's [MarkItDown](https://github.com/microsoft/markitdown) CLI tool.

Right-click any supported file in your vault and have it converted to a clean Markdown file in seconds — entirely on your machine, no cloud required (unless you opt in to the advanced AI features).

**Supported formats:** PDF, Word (`.docx`), PowerPoint (`.pptx`), Excel (`.xlsx`), images (`.jpg`, `.png`, `.gif`, `.webp`, `.bmp`, `.tiff`), HTML, CSV, JSON, XML, EPUB, ZIP, and audio (`.mp3`, `.wav` — requires ffmpeg).

---

## Requirements

- **Obsidian** 1.0.0 or later (desktop only — this plugin uses Node.js `child_process` and cannot run on Obsidian Mobile)
- **Python 3.10+**
- **MarkItDown** CLI installed:

```bash
pip install markitdown
```

Verify installation:

```bash
markitdown --version
```

**Optional — for AI-powered OCR of scanned PDFs:**

```bash
pip install markitdown-ocr openai
```

---

## Installation

### From the Obsidian Community Plugin Browser (recommended)

1. Open Obsidian → **Settings** → **Community Plugins**
2. Disable Safe Mode if prompted
3. Click **Browse** and search for **DocDrop**
4. Click **Install**, then **Enable**

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/FlatulentFowl/docdrop/releases)
2. Copy them into your vault at:
   ```
   <your-vault>/.obsidian/plugins/docdrop/
   ```
3. Reload Obsidian and enable the plugin under **Settings → Community Plugins**

### Build from source

```bash
git clone https://github.com/FlatulentFowl/docdrop
cd docdrop
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugin folder as above.

---

## Usage

### Right-click menu

Right-click any supported file in the Obsidian file explorer and select **Convert to Markdown with DocDrop**. The converted `.md` file is saved in the same folder as the source file (or a custom folder — see Settings).

### Command palette

Open the command palette (`Cmd/Ctrl+P`) and run:

```
DocDrop: Convert active file to Markdown
```

This converts whichever supported file is currently open/active.

### Output file

The output file is named identically to the PDF but with a `.md` extension. If a file with that name already exists, you will be prompted to confirm before overwriting.

---

## Settings

Open **Settings → DocDrop** to configure the plugin.

### General

| Setting | Description |
|---|---|
| **Executable path** | Full path to the `markitdown` binary, or just `markitdown` if it is on your system PATH. Change this if you get a "command not found" error — set it to the full path, e.g. `/Library/Frameworks/Python.framework/Versions/3.12/bin/markitdown`. |
| **Output location** | Where converted Markdown files are saved. "Same folder as PDF" places the `.md` file next to the source PDF. "Custom folder" lets you specify any vault-relative folder (it must already exist). |

### Conversion options

| Setting | Description |
|---|---|
| **Keep images** | Embeds images from the PDF as base64 data directly in the Markdown file. This preserves visuals at the cost of a much larger output file. Leave off if you only need the text content. |
| **MIME type hint** | Tells MarkItDown what kind of file it is receiving (e.g. `application/pdf`). Almost never needed — MarkItDown detects the file type automatically. Only set this if conversion produces wrong results. |
| **Character encoding hint** | Tells MarkItDown what text encoding to use (e.g. `UTF-8`, `ISO-8859-1`). Leave blank unless converted text contains garbled or misread characters. |

### markitdown-ocr plugin (optional)

[markitdown-ocr](https://github.com/microsoft/markitdown) is a separately-installed plugin that adds AI-powered OCR — it uses a vision-capable language model (such as OpenAI GPT-4o) to read text from images inside PDFs. This is especially useful for scanned documents or PDFs that are essentially images of pages rather than text.

**Install the plugin first:**

```bash
pip install markitdown-ocr
```

| Setting | Description |
|---|---|
| **Enable markitdown-ocr** | Activates all installed MarkItDown plugins, including markitdown-ocr. Has no effect if the plugin is not installed. |
| **OpenAI API key** | Your secret key from OpenAI (or a compatible provider). Required for markitdown-ocr to call the vision model. Get one at [platform.openai.com](https://platform.openai.com) → API keys. Looks like `sk-proj-...`. |
| **AI model** | The vision model markitdown-ocr uses to read images. Must support image/vision input. Default: `gpt-4o`. Cheaper alternative: `gpt-4o-mini` (slightly less accurate). |
| **OpenAI API base URL** | Override the API server. Leave blank for the default OpenAI servers. Set this if you use Azure OpenAI (e.g. `https://your-resource.openai.azure.com/`) or a self-hosted compatible service. |

> **Cost note:** markitdown-ocr sends image data to OpenAI's API, which is billed per token/image. For large or image-heavy PDFs this can add up. Check [OpenAI pricing](https://openai.com/pricing) before enabling on many files.

### Azure Document Intelligence (optional)

[Azure AI Document Intelligence](https://azure.microsoft.com/en-us/products/ai-services/ai-document-intelligence) is a paid Microsoft Azure cloud service that uses AI to extract text from PDFs with significantly higher accuracy than offline conversion — especially for scanned documents, handwritten text, tables, and complex multi-column layouts.

Requires an active Microsoft Azure subscription with the Document Intelligence resource provisioned.

| Setting | Description |
|---|---|
| **Use Document Intelligence** | Send the PDF to Azure for conversion instead of processing it locally. Requires internet access and a paid Azure subscription. |
| **Endpoint URL** | The URL of your Azure Document Intelligence resource. Find it in the [Azure Portal](https://portal.azure.com): open your Document Intelligence resource → **Keys and Endpoint**. Looks like `https://your-resource-name.cognitiveservices.azure.com/`. |
| **API key** | The secret key that authenticates with Azure. Found in the same place: Azure Portal → your Document Intelligence resource → **Keys and Endpoint** → **KEY 1** or **KEY 2**. Either key works. |

> **Cost note:** Azure Document Intelligence bills per page processed. Review [Azure pricing](https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/) before use.

---

## Troubleshooting

**"ENOENT" or "command not found" error**
MarkItDown cannot be found. Obsidian's process does not inherit your shell PATH. Solutions:
- Set **Executable path** in plugin settings to the full absolute path, e.g.:
  `/Library/Frameworks/Python.framework/Versions/3.12/bin/markitdown`
- Find the path by running `which markitdown` in your terminal.

**Converted file has garbled characters**
Try setting the **Character encoding hint** to `UTF-8` in settings.

**Scanned PDF produces no text (or very little)**
The PDF contains images of pages rather than real text. Enable **markitdown-ocr** (with a valid OpenAI API key) or **Azure Document Intelligence** for AI-powered OCR.

**Azure Document Intelligence returns 401 Unauthorized**
Your API key is incorrect or has been regenerated. Copy a fresh key from the Azure Portal → your Document Intelligence resource → Keys and Endpoint.

---

## Privacy & data

- **Default (offline) conversion:** All processing happens locally on your machine. No data leaves your computer.
- **markitdown-ocr:** PDF image data is sent to OpenAI's API (or your configured base URL). Governed by [OpenAI's privacy policy](https://openai.com/policies/privacy-policy).
- **Azure Document Intelligence:** PDF data is sent to Microsoft Azure. Governed by [Microsoft's privacy policy](https://privacy.microsoft.com) and your Azure service agreement.
- **API keys** are stored in your vault at `.obsidian/plugins/docdrop/data.json`. Do not commit this file to a public repository.

---

## Credits

This plugin would not be possible without:

- **[MarkItDown](https://github.com/microsoft/markitdown)** by [Microsoft](https://github.com/microsoft) — the core CLI tool that powers all PDF-to-Markdown conversion. Created by Adam Fourney and the Microsoft AutoGen team. Licensed under the MIT License.

- **[markitdown-ocr](https://github.com/microsoft/markitdown)** by [Microsoft](https://github.com/microsoft) — the optional OCR plugin for AI-powered image text extraction. Licensed under the MIT License.

- **[Obsidian](https://obsidian.md)** by Obsidian — the extensible knowledge base application this plugin is built for.

- **[Azure AI Document Intelligence](https://azure.microsoft.com/en-us/products/ai-services/ai-document-intelligence)** by Microsoft — the optional cloud AI service for high-accuracy document processing.

- **[OpenAI](https://openai.com)** — the AI platform used by markitdown-ocr for vision-based OCR.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

This plugin is not affiliated with, endorsed by, or officially supported by Microsoft, Obsidian, or OpenAI.
