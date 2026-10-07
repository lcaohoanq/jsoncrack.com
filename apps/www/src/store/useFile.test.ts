import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileFormat } from "../enums/file.enum";

vi.mock("nextjs-google-analytics", () => ({ event: vi.fn() }));
vi.mock("react-hot-toast", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const loadStore = async (storage: Storage = new MemoryStorage()) => {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", storage);
  const frame = {};
  vi.stubGlobal("window", { self: frame, top: frame });
  const [{ default: useFile }, { default: useJson }] = await Promise.all([
    import("./useFile"),
    import("./useJson"),
  ]);
  return { useFile, useJson };
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("multi-document file store", () => {
  it("creates, selects, renames and isolates document state", async () => {
    const { useFile } = await loadStore();
    const firstId = useFile.getState().activeTabId;
    await useFile.getState().setContents({ contents: '{"first":true}' });

    const secondId = useFile.getState().createTab();
    await useFile.getState().setContents({ contents: "name: second", format: FileFormat.YAML });
    useFile.getState().renameTab(secondId, "notes.yaml");

    useFile.getState().selectTab(firstId);
    expect(useFile.getState().contents).toBe('{"first":true}');
    expect(useFile.getState().format).toBe(FileFormat.JSON);

    useFile.getState().selectTab(secondId);
    expect(useFile.getState().contents).toBe("name: second");
    expect(useFile.getState().format).toBe(FileFormat.YAML);
    expect(useFile.getState().tabs.find(tab => tab.id === secondId)?.name).toBe("notes.yaml");
  });

  it("selects the neighboring tab on close and never leaves the workspace empty", async () => {
    const { useFile } = await loadStore();
    const firstId = useFile.getState().activeTabId;
    const secondId = useFile.getState().createTab();
    const thirdId = useFile.getState().createTab();

    useFile.getState().closeTab(thirdId);
    expect(useFile.getState().activeTabId).toBe(secondId);
    useFile.getState().closeTab(secondId);
    expect(useFile.getState().activeTabId).toBe(firstId);
    useFile.getState().closeTab(firstId);

    expect(useFile.getState().tabs).toHaveLength(1);
    expect(useFile.getState().activeTabId).not.toBe(firstId);
    expect(useFile.getState().contents).toBe("");
  });

  it("keeps the graph synchronized with the active tab during rapid switches", async () => {
    const { useFile, useJson } = await loadStore();
    const firstId = useFile.getState().activeTabId;
    await useFile.getState().setContents({ contents: '{"active":"first"}' });
    const secondId = useFile.getState().createTab({ contents: '{"active":"second"}' });

    useFile.getState().selectTab(firstId);
    useFile.getState().selectTab(secondId);
    useFile.getState().selectTab(firstId);
    await new Promise(resolve => setTimeout(resolve, 450));

    expect(JSON.parse(useJson.getState().json)).toEqual({ active: "first" });

    await useFile.getState().setContents({ contents: "{" });
    expect(useJson.getState().json).toBe("");
  });

  it("hydrates a workspace and migrates the legacy single-document session", async () => {
    const workspaceStorage = new MemoryStorage();
    workspaceStorage.setItem(
      "jsoncrack-workspace-v1",
      JSON.stringify({
        activeTabId: "two",
        tabs: [
          { id: "one", name: "one.json", contents: "{}", format: "json", hasChanges: false },
          { id: "two", name: "two.csv", contents: "a\n1", format: "csv", hasChanges: true },
        ],
      })
    );
    const hydrated = await loadStore(workspaceStorage);
    hydrated.useFile.getState().checkEditorSession(undefined);
    expect(hydrated.useFile.getState().activeTabId).toBe("two");
    expect(hydrated.useFile.getState().hasChanges).toBe(true);

    const legacyStorage = new MemoryStorage();
    legacyStorage.setItem("content", "answer: 42");
    legacyStorage.setItem("format", "yaml");
    const migrated = await loadStore(legacyStorage);
    migrated.useFile.getState().checkEditorSession(undefined);
    expect(migrated.useFile.getState().tabs).toHaveLength(1);
    expect(migrated.useFile.getState().contents).toBe("answer: 42");
    expect(migrated.useFile.getState().format).toBe(FileFormat.YAML);
    expect(legacyStorage.getItem("jsoncrack-workspace-v1")).not.toBeNull();
  });

  it("falls back from corrupt storage and tolerates storage quota failures", async () => {
    const corruptStorage = new MemoryStorage();
    corruptStorage.setItem("jsoncrack-workspace-v1", "not-json");
    const { useFile } = await loadStore(corruptStorage);
    expect(() => useFile.getState().checkEditorSession(undefined)).not.toThrow();
    expect(useFile.getState().tabs).toHaveLength(1);

    const quotaStorage = new MemoryStorage();
    quotaStorage.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
    const quota = await loadStore(quotaStorage);
    expect(() => quota.useFile.getState().createTab()).not.toThrow();
    expect(quota.useFile.getState().tabs).toHaveLength(2);
  });

  it("opens multiple supported file formats and activates the last file", async () => {
    const { useFile } = await loadStore();
    const files = [
      { name: "one.json", text: async () => "{}" },
      { name: "two.yml", text: async () => "two: true" },
      { name: "three.xml", text: async () => "<three />" },
      { name: "four.csv", text: async () => "four\n4" },
    ] as File[];

    await useFile.getState().openFiles(files);

    const imported = useFile.getState().tabs.slice(1);
    expect(imported.map(tab => tab.name)).toEqual(files.map(file => file.name));
    expect(imported.map(tab => tab.format)).toEqual([
      FileFormat.JSON,
      FileFormat.YAML,
      FileFormat.XML,
      FileFormat.CSV,
    ]);
    expect(useFile.getState().activeTabId).toBe(imported.at(-1)?.id);
  });
});
