// Database + GitHub Integration
let db = null;
let SQL = null;
let inventory = [];
let activeCommentItemId = null;
let pendingRemoveComment = null;
let sortField = null;
let sortDirection = 'asc';

// GitHub Config
let githubToken = null;
let githubOwner = 'TheRandomChap';
let githubRepo = 'EastPantRos26';
let githubBranch = 'main';
let syncInProgress = false;
let lastSyncTime = 0;

// Initialize app
async function startApp() {
    await initializeDatabase();
    await setupGitHub();
    await syncFromGitHub();
}

startApp();

// ============= GitHub Setup =============
async function setupGitHub() {
    const storedToken = await getFromIndexedDB('config', 'githubToken');
    
    if (storedToken) {
        githubToken = storedToken.trim();
        console.log('GitHub token hentet fra IndexedDB');
    } else {
        const token = prompt(
            'GitHub Token kræves for synkronisering.\n\n' +
            '1. Gå til https://github.com/settings/tokens\n' +
            '2. Klik "Generate new token (classic)"\n' +
            '3. Vælg scopes: repo (full control)\n' +
            '4. Kopier token og indsæt her:'
        );
        
        if (token) {
            githubToken = token.trim();
            await saveToIndexedDB('config', 'githubToken', githubToken);
            console.log('GitHub token gemt');
        } else {
            alert('GitHub token kræves! App vil arbejde lokalt uden synkronisering.');
        }
    }
}

// ============= IndexedDB Functions =============
async function getFromIndexedDB(store, key) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('InventoryDB', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db_instance = request.result;
            const transaction = db_instance.transaction(store, 'readonly');
            const objectStore = transaction.objectStore(store);
            const getRequest = objectStore.get(key);
            getRequest.onsuccess = () => resolve(getRequest.result?.value);
            getRequest.onerror = () => reject(getRequest.error);
        };
        request.onupgradeneeded = () => {
            const db_instance = request.result;
            if (!db_instance.objectStoreNames.contains('data')) {
                db_instance.createObjectStore('data');
            }
            if (!db_instance.objectStoreNames.contains('config')) {
                db_instance.createObjectStore('config');
            }
        };
    });
}

async function saveToIndexedDB(store, key, value) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('InventoryDB', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db_instance = request.result;
            const transaction = db_instance.transaction(store, 'readwrite');
            const objectStore = transaction.objectStore(store);
            const putRequest = objectStore.put({ value }, key);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };
    });
}

// ============= GitHub API Functions =============
async function getFileFromGitHub(path) {
    if (!githubToken) return null;
    
    try {
        const response = await fetch(
            `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${path}?ref=${githubBranch}`,
            {
                headers: {
                    Authorization: `Bearer ${githubToken}`
                }
            }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        return {
            content: data.content,
            sha: data.sha
        };
    } catch (err) {
        console.error('Fejl ved hentning fra GitHub:', err);
        return null;
    }
}

async function pushFileToGitHub(path, base64Content, message) {
    if (!githubToken) {
        console.warn('GitHub token ikke tilgængelig - springer push over');
        return false;
    }
    
    try {
        // Get current SHA for update
        let sha = null;
        const existing = await getFileFromGitHub(path);
        if (existing) {
            sha = existing.sha;
        }
        
        const response = await fetch(
            `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${path}`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${githubToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    content: base64Content,
                    branch: githubBranch,
                    ...(sha && { sha })
                })
            }
        );
        
        if (!response.ok) {
            const error = await response.json();
            console.error('GitHub API fejl:', error);
            return false;
        }
        
        return true;
    } catch (err) {
        console.error('Fejl ved push til GitHub:', err);
        return false;
    }
}

// ============= Sync Functions =============
async function syncFromGitHub() {
    // Load latest database from GitHub
    const fileData = await getFileFromGitHub('inventory.db');
    
    if (fileData) {
        try {
            const binaryString = atob(fileData.content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            if (SQL) {
                db = new SQL.Database(bytes);
                await saveToIndexedDB('data', 'lastDatabase', bytes);
                loadInventory();
                renderTable();
            }
        } catch (err) {
            console.error('Fejl ved synkronisering fra GitHub:', err);
        }
    }
}

async function syncToGitHub(message = 'Auto-sync fra appen') {
    if (syncInProgress || !db || !githubToken) return;
    if (Date.now() - lastSyncTime < 2000) return; // Debounce: max 1 sync per 2 sec
    
    syncInProgress = true;
    lastSyncTime = Date.now();
    
    try {
        const data = db.export();
        const binaryString = String.fromCharCode(...new Uint8Array(data));
        const base64Data = btoa(binaryString);
        
        const success = await pushFileToGitHub(
            'inventory.db',
            base64Data,
            message
        );
        
        if (success) {
            console.log('✅ Synkroniseret til GitHub');
        }
    } catch (err) {
        console.error('Fejl ved synkronisering til GitHub:', err);
    } finally {
        syncInProgress = false;
    }
}

// ============= Database Functions =============
async function initializeDatabase() {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://sql.js.org/dist/sql-wasm.wasm', true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function() {
            initSqlJs({ wasmBinary: xhr.response }).then(SQL_instance => {
                SQL = SQL_instance;
                loadDatabase();
                resolve();
            });
        };
        xhr.onerror = function() {
            console.error('Kunne ikke hente SQL.js WASM');
            loadDatabase();
            resolve();
        };
        xhr.send();
    });
}

