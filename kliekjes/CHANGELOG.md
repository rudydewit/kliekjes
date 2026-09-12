# Wijzigingen

## 1.0.9

- Exporteren en importeren onder Geschiedenis. Eén bestand met alle kliekjes, foto's
  en historie — bedoeld om over te stappen naar een andere installatie, en verder
  bruikbaar als losse back-up.
- Importeren slaat kliekjes over die er al staan, dus twee keer importeren kan geen
  kwaad.

## 1.0.8

- "Foto maken" opent nu de camera in de app zelf, met live beeld, een sluiterknop
  en een knop om tussen voor- en achtercamera te wisselen. Android kon het oude
  capture-verzoek negeren en toonde dan alsnog de fotokiezer.
- Zonder beveiligde verbinding is de live camera niet beschikbaar; dan valt de knop
  terug op de fotokiezer met een korte uitleg.

## 1.0.7

- Versienummer in de URL van de stylesheet en het script. Een browser kan nu nooit
  meer een oude `app.js` met een nieuwe `index.html` combineren — dat gaf een leeg
  scherm.
- Gaat er tijdens het opstarten toch iets mis, dan verschijnt een melding met de
  oorzaak in plaats van een lege achtergrond.

## 1.0.6

- Aparte knoppen voor "Foto maken" en "Uit galerij", zodat Android niet zelf
  bepaalt welke van de twee je krijgt.

## 1.0.5

- Bij een nieuw kliekje sprong de fotokiezer meteen open. Nu zie je eerst het
  formulier en bepaal je zelf wanneer je de foto maakt.
- `panel_admin: false`, zodat ook huisgenoten zonder beheerdersrechten Kliekjes
  in de zijbalk zien.

## 1.0.3

- Stylesheets en scripts werden een uur gecachet, waardoor een update pas veel later
  zichtbaar werd. Die worden nu niet meer bewaard.
- Versienummer onderaan het geschiedenisscherm, zodat te zien is wat er draait.

## 1.0.2

- Wijzigingsformulier lag achter het detailscherm, waardoor je eerst op Terug moest
  drukken voordat je het zag.

## 1.0.1

- Basisimage rechtstreeks in de Dockerfile gezet. De `build.yaml` wordt door de
  Supervisor niet meer gelezen, waardoor de container zonder Node werd gebouwd
  en niet startte ("node: not found").

## 1.0.0

- Eerste versie: kliekjes bijhouden met foto, porties, plek en houdbaarheid.
- Werkt via de Home Assistant-zijbalk (ingress) of op een eigen poort.
