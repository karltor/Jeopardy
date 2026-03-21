// play.js
import { auth, db, signInAnonymously } from './firebase-config.js';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

let roomId = null;
let playerTeam = "";
let playerName = "";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Logga in användaren i bakgrunden
    signInAnonymously(auth).catch(error => {
        alert("Kunde inte ansluta till servern: " + error.message);
    });

    // 2. Kolla om rumskod finns i URL (ex. play.html?1234)
    const urlParams = window.location.search.substring(1);
    if (urlParams && urlParams.length === 4) {
        roomId = urlParams;
        joinRoom(roomId);
    }

    // Knappar
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
        
        // Fyll i lagen som hosten har skapat
        if (roomData.teams && roomData.teams.length > 0) {
            roomData.teams.forEach(team => {
                const opt = document.createElement('option');
                opt.value = team;
                opt.textContent = team;
                select.appendChild(opt);
            });
        }
    } else {
        alert("Rummet hittades inte. Kontrollera koden.");
    }
}

async function finalizeJoin() {
    const select = document.getElementById('team-select');
    const nameInp = document.getElementById('name-input').value.trim();

    if (!select.value) { alert("Välj ett lag!"); return; }
    if (!nameInp) { alert("Skriv ditt namn!"); return; }

    playerTeam = select.value;
    playerName = nameInp;

    // Spara spelarens val i rummet i databasen
    try {
        await setDoc(doc(db, "rooms", roomId, "players", auth.currentUser.uid), {
            name: playerName,
            team: playerTeam
        });

        // Byt Vy till Buzzer!
        document.getElementById('setup-section').style.display = 'none';
        document.getElementById('buzzer-section').style.display = 'flex';
        document.getElementById('player-info').textContent = `${playerName} i ${playerTeam}`;

        listenToRoomStatus();
    } catch (e) {
        alert("Kunde inte ansluta till rummet. Försök igen.");
        console.error(e);
    }
}

function listenToRoomStatus() {
    const roomRef = doc(db, "rooms", roomId);
    const buzzerBtn = document.getElementById('buzzer-btn');
    const statusText = document.getElementById('status-text');

    onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
            const isLocked = docSnap.data().locked;
            if (isLocked) {
                buzzerBtn.disabled = true;
                buzzerBtn.textContent = "LÅST";
                statusText.textContent = "Väntar på host...";
                statusText.style.color = "#ffd700"; // Gul
            } else {
                buzzerBtn.disabled = false;
                buzzerBtn.textContent = "BUZZ";
                statusText.textContent = "KLAR!";
                statusText.style.color = "#28a745"; // Grön
            }
        }
    });
}

async function buzzIn() {
    const buzzerBtn = document.getElementById('buzzer-btn');
    buzzerBtn.disabled = true; // Förhindra dubbelklick direkt
    
    try {
        // Enligt security rules kan användaren bara skriva till sitt UID som doc-id
        const buzzRef = doc(db, "rooms", roomId, "buzzes", auth.currentUser.uid);
        await setDoc(buzzRef, {
            name: playerName,
            team: playerTeam,
            timestamp: serverTimestamp() // Firestore's server-klocka är absolut rättvis!
        });
        
        document.getElementById('status-text').textContent = "BUZZED!";
        document.getElementById('status-text').style.color = "white";
        // Knappen förblir låst tills hosten låser/låser upp eller rensar listan.
        // onSnapshot tar hand om när den ska öppnas igen.

    } catch (error) {
        console.error("Fel vid buzz: ", error);
        // Troligtvis var buzzern låst när man klickade
    }
}