async function loadDatabase() {
    try {
        // Try to load from IndexedDB first
        const cachedDb = await getFromIndexedDB('data', 'lastDatabase');
        
        if (cachedDb) {
            try {
                db = new SQL.Database(cachedDb);
                loadInventory();
                renderTable();
                return;
            } catch (err) {
                console.warn('Fejl ved indlæsning af cache:', err);
            }
        }
        
        createDatabase();
    } catch (err) {
        console.error('Fejl ved database-indlæsning:', err);
        createDatabase();
    }
}

function createDatabase() {
    if (!SQL) {
        setTimeout(createDatabase, 100);
        return;
    }
    
    db = new SQL.Database();
    
    db.run(`
        CREATE TABLE IF NOT EXISTS inventory (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            qty INTEGER,
            category TEXT,
            boxNumber TEXT
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itemId TEXT NOT NULL,
            text TEXT,
            createdAt TEXT,
            FOREIGN KEY(itemId) REFERENCES inventory(id)
        )
    `);
    
    loadInventory();
    renderTable();
    persistAndSync('Database oprettet');
}

function loadInventory() {
    if (!db) return;
    
    try {
        const result = db.exec('SELECT * FROM inventory');
        inventory = [];
        
        if (result.length > 0) {
            const columns = result[0].columns;
            const values = result[0].values;
            
            values.forEach(row => {
                const item = {};
                columns.forEach((col, idx) => {
                    item[col] = row[idx];
                });
                
                item.comments = getCommentsFromDb(item.id);
                inventory.push(item);
            });
        }
    } catch (err) {
        console.error('Fejl ved indlæsning af inventar:', err);
    }
}

function getCommentsFromDb(itemId) {
    if (!db) return [];
    
    try {
        const result = db.exec(
            `SELECT * FROM comments WHERE itemId = ? ORDER BY createdAt DESC`,
            [itemId]
        );
        
        const comments = [];
        if (result.length > 0) {
            const columns = result[0].columns;
            const values = result[0].values;
            
            values.forEach(row => {
                const comment = {};
                columns.forEach((col, idx) => {
                    comment[col] = row[idx];
                });
                comments.push(comment);
            });
        }
        
        return comments;
    } catch (err) {
        console.error('Fejl ved hentning af kommentarer:', err);
        return [];
    }
}

// ============= Persist & Sync =============
async function persistAndSync(message) {
    // Save to IndexedDB
    if (db) {
        await saveToIndexedDB('data', 'lastDatabase', db.export());
    }
    
    // Auto-sync to GitHub
    await syncToGitHub(message);
}

// ============= UI Functions =============
window.addItem = function () {
    if (!db) return;
    
    const name = document.getElementById('itemName').value.trim();
    const qty = parseInt(document.getElementById('itemQty').value, 10);
    const category = document.getElementById('itemCategory').value.trim();
    const boxNumber = document.getElementById('itemBoxNumber').value.trim();

    if (!name || isNaN(qty)) return;

    const id = 'item-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now();
    
    try {
        db.run(
            `INSERT INTO inventory (id, name, qty, category, boxNumber) VALUES (?, ?, ?, ?, ?)`,
            [id, name, qty, category, boxNumber]
        );
        loadInventory();
        clearInputs();
        renderTable();
        persistAndSync('Tilføjede ting: ' + name);
    } catch (err) {
        console.error('Fejl ved tilføjelse af ting:', err);
    }
};

window.deleteItem = function (id) {
    if (!db) return;
    
    try {
        const item = inventory.find(i => i.id === id);
        const itemName = item ? item.name : 'element';
        
        db.run(`DELETE FROM inventory WHERE id = ?`, [id]);
        db.run(`DELETE FROM comments WHERE itemId = ?`, [id]);
        loadInventory();
        renderTable();
        persistAndSync('Slettede: ' + itemName);
    } catch (err) {
        console.error('Fejl ved sletning:', err);
    }
};

