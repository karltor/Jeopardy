// host-firebase.js
import { auth, db, signInAnonymously } from './firebase-config.js';
import { 
    doc, 
    setDoc, 
    updateDoc, 
    onSnapshot, 
    collection, 
    query, 
    orderBy, 
    getDocs, 
    deleteDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// Skapar rummet och lyssnar på buzzers & spelare
export async function setupFirebaseRoom(roomId, onBuzzerAdd, onPlayersChange) {
    
    // Logga in anonymt om vi inte redan är inloggade (via Google/lärare)
    if (!auth.currentUser) {
        try {
            await signInAnonymously(auth);
            console.log("Inloggad anonymt som host.");
        } catch (e) {
            console.error("Kunde inte logga in anonymt:", e);
            throw new Error("Kunde inte ansluta till Firebase-tjänsten.");
        }
    }

    const roomRef = doc(db, "rooms", roomId);

    // STEG 1 & 2: Kolla om rummet redan finns
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
        // Om rummet finns, kasta ett specifikt fel så host.js kan prova en ny kod
        throw new Error("ROOM_TAKEN");
    }

    // Skapa rummet (detta tillåts av 'create'-regeln om dokumentet inte fanns)
    try {
        await setDoc(roomRef, {
            hostUid: auth.currentUser.uid,
            locked: false,
            teams: [],
            event: null,
            createdAt: serverTimestamp(),
            lastCleared: serverTimestamp()
        });
    } catch (error) {
        console.error("Firebase Permission Error vid skapande:", error);
        throw new Error("Kunde inte reservera rummet. Testa att ladda om sidan.");
    }

    // Lyssna på Buzzers
    const buzzesRef = collection(db, "rooms", roomId, "buzzes");
    onSnapshot(query(buzzesRef, orderBy("timestamp", "asc")), (snapshot) => {
        const buzzes = [];
        snapshot.forEach(docSnap => buzzes.push(docSnap.data()));
        onBuzzerAdd(buzzes); 
    });

    // Lyssna på inloggade elever
    const playersRef = collection(db, "rooms", roomId, "players");
    onSnapshot(playersRef, (snapshot) => {
        const playersMap = {};
        snapshot.forEach(docSnap => playersMap[docSnap.id] = docSnap.data());
        onPlayersChange(playersMap); 
    });
}
// Lås / Lås upp buzzers
export async function setRoomLock(roomId, isLocked) {
    try {
        await updateDoc(doc(db, "rooms", roomId), { locked: isLocked });
    } catch (e) {
        console.error("Lock error:", e);
    }
}

// Rensa buzzers
export async function clearRoomBuzzers(roomId) {
    try {
        const snapshot = await getDocs(collection(db, "rooms", roomId, "buzzes"));
        const deletePromises = [];
        snapshot.forEach((docSnap) => {
            deletePromises.push(deleteDoc(doc(db, "rooms", roomId, "buzzes", docSnap.id)));
        });
        await Promise.all(deletePromises);
        await updateDoc(doc(db, "rooms", roomId), { lastCleared: serverTimestamp() });
    } catch (e) {
        console.error("Clear error:", e);
    }
}

// Synka uppdaterade lag till eleverna
export async function syncTeams(roomId, teams) {
    try {
        await updateDoc(doc(db, "rooms", roomId), { teams: teams });
    } catch (e) {
        console.error("Sync teams error:", e);
    }
}

// Ändra lag på en specifik elev (Drag & Drop)
export async function movePlayerTeam(roomId, uid, newTeam) {
    try {
        await updateDoc(doc(db, "rooms", roomId, "players", uid), { team: newTeam });
    } catch (e) {
        console.error("Move player error:", e);
    }
}

// Byt namn på en spelare
export async function renamePlayer(roomId, uid, newName) {
    try {
        await updateDoc(doc(db, "rooms", roomId, "players", uid), { name: newName });
    } catch (e) {
        console.error("Rename player error:", e);
    }
}

// Kicka en spelare
export async function kickPlayer(roomId, uid) {
    try {
        await deleteDoc(doc(db, "rooms", roomId, "players", uid));
    } catch (e) {
        console.error("Kick player error:", e);
    }
}

// Berätta för databasen (och eleverna) att ett event har startat
export async function setRoomEvent(roomId, eventName) {
    try {
        await updateDoc(doc(db, "rooms", roomId), { event: eventName });
    } catch (e) {
        console.error("Set event error:", e);
    }
}
