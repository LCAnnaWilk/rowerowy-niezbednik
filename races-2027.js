'use strict';

// Kalendarz zawodów 2027 zebrany w październiku 2026. Terminy mogą się zmienić –
// każda pozycja ma link do źródła, a przed zapisem trzeba sprawdzić datę u organizatora.
const RACE_CATALOG = [
  {
    name: 'Leśna Zadyma', date: '2027-02-14', type: 'MTB',
    place: 'Czarna k. Łańcuta', country: 'Polska', lat: 50.07, lon: 22.23,
    url: 'https://treningbiegacza.pl/kalendarz-biegow/wyscigi-rowerowe'
  },
  {
    name: 'Brevet Jabłonowska 200', date: '2027-04-18', type: 'Brevet szosowy',
    place: '', country: 'Polska',
    note: 'Termin orientacyjny.',
    url: 'https://treningbiegacza.pl/kalendarz-biegow/wyscigi-rowerowe'
  },
  {
    name: 'Zimny Gravel', date: '2027-04-23', end: '2027-04-24', type: 'Gravel',
    place: 'Białogard', country: 'Polska', lat: 54.007, lon: 15.989,
    url: 'https://odjazd.pl/dyscyplina/gravel'
  },
  {
    name: 'Mallorca 312', date: '2027-04-24', type: 'Szosa – gran fondo',
    place: 'Playa de Muro, Majorka', country: 'Hiszpania', lat: 39.80, lon: 3.11,
    note: 'Dystanse 312 / 226 / 167 km. Zapisy na 2027 zostały już wyprzedane.',
    url: 'https://mallorcacyclinglab.com/en/events/race-mallorca-312-2027'
  },
  {
    name: 'Wanoga', date: '2027-05-27', end: '2027-05-30', type: 'Ultramaraton gravel',
    place: 'Stężyca', country: 'Polska', lat: 54.20, lon: 17.95,
    note: 'Dystanse 100–500 km. Jedno ze źródeł podaje termin 5–6 czerwca – sprawdź u organizatora.',
    url: 'https://mambaonbike.pl/kalendarz-ultramaratonow-rowerowych/'
  },
  {
    name: 'Mistrzostwa Polski Masters i Cyklosport', date: '2027-06-20', type: 'Szosa – amatorzy',
    place: 'Grójec', country: 'Polska', lat: 51.866, lon: 20.867,
    note: 'Ze startu wspólnego, razem z otwartymi amatorskimi mistrzostwami Polski.',
    url: 'https://www.ztc.pl/wyscigi/mp2021rawa,8.html'
  },
  {
    name: 'Robinsonada dolnośląska', date: '2027-06-26', end: '2027-06-27', type: 'Gravel',
    place: 'Wrocław', country: 'Polska', lat: 51.107, lon: 17.038,
    url: 'https://odjazd.pl/dyscyplina/gravel'
  },
  {
    name: 'Maratona dles Dolomites', date: '2027-07-04', type: 'Szosa – gran fondo',
    place: 'La Villa, Alta Badia', country: 'Włochy', lat: 46.588, lon: 11.902,
    note: '40. edycja, trasy 138 / 106 / 55 km. Losowanie miejsc trwa do 10 listopada 2026.',
    url: 'https://www.maratona.it/en/'
  },
  {
    name: 'Robinsonada mazowiecka', date: '2027-07-17', end: '2027-07-18', type: 'Gravel',
    place: 'Warszawa', country: 'Polska', lat: 52.23, lon: 21.01,
    url: 'https://odjazd.pl/dyscyplina/gravel'
  },
  {
    name: 'UCI Gran Fondo World Championships', date: '2027-08-24', type: 'Szosa – mistrzostwa świata amatorów',
    place: 'Thônes – La Clusaz', country: 'Francja', lat: 45.882, lon: 6.325,
    note: 'Jazda na czas ok. 22.08, gran fondo 24.08 (źródła podają różne daty). Wymagana kwalifikacja w zawodach UCI Gran Fondo World Series.',
    url: 'https://sportivebreaks.com/sportives/uci-gran-fondo-world-championships/'
  },
  {
    name: 'Ötztaler Radmarathon', date: '2027-08-29', type: 'Szosa – maraton alpejski',
    place: 'Sölden', country: 'Austria', lat: 46.966, lon: 11.007,
    note: '227 km i 5500 m przewyższenia przez 4 alpejskie przełęcze.',
    url: 'https://www.soelden.com/en/events-leisure-tips/events/oetztaler-cycle-marathon'
  },
  {
    name: 'Robinsonada pomorska', date: '2027-10-16', type: 'Gravel',
    place: 'Gdańsk', country: 'Polska', lat: 54.352, lon: 18.646,
    url: 'https://odjazd.pl/dyscyplina/gravel'
  },
  {
    name: 'Bałtyk–Bieszczady Gravel Tour', when: '2027, termin nieznany', type: 'Ultramaraton gravel',
    place: 'Bałtyk → Bieszczady', country: 'Polska',
    note: 'Ok. 1200 km, limit czasu co najmniej 144 h. Organizator potwierdził edycję 2027.',
    url: 'https://konceptkolarski.pl/baltyk-bieszczady-gravel-tour'
  },
  {
    name: "L'Étape du Tour", when: 'lipiec 2027, termin nieznany', type: 'Szosa – etap Tour de France',
    place: '', country: 'Francja',
    note: 'Amatorski przejazd etapu Tour de France, zwykle w lipcu.',
    url: 'https://en.wikipedia.org/wiki/L%27%C3%89tape_du_Tour'
  }
];
