# MI25-6

**MI25-6** è uno strumento web statico, in lingua italiana, per consultare gli esiti della mappatura delle infrastrutture di rete fissa pubblicati da Infratel e confrontare i civici con altri dataset territoriali.

**Sito:** <https://elperlfy.github.io/MI25-6/>

Il progetto è indipendente e non è un servizio ufficiale di Infratel, AGCOM o degli operatori di telecomunicazioni.

## Funzioni principali

- Ricerca per Regione, Provincia, Comune, Via e Civico, con suggerimenti contestuali.
- Consultazione della mappatura generale delle reti fisse 2025 e degli esiti PI1G 2025.
- Consultazione degli archivi di prossimità 2025 e degli archivi FiberCop.
- Caricamento facoltativo e differito della mappatura reti fisse 2021.
- Importazione manuale di file CSV e ZIP riconosciuti dal parser.
- CSV Reader per ispezionare le righe e le colonne originali dei dataset.
- Legacy Mode per consultare separatamente l'archivio storico 2017–2021 tramite l'API esterna di Handymenny.

L'assenza di un civico nei risultati non dimostra che l'indirizzo sia privo di copertura: indica soltanto che non è stata trovata una corrispondenza nei dataset consultati.

## Classificazione della mappatura 2025

La legenda della mappatura generale riconosce i quattro valori effettivi del campo `caratteristica` presente nei CSV:

| Codice | Significato |
| --- | --- |
| **PA** | Sede della Pubblica Amministrazione interessata da piani pubblici (ad esempio scuole e sanità). |
| **A** | Civico con coordinate di scarsa qualità. |
| **B** | Civico entro 50 metri da reti con velocità di picco superiore a 300 Mbit/s. |
| **C** | Civico oltre 50 metri da quelle reti. |

I colori della legenda sono una scelta grafica di MI25-6. Le sottocomponenti statistiche di B (B1, B2, B3 e BW) non sono valori autonomi del campo `caratteristica` e non vengono riconosciute come categorie individuali del civico.

## Dataset consultati

I dataset automatici sono organizzati nella cartella `data/`:

| Dataset | Percorso | Modalità di caricamento |
| --- | --- | --- |
| Mappatura reti fisse 2025 | `data/fixed-2025/` | Caricata selezionando la Regione. |
| Esiti PI1G 2025 · Allegato A | `data/pi1g-2025/` | Caricati quando è disponibile l'archivio della Regione. |
| Civici di prossimità 2025 | `data/proximity-2025/Italia.zip` | Archivio nazionale con archivi regionali interni; viene consultata la Regione selezionata. |
| Civici di prossimità FiberCop 2025 | `data/fibercop-proximity-2025/Italia.zip` | Archivio nazionale con archivi regionali interni; viene consultata la Regione selezionata. |
| Mappatura reti fisse 2021 | `data/fixed-2021/` | Caricamento su richiesta, limitato alla Regione selezionata. |

La selezione di una Regione carica la mappatura generale 2025, l'Allegato A PI1G (se disponibile) e i due dataset di prossimità. **La mappatura 2021 è esclusa dal caricamento iniziale** perché può richiedere risorse considerevoli: si aggiunge alla ricerca solo quando viene premuto il pulsante «Carica mappatura 2021» nelle Opzioni Avanzate Dati.

Gli archivi 2021 attualmente presenti nel repository sono distribuiti in ZIP regionali distinti. Non tutte le Regioni dispongono di un archivio 2021 nel progetto; il pulsante segnala quando la fonte regionale non è disponibile. I nomi dei file non sempre coincidono con gli slug usati nell'indirizzo web: il loader associa esplicitamente le Regioni ai file pubblicati.

### Struttura dei CSV

Il parser riconosce le intestazioni tramite nomi normalizzati: maiuscole/minuscole, spazi, accenti, underscore e altri separatori non cambiano il nome logico della colonna. Le colonne possono essere riordinate e alcuni campi possono mancare. Le colonne non riconosciute vengono conservate come campi aggiuntivi nei risultati.

Tra i campi aggiuntivi interpretati dall'interfaccia:

