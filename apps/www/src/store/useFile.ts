import debounce from "lodash.debounce";
import { event as gaEvent } from "nextjs-google-analytics";
import { toast } from "react-hot-toast";
import { create } from "zustand";
import exampleJson from "../data/example.json";
import { FileFormat } from "../enums/file.enum";
import { isIframe } from "../lib/utils/helpers";
import { contentToJson, jsonToContent } from "../lib/utils/jsonAdapter";
import useConfig from "./useConfig";
import useJson from "./useJson";

const defaultJson = JSON.stringify(exampleJson, null, 2);
const WORKSPACE_STORAGE_KEY = "jsoncrack-workspace-v1";

type SetContents = {
  contents?: string;
  hasChanges?: boolean;
  skipUpdate?: boolean;
  format?: FileFormat;
};

type Query = string | string[] | undefined;

export type File = {
  id: string;
  views: number;
  owner_email: string;
  name: string;
  content: string;
  private: boolean;
  format: FileFormat;
  created_at: string;
  updated_at: string;
};

export type EditorDocument = {
  id: string;
  name: string;
  contents: string;
  format: FileFormat;
  hasChanges: boolean;
  error: string | null;
  jsonSchema: object | null;
  fileData: File | null;
};

type NewDocument = Partial<Omit<EditorDocument, "id">> & { id?: string };

