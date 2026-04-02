import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { applyAiBoard, getCurrentBoardForAI } from './index.js';

window.aiDrafts = []; // Lagrar alla lyckade returer för nuvarande session

// ==========================================
// 1. SKAPA NYTT BRÄDE MED AI
// ==========================================
window.openAiModal = () => document.getElementById('aiModal').classList.replace('hidden', 'flex');
window.closeAiModal = () => document.getElementById('aiModal').classList.replace('flex', 'hidden');

window.generateAiBoard = async () => {
    const promptText = document.getElementById('aiPrompt').value.trim();
    if (!promptText) return window.showToast("Du måste skriva ett tema!", true);

    document.getElementById('aiButtons').classList.add('hidden');
    document.getElementById('aiLoading').classList.replace('hidden', 'flex');

    try {
        const apiKey = await getApiKey();
        const systemPrompt = getSystemPrompt();
        const userText = `Skapa ett jeopardy-bräde om temat: ${promptText}`;
        
        await runMultiModelGeneration(apiKey, systemPrompt, userText, false);
        
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
window.openAiEditModal = () => document.getElementById('aiEditModal').classList.replace('hidden', 'flex');
window.closeAiEditModal = () => document.getElementById('aiEditModal').classList.replace('flex', 'hidden');

window.modifyAiBoard = async () => {
    const promptText = document.getElementById('aiEditPrompt').value.trim();
    if (!promptText) return window.showToast("Du måste skriva vad du vill ändra!", true);

    const currentBoard = getCurrentBoardForAI();
    if (!currentBoard) return window.showToast("Inget bräde är valt.", true);

    document.getElementById('aiEditButtons').classList.add('hidden');
    document.getElementById('aiEditLoading').classList.replace('hidden', 'flex');

    try {
        const apiKey = await getApiKey();
        const systemPrompt = `Du är en AI-assistent som uteslutande bygger och REDIGERAR spelbräden till Jeopardy på svenska.
        Användaren kommer att skicka in sitt nuvarande spelbräde i JSON-format, följt av en instruktion på vad som ska ändras.
        Din uppgift är att applicera ändringarna och returnera ETT GILTIGT JSON-OBJEKT som representerar det HELA uppdaterade brädet.
        Behåll samma namn, om inte användaren explicit ber dig byta det.
        Generera INGEN markdown (t.ex. \`\`\`json). Bara den rena JSON-koden.
        
        Strukturen MÅSTE ha exakt 6 listor inuti "questions" och "answers":
        {
          "name": "Ett passande namn",
          "categories": ["Kat 1", "Kat 2", "Kat 3", "Kat 4", "Kat 5", "Kat 6"],
          "questions": [
            ["F1", "F2", "F3", "F4", "F5"],
            ["F1", "F2", "F3", "F4", "F5"],
            ["F1", "F2", "F3", "F4", "F5"],
            ["F1", "F2", "F3", "F4", "F5"],
            ["F1", "F2", "F3", "F4", "F5"],
            ["F1", "F2", "F3", "F4", "F5"]
          ],
          "answers": [
            ["S1", "S2", "S3", "S4", "S5"],
            ["S1", "S2", "S3", "S4", "S5"],
            ["S1", "S2", "S3", "S4", "S5"],
            ["S1", "S2", "S3", "S4", "S5"],
            ["S1", "S2", "S3", "S4", "S5"],
            ["S1", "S2", "S3", "S4", "S5"]
          ]
        }`;

        const userContent = `Här är mitt nuvarande bräde:\n${JSON.stringify({
            name: currentBoard.name, categories: currentBoard.categories, 
            questions: currentBoard.questions, answers: currentBoard.answers
        })}\n\nINSTRUKTION FÖR ÄNDRING:\n${promptText}`;
        
        await runMultiModelGeneration(apiKey, systemPrompt, userContent, true);
        
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
// 3. MULTI-MODEL RACE LOGIK
// ==========================================
async function runMultiModelGeneration(apiKey, systemPrompt, userText, isEditMode) {
    window.aiDrafts = []; // Nollställ tidigare utkast
    let isFirstResolved = false;

    // Vi definierar våra 5 "löpare"
    const tasks = [
        { id: 'Flash 3.1 (A)', model: 'gemini-3.1-flash-lite-preview', style: 'gemini' },
        { id: 'Flash 3.1 (B)', model: 'gemini-3.1-flash-lite-preview', style: 'gemini' },
        { id: 'Gemma (A)', model: 'gemma-4-31b-it', style: 'gemma' },
        { id: 'Gemma (B)', model: 'gemma-4-26b-a4b-it', style: 'gemma' },
        { id: 'Gemma (C)', model: 'gemma-3-27b-it', style: 'gemma' }
    ];

    return new Promise((resolve, reject) => {
        let failedCount = 0;

        tasks.forEach(task => {
            fetchAiModel(apiKey, systemPrompt, userText, task.model)
                .then(response => {
                    try {
                        const board = parseAiResponse(response);
                        window.aiDrafts.push({ board: board, info: task });
                        
                        // Sortera: Gemini först, sedan Gemma
                        window.aiDrafts.sort((a, b) => a.info.style === 'gemini' ? -1 : 1);

                        // Om detta är den allra första som lyckas, uppdatera huvudgränssnittet direkt
                        if (!isFirstResolved) {
                            isFirstResolved = true;
                            applyAiBoard(board, isEditMode);
                            resolve(); // Släpp modalen
                        } else {
                            // Om huvudbrädet redan är laddat, uppdatera bara knapparna i UI:t
                            if(typeof window.renderDraftSelector === 'function') {
                                window.renderDraftSelector();
                            }
                        }
                    } catch (parseErr) {
                        console.warn(`${task.id} returnerade trasig data.`);
                        checkFail(++failedCount, reject);
                    }
                })
                .catch(err => {
                    console.warn(`${task.id} kraschade:`, err);
                    checkFail(++failedCount, reject);
                });
        });

        function checkFail(count, rejectFn) {
            if (count === tasks.length && !isFirstResolved) {
                rejectFn(new Error("Alla 5 AI-anrop misslyckades. Servern kan vara överbelastad."));
            }
        }
    });
}

// ==========================================
// 4. HJÄLPFUNKTIONER
// ==========================================
async function getApiKey() {
    const secretSnap = await getDoc(doc(db, "secrets", "gemini"));
    if (!secretSnap.exists()) throw new Error("Kunde inte hitta API-nyckeln.");
    return secretSnap.data().key;
}

function getSystemPrompt() {
    return `Du är en AI-assistent som uteslutande bygger spelbräden till Jeopardy på svenska.
Din enda uppgift är returnera ETT GILTIGT JSON-OBJEKT.
MÅSTE ha exakt 6 kategorier och exakt 5 frågor/svar per kategori.
Generera INGEN markdown (t.ex. \`\`\`json). Bara den rena JSON-koden.

VIKTIGT: "questions" och "answers" MÅSTE innehålla exakt 6 stycken listor (en för varje kategori).

{
  "name": "Ett passande namn",
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
}`;
}

async function fetchAiModel(apiKey, systemInstruction, userText, modelName) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    let requestBody;

    // Gemma stödjer inte systemInstruction eller responseMimeType i Googles API
    if (modelName.includes("gemma")) {
        requestBody = {
            contents: [{ parts: [{ text: `INSTRUKTION TILL AI:\n${systemInstruction}\n\nANVÄNDARENS PROMPT:\n${userText}` }] }],
            generationConfig: { temperature: 1.0 }
        };
    } else {
        // Gemini (Flash) stödjer full funktionalitet
        requestBody = {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: [{ text: userText }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.8 }
        };
    }

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) throw new Error(`API-fel: ${response.status}`);
    return await response.json();
}

function parseAiResponse(data) {
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error("API-svar saknar innehåll.");
    }
    
    const rawText = data.candidates[0].content.parts[0].text;
    
    try {
        // Tvätta strängen från markdown
        let cleanText = rawText.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
        
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        } else {
            throw new Error("Hittade inte start/slut-klamrar { }");
        }
        
        const board = JSON.parse(cleanText);
        if (!board.categories || board.categories.length !== 6 || !board.questions || board.questions.length !== 6) {
            throw new Error("Fel antal kategorier eller frågor.");
        }

        board.media = {};
        return board;
    } catch (e) {
        // HÄR FÅNGAR VI RÅDATA OM DET KRASCHAR
        console.groupCollapsed("❌ Trasig JSON från AI");
        console.log("Felmeddelande:", e.message);
        console.log("Råtext från AI:", rawText);
        console.groupEnd();
        
        throw e; // Kasta vidare felet så runMultiModelGeneration fångar det
    }
}
