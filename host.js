// host.js
import { showToast } from './utils.js';
import { setupFirebaseRoom, setRoomLock, clearRoomBuzzers, syncTeams, movePlayerTeam, setRoomEvent, renamePlayer, kickPlayer } from './host-firebase.js';
import { getBoard } from './board-db.js';

let currentBoard = null;
let teams = [];
let teamScores = {};
let viewedQuestions = {};
let totalQuestions = 30;

// Game & Buzzer State Variables
let questionsOpened = 0;
let currentQuestionValue = 0; 
let activeDDValue = 0; 
let dailyDoubleTriggered = false;
let allaSvararCount = 0;
let raddningsplankanTriggered = false;
let mappedEvents = {}; 
let solidaritetTurn = -1;
let currentQuestionPreEvent = null;
let currentQuestionPostEvent = null;
let frozenTeam = null; 
let nextFrozenTeam = null;
let allianceTeams = [];

let roomId = Math.floor(1000 + Math.random() * 9000).toString(); 
let isLocked = false;
let playersMap = {}; 

document.addEventListener('DOMContentLoaded', async () => {
    const boardName = localStorage.getItem('jeopardyCurrentGame');
    if (!boardName) { window.location.href = 'index.html'; return; }
    currentBoard = await getBoard(boardName);
    if (!currentBoard) { window.location.href = 'index.html'; return; }
    
    // Initiera Firebase via vår nya modul
    setupFirebaseRoom(roomId, handleBuzzerUpdate, handlePlayersUpdate)
        .catch(error => console.error("Firebase Setup Error:", error));

    initiateGameLogic();
    setupEventListeners();
    
    document.getElementById('room-code-display').textContent = roomId;
    document.getElementById('copy-link-btn').addEventListener('click', () => {
        const playUrl = window.location.href.replace('host.html', 'play.html') + '?' + roomId;
        navigator.clipboard.writeText(playUrl).then(() => showToast('Länk kopierad!'));
    });
});

// --- CALLBACKS FRÅN FIREBASE ---
function handleBuzzerUpdate(buzzes) {
    const list = document.getElementById('buzzer-list');
    list.innerHTML = '';
    let first = true;
    
    buzzes.forEach((data) => {
        const li = document.createElement('li');
        li.style.padding = '10px'; li.style.marginBottom = '5px'; li.style.borderRadius = '5px'; li.style.fontWeight = 'bold';
        
        if (first) {
            li.style.backgroundColor = '#28a745'; li.style.color = 'white'; li.style.fontSize = '1.2em';
            li.textContent = `🥇 ${data.team} (${data.name})`; first = false;
        } else {
            li.style.backgroundColor = '#f4f4f9'; li.style.color = '#333'; li.textContent = `${data.team} (${data.name})`;
        }
        list.appendChild(li);
    });
}

function handlePlayersUpdate(newPlayersMap) {
    playersMap = newPlayersMap;
    renderPlayersInTeams();
}

// --- BUZZER KONTROLLER ---
async function toggleLock() {
    isLocked = !isLocked;
    const btn = document.getElementById('toggle-lock-btn');
    btn.textContent = isLocked ? "🔓 Lås upp Buzzers" : "🔒 Lås Buzzers";
    btn.style.backgroundColor = isLocked ? "#ffc107" : "#28a745";
    btn.style.color = isLocked ? "#000" : "#fff";
    await setRoomLock(roomId, isLocked);
}

async function clearBuzzers() {
    await clearRoomBuzzers(roomId);
}

