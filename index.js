// index.js
import { db } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { loadAllBoards, saveBoard, deleteBoard, getBoard, boardHasMedia } from './board-db.js';

let boards = [];
let currentBoard = null;

document.addEventListener('DOMContentLoaded', async () => {
    boards = await loadAllBoards();
    displayBoardList();
    setupEventListeners();
    checkForSharedBoard();
});

async function saveAndRefresh() {
    await saveBoard(currentBoard);
    boards = await loadAllBoards();
}

function displayBoardList() {
    const boardList = document.getElementById('board-list');
    if (!boardList) return; // Säkerhetskoll
    boardList.innerHTML = '';

    if (boards.length === 0) {
        boardList.innerHTML = '<li style="justify-content:center;">Inga sparade bräden finns. Skapa ett nytt!</li>';
    } else {
        boards.forEach((board, index) => {
            if (board && board.name) {
                const li = document.createElement('li');
                const nameSpan = document.createElement('span');
                nameSpan.textContent = board.name.length > 20 ? board.name.substring(0, 17) + '...' : board.name;
                if (boardHasMedia(board)) {
                    const badge = document.createElement('span');
                    badge.textContent = ' 🖼';
                    badge.title = 'Innehåller media';
                    nameSpan.appendChild(badge);
                }
                li.appendChild(nameSpan);
                const buttonsDiv = document.createElement('div');

                const playBtn = document.createElement('button');
                playBtn.textContent = 'Spela';
                playBtn.onclick = () => initiateGame(index);

                const editBtn = document.createElement('button');
                editBtn.textContent = 'Redigera';
                editBtn.onclick = () => editBoard(index);

                const shareBtn = document.createElement('button');
                shareBtn.textContent = 'Dela';
                shareBtn.onclick = () => openShareModal(index);

                const shareLinkBtn = document.createElement('button');
                shareLinkBtn.textContent = 'Dela via länk';
                shareLinkBtn.style.backgroundColor = '#28a745';
                shareLinkBtn.onclick = () => shareViaLink(index);

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Ta bort';
                deleteBtn.style.backgroundColor = '#dc3545';
                deleteBtn.onclick = async () => {
                    if (confirm(`Ta bort "${board.name}"?`)) {
                        await deleteBoard(board.name);
                        boards = await loadAllBoards();
                        displayBoardList();
                    }
                };

                buttonsDiv.append(playBtn, editBtn, shareBtn, shareLinkBtn, deleteBtn);
                li.appendChild(buttonsDiv);
                boardList.appendChild(li);
            }
        });
    }
}

function setupEventListeners() {
    document.getElementById('create-board').addEventListener('click', createNewBoard);

    document.getElementById('import-board-btn').addEventListener('click', () => {
        document.getElementById('import-key-input').value = '';
        document.getElementById('import-modal').style.display = 'flex';
    });

    document.getElementById('confirm-import-btn').addEventListener('click', importBoard);
    document.getElementById('save-board').addEventListener('click', saveCurrentBoard);

    document.getElementById('return-main').addEventListener('click', () => {
        saveCurrentBoard();
        showSplashScreen();
    });

    document.getElementById('toggle-image-mode').addEventListener('click', () => toggleMediaMode('image'));
    document.getElementById('toggle-sound-mode').addEventListener('click', () => toggleMediaMode('sound'));
    document.getElementById('copy-key-btn').addEventListener('click', copyKeyToClipboard);
    document.getElementById('copy-link-share-btn').addEventListener('click', () => {
        const input = document.getElementById('share-link-output');
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
            showModal('Klart!', 'Länken har kopierats till urklipp.');
        });
    });

    document.getElementById('media-share-ok-btn').addEventListener('click', () => {
        document.getElementById('media-share-modal').style.display = 'none';
    });
}

function showMediaShareBlock() {
    document.getElementById('media-share-modal').style.display = 'flex';
}

function openShareModal(index) {
    const board = boards[index];
    if (boardHasMedia(board)) { showMediaShareBlock(); return; }
    // Strip media key for clean JSON export
    const exportBoard = { name: board.name, categories: board.categories, questions: board.questions, answers: board.answers }; 
    document.getElementById('share-key-output').value = JSON.stringify(exportBoard);
    document.getElementById('share-modal').style.display = 'flex';
}

function copyKeyToClipboard() {
    const shareKey = document.getElementById('share-key-output');
    shareKey.select();
    document.execCommand('copy');
    showModal('Klart!', 'Nyckeln har kopierats till urklipp.');
}

