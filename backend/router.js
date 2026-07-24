const { getConversationalIntent } = require('./nlpEngine');
const logger = require('./logger');

async function routeMessage(text, payload, job) {
    // LAYER 1: Button / Inline Keyboard Payload Detection
    if (payload) {
        logger.log(`[ROUTER] Layer 1 Match (Payload): ${payload}`);
        return handlePayload(payload, job);
    }

    const lowerText = (text || '').trim().toLowerCase();

    // If no text and no payload, return unknown
    if (!lowerText) {
        return { intent: 'unknown', source: 'empty' };
    }

    // LAYER 2: Regex / Switch-Case Router
    if (/^(hi|hello|hey|hey there|status|help|start)$/i.test(lowerText)) {
        logger.log(`[ROUTER] Layer 2 Match (Regex Greeting)`);
        return { intent: 'greeting', botReply: '👋 *Welcome to DuplexDash!*\n\nSend me a PDF document to begin duplex printing.', source: 'regex' };
    }
    if (/(cancel|stop|abort|clear)/i.test(lowerText)) {
        logger.log(`[ROUTER] Layer 2 Match (Regex Cancel)`);
        return { intent: 'cancel', botReply: '🛑 Print job stopped and queue cleared.', source: 'regex' };
    }
    if (/^(yes|y|print|go ahead|proceed|start|sure|ok)$/i.test(lowerText)) {
        logger.log(`[ROUTER] Layer 2 Match (Regex Affirmative)`);
        return { intent: 'affirmative', source: 'regex' };
    }
    if (/(flipped|done|loaded|ready)/i.test(lowerText)) {
        logger.log(`[ROUTER] Layer 2 Match (Regex Flipped)`);
        return { intent: 'flipped', source: 'regex' };
    }
    if (/^(1|1 bw|1b|1 b|bw|b&w|black and white)$/i.test(lowerText)) {
        logger.log(`[ROUTER] Layer 2 Match (Regex Prefs 1 BW)`);
        return { intent: 'prefs', copies: 1, colorMode: 'BW', source: 'regex' };
    }
    if (/^(2|1 color|1c|1 c|color|colour)$/i.test(lowerText)) {
        logger.log(`[ROUTER] Layer 2 Match (Regex Prefs 1 Color)`);
        return { intent: 'prefs', copies: 1, colorMode: 'Color', source: 'regex' };
    }

    // LAYER 3: Gemini Fallback
    logger.log(`[ROUTER] Layer 3 Fallback (Gemini)`);
    const intentResult = await getConversationalIntent(text, job);
    return { ...intentResult, source: 'gemini' };
}

function handlePayload(payload, job) {
    switch (payload) {
        case 'BTN_AFFIRMATIVE':
            return { intent: 'affirmative', source: 'button' };
        case 'BTN_CANCEL':
            return { intent: 'cancel', botReply: 'Print job stopped and queue cleared.', source: 'button' };
        case 'BTN_FLIPPED':
            return { intent: 'flipped', source: 'button' };
        case 'BTN_PREF_1_BW':
            return { intent: 'prefs', copies: 1, colorMode: 'BW', source: 'button' };
        case 'BTN_PREF_1_COLOR':
            return { intent: 'prefs', copies: 1, colorMode: 'Color', source: 'button' };
        default:
            return { intent: 'unknown', source: 'button' };
    }
}

module.exports = { routeMessage };
