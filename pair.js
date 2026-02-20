if (connection === "open") {
    await delay(10000);
    const sessionGlobal = fs.readFileSync(dirs + '/creds.json');

    function generateRandomId(length = 6, numberLength = 4) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        const number = Math.floor(Math.random() * Math.pow(10, numberLength));
        return `${result}${number}`;
    }

    const megaUrl = await upload(fs.createReadStream(`${dirs}/creds.json`), `${generateRandomId()}.json`);
    
    let stringSession = megaUrl.replace('https://mega.nz/file/', '');
    stringSession = "KERM-MD-V1~" + stringSession;           // ← Ajout de ton prefix ici

    const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
    await GlobalTechInc.sendMessage(userJid, { text: stringSession });

    await GlobalTechInc.sendMessage(userJid, { 
        text: '☝🏽☝🏽☝🏽𝖪𝖤𝖱𝖬 𝖬𝖣 𝖵𝟦 𝖲𝖤𝖲𝖲𝖨𝖮𝖭 𝖨𝖲 𝖲𝖴𝖢𝖢𝖤𝖲𝖲𝖥𝖴𝖫𝖫𝖸 𝖢𝖮𝖭𝖭𝖤𝖢𝖳𝖤𝖣✅\n\n> 𝖣𝗈𝗇’𝗍 𝖲𝗁𝖺𝗋𝖾 𝖳𝗁𝗂𝗌 𝖲𝖾𝗌𝗌𝗂𝗈𝗇 𝖶𝗂𝗍𝗁 𝖲𝗈𝗆𝖾𝗈𝗇𝖾\n\n> 𝖩𝗈𝗂𝗇 𝖢𝗁𝖺𝗇𝗇𝖾𝗅 𝖭𝗈𝗐:https://whatsapp.com/channel/0029Vafn6hc7DAX3fzsKtn45\n\n\n> ©️𝖯𝖮𝖶𝖤𝖱𝖤𝖣 𝖡𝖸 𝖪𝖦𝖳𝖤𝖢𝖧' 
    });
    
    await delay(100);
    removeFile(dirs);
    process.exit(0);
}
