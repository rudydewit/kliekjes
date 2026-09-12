# Kliekjes

Bijhouden wat er in de vriezer ligt: foto, aantal porties, plek, invriesdatum en
"beste voor". Eén centrale database, twee telefoons.

Draait als **app** in Home Assistant (tot versie 2026.2 heette dat een add-on) en
verschijnt in je zijbalk. Wie in Home Assistant is ingelogd, is ook hier binnen —
geen apart wachtwoord, geen extra subdomein.

## Installeren

Staat deze app in een GitHub-repository, voeg die dan toe via Instellingen → Apps →
App Store → drie puntjes → Repositories. Daarna verschijnt Kliekjes gewoon in de lijst
en komen updates vanzelf binnen.

De handmatige route hieronder blijft werken, maar dan moet je bij elke wijziging zelf
kopiëren.

## Handmatig installeren op Home Assistant OS

**1. Zet de map op je Pi.**

De map moet als `kliekjes` in de `addons`-map komen — dat is de lokale app-repository.
Met de Samba Share-app kom je erbij via `\\homeassistant\addons` in Verkenner. Met de
Terminal & SSH-app kan het ook:

```bash
mkdir -p /addons/kliekjes
# bestanden hierheen kopieren
```

Je krijgt dus `/addons/kliekjes/config.yaml`, `/addons/kliekjes/Dockerfile`, enzovoort.

**2. Laat Home Assistant hem vinden.**

Ga naar Instellingen -> Apps -> App Store, en kies rechtsboven onder de drie puntjes
"Controleren op updates". Ververs de pagina. Bovenaan verschijnt nu een kopje
**Lokale apps** met Kliekjes erin.

**3. Installeren.**

Klik op Installeren. De eerste keer bouwt je Pi het image zelf, wat een paar minuten
duurt — hij haalt Node op en zet de boel in elkaar. Daarna Starten, en zet
"Weergeven in zijbalk" aan.

Klaar. Kliekjes staat nu in je zijbalk, ook in de Home Assistant-app op je telefoon.

## Meerdere gebruikers

Iedereen met een eigen Home Assistant-account ziet dezelfde lijst; er is niets extra's
in te stellen. Nieuwe accounts maak je aan onder Instellingen -> Personen. De naam van
het account wordt automatisch overgenomen bij het bijhouden van wie wat heeft
ingevroren of opgegeten.

## Overstappen of een back-up maken

Onder Geschiedenis staan twee knoppen. **Exporteren** geeft je één JSON-bestand met
alle kliekjes, de foto's en de historie erin. **Importeren** leest zo'n bestand weer in.

Dat is de manier om over te stappen van de ene installatie naar de andere: exporteer
in de oude, importeer in de nieuwe. Kliekjes die er al staan worden overgeslagen, dus
je kunt hetzelfde bestand zonder risico twee keer inlezen.

Let op dat een lokaal geïnstalleerde app en dezelfde app uit een repository ieder hun
eigen opslag hebben; Home Assistant ziet ze als twee verschillende apps.

## Waar de data staat

In de `/data`-map van de app, die Home Assistant zelf beheert: `kliekjes.db` met de
gegevens en `photos/` met de foto's. Die map gaat **automatisch mee in je Home
Assistant-back-ups**, dus je hoeft niets apart te regelen.

## Foto's maken

De knop "Foto maken" opent de camera binnen de app. Daarvoor is een beveiligde
verbinding nodig: `https://...` of `localhost`. Open je Home Assistant op een
`http://`-adres in je eigen netwerk, dan staat de camera-API van de browser uit en
valt de knop terug op de fotokiezer van Android — met een melding erbij.

Wil je de camera lokaal ook rechtstreeks, benader Home Assistant dan via je
https-adres in plaats van het IP-adres. "Uit galerij" werkt in alle gevallen.

## De keerzijde van ingress

Omdat de app binnen Home Assistant draait, gebruik je hem via de HA-app of de
webinterface. Je krijgt dus geen eigen icoon op je startscherm, en de offline-modus
werkt niet — het ingress-adres verandert per sessie, dus een service worker heeft daar
geen zin.

