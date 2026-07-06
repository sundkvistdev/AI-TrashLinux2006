import { NodeType, VFSNode } from "../types/os";
import { getAssemblies } from "./gsocc";
import defaultVfs from "../data/defaultVfs.json";

const DB_NAME = "Linux2006WebOS_DB";
const STORE_NAME = "vfs_store";
const METADATA_STORE = "metadata_store";
const DB_VERSION = 2; // Schema version
const DEFAULT_VFS_VERSION = 1; // Content version

// IndexedDB core integration helpers
export const initIndexedDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getStoredVfsVersion = (db: IDBDatabase): Promise<number> => {
  return new Promise((resolve) => {
    const transaction = db.transaction(METADATA_STORE, "readonly");
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get("vfs_version");
    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => resolve(0);
  });
};

const setStoredVfsVersion = (db: IDBDatabase, version: number): Promise<void> => {
  return new Promise((resolve) => {
    const transaction = db.transaction(METADATA_STORE, "readwrite");
    const store = transaction.objectStore(METADATA_STORE);
    store.put(version, "vfs_version");
    transaction.oncomplete = () => resolve();
  });
};

export const loadVFSFromDisk = async (): Promise<VFSNode> => {
  try {
    const db = await initIndexedDB();
    const storedVersion = await getStoredVfsVersion(db);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get("root_vfs");

      request.onsuccess = async () => {
        let loadedVFS = request.result as VFSNode;
        let changed = false;

        if (!loadedVFS) {
          // Initialize from scratch
          loadedVFS = defaultVfs as VFSNode;
          changed = true;
          await setStoredVfsVersion(db, DEFAULT_VFS_VERSION);
        } else if (storedVersion < DEFAULT_VFS_VERSION) {
          // Upgrade logic if needed
          console.log("Upgrading VFS content...");
          // Implement selective upgrades here
          await setStoredVfsVersion(db, DEFAULT_VFS_VERSION);
          changed = true;
        }
        
        if (changed) {
          const writeTransaction = db.transaction(STORE_NAME, "readwrite");
          const writeStore = writeTransaction.objectStore(STORE_NAME);
          writeStore.put(loadedVFS, "root_vfs");
          writeTransaction.oncomplete = () => resolve(loadedVFS);
          writeTransaction.onerror = () => reject("Failed to save updated VFS");
        } else {
          resolve(loadedVFS);
        }
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (e) {
    console.warn("Failed to read from IndexedDB, falling back to in-memory only", e);
    return defaultVfs as VFSNode;
  }
};

export const saveVFSToDisk = async (rootNode: VFSNode): Promise<boolean> => {
  try {
    const db = await initIndexedDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(rootNode, "root_vfs");

      transaction.oncomplete = () => {
        resolve(true);
      };
      transaction.onerror = () => {
        resolve(false);
      };
    });
  } catch (e) {
    console.error("VFS Persisting Failure", e);
    return false;
  }
};

// Synchronous operations on the in-memory tree copy
// Split path to parts like "/home/tux/Desktop" -> ["home", "tux", "Desktop"]
export const parsePath = (path: string): string[] => {
  return path.split("/").filter((p) => p !== "");
};

export const resolveNode = (root: VFSNode, absolutePath: string): VFSNode | null => {
  if (absolutePath === "/") return root;
  const parts = parsePath(absolutePath);
  let current: VFSNode = root;

  for (const part of parts) {
    if (current.type !== NodeType.DIRECTORY || !current.children || !current.children[part]) {
      return null;
    }
    current = current.children[part];
  }
  return current;
};

export const writeVFSFile = (root: VFSNode, absolutePath: string, content: string): boolean => {
  const parts = parsePath(absolutePath);
  if (parts.length === 0) return false;

  const fileName = parts[parts.length - 1];
  const dirParts = parts.slice(0, parts.length - 1);

  let current = root;
  for (const part of dirParts) {
    if (current.type !== NodeType.DIRECTORY || !current.children) {
      return false;
    }
    if (!current.children[part]) {
      // Create folder dynamically for parents
      current.children[part] = {
        name: part,
        type: NodeType.DIRECTORY,
        createdAt: Date.now(),
        children: {},
      };
    }
    current = current.children[part];
  }

  if (current.type !== NodeType.DIRECTORY || !current.children) {
    return false;
  }

  current.children[fileName] = {
    name: fileName,
    type: NodeType.FILE,
    createdAt: Date.now(),
    content: content,
  };

  return true;
};

export const mkdirVFS = (root: VFSNode, absolutePath: string): boolean => {
  const parts = parsePath(absolutePath);
  if (parts.length === 0) return false;

  let current = root;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (current.type !== NodeType.DIRECTORY || !current.children) {
      return false;
    }
    if (!current.children[part]) {
      // Create directory
      current.children[part] = {
        name: part,
        type: NodeType.DIRECTORY,
        createdAt: Date.now(),
        children: {},
      };
    } else if (i === parts.length - 1) {
      // Already exists at target path
      return false;
    }
    current = current.children[part];
  }

  return true;
};

export const deleteVFSNode = (root: VFSNode, absolutePath: string): boolean => {
  const parts = parsePath(absolutePath);
  if (parts.length === 0) return false;

  const targetName = parts[parts.length - 1];
  const dirParts = parts.slice(0, parts.length - 1);

  let current = root;
  for (const part of dirParts) {
    if (current.type !== NodeType.DIRECTORY || !current.children || !current.children[part]) {
      return false;
    }
    current = current.children[part];
  }

  if (current.type !== NodeType.DIRECTORY || !current.children || !current.children[targetName]) {
    return false;
  }

  delete current.children[targetName];
  return true;
};

export const readVFSFile = (root: VFSNode, absolutePath: string): string => {
  const node = resolveNode(root, absolutePath);
  if (node && node.type === NodeType.FILE) {
    return node.content ?? "";
  }
  throw new Error(`File not found or directory target error: ${absolutePath}`);
};

export const listVFSDir = (root: VFSNode, absolutePath: string): { name: string; type: NodeType }[] => {
  const node = resolveNode(root, absolutePath);
  if (node && node.type === NodeType.DIRECTORY && node.children) {
    return Object.values(node.children).map((child) => ({
      name: child.name,
      type: child.type,
    }));
  }
  return [];
};