window.changeQty = function (id, currentQty, amount) {
    if (!db) return;
    
    const newQty = Math.max(0, currentQty + amount);
    try {
        db.run(`UPDATE inventory SET qty = ? WHERE id = ?`, [newQty, id]);
        loadInventory();
        renderTable();
        persistAndSync('Ændrede antal');
    } catch (err) {
        console.error('Fejl ved ændring af antal:', err);
    }
};

window.saveName = function (id, value) {
    if (!db) return;
    
    try {
        db.run(`UPDATE inventory SET name = ? WHERE id = ?`, [value.trim(), id]);
        loadInventory();
        persistAndSync('Ændrede navn');
    } catch (err) {
        console.error('Fejl ved gemning af navn:', err);
    }
};

window.saveCategory = function (id, value) {
    if (!db) return;
    
    try {
        db.run(`UPDATE inventory SET category = ? WHERE id = ?`, [value.trim(), id]);
        loadInventory();
        persistAndSync('Ændrede lokation');
    } catch (err) {
        console.error('Fejl ved gemning af lokation:', err);
    }
};

window.saveBoxNumber = function (id, value) {
    if (!db) return;
    
    try {
        db.run(`UPDATE inventory SET boxNumber = ? WHERE id = ?`, [value.trim(), id]);
        loadInventory();
        persistAndSync('Ændrede kassenummer');
    } catch (err) {
        console.error('Fejl ved gemning af kassenummer:', err);
    }
};

window.saveQty = function(id) {
    if (!db) return;
    
    const input = document.getElementById(`qtyInput-${id}`);
    if (!input) return;
    
    const value = parseInt(input.value, 10);
    try {
        db.run(`UPDATE inventory SET qty = ? WHERE id = ?`, [isNaN(value) ? 0 : value, id]);
        loadInventory();
        renderTable();
        persistAndSync('Gemte antal');
    } catch (err) {
        console.error('Fejl ved gemning af antal:', err);
    }
};

window.saveCommentPopup = function () {
    if (!activeCommentItemId || !db) return;

    const text = document.getElementById('commentText').value.trim();
    if (!text) return;

    try {
        db.run(
            `INSERT INTO comments (itemId, text, createdAt) VALUES (?, ?, ?)`,
            [activeCommentItemId, text, new Date().toISOString()]
        );
        loadInventory();
        renderTable();
        closeCommentPopup();
        persistAndSync('Tilføjede kommentar');
    } catch (err) {
        console.error('Fejl ved gemning af kommentar:', err);
    }
};

window.confirmRemoveComment = function () {
    if (!pendingRemoveComment || !db) return;
    
    const { id, index } = pendingRemoveComment;
    const item = inventory.find(i => i.id === id);
    if (!item) {
        closeRemoveCommentPopup();
        return;
    }

    const comments = getItemComments(item);
    if (index >= 0 && index < comments.length) {
        const commentText = comments[index].text;
        try {
            db.run(
                `DELETE FROM comments WHERE itemId = ? AND text = ? LIMIT 1`,
                [id, commentText]
            );
            loadInventory();
            renderTable();
            persistAndSync('Slettede kommentar');
        } catch (err) {
            console.error('Fejl ved sletning af kommentar:', err);
        }
    }

    closeRemoveCommentPopup();
};

