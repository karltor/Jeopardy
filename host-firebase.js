// host-firebase.js
import { auth, db, signInAnonymously } from './firebase-config.js';
import { 
    doc, 
    setDoc, 
    getDoc,
    updateDoc, 
    onSnapshot, 
    collection, 
    query, 
    orderBy, 
    getDocs, 
    deleteDoc, 
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// Skapar rummet och lyssnar på buzzers & spelare
export async function setupFirebaseRoom(roomId, onBuzzerAdd, onPlayersChange) {
    
    // Logga in anonymt om vi inte redan är inloggade
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
    const userLimitRef = doc(db, "users", auth.currentUser.uid);

    // Kontrollera om rummet redan finns
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
        throw new Error("ROOM_TAKEN");
    }

    // Skapa en Batch för att köra rate-limit-logik och rumskapande samtidigt
    const batch = writeBatch(db);

    // 1. Förbered rummet
    batch.set(roomRef, {
        hostUid: auth.currentUser.uid,
        locked: false,
        teams: [],
        event: null,
        createdAt: serverTimestamp(),
        lastCleared: serverTimestamp()
    });

    // 2. Uppdatera användarens tidsstämpel för rate-limiting (använder merge för att skapa om doc saknas)
    batch.set(userLimitRef, {
        lastRoomCreated: serverTimestamp()
    }, { merge: true });

    try {
        // Skicka båda ändringarna samtidigt. Om reglerna nekar den ena, nekas båda.
        await batch.commit();
        console.log(`Rum ${roomId} reserverat och tidsstämpel uppdaterad.`);
    } catch (error) {
        console.error("Firebase Permission Error vid skapande:", error);
        // Oftast betyder detta att användaren försöker skapa rum för snabbt enligt reglerna
        throw new Error("RATE_LIMIT_EXCEEDED");
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
