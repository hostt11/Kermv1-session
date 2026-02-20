import express from 'express';
import fs from 'fs';
import pino from 'pino';
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    DisconnectReason
} from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        console.log(`Session folder removed: ${FilePath}`);
    } catch (e) {
        console.error('Error removing session folder:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) {
        return res.status(400).json({ error: 'Missing number parameter' });
    }

    let dirs = './' + num.replace(/[^0-9]/g, ''); // sanitize number

    // Remove any existing session to start fresh
    await removeFile(dirs);

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.ubuntu("Chrome", "20.0.04"),
                syncFullHistory: false,
                shouldReconnect: (lastError) => {
                    const statusCode = lastError?.output?.statusCode;
                    return statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
                }
            });

            if (!sock.authState.creds.registered) {
                await delay(2000);
                const cleanNum = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(cleanNum);
                
                if (!res.headersSent) {
                    console.log(`Pairing code generated for ${cleanNum}: ${code}`);
                    res.json({ code });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log('Connection opened successfully');
                    await delay(10000);

                    const credsPath = `${dirs}/creds.json`;
                    if (!fs.existsSync(credsPath)) {
                        console.error('creds.json not found after connection open');
                        return;
                    }

                    const sessionData = fs.readFileSync(credsPath);

                    // Generate random Mega file ID
                    function generateRandomId(length = 6, numberLength = 4) {
                        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        let result = '';
                        for (let i = 0; i < length; i++) {
                            result += chars.charAt(Math.floor(Math.random() * chars.length));
                        }
                        const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                        return `${result}${number}`;
                    }

                    const fileName = `${generateRandomId()}.json`;
                    const megaUrl = await upload(fs.createReadStream(credsPath), fileName);
                    
                    let stringSession = megaUrl.replace('https://mega.nz/file/', '');
                    stringSession = "KERM-MD-V1~" + stringSession;

                    const userJid = jidNormalizedUser(num + '@s.whatsapp.net');

                    // Send session string
                    await sock.sendMessage(userJid, { text: stringSession });

                    // Send confirmation message
                    await sock.sendMessage(userJid, {
                        text: '☝🏽☝🏽☝🏽𝖪𝖤𝖱𝖬 𝖬𝖣 𝖵𝟦 𝖲𝖤𝖲𝖲𝖨𝖮𝖭 𝖨𝖲 𝖲𝖴𝖢𝖢𝖤𝖲𝖲𝖥𝖴𝖫𝖫𝖸 𝖢𝖮𝖭𝖭𝖤𝖢𝖳𝖤𝖣✅\n\n' +
                              '> 𝖣𝗈𝗇’𝗍 𝖲𝗁𝖺𝗋𝖾 𝖳𝗁𝗂𝗌 𝖲𝖾𝗌𝗌𝗂𝗈𝗇 𝖶𝗂𝗍𝗁 𝖲𝗈𝗆𝖾𝗈𝗇𝖾\n\n' +
                              '> 𝖩𝗈𝗂𝗇 𝖢𝗁𝖺𝗇𝗇𝖾𝗅 𝖭𝗈𝗐: https://whatsapp.com/channel/0029Vafn6hc7DAX3fzsKtn45\n\n\n' +
                              '> ©️𝖯𝖮𝖶𝖤𝖱𝖤𝖣 𝖡𝖸 𝖪𝖦𝖳𝖤𝖢𝖧'
                    });

                    console.log('Session sent successfully to', userJid);

                    // Cleanup
                    await delay(500);
                    removeFile(dirs);
                    process.exit(0);
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`Connection closed - Status: ${statusCode || 'unknown'}`);

                    if (statusCode !== DisconnectReason.loggedOut && statusCode !== 401) {
                        console.log('Reconnecting in 10 seconds...');
                        await delay(10000);
                        initiateSession(); // retry
                    } else {
                        console.log('Permanent disconnect (logout or ban)');
                    }
                }
            });
        } catch (err) {
            console.error('Error during session initiation:', err.stack || err);
            if (!res.headersSent) {
                res.status(503).json({ error: 'Service temporarily unavailable', details: err.message });
            }
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err.stack || err);
});

export default router;
