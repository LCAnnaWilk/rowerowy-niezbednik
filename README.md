# Rowerowy niezbędnik

Prosta aplikacja webowa dla kolarza startującego w zawodach. Działa w przeglądarce (także na telefonie), bez serwera i bez instalacji.

**Zakładki:**

1. **Dziennik treningów** – dodawanie przejazdów ręcznie lub z pliku GPX (dystans, czas jazdy i przewyższenie liczone automatycznie), podsumowania tygodniowe i miesięczne, średnia prędkość, suma przewyższeń i wykres kilometrów.
2. **Kalkulator tempa** – wymagana średnia prędkość i międzyczasy co 10 km dla zadanego dystansu i czasu (opcjonalnie z godzinami na zegarze).
3. **Zawody** – odliczanie na żywo, prognoza pogody na dzień startu (Open-Meteo, bez klucza), wyniki z porównaniem do poprzednich edycji, plan taperingu przed najbliższym startem oraz kalendarz wybranych zawodów 2027 w Polsce i za granicą.
4. **Narzędzia** – kalkulator ciśnienia w oponach, strefy mocy i tętna (z W/kg) oraz licznik zużycia części (łańcuch, opony, klocki…) liczony z dziennika.
5. **Checklista przed startem** – odhaczanie, dodawanie i usuwanie pozycji, przycisk „Odznacz wszystko”.

Dane zapisują się w pamięci przeglądarki (`localStorage`). Przycisk w prawym górnym rogu pozwala pobrać kopię zapasową do pliku JSON i wczytać ją z powrotem.

Technologie: czysty HTML, CSS i JavaScript.

## Instalacja na telefonie

Aplikację można zainstalować za darmo jako PWA (własna ikona, pełny ekran, działanie bez internetu):

- **iPhone:** otwórz stronę w Safari → Udostępnij → „Do ekranu początk.”.
- **Android:** otwórz stronę w Chrome → menu ⋮ → „Zainstaluj aplikację”.

Bez internetu działa wszystko poza prognozą pogody.
