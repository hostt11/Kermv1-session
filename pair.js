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

// Suppression propre du dossier session
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return;
        fs.rmSync(FilePath, { recursive: true, force: true });
        console.log(`[CLEANUP] Session supprimée → ${FilePath}`);
    } catch (e) {
        console.error('[CLEANUP ERROR]', e.message);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: 'Numéro manquant ?number=2376...' });

    // Nettoyage du numéro
    const cleanNum = num.replace(/[^0-9]/g, '');
    const dirs = `./session_${cleanNum}`;

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
                browser: Browsers.ubuntu("Chrome"),
                syncFullHistory: false,
                markOnlineOnConnect: false
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                const code = await sock.requestPairingCode(cleanNum);

                console.log(`[PAIRING CODE] ${cleanNum} → ${code}`);
                if (!res.headersSent) {
                    res.json({ code, number: cleanNum });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log('✅ Connexion réussie → envoi de la session');

                    await delay(8000);

                    const credsPath = `${dirs}/creds.json`;
                    const sessionData = fs.readFileSync(credsPath);

                    // Upload Mega
                    function generateRandomId() {
                        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        return Array(8).fill().map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
                    }

                    const megaUrl = await upload(fs.createReadStream(credsPath), `${generateRandomId()}.json`);
                    let stringSession = megaUrl.replace('https://mega.nz/file/', '');
                    stringSession = `KERM-MD-V1~${stringSession}`;   // ← IMPORTANT

                    const userJid = jidNormalizedUser(`${cleanNum}@s.whatsapp.net`);

                    // Envoi du session ID
                    await sock.sendMessage(userJid, { text: stringSession });

                    // Message de succès clair
                    await sock.sendMessage(userJid, {
                        text: `✅ *KERM-MD-V1 CONNECTÉ AVEC SUCCÈS !*

🔑 *Session ID :*
\`\`\`${stringSession}\`\`\`

⚠️ *Ne partage jamais ce code avec personne !*

📌 Colle-le dans ta variable `SESSION_ID` de ton bot.

🔗 Channel updates : https://whatsapp.com/channel/0029Vafn6hc7DAX3fzsKtn45

© KG TECH`
                    });

                    await delay(1500);
                    removeFile(dirs);
                    process.exit(0);
                }

                if (connection === 'close') {
                    const status = lastDisconnect?.error?.output?.statusCode;
                    console.log(`[CLOSE] Code : ${status}`);

                    if (status !== DisconnectReason.loggedOut && status !== 401) {
                        console.log('🔄 Reconnexion dans 10s...');
                        await delay(10000);
                        initiateSession();
                    }
                }
            });
        } catch (err) {
            console.error('[ERROR]', err.stack || err);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        }
    }

    await initiateSession();
});

process.on('uncaughtException', (err) => {
    console.error('[CRASH]', err.stack || err);
});

export default router;
