#!/usr/bin/env node
// Fabrique une archive ZIP prête à déposer sur le PC serveur du cabinet.
// Contenu : code source backend + build React (dist/) + scripts PowerShell + docs.
// N'inclut PAS node_modules : `install-service.ps1` fait `npm install` côté Windows
// pour récupérer les binaires natifs de better-sqlite3 compilés pour win32.
//
// Usage :
//   npm run package:cabinet
// Produit :
//   releases/cabinet-cenon-<version>-<date>.zip
//
// Layout de l'archive (à dézipper dans C:\Cabinet\) :
//   C:\Cabinet\
//   ├── server\          ← code + scripts, AppDirectory NSSM
//   ├── dist\            ← build React, servi comme STATIC_DIR=..\dist
//   └── DEPLOYMENT.md    ← guide pas-à-pas

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const RELEASES_DIR = join(ROOT, 'releases');
const SERVER_DIR = join(ROOT, 'server');

// --- Vérification du token de production avant build ---
// Le VITE_OFFICE_TOKEN est baké dans le bundle JS au build. Si on package avec
// le token de dev, les clients cabinet ne pourront pas parler au serveur
// (qui aura un token différent). On refuse le packaging si on détecte un placeholder.
const productionEnvPath = join(ROOT, '.env.production');
if (!existsSync(productionEnvPath)) {
  console.error(`\n❌ .env.production manquant à la racine.\n`);
  console.error(`   Créer ce fichier avant de packager :\n`);
  console.error(`     cp .env.production.example .env.production`);
  console.error(`     # puis éditer VITE_OFFICE_TOKEN et VITE_SERVER_URL`);
  console.error(`   Sans ça, Vite utilisera .env.local (dev) et les clients cabinet auront le mauvais token.\n`);
  process.exit(1);
}
const prodEnv = readFileSync(productionEnvPath, 'utf8');
// Utiliser [ \t]* après = pour ne PAS consommer le \n de fin de ligne (sinon .+ ou .* capture la ligne suivante).
const tokenMatch = prodEnv.match(/^VITE_OFFICE_TOKEN[ \t]*=[ \t]*(.*)$/m);
const prodToken = tokenMatch?.[1]?.trim() ?? '';
if (!prodToken || prodToken.length < 16 || /REMPLACER|changeme|smoke-test/i.test(prodToken)) {
  console.error(`\n❌ VITE_OFFICE_TOKEN dans .env.production est manquant, trop court, ou un placeholder.\n`);
  console.error(`   Générer une valeur robuste :\n`);
  console.error(`     openssl rand -hex 32`);
  console.error(`   Le même token doit aussi être dans le .env serveur côté cabinet.\n`);
  process.exit(1);
}
const serverUrlMatch = prodEnv.match(/^VITE_SERVER_URL[ \t]*=[ \t]*(.*)$/m);
const prodServerUrl = serverUrlMatch?.[1]?.trim() ?? '';
// Vide = déploiement same-origin (le backend sert aussi le frontend en statique).
// Les fetch relatifs `/api/...` partent alors vers window.location.origin.
// Une URL explicite n'est nécessaire que si client et serveur sont sur des hôtes différents.
if (prodServerUrl !== '' && !/^https?:\/\//.test(prodServerUrl)) {
  console.error(`\n⚠️  VITE_SERVER_URL dans .env.production doit être soit vide (same-origin), soit une URL http(s)://...`);
  console.error(`   Valeur trouvée : "${prodServerUrl}"\n`);
  process.exit(1);
}
const urlMode = prodServerUrl ? `URL=${prodServerUrl}` : 'URL=(same-origin)';
console.log(`✓ .env.production validé : ${urlMode}, token=${prodToken.slice(0, 6)}…${prodToken.slice(-4)}\n`);