// --- GAME LOGIC ---
function setupEventListeners() {
    document.getElementById('toggle-lock-btn').addEventListener('click', toggleLock);
    document.getElementById('clear-buzzers-btn').addEventListener('click', clearBuzzers);
    document.getElementById('close-question-btn').addEventListener('click', closeQuestionPopup);
    document.getElementById('generate-team-inputs-btn').addEventListener('click', generateTeamInputs);
    document.getElementById('start-game-btn').addEventListener('click', finalizeTeamSetupAndStart);

    const modals = document.querySelectorAll('.custom-modal, #question-popup');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (modal.id === 'freeze-modal' || modal.id === 'team-setup-modal' || modal.id === 'dd-setup-modal') return; 
            if (e.target === modal) {
                if (modal.id === 'question-popup') closeQuestionPopup();
                else modal.style.display = 'none';
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault(); clearBuzzers();
        }
        if (e.key === 'Escape') {
            if (document.getElementById('freeze-modal').style.display === 'flex' || 
                document.getElementById('generic-event-splash').style.display === 'flex' || 
                document.getElementById('team-setup-modal').style.display === 'flex') return;
                
            if (document.getElementById('question-popup').style.display === 'flex') {
                closeQuestionPopup();
            } else {
                modals.forEach(m => { if(m.style.display === 'flex') m.style.display = 'none'; });
            }
        }
    });
}

function initiateGameLogic() {
    viewedQuestions = {}; questionsOpened = 0; dailyDoubleTriggered = false; allaSvararCount = 0; raddningsplankanTriggered = false; frozenTeam = null; nextFrozenTeam = null; mappedEvents = {};
    const eventPool = ['robin_hood', 'lotterihjulet', 'solospelaren', 'dubbeltrubbel', 'frysstralen', 'alliansen', 'jackpot'];
    const selectedEvents = eventPool.sort(() => 0.5 - Math.random()).slice(0, 2);
    
    let assignedTurns = [];
    while(assignedTurns.length < 2) {
        let r = Math.floor(Math.random() * 20) + 4;
        if(!assignedTurns.includes(r)) assignedTurns.push(r);
    }
    selectedEvents.forEach((ev, idx) => mappedEvents[assignedTurns[idx]] = ev);
    if(Math.random() < 0.33) { do { solidaritetTurn = Math.floor(Math.random() * 20) + 4; } while (assignedTurns.includes(solidaritetTurn)); } else { solidaritetTurn = -1; }

    document.getElementById('num-teams-input').value = 3;
    document.getElementById('team-names-container').style.display = 'none';
    document.getElementById('generate-team-inputs-btn').style.display = 'inline-block';
    document.getElementById('team-setup-modal').style.display = 'flex';
}

function generateTeamInputs() {
    let num = parseInt(document.getElementById('num-teams-input').value);
    if (num < 2) num = 2; if (num > 5) num = 5;
    const container = document.getElementById('team-name-inputs'); container.innerHTML = '';
    for(let i=1; i<=num; i++){
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = `Lag ${i}`; inp.className = 'setup-team-name';
        container.appendChild(inp);
    }
    document.getElementById('generate-team-inputs-btn').style.display = 'none';
    document.getElementById('team-names-container').style.display = 'block';
}

async function finalizeTeamSetupAndStart() {
    teams = []; teamScores = {};
    document.querySelectorAll('.setup-team-name').forEach((inp, idx) => {
        let tName = inp.value.trim() || `Lag ${idx+1}`;
        while(teams.includes(tName)) tName += "*"; 
        teams.push(tName); teamScores[tName] = 0;
    });
    
    await syncTeams(roomId, teams);
    document.getElementById('team-setup-modal').style.display = 'none'; 
    setupGameBoard();
}

function setupGameBoard() {
    document.getElementById('play-mode').style.display = 'block';
    document.getElementById('game-name').textContent = currentBoard.name;
    const gameBoard = document.getElementById('game-board'); gameBoard.innerHTML = '';

    currentBoard.categories.forEach(cat => {
        const catDiv = document.createElement('div'); catDiv.textContent = cat || 'Kategori'; catDiv.classList.add('category-cell');
        gameBoard.appendChild(catDiv);
    });

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 6; col++) {
            const qDiv = document.createElement('div'); qDiv.textContent = (row + 1) * 100;
            qDiv.classList.add('question-cell'); qDiv.dataset.col = col; qDiv.dataset.row = row;
            qDiv.addEventListener('click', handleQuestionClick);
            gameBoard.appendChild(qDiv);
        }
    }
    updateTeamsDisplay();
}

