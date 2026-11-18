# MI25-6

MI25-6 è un'applicazione statica per consultare le mappature delle infrastrutture di rete fissa pubblicate da Infratel e confrontare i civici con gli esiti PI1G e con dataset territoriali aggiuntivi.

## Struttura

La logica è organizzata per responsabilità: `JS/app.js` è soltanto l'entry point che collega i controller e inizializza la pagina. Non contiene il motore di parsing o di ricerca.

- `index.html`: struttura della pagina e controlli.
- `PageUI/style.css`: stile dell'interfaccia.
- `JS/app.js`: bootstrap della UI e registrazione degli eventi.
- `JS/controllers/autocomplete.js`: suggerimenti, debounce e navigazione tra i campi.
- `JS/controllers/region-data.js`: caricamento completo dei dataset regionali e aggiornamento della cache.
- `JS/controllers/search.js`: ricerca indirizzi, import manuale e ripristino dei dati automatici.
- `JS/controllers/csv-reader.js`: selezione dataset, ricerca testuale e paginazione del CSV Reader.
- `JS/controllers/legacy-controller.js`: flusso della modalità storica Handymenny.
- `JS/ui/results.js`: composizione dei risultati, confronto storico e report copiabili.
- `JS/services/data-client.js`: comunicazione asincrona tra UI e Web Worker.
- `JS/workers/data.worker.js`: motore dati isolato dal main thread; mantiene i record in memoria e gestisce i comandi.
- `JS/data/`: moduli specializzati per parser CSV, normalizzazione, caricamento ZIP, cache IndexedDB e ricerca.
- `JS/data.js`: re-export di compatibilità del modulo dati.
- `JS/datasets.js`: definizioni dei dataset, alias delle colonne e legenda.
- `JS/legacy.js`: client e funzioni di formattazione dell'API storica.
- `data/fixed-2025/`, `data/pi1g-2025/`, `data/fixed-2021/`, `data/proximity-2025/`, `data/fibercop-proximity-2025/`: archivi ZIP pubblicati.

### Thread e persistenza

Il browser esegue parsing CSV, decompressione ZIP, aggregazione dei record, autocomplete, ricerca indirizzi e filtraggio/paginazione del CSV Reader nel Web Worker. Il main thread resta dedicato alla UI e riceve soltanto conteggi, suggerimenti, risultati e la pagina corrente del Reader.

Gli ZIP scaricati vengono memorizzati in IndexedDB per 30 giorni e riutilizzati tra visite e ricaricamenti della pagina. La cache in memoria evita richieste duplicate nella stessa sessione. Il pulsante **Aggiorna archivi** svuota la cache persistente e quella in memoria, così da recuperare le versioni pubblicate più recenti. Se IndexedDB non è disponibile o lo spazio è esaurito, il loader continua usando la cache in memoria e la rete come fallback.

## Dataset aggiuntivi

Gli archivi di prossimità 2025 sono pubblicati come `Italia.zip` e contengono gli ZIP regionali in maiuscolo; il loader accetta questa capitalizzazione e legge solo la Regione selezionata. La mappatura fissa 2021 è invece pubblicata come ZIP regionali indipendenti direttamente in `data/fixed-2021/` (ad esempio `SICILIA.zip`, `ABRUZZO.zip`). I nomi originali non sempre coincidono con lo slug web della Regione: il loader usa una tabella esplicita per i file effettivamente presenti. Non viene creato un archivio nazionale unico: gli ZIP regionali disponibili occupano complessivamente circa 151 MiB, oltre il limite massimo di 100 MiB per un singolo file GitHub. I CSV possono avere colonne riordinate e campi opzionali mancanti, inclusa la colonna `barrato`.

Il riconoscimento utilizza intestazioni normalizzate: maiuscole/minuscole, spazi, accenti, underscore e altri separatori non cambiano il nome logico della colonna. Le colonne non conosciute vengono comunque conservate nel risultato come campi aggiuntivi.

