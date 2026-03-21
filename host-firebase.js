// host-firebase.js
import { auth, db, signInAnonymously } from './firebase-config.js';
import { doc, setDoc, updateDoc, onSnapshot, collection, query, orderBy, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// Skapar rummet och lyssnar på buzzers & spelare
export async function setupFirebaseRoom(roomId, onBuzzerAdd, onPlayersChange) {
    await signInAnonymously(auth);
    
    const roomRef = doc(db, "rooms", roomId);
    await setDoc(roomRef, {
        hostUid: auth.currentUser.uid,
        locked: false,
        teams: [],
        event: null 
    });

    // Lyssna på Buzzers
    const buzzesRef = collection(db, "rooms", roomId, "buzzes");
    onSnapshot(query(buzzesRef, orderBy("timestamp", "asc")), (snapshot) => {
        const buzzes = [];
        snapshot.forEach(docSnap => buzzes.push(docSnap.data()));
        onBuzzerAdd(buzzes); // Skickar datan tillbaka till host.js
    });

    // Lyssna på inloggade elever
    const playersRef = collection(db, "rooms", roomId, "players");
    onSnapshot(playersRef, (snapshot) => {
        const playersMap = {};
        snapshot.forEach(docSnap => playersMap[docSnap.id] = docSnap.data());
        onPlayersChange(playersMap); // Skickar datan tillbaka till host.js
    });
}

// Lås / Lås upp buzzers
export async function setRoomLock(roomId, isLocked) {
    await updateDoc(doc(db, "rooms", roomId), { locked: isLocked });
}

// Rensa buzzers
export async function clearRoomBuzzers(roomId) {
    const snapshot = await getDocs(collection(db, "rooms", roomId, "buzzes"));
    snapshot.forEach((docSnap) => deleteDoc(doc(db, "rooms", roomId, "buzzes", docSnap.id)));
}

// Synka uppdaterade lag till eleverna
export async function syncTeams(roomId, teams) {
    await updateDoc(doc(db, "rooms", roomId), { teams: teams });
}

// Ändra lag på en specifik elev (Drag & Drop)
export async function movePlayerTeam(roomId, uid, newTeam) {
    await updateDoc(doc(db, "rooms", roomId, "players", uid), { team: newTeam });
}

// Byt namn på en spelare
export async function renamePlayer(roomId, uid, newName) {
    await updateDoc(doc(db, "rooms", roomId, "players", uid), { name: newName });
}

// Kicka en spelare
export async function kickPlayer(roomId, uid) {
    await deleteDoc(doc(db, "rooms", roomId, "players", uid));
}

// Berätta för databasen (och eleverna) att ett event har startat (t.ex. Solospelaren)
export async function setRoomEvent(roomId, eventName) {
    await updateDoc(doc(db, "rooms", roomId), { event: eventName });
}
