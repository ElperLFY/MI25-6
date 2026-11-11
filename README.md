[README.md](https://github.com/user-attachments/files/34681872/README.md)
# MI25-6

**Esiti mappatura infrastrutture di rete fissa 2025-26**, basato su Mappatura Infratel, ArcGIS 2025-2026 (da qui il nome abbreviato, MI25-6).

## Architettura del sito

Sito statico, estremamente semplice: `index.html` e la cartella `data/`, senza server.

- **Database locale**: i dati ufficiali di Infratel (Allegato A, aggiornamento di febbraio 2026) sono in `data/`, uno ZIP per regione. In totale circa 277 MB di CSV diventano circa 27 MB di ZIP.
- **Caricamento per regione**: quando si compila il campo Regione, il browser scarica solo lo ZIP di quella regione ed estrae il CSV che serve, invece di leggere tutto insieme. È più leggero e veloce, anche su dispositivi datati.
- **Caricamento manuale**: l'utente può caricare i propri file (CSV o ZIP). Hanno la precedenza sul database locale, così anche se questo non è aggiornato, i dati dell'utente lo sono sempre. I file caricati restano nel browser.

## Fonte dati

Infratel Italia, Esiti Mappatura 2025 delle reti fisse (aggiornamento febbraio 2026).