function updateTeamsDisplay() {
    const teamList = document.getElementById('team-list'); teamList.innerHTML = '';
    teams.forEach(team => {
        const teamDiv = document.createElement('div'); teamDiv.classList.add('team');
        const nameInput = document.createElement('input'); nameInput.value = team;
        
        nameInput.onchange = async (e) => {
            let newName = e.target.value.trim();
            if(!newName || teams.includes(newName)) { e.target.value = team; return; }
            teamScores[newName] = teamScores[team]; delete teamScores[team];
            teams[teams.indexOf(team)] = newName;
            
            await syncTeams(roomId, teams); 
            Object.entries(playersMap).forEach(async ([uid, pData]) => {
                if(pData.team === team) await movePlayerTeam(roomId, uid, newName);
            });
            updateTeamsDisplay();
        };
        
        const scoreP = document.createElement('p'); scoreP.textContent = `${teamScores[team]} p`;
        
        const playersDiv = document.createElement('div');
        playersDiv.className = 'team-players'; playersDiv.dataset.team = team;
        
        playersDiv.addEventListener('dragover', e => { e.preventDefault(); playersDiv.classList.add('drag-over'); });
        playersDiv.addEventListener('dragleave', e => { playersDiv.classList.remove('drag-over'); });
        playersDiv.addEventListener('drop', async e => {
            e.preventDefault(); playersDiv.classList.remove('drag-over');
            const uid = e.dataTransfer.getData('text/plain');
            if(uid && playersMap[uid] && playersMap[uid].team !== team) {
                await movePlayerTeam(roomId, uid, team);
            }
        });

        teamDiv.append(nameInput, scoreP, playersDiv); teamList.appendChild(teamDiv);
    });
    renderPlayersInTeams();
}

