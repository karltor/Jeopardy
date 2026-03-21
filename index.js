// index.js
let boards = [];
let currentBoard = null;

document.addEventListener('DOMContentLoaded', () => {
    loadBoards();
    setupEventListeners();
});

function loadBoards() {
    boards = JSON.parse(localStorage.getItem('jeopardyBoards')) || [];
    displayBoardList();
}

function saveBoards() {
    localStorage.setItem('jeopardyBoards', JSON.stringify(boards));
}

function displayBoardList() {
    const boardList = document.getElementById('board-list');
    boardList.innerHTML = '';
    
    if (boards.length === 0) {
        boardList.innerHTML = '<li style="justify-content:center;">Inga sparade bräden finns. Skapa ett nytt!</li>';
    } else {
        boards.forEach((board, index) => {
            if (board && board.name) {
                const li = document.createElement('li');
                li.textContent = board.name.length > 20 ? board.name.substring(0, 17) + '...' : board.name;
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
                
                const deleteBtn = document.createElement('button'); 
                deleteBtn.textContent = 'Ta bort'; 
                deleteBtn.style.backgroundColor = '#dc3545';
                deleteBtn.onclick = () => {
                    if (confirm(`Ta bort "${board.name}"?`)) { 
                        boards.splice(index, 1); 
                        saveBoards(); 
                        displayBoardList(); 
                    }
                };

                buttonsDiv.append(playBtn, editBtn, shareBtn, deleteBtn);
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
    
    document.getElementById('copy-key-btn').addEventListener('click', copyKeyToClipboard);
}

function openShareModal(index) {
    document.getElementById('share-key-output').value = JSON.stringify(boards[index]);
    document.getElementById('share-modal').style.display = 'flex';
}

function copyKeyToClipboard() {
    const shareKey = document.getElementById('share-key-output');
    shareKey.select(); 
    document.execCommand('copy');
    showModal('Klart!', 'Nyckeln har kopierats till urklipp.');
}

function importBoard() {
    const key = document.getElementById('import-key-input').value;
    try {
        const newBoard = JSON.parse(key);
        if (newBoard && newBoard.name) {
            const existingIndex = boards.findIndex(b => b.name === newBoard.name);
            if (existingIndex >= 0) {
                if (confirm(`Skriva över brädet "${newBoard.name}"?`)) boards[existingIndex] = newBoard;
                else return;
            } else boards.push(newBoard);
            
            saveBoards(); 
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
    currentBoard = { name: 'Nytt Spel', categories: Array(6).fill(''), questions: Array(6).fill(null).map(() => Array(5).fill('')) };
    editCurrentBoard();
}

function editBoard(index) {
    currentBoard = JSON.parse(JSON.stringify(boards[index]));
    editCurrentBoard();
}

function editCurrentBoard() {
    document.getElementById('splash-screen').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'block';
    const editGrid = document.getElementById('edit-grid'); 
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

            const qInput = document.createElement('textarea'); 
            qInput.value = currentBoard.questions[col][row];
            qInput.placeholder = `Fråga ${row + 1} (${(row+1)*100}p)`;
            qInput.oninput = (e) => currentBoard.questions[col][row] = e.target.value;
            
            cellWrapper.appendChild(qInput);
            editGrid.appendChild(cellWrapper);
        }
    }
}

function saveCurrentBoard() {
    const inputs = document.querySelectorAll('#edit-grid input, #edit-grid textarea');
    inputs.forEach(input => input.classList.remove('incomplete'));
    
    const existingIndex = boards.findIndex(b => b.name === currentBoard.name);
    if (existingIndex >= 0) boards[existingIndex] = currentBoard; else boards.push(currentBoard);
    saveBoards();

    const saveBtn = document.getElementById('save-board');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Sparat! ✓';
    saveBtn.style.backgroundColor = '#28a745';
    
    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.backgroundColor = '#1e90ff';
    }, 2000);
}

function initiateGame(index) {
    // Spara det valda brädet i localStorage temporärt och byt sida
    localStorage.setItem('jeopardyCurrentGame', JSON.stringify(boards[index]));
    window.location.href = 'host.html';
}

function showModal(title, text) {
    document.getElementById('generic-modal-title').textContent = title;
    document.getElementById('generic-modal-text').textContent = text;
    document.getElementById('generic-modal').style.display = 'flex';
}
