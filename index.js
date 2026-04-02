import { auth, db } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { loadAllBoards, saveBoard, deleteBoard, getBoard, boardHasMedia } from './board-db.js';

let boards = [];
let currentBoardIndex = -1;
let editModeActive = false;
window.originalBoardBackup = null; // Sparar originalet ifall vi vill ångra en AI-redigering

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Sidan laddad, påbörjar initiering...");
    
    try {
        boards = await loadAllBoards();
        console.log("Lokala bräden laddade:", boards.length);
    } catch (e) {
        console.warn("Kunde inte ladda lokala sparfiler:", e);
        boards = [];
    }

    await checkForSharedBoard(); 
    
    renderSidebar();
    renderMainContent(); 
    setupGlobalListeners();
});

// ==========================================
// RENDERING AV GRÄNSSNITT
// ==========================================

function renderSidebar() {
    const list = document.getElementById('boardsList');
    if (!list) return;
    list.innerHTML = '';

    if (boards.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = "text-sm text-slate-400 p-2 italic text-center";
        emptyMsg.textContent = "Inga sparade bräden.";
        list.appendChild(emptyMsg);
        return;
    }

    boards.forEach((board, index) => {
        const btn = document.createElement('button');
        const isActive = index === currentBoardIndex;
        
        btn.className = `w-full text-left px-4 py-3 flex justify-between items-center rounded-lg transition-colors border ${isActive ? 'bg-amber-50 border-amber-200 text-slate-900 font-bold' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-100'}`;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = "truncate pr-2";
        nameSpan.textContent = board.name; 

        const countSpan = document.createElement('span');
        countSpan.className = `text-xs ${isActive ? 'text-amber-600' : 'text-slate-400'} font-bold flex-shrink-0`;
        countSpan.textContent = "30";

        btn.appendChild(nameSpan);
        btn.appendChild(countSpan);
        
        btn.onclick = () => window.selectBoard(index, true);
        list.appendChild(btn);
    });
}

window.selectBoard = (index, clearDrafts = true) => {
    // Om användaren klickar i menyn medan AI-förslag granskas -> Avbryt automatiskt
    if (clearDrafts && window.aiDrafts && window.aiDrafts.length > 0) {
        window.cancelDraftSelection(true); // true = tyst avbrott
    }

    currentBoardIndex = index;
    editModeActive = false;
    
    renderSidebar();
    renderMainContent();
};

function renderMainContent() {
    const container = document.getElementById('mainContent');
    if (!container) return;
    
    container.innerHTML = '';

    if (currentBoardIndex === -1 || !boards[currentBoardIndex]) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = "h-full flex flex-col items-center justify-center text-slate-400";
        const p = document.createElement('p');
        p.className = "text-xl font-bold";
        p.textContent = "Välj ett bräde i menyn eller skapa ett nytt.";
        emptyDiv.appendChild(p);
        container.appendChild(emptyDiv);
        return;
    }

    const board = boards[currentBoardIndex];
    if (editModeActive) {
        renderEditMode(container, board);
    } else {
        renderViewMode(container, board);
        setTimeout(() => {
            if(document.getElementById('draftContainer')) window.renderDraftSelector();
        }, 50);
    }
}

