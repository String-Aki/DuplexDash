const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const logger = require('./logger');

async function getConversationalIntent(text, job) {
    if (!process.env.GEMINI_API_KEY) {
        return {
            intent: 'unknown',
            botReply: 'My AI brain is offline! Please add a GEMINI_API_KEY to the .env file and restart the server.',
            customRange: 'none'
        };
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const schema = {
        type: SchemaType.OBJECT,
        properties: {
            intent: {
                type: SchemaType.STRING,
                description: "The parsed intent of the user. MUST be one of: 'affirmative', 'cancel', 'flipped', 'prefs', or 'unknown'"
            },
            botReply: {
                type: SchemaType.STRING,
                description: "A natural, conversational, friendly response to the user based on their input and current job status."
            },
            copies: {
                type: SchemaType.INTEGER,
                description: "The number of copies requested. Only set if intent is 'prefs'. Default to 1 if not specified."
            },
            colorMode: {
                type: SchemaType.STRING,
                description: "The color mode requested ('Color' or 'BW'). Only set if intent is 'prefs'. Default to 'BW' if not specified."
            },
            customRange: {
                type: SchemaType.STRING,
                description: "If the user wants a specific subset of pages, put the CUPS-compatible range here (e.g. 'odd', 'even', '2', '1-5'). Otherwise, put 'none'."
            }
        },
        required: ["intent", "botReply", "customRange"]
    };

    const model = genAI.getGenerativeModel({
        model: "gemini-flash-latest",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
        }
    });

    const jobStatus = job ? job.status : 'no_active_job';
    const pagesInfo = job ? `Document has ${job.original_pages} pages. For a full duplex print of 1 copy, they will need ${Math.ceil(job.original_pages / 2)} sheets of physical paper.` : 'No document uploaded.';

    const systemPrompt = `You are a helpful, casual assistant at a home print shop. 
Your job is to parse the user's chat message and advance their print job state.
The user currently has a print job with status: '${jobStatus}'.
${pagesInfo}

Here is how the print job state machine works:
1. 'awaiting_start' -> User just uploaded a PDF. Wait for them to say 'yes', 'print', 'go ahead', etc. (intent: 'affirmative'). If they do, your botReply should ask how many copies and if they want color/bw. Also, inform them how many sheets of paper they will need if they do a standard print.
2. 'awaiting_prefs' -> User needs to specify copies, color, and page ranges (intent: 'prefs'). 
   - If they specify custom pages (like 'only odd pages', 'page 2', 'first page'), populate 'customRange' with the exact string to pass to the printer (e.g. 'odd', 'even', '2', '1').
   - Your botReply should say you are spooling up and printing.
3. 'waiting_for_flip' -> Odd pages printed. Wait for user to say 'done', 'flipped', 'loaded', etc. (intent: 'flipped'). Your botReply should say you are printing even pages.
Anytime they say 'cancel', 'stop', 'abort', the intent is 'cancel'.
If their message makes no sense for the current state, use intent 'unknown' and a botReply explaining what they need to do for their current status.
Keep your replies very natural, friendly, and brief (like a WhatsApp chat).`;

    try {
        const prompt = `${systemPrompt}\n\nUser Message: "${text}"`;
        const result = await model.generateContent(prompt);
        const jsonText = result.response.text();
        
        logger.log(`[AI ENGINE RAW] ${jsonText.trim()}`);
        
        return JSON.parse(jsonText);
    } catch (e) {
        logger.error(`Gemini Error: ${e.stack || e}`);
        return {
            intent: 'unknown',
            botReply: 'Sorry, I had a brain freeze processing that. Could you say it again?',
            customRange: 'none'
        };
    }
}

module.exports = { getConversationalIntent };
