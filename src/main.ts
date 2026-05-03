import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
} from "obsidian";
import { execFile } from "child_process";

// ─── Supported file types ────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set([
  "pdf",
  "docx", "doc",
  "pptx", "ppt",
  "xlsx", "xls",
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff",
  "html", "htm",
  "csv",
  "json",
  "xml",
  "epub",
  "zip",
  "mp3", "wav",
]);

// ─── Settings ────────────────────────────────────────────────────────────────

interface DocDropSettings {
  executablePath: string;
  outputMode: "same" | "custom";
  customOutputFolder: string;
  keepDataUris: boolean;
  usePlugins: boolean;
  openAiApiKey: string;
  openAiBaseUrl: string;
  openAiModel: string;
  useDocIntel: boolean;
  docIntelEndpoint: string;
  docIntelApiKey: string;
  charset: string;
}

const DEFAULT_SETTINGS: DocDropSettings = {
  executablePath: "markitdown",
  outputMode: "same",
  customOutputFolder: "",
  keepDataUris: false,
  usePlugins: false,
  openAiApiKey: "",
  openAiBaseUrl: "",
  openAiModel: "gpt-4o",
  useDocIntel: false,
  docIntelEndpoint: "",
  docIntelApiKey: "",
  charset: "",
};

// ─── Overwrite Confirmation Modal ────────────────────────────────────────────

class OverwriteModal extends Modal {
  private fileName: string;
  private onConfirm: () => void;
  private onCancel: () => void;

