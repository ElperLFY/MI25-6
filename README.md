# MI25-6

**MI25-6** è uno strumento web statico e indipendente per consultare gli esiti della mappatura delle reti fisse pubblicati da Infratel e confrontarli con altri archivi territoriali.

- **Applicazione:** <https://elperlfy.github.io/MI25-6/>
- **Repository:** <https://github.com/ElperLFY/MI25-6>
- **Segnalazioni:** <https://github.com/ElperLFY/MI25-6/issues>

Il progetto è personale, non è un servizio ufficiale di Infratel, AGCOM o di un operatore e non verifica la vendibilità commerciale in tempo reale. È sviluppato da un singolo maintainer con il supporto di strumenti di IA.

## Optimization Overhaul 1.3

Revisione architetturale del Data Engine dedicata alla gestione della memoria: cache ZIP limitata alle richieste in corso, caricamenti regionali serializzati, CSV Reader con righe compatte, paginazione senza array di risultati intermedi e invalidazione dei caricamenti obsoleti. La compatibilità dell’interfaccia e dei risultati di ricerca resta l’obiettivo della revisione.

## Funzionalità

- Ricerca per Regione, Provincia, Comune, Via e Civico, con suggerimenti contestuali.
- Consultazione della mappatura generale delle reti fisse 2025 e dell'Allegato A PI1G.
- Consultazione dei civici di prossimità e degli esiti della consultazione 2025.
- Caricamento differito e regionale della mappatura storica 2021.
- Importazione manuale di CSV, TXT e ZIP compatibili.
- CSV Reader per ispezionare intestazioni, valori, colonne e ordine originale delle righe.
- Modalità Legacy separata, basata su un'API storica esterna.
- Cache locale degli archivi e dei dataset parsati, con invalidazione per versione del dato.

L'assenza di un civico nei risultati non dimostra che l'indirizzo sia privo di copertura: significa soltanto che non è stata trovata una corrispondenza nei dataset consultati.

## Dataset e periodo di riferimento

| Dataset | Pubblicazione / aggiornamento della fonte | Archivi presenti in MI25-6 |
| --- | --- | --- |
| Mappatura generale reti fisse 2025 | Ultimo aggiornamento pubblicato il **13/02/2026** | Tutte le 20 Regioni; il Trentino-Alto Adige è suddiviso in due archivi provinciali. |
| Esiti PI1G 2025 · Allegato A | **16/02/2026** | 9 Regioni con record, elencate sotto. |
| Civici di prossimità 2024 · verifica 2025 | Esito pubblicato il **12/11/2025**; stato di copertura verificato a giugno 2025 | Archivio nazionale con dati regionali interni. |
| Civici di prossimità · consultazione 2025 | Avviso pubblicato il **12/09/2025** | Archivio nazionale con dati regionali interni. |
| Mappatura reti fisse 2021 | **06/08/2021** | 16 archivi regionali, elencati sotto; caricamento su richiesta. |

Le date indicano la pubblicazione o l'aggiornamento della fonte, non la data di attivazione commerciale di una rete.

### Disponibilità PI1G

L'Allegato A pubblicato da Infratel contiene **437.951 record**. Gli archivi regionali inclusi nel repository coprono esattamente questo totale e sono presenti per:

**Campania, Emilia-Romagna, Friuli-Venezia Giulia, Lazio, Lombardia, Puglia, Sicilia, Toscana e Veneto.**

Per **Abruzzo, Basilicata, Calabria, Liguria, Marche, Molise, Piemonte, Sardegna, Trentino-Alto Adige, Umbria e Valle d'Aosta** non risultano civici nell'Allegato A pubblicato. In MI25-6 queste Regioni non vengono quindi segnalate come archivi regionali mancanti: l'esito consultato è semplicemente privo di record per tali Regioni.

L'Allegato A non è l'elenco completo del Piano Italia a 1 Giga. Raccoglie gli esiti di una specifica mappatura su 707.092 civici dichiarati inizialmente non collegabili entro il 30/06/2026 dal beneficiario del Piano. I 437.951 record dell'Allegato A riguardano civici non coperti entro il 2030 oppure coperti da tecnologie con velocità di picco non superiore a 300 Mbit/s.