function renderPlayersInTeams() {
    document.querySelectorAll('.team-players').forEach(div => div.innerHTML = '');
    Object.entries(playersMap).forEach(([uid, playerData]) => {
        const teamDiv = document.querySelector(`.team-players[data-team="${playerData.team}"]`);
        if (teamDiv) {
            const chip = document.createElement('div');
            chip.className = 'player-chip'; chip.draggable = true;
            chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', uid); });

            const nameSpan = document.createElement('span');
            nameSpan.textContent = playerData.name;
            nameSpan.style.flex = '1';
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';

            const editBtn = document.createElement('button');
            editBtn.textContent = '✏️';
            editBtn.className = 'player-action-btn';
            editBtn.title = 'Byt namn';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                const newName = prompt('Nytt namn:', playerData.name);
                if (newName && newName.trim() && newName.trim() !== playerData.name) {
                    renamePlayer(roomId, uid, newName.trim().substring(0, 15));
                }
            };

            const kickBtn = document.createElement('button');
            kickBtn.textContent = '✕';
            kickBtn.className = 'player-action-btn player-kick-btn';
            kickBtn.title = 'Kicka spelare';
            kickBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Kicka ${playerData.name}?`)) {
                    kickPlayer(roomId, uid);
                }
            };

            chip.append(nameSpan, editBtn, kickBtn);
            teamDiv.appendChild(chip);
        }
    });
}

function getLowestTeams(count = 1) {
    let sorted = Object.entries(teamScores).sort((a, b) => Math.random() - 0.5).sort((a,b) => a[1]-b[1]);
    return sorted.slice(0, count).map(t => t[0]);
}

function getLeader() {
    let sorted = Object.entries(teamScores).sort((a,b) => b[1]-a[1]);
    return sorted[0][0];
}

function flashEventSplash(title, subtitle, bgColor, buttonText, callback) {
    const splash = document.getElementById('generic-event-splash');
    document.getElementById('generic-event-title').innerHTML = title;
    document.getElementById('generic-event-sub').innerHTML = subtitle;
    splash.style.background = bgColor;
    const btn = document.getElementById('generic-event-continue-btn');
    const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
    newBtn.textContent = buttonText; newBtn.style.display = 'block';
    newBtn.onclick = () => { splash.style.display = 'none'; callback(); };
    splash.style.display = 'flex';
}

function handleQuestionClick(e) {
    const cell = e.currentTarget; const col = parseInt(cell.dataset.col); const row = parseInt(cell.dataset.row);
    if (viewedQuestions[`${col}-${row}`]) return;
    viewedQuestions[`${col}-${row}`] = true; cell.classList.add('clicked'); cell.textContent = '';
    
    currentQuestionValue = (row + 1) * 100; questionsOpened++; activeDDValue = currentQuestionValue;
    currentQuestionPreEvent = null; currentQuestionPostEvent = null; frozenTeam = nextFrozenTeam; nextFrozenTeam = null;

    let isDD = (!dailyDoubleTriggered && questionsOpened >= 6 && questionsOpened <= 17 && (Math.random() < (questionsOpened - 5) / 12 || questionsOpened === 17));
    let isRaddning = (!isDD && !raddningsplankanTriggered && questionsOpened > 12 && Math.random() < 0.15);
    let isAlla = (!isDD && !isRaddning && allaSvararCount < 2 && Math.random() < 0.10);

    if ((isDD || isRaddning || isAlla) && mappedEvents[questionsOpened]) { 
        mappedEvents[questionsOpened + 1] = mappedEvents[questionsOpened]; 
        delete mappedEvents[questionsOpened]; 
    }
    if ((isDD || isRaddning || isAlla) && solidaritetTurn === questionsOpened) { solidaritetTurn++; }

    if (isDD) { dailyDoubleTriggered = true; triggerDailyDouble(col, row); return; }
    if (isRaddning) { raddningsplankanTriggered = true; triggerRaddningsplankan(col, row); return; }
    if (isAlla) { allaSvararCount++; triggerAllaSvarar(col, row); return; }

    if (mappedEvents[questionsOpened]) {
        let ev = mappedEvents[questionsOpened];
        if (ev === 'lotterihjulet') triggerLotterihjulet(col, row);
        else if (ev === 'solospelaren') { 
            currentQuestionPreEvent = 'solospelaren'; 
            setRoomEvent(roomId, 'solospelaren'); // Uppdaterar DB så elever kan rösta
            flashEventSplash("SOLOSPELAREN!", "Välj EN person i laget som får svara.<br>Övriga tittar bort!", "radial-gradient(circle, #ff4500, #ff8c00)", "Visa Frågan", () => showQuestionPopup(col, row)); 
        }
        else if (ev === 'dubbeltrubbel') { currentQuestionPreEvent = 'dubbeltrubbel'; activeDDValue *= 2; flashEventSplash("DUBBELTRUBBEL!", "Värd dubbelt så mycket.<br>Gissar man fel får man dubbla minus!", "radial-gradient(circle, #8b0000, #ff0000)", "Visa Frågan", () => showQuestionPopup(col, row)); }
        else if (ev === 'alliansen') { currentQuestionPreEvent = 'alliansen'; allianceTeams = getLowestTeams(2); flashEventSplash("ALLIANSEN!", `${allianceTeams.join(" & ")} delar på poängen!<br>Svarar en rätt, får båda poäng!`, "radial-gradient(circle, #4169e1, #1e90ff)", "Visa Frågan", () => showQuestionPopup(col, row)); }
        else if (ev === 'frysstralen') { currentQuestionPreEvent = 'frysstralen'; flashEventSplash("FRYSSTRÅLEN!", "Laget som svarar rätt får<br>frysa ett annat lag nästa runda!", "radial-gradient(circle, #00ced1, #afeeee)", "Visa Frågan", () => showQuestionPopup(col, row)); }
        else if (ev === 'robin_hood') { currentQuestionPreEvent = 'robin_hood'; flashEventSplash("ROBIN HOOD!", "Rätt svar stjäl poängen från ledaren!", "radial-gradient(circle, #228b22, #32cd32)", "Visa Frågan", () => showQuestionPopup(col, row)); }
        else if (ev === 'jackpot') { currentQuestionPostEvent = 'jackpot'; showQuestionPopup(col, row); } 
        return;
    }

    if (solidaritetTurn === questionsOpened) { currentQuestionPostEvent = 'solidaritet'; showQuestionPopup(col, row); return; }
    showQuestionPopup(col, row);
}

function triggerLotterihjulet(col, row) {
    const splash = document.getElementById('generic-event-splash'); document.getElementById('generic-event-title').innerHTML = "LOTTERIHJULET!"; splash.style.background = "radial-gradient(circle, #ff1493, #ff69b4)";
    const btn = document.getElementById('generic-event-continue-btn'); const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn); newBtn.style.display = 'none'; splash.style.display = 'flex';
    let spins = 0; let bonus = 0;
    let interval = setInterval(() => {
        bonus = [100, 200, 300][Math.floor(Math.random()*3)]; document.getElementById('generic-event-sub').innerHTML = `Bonus: +${bonus} p`; spins++;
        if(spins > 20) {
            clearInterval(interval); newBtn.style.display = 'block'; newBtn.textContent = "Visa Frågan";
            newBtn.onclick = () => { splash.style.display = 'none'; activeDDValue += bonus; currentQuestionPreEvent = 'lotteri'; showQuestionPopup(col, row); };
        }
    }, 100);
}

function triggerDailyDouble(col, row) { const splash = document.getElementById('daily-double-splash'); splash.style.display = 'flex'; setTimeout(() => { splash.style.display = 'none'; openDDSetupModal(col, row); }, 2500); }
function triggerAllaSvarar(col, row) { currentQuestionPreEvent = 'alla'; flashEventSplash("ALLA SVARAR!", "Inget buzzin!<br>Gör er redo för att viska fram svaret.", "radial-gradient(circle, #008000, #20b2aa)", "Visa Frågan", () => showQuestionPopup(col, row)); }
function triggerRaddningsplankan(col, row) { let lt = getLowestTeams(1); currentQuestionPreEvent = 'raddning'; allianceTeams = lt; flashEventSplash("RÄDDNINGS<br>PLANKAN!", `Endast ${lt[0]} får svara först!`, "radial-gradient(circle, #800080, #ff1493)", "Visa Frågan", () => showQuestionPopup(col, row)); }

function openDDSetupModal(col, row) {
    const modal = document.getElementById('dd-setup-modal'); const select = document.getElementById('dd-team-select'); select.innerHTML = '';
    teams.forEach(t => { const opt = document.createElement('option'); opt.value = t; opt.textContent = `${t} (${teamScores[t]} p)`; select.appendChild(opt); });
    const updateBetBtns = () => {
        const score = teamScores[select.value]; document.getElementById('dd-bet-x2').textContent = `Ruta x 2 (${currentQuestionValue * 2} p)`;
        document.getElementById('dd-bet-all').textContent = `Alla sina poäng (${score} p)`; document.getElementById('dd-bet-all').disabled = (score <= 0); document.getElementById('dd-bet-all').style.opacity = score <= 0 ? '0.5' : '1';
    };
    select.onchange = updateBetBtns; updateBetBtns(); 
    const btnContainer = document.getElementById('dd-bet-container'); const newBtnContainer = btnContainer.cloneNode(true); btnContainer.parentNode.replaceChild(newBtnContainer, btnContainer);
    document.getElementById('dd-bet-x2').onclick = () => { activeDDValue = currentQuestionValue * 2; document.getElementById('dd-setup-modal').style.display = 'none'; currentQuestionPreEvent = 'dd'; allianceTeams = [select.value]; showQuestionPopup(col, row); };
    document.getElementById('dd-bet-1000').onclick = () => { activeDDValue = 1000; document.getElementById('dd-setup-modal').style.display = 'none'; currentQuestionPreEvent = 'dd'; allianceTeams = [select.value]; showQuestionPopup(col, row); };
    document.getElementById('dd-bet-all').onclick = () => { activeDDValue = teamScores[select.value]; document.getElementById('dd-setup-modal').style.display = 'none'; currentQuestionPreEvent = 'dd'; allianceTeams = [select.value]; showQuestionPopup(col, row); };
    modal.style.display = 'flex';
}

function showQuestionPopup(col, row) {
    document.getElementById('question-popup').style.display = 'flex';
    const questionText = document.getElementById('question-text');
    const mediaContainer = document.getElementById('question-media');
    questionText.textContent = currentBoard.questions[col][row] || '(Ingen fråga inlagd)';

    // Clear previous media
    mediaContainer.innerHTML = '';
    mediaContainer.style.display = 'none';

    const mediaKey = `${col}-${row}`;
    const media = currentBoard.media && currentBoard.media[mediaKey];
    if (media) {
        mediaContainer.style.display = 'block';
        if (media.type === 'image') {
            const img = document.createElement('img');
            img.src = media.data;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '400px';
            img.style.borderRadius = '10px';
            mediaContainer.appendChild(img);
        } else if (media.type === 'sound') {
            const audio = document.createElement('audio');
            audio.src = media.data;
            audio.controls = true;
            audio.style.width = '100%';
            mediaContainer.appendChild(audio);
        }
    }
    const banner = document.getElementById('event-banner'); const valDisplay = document.getElementById('question-value-display'); banner.style.display = 'none';
    if (currentQuestionPreEvent === 'dd') { banner.style.display = 'inline-block'; banner.style.backgroundColor = '#ff8c00'; banner.textContent = `DAILY DOUBLE (Spelas av: ${allianceTeams[0]})`; }
    else if (currentQuestionPreEvent === 'alla') { banner.style.display = 'inline-block'; banner.style.backgroundColor = '#20b2aa'; banner.textContent = `ALLA SVARAR! (Inget buzzin)`; }
    else if (currentQuestionPreEvent === 'raddning') { banner.style.display = 'inline-block'; banner.style.backgroundColor = '#9370db'; banner.textContent = `RÄDDNINGSPLANKAN (Förtur: ${allianceTeams[0]})`; }
    else if (currentQuestionPreEvent === 'alliansen') { banner.style.display = 'inline-block'; banner.style.backgroundColor = '#4169e1'; banner.textContent = `ALLIANSEN (${allianceTeams.join(" & ")})`; }
    valDisplay.textContent = `Värde: ${activeDDValue} p`;
    const adjustPointsDiv = document.getElementById('adjust-points'); adjustPointsDiv.innerHTML = '';

    teams.forEach(team => {
        const teamDiv = document.createElement('div'); teamDiv.classList.add('adjust-team');
        if (team === frozenTeam) { teamDiv.classList.add('team-frozen'); teamDiv.title = "Fryst denna runda!"; }
        if (currentQuestionPreEvent === 'dd') { if (team === allianceTeams[0]) { teamDiv.style.border = '3px solid #ff8c00'; teamDiv.style.backgroundColor = '#fff3e0'; } else teamDiv.style.opacity = '0.4'; }
        else if (currentQuestionPreEvent === 'raddning' || currentQuestionPreEvent === 'alliansen') { if (allianceTeams.includes(team)) { teamDiv.style.border = '3px solid #9370db'; teamDiv.style.backgroundColor = '#f3e5f5'; } else teamDiv.style.opacity = '0.6'; }
        const teamNameP = document.createElement('p'); teamNameP.textContent = team; const btnGroup = document.createElement('div'); btnGroup.className = 'btn-group';
        const plusBtn = document.createElement('button'); plusBtn.textContent = 'Rätt (+)'; plusBtn.className = 'btn-plus'; plusBtn.onclick = () => handlePointAdjustment(team, activeDDValue, true);
        const minusBtn = document.createElement('button'); minusBtn.textContent = 'Fel (−)'; minusBtn.className = 'btn-minus'; minusBtn.onclick = () => handlePointAdjustment(team, activeDDValue, false);
        btnGroup.append(plusBtn, minusBtn); teamDiv.append(teamNameP, btnGroup); adjustPointsDiv.appendChild(teamDiv);
    });
}

function handlePointAdjustment(team, points, isCorrect) {
    if (isCorrect) {
        let leader = getLeader();
        if (currentQuestionPreEvent === 'frysstralen') {
            const modal = document.getElementById('freeze-modal'); const btns = document.getElementById('freeze-team-buttons'); btns.innerHTML = '';
            teams.forEach(t => {
                if(t !== team) {
                    const btn = document.createElement('button'); btn.textContent = t;
                    btn.onclick = () => { nextFrozenTeam = t; modal.style.display = 'none'; showToast(`${t} är frysta under nästa fråga!`); }; btns.appendChild(btn);
                }
            }); modal.style.display = 'flex';
        }
        if (currentQuestionPreEvent === 'alliansen' && allianceTeams.includes(team)) { allianceTeams.forEach(t => { if(t !== team) { teamScores[t] += points; } }); setTimeout(() => showToast(`Alliansen! Även ${allianceTeams.find(t=>t!==team)} får poäng!`), 100); }
        if (currentQuestionPreEvent === 'robin_hood') {
            if (team !== leader) { teamScores[leader] -= points; flashEventSplash("STÖLD!", `${team} stal ${points}p från ${leader}!`, "radial-gradient(circle, #228b22, #006400)", "Fortsätt", ()=>{}); }
            else { flashEventSplash("SÄKERT!", `Ledande ${team} tog poängen och säkrade sin ledning!`, "radial-gradient(circle, #228b22, #006400)", "Fortsätt", ()=>{}); }
        }
        teamScores[team] += points;
        if (currentQuestionPostEvent === 'jackpot') {
            currentQuestionPostEvent = null; let newLeader = getLeader();
            if (team !== newLeader) { let diff = teamScores[newLeader] - teamScores[team]; let bonus = Math.floor(diff / 2); teamScores[team] += bonus; flashEventSplash("JACKPOT!", `Mysterieruta!<br>${team} halverar avståndet till ledaren!<br>+${bonus}p extra!`, "radial-gradient(circle, #ffd700, #ff8c00)", "Fantastiskt!", ()=>{ updateTeamsDisplay(); }); }
        }
        if (currentQuestionPostEvent === 'solidaritet') {
            currentQuestionPostEvent = null; let bonus = Math.floor(points / 2); teams.forEach(t => { if(t !== team) teamScores[t] += bonus; });
            flashEventSplash("SOLIDARITET!", `Mysterieruta!<br>Alla andra lag får ${bonus}p som tröstpris!`, "radial-gradient(circle, #ff69b4, #ff1493)", "Härligt!", ()=>{ updateTeamsDisplay(); });
        }
    } else { teamScores[team] -= points; }
    updateTeamsDisplay();
}

function closeQuestionPopup() {
    document.getElementById('question-popup').style.display = 'none';
    // Stop any playing audio
    const audio = document.querySelector('#question-media audio');
    if (audio) { audio.pause(); audio.currentTime = 0; }
    document.getElementById('question-media').innerHTML = '';
    setRoomEvent(roomId, null); // Nollställ eventet i databasen
    if (Object.keys(viewedQuestions).length === totalQuestions) setTimeout(showEndScreen, 1000); 
}

function showEndScreen() {
    document.getElementById('play-mode').style.display = 'none'; document.getElementById('end-screen').style.display = 'block'; const sortedTeams = Object.entries(teamScores).sort((a, b) => b[1] - a[1]);
    const resultsDiv = document.getElementById('results'); resultsDiv.innerHTML = `<h2>Vinnare: ${sortedTeams[0][0]} med ${sortedTeams[0][1]} poäng!</h2>`;
    sortedTeams.slice(1).forEach(([team, score]) => { const div = document.createElement('div'); div.classList.add('team-result'); div.textContent = `${team}: ${score} p`; resultsDiv.appendChild(div); });
}
