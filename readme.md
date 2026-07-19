# 🚀 Space Verse — Launcher

Launcher officiel du serveur **FiveM Space Verse**, sur le thème spatial.
Application de bureau **Electron** (Windows) avec détection FiveM, statut serveur en
temps réel, purge de cache, mises à jour automatiques et une interface HUD spatiale animée.

---

## ✨ Fonctionnalités

- **Scène spatiale 3D temps réel (WebGL / Three.js, hors ligne)** : planète procédurale
  (générée par bruit, sans texture externe) avec atmosphère fresnel, nuages, lune, station
  en orbite, 6000 étoiles en profondeur et nébuleuses ; caméra réactive à la souris.
- **Application multi-sections** avec barre latérale :
  - **Jouer** — logo, contrôle de mission, télémétrie + sparklines, décollage.
  - **Joueurs** — liste **en direct** des connectés (avatar, ID, latence colorée).
  - **Actus** — flux de patchnotes/actualités (configurable dans `config.json`).
  - **Réglages** — infos serveur, chemin FiveM, toggles (3D / sons / animations), maintenance.
- **Cinématique de décollage** plein écran : compte à rebours + hyperespace (warp) au join.
- **Effets sonores WebAudio** (sans fichiers), activables dans les réglages.
- **Statut serveur temps réel** : état réseau, population (`joueurs / max`), latence mesurée,
  historique en sparkline.
- **Lancement intelligent de FiveM** : détecte si FiveM est déjà ouvert, sinon l'ouvre,
  attend la fin du chargement, puis envoie la connexion `fivem://connect/...`.
- **Purge du cache FiveM** en un clic (crashes, logs, cache, nui-storage, server-cache).
- **Mises à jour automatiques** via GitHub Releases (electron-updater).
- **Curseur réticule** custom à traînée d'ions, séquence de démarrage, actualisation auto (30 s).

---

## 🛠️ Installation (développement)

```bash
npm install
npm start
```

> Nécessite **Node.js 18+** et **Windows** (lecture du registre FiveM + PowerShell).

---

## 📦 Compilation (.exe / installateur)

```bash
npm run build:win
```

L'installateur NSIS est généré dans `dist/`
(`SpaceVerse-Launcher-Setup-x.y.z.exe`).

> **Erreur « Cannot create symbolic link » au build ?**
> Elle est déjà corrigée automatiquement. electron-builder télécharge l'outil
> `winCodeSign` dont l'archive contient des liens symboliques macOS que Windows
> refuse de créer sans privilège. Le script [`scripts/prepare-wincodesign.js`](scripts/prepare-wincodesign.js),
> lancé automatiquement via le hook npm `prebuild:win`, pré-remplit le cache en
> extrayant l'archive **sans le dossier `darwin`** — plus besoin du Mode développeur
> ni des droits admin. Pour le relancer seul : `npm run fix-wincodesign`.

---

## ⚙️ Configuration — `config.json`

| Clé | Description |
|-----|-------------|
| `servers[0].ip` | Adresse `IP:PORT` du serveur Space Verse |
| `servers[0].svname` | Nom affiché du serveur |
| `discord` | Lien d'invitation Discord |
| `githubOwner` / `githubRepo` | Dépôt GitHub des releases (auto-update) |
| `autoRefreshInterval` | Intervalle d'actualisation (ms) |

Valeurs actuelles :

```json
{
    "discord": "https://discord.gg/M9UPEAxXgq",
    "servers": [{ "svname": "Space Verse", "ip": "136.243.177.111:30275" }]
}
```

---

## 🔄 Activer les mises à jour automatiques

1. Crée un dépôt GitHub public (ex. `spaceverse_launcher`).
2. Renseigne `githubOwner` / `githubRepo` dans `config.json` **et** le bloc
   `build.publish` de `package.json`.
3. Publie une release :

```bash
npm run release
```

> ⚠️ L'auto-update ne s'active **que dans l'application compilée** (pas en `npm start`).

---

## 🗂️ Structure

```
├── main.js               # Process principal Electron (fenêtre, IPC, lancement FiveM, updater)
├── preload.js            # Pont sécurisé contextBridge
├── render.js             # Logique UI (vues, statut, joueurs, actus, réglages, cinématique)
├── space3d.js            # Scène 3D Three.js (planète procédurale, atmosphère, station...)
├── cursor.js             # Curseur réticule + particules
├── index.html            # Interface HUD multi-sections
├── styles/main.css       # Thème spatial
├── Server/index.js       # Client API serveur FiveM (info/players + latence)
├── vendor/three.module.min.js  # Three.js embarqué (hors ligne)
├── config.json           # Configuration (serveur, discord, actus)
├── icon.ico              # Icône application
└── img/logo.png          # Logo détouré
```

---

*Ad astra, per aspera.* ✦
