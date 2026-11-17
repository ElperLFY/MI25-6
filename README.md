# MI25-6

MI25-6 è un'applicazione statica per consultare le mappature delle infrastrutture di rete fissa pubblicate da Infratel e confrontare i civici con gli esiti PI1G e con dataset territoriali aggiuntivi.

## Struttura

- `index.html` contiene la pagina e i controlli.
- `PageUI/style.css` contiene lo stile dell'interfaccia.
- `JS/app.js` gestisce interfaccia, ricerca, risultati e caricamenti.
- `JS/data.js` riconosce le intestazioni, legge CSV e ZIP e gestisce la ricerca locale.
- `JS/datasets.js` contiene definizioni dei dataset, alias delle colonne e legenda.
- `JS/legacy.js` gestisce l'API storica Handymenny.
- `data/fixed-2025/` contiene gli ZIP regionali della mappatura generale.
- `data/pi1g-2025/` contiene gli ZIP regionali dell'Allegato A PI1G.
- `data/fixed-2021/` contiene `italia.zip` per la mappatura reti fisse 2021.
- `data/proximity-2025/` contiene `italia.zip` per i civici di prossimità 2025.
- `data/fibercop-proximity-2025/` contiene `italia.zip` per i civici di prossimità FiberCop 2025.
- `vendor/jszip.min.js` contiene la libreria JSZip già utilizzata dal progetto.

## Dataset aggiuntivi

Gli archivi nazionali aggiuntivi devono chiamarsi `italia.zip` e contenere gli archivi ZIP regionali, nominati con il nome della regione in maiuscolo (ad esempio `ABRUZZO.zip`, `SICILIA.zip`). Ogni ZIP regionale contiene uno o più CSV/TXT. Il loader apre entrambi i livelli e, quando si consulta una regione, legge solo gli ZIP regionali corrispondenti. I tre archivi aggiuntivi sono indipendenti e vanno collocati nella rispettiva cartella sotto `data/`. I CSV possono avere colonne riordinate e campi opzionali mancanti, inclusa la colonna `barrato`.

Il riconoscimento utilizza intestazioni normalizzate: maiuscole/minuscole, spazi, accenti, underscore e altri separatori non cambiano il nome logico della colonna. Le colonne non conosciute vengono comunque conservate nel risultato come campi aggiuntivi.

Per i civici di prossimità 2025 sono supportati i campi relativi alla copertura privata dichiarata nella mappatura 2024 e al campo `Coperto a giugno 2025`. Per FiberCop sono supportati `Ammissibile (SI/NO)` e `Cause esclusione`. Per la mappatura fissa 2021 sono supportati `colore_26`, `peak_vel_down_26` e `vel_max_down_26`.

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

I test verificano i formati CSV forniti, le intestazioni facoltative e riordinate, gli archivi nazionali con ZIP regionali annidati in maiuscolo, i dataset esistenti e un caricamento da 150.000 record. Il parser non applica un limite al numero di righe; restano solo limiti di dimensione dei file e degli archivi per evitare caricamenti binari eccessivi.

MI25-6 non è un verificatore commerciale in tempo reale e non certifica che un servizio sia attivabile presso un indirizzo.