Wil je dat wel, dan kun je er een vaste poort naast zetten. Voeg aan `config.yaml` toe:

```yaml
ports:
  3000/tcp: 3011
```

Vul dan ook een wachtwoord in bij de app-instellingen — zonder ingress is dat je enige
slot. Daarna is hij te bereiken op `http://<ip-van-je-pi>:3011`, en via je reverse proxy
met HTTPS kun je hem als PWA op je startscherm zetten. Beide routes werken tegelijk en
delen dezelfde database.

## Los van Home Assistant draaien

De map is ook een gewoon Docker-project. Zet een wachtwoord in `docker-compose.yml` en:

```bash
docker compose up -d --build
```

Hij luistert dan op poort 3011 en de data komt in `./data`.

## Hoe het werkt in de praktijk

- **Kliekje toevoegen:** tik op de knop rechtsonder. De camera gaat meteen open. Foto
  maken, naam invullen, porties en plek erbij, bewaren. De foto wordt op je telefoon
  verkleind naar 1280px voordat hij verstuurd wordt.
- **De lijst** staat gesorteerd op wat het eerst op moet. Het streepje onder elke kaart
  loopt vol naarmate de "beste voor"-datum nadert: groen, oranje, rood.
- **Iets opgegeten?** Tik het aan en kies "Eén portie eruit". Bij nul porties verdwijnt
  het uit de lijst en staat het onder Geschiedenis, waar je het ook weer kunt terugzetten.

## Dingen die je makkelijk kunt aanpassen

| Wat | Waar |
|---|---|
| Kleuren | `public/styles.css`, het `:root`-blok bovenaan |
| "Beste voor"-snelknoppen (1/3/6/12 maanden) | `public/app.js`, functie `renderQuickDates` |
| Wanneer iets oranje wordt (nu 21 dagen) | `public/app.js`, functie `freshness` |
| App-icoon | `make_icons.py`, daarna `python3 make_icons.py` (schrijft naar `public/img/`) |

Na een wijziging: hoog het `version`-nummer in `config.yaml` op, dan biedt Home Assistant
een update aan. Zonder die ophoging ziet hij geen verschil. Biedt hij ondanks een hoger
nummer niets aan, verwijder de app dan en installeer hem opnieuw — dat forceert een
schone build.

## Kopieren vanaf een Mac

De Samba-app weigert standaard bestandsnamen die op `icon?` lijken — vijf tekens
beginnend met "icon". Een map `icons` valt daar precies onder, vandaar dat de
iconen hier in `public/img/` staan. Loop je toch tegen een geweigerd bestand aan,
dan kun je het patroon uit `veto_files` in de configuratie van de Samba-app halen.

Finder zet verder `.DS_Store`- en `._`-bestanden in de gedeelde map. Die worden door
Samba weggefilterd en Home Assistant negeert ze; je hoeft er niets mee.

## Twee dingen om te weten

**Alleen 64-bits.** De Dockerfile bouwt op `node:24-alpine`, dat voor aarch64 en amd64
bestaat. Een Pi 3, 4 of 5 met het standaard HAOS-image zit goed. Verschijnt Kliekjes
helemaal niet in de app-store, dan draai je waarschijnlijk een 32-bits installatie en is
een ander basisimage nodig.

Het basisimage staat bewust rechtstreeks in de Dockerfile. Een `build.yaml` wordt door
de Supervisor niet meer gelezen, en zonder `FROM` in de Dockerfile krijg je zijn eigen
basisimage — waar geen Node in zit.

**Beveiliging.** Via de zijbalk regelt Home Assistant de toegang; de app accepteert alleen
verkeer dat van de Supervisor komt (het interne adres 172.30.32.2), dus een nagebootste
header van buitenaf komt er niet doorheen. Zet je er een poort naast, dan is er één
gedeeld wachtwoord zonder rate limiting — prima achter je eigen HTTPS-proxy, maar zet dat
niet zomaar open op internet.
