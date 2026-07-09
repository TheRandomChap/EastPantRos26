# Roskilde 2026 Kasser - SQLite Version

En inventar-app der bruger SQLite (via sql.js) som database, så data kan synkroniseres på tværs af enheder via GitHub.

## Installation

1. Clone eller download dette repository
2. Åbn `index.html` i en browser

## Hvordan det virker

### Database-filerne

- **index.html** - Hovedfilen (åbner i browser)
- **inventory.db** - SQLite-databasefil (oprettes ved første kørsel, gemmes til Git)

### Lagring og synkronisering

1. **Når du bruger appen:**
   - Data gemmes i SQLite-databasen i browseren
   - Alle ændringer (tilføj, rediger, slet) opdateres straks

2. **For at gemme til fil (før du pusher til GitHub):**
   - Klik på knappen **"Højst Gem Database"** (grøn knap)
   - Denne henter filen `inventory.db` til din computer

3. **For at dele på tværs af enheder:**
   - Gem databasefilen (klik "Højst Gem Database")
   - Commit og push `inventory.db` til GitHub
   - Pull på anden enhed - appen henter automatisk den nyeste `inventory.db`

### Knapper

- **Tilføj ting** - Tilføj et nyt inventar-element
- **Eksportér Excel** - Download alle ting som Excel-fil (dagens dato i navnet)
- **Højst Gem Database** - Download den aktuelle SQLite-database (commit denne til GitHub)
- **Kommentar** - Tilføj noter til en ting
- **+/-** - Ændrer antal
- **Slet** - Fjerner en ting

## GitHub-workflow

1. Åbn appen på enhed A
2. Tilføj/rediger inventar
3. Klik "Højst Gem Database"
4. Commit og push `inventory.db` til GitHub
5. På enhed B: Pull fra GitHub
6. Åbn appen - den henter automatisk den opdaterede database

## Teknologi

- **Frontend:** HTML, CSS, JavaScript
- **Database:** SQLite via [sql.js](https://sql.js.org/)
- **Excel-export:** [SheetJS](https://sheetjs.com/)
- **Browser-kompatibilitet:** Alle moderne browsere (Chrome, Firefox, Safari, Edge)

## Bemærkninger

- Data er fuldt tilgængelig offline
- Databasen er standard SQLite-format
- Ingen internetforbindelse påkrævet efter første indlæsning
- Alle ændringer er øjeblikkelige
