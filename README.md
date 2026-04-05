# 🌍 AfriaBridge — Application Mobile

> Transfert d'argent & livraison de colis sécurisés • Diaspora ↔ Afrique

---

## 📁 Structure des fichiers

```
afriabridge/
├── index.html              ← Application web complète (HTML/CSS/JS)
├── style.css               ← Design system complet (mobile-first)
├── app.js                  ← Logique applicative complète
├── manifest.json           ← Configuration PWA
├── sw.js                   ← Service Worker (offline + push)
├── capacitor.config.json   ← Configuration Capacitor (iOS / Android)
├── package.json            ← Dépendances et scripts
└── README.md               ← Ce fichier
```

---

## 🚀 DÉMARRAGE RAPIDE

### 1. Prérequis

```bash
node --version   # ≥ 18.0
npm --version    # ≥ 9.0
java --version   # ≥ 17 (pour Android)
```

### 2. Installation

```bash
cd afriabridge
npm install
```

### 3. Test en navigateur (développement)

```bash
npm run dev
# → Ouvrez http://localhost:3000
# → Utilisez les DevTools (F12) > Mode mobile (Ctrl+Shift+M)
```

---

## 📱 DÉPLOIEMENT ANDROID (Google Play Store)

### Étape 1 — Initialiser Capacitor + Android

```bash
# Initialiser Capacitor
npx cap init AfriaBridge com.afriabridge.app --web-dir .

# Ajouter le projet Android
npx cap add android

# Synchroniser les fichiers web vers Android
npx cap sync android
```

### Étape 2 — Ouvrir dans Android Studio

```bash
npm run cap:open:android
# OU
npx cap open android
```

> **Dans Android Studio :**
> 1. Attendez que Gradle finisse de synchroniser
> 2. Connectez un téléphone Android en mode développeur (USB Debugging activé)
> 3. Cliquez sur ▶ Run pour tester sur l'appareil

### Étape 3 — Générer les icônes et splash screens

```bash
# Placez votre logo (1024x1024px) dans assets/icon.png
# et votre splash (2732x2732px) dans assets/splash.png
mkdir -p assets
cp votre-logo.png assets/icon.png
cp votre-splash.png assets/splash.png

npm run icons
# Génère automatiquement toutes les tailles requises
```

### Étape 4 — Créer le keystore (signature)

```bash
keytool -genkey -v \
  -keystore afriabridge.keystore \
  -alias afriabridge \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass VotreMotDePasse \
  -keypass VotreMotDePasse \
  -dname "CN=AfriaBridge, OU=Mobile, O=AfriaBridge Inc, L=Montreal, ST=QC, C=CA"

# ⚠️  IMPORTANT : Gardez ce fichier .keystore en lieu sûr !
# Sans lui, vous ne pourrez plus mettre à jour l'app sur le Play Store.
```

### Étape 5 — Build de production (AAB pour Play Store)

```bash
# Via Android Studio : Build > Generate Signed Bundle/APK
# Sélectionnez "Android App Bundle (.aab)" pour le Play Store
# Ou APK pour installer directement sur un appareil

# Via ligne de commande :
cd android
./gradlew bundleRelease
# → Fichier généré : android/app/build/outputs/bundle/release/app-release.aab
```

### Étape 6 — Publier sur Google Play Store

1. Créer un compte Google Play Console : https://play.google.com/console
   (Frais unique : 25 USD)
2. Créer une nouvelle application
3. Remplir les métadonnées : titre, description, captures d'écran, politique de confidentialité
4. Uploader le fichier `.aab` dans la section "Production"
5. Soumettre pour review (délai : 1 à 7 jours)

**Métadonnées recommandées :**
- Titre : `AfriaBridge - Transferts & Colis`
- Catégorie : Finance
- Âge minimum : 18+
- Pays : France, Canada, Belgique, Suisse, Sénégal, Côte d'Ivoire, Cameroun…

---

## 🍎 DÉPLOIEMENT iOS (Apple App Store)

> **Prérequis :** Mac avec Xcode 15+ et compte Apple Developer (99 USD/an)

### Étape 1 — Ajouter iOS

```bash
npx cap add ios
npx cap sync ios
npm run cap:open:ios
# Ouvre Xcode automatiquement
```

### Étape 2 — Configuration Xcode

1. Ouvrir `App/App.xcworkspace` dans Xcode
2. Sélectionner la target "App"
3. Dans "Signing & Capabilities" :
   - Team : votre équipe Apple Developer
   - Bundle Identifier : `com.afriabridge.app`
