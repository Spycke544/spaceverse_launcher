/**
 * prepare-wincodesign.js
 * ----------------------------------------------------------------------------
 * Corrige l'erreur de build Windows :
 *   "Cannot create symbolic link : Le client ne dispose pas d'un privilège nécessaire"
 *
 * electron-builder télécharge l'outil `winCodeSign`, dont l'archive contient des
 * liens symboliques macOS (.dylib). Les créer sous Windows exige un privilège
 * (Mode développeur ou admin). Ce script pré-remplit le cache winCodeSign en
 * extrayant l'archive SANS le dossier `darwin` (inutile sous Windows), ce qui
 * évite complètement la création de liens symboliques.
 *
 * Lancé automatiquement avant chaque build via les hooks npm `prebuild*`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const VERSION = 'winCodeSign-2.6.0';
const URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${VERSION}/${VERSION}.7z`;

const cacheDir = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'electron-builder', 'Cache', 'winCodeSign'
);
const targetDir = path.join(cacheDir, VERSION);
const marker = path.join(targetDir, 'rcedit-x64.exe');

function log(msg) { console.log(`[winCodeSign] ${msg}`); }

// Already seeded correctly → nothing to do.
if (fs.existsSync(marker)) {
    log('cache déjà prêt, rien à faire.');
    process.exit(0);
}

// Locate the bundled 7za from the 7zip-bin dependency.
let sevenZip;
try {
    sevenZip = require('7zip-bin').path7za;
} catch (e) {
    log('AVERTISSEMENT : 7zip-bin introuvable, on laisse electron-builder gérer.');
    process.exit(0);
}

const tmp7z = path.join(os.tmpdir(), `${VERSION}.7z`);

function download(url, dest, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('trop de redirections'));
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                fs.rmSync(dest, { force: true });
                return resolve(download(res.headers.location, dest, redirects + 1));
            }
            if (res.statusCode !== 200) {
                file.close();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => { fs.rmSync(dest, { force: true }); reject(err); });
    });
}

(async () => {
    try {
        if (!fs.existsSync(tmp7z) || fs.statSync(tmp7z).size < 1_000_000) {
            log('téléchargement de l’archive...');
            await download(URL, tmp7z);
        }
        log('extraction sans le dossier darwin (évite les liens symboliques)...');
        fs.mkdirSync(targetDir, { recursive: true });
        // -xr!darwin exclut le dossier macOS ; -y répond oui à tout.
        execFileSync(sevenZip, ['x', tmp7z, `-o${targetDir}`, '-xr!darwin', '-y'], { stdio: 'ignore' });

        if (fs.existsSync(marker)) {
            log('cache prêt ✓ — le build peut continuer.');
        } else {
            log('AVERTISSEMENT : extraction incomplète, electron-builder tentera son propre téléchargement.');
        }
    } catch (err) {
        log(`AVERTISSEMENT : ${err.message} — on laisse electron-builder gérer.`);
    } finally {
        try { fs.rmSync(tmp7z, { force: true }); } catch {}
    }
})();