Fonte: [Infratel · Esiti PI1G 2025](https://www.infratelitalia.it/archivio-documenti/documenti/esiti-mappatura-2025-delle-reti-fisse-civici-non-collegabili-italia-1).

### Disponibilità della mappatura 2021

Nel repository sono inclusi ZIP per:

**Abruzzo, Basilicata, Calabria, Campania, Emilia-Romagna, Friuli-Venezia Giulia, Lazio, Liguria, Marche, Molise, Puglia, Sardegna, Sicilia, Toscana, Trentino-Alto Adige e Valle d'Aosta.**

Gli archivi di **Lombardia, Piemonte, Umbria e Veneto** non sono inclusi nell'attuale pacchetto MI25-6. Questo riscontro riguarda il contenuto del repository e non permette di concludere che Infratel non abbia mai pubblicato tali archivi.

Fonte: [Infratel · Esiti mappatura reti fisse 2021](https://www.infratelitalia.it/archivio-news/notizie/esiti-mappatura-reti-fisse-2021_news).

## Classificazione della mappatura generale 2025

Il campo CSV `caratteristica` assegna ai singoli civici i valori seguenti:

| Codice | Significato |
| --- | --- |
| **PA** | Civico relativo a una sede della Pubblica Amministrazione interessata da piani pubblici, ad esempio scuole e sanità. |
| **A** | Civico con coordinate di scarsa qualità. |
| **B** | Civico entro 50 metri da reti con velocità di picco superiore a 300 Mbit/s. |
| **C** | Civico oltre 50 metri da quelle reti. |

I colori visualizzati per PA/A/B/C sono una scelta grafica dell'interfaccia. Le sottocomponenti statistiche di B non sono valori autonomi del campo `caratteristica` e non vengono riconosciute come categorie individuali del civico.

## Colori territoriali della mappatura 2021

La mappatura 2021 utilizza una classificazione territoriale distinta da PA/A/B/C:

| Colore | Significato |
| --- | --- |
| **BIANCO** | Nessuna rete ultraveloce presente o credibilmente pianificata nell'orizzonte temporale considerato. |
| **GRIGIO** | Una sola rete ultraveloce presente o credibilmente pianificata. |
| **NERO** | Almeno due reti ultraveloci presenti o credibilmente pianificate. |

Sono classi usate dagli orientamenti europei sugli aiuti di Stato per descrivere il livello di concorrenza infrastrutturale nell'area. Non sono una misura della velocità del singolo civico e non garantiscono che un'offerta sia vendibile.

Fonte: [Orientamenti UE sugli aiuti di Stato per le reti a banda larga](https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:52023XC0131(01)).

## Velocità massima e velocità di picco

Nei dataset, la **velocità massima** descrive la classe della velocità che la rete può raggiungere in determinate condizioni, anche in una parte della giornata. La **velocità di picco** descrive invece la prestazione dichiarata durante il periodo di massimo utilizzo della rete, quando il traffico è più intenso.

I simboli sono operatori matematici: `<` minore di; `>` maggiore di; `≤` minore o uguale a; `≥` maggiore o uguale a; `=` esattamente uguale a. Ad esempio, `≥ 300 Mbit/s` include 300 e tutti i valori superiori; `> 300 Mbit/s` esclude 300 esatto. Gli intervalli rappresentano fasce classificatorie.

Questi valori non sono misurazioni sul modem, speed test o garanzie della velocità di un'offerta retail.

## Civici di prossimità

MI25-6 consulta due insiemi distinti:

1. **Civici di prossimità 2024 · verifica 2025.** La mappatura 2024 ha raccolto civici individuati vicino a civici base del Piano Italia a 1 Giga. Nel 2025 è stato verificato lo stato di copertura dichiarato a giugno 2025 per gli indirizzi pianificati nell'ambito di interventi privati. L'esito è stato pubblicato il 12/11/2025.
2. **Civici di prossimità · consultazione 2025.** È un procedimento separato pubblicato il 12/09/2025, relativo a un ulteriore insieme di civici di prossimità individuati durante le verifiche tecniche. L'archivio MI25-6 espone i campi di ammissibilità e le cause di esclusione.

Per queste procedure, la prossimità e l'ammissibilità sono valutazioni specifiche ai fini del Piano e del finanziamento. Non equivalgono a una verifica di vendibilità commerciale al civico.

Fonti: [Verifica civici di prossimità 2024](https://www.infratelitalia.it/archivio-documenti/documenti/piano-italia-1-giga-esito-della-verifica-degli-impegni-di-copertura) · [Consultazione civici di prossimità 2025](https://www.infratelitalia.it/archivio-documenti/documenti/piano-italia-1-giga-esito-mappatura-e-consultazione-2025-delle-reti).

## PI1G e Fondo Nazionale Connettività

Il **Piano Italia a 1 Giga (PI1G)** è un intervento del PNRR per favorire la realizzazione di reti fisse capaci di almeno 1 Gbit/s in download e 200 Mbit/s in upload nelle unità immobiliari individuate dalle mappature. Infratel cura le attività di mappatura e l'attuazione del programma. Per il cittadino, la misura può tradursi in nuove infrastrutture e possibilità di accesso tramite gli operatori, ma un civico presente in un piano non è per questo già attivabile.

Il **Fondo Nazionale Connettività (FNC)** è una misura distinta, nell'ambito della Missione 1 – Componente 2 – Investimento 7 del PNRR. È promossa dal Dipartimento per la Trasformazione Digitale e gestita da Invitalia come Implementing Partner. Mette a disposizione oltre 700 milioni di euro per sostenere investimenti privati nelle infrastrutture di rete fissa. L'assegnazione annunciata nel luglio 2026 arriva fino a 712,5 milioni per oltre 477.000 civici, distribuiti in sette lotti, con realizzazione prevista entro il 2030.

Per il cittadino FNC non è un bonus o uno sconto da richiedere: finanzia la costruzione di reti. Un eventuale beneficio dipende dal fatto che l'intervento raggiunga l'indirizzo e dalla successiva disponibilità di offerte. MI25-6 non contiene un dataset FNC e non certifica la copertura finanziata dal Fondo.

Fonti: [Piano Italia a 1 Giga](https://www.infratelitalia.it/infratel-italia-per-il-pnrr/piano-italia-a-1-giga) · [Fondo Nazionale Connettività](https://innovazione.gov.it/notizie/avvisi-pubblici/fondo-nazionale-connettivita-bando-per-investimenti-privati-nelle-infrastrutture-per-la-rete-bul/) · [Esito assegnazione FNC](https://innovazione.gov.it/notizie/comunicati-stampa/reti-ultraveloci-assegnato-il-fondo-nazionale-per-la-connettivita-per-coprire-olt/).

## Licenze e condizioni dei dati

Il file [LICENSE](LICENSE) applica la **MIT License al codice originale di MI25-6**. Non estende automaticamente questa licenza ai CSV, agli archivi ZIP, alle relazioni o agli altri materiali provenienti da Infratel o da terzi.

Nelle fonti consultate non è stata individuata una licenza open-data specifica associata agli archivi CSV Infratel utilizzati qui. Le [Note legali di Infratel](https://www.infratelitalia.it/note-legali) dichiarano che i diritti sui testi e sugli altri materiali pubblicati appartengono a Infratel e/o ai rispettivi autori e vietano la riproduzione senza preventiva autorizzazione scritta, salvo le citazioni parziali nei casi indicati. La disponibilità di un file per il download non equivale da sola a un'autorizzazione generale alla ridistribuzione.

Prima di riutilizzare o ripubblicare gli archivi al di fuori delle condizioni indicate dalla fonte, occorre verificarne i termini e, se necessario, chiedere autorizzazione a Infratel. Le dipendenze software e i riferimenti storici sono descritti separatamente in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

## Uso dell'applicazione

### Ricerca indirizzo

Seleziona la Regione, poi inserisci almeno Comune e Via. Il civico è facoltativo. I suggerimenti contestuali aiutano a completare i campi. La ricerca utilizza i record regionali già caricati.

### Caricamento manuale

È possibile importare uno o più file CSV, TXT o ZIP. I file riconosciuti vengono analizzati nel Web Worker. Un dataset manuale prevale sui dati automatici della stessa tipologia per la sessione corrente; gli altri dataset non vengono sostituiti. Il comando «Torna ai dati automatici» rimuove i dataset manuali.

### Mappatura 2021

Il caricamento 2021 è separato dalla classificazione PA/A/B/C. Il pulsante dedicato scarica e analizza soltanto lo ZIP della Regione selezionata. Non scarica in blocco gli archivi di tutte le Regioni e non interroga l'API Legacy.

### CSV Reader

CSV Reader visualizza il CSV originale per la Regione e il dataset selezionati. Conserva intestazioni, valori grezzi, colonne e ordine delle righe. Il parser automatico conserva i valori in array per colonna (struttura columnar) e condivide intestazioni e metadati a livello di file, anziché mantenere milioni di array-riga e oggetti wrapper. Filtro e paginazione scorrono i record nel Web Worker senza costruire un array intermedio di tutte le corrispondenze. Il dataset completo resta comunque nella memoria del Worker durante la consultazione: il Reader non è ancora un visualizzatore che legge dal disco una pagina alla volta.

### Legacy Mode

Legacy Mode consulta separatamente un archivio storico 2017–2021 tramite l'API esterna di Handymenny. Non utilizza i CSV statici di MI25-6 e non descrive la copertura attuale. Quando viene utilizzata, le selezioni dell'indirizzo e l'ID EGON necessario al confronto vengono inviati al servizio esterno.

- [API storica](https://mappatura2024.amennillo.eu)
- [Progetto originale](https://github.com/handymenny/mappaturaInfratel)

## Architettura e cache

MI25-6 è un'applicazione statica, senza backend applicativo dedicato. La pagina gestisce l'interfaccia; un Web Worker separato esegue decompressione ZIP, parsing CSV, indicizzazione, suggerimenti, ricerca e operazioni del CSV Reader per ridurre il lavoro sul main thread.

Gli ZIP e alcuni dataset parsati possono essere memorizzati in IndexedDB. Le cache persistenti hanno una scadenza massima di 30 giorni. La chiave di ogni archivio ZIP, dataset parsato e voce nella cache in memoria include il campo `dataVersion` definito in [data/manifest.json](data/manifest.json).

Quando cambia un archivio, occorre incrementare la `dataVersion` del dataset corrispondente nel manifest. Al successivo caricamento, MI25-6 ignora le vecchie voci di cache per quella versione e scarica/analizza il nuovo archivio senza aspettare la scadenza dei 30 giorni. Il manifest viene richiesto senza cache HTTP. I dati manuali non vengono salvati in IndexedDB.

La cache ZIP in memoria conserva soltanto le richieste ancora in corso; al completamento rilascia la Promise e il relativo ArrayBuffer, mentre la copia persistente resta in IndexedDB. La scrittura IndexedDB non crea più una copia esplicita aggiuntiva con `ArrayBuffer.slice(0)`. I caricamenti automatici regionali vengono eseguiti in sequenza per contenere il picco di decompressione e parsing, a costo di poter aumentare il tempo complessivo di caricamento.

Il CSV Reader usa una generazione di caricamento: quando viene disattivato o sostituito, il caricamento precedente diventa obsoleto e il parser interrompe cooperativamente il lavoro ai successivi confini di chunk/archivio. I record già completati non vengono riassegnati allo stato del Reader.

Questi cambiamenti riducono strutture temporanee e wrapper non necessari, ma non costituiscono ancora una garanzia quantitativa sul consumo RAM. Le prestazioni vanno misurate nel browser con gli archivi reali; il CSV Reader mantiene comunque in memoria le celle del dataset attivo.

Il comando «Aggiorna archivi» elimina le cache ZIP e dei dataset parsati gestite da MI25-6 e ricarica i dataset automatici della Regione selezionata. Non cancella la cache generale del browser, i cookie o i dati di altri siti.

### Struttura del progetto

- `index.html`: struttura della pagina, controlli e FAQ.
- `PageUI/style.css`: stile e temi.
- `JS/app.js`: inizializzazione e collegamento dell'interfaccia.
- `JS/controllers/`: controller per autocomplete, ricerca, caricamento regionale, CSV Reader e Legacy.
- `JS/ui/results.js`: composizione dei risultati, confronti e report.
- `JS/services/data-client.js`: comunicazione con il Web Worker.
- `JS/workers/data.worker.js`: motore dati, indici, ricerca e stato delle sorgenti.
- `JS/data/`: parser, loader, normalizzazione, diagnostica, cache e paginazione compatta del CSV Reader (`reader-table.js`).
- `JS/datasets.js`: definizioni dei dataset, alias, Regioni e legenda.
- `data/`: archivi ZIP e manifest delle versioni.

## Test e automazione

Esegui `npm test` per avviare i test unitari Node del modulo di paginazione del CSV Reader. Questi test coprono la logica di selezione delle pagine e dei filtri, ma non sostituiscono le verifiche end-to-end nel browser né un benchmark RAM sui dataset Infratel reali. Il repository non dispone ancora di un workflow GitHub Actions per eseguirli automaticamente.

## Segnalazioni

Per segnalare un problema apri una [GitHub Issue](https://github.com/ElperLFY/MI25-6/issues), indicando Regione, Comune, Via, Civico, dataset consultato e passaggi per riprodurre il problema. Non includere dati personali non necessari.
