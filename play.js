import { auth, db, signInAnonymously } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, orderBy, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

let roomId = null;
let playerTeam = "";
let playerName = "";
let currentEvent = null;
let isLocked = true;
let teammates = [];
let myVote = null;
let isAuthReady = false;
let hasBuzzed = false;
let penaltyClicks = 0;
let penaltyActive = false;
let lastClearedTime = 0;

// Funktion för moderna notiser (Ersätter alert)
function showToast(message, isError = false) {
    const toast = document.getElementById('toast-msg');
    toast.textContent = message;
    toast.style.backgroundColor = isError ? '#dc3545' : '#333';
    toast.className = 'show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    // Logga in dolt och håll koll på när det är klart
    onAuthStateChanged(auth, (user) => {
        if (user) isAuthReady = true;
    });
    signInAnonymously(auth).catch(error => showToast("Kunde inte ansluta: " + error.message, true));

    const urlParams = window.location.search.substring(1);
    if (urlParams && urlParams.length === 4) { 
        roomId = urlParams; 
        joinRoom(roomId); 
    }

    document.getElementById('check-room-btn').addEventListener('click', () => {
        if (!isAuthReady) { showToast("Ansluter till servern, vänta en sekund...", false); return; }
        const code = document.getElementById('room-input').value.trim();
        if (code.length > 0) joinRoom(code);
    });
    
    document.getElementById('join-game-btn').addEventListener('click', finalizeJoin);
    document.getElementById('buzzer-btn').addEventListener('click', buzzIn);
});

async function joinRoom(code) {
    try {
        const docRef = doc(db, "rooms", code);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            roomId = code;
            document.getElementById('join-section').style.display = 'none';
            document.getElementById('setup-section').style.display = 'flex';
            document.getElementById('display-room').textContent = roomId;

            const roomData = docSnap.data();
            const grid = document.getElementById('team-select-grid');
            const hiddenInput = document.getElementById('team-select');
            grid.innerHTML = '';
            hiddenInput.value = '';

            if (roomData.teams && roomData.teams.length > 0) {
                roomData.teams.forEach(team => {
                    const box = document.createElement('div');
                    box.className = 'team-box';
                    box.textContent = team;
                    box.onclick = () => {
                        grid.querySelectorAll('.team-box').forEach(b => b.classList.remove('selected'));
                        box.classList.add('selected');
                        hiddenInput.value = team;
                    };
                    grid.appendChild(box);
                });
            }
        } else { 
            showToast("Rummet hittades inte. Kontrollera koden.", true); 
        }
    } catch (e) {
        showToast("Något gick fel. Försök igen.", true);
    }
}

async function finalizeJoin() {
    if (!isAuthReady) { showToast("Vänta, ansluter...", false); return; }
    
    const selectedTeam = document.getElementById('team-select').value;
    const nameInp = document.getElementById('name-input').value.trim();
    if (!selectedTeam) { showToast("Välj ett lag!", true); return; }
    if (!nameInp) { showToast("Skriv ditt namn!", true); return; }

    playerTeam = selectedTeam; 
    playerName = nameInp;

    try {
        const playerRef = doc(db, "rooms", roomId, "players", auth.currentUser.uid);
        const playerSnap = await getDoc(playerRef);

        // Om spelaren inte finns, skapa profilen.
        if (!playerSnap.exists()) {
            await setDoc(playerRef, {
                name: playerName, 
                team: playerTeam, 
                vote: null
            });
        } else {
            // Om de finns (t.ex. vid refresh), se till att de inte försöker byta namn/lag själva!
            const data = playerSnap.data();
            if (data.name !== playerName || data.team !== playerTeam) {
                showToast("Ditt namn/lag är redan registrerat och kan inte ändras!", true);
                // Skriv över med det som redan finns i databasen så UI stämmer
                playerName = data.name;
                playerTeam = data.team;
            }
        }

        document.getElementById('setup-section').style.display = 'none';
        document.getElementById('buzzer-section').style.display = 'flex';
        document.getElementById('player-info').textContent = `${playerName} i ${playerTeam}`;
        
        listenToSelf();
        listenToRoomStatus();
        listenToTeammates();
        
    } catch (e) { 
        showToast("Kunde inte ansluta. Försök igen.", true); 
        console.error(e); 
    }
}