- **Prossimità 2025:** copertura privata dichiarata nella mappatura 2024, stato di copertura a giugno 2025, ammissibilità e causa di esclusione.
- **FiberCop:** ammissibilità e cause di esclusione.
- **Mappatura 2021:** colore del civico e classi di velocità, oltre ai campi disponibili su operatore, tecnologia e anno di copertura.

Per la mappatura 2021, i codici del colore vengono interpretati come segue: `g` = Grigio, `n` = Nero, `b` o valore vuoto = Bianco (quando la colonna colore è presente). I campi di velocità contengono codici o soglie da decodificare, non necessariamente valori in Mbit/s da leggere alla lettera. La decodifica tiene conto anche della presenza o meno della colonna colore.

## Modalità e strumenti

### Ricerca indirizzo

La ricerca standard richiede almeno Comune e Via; il Civico è facoltativo. Regione, Provincia, Comune, Via e Civico dispongono di suggerimenti contestuali. La ricerca consulta i dataset già caricati per la Regione e non avvia un nuovo download a ogni invio.

I record dei dataset disponibili vengono mantenuti nel Web Worker. Il risultato può quindi mostrare informazioni provenienti da più fonti per lo stesso civico, quando gli identificativi o i dati dell'indirizzo consentono di associarle.

### Caricamento manuale

È possibile importare uno o più file CSV, TXT o ZIP. I file riconosciuti vengono analizzati nel Web Worker. Quando viene importato un dataset manuale, questo prevale sui dati automatici della stessa tipologia; le altre categorie non vengono sostituite. Il comando «Torna ai dati automatici» rimuove i dataset manuali e ripristina quelli automatici.

I dati caricati manualmente restano nella memoria della sessione del browser e non vengono salvati come archivi permanenti nel repository.

### Mappatura reti fisse 2021

La mappatura 2021 è un dataset storico separato dalla classificazione 2025. Il comando dedicato scarica e analizza soltanto l'archivio della Regione selezionata, quindi aggiunge i record alla ricerca. Non scarica in blocco gli archivi di tutte le Regioni, non modifica la classificazione PA/A/B/C e non utilizza l'API Legacy.

### CSV Reader

CSV Reader permette di scegliere un dataset e leggere il relativo CSV originale per la Regione selezionata. Conserva intestazioni, valori grezzi, colonne e ordine delle righe. È possibile filtrare il contenuto cercando tra i campi originali e visualizzare 50, 100 o 250 righe per pagina.

Il caricamento completo, il filtraggio e la paginazione sono eseguiti nel Web Worker: la pagina riceve soltanto le righe della pagina corrente. CSV Reader è una modalità facoltativa e può richiedere tempo e memoria, soprattutto con archivi molto grandi.

### Legacy Mode

Legacy Mode consulta separatamente l'archivio storico della mappatura Infratel 2017–2021 tramite il servizio API di Handymenny. Non utilizza i CSV automatici di MI25-6 e non descrive la copertura attuale.

Quando è attiva, i dati dell'indirizzo e gli identificativi necessari vengono inviati al servizio esterno. Anche il comando di confronto storico trasmette l'ID EGON del risultato selezionato. Il servizio è gestito da terzi e può applicare limiti alle richieste.

