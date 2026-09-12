# Kliekjes

Home Assistant-app om bij te houden wat er in de vriezer ligt: foto, aantal porties,
plek, invriesdatum en "beste voor". Eén centrale database, meerdere telefoons.

Deze repository is tegelijk een app-repository voor Home Assistant. Voeg hem toe en
je krijgt updates gewoon via de app-store, in plaats van een map te kopiëren.

## Toevoegen aan Home Assistant

1. Ga naar Instellingen → Apps → App Store.
2. Kies rechtsboven onder de drie puntjes **Repositories**.
3. Plak de URL van deze repository en klik op Toevoegen.
4. Sluit het venster. Onderaan de lijst verschijnt **Kliekjes van Rudy** met de app erin.
5. Installeren, starten, en "Weergeven in zijbalk" aanzetten.

De eerste installatie bouwt het image op je eigen apparaat, wat een paar minuten duurt.

Staat de app al lokaal in `/addons`? Verwijder die dan eerst, anders heb je hem twee keer.

## Een wijziging uitrollen

```bash
# pas iets aan, hoog daarna het versienummer op
vim kliekjes/config.yaml      # version: "1.0.9"
vim kliekjes/Dockerfile       # io.hass.version="1.0.9"
vim kliekjes/server/server.js # const VERSION = '1.0.9';

git add -A
git commit -m "Beschrijf hier wat je veranderd hebt"
git push
```

Daarna in Home Assistant: App Store → drie puntjes → Controleren op updates. De app
biedt zichzelf aan als update.

Zonder ophoging van het versienummer ziet Home Assistant geen verschil, ook al staat
de nieuwe code er wel. Die drie plekken horen gelijk te lopen; het nummer onderaan het
geschiedenisscherm in de app komt uit `server.js`, dus daaraan zie je wat er echt draait.

## Openbaar of privé?

De repository moet openbaar zijn om hem zo toe te kunnen voegen. Dat kan hier veilig:
er staan geen wachtwoorden of sleutels in de code. Het wachtwoord van de app stel je in
bij de app-instellingen in Home Assistant, en dat belandt in `/data/options.json` op je
eigen apparaat — niet in deze repository.

De `.gitignore` houdt `kliekjes/data/` buiten de deur, waar de database en de foto's
staan als je hem lokaal draait.

## Structuur

```
repository.yaml          registreert dit als app-repository
kliekjes/
  config.yaml            manifest: versie, ingress, opties
  Dockerfile             basisimage en opstartcommando
  DOCS.md                documentatie, zichtbaar in Home Assistant
  CHANGELOG.md           wat er per versie veranderd is
  server/server.js       backend zonder dependencies
  public/                frontend
  docker-compose.yml     los van Home Assistant draaien
```
# kliekjes
