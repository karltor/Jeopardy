import { auth, db, signInAnonymously } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

let roomId = null;
let playerTeam = "";
let playerName = "";
let currentEvent = null;
let isLocked = true;
let teammates = [];
let myVote = null;

document.addEventListener('DOMContentLoaded', () => {
    signInAnonymously(auth).catch(error => alert("Kunde inte ansluta till servern: " + error.message));
    const urlParams = window.location.search.substring(1);
    if (urlParams && urlParams.length === 4) { roomId = urlParams; joinRoom(roomId); }

    document.getElementById('check-room-btn').addEventListener('click', () => {
        const code = document.getElementById('room-input').value.trim();
        if (code.length > 0) joinRoom(code);
    });
    document.getElementById('join-game-btn').addEventListener('click', finalizeJoin);
    document.getElementById('buzzer-btn').addEventListener('click', buzzIn);
});

async function joinRoom(code) {
    const docRef = doc(db, "rooms", code);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        roomId = code;
        document.getElementById('join-section').style.display = 'none';
        document.getElementById('setup-section').style.display = 'flex';
        document.getElementById('display-room').textContent = roomId;

        const roomData = docSnap.data();
        const select = document.getElementById('team-select');
        if (roomData.teams && roomData.teams.length > 0) {
            roomData.teams.forEach(team => {
                const opt = document.createElement('option'); opt.value = team; opt.textContent = team; select.appendChild(opt);
            });
        }
    } else { alert("Rummet hittades inte. Kontrollera koden."); }
}

async function finalizeJoin() {
    const select = document.getElementById('team-select');
    const nameInp = document.getElementById('name-input').value.trim();
    if (!select.value) { alert("Välj ett lag!"); return; }
    if (!nameInp) { alert("Skriv ditt namn!"); return; }

    playerTeam = select.value; playerName = nameInp;

    try {
        await setDoc(doc(db, "rooms", roomId, "players", auth.currentUser.uid), {
            name: playerName, team: playerTeam, vote: null
        });

        document.getElementById('setup-section').style.display = 'none';
        document.getElementById('player-info').textContent = `${playerName} i ${playerTeam}`;
        
        listenToSelf();
        listenToRoomStatus();
        listenToTeammates();
    } catch (e) { alert("Kunde inte ansluta. Försök igen."); console.error(e); }
}

// Lyssna ifall host byter lag på eleven via Drag & Drop
function listenToSelf() {
    onSnapshot(doc(db, "rooms", roomId, "players", auth.currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.team !== playerTeam) {
                playerTeam = data.team;
                document.getElementById('player-info').textContent = `${playerName} i ${playerTeam}`;
            }
        }
    });
}

// Lyssna på hela rummet för events och buzzer-lås
function listenToRoomStatus() {
    onSnapshot(doc(db, "rooms", roomId), (docSnap) => {
        if (docSnap.exists()) {
            isLocked = docSnap.data().locked;
            currentEvent = docSnap.data().event;
            updateUI();
        }
    });
}

// Lyssna på lagkamrater för röstning
function listenToTeammates() {
    onSnapshot(collection(db, "rooms", roomId, "players"), (snap) => {
        teammates = [];
        snap.forEach(docSnap => {
            const p = docSnap.data(); p.uid = docSnap.id;
            if (p.team === playerTeam) teammates.push(p);
        });
        updateUI();
    });
}

function updateUI() {
    const buzzerBtn = document.getElementById('buzzer-btn');
    const statusText = document.getElementById('status-text');
    const buzzerSection = document.getElementById('buzzer-section');
    const voteSection = document.getElementById('vote-section');

    // SOLOSPELAREN EVENT AKTIVT
    if (currentEvent === 'solospelaren') {
        if (isLocked) {
            // Visa Röstning under tiden Host läser frågan
            buzzerSection.style.display = 'none'; voteSection.style.display = 'flex';
            renderVoteUI();
        } else {
            // Host låser upp -> Utse vinnaren och aktivera dennes buzzer
            voteSection.style.display = 'none'; buzzerSection.style.display = 'flex';
            const winner = calculateVoteWinner();
            
            if (winner && winner.uid === auth.currentUser.uid) {
                buzzerBtn.disabled = false; buzzerBtn.textContent = "BUZZ";
                statusText.textContent = "Du är utsedd! KÖR!"; statusText.style.color = "#28a745";
            } else {
                buzzerBtn.disabled = true; buzzerBtn.textContent = "LÅST";
                statusText.textContent = `${winner ? winner.name : 'Ingen'} svarar för laget!`; statusText.style.color = "#ffd700";
            }
        }
    } 
    // NORMALT SPEL
    else {
        voteSection.style.display = 'none'; buzzerSection.style.display = 'flex';
        if (isLocked) {
            buzzerBtn.disabled = true; buzzerBtn.textContent = "LÅST";
            statusText.textContent = "Väntar på host..."; statusText.style.color = "#ffd700";
        } else {
            buzzerBtn.disabled = false; buzzerBtn.textContent = "BUZZ";
            statusText.textContent = "KLAR!"; statusText.style.color = "#28a745";
        }
    }
}

function renderVoteUI() {
    const list = document.getElementById('vote-list'); list.innerHTML = '';
    teammates.forEach(tm => {
        const btn = document.createElement('button');
        btn.className = 'vote-btn'; btn.textContent = tm.name;
        if (myVote === tm.uid) btn.classList.add('selected');
        
        btn.onclick = async () => {
            myVote = tm.uid;
            // Elev tillåts uppdatera sin egen röst (Godkänt av security rules!)
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
    
    let maxVotes = -1; let winners = [];
    for (const [uid, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) { maxVotes = count; winners = [uid]; } 
        else if (count === maxVotes) { winners.push(uid); }
    }
    // Om oavgjort vinner den med lägst UID, så alla elevers telefoner utser SAMMA person
    winners.sort();
    return teammates.find(t => t.uid === winners[0]) || teammates[0];
}

async function buzzIn() {
    const buzzerBtn = document.getElementById('buzzer-btn'); buzzerBtn.disabled = true;
    try {
        await setDoc(doc(db, "rooms", roomId, "buzzes", auth.currentUser.uid), {
            name: playerName, team: playerTeam, timestamp: serverTimestamp()
        });
        document.getElementById('status-text').textContent = "BUZZED!";
        document.getElementById('status-text').style.color = "white";
    } catch (error) { console.error("Fel vid buzz: ", error); }
}
