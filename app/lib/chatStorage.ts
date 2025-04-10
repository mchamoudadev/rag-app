import { Document } from '@/models/Document';

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  documentId: string;
}

class ChatStorage {
  private dbName = 'uni-rag-chat-db';
  private storeName = 'chat-messages';
  private version = 1;

  // Open the database
  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('documentId', 'documentId', { unique: false });
        }
      };
    });
  }

  // Save a message to IndexedDB
  async saveMessage(message: ChatMessage): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(message);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
        
        transaction.oncomplete = () => db.close();
      });
    } catch (error) {
      console.error('Error saving message to IndexedDB:', error);
      throw error;
    }
  }

  // Get all messages for a document
  async getMessages(documentId: string): Promise<ChatMessage[]> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('documentId');
        const request = index.getAll(IDBKeyRange.only(documentId));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          resolve(request.result || []);
        };
        
        transaction.oncomplete = () => db.close();
      });
    } catch (error) {
      console.error('Error getting messages from IndexedDB:', error);
      return [];
    }
  }

  // Clear all messages for a document
  async clearMessages(documentId: string): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('documentId');
        const request = index.openCursor(IDBKeyRange.only(documentId));

        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        
        transaction.oncomplete = () => db.close();
      });
    } catch (error) {
      console.error('Error clearing messages from IndexedDB:', error);
      throw error;
    }
  }
}

export const chatStorage = new ChatStorage(); 