function listenToSelf() {
    onSnapshot(doc(db, "rooms", roomId, "players", auth.currentUser.uid), (docSnap) => {
        if (!docSnap.exists()) {
            // Spelaren har blivit kickad
            showToast("Du har blivit borttagen från spelet.", true);
            document.getElementById('buzzer-section').style.display = 'none';
            document.getElementById('vote-section').style.display = 'none';
            document.getElementById('join-section').style.display = 'flex';
            return;
        }
        const data = docSnap.data();
        if (data.name !== playerName) {
            playerName = data.name;
            document.getElementById('player-info').textContent = `${playerName} i ${playerTeam}`;
            showToast("Hosten ändrade ditt namn till " + playerName, false);
        }
        if (data.team !== playerTeam) {
            playerTeam = data.team;
            document.getElementById('player-info').textContent = `${playerName} i ${playerTeam}`;
            showToast("Hosten flyttade dig till " + playerTeam, false);
        }
    });
}

function listenToRoomStatus() {
    onSnapshot(doc(db, "rooms", roomId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const prevLocked = isLocked;
            isLocked = data.locked;
            currentEvent = data.event;

            // NYTT: Kolla om hosten precis klickat på "Rensa Buzzers"
            const currentClearedTime = data.lastCleared?.toMillis() || 0;
            if (currentClearedTime !== lastClearedTime) {
                hasBuzzed = false;
                lastClearedTime = currentClearedTime;
            }

            if (prevLocked && !isLocked) {
                hasBuzzed = false;
                if (penaltyClicks > 0) {
                    applyPenaltyDelay();
                } else {
                    updateUI();
                }
            } else {
                updateUI();
            }
        }
    });
}

function applyPenaltyDelay() {
    // Calculate total penalty: 1/2 + 1/3 + 1/4 + ... + 1/(penaltyClicks+1) seconds
    let totalDelay = 0;
    for (let i = 0; i < penaltyClicks; i++) {
        totalDelay += 1 / (i + 2);
    }
    totalDelay = Math.round(totalDelay * 100) / 100;
    penaltyClicks = 0; // Reset for next round

    penaltyActive = true;
    const buzzerBtn = document.getElementById('buzzer-btn');
    const statusText = document.getElementById('status-text');
    buzzerBtn.disabled = true;
    buzzerBtn.classList.remove('locked-style');
    buzzerBtn.classList.add('penalty-style');
    buzzerBtn.textContent = "VÄNTA";
    statusText.textContent = `Straff: ${totalDelay.toFixed(1)}s`;
    statusText.style.color = "#dc3545";
    showToast(`Klicka inte innan buzzern låses upp! Straff: ${totalDelay.toFixed(1)}s`, true);

    setTimeout(() => {
        penaltyActive = false;
        updateUI();
    }, totalDelay * 1000);
}


function listenToTeammates() {
    const playersRef = collection(db, "rooms", roomId, "players");
    const q = query(playersRef, where("team", "==", playerTeam));
    
    onSnapshot(q, (snap) => {
        teammates = [];
        snap.forEach(docSnap => {
            const p = docSnap.data(); 
            p.uid = docSnap.id;
            teammates.push(p); 
        });
        updateUI();
    });
}

