import { auth, db } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { loadAllBoards, saveBoard, deleteBoard, getBoard, boardHasMedia } from './board-db.js';

let boards = [];
let currentBoardIndex = -1;
let editModeActive = false;
let mediaMode = null;

document.addEventListener('DOMContentLoaded', async () => {
    boards = await loadAllBoards();
    renderSidebar();
    setupGlobalListeners();
});

// -- UI RENDERING --

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
        
        // Stajla knappen enligt referensbilden (aktiv = ljusgul bakgrund)
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
        container.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-slate-400"><p class="text-xl font-bold">Välj ett bräde i menyn.</p></div>`;
        return;
    }

    const board = boards[currentBoardIndex];

    if (editModeActive) {
        renderEditMode(container, board);
    } else {
        renderViewMode(container, board);
    }
}

function renderViewMode(container, board) {
    // Genererar vyn som liknar "På Rätt Spår" (Titel + Knappar + Kategorier)
    container.innerHTML = `
        <div class="max-w-5xl mx-auto">
            <div class="flex items-end justify-between mb-8">
                <div>
                    <h1 class="text-4xl font-black text-slate-800 mb-2">${board.name}</h1>
                    <p class="text-slate-500 font-medium">30 frågor i detta paket ${boardHasMedia(board) ? '🖼' : ''}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="deleteCurrentBoard()" class="px-4 py-2 text-sm font-bold text-red-600 border border-red-200 bg-white hover:bg-red-50 rounded-md transition-colors flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        Radera
                    </button>
                    <button onclick="toggleEditMode()" class="px-4 py-2 text-sm font-bold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-md transition-colors">
                        Redigera
                    </button>
                    <button onclick="startGame()" class="px-6 py-2 text-sm font-black text-slate-900 bg-amber-400 hover:bg-amber-500 rounded-md transition-colors flex items-center gap-2 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        Starta Spel
                    </button>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Kategorier i spelet</h3>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                    ${board.categories.map((cat, i) => `
                        <div class="bg-slate-50 border border-slate-100 p-4 rounded-lg font-bold text-slate-700">
                            ${i+1}. ${cat || 'Opublicerad kategori'}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderEditMode(container, board) {
    // Redigeringsrutnätet (Motsvarar din gamla kod men anpassad för den nya containern)
    let gridHTML = `
        <div class="max-w-7xl mx-auto">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-black text-slate-800">Redigerar: ${board.name}</h2>
                <div class="flex gap-2">
                    <button onclick="toggleEditMode()" class="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-md">Tillbaka</button>
                    <button onclick="saveCurrentEdit()" class="px-6 py-2 text-sm font-black text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm">Spara Ändringar</button>
                </div>
            </div>
            
            <input type="text" id="editBoardName" value="${board.name}" class="w-full text-2xl font-bold p-3 mb-6 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Spelets namn">

            <div class="grid grid-cols-6 gap-2" id="editGridContainer"></div>
        </div>
    `;
    container.innerHTML = gridHTML;

    const grid = document.getElementById('editGridContainer');

    // Kategorier
    board.categories.forEach((cat, i) => {
        const inp = document.createElement('input');
        inp.value = cat; inp.placeholder = `Kategori ${i+1}`;
        inp.className = "p-3 font-bold text-center bg-blue-50 border border-blue-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none";
        inp.oninput = (e) => board.categories[i] = e.target.value;
        grid.appendChild(inp);
    });

    // Frågor och Svar (30 loopar)
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 6; col++) {
            const cell = document.createElement('div');
            cell.className = "relative flex flex-col gap-1 border border-slate-200 rounded-md p-2 bg-white group focus-within:ring-2 focus-within:ring-blue-500 focus-within:z-10";
            
            const qInp = document.createElement('textarea');
            qInp.value = board.questions[col][row]; qInp.placeholder = `${(row+1)*100}p Fråga`;
            qInp.className = "w-full h-16 resize-none text-sm p-1 outline-none text-center bg-transparent";
            qInp.oninput = (e) => board.questions[col][row] = e.target.value;

            const aInp = document.createElement('textarea');
            aInp.value = (board.answers && board.answers[col]) ? board.answers[col][row] : ''; aInp.placeholder = `Facit`;
            aInp.className = "w-full h-10 resize-none text-xs p-1 outline-none text-center bg-slate-50 border-t border-slate-100 text-slate-500 hidden group-focus-within:block";
            aInp.oninput = (e) => board.answers[col][row] = e.target.value;

            cell.appendChild(qInp);
            cell.appendChild(aInp);
            grid.appendChild(cell);
        }
    }
}

// -- AKTIONER --

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
    const boardName = boards[currentBoardIndex].name;
    await deleteBoard(boardName);
    boards = await loadAllBoards();
    currentBoardIndex = boards.length > 0 ? 0 : -1;
    renderSidebar();
    renderMainContent();
};

window.startGame = () => {
    localStorage.setItem('jeopardyCurrentGame', boards[currentBoardIndex].name);
    window.location.href = 'host.html';
};

// -- AI & AUTH --

function setupGlobalListeners() {
    document.getElementById('btnAuthAi')?.addEventListener('click', handleAiAuth);
}

async function handleAiAuth() {
    // Om användaren redan är inloggad
    if (auth.currentUser) {
        verifyDomainAndOpenAi(auth.currentUser);
        return;
    }

    // Logga in med Google
    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        verifyDomainAndOpenAi(result.user);
    } catch (error) {
        console.error("Inloggningsfel:", error);
        showToast("Inloggningen avbröts.", true);
    }
}

function verifyDomainAndOpenAi(user) {
    const email = user.email || "";
    // Kontrollerar mot Nya Munkens eller Linköpings utb-domän. Ändra strängarna efter behov!
    if (email.endsWith('@nyamunken.se') || email.endsWith('@utb.linkoping.se')) {
        window.openAiModal();
    } else {
        showToast("AI-funktionen är endast öppen för lärare på Nya Munken.", true);
        auth.signOut(); // Loggar ut obehöriga direkt
    }
}

// Globala funktioner för ai.js och html
window.showToast = function(message, isError = false) {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMsg');
    const icon = document.getElementById('toastIcon');
    
    msg.textContent = message;
    icon.textContent = isError ? '⚠️' : '✨';
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl transition-all duration-300 z-[100] font-bold text-sm flex items-center gap-3 ${isError ? 'bg-red-600' : 'bg-slate-900'} text-white transform translate-y-0 opacity-100`;
    
    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3000);
};

export function getCurrentBoardForAI() {
    return boards[currentBoardIndex];
}

export async function applyAiBoard(aiData) {
    if(currentBoardIndex === -1) {
        boards.push(aiData);
        currentBoardIndex = boards.length - 1;
    } else {
        // Skriver över aktuellt bräde, behåll namnet om du vill
        boards[currentBoardIndex] = aiData; 
    }
    await saveBoard(boards[currentBoardIndex]);
    boards = await loadAllBoards();
    renderSidebar();
    renderMainContent();
}