  constructor(
    app: App,
    fileName: string,
    onConfirm: () => void,
    onCancel: () => void
  ) {
    super(app);
    this.fileName = fileName;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "File already exists" });
    contentEl.createEl("p", {
      text: `"${this.fileName}" already exists. Overwrite it?`,
    });

    const buttonRow = contentEl.createDiv({ cls: "modal-button-container" });

    buttonRow
      .createEl("button", { text: "Overwrite", cls: "mod-warning" })
      .addEventListener("click", () => {
        this.close();
        this.onConfirm();
      });

    buttonRow
      .createEl("button", { text: "Cancel" })
      .addEventListener("click", () => {
        this.close();
        this.onCancel();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

class DocDropSettingTab extends PluginSettingTab {
  plugin: DocDropPlugin;

  constructor(app: App, plugin: DocDropPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "DocDrop" });

    new Setting(containerEl)
      .setName("Executable path")
      .setDesc(
        'Full path to the markitdown binary, or just "markitdown" if it is on your PATH.'
      )
      .addText((text) =>
        text
          .setPlaceholder("markitdown")
          .setValue(this.plugin.settings.executablePath)
          .onChange(async (value) => {
            this.plugin.settings.executablePath = value.trim() || "markitdown";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Output location")
      .setDesc("Where to save converted Markdown files.")
      .addDropdown((drop) =>
        drop
          .addOption("same", "Same folder as PDF")
          .addOption("custom", "Custom folder")
          .setValue(this.plugin.settings.outputMode)
          .onChange(async (value) => {
            this.plugin.settings.outputMode = value as "same" | "custom";
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.outputMode === "custom") {
      new Setting(containerEl)
        .setName("Custom output folder")
        .setDesc(
          'Vault-relative path, e.g. "Converted". The folder must already exist.'
        )
        .addText((text) =>
          text
            .setPlaceholder("Converted")
            .setValue(this.plugin.settings.customOutputFolder)
            .onChange(async (value) => {
              this.plugin.settings.customOutputFolder = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    containerEl.createEl("h3", { text: "Conversion options" });

    new Setting(containerEl)
      .setName("Keep images")
      .setDesc(
        "Preserve images embedded in the PDF as base64 data inside the Markdown file. " +
        "Turning this on makes the output file much larger but keeps all visuals inline. " +
        "Leave off if you only need the text."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.keepDataUris)
          .onChange(async (value) => {
            this.plugin.settings.keepDataUris = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Character encoding hint")
      .setDesc(
        "Tells markitdown what text encoding the file uses, e.g. \"UTF-8\" or \"ISO-8859-1\". " +
        "Leave blank unless converted text contains garbled characters — markitdown detects encoding automatically."
      )
      .addText((text) =>
        text
          .setPlaceholder("UTF-8")
          .setValue(this.plugin.settings.charset)
          .onChange(async (value) => {
            this.plugin.settings.charset = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── markitdown-ocr ──────────────────────────────────────────────────────

    const ocrDetails = containerEl.createEl("details", {
      cls: "docdrop-collapsible",
    });
    ocrDetails.open = this.plugin.settings.usePlugins;
    ocrDetails.createEl("summary", { text: "markitdown-ocr plugin (optional)" });

    ocrDetails.createEl("p", {
      text:
        "markitdown-ocr is a free, separately-installed plugin that uses an AI vision model (like " +
        "OpenAI's GPT-4o) to read text from images inside PDFs — useful for scanned documents or " +
        "PDFs that are just pictures of pages. Install it first with: pip install markitdown-ocr. " +
        "You will need an OpenAI account (or a compatible service) to provide the AI.",
      cls: "setting-item-description",
    });

    new Setting(ocrDetails)
      .setName("Enable markitdown-ocr")
      .setDesc(
        "Activate any installed markitdown plugins, including markitdown-ocr. " +
        "Has no effect if markitdown-ocr is not installed. " +
        "Install it with: pip install markitdown-ocr"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.usePlugins)
          .onChange(async (value) => {
            this.plugin.settings.usePlugins = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.usePlugins) {
      new Setting(ocrDetails)
        .setName("OpenAI API key")
        .setDesc(
          "Your secret API key from OpenAI (or a compatible service). " +
          "Required for markitdown-ocr to call the AI vision model. " +
          "Get one at platform.openai.com → API keys. Looks like: sk-proj-..."
        )
        .addText((text) => {
          text
            .setPlaceholder("sk-proj-...")
            .setValue(this.plugin.settings.openAiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.openAiApiKey = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.type = "password";
        });

      new Setting(ocrDetails)
        .setName("AI model")
        .setDesc(
          "The vision-capable AI model markitdown-ocr will use to read images. " +
          "Must support image/vision input. " +
          "\"gpt-4o\" is the default and works well. Other options: gpt-4o-mini (cheaper, slightly less accurate)."
        )
        .addText((text) =>
          text
            .setPlaceholder("gpt-4o")
            .setValue(this.plugin.settings.openAiModel)
            .onChange(async (value) => {
              this.plugin.settings.openAiModel = value.trim() || "gpt-4o";
              await this.plugin.saveSettings();
            })
        );

      new Setting(ocrDetails)
        .setName("OpenAI API base URL (optional)")
        .setDesc(
          "Override the API server markitdown-ocr connects to. " +
          "Leave blank to use the default OpenAI servers. " +
          "Set this if you are using Azure OpenAI or a self-hosted compatible service " +
          "(e.g. https://your-resource.openai.azure.com/)."
        )
        .addText((text) =>
          text
            .setPlaceholder("https://api.openai.com/v1")
            .setValue(this.plugin.settings.openAiBaseUrl)
            .onChange(async (value) => {
              this.plugin.settings.openAiBaseUrl = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    // ── Azure Document Intelligence ─────────────────────────────────────────

    const azureDetails = containerEl.createEl("details", {
      cls: "docdrop-collapsible",
    });
    azureDetails.open = this.plugin.settings.useDocIntel;
    azureDetails.createEl("summary", { text: "Azure Document Intelligence (optional)" });

    azureDetails.createEl("p", {
      text:
        "Document Intelligence is a paid Microsoft Azure cloud service that uses AI to read PDFs with " +
        "much higher accuracy than offline conversion — especially for scanned documents, handwriting, " +
        "tables, and complex layouts. Requires an Azure account. " +
        "Leave these blank to use free offline conversion instead.",
      cls: "setting-item-description",
    });

    new Setting(azureDetails)
      .setName("Use Document Intelligence")
      .setDesc(
        "Send the PDF to Microsoft Azure for conversion instead of processing it locally. " +
        "Produces better results for scanned or image-based PDFs, but requires internet access and a paid Azure subscription."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useDocIntel)
          .onChange(async (value) => {
            this.plugin.settings.useDocIntel = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.useDocIntel) {
      new Setting(azureDetails)
        .setName("Endpoint URL")
        .setDesc(
          "The URL of your Azure Document Intelligence resource. " +
          "Find it in the Azure Portal: open your Document Intelligence resource → Keys and Endpoint. " +
          "Looks like: https://your-resource-name.cognitiveservices.azure.com/"
        )
        .addText((text) =>
          text
            .setPlaceholder("https://your-resource.cognitiveservices.azure.com/")
            .setValue(this.plugin.settings.docIntelEndpoint)
            .onChange(async (value) => {
              this.plugin.settings.docIntelEndpoint = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(azureDetails)
        .setName("API key")
        .setDesc(
          "The secret key that authenticates you with Azure Document Intelligence. " +
          "Find it in the Azure Portal: open your Document Intelligence resource → Keys and Endpoint → KEY 1 or KEY 2. " +
          "Either key works."
        )
        .addText((text) => {
          text
            .setPlaceholder("Your Azure API key")
            .setValue(this.plugin.settings.docIntelApiKey)
            .onChange(async (value) => {
              this.plugin.settings.docIntelApiKey = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.type = "password";
        });
    }
  }
}

// ─── Main Plugin ─────────────────────────────────────────────────────────────

export default class DocDropPlugin extends Plugin {
  settings!: DocDropSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new DocDropSettingTab(this.app, this));

    this.addCommand({
      id: "convert-active-file",
      name: "Convert active file to Markdown",
      callback: () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          new Notice("No file is currently open.");
          return;
        }
        if (!SUPPORTED_EXTENSIONS.has(activeFile.extension.toLowerCase())) {
          new Notice(`DocDrop does not support .${activeFile.extension} files.`);
          return;
        }
        this.convertFile(activeFile);
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file: TAbstractFile) => {
        if (!(file instanceof TFile)) return;
        if (!SUPPORTED_EXTENSIONS.has(file.extension.toLowerCase())) return;

        menu.addItem((item) => {
          item
            .setTitle("Convert to Markdown with DocDrop")
            .setIcon("file-text")
            .onClick(() => this.convertFile(file));
        });
      })
    );
  }

  onunload(): void {}

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async convertFile(pdfFile: TFile): Promise<void> {
    const adapter = this.app.vault.adapter;
    const basePath = (adapter as any).getBasePath() as string;
    const absolutePdfPath = `${basePath}/${pdfFile.path}`;

    const outputVaultPath = this.resolveOutputPath(pdfFile);
    if (outputVaultPath === null) {
      new Notice(
        `Custom output folder "${this.settings.customOutputFolder}" does not exist in the vault.`
      );
      return;
    }

    const existing = this.app.vault.getAbstractFileByPath(outputVaultPath);
    if (existing instanceof TFile) {
      new OverwriteModal(
        this.app,
        outputVaultPath,
        () => this.runConversion(absolutePdfPath, outputVaultPath, existing),
        () => new Notice("Conversion cancelled.")
      ).open();
      return;
    }

    await this.runConversion(absolutePdfPath, outputVaultPath, null);
  }

  private resolveOutputPath(pdfFile: TFile): string | null {
    const baseName = pdfFile.basename;

    if (this.settings.outputMode === "same") {
      const parentPath = pdfFile.parent?.path ?? "";
      // vault root parent path is "/" in some Obsidian versions; normalise to ""
      const folder = parentPath === "/" ? "" : parentPath;
      return folder ? `${folder}/${baseName}.md` : `${baseName}.md`;
    }

    const folderPath = this.settings.customOutputFolder.replace(/\/$/, "");
    if (folderPath === "") {
      return `${baseName}.md`;
    }
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      return null;
    }
    return `${folderPath}/${baseName}.md`;
  }

  private async runConversion(
    absolutePdfPath: string,
    outputVaultPath: string,
    existingFile: TFile | null
  ): Promise<void> {
    const progressNotice = new Notice(`Converting "${outputVaultPath}"…`, 0);

    try {
      const markdown = await this.invokeMarkItDown(absolutePdfPath);
      progressNotice.hide();

      if (existingFile) {
        await this.app.vault.modify(existingFile, markdown);
      } else {
        await this.app.vault.create(outputVaultPath, markdown);
      }

      new Notice(`Converted: ${outputVaultPath}`, 5000);
    } catch (err: unknown) {
      progressNotice.hide();
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`DocDrop failed:\n${message}`, 8000);
      console.error("[DocDrop] conversion error", err);
    }
  }

  private invokeMarkItDown(absolutePdfPath: string): Promise<string> {
    const extraPaths = [
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/Library/Frameworks/Python.framework/Versions/3.12/bin",
      "/Library/Frameworks/Python.framework/Versions/3.11/bin",
      "/Library/Frameworks/Python.framework/Versions/3.10/bin",
      "/usr/bin",
      "/bin",
    ];
    const augmentedPath = [
      ...(process.env.PATH?.split(":") ?? []),
      ...extraPaths,
    ].join(":");

    const args: string[] = [absolutePdfPath];
    if (this.settings.keepDataUris) args.push("--keep-data-uris");
    if (this.settings.usePlugins) args.push("--use-plugins");
    if (this.settings.charset) args.push("--charset", this.settings.charset);
    if (this.settings.useDocIntel) {
      args.push("--use-docintel");
      if (this.settings.docIntelEndpoint) {
        args.push("--endpoint", this.settings.docIntelEndpoint);
      }
    }

    const extraEnv: Record<string, string> = { PATH: augmentedPath };
    if (this.settings.useDocIntel && this.settings.docIntelApiKey) {
      extraEnv["AZURE_API_KEY"] = this.settings.docIntelApiKey;
    }
    if (this.settings.usePlugins && this.settings.openAiApiKey) {
      extraEnv["OPENAI_API_KEY"] = this.settings.openAiApiKey;
    }
    if (this.settings.usePlugins && this.settings.openAiModel) {
      extraEnv["OPENAI_MODEL"] = this.settings.openAiModel;
    }
    if (this.settings.usePlugins && this.settings.openAiBaseUrl) {
      extraEnv["OPENAI_BASE_URL"] = this.settings.openAiBaseUrl;
    }

    return new Promise((resolve, reject) => {
      execFile(
        this.settings.executablePath,
        args,
        {
          encoding: "utf8",
          maxBuffer: 50 * 1024 * 1024,
          env: { ...process.env, ...extraEnv },
        },
        (error, stdout, stderr) => {
          if (error) {
            const detail = stderr?.trim() || error.message;
            reject(new Error(`Exit code ${error.code}: ${detail}`));
            return;
          }
          if (stderr?.trim()) {
            console.warn("[DocDrop] stderr:", stderr.trim());
          }
          resolve(stdout);
        }
      );
    });
  }
}