function updateUI() {
    const buzzerBtn = document.getElementById('buzzer-btn');
    const statusText = document.getElementById('status-text');
    const buzzerSection = document.getElementById('buzzer-section');
    const voteSection = document.getElementById('vote-section');

    if (currentEvent === 'solospelaren') {
        if (isLocked) {
            buzzerSection.style.display = 'none'; 
            voteSection.style.display = 'flex';
            renderVoteUI();
        } else {
            voteSection.style.display = 'none'; 
            buzzerSection.style.display = 'flex';
            const winner = calculateVoteWinner();
            buzzerBtn.classList.remove('locked-style', 'penalty-style');
            
            if (winner && winner.uid === auth.currentUser.uid) {
                buzzerBtn.disabled = false; 
                buzzerBtn.textContent = "BUZZ";
                statusText.textContent = "Du är utsedd! KÖR!"; 
                statusText.style.color = "#28a745";
            } else {
                buzzerBtn.disabled = true; 
                buzzerBtn.textContent = "LÅST";
                statusText.textContent = `${winner ? winner.name : 'Ingen'} svarar för laget!`; 
                statusText.style.color = "#ffd700";
            }
        }
    } else {
        voteSection.style.display = 'none';
        buzzerSection.style.display = 'flex';

        if (penaltyActive) return; // Don't override penalty UI

        buzzerBtn.classList.remove('locked-style', 'penalty-style');

        if (isLocked) {
            buzzerBtn.disabled = false; // Keep enabled to detect premature clicks
            buzzerBtn.classList.add('locked-style');
            buzzerBtn.textContent = "LÅST";
            statusText.textContent = "Väntar på host...";
            statusText.style.color = "#ffd700";
        } else if (hasBuzzed) {
            buzzerBtn.disabled = true;
            buzzerBtn.textContent = "BUZZ";
            statusText.textContent = "BUZZED!";
            statusText.style.color = "white";
        } else {
            buzzerBtn.disabled = false;
            buzzerBtn.textContent = "BUZZ";
            statusText.textContent = "KLAR!";
            statusText.style.color = "#28a745";
        }
    }
}

function renderVoteUI() {
    const list = document.getElementById('vote-list'); 
    list.innerHTML = '';
    
    teammates.forEach(tm => {
        const btn = document.createElement('button');
        btn.className = 'vote-btn'; 
        btn.textContent = tm.name;
        if (myVote === tm.uid) btn.classList.add('selected');
        
        btn.onclick = async () => {
            myVote = tm.uid;
            await updateDoc(doc(db, "rooms", roomId, "players", auth.currentUser.uid), { vote: myVote });
            renderVoteUI();
        };
        list.appendChild(btn);
    });
}

function calculateVoteWinner() {
    let voteCounts = {};
    teammates.forEach(t => voteCounts[t.uid] = 0);
    teammates.forEach(t => { if (t.vote && voteCounts[t.vote] !== undefined) voteCounts[t.vote]++; });
    
    let maxVotes = -1; 
    let winners = [];
    
    for (const [uid, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) { 
            maxVotes = count; 
            winners = [uid]; 
        } else if (count === maxVotes) { 
            winners.push(uid); 
        }
    }
    winners.sort(); // Oavgjort? Den med lägst UID vinner
    return teammates.find(t => t.uid === winners[0]) || teammates[0];
}

async function buzzIn() {
    // Track premature clicks while locked
    if (isLocked) {
        penaltyClicks++;
        // Calculate current total penalty for display
        let total = 0;
        for (let i = 0; i < penaltyClicks; i++) total += 1 / (i + 2);
        showToast(`Buzzern är låst! Straff: ${total.toFixed(1)}s`, true);
        return;
    }

    const buzzerBtn = document.getElementById('buzzer-btn');
    buzzerBtn.disabled = true;
    hasBuzzed = true;

    try {
        await setDoc(doc(db, "rooms", roomId, "buzzes", auth.currentUser.uid), {
            name: playerName,
            team: playerTeam,
            timestamp: serverTimestamp()
        });
        document.getElementById('status-text').textContent = "BUZZED!";
        document.getElementById('status-text').style.color = "white";
    } catch (error) {
        console.error("Fel vid buzz: ", error);
    }
}