4. Ajouter les permissions dans `Info.plist` :

```xml
<key>NSCameraUsageDescription</key>
<string>AfriaBridge utilise votre caméra pour la vérification KYC et les photos de colis.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>AfriaBridge accède à vos photos pour la vérification d'identité.</string>

<key>NSFaceIDUsageDescription</key>
<string>AfriaBridge utilise Face ID pour sécuriser votre connexion.</string>
```

### Étape 3 — Build et publication

1. Dans Xcode : Product > Archive
2. Ouvrir Organizer (Window > Organizer)
3. Cliquer "Distribute App" > "App Store Connect"
4. Suivre le wizard de publication
5. Compléter les métadonnées sur App Store Connect : https://appstoreconnect.apple.com
6. Soumettre pour review Apple (délai : 24-72 heures)

---

## 🌐 DÉPLOIEMENT WEB (PWA)

L'application fonctionne aussi directement en navigateur comme Progressive Web App.

```bash
# Déployer sur Netlify (gratuit)
npx netlify deploy --prod --dir .

# Déployer sur Vercel (gratuit)
npx vercel --prod

# Déployer sur votre serveur
rsync -avz ./ user@votre-serveur.com:/var/www/afriabridge/
```

**Activer le Service Worker en production :**
Ajoutez avant `</body>` dans index.html (déjà inclus) :
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
</script>
```

---

## ⚙️ CONNEXION AU BACKEND

Editez la variable `CONFIG.API_URL` dans `app.js` :

```javascript
const CONFIG = {
  API_URL: 'https://api.afriabridge.com/api', // ← Votre URL backend
  // ...
};
```

> **Mode démo :** Sans backend, l'app fonctionne avec des données simulées (login/register/transferts fictifs). Parfait pour les tests UI.

---

## 🔑 PERMISSIONS NATIVES REQUISES

| Permission | Android | iOS | Usage |
|-----------|---------|-----|-------|
| CAMERA | ✅ | ✅ | KYC + photos colis |
| READ_MEDIA_IMAGES | ✅ | ✅ | Sélection galerie |
| POST_NOTIFICATIONS | ✅ | ✅ | Alertes transferts |
| INTERNET | ✅ | Auto | API calls |
| ACCESS_NETWORK_STATE | ✅ | Auto | Détection offline |
| VIBRATE | ✅ | Auto | Haptic feedback |
| USE_BIOMETRIC | ✅ | Face ID | Auth sécurisée |

---

## 📦 PLUGINS CAPACITOR UTILISÉS

```bash
# Déjà dans package.json, installer avec :
npm install

# Plugins inclus :
# @capacitor/app           — Cycle de vie app, bouton retour Android
# @capacitor/camera        — Photo KYC et colis
# @capacitor/haptics       — Vibrations
# @capacitor/keyboard      — Gestion clavier natif
# @capacitor/network       — Détection connexion
# @capacitor/push-notifications — Notifications push
# @capacitor/share         — Partage natif
# @capacitor/splash-screen — Écran de démarrage natif
# @capacitor/status-bar    — Personnalisation barre d'état
# @capacitor/storage       — Stockage sécurisé (Keychain iOS / Keystore Android)
```

---

## 🔧 COMMANDES UTILES

```bash
# Développement avec live reload sur appareil
npm run cap:live

# Sync après modification du code web
npx cap sync

# Logs Android en temps réel
npx cap run android --verboseLogs

# Vérifier configuration Capacitor
npx cap doctor
```

---

## 🔒 SÉCURITÉ PRODUCTION

- [ ] Activer Certificate Pinning (empêche l'interception HTTPS)
- [ ] Désactiver les logs en production (`loggingBehavior: "none"`)
- [ ] Activer ProGuard/R8 (obfuscation code Android)
- [ ] Activer Bitcode pour iOS
- [ ] Configurer App Transport Security (iOS)
- [ ] Intégrer Firebase App Check (protection API)
- [ ] Activer Google Play Integrity API

---

## 📞 SUPPORT

**Email :** dev@afriabridge.com  
**Documentation Capacitor :** https://capacitorjs.com/docs  
**Google Play Console :** https://play.google.com/console  
**App Store Connect :** https://appstoreconnect.apple.com  

---

*AfriaBridge v1.0.0 — © 2026 AfriaBridge Inc. Tous droits réservés.*