function renderViewMode(container, board) {
    const wrapper = document.createElement('div');
    wrapper.className = "max-w-7xl mx-auto";

    const header = document.createElement('div');
    header.className = "flex items-end justify-between mb-2";

    const titleInfo = document.createElement('div');
    const h1 = document.createElement('h1');
    h1.className = "text-4xl font-black text-slate-800 mb-2";
    h1.textContent = board.name; 
    const subP = document.createElement('p');
    subP.className = "text-slate-500 font-medium";
    subP.textContent = "30 frågor i detta paket";
    titleInfo.append(h1, subP);

    const btnGroup = document.createElement('div');
    btnGroup.className = "flex gap-2";
    
    const hasDrafts = window.aiDrafts && window.aiDrafts.length > 0;

    // Byter ut knapparna när vi granskar AI-förslag
    if (hasDrafts) {
        btnGroup.innerHTML = `
            <span class="text-sm font-bold text-indigo-600 flex items-center mr-4 animate-pulse">Du granskar just nu AI-förslag...</span>
            <button onclick="cancelDraftSelection()" class="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-md shadow-sm transition">❌ Avbryt</button>
            <button onclick="confirmDraftSelection()" class="px-6 py-2 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-md transition-transform hover:scale-105">✅ Spara detta</button>
        `;
    } else {
        btnGroup.innerHTML = `
            <button onclick="deleteCurrentBoard()" class="px-3 py-2 text-sm font-bold text-red-600 bg-white border border-slate-200 hover:bg-red-50 rounded-md transition-colors shadow-sm">Radera</button>
            <button onclick="openShareModal()" class="px-3 py-2 text-sm font-bold text-blue-600 bg-white border border-slate-200 hover:bg-blue-50 rounded-md transition-colors shadow-sm">Dela</button>
            <button onclick="handleAiAuthEdit()" class="px-3 py-2 text-sm font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors flex items-center gap-1 shadow-sm">✨ Redigera med AI</button>
            <button onclick="toggleEditMode()" class="px-3 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors shadow-sm">Redigera Manuellt</button>
            <button onclick="startGame()" class="px-6 py-2 text-sm font-black text-slate-900 bg-amber-400 hover:bg-amber-500 rounded-md transition-colors flex items-center gap-2 shadow-sm">▶ Starta Spel</button>
        `;
    }

    header.append(titleInfo, btnGroup);
    wrapper.appendChild(header);

    const draftContainer = document.createElement('div');
    draftContainer.id = 'draftContainer';
    wrapper.appendChild(draftContainer);

    const grid = document.createElement('div');
    grid.className = "grid grid-cols-6 gap-2 mt-6";

    board.categories.forEach((cat, col) => {
        const colDiv = document.createElement('div');
        colDiv.className = "flex flex-col gap-2";

        const catHead = document.createElement('div');
        catHead.className = "bg-blue-900 text-white font-bold p-3 text-center text-sm rounded-md shadow-sm h-14 flex items-center justify-center leading-tight uppercase tracking-tighter";
        catHead.textContent = cat || '???'; 
        colDiv.appendChild(catHead);

        for(let row = 0; row < 5; row++) {
            const q = board.questions[col][row];
            const a = (board.answers && board.answers[col]) ? board.answers[col][row] : '';

            const cell = document.createElement('div');
            cell.className = "bg-white border border-slate-200 p-2 text-xs text-center rounded shadow-sm h-24 flex items-center justify-center relative group cursor-default overflow-hidden";
            
            const qSpan = document.createElement('span');
            qSpan.className = "line-clamp-5 leading-tight text-slate-700";
            qSpan.textContent = q || '-'; 
            cell.appendChild(qSpan);

            if (a) {
                const aDiv = document.createElement('div');
                aDiv.className = "absolute inset-0 bg-emerald-100 text-emerald-900 font-bold opacity-0 group-hover:opacity-100 p-2 text-[10px] flex items-center justify-center transition-opacity z-10 rounded text-center break-words leading-none";
                aDiv.textContent = a; 
                cell.appendChild(aDiv);
            }
            colDiv.appendChild(cell);
        }
        grid.appendChild(colDiv);
    });

    wrapper.appendChild(grid);
    container.appendChild(wrapper);
}

function renderEditMode(container, board) {
    container.innerHTML = ''; 

    const wrapper = document.createElement('div');
    wrapper.className = "max-w-7xl mx-auto";

    const header = document.createElement('div');
    header.className = "flex items-center justify-between mb-6";

    const h2 = document.createElement('h2');
    h2.className = "text-2xl font-black text-slate-800";
    h2.textContent = `Redigerar manuellt: ${board.name}`; 

    const btnGroup = document.createElement('div');
    btnGroup.className = "flex gap-2";
    btnGroup.innerHTML = `
        <button onclick="toggleEditMode()" class="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-md shadow-sm">Avbryt</button>
        <button onclick="saveCurrentEdit()" class="px-6 py-2 text-sm font-black text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm">Spara Ändringar</button>
    `;

    header.append(h2, btnGroup);

    const nameInp = document.createElement('input');
    nameInp.type = "text";
    nameInp.id = "editBoardName";
    nameInp.value = board.name; 
    nameInp.className = "w-full text-2xl font-bold p-3 mb-6 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none";

    const grid = document.createElement('div');
    grid.className = "grid grid-cols-6 gap-2";
    grid.id = "editGridContainer";

    wrapper.append(header, nameInp, grid);
    container.appendChild(wrapper);

    board.categories.forEach((cat, i) => {
        const inp = document.createElement('input');
        inp.value = cat; 
        inp.placeholder = `Kategori ${i+1}`;
        inp.className = "p-2 text-sm font-bold text-center bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 outline-none";
        inp.oninput = (e) => board.categories[i] = e.target.value;
        grid.appendChild(inp);
    });

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 6; col++) {
            const cell = document.createElement('div');
            cell.className = "flex flex-col gap-px bg-slate-200 border border-slate-300 rounded overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:z-10";
            
            const qInp = document.createElement('textarea');
            qInp.value = board.questions[col][row]; 
            qInp.className = "w-full h-24 resize-none text-sm leading-snug p-2 outline-none text-center bg-white";
            qInp.oninput = (e) => board.questions[col][row] = e.target.value;

            const aInp = document.createElement('textarea');
            aInp.value = (board.answers && board.answers[col]) ? board.answers[col][row] : ''; 
            aInp.className = "w-full h-10 resize-none text-[10px] leading-tight p-1 outline-none text-center bg-slate-50 border-t border-slate-200 text-green-700 font-bold";
            aInp.oninput = (e) => board.answers[col][row] = e.target.value;

            cell.append(qInp, aInp);
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
    if(nameInp) board.name = nameInp.value;
    
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
    const exportBoard = { name: board.name, categories: board.categories, questions: board.questions, answers: board.answers };
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
            if (!newBoard.media) newBoard.media = {};
            await saveBoard(newBoard);
            boards = await loadAllBoards();
            currentBoardIndex = boards.findIndex(b => b.name === newBoard.name);
            if(currentBoardIndex === -1) currentBoardIndex = boards.length - 1;
            closeImportModal();
            showToast('Brädet har importerats!', false);
            renderSidebar();
            renderMainContent();
        } else throw new Error("Ogiltig JSON");
    } catch (e) { showToast('Ogiltig JSON-kod.', true); }
};

