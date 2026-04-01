import { auth, db } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { loadAllBoards, saveBoard, deleteBoard, getBoard, boardHasMedia } from './board-db.js';

let boards = [];
let currentBoardIndex = -1;
let editModeActive = false;

document.addEventListener('DOMContentLoaded', async () => {
    boards = await loadAllBoards();
    renderSidebar();
    setupGlobalListeners();
});

// ==========================================
// RENDERING AV GRÄNSSNITT
// ==========================================

function renderSidebar() {
    const list = document.getElementById('boardsList');
    list.innerHTML = '';

    if (boards.length === 0) {
        list.innerHTML = '<p class="text-sm text-slate-400 p-2">Inga sparade bräden.</p>';
        return;
    }

    boards.forEach((board, index) => {
        const btn = document.createElement('button');
        const isActive = index === currentBoardIndex;
        
        btn.className = `w-full text-left px-4 py-3 flex justify-between items-center rounded-lg transition-colors border ${isActive ? 'bg-amber-50 border-amber-200 text-slate-900 font-bold' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-100'}`;
        
        btn.innerHTML = `
            <span class="truncate pr-2">${board.name}</span>
            <span class="text-xs ${isActive ? 'text-amber-600' : 'text-slate-400'} font-bold flex-shrink-0">30</span>
        `;
        
        btn.onclick = () => selectBoard(index);
        list.appendChild(btn);
    });
}

function selectBoard(index) {
    currentBoardIndex = index;
    editModeActive = false;
    renderSidebar();
    renderMainContent();
}