Per i civici di prossimità 2025 sono supportati i campi relativi alla copertura privata dichiarata nella mappatura 2024 e al campo `Coperto a giugno 2025`. Per FiberCop sono supportati `Ammissibile (SI/NO)` e `Cause esclusione`. Per la mappatura fissa 2021 sono supportati `colore_26`, `peak_vel_down_26` e `vel_max_down_26`. L'interfaccia interpreta i codici invece di mostrarli grezzi: `g` = Grigio, `n` = Nero, `b` o valore vuoto = Bianco. I valori di velocità sono classi/soglie, non Mbit/s da leggere letteralmente: con il campo colore presente, ad esempio `2` = almeno 300 Mbit/s e `1000` = almeno 1.000 Mbit/s. Se il campo colore è assente, si applica la diversa codifica prevista per le aree bianche.

L'interpretazione delle classi 2026 riprende la legenda dell'interfaccia storica di riferimento: [Handymenny · InfoDisplay.tsx](https://github.com/handymenny/mappaturaInfratel/blob/main/components/layout/InfoDisplay.tsx).

## Modalità di consultazione

La modalità standard carica tutti i dataset regionali disponibili quando viene selezionata la Regione: mappatura generale 2025, PI1G 2025, mappatura fissa 2021, prossimità 2025 e FiberCop. I record completi vengono mantenuti in memoria e alimentano tutti i suggerimenti e la ricerca indirizzo; l'invio della ricerca non scarica né rilegge gli stessi archivi.

Gli ZIP automatici scaricati vengono salvati in IndexedDB, con una scadenza di 30 giorni, e riutilizzati tra visite e ricaricamenti della pagina. La cache persistente conserva i byte compressi degli archivi, non una seconda copia dei record già espansi: alla riapertura il browser evita il download ma deve comunque decomprimere gli ZIP e analizzare i CSV per ricostruire i record in memoria. Il pulsante **Aggiorna archivi** svuota la cache IndexedDB e richiede nuovamente i file pubblicati; se IndexedDB non è disponibile o la quota locale è esaurita, il caricamento continua con la sola cache in memoria. In un sito statico il primo caricamento di una Regione deve comunque scaricare e scandire i relativi CSV.

CSV Reader è una modalità separata e volontaria. Permette di scegliere una sola fonte per volta e leggere tutte le righe del relativo CSV, mantenendo intestazioni, valori e ordine originale. Include una ricerca testuale client-side su tutte le colonne, con filtro e paginazione da 50, 100 o 250 righe. La ricerca non modifica i dati originali e mantiene l'ordine sorgente dei risultati. La lettura completa può richiedere tempo e memoria, soprattutto per la mappatura 2021. Per uscire, disattivare CSV Reader o tornare alla Ricerca indirizzo.

Nel campo Regione e nei campi Provincia, Città, Via e Civico, Invio seleziona il primo suggerimento corrispondente e porta al campo successivo; dopo il Civico avvia la ricerca. Comune e Via sono richiesti, il Civico è facoltativo. Gli hint cremisi mostrano le Regioni corrispondenti o il numero di suggerimenti e consentono di continuare con un valore digitato manualmente.

## Esecuzione

Servire la cartella radice con un server HTTP statico e aprire l'indirizzo locale. Ad esempio:

```bash
python -m http.server 8000
```

Aprire quindi `http://localhost:8000/`. Non aprire direttamente il file HTML dal filesystem: il caricamento ZIP utilizza `fetch`.

## Test

Con Node.js 22 o successivo:

```bash
npm test
```

I 13 test coprono i formati CSV forniti, le intestazioni facoltative e riordinate, gli archivi nazionali con ZIP regionali annidati in maiuscolo, i dataset esistenti, il filtraggio per Comune/Via/Civico, la conservazione delle colonne CSV originali e un caricamento da 150.000 record. Il parser non applica un limite al numero di righe; restano solo limiti di dimensione dei file e degli archivi per evitare caricamenti binari eccessivi.

MI25-6 non è un verificatore commerciale in tempo reale e non certifica che un servizio sia attivabile presso un indirizzo.