- [API storica Handymenny](https://mappatura2024.amennillo.eu)
- [Progetto originale Handymenny](https://github.com/handymenny/mappaturaInfratel)

### Aggiorna archivi

Il comando «Aggiorna archivi» svuota le cache gestite da MI25-6: gli ZIP salvati in IndexedDB, i dataset parsati conservati in IndexedDB e i byte ZIP nella memoria del Web Worker. Se una Regione è selezionata, i dataset automatici vengono caricati nuovamente. I file manuali non vengono cancellati.

L'operazione non svuota la cache generale del browser, non elimina cookie o dati di altri siti e non modifica l'archivio dell'API Legacy.

## Architettura tecnica

MI25-6 è un'applicazione statica: non richiede un backend applicativo dedicato. Il browser scarica gli archivi dalla cartella `data/` del sito.

L'elaborazione dei dati è distribuita in moduli specializzati:

- `index.html`: struttura della pagina, controlli e contenuti informativi.
- `PageUI/style.css`: stile e temi dell'interfaccia.
- `JS/app.js`: inizializzazione dell'interfaccia e collegamento degli eventi.
- `JS/controllers/`: controller distinti per autocomplete, ricerca, caricamento regionale, CSV Reader e modalità Legacy.
- `JS/ui/results.js`: composizione dei risultati, confronto storico e report.
- `JS/services/data-client.js`: comunicazione asincrona tra interfaccia e Web Worker.
- `JS/workers/data.worker.js`: motore dati, memoria dei record, indicizzazione, ricerca e gestione dei comandi.
- `JS/data/`: parser CSV, normalizzazione, caricamento degli archivi, cache, diagnostica e ricerca.
- `JS/data.js`: re-export di compatibilità del modulo dati.
- `JS/datasets.js`: definizioni dei dataset, alias delle intestazioni, Regione e legenda.
- `JS/legacy.js`: client e funzioni di formattazione per l'API storica.
- `data/`: archivi ZIP regionali e nazionali consultati dall'applicazione.
- `tests/`: test automatici dei moduli, dei parser, dei controller e del Worker.

Decompressione ZIP, parsing CSV, indicizzazione, suggerimenti, ricerca indirizzi e filtraggio/paginazione del CSV Reader vengono eseguiti nel Web Worker, per ridurre il lavoro sul main thread e mantenere l'interfaccia reattiva.

### Cache e persistenza

Gli ZIP scaricati vengono conservati in IndexedDB per un massimo di 30 giorni. Una cache in memoria nel Worker evita di ripetere richieste duplicate nella stessa sessione. Anche alcuni dataset già parsati possono essere salvati in IndexedDB, entro limiti di dimensione e numero di record, per evitare di ripetere parsing e decompressione nelle visite successive.

Se IndexedDB non è disponibile o la scrittura persistente non riesce, il caricamento può proseguire usando la rete e la cache in memoria. «Aggiorna archivi» invalida entrambe le cache persistenti e quella ZIP in memoria.

## Esecuzione locale

È necessario un browser moderno con supporto per moduli JavaScript, Web Worker e API Fetch. IndexedDB migliora la persistenza, ma non è indispensabile per il caricamento di base.

Per avviare un server HTTP statico dalla cartella principale del progetto:

```bash
python -m http.server 8000
```

Aprire quindi <http://localhost:8000/>.

Non aprire direttamente `index.html` dal filesystem: il caricamento degli archivi utilizza richieste HTTP tramite `fetch`.

## Test automatici

Per eseguire la suite è necessario Node.js 22 o successivo:

```bash
npm test
```

La suite copre, tra gli altri aspetti:

- riconoscimento dei quattro codici caratteristica della legenda;
- parsing CSV con intestazioni variabili, colonne mancanti e campi aggiuntivi;
- archivi ZIP nazionali e regionali, anche con nomi in maiuscolo;
- mappatura 2021 e decodifica dei campi di colore e velocità;
- caricamento differito dei dataset;
- ricerca, suggerimenti e indicizzazione dei Comuni;
- CSV Reader e conservazione dei campi originali;
- comportamento della cache e ricaricamento degli archivi;
- elaborazione di CSV con 150.000 righe;
- avvio e comunicazione del Web Worker.

La pipeline GitHub Actions esegue anche il controllo sintattico dei file JavaScript e la suite `npm test`.

## Fonti e limiti

Le fonti dei dati sono i dataset pubblicati da Infratel e i relativi archivi territoriali indicati nel progetto. Le interpretazioni delle codifiche specifiche della mappatura 2021 seguono la legenda del progetto storico di riferimento: [Handymenny · InfoDisplay.tsx](https://github.com/handymenny/mappaturaInfratel/blob/main/components/layout/InfoDisplay.tsx).

MI25-6 non interroga i sistemi commerciali degli operatori, non certifica la vendibilità di un indirizzo e non fornisce una verifica della copertura in tempo reale. Gli esiti mostrati dipendono dai dataset caricati e dalla loro data di pubblicazione.