async function shareViaLink(index) {
    const board = boards[index];
    if (boardHasMedia(board)) { showMediaShareBlock(); return; }

    const modal = document.getElementById('share-link-modal');
    const statusEl = document.getElementById('share-link-status');
    const linkOutput = document.getElementById('share-link-output');

    statusEl.textContent = 'Sparar brädet...';
    linkOutput.value = '';
    modal.style.display = 'flex';

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
        linkOutput.value = shareUrl;
        statusEl.textContent = 'Brädet har sparats! Dela länken nedan:';
    } catch (e) {
        console.error('Fel vid delning:', e);
        statusEl.textContent = 'Något gick fel. Försök igen.';
    }
}

async function checkForSharedBoard() {
    const params = new URLSearchParams(window.location.search);
    const boardId = params.get('board');
    if (!boardId) return;

    try {
        const docSnap = await getDoc(doc(db, "sharedBoards", boardId));
        if (docSnap.exists()) {
            const sharedBoard = docSnap.data();
            const boardData = {
                name: sharedBoard.name,
                categories: sharedBoard.categories,
                questions: JSON.parse(sharedBoard.questionsJson),
                answers: sharedBoard.answersJson ? JSON.parse(sharedBoard.answersJson) : null 
            };

            const existingIndex = boards.findIndex(b => b.name === boardData.name);
            if (existingIndex >= 0) {
                if (confirm(`Du har redan ett bräde med namnet "${boardData.name}". Vill du skriva över det?`)) {
                    boards[existingIndex] = boardData;
                } else {
                    boardData.name = boardData.name + ' (delad)';
                    boards.push(boardData);
                }
            } else {
                boards.push(boardData);
            }

            await saveBoard(boardData);
            boards = await loadAllBoards();
            displayBoardList();
            showModal('Importerat!', `Brädet "${boardData.name}" har lagts till i dina sparade bräden.`);
        } else {
            showModal('Fel', 'Det delade brädet hittades inte.');
        }
    } catch (e) {
        console.error('Fel vid hämtning av delat bräde:', e);
        showModal('Fel', 'Kunde inte hämta det delade brädet.');
    }

    window.history.replaceState({}, document.title, window.location.pathname);
}

async function importBoard() {
    const key = document.getElementById('import-key-input').value;
    try {
        const newBoard = JSON.parse(key);
        if (newBoard && newBoard.name) {
            const existingIndex = boards.findIndex(b => b.name === newBoard.name);
            if (existingIndex >= 0) {
                if (!confirm(`Skriva över brädet "${newBoard.name}"?`)) return;
            }

            await saveBoard(newBoard);
            boards = await loadAllBoards();
            displayBoardList();
            document.getElementById('import-modal').style.display = 'none';
            showModal('Lyckades', 'Brädet har importerats!');
        } else throw new Error();
    } catch (e) { showModal('Fel', 'Ogiltig nyckel.'); }
}

function showSplashScreen() {
    document.getElementById('splash-screen').style.display = 'flex';
    document.getElementById('edit-mode').style.display = 'none';
    displayBoardList();
}

function createNewBoard() {
    currentBoard = { 
        name: 'Nytt Spel', 
        categories: Array(6).fill(''), 
        questions: Array(6).fill(null).map(() => Array(5).fill('')), 
        answers: Array(6).fill(null).map(() => Array(5).fill('')),
        media: {} 
    };
    editCurrentBoard();
}

function editBoard(index) {
    currentBoard = JSON.parse(JSON.stringify(boards[index]));
    if (!currentBoard.media) currentBoard.media = {};
    if (!currentBoard.answers) {
        currentBoard.answers = Array(6).fill(null).map(() => Array(5).fill(''));
    }
    editCurrentBoard();
}

let mediaMode = null;

function editCurrentBoard() {
    mediaMode = null;
    document.getElementById('splash-screen').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'block';
    renderEditGrid();
}

