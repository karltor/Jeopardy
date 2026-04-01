import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { applyAiBoard, getCurrentBoardForAI } from './index.js';

// ==========================================
// 1. SKAPA NYTT BRÄDE MED AI
// ==========================================

window.openAiModal = () => {
    document.getElementById('aiModal').classList.replace('hidden', 'flex');
};

window.closeAiModal = () => {
    document.getElementById('aiModal').classList.replace('flex', 'hidden');
};

window.generateAiBoard = async () => {
    const promptText = document.getElementById('aiPrompt').value.trim();
    if (!promptText) {
        window.showToast("Du måste skriva ett tema!", true);
        return;
    }

    document.getElementById('aiButtons').classList.add('hidden');
    document.getElementById('aiLoading').classList.replace('hidden', 'flex');

    try {
        const apiKey = await getApiKey();
        const systemPrompt = getSystemPrompt();
        const userText = `Skapa ett jeopardy-bräde om temat: ${promptText}`;
        
        const response = await fetchGemini(apiKey, systemPrompt, userText);
        const generatedBoard = parseAiResponse(response);
        
        // false = skapa som ett helt nytt bräde i listan
        await applyAiBoard(generatedBoard, false); 
        
        window.closeAiModal();
        document.getElementById('aiPrompt').value = '';
    } catch (e) {
        window.showToast(e.message || "Något gick fel med AI-anropet.", true);
    } finally {
        document.getElementById('aiLoading').classList.replace('flex', 'hidden');
        document.getElementById('aiButtons').classList.remove('hidden');
    }
};

// ==========================================
// 2. REDIGERA BEFINTLIGT BRÄDE MED AI
// ==========================================

window.openAiEditModal = () => {
    document.getElementById('aiEditModal').classList.replace('hidden', 'flex');
};

window.closeAiEditModal = () => {
    document.getElementById('aiEditModal').classList.replace('flex', 'hidden');
};

window.modifyAiBoard = async () => {
    const promptText = document.getElementById('aiEditPrompt').value.trim();
    if (!promptText) {
        window.showToast("Du måste skriva vad du vill ändra!", true);
        return;
    }

    const currentBoard = getCurrentBoardForAI();
    if (!currentBoard) {
        window.showToast("Inget bräde är valt.", true);
        return;
    }

    document.getElementById('aiEditButtons').classList.add('hidden');
    document.getElementById('aiEditLoading').classList.replace('hidden', 'flex');

    try {
        const apiKey = await getApiKey();
        
        // Specifik system-prompt för redigering
        const systemPrompt = `Du är en AI-assistent som uteslutande bygger och REDIGERAR spelbräden till Jeopardy på svenska.
Användaren kommer att skicka in sitt nuvarande spelbräde i JSON-format, följt av en instruktion på vad som ska ändras.
Din uppgift är att applicera ändringarna och returnera ETT GILTIGT JSON-OBJEKT som representerar det HELA uppdaterade brädet.
Behåll samma namn, om inte användaren explicit ber dig byta det.
Strukturen MÅSTE exakt vara:
{
  "name": "Ett passande namn",
  "categories": ["Kat 1", "Kat 2", "Kat 3", "Kat 4", "Kat 5", "Kat 6"],
  "questions": [ [...5 st], [...5 st], [...5 st], [...5 st], [...5 st], [...5 st] ],
  "answers": [ [...5 st], [...5 st], [...5 st], [...5 st], [...5 st], [...5 st] ]
}
Generera INGEN markdown (t.ex. \`\`\`json). Bara den rena JSON-koden.`;

        // Skicka in det nuvarande brädet + användarens instruktion
        const userContent = `Här är mitt nuvarande bräde:\n${JSON.stringify({
            name: currentBoard.name, 
            categories: currentBoard.categories, 
            questions: currentBoard.questions, 
            answers: currentBoard.answers
        })}\n\nINSTRUKTION FÖR ÄNDRING:\n${promptText}`;
        
        const response = await fetchGemini(apiKey, systemPrompt, userContent);
        const generatedBoard = parseAiResponse(response);
        
        // true = skriv över det bräde vi just nu har öppet
        await applyAiBoard(generatedBoard, true); 
        
        window.closeAiEditModal();
        document.getElementById('aiEditPrompt').value = '';
    } catch (e) {
        window.showToast(e.message || "Något gick fel med AI-anropet.", true);
    } finally {
        document.getElementById('aiEditLoading').classList.replace('flex', 'hidden');
        document.getElementById('aiEditButtons').classList.remove('hidden');
    }
};

