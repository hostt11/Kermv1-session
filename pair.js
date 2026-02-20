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

// Fonction pour supprimer un dossier de session
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        console.log(`[CLEANUP] Session folder removed: ${FilePath}`);
        return true;
    } catch (e) {
        console.error('[CLEANUP ERROR]', e.message);
        return false;
    }
}

router.get('/', async (req, res) => {
    const num = req.query.number;

    if (!num || !/^\+?\d{10,15}$/.test(num)) {
        return res.status(400).json({ error: 'Invalid or missing phone number (use international format)' });
    }

    // Nettoyage du numéro pour nom de dossier (sans + ni caractères spéciaux)
    const cleanNum = num.replace(/[^0-9]/g, '');
    const dirs = `./session_${cleanNum}`;

    // Supprime toute session existante pour repartir propre
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
                markOnlineOnConnect: false,
                shouldReconnect: (lastError) => {
                    const status = lastError?.output?.statusCode;
                    return status !== DisconnectReason.loggedOut && status !== 401;
                }
            });

            // Si pas encore enregistré → demande le code pairing
            if (!sock.authState.creds.registered) {
                await delay(1500);
                const pairingCode = await sock.requestPairingCode(cleanNum);
                
                if (!res.headersSent) {
                    console.log(`[PAIRING] Code généré pour ${cleanNum}: ${pairingCode}`);
                    res.json({ code: pairingCode, number: cleanNum });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log('[SUCCESS] Connexion ouverte → envoi de la session');
                    await delay(8000);

                    const credsPath = `${dirs}/creds.json`;
                    if (!fs.existsSync(credsPath)) {
                        console.error('[ERROR] creds.json introuvable après connexion');
                        if (!res.headersSent) res.status(500).json({ error: 'Session file not created' });
                        return;
                    }

                    // Upload vers Mega
                    function generateRandomId(len = 8) {
                        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        return Array(len).fill().map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
                    }

                    const fileName = `${generateRandomId()}.json`;
                    const megaUrl = await upload(fs.createReadStream(credsPath), fileName);

                    let sessionId = megaUrl.replace('https://mega.nz/file/', '');
                    sessionId = `KERM-MD-V1~${sessionId}`;

                    const targetJid = jidNormalizedUser(`${cleanNum}@s.whatsapp.net`);

                    // Envoi du session ID
                    await sock.sendMessage(targetJid, { text: sessionId });

                    // Message de confirmation
                    await sock.sendMessage(targetJid, {
                        text: `☝🏽☝🏽☝🏽 KERM MD V1 SESSION CONNECTÉE AVEC SUCCÈS ✅

> Ne partage JAMAIS cette session avec qui que ce soit

> Rejoins le channel pour les mises à jour :
https://whatsapp.com/channel/0029Vafn6hc7DAX3fzsKtn45

©️ POWERED BY KG TECH`
                    });

                    console.log('[SUCCESS] Session envoyée à', targetJid);

                    // Nettoyage
                    await delay(1000);
                    removeFile(dirs);
                    process.exit(0);
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`[CLOSE] Connexion fermée - Code: ${statusCode || 'inconnu'}`);

                    if (statusCode !== DisconnectReason.loggedOut && statusCode !== 401) {
                        console.log('[RETRY] Reconnexion dans 10 secondes...');
                        await delay(10000);
                        initiateSession();
                    } else {
                        console.log('[PERMANENT] Déconnexion définitive (logout ou ban)');
                        if (!res.headersSent) {
                            res.status(401).json({ error: 'Logout detected - new pairing required' });
                        }
                    }
                }
            });
        } catch (err) {
            console.error('[INIT ERROR]', err.stack || err.message);
            if (!res.headersSent) {
                res.status(503).json({ error: 'Failed to initialize session', details: err.message });
            }
        }
    }

    await initiateSession();
});

// Gestion globale des erreurs non capturées
process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT]', err.stack || err);
});

export default router;
