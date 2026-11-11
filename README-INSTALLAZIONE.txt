MI25-6 — set icone sito

CONTENUTO
- index.html: versione MI25-6 Legacy mode con i riferimenti alle icone aggiunti nell'HEAD.
- favicon.ico, favicon-16x16.png, favicon-32x32.png: icone scheda browser/preferiti.
- apple-touch-icon.png: icona per Aggiungi alla schermata Home su iPhone/iPad.
- android-chrome-*.png: icone per installazione web app su Android/browser compatibili.
- site.webmanifest: metadati della web app.

INSTALLAZIONE SU GITHUB PAGES
1. Apri la cartella pubblicata dal sito (nel tuo caso normalmente docs/).
2. Sostituisci index.html con quello incluso qui.
3. Copia TUTTI gli altri file di questo pacchetto nella stessa cartella di index.html.
4. Non creare sottocartelle per le icone: i percorsi HTML sono relativi alla root del sito (./).
5. Mantieni le cartelle esistenti data/, data/pi1g/ e vendor/ senza sovrascriverle.
6. Commit e push.

NOTE
- Nessun file icona deve essere caricato su un servizio esterno.
- La favicon può restare in cache: dopo il deploy prova una finestra privata o svuota la cache del sito.
- Il manifest prepara i metadati per l'installazione, ma non aggiunge modalità offline: per quella servirebbe un service worker dedicato.
- GitHub Pages deve servire il sito via HTTPS (lo fa normalmente).