interface FileActions {
  getContents: () => string;
  getFormat: () => FileFormat;
  getHasChanges: () => boolean;
  getHasUnsavedTabs: () => boolean;
  setError: (error: string | null, tabId?: string) => void;
  setHasChanges: (hasChanges: boolean) => void;
  setContents: (data: SetContents) => Promise<void>;
  fetchUrl: (url: string) => Promise<void>;
  setFormat: (format: FileFormat) => Promise<void>;
  clear: () => void;
  setFile: (fileData: File) => void;
  setJsonSchema: (jsonSchema: object | null) => void;
  checkEditorSession: (url: Query, widget?: boolean) => void;
  createTab: (document?: NewDocument) => string;
  selectTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  closeTab: (id: string) => void;
  openFiles: (files: globalThis.File[]) => Promise<void>;
  markActiveTabSaved: () => void;
}

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `document-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const createDocument = (document: NewDocument = {}): EditorDocument => ({
  id: document.id ?? createId(),
  name: document.name ?? "Untitled-1",
  contents: document.contents ?? "",
  format: document.format ?? FileFormat.JSON,
  hasChanges: document.hasChanges ?? false,
  error: document.error ?? null,
  jsonSchema: document.jsonSchema ?? null,
  fileData: document.fileData ?? null,
});

const initialDocument = createDocument({ contents: defaultJson });

const initialStates = {
  tabs: [initialDocument] as EditorDocument[],
  activeTabId: initialDocument.id,
  // Active-document mirrors keep the existing selector API compatible.
  fileData: initialDocument.fileData,
  format: initialDocument.format,
  contents: initialDocument.contents,
  error: initialDocument.error,
  hasChanges: initialDocument.hasChanges,
  jsonSchema: initialDocument.jsonSchema,
  hydrated: false,
  isWidget: false,
};

export type FileStates = typeof initialStates;
type Store = FileStates & FileActions;

const isURL = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const activeMirrors = (tabs: EditorDocument[], activeTabId: string) => {
  const active = tabs.find(tab => tab.id === activeTabId) ?? tabs[0];
  return {
    activeTabId: active.id,
    fileData: active.fileData,
    format: active.format,
    contents: active.contents,
    error: active.error,
    hasChanges: active.hasChanges,
    jsonSchema: active.jsonSchema,
  };
};

const serializeWorkspace = (state: Store) => ({
  activeTabId: state.activeTabId,
  tabs: state.tabs.map(({ id, name, contents, format, hasChanges, fileData }) => ({
    id,
    name,
    contents,
    format,
    hasChanges,
    fileData,
  })),
});

let persistenceWarningShown = false;
const persistWorkspace = (state: Store) => {
  if (state.isWidget || typeof window === "undefined" || isIframe()) return;
  try {
    sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(serializeWorkspace(state)));
    sessionStorage.removeItem("content");
    sessionStorage.removeItem("format");
  } catch {
    if (!persistenceWarningShown) {
      persistenceWarningShown = true;
      toast.error("Your editor session could not be saved in this browser.");
    }
  }
};

const validFormat = (format: unknown): format is FileFormat =>
  Object.values(FileFormat).includes(format as FileFormat);

const formatFromFilename = (name: string): FileFormat => {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "yml") return FileFormat.YAML;
  return validFormat(extension) ? extension : FileFormat.JSON;
};

let parseRevision = 0;
const debouncedUpdateJson = debounce((tabId: string, revision: number, json: string) => {
  const state = useFile.getState();
  if (state.activeTabId !== tabId || revision !== parseRevision) return;
  useJson.getState().setJson(json);
}, 400);

const syncDocumentToGraph = async (tabId: string, skipUpdate = false) => {
  const revision = ++parseRevision;
  const state = useFile.getState();
  const document = state.tabs.find(tab => tab.id === tabId);
  if (!document || state.activeTabId !== tabId) return;
  if (!useConfig.getState().liveTransformEnabled && skipUpdate) return;

  try {
    const json = await contentToJson(document.contents, document.format);
    const latest = useFile.getState();
    const latestDocument = latest.tabs.find(tab => tab.id === tabId);
    if (
      latest.activeTabId !== tabId ||
      revision !== parseRevision ||
      latestDocument?.contents !== document.contents ||
      latestDocument?.format !== document.format
    )
      return;
    debouncedUpdateJson(tabId, revision, JSON.stringify(json, null, 2));
  } catch (error: any) {
    const latest = useFile.getState();
    if (latest.activeTabId !== tabId || revision !== parseRevision) return;
    debouncedUpdateJson.cancel();
    useJson.getState().clear();
    latest.setError(error?.mark?.snippet || error?.message || "Invalid document", tabId);
  }
};

const useFile = create<Store>()((set, get) => {
  const updateTab = (id: string, update: Partial<EditorDocument>, persist = true) => {
    const tabs = get().tabs.map(tab => (tab.id === id ? { ...tab, ...update } : tab));
    const activeTabId = get().activeTabId;
    set({ tabs, ...activeMirrors(tabs, activeTabId) });
    if (persist) persistWorkspace(get());
  };

  return {
    ...initialStates,
    createTab: document => {
      const untitledNumber =
        get().tabs.reduce((max, tab) => {
          const match = /^Untitled-(\d+)$/.exec(tab.name);
          return match ? Math.max(max, Number(match[1])) : max;
        }, 0) + 1;
      const tab = createDocument({ name: `Untitled-${untitledNumber}`, ...document });
      debouncedUpdateJson.cancel();
      useJson.getState().clear();
      const tabs = [...get().tabs, tab];
      set({ tabs, ...activeMirrors(tabs, tab.id) });
      persistWorkspace(get());
      void syncDocumentToGraph(tab.id);
      return tab.id;
    },
    selectTab: id => {
      if (id === get().activeTabId || !get().tabs.some(tab => tab.id === id)) return;
      debouncedUpdateJson.cancel();
      ++parseRevision;
      useJson.getState().clear();
      set({ ...activeMirrors(get().tabs, id) });
      persistWorkspace(get());
      void syncDocumentToGraph(id);
    },
    renameTab: (id, name) => {
      const trimmedName = name.trim();
      if (trimmedName) updateTab(id, { name: trimmedName });
    },
    closeTab: id => {
      const state = get();
      const index = state.tabs.findIndex(tab => tab.id === id);
      if (index < 0) return;
      let tabs = state.tabs.filter(tab => tab.id !== id);
      if (tabs.length === 0) tabs = [createDocument()];
      const nextActiveId =
        state.activeTabId === id ? tabs[Math.min(index, tabs.length - 1)].id : state.activeTabId;
      debouncedUpdateJson.cancel();
      ++parseRevision;
      useJson.getState().clear();
      set({ tabs, ...activeMirrors(tabs, nextActiveId) });
      persistWorkspace(get());
      void syncDocumentToGraph(nextActiveId);
    },
    markActiveTabSaved: () => updateTab(get().activeTabId, { hasChanges: false }),
    clear: () => {
      const id = get().activeTabId;
      updateTab(id, { contents: "", error: null, hasChanges: true });
      debouncedUpdateJson.cancel();
      ++parseRevision;
      useJson.getState().clear();
    },
    setJsonSchema: jsonSchema => updateTab(get().activeTabId, { jsonSchema }, false),
    setFile: fileData => {
      const current = get().tabs.find(tab => tab.id === get().activeTabId);
      updateTab(get().activeTabId, {
        fileData,
        name: fileData.name || current?.name,
        format: fileData.format || FileFormat.JSON,
        contents: fileData.content,
        hasChanges: false,
        error: null,
      });
      void syncDocumentToGraph(get().activeTabId);
      gaEvent("set_content", { label: fileData.format });
    },
    getContents: () => get().contents,
    getFormat: () => get().format,
    getHasChanges: () => get().hasChanges,
    getHasUnsavedTabs: () => get().tabs.some(tab => tab.hasChanges),
    setFormat: async format => {
      const tabId = get().activeTabId;
      const document = get().tabs.find(tab => tab.id === tabId);
      if (!document || document.format === format) return;
      try {
        const contentJson = await contentToJson(document.contents, document.format);
        const jsonContent = await jsonToContent(JSON.stringify(contentJson, null, 2), format);
        if (get().activeTabId !== tabId) return;
        await get().setContents({ contents: jsonContent, format });
      } catch {
        if (get().activeTabId === tabId) get().clear();
        console.warn("The content was unable to be converted, so it was cleared instead.");
      }
    },
    setContents: async ({ contents, hasChanges = true, skipUpdate = false, format }) => {
      const tabId = get().activeTabId;
      const document = get().tabs.find(tab => tab.id === tabId);
      if (!document) return;
      updateTab(tabId, {
        ...(contents !== undefined ? { contents } : {}),
        error: null,
        hasChanges,
        format: format ?? document.format,
      });
      await syncDocumentToGraph(tabId, skipUpdate);
    },
    setError: (error, tabId = get().activeTabId) => updateTab(tabId, { error }, false),
    setHasChanges: hasChanges => updateTab(get().activeTabId, { hasChanges }),
    openFiles: async files => {
      for (const file of files) {
        const format = formatFromFilename(file.name);
        try {
          const contents = await file.text();
          get().createTab({ name: file.name, contents, format, hasChanges: false });
          gaEvent("import_file", { label: format });
        } catch {
          toast.error(`Unable to load file ${file.name}`);
        }
      }
    },
    fetchUrl: async url => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const pathname = new URL(url).pathname;
        const name = decodeURIComponent(
          pathname.split("/").filter(Boolean).pop() || "Imported JSON"
        );
        get().createTab({
          name,
          contents: JSON.stringify(json, null, 2),
          format: FileFormat.JSON,
          hasChanges: false,
        });
      } catch {
        toast.error("Failed to fetch document from URL!");
      }
    },
    checkEditorSession: (url, widget = false) => {
      if (get().hydrated && get().isWidget === widget) return;
      set({ hydrated: true, isWidget: widget });
      if (url && typeof url === "string" && isURL(url)) {
        if (widget) {
          const tab = createDocument({ name: "Imported JSON", contents: "" });
          set({ tabs: [tab], ...activeMirrors([tab], tab.id) });
          fetch(url)
            .then(res => {
              if (!res.ok) throw new Error();
              return res.json();
            })
            .then(json =>
              get().setContents({ contents: JSON.stringify(json, null, 2), hasChanges: false })
            )
            .catch(() => toast.error("Failed to fetch document from URL!"));
        } else {
          void get().fetchUrl(url);
        }
        return;
      }
      if (widget) {
        const tab = createDocument({ contents: defaultJson });
        set({ tabs: [tab], ...activeMirrors([tab], tab.id) });
        void syncDocumentToGraph(tab.id);
        return;
      }
      try {
        const stored = sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as { activeTabId?: string; tabs?: NewDocument[] };
          if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0)
            throw new Error("Invalid session");
          const tabs = parsed.tabs.map(tab => {
            if (
              typeof tab.id !== "string" ||
              typeof tab.name !== "string" ||
              typeof tab.contents !== "string" ||
              !validFormat(tab.format)
            )
              throw new Error("Invalid session");
            return createDocument(tab);
          });
          const activeTabId = tabs.some(tab => tab.id === parsed.activeTabId)
            ? parsed.activeTabId!
            : tabs[0].id;
          set({ tabs, ...activeMirrors(tabs, activeTabId) });
          void syncDocumentToGraph(activeTabId);
          return;
        }
        const legacyContents = sessionStorage.getItem("content");
        const legacyFormat = sessionStorage.getItem("format");
        if (legacyContents) {
          const tab = createDocument({
            contents: legacyContents,
            format: validFormat(legacyFormat) ? legacyFormat : FileFormat.JSON,
          });
          set({ tabs: [tab], ...activeMirrors([tab], tab.id) });
          persistWorkspace(get());
          void syncDocumentToGraph(tab.id);
          return;
        }
      } catch {
        toast.error("The saved editor session was invalid and could not be restored.");
      }
      const tab = createDocument({ contents: defaultJson });
      set({ tabs: [tab], ...activeMirrors([tab], tab.id) });
      persistWorkspace(get());
      void syncDocumentToGraph(tab.id);
    },
  };
});

export default useFile;