// ==========================================
// 3. HJÄLPFUNKTIONER (Delas av båda)
// ==========================================

async function getApiKey() {
    const secretSnap = await getDoc(doc(db, "secrets", "gemini"));
    if (!secretSnap.exists()) {
        throw new Error("Kunde inte hitta API-nyckeln. Kontrollera att du är inloggad som lärare.");
    }
    return secretSnap.data().key;
}

function getSystemPrompt() {
    return `Du är en AI-assistent som uteslutande bygger spelbräden till Jeopardy på svenska.
Din enda uppgift är att returnera ETT GILTIGT JSON-OBJEKT baserat på det temat.
JSON-objektet MÅSTE exakt följa denna struktur:
{
  "name": "Ett passande namn på spelet",
  "categories": ["Kategori 1", "Kategori 2", "Kategori 3", "Kategori 4", "Kategori 5", "Kategori 6"],
  "questions": [
    ["Fråga 100", "Fråga 200", "Fråga 300", "Fråga 400", "Fråga 500"],
    ["Fråga 100", "Fråga 200", "Fråga 300", "Fråga 400", "Fråga 500"],
    ["Fråga 100", "Fråga 200", "Fråga 300", "Fråga 400", "Fråga 500"],
    ["Fråga 100", "Fråga 200", "Fråga 300", "Fråga 400", "Fråga 500"],
    ["Fråga 100", "Fråga 200", "Fråga 300", "Fråga 400", "Fråga 500"],
    ["Fråga 100", "Fråga 200", "Fråga 300", "Fråga 400", "Fråga 500"]
  ],
  "answers": [
    ["Svar 100", "Svar 200", "Svar 300", "Svar 400", "Svar 500"],
    ["Svar 100", "Svar 200", "Svar 300", "Svar 400", "Svar 500"],
    ["Svar 100", "Svar 200", "Svar 300", "Svar 400", "Svar 500"],
    ["Svar 100", "Svar 200", "Svar 300", "Svar 400", "Svar 500"],
    ["Svar 100", "Svar 200", "Svar 300", "Svar 400", "Svar 500"],
    ["Svar 100", "Svar 200", "Svar 300", "Svar 400", "Svar 500"]
  ]
}

STRIKTA REGLER:
1. MÅSTE ha exakt 6 kategorier.
2. "questions" MÅSTE ha 6 arrayer, var och en med exakt 5 strängar (ökande svårighetsgrad).
3. "answers" MÅSTE ha 6 arrayer, var och en med exakt 5 strängar som matchar frågorna.
4. Generera INGEN markdown (t.ex. \`\`\`json). Bara den rena JSON-koden.`;
}

async function fetchGemini(apiKey, systemInstruction, userText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;
    
    const requestBody = {
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
        contents: [{
            parts: [{ text: userText }]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7 
        }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        throw new Error(`API-fel: ${response.status}`);
    }

    return await response.json();
}

function parseAiResponse(data) {
    // VIKTIGT: Använder 'let' här!
    let aiText = data.candidates[0].content.parts[0].text;
    
    const firstBrace = aiText.indexOf('{');
    const lastBrace = aiText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
        aiText = aiText.substring(firstBrace, lastBrace + 1);
    } else {
        throw new Error("Kunde inte hitta ett giltigt JSON-objekt i AI:ns svar.");
    }
    
    const board = JSON.parse(aiText);

    if (!board.categories || board.categories.length !== 6 || !board.questions || board.questions.length !== 6) {
        throw new Error("AI returnerade inte rätt antal kategorier/frågor.");
    }

    // Lägg till tomt media-objekt för att appen inte ska krascha
    board.media = {};
    
    return board;
}
