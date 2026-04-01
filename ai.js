import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { applyAiBoard } from './index.js';

// Hantera UI för modalen
window.openAiModal = () => {
    const modal = document.getElementById('aiModal');
    modal.classList.replace('hidden', 'flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        document.getElementById('aiModalContent').classList.remove('scale-95');
    }, 10);
};

window.closeAiModal = () => {
    const modal = document.getElementById('aiModal');
    modal.classList.add('opacity-0');
    document.getElementById('aiModalContent').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.replace('flex', 'hidden');
    }, 200);
};

// Skarp AI-generering
window.generateAiBoard = async () => {
    const promptText = document.getElementById('aiPrompt').value.trim();
    if (!promptText) {
        window.showToast("Du måste skriva ett tema!", "⚠️", true);
        return;
    }

    // Göm knappar, visa laddning
    document.getElementById('aiButtons').classList.add('hidden');
    document.getElementById('aiLoading').classList.replace('hidden', 'flex');

    try {
        // 1. Hämta API-nyckeln från Firestore (skyddad av dina regler)
        const secretRef = doc(db, "secrets", "gemini");
        const secretSnap = await getDoc(secretRef);

        if (!secretSnap.exists()) {
            throw new Error("Kunde inte hitta API-nyckeln. Kontrollera att du är inloggad som lärare.");
        }

        const apiKey = secretSnap.data().key;

        // 2. Förbered instruktionen till Gemini
        const systemPrompt = `
Du är en AI-assistent som uteslutande bygger spelbräden till Jeopardy på svenska.
Användaren kommer att ange ett tema. Din enda uppgift är att returnera ETT GILTIGT JSON-OBJEKT baserat på det temat.
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
4. Generera INGEN markdown (t.ex. \`\`\`json). Bara den rena JSON-koden.
        `;

        // 3. Konfigurera anropet (Vi använder 3.1 Flash-Lite för snabbhet)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;
        
        const requestBody = {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [{
                parts: [{ text: `Skapa ett jeopardy-bräde om temat: ${promptText}` }]
            }],
            generationConfig: {
                // Tvingar fram JSON från AI:n
                responseMimeType: "application/json",
                temperature: 0.7 
            }
        };

        // 4. Skicka till Gemini
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error:", errorData);
            throw new Error(`API-fel: ${response.status}`);
        }

        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;
        const firstBrace = aiText.indexOf('{');
        const lastBrace = aiText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            aiText = aiText.substring(firstBrace, lastBrace + 1);
        } else {
            throw new Error("Kunde inte hitta ett giltigt JSON-objekt i AI:ns svar.");
        }
        // 5. Tolka JSON och säkerställ format
        const generatedBoard = JSON.parse(aiText);

        if (!generatedBoard.categories || generatedBoard.categories.length !== 6 || 
            !generatedBoard.questions || generatedBoard.questions.length !== 6) {
            throw new Error("AI returnerade inte rätt antal kategorier/frågor.");
        }

        // Lägg till tomt media-objekt för att appen inte ska krascha
        generatedBoard.media = {};

        // 6. Skicka datan till UI:t
        applyAiBoard(generatedBoard);
        
        window.showToast("Bräde genererat via AI!", "✨");
        window.closeAiModal();
        document.getElementById('aiPrompt').value = '';

    } catch (e) {
        console.error("Genereringsfel:", e);
        window.showToast(e.message || "Något gick fel med AI-anropet.", "❌", true);
    } finally {
        // Återställ knapparna
        document.getElementById('aiLoading').classList.replace('flex', 'hidden');
        document.getElementById('aiButtons').classList.remove('hidden');
    }
};
