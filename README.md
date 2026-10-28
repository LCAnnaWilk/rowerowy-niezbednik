# Rowerowy niezbędnik

Prosta aplikacja webowa dla kolarza startującego w zawodach. Działa w przeglądarce (także na telefonie), bez serwera i bez instalacji.

**Zakładki:**

1. **Dziennik treningów** – dodawanie przejazdów ręcznie lub z pliku GPX (dystans, czas jazdy i przewyższenie liczone automatycznie), podsumowania tygodniowe i miesięczne, średnia prędkość, suma przewyższeń i wykres kilometrów.
2. **Kalkulator tempa** – wymagana średnia prędkość i międzyczasy co 10 km dla zadanego dystansu i czasu (opcjonalnie z godzinami na zegarze).
3. **Odliczanie do zawodów** – lista zawodów z odliczaniem na żywo.
4. **Checklista przed startem** – odhaczanie, dodawanie i usuwanie pozycji, przycisk „Odznacz wszystko”.

Dane zapisują się w pamięci przeglądarki (`localStorage`). Przycisk w prawym górnym rogu pozwala pobrać kopię zapasową do pliku JSON i wczytać ją z powrotem.

Technologie: czysty HTML, CSS i JavaScript.
