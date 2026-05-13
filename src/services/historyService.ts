import { openDB, IDBPDatabase } from 'idb';

export interface MatrixArchive {
  id: string;
  name: string;
  timestamp: number;
  filesCount: number;
  totalSize: number;
  blobs: Record<string, Blob>;
  pinned: boolean;
}

const DB_NAME = 'voxzip_matrix_hub';
const STORE_NAME = 'archives';
const MAX_CACHED_ITEMS = 15;

class HistoryService {
  private db: Promise<IDBPDatabase>;

  constructor() {
    this.db = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
        }
      },
    });
  }

  async saveArchive(archive: Omit<MatrixArchive, 'pinned'>): Promise<void> {
    const db = await this.db;
    await db.put(STORE_NAME, { ...archive, pinned: false });
    await this.cleanup();
  }

  async getAllArchives(): Promise<MatrixArchive[]> {
    const db = await this.db;
    const archives = await db.getAllFromIndex(STORE_NAME, 'timestamp');
    return archives.reverse(); // Newest first
  }

  async deleteArchive(id: string): Promise<void> {
    const db = await this.db;
    await db.delete(STORE_NAME, id);
  }

  async togglePin(id: string): Promise<void> {
    const db = await this.db;
    const archive = await db.get(STORE_NAME, id);
    if (archive) {
      archive.pinned = !archive.pinned;
      await db.put(STORE_NAME, archive);
    }
  }

  async clearAll(): Promise<void> {
    const db = await this.db;
    await db.clear(STORE_NAME);
  }

  private async cleanup(): Promise<void> {
    const db = await this.db;
    const all = await db.getAllFromIndex(STORE_NAME, 'timestamp');
    const unpinned = all.filter(a => !a.pinned);
    
    if (all.length > MAX_CACHED_ITEMS && unpinned.length > 0) {
      const toDeleteCount = all.length - MAX_CACHED_ITEMS;
      const toDelete = unpinned.slice(0, toDeleteCount);
      
      for (const item of toDelete) {
        await db.delete(STORE_NAME, item.id);
      }
    }
  }
}

export const historyService = new HistoryService();