function step(label, fn) {
  process.stdout.write(`  • ${label}... `);
  const t0 = Date.now();
  try {
    fn();
    console.log(`OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    console.log('ÉCHEC');
    throw err;
  }
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

// 1. Lire la version dans server/package.json
const serverPkg = JSON.parse(readFileSync(join(SERVER_DIR, 'package.json'), 'utf8'));
const version = serverPkg.version;
const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const archiveBasename = `cabinet-cenon-${version}-${dateTag}`;
const archivePath = join(RELEASES_DIR, `${archiveBasename}.zip`);

console.log(`\nPackaging Cabinet Cenon v${version} → ${archivePath}\n`);

// 2. Build client (React → dist/)
step('Build client React (vite build)', () => run('npm run build', { cwd: ROOT }));

// 3. Build backend (tsc → server/dist/)
step('Build backend TypeScript', () => run('npm run build', { cwd: SERVER_DIR }));

// 4. Préparer le dossier de staging — layout qui s'extrait directement dans C:\Cabinet\
mkdirSync(RELEASES_DIR, { recursive: true });
const stagingDir = join(RELEASES_DIR, archiveBasename);
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
const stagingServer = join(stagingDir, 'server');
const stagingDist = join(stagingDir, 'dist');
mkdirSync(stagingServer, { recursive: true });

step('Copier dist/ client → <archive>/dist', () =>
  run(`cp -R "${join(ROOT, 'dist')}/" "${stagingDist}/"`),
);
step('Copier server/dist/ → <archive>/server/dist', () =>
  run(`cp -R "${join(SERVER_DIR, 'dist')}" "${stagingServer}/dist"`),
);
step('Copier server/src/ → <archive>/server/src', () =>
  run(`cp -R "${join(SERVER_DIR, 'src')}" "${stagingServer}/src"`),
);
step('Copier server/scripts/', () =>
  run(`cp -R "${join(SERVER_DIR, 'scripts')}" "${stagingServer}/scripts"`),
);
step('Copier server/package*.json + tsconfig.json', () => {
  run(`cp "${join(SERVER_DIR, 'package.json')}" "${stagingServer}/"`);
  run(`cp "${join(SERVER_DIR, 'package-lock.json')}" "${stagingServer}/"`);
  run(`cp "${join(SERVER_DIR, 'tsconfig.json')}" "${stagingServer}/"`);
});
step('Copier server/.env.example et README.md', () => {
  run(`cp "${join(SERVER_DIR, '.env.example')}" "${stagingServer}/"`);
  run(`cp "${join(SERVER_DIR, 'README.md')}" "${stagingServer}/"`);
});

const deploymentDoc = join(ROOT, 'DEPLOYMENT.md');
if (existsSync(deploymentDoc)) {
  step('Copier DEPLOYMENT.md à la racine', () => run(`cp "${deploymentDoc}" "${stagingDir}/"`));
}

// 5. Zipper (mode déterministe pour reproductibilité)
step('Création du ZIP', () =>
  run(
    `cd "${RELEASES_DIR}" && zip -r -X -q "${archiveBasename}.zip" "${archiveBasename}"`,
  ),
);

// 6. Nettoyer le staging
step('Nettoyage staging', () => rmSync(stagingDir, { recursive: true, force: true }));

// 7. Produire un sha256 à côté
step('Checksum SHA-256', () =>
  run(`cd "${RELEASES_DIR}" && shasum -a 256 "${archiveBasename}.zip" > "${archiveBasename}.zip.sha256"`),
);

// 8. Résumé
const sizeMb = (statSync(archivePath).size / 1024 / 1024).toFixed(2);

console.log('');
console.log('=== Archive prête ===');
console.log(`  Fichier   : ${archivePath}`);
console.log(`  Taille    : ${sizeMb} Mo`);
console.log(`  Checksum  : ${archivePath}.sha256`);
console.log('');
console.log('Prochaines étapes côté cabinet :');
console.log('  1. Transférer le ZIP sur le PC serveur (USB, rsync, SMB).');
console.log('  2. Dézipper dans C:\\Cabinet\\ → donne C:\\Cabinet\\server\\ et C:\\Cabinet\\dist\\.');
console.log('  3. cd C:\\Cabinet\\server ; Copy-Item .env.example .env ; notepad .env  (éditer OFFICE_TOKEN, PORT, HOST, STATIC_DIR=..\\dist).');
console.log('  4. Ouvrir PowerShell Admin : Set-ExecutionPolicy -Scope Process Bypass ; .\\scripts\\install-service.ps1');
console.log('  5. Vérifier : Invoke-RestMethod http://localhost:3000/api/health -Headers @{ "X-Office-Token" = "<token>" }');