function renderEditGrid() {
    const editGrid = document.getElementById('edit-grid');
    if (!editGrid) return;
    editGrid.innerHTML = '';

    const nameInput = document.createElement('input');
    nameInput.value = currentBoard.name; nameInput.placeholder = 'Spelets Namn';
    nameInput.oninput = (e) => currentBoard.name = e.target.value;
    nameInput.style.gridColumn = 'span 6'; nameInput.style.fontWeight = 'bold';
    editGrid.appendChild(nameInput);

    currentBoard.categories.forEach((cat, i) => {
        const catInput = document.createElement('input'); catInput.value = cat; catInput.placeholder = `Kategori ${i + 1}`;
        catInput.style.backgroundColor = '#e6f2ff'; catInput.oninput = (e) => currentBoard.categories[i] = e.target.value;
        editGrid.appendChild(catInput);
    });

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 6; col++) {
            const cellWrapper = document.createElement('div');
            cellWrapper.className = 'edit-cell';

            const mediaKey = `${col}-${row}`;
            const hasMedia = currentBoard.media[mediaKey];

            const editorDiv = document.createElement('div');
            editorDiv.className = 'cell-editor';

            const qInput = document.createElement('textarea');
            qInput.className = 'q-input';
            qInput.value = currentBoard.questions[col][row];
            qInput.placeholder = `Fråga ${row + 1} (${(row+1)*100}p)`;
            qInput.oninput = (e) => currentBoard.questions[col][row] = e.target.value;

            const aInput = document.createElement('textarea');
            aInput.className = 'a-input';
            aInput.value = currentBoard.answers && currentBoard.answers[col] ? currentBoard.answers[col][row] : '';
            aInput.placeholder = `Facit (Frivilligt)`;
            aInput.oninput = (e) => {
                if (!currentBoard.answers) currentBoard.answers = Array(6).fill(null).map(() => Array(5).fill(''));
                currentBoard.answers[col][row] = e.target.value;
            };

            const handleEnter = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); 
                    e.target.blur(); 
                }
            };
            qInput.onkeydown = handleEnter;
            aInput.onkeydown = handleEnter;

            editorDiv.appendChild(qInput);
            editorDiv.appendChild(aInput);
            cellWrapper.appendChild(editorDiv);

            if (hasMedia) {
                const indicator = document.createElement('div');
                indicator.className = 'media-indicator';
                indicator.textContent = hasMedia.type === 'image' ? `🖼 ${hasMedia.name}` : `🔊 ${hasMedia.name}`;
                indicator.title = 'Klicka för att ta bort';
                indicator.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`Ta bort media "${hasMedia.name}"?`)) {
                        delete currentBoard.media[mediaKey];
                        renderEditGrid();
                    }
                };
                cellWrapper.appendChild(indicator);
            }

            if (mediaMode) {
                cellWrapper.classList.add('media-pick-mode');
                const overlay = document.createElement('div');
                overlay.className = 'media-pick-overlay';
                overlay.textContent = mediaMode === 'image' ? '🖼' : '🔊';
                overlay.onclick = (e) => { e.stopPropagation(); pickMedia(col, row, mediaMode); };
                cellWrapper.appendChild(overlay);
            }

            editGrid.appendChild(cellWrapper);
        }
    }

    updateMediaToggleButtons();
}

function toggleMediaMode(type) {
    mediaMode = mediaMode === type ? null : type;
    renderEditGrid();
}

function updateMediaToggleButtons() {
    const imgToggle = document.getElementById('toggle-image-mode');
    const sndToggle = document.getElementById('toggle-sound-mode');
    if (imgToggle) {
        imgToggle.classList.toggle('active', mediaMode === 'image');
        imgToggle.textContent = mediaMode === 'image' ? '🖼 Lägg till bild (klicka på ruta)' : '🖼 Bild';
    }
    if (sndToggle) {
        sndToggle.classList.toggle('active', mediaMode === 'sound');
        sndToggle.textContent = mediaMode === 'sound' ? '🔊 Lägg till ljud (klicka på ruta)' : '🔊 Ljud';
    }
}

function pickMedia(col, row, type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'image' ? 'image/*' : 'audio/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const mediaKey = `${col}-${row}`;
            currentBoard.media[mediaKey] = {
                type: type,
                data: reader.result,
                name: file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name
            };
            mediaMode = null; 
            renderEditGrid();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

async function saveCurrentBoard() {
    const inputs = document.querySelectorAll('#edit-grid input, #edit-grid textarea');
    inputs.forEach(input => input.classList.remove('incomplete'));

    await saveBoard(currentBoard);
    boards = await loadAllBoards();

    const saveBtn = document.getElementById('save-board');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Sparat! ✓';
    saveBtn.style.backgroundColor = '#28a745';

    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.backgroundColor = '#1e90ff';
    }, 2000);
}

async function initiateGame(index) {
    localStorage.setItem('jeopardyCurrentGame', boards[index].name);
    window.location.href = 'host.html';
}

function showModal(title, text) {
    document.getElementById('generic-modal-title').textContent = title;
    document.getElementById('generic-modal-text').textContent = text;
    document.getElementById('generic-modal').style.display = 'flex';
}

// ----------------------------------------------------
// AI-FUNKTIONER 
// Detta gör att ai.js hittar export-funktionerna!
// ----------------------------------------------------

// Låter ai.js hämta spelet vi har öppet
export function getCurrentBoardForAI() {
    return currentBoard;
}

// Låter ai.js skicka in det nya genererade brädet och rita upp det
export async function applyAiBoard(aiData) {
    currentBoard = aiData;
    await saveBoard(currentBoard);
    boards = await loadAllBoards();
    displayBoardList();
    renderEditGrid(); // Ritar upp UI:t med nya datan
    showModal('AI Klar!', 'Brädet har genererats och sparats!');
}
