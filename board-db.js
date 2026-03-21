// board-db.js - IndexedDB storage for boards (supports media blobs)
const DB_NAME = 'jeopardyDB';
const DB_VERSION = 1;
const BOARDS_STORE = 'boards';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(BOARDS_STORE)) {
                db.createObjectStore(BOARDS_STORE, { keyPath: 'name' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function loadAllBoards() {
    // Migrate from localStorage if needed
    const legacy = localStorage.getItem('jeopardyBoards');
    if (legacy) {
        try {
            const old = JSON.parse(legacy);
            if (old.length > 0) {
                const db = await openDB();
                const tx = db.transaction(BOARDS_STORE, 'readwrite');
                const store = tx.objectStore(BOARDS_STORE);
                for (const board of old) {
                    if (board && board.name) store.put(board);
                }
                await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
                db.close();
            }
        } catch (e) { console.error('Migration error:', e); }
        localStorage.removeItem('jeopardyBoards');
    }

    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(BOARDS_STORE, 'readonly');
        const store = tx.objectStore(BOARDS_STORE);
        const request = store.getAll();
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
    });
}

export async function saveBoard(board) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(BOARDS_STORE, 'readwrite');
        tx.objectStore(BOARDS_STORE).put(board);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function deleteBoard(name) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(BOARDS_STORE, 'readwrite');
        tx.objectStore(BOARDS_STORE).delete(name);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function getBoard(name) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(BOARDS_STORE, 'readonly');
        const request = tx.objectStore(BOARDS_STORE).get(name);
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
    });
}

export function boardHasMedia(board) {
    return board.media && Object.keys(board.media).length > 0;
}