async function checkForSharedBoard() {
    const params = new URLSearchParams(window.location.search);
    const boardId = params.get('board');
    if (!boardId) return;

    console.log("Delnings-ID hittat:", boardId);

    try {
        const docRef = doc(db, "sharedBoards", boardId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const sharedBoard = docSnap.data();
            
            const boardData = {
                name: sharedBoard.name,
                categories: sharedBoard.categories,
                questions: JSON.parse(sharedBoard.questionsJson),
                answers: sharedBoard.answersJson ? JSON.parse(sharedBoard.answersJson) : null,
                media: {} 
            };

            const existingIndex = boards.findIndex(b => b.name === boardData.name);
            if (existingIndex >= 0) {
                if (confirm(`Du har redan "${boardData.name}". Skriva över?`)) {
                    boards[existingIndex] = boardData;
                    currentBoardIndex = existingIndex;
                } else {
                    boardData.name += ' (delad)';
                    boards.push(boardData);
                    currentBoardIndex = boards.length - 1;
                }
            } else {
                boards.push(boardData);
                currentBoardIndex = boards.length - 1;
            }

            await saveBoard(boards[currentBoardIndex]);
            showToast(`Brädet "${boardData.name}" har importerats!`, false);
        } else {
            showToast('Länken är ogiltig eller brädet har raderats.', true);
        }
    } catch (e) {
        showToast('Kunde inte hämta det delade brädet.', true);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
}

// ==========================================
// AI & AUTENTISERING & EVENT LISTENERS
// ==========================================

function setupGlobalListeners() {
    document.getElementById('btnAuthAi')?.addEventListener('click', () => handleAiAuth(false));
    document.getElementById('btnImport')?.addEventListener('click', () => window.openImportModal());

    window.addEventListener('beforeunload', (e) => {
        if (window.aiDrafts && window.aiDrafts.length > 0) {
            e.preventDefault();
            e.returnValue = 'Du har obekräftade AI-alternativ. Ändringarna sparas inte om du lämnar nu.';
        }
    });
}

window.handleAiAuthEdit = () => handleAiAuth(true);

async function handleAiAuth(isEditMode) {
    if (auth.currentUser) { verifyDomainAndOpenAi(auth.currentUser, isEditMode); return; }
    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        verifyDomainAndOpenAi(result.user, isEditMode);
    } catch (error) { showToast("Inloggningen avbröts.", true); }
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
    if(!toast) return;
    document.getElementById('toastMsg').textContent = message;
    document.getElementById('toastIcon').textContent = isError ? '⚠️' : '✨';
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl transition-all duration-300 z-[100] font-bold text-sm flex items-center gap-3 ${isError ? 'bg-red-600' : 'bg-slate-900'} text-white transform translate-y-0 opacity-100`;
    setTimeout(() => { toast.classList.add('translate-y-24', 'opacity-0'); toast.classList.remove('translate-y-0', 'opacity-100'); }, 3000);
};

export function getCurrentBoardForAI() { return boards[currentBoardIndex]; }

// ==========================================
// AI DRAFT HANTERING
// ==========================================

export async function applyAiBoard(aiData, overwriteCurrent = false) {
    // Spara en backup av originalet ifall användaren ångrar sig
    if (overwriteCurrent && currentBoardIndex !== -1) {
        if (!window.originalBoardBackup) {
            window.originalBoardBackup = JSON.parse(JSON.stringify(boards[currentBoardIndex]));
        }
        // TVINGA SAMMA NAMN: Detta förhindrar att AI:n råkar skapa dubbletter i databasen
        aiData.name = window.originalBoardBackup.name;
        boards[currentBoardIndex] = aiData; 
    } else {
        // Nytt bräde som AI skapat
        if (!window.originalBoardBackup) {
            window.originalBoardBackup = "NEW"; 
            boards.push(aiData);
            currentBoardIndex = boards.length - 1;
        } else if (window.originalBoardBackup === "NEW") {
            boards[currentBoardIndex] = aiData; // Uppdaterar bara arbetsminnet om vi växlar alternativ
        }
    }
    
    if (typeof window.activeDraftIndex === 'undefined') {
        window.activeDraftIndex = 0;
    }

    // False = rensa INTE drafts. VIKTIGT: Vi sparar inte till databasen här längre! Det sker vid bekräftelse.
    window.selectBoard(currentBoardIndex, false); 
}

window.confirmDraftSelection = async () => {
    const boardToSave = boards[currentBoardIndex];
    
    // NU sparar vi till databasen!
    await saveBoard(boardToSave);
    boards = await loadAllBoards(); 
    
    // Uppdatera pekaren ifall sorteringen ändrades (gäller framförallt nya bräden)
    currentBoardIndex = boards.findIndex(b => b.name === boardToSave.name);
    if(currentBoardIndex === -1) currentBoardIndex = 0;

    // Nollställ draft-läget
    window.aiDrafts = [];
    window.activeDraftIndex = 0;
    window.originalBoardBackup = null;
    
    showToast("Alternativ valt och sparat!", false);
    renderSidebar();
    renderMainContent(); 
};

window.cancelDraftSelection = (isSilent = false) => {
    // Återställ antingen det gamla brädet, eller ta bort det nya helt från arrayen
    if (window.originalBoardBackup && window.originalBoardBackup !== "NEW") {
        boards[currentBoardIndex] = window.originalBoardBackup;
    } else if (window.originalBoardBackup === "NEW") {
        boards.splice(currentBoardIndex, 1);
        currentBoardIndex = boards.length > 0 ? 0 : -1;
    }
    
    window.aiDrafts = [];
    window.activeDraftIndex = 0;
    window.originalBoardBackup = null;
    
    if (!isSilent) {
        showToast("AI-förslagen avfärdades.", false);
        renderSidebar();
        renderMainContent();
    }
};

window.renderDraftSelector = () => {
    const container = document.getElementById('draftContainer');
    if (!container || !window.aiDrafts || window.aiDrafts.length === 0) {
        if(container) container.innerHTML = '';
        return;
    }

    container.innerHTML = '';
    
    const banner = document.createElement('div');
    banner.className = "bg-indigo-50 border border-indigo-200 rounded-lg p-3 mt-4 mb-2 flex items-center gap-3 flex-wrap shadow-sm";
    
    const label = document.createElement('span');
    label.className = "text-sm font-bold text-indigo-800 flex items-center gap-2";
    label.innerHTML = "✨ Genererade AI-alternativ:";
    banner.appendChild(label);

    window.aiDrafts.forEach((draft, idx) => {
        const isActive = (window.activeDraftIndex === idx);
        const btn = document.createElement('button');
        
        if (isActive) {
            btn.className = "px-4 py-2 text-sm font-black text-white bg-indigo-600 rounded-md shadow-md ring-2 ring-indigo-400 ring-offset-1 transition-all";
        } else {
            btn.className = "px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md shadow-sm transition-all";
        }
        
        btn.textContent = `Alternativ ${idx + 1}`;
        
        btn.onclick = () => {
            if (window.activeDraftIndex === idx) return; 
            
            window.activeDraftIndex = idx;
            
            // Uppdatera brädet med detta utkast (och tvinga fram rätt namn om vi redigerar)
            const draftBoard = JSON.parse(JSON.stringify(draft.board));
            if (window.originalBoardBackup !== "NEW") {
                draftBoard.name = window.originalBoardBackup.name;
            }
            boards[currentBoardIndex] = draftBoard;
            
            renderMainContent(); 
        };

        banner.appendChild(btn);
    });

    container.appendChild(banner);
};