function renderMainContent() {
    const container = document.getElementById('mainContent');
    
    if (currentBoardIndex === -1 || !boards[currentBoardIndex]) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-400">
                <p class="text-xl font-bold">Välj ett bräde i menyn eller skapa ett nytt.</p>
            </div>
        `;
        return;
    }

    const board = boards[currentBoardIndex];

    if (editModeActive) {
        renderEditMode(container, board);
    } else {
        renderViewMode(container, board);
    }
}

// VISNINGSLÄGET (Hela brädet syns)
function renderViewMode(container, board) {
    // Bygg upp HTML för hela Jeopardy-brädet för att ge en överblick
    let gridHTML = `<div class="grid grid-cols-6 gap-2 mt-6">`;
    
    board.categories.forEach((cat, col) => {
        gridHTML += `<div class="flex flex-col gap-2">`;
        // Kategori-rubrik
        gridHTML += `<div class="bg-blue-900 text-white font-bold p-3 text-center text-sm rounded-md shadow-sm h-14 flex items-center justify-center leading-tight">${cat || 'Tom Kategori'}</div>`;
        
        // Gå igenom de 5 frågorna i denna kategori
        for(let row = 0; row < 5; row++) {
            const q = board.questions[col][row];
            const a = (board.answers && board.answers[col]) ? board.answers[col][row] : '';
            
            // Fråge-kort med hover-effekt för att visa facit
            gridHTML += `
                <div class="bg-white border border-slate-200 p-2 text-xs text-center rounded shadow-sm h-24 flex items-center justify-center relative group cursor-default overflow-hidden">
                    <span class="line-clamp-5 leading-tight">${q || '-'}</span>
                    ${a ? `<div class="absolute inset-0 bg-emerald-100 text-emerald-900 font-bold opacity-0 group-hover:opacity-100 p-2 text-xs flex items-center justify-center transition-opacity z-10 rounded text-center break-words">${a}</div>` : ''}
                </div>`;
        }
        gridHTML += `</div>`;
    });
    gridHTML += `</div>`;

    container.innerHTML = `
        <div class="max-w-7xl mx-auto">
            <div class="flex items-end justify-between mb-2">
                <div>
                    <h1 class="text-4xl font-black text-slate-800 mb-2">${board.name}</h1>
                    <p class="text-slate-500 font-medium">30 frågor i detta paket</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="handleAiAuthEdit()" class="px-3 py-2 text-sm font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors flex items-center gap-1 shadow-sm">✨ Redigera med AI</button>
                    <button onclick="deleteCurrentBoard()" class="px-3 py-2 text-sm font-bold text-red-600 bg-white border border-slate-200 hover:bg-red-50 rounded-md transition-colors shadow-sm">Radera</button>
                    <button onclick="openShareModal()" class="px-3 py-2 text-sm font-bold text-blue-600 bg-white border border-slate-200 hover:bg-blue-50 rounded-md transition-colors shadow-sm">Dela</button>
                    <button onclick="toggleEditMode()" class="px-3 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors shadow-sm">Redigera Manuelllt</button>
                    <button onclick="startGame()" class="px-6 py-2 text-sm font-black text-slate-900 bg-amber-400 hover:bg-amber-500 rounded-md transition-colors flex items-center gap-2 shadow-sm">▶ Starta Spel</button>
                </div>
            </div>
            ${gridHTML}
        </div>
    `;
}

// REDIGERINGSLÄGET (Manuell redigering med minimal whitespace)
function renderEditMode(container, board) {
    let gridHTML = `
        <div class="max-w-7xl mx-auto">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-black text-slate-800">Redigerar manuellt: ${board.name}</h2>
                <div class="flex gap-2">
                    <button onclick="toggleEditMode()" class="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-md shadow-sm">Avbryt</button>
                    <button onclick="saveCurrentEdit()" class="px-6 py-2 text-sm font-black text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm">Spara Ändringar</button>
                </div>
            </div>
            
            <input type="text" id="editBoardName" value="${board.name}" class="w-full text-2xl font-bold p-3 mb-6 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
            
            <div class="grid grid-cols-6 gap-2" id="editGridContainer"></div>
        </div>
    `;
    container.innerHTML = gridHTML;
    
    const grid = document.getElementById('editGridContainer');

    // Måla upp kategorierna
    board.categories.forEach((cat, i) => {
        const inp = document.createElement('input');
        inp.value = cat; 
        inp.placeholder = `Kategori ${i+1}`;
        inp.className = "p-2 text-sm font-bold text-center bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 outline-none";
        inp.oninput = (e) => board.categories[i] = e.target.value;
        grid.appendChild(inp);
    });

    // Måla upp 30 textrutor för frågor och svar (Tajt och kompakt)
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 6; col++) {
            const cell = document.createElement('div');
            cell.className = "flex flex-col gap-px bg-slate-200 border border-slate-300 rounded overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:z-10";
            
            const qInp = document.createElement('textarea');
            qInp.value = board.questions[col][row]; 
            qInp.placeholder = `${(row+1)*100}p Fråga`;
            qInp.className = "w-full h-24 resize-none text-sm leading-snug p-2 outline-none text-center bg-white";
            qInp.oninput = (e) => board.questions[col][row] = e.target.value;

            const aInp = document.createElement('textarea');
            aInp.value = (board.answers && board.answers[col]) ? board.answers[col][row] : ''; 
            aInp.placeholder = `Facit (Frivilligt)`;
            aInp.className = "w-full h-10 resize-none text-xs leading-tight p-1 outline-none text-center bg-slate-50 border-t border-slate-200 text-green-700 font-bold placeholder-slate-400";
            aInp.oninput = (e) => board.answers[col][row] = e.target.value;

            cell.appendChild(qInp);
            cell.appendChild(aInp);
            grid.appendChild(cell);
        }
    }
}

// ==========================================
// INTERAKTIONER & KNAPPAR
// ==========================================

window.toggleEditMode = () => { 
    editModeActive = !editModeActive; 
    renderMainContent(); 
};

window.saveCurrentEdit = async () => {
    const board = boards[currentBoardIndex];
    const nameInp = document.getElementById('editBoardName');
    
    if(nameInp) {
        board.name = nameInp.value;
    }
    
    await saveBoard(board);
    boards = await loadAllBoards();
    showToast("Brädet sparades!", false);
    
    editModeActive = false;
    renderSidebar();
    renderMainContent();
};

window.createNewBoard = () => {
    const newBoard = { 
        name: 'Nytt Jeopardy', 
        categories: Array(6).fill(''), 
        questions: Array(6).fill(null).map(() => Array(5).fill('')), 
        answers: Array(6).fill(null).map(() => Array(5).fill('')), 
        media: {} 
    };
    boards.push(newBoard);
    currentBoardIndex = boards.length - 1;
    editModeActive = true;
    renderSidebar();
    renderMainContent();
};

window.deleteCurrentBoard = async () => {
    if(!confirm("Är du säker på att du vill radera spelet?")) return;
    
    await deleteBoard(boards[currentBoardIndex].name);
    boards = await loadAllBoards();
    
    currentBoardIndex = boards.length > 0 ? 0 : -1;
    
    renderSidebar();
    renderMainContent();
};

window.startGame = () => {
    localStorage.setItem('jeopardyCurrentGame', boards[currentBoardIndex].name);
    window.location.href = 'host.html';
};

// ==========================================
// DELA & EXPORT & IMPORT
// ==========================================

window.openShareModal = () => {
    document.getElementById('shareLinkContainer').classList.add('hidden');
    document.getElementById('shareModal').classList.replace('hidden', 'flex');
};

window.closeShareModal = () => {
    document.getElementById('shareModal').classList.replace('flex', 'hidden');
};

window.copyJson = () => {
    const board = boards[currentBoardIndex];
    const exportBoard = { 
        name: board.name, 
        categories: board.categories, 
        questions: board.questions, 
        answers: board.answers 
    };
    
    navigator.clipboard.writeText(JSON.stringify(exportBoard)).then(() => {
        showToast("JSON kopierad till urklipp!", false);
        closeShareModal();
    });
};

window.shareViaLink = async () => {
    const board = boards[currentBoardIndex];
    
    try {
        const shareId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        
        await setDoc(doc(db, "sharedBoards", shareId), {
            name: board.name, 
            categories: board.categories, 
            questionsJson: JSON.stringify(board.questions),
            answersJson: board.answers ? JSON.stringify(board.answers) : null, 
            sharedAt: new Date().toISOString()
        });
        
        const shareUrl = window.location.href.split('?')[0] + '?board=' + shareId;
        document.getElementById('shareLinkOutput').value = shareUrl;
        document.getElementById('shareLinkContainer').classList.remove('hidden');
    } catch (e) {
        showToast('Något gick fel vid delning.', true);
    }
};

window.openImportModal = () => {
    document.getElementById('importKeyInput').value = '';
    document.getElementById('importModal').classList.replace('hidden', 'flex');
};

window.closeImportModal = () => {
    document.getElementById('importModal').classList.replace('flex', 'hidden');
};

window.importBoard = async () => {
    const key = document.getElementById('importKeyInput').value;
    try {
        const newBoard = JSON.parse(key);
        if (newBoard && newBoard.name) {
            // Skapa tomt media-objekt om det saknas
            if (!newBoard.media) newBoard.media = {};
            
            await saveBoard(newBoard);
            boards = await loadAllBoards();
            
            // Hitta det importerade brädet och sätt fokus på det
            currentBoardIndex = boards.findIndex(b => b.name === newBoard.name);
            if(currentBoardIndex === -1) currentBoardIndex = boards.length - 1;

            closeImportModal();
            showToast('Brädet har importerats!', false);
            
            renderSidebar();
            renderMainContent();
        } else {
            throw new Error("Ogiltig JSON");
        }
    } catch (e) { 
        showToast('Ogiltig JSON-kod.', true); 
    }
};

// ==========================================
// AI & AUTENTISERING
// ==========================================

function setupGlobalListeners() {
    // Generera Nytt AI-bräde
    document.getElementById('btnAuthAi')?.addEventListener('click', () => handleAiAuth(false));
    // Importera
    document.getElementById('btnImport')?.addEventListener('click', () => window.openImportModal());
}

// Redigera befintligt AI-bräde
window.handleAiAuthEdit = () => handleAiAuth(true);

async function handleAiAuth(isEditMode) {
    if (auth.currentUser) { 
        verifyDomainAndOpenAi(auth.currentUser, isEditMode); 
        return; 
    }
    
    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        verifyDomainAndOpenAi(result.user, isEditMode);
    } catch (error) { 
        showToast("Inloggningen avbröts.", true); 
    }
}

function verifyDomainAndOpenAi(user, isEditMode) {
    const email = user.email || "";
    if (email.endsWith('@nyamunken.se') || email.endsWith('@utb.linkoping.se')) {
        if(isEditMode) window.openAiEditModal();
        else window.openAiModal();
    } else {
        showToast("AI-funktionen är endast öppen för lärare på Nya Munken.", true);
        auth.signOut();
    }
}

window.showToast = function(message, isError = false) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = message;
    document.getElementById('toastIcon').textContent = isError ? '⚠️' : '✨';
    
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl transition-all duration-300 z-[100] font-bold text-sm flex items-center gap-3 ${isError ? 'bg-red-600' : 'bg-slate-900'} text-white transform translate-y-0 opacity-100`;
    
    setTimeout(() => { 
        toast.classList.add('translate-y-24', 'opacity-0'); 
        toast.classList.remove('translate-y-0', 'opacity-100'); 
    }, 3000);
};

// Export-funktioner som ai.js kan kalla på
export function getCurrentBoardForAI() { 
    return boards[currentBoardIndex]; 
}

export async function applyAiBoard(aiData, overwriteCurrent = false) {
    if (!overwriteCurrent || currentBoardIndex === -1) {
        // Lägg till som nytt bräde
        boards.push(aiData);
        currentBoardIndex = boards.length - 1;
    } else {
        // Skriv över det befintliga brädet på samma index
        boards[currentBoardIndex] = aiData; 
    }
    
    await saveBoard(boards[currentBoardIndex]);
    boards = await loadAllBoards();
    
    // Auto-fokusera på spelet och tvinga gränssnittet att hoppa till visningsläget
    selectBoard(currentBoardIndex); 
    showToast("Brädet är redo!", false);
}