function clearInputs() {
    document.getElementById('itemName').value = '';
    document.getElementById('itemQty').value = '';
    document.getElementById('itemCategory').value = '';
    document.getElementById('itemBoxNumber').value = '';
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getItemComments(item) {
    if (Array.isArray(item.comments) && item.comments.length > 0) {
        return item.comments;
    }
    return [];
}

window.openCommentPopup = function (id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    activeCommentItemId = id;
    document.getElementById('commentText').value = "";
    document.getElementById('commentModal').classList.add('open');
    document.getElementById('commentText').focus();
};

window.closeCommentPopup = function () {
    activeCommentItemId = null;
    document.getElementById('commentText').value = "";
    document.getElementById('commentModal').classList.remove('open');
};

window.openRemoveCommentPopup = function (id, index) {
    pendingRemoveComment = { id, index };
    document.getElementById('removeCommentModal').classList.add('open');
};

window.closeRemoveCommentPopup = function () {
    pendingRemoveComment = null;
    document.getElementById('removeCommentModal').classList.remove('open');
};

// ============= Render Functions =============
window.renderTable = function () {
    const table = document.getElementById('inventoryTable');
    if (!table) return;
    
    const search = (document.getElementById('search')?.value || '').toLowerCase();
    table.innerHTML = '';

    inventory
        .filter(i => {
            const commentSearch = getItemComments(i)
                .map(comment => `${comment.text || ""}`)
                .join(' ')
                .toLowerCase();

            return (i.name || "").toLowerCase().includes(search) ||
                (i.category || "").toLowerCase().includes(search) ||
                (i.boxNumber || "").toLowerCase().includes(search) ||
                commentSearch.includes(search);
        })
        .sort((a, b) => {
            if (!sortField) return 0;
            let valueA;
            let valueB;
            if (sortField === 'qty') {
                valueA = Number(a.qty) || 0;
                valueB = Number(b.qty) || 0;
            } else {
                valueA = (a[sortField] || "").toString().toLowerCase();
                valueB = (b[sortField] || "").toString().toLowerCase();
            }
            if (valueA === valueB) return 0;
            if (sortDirection === 'asc') {
                return valueA < valueB ? -1 : 1;
            }
            return valueA > valueB ? -1 : 1;
        })
        .forEach(item => {
            const qty = Number.isFinite(Number(item.qty)) ? Number(item.qty) : 0;
            const comments = getItemComments(item);
            const commentHtml = comments.length
                ? `<div class="comments-list">
                        ${comments.map((comment, index) => `
                            <div class="saved-comment">
                                <p class="comment-text">${escapeHtml(comment.text || "")}</p>
                                <button class="remove-comment" onclick="openRemoveCommentPopup('${item.id}', ${index})">Fjern</button>
                            </div>
                        `).join('')}
                    </div>`
                : '';

            table.innerHTML += `
                <tr>
                    <td>
                        <span id="qty-${item.id}">${qty}</span>
                        <button class="edit-btn" onclick="startEditQty('${item.id}', ${qty})">&#9999;&#65039;</button>
                    </td>
                    <td class="item-cell">
                        <span contenteditable="true" onblur="saveName('${item.id}', this.innerText)">${escapeHtml(item.name)}</span>
                        ${commentHtml}
                    </td>
                    <td>
                        <span contenteditable="true" onblur="saveCategory('${item.id}', this.innerText)">${escapeHtml(item.category)}</span>
                    </td>
                    <td>
                        <span contenteditable="true" onblur="saveBoxNumber('${item.id}', this.innerText)">${escapeHtml(item.boxNumber || '')}</span>
                    </td>
                    <td class="actions-cell">
                        <button class="plus" onclick="changeQty('${item.id}', ${qty}, 1)">+</button>
                        <button class="minus" onclick="changeQty('${item.id}', ${qty}, -1)">-</button>
                        <button class="comment-btn" onclick="openCommentPopup('${item.id}')">Kommentar</button>
                        <button class="delete" onclick="deleteItem('${item.id}')">Slet</button>
                    </td>
                </tr>
            `;
        });
};

window.toggleSort = function (field) {
    if (sortField === field) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = field;
        sortDirection = 'asc';
    }

    document.querySelectorAll('.sort-icon').forEach(icon => {
        const fieldName = icon.getAttribute('data-sort-field');
        if (fieldName === sortField) {
            icon.textContent = sortDirection === 'asc' ? '⬆' : '⬇';
        } else {
            icon.textContent = '↕';
        }
    });

    renderTable();
};

window.searchInventory = function() {
    renderTable();
};

window.startEditQty = function(id, currentQty) {
    const span = document.getElementById(`qty-${id}`);
    span.innerHTML = `
        <input
            type="number"
            id="qtyInput-${id}"
            value="${currentQty}"
            min="0"
            onblur="saveQty('${id}')"
            onkeydown="if(event.key==='Enter') { event.preventDefault(); this.blur(); }"
            style="width:70px;border-radius:10px;padding:6px;"
        >
    `;
    document.getElementById(`qtyInput-${id}`).focus();
};

// ============= Export =============
window.exportExcel = function () {
    const data = inventory.map(i => ({
        Antal: i.qty,
        Ting: i.name,
        Lokation: i.category,
        Kassenummer: i.boxNumber || '',
        Kommentarer: getItemComments(i)
            .map(comment => `${comment.text || ''}`)
            .join('\n')
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `roskilde 2026 kasser ${today}.xlsx`);
};

// ============= Event Listeners =============
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('commentModal')) {
        document.getElementById('commentModal').addEventListener('click', (event) => {
            if (event.target.id === 'commentModal') {
                closeCommentPopup();
            }
        });
    }

    if (document.getElementById('removeCommentModal')) {
        document.getElementById('removeCommentModal').addEventListener('click', (event) => {
            if (event.target.id === 'removeCommentModal') {
                closeRemoveCommentPopup();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeCommentPopup();
            closeRemoveCommentPopup();
        }
    });
});

window.downloadDatabase = function() {
    if (!db) return;
    
    const data = db.export();
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory.db';
    a.click();
    URL.revokeObjectURL(url);
};

initializeDatabase();
