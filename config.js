// =====================================================================
// THE ICELAND PROJECT — configurazione
// Qui ci sono tutti i testi del gioco: puoi modificarli senza toccare il resto.
// =====================================================================

// 1) Incolla qui il blocco firebaseConfig che ti dà Firebase.
//    Finché resta vuoto, il gioco gira in "modalità prova" (solo schede dello stesso browser).
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDYTmKHM3M1ftZuYIxImrPXP0V6ZXqBWME",
  authDomain: "iceland-project-705ad.firebaseapp.com",
  databaseURL: "https://iceland-project-705ad-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "iceland-project-705ad",
  storageBucket: "iceland-project-705ad.firebasestorage.app",
  messagingSenderId: "268910007859",
  appId: "1:268910007859:web:4c83852ad7d5314327f546"
};

window.GAME = {
  titolo: "The Iceland Project",
  giocatoriAttesi: 7,

  serate: [
    { n: 1, titolo: "The Travel DNA", quando: "Martedì 10 novembre", cosa: "Budget, priorità e stile di viaggio" },
    { n: 2, titolo: "The Great Iceland Draft", quando: "Data da fissare", cosa: "Tappe, itinerario e mezzo. Poi si prenota" },
    { n: 3, titolo: "The Road Trip Deal", quando: "Inizio dicembre", cosa: "Attività, cassa comune, turni di guida" },
    { n: 4, titolo: "The Final Expedition", quando: "Fine gennaio", cosa: "Checklist, imprevisti, ruoli in viaggio" }
  ],

  avatar: [
    { id: "pulcinella", nome: "Pulcinella di mare" },
    { id: "volpe", nome: "Volpe artica" },
    { id: "renna", nome: "Renna" },
    { id: "foca", nome: "Foca" },
    { id: "orca", nome: "Orca" },
    { id: "cavallo", nome: "Cavallo islandese" },
    { id: "pecora", nome: "Pecora" }
  ],

  lobby: {
    parola: "L'Islanda in una parola",
    follia: "La cosa più folle che faresti in Islanda"
  },

  // Spunti per le domande aperte: sullo schermo del Game Master (il primo anche come esempio sul telefono)
  esempi: {
    parola: ["Aurora", "Freddo", "Libertà", "Ghiaccio", "Avventura"],
    follia: ["Fare il bagno in una pozza calda a -10°", "Assaggiare lo squalo fermentato", "Dormire nel furgone per vedere l'aurora", "Imparare una frase in islandese e usarla al bar", "Un tuffo nell'oceano a febbraio"],
    souvenir: ["Un elmo vichingo di plastica", "Una calamita a forma di pulcinella", "Un barattolo di «aria islandese»", "Un maglione di lana che punge"]
  },

  briefing: [
    {
      tipo: "testo",
      titolo: "Organizzare un viaggio in 7",
      righe: [
        "Di solito uno fa tutto e sei commentano nel gruppo.",
        "Stavolta lo trasformiamo in un gioco."
      ],
      grande: "4 serate da un'ora. E il viaggio è organizzato."
    },
    { tipo: "mappa", titolo: "La spedizione" },
    {
      tipo: "ruoli",
      titolo: "Come funziona",
      ruoli: [
        { nome: "Il Game Master", testo: "Conduce le serate. Non organizza tutto da solo." },
        { nome: "Le coppie", testo: "Cambiano ogni serata e ricevono missioni corte, da 20-30 minuti." },
        { nome: "Il gruppo", testo: "Discute e vota. Le decisioni sono di tutti." }
      ],
      nota: "Si guadagnano punti vichinghi indovinando chi ha scritto cosa e con la sintonia: decidono chi sceglie per primo la missione."
    },
    {
      tipo: "testo",
      titolo: "Una cosa seria",
      righe: [
        "Mezzo e alloggi vanno bloccati entro fine novembre.",
        "A febbraio le soluzioni per 7 persone finiscono presto."
      ],
      grande: "Per questo il gioco ha uno scopo vero."
    }
  ],

  patto: [
    "Chi propone ricerca.",
    "Il gruppo decide.",
    "Chi prenota verifica.",
    "Nessuno può dire «mi va bene tutto» più di tre volte a serata.",
    "Chi arriva tardi alla call porta la prima birra a Reykjavík.",
    "Se c'è l'aurora, si sveglia tutti. Anche chi ha detto «svegliatemi solo se è forte»."
  ],

  // Dilemmi "pieni": scommessa + voto + discussione
  dilemmi: [
    { id: "D1", aurora: false, domanda: "Come ci muoviamo?", a: "Furgone da 9 posti, tutti insieme", b: "Due auto, liberi di dividerci" },
    { id: "D4", aurora: false, domanda: "Dove dormiamo?", a: "Una casa grande per tutti e 7", b: "Due alloggi più piccoli" },
    { id: "D5", aurora: false, domanda: "Che ritmo di viaggio?", a: "Cambiare posto quasi ogni notte", b: "2-3 basi fisse e gite in giornata" },
    { id: "D7", aurora: false, domanda: "Come iniziano le giornate?", a: "Sveglia alle 7, sfruttiamo tutta la luce", b: "Colazione lunga, partenza con calma" },
    { id: "D8", aurora: false, domanda: "Cosa conta di più?", a: "Più posti visti", b: "Più tempo in ogni posto" },
    { id: "D13", aurora: false, domanda: "Acqua calda:", a: "Una terma famosa, a pagamento", b: "Una pozza naturale sperduta, gratis" },
    { id: "D14", aurora: false, domanda: "A tavola:", a: "Cuciniamo insieme quasi sempre", b: "Mangiamo fuori quasi sempre" },
    { id: "D9", aurora: true, domanda: "Le previsioni dicono aurora alle 2 di notte.", a: "Sveglia per tutti", b: "Va chi vuole, domani racconta" },
    { id: "D10", aurora: true, domanda: "Caccia all'aurora:", a: "Con una guida", b: "Fai-da-te: noi, il furgone e un'app" },
    { id: "D11", aurora: true, domanda: "Cielo coperto qui, sereno a due ore di strada.", a: "Partiamo di notte", b: "Giochi e birra, ci riproviamo domani" }
  ],

  // Giro lampo: solo voto, 10 secondi
  lampo: [
    { id: "D2", domanda: "Chi guida?", a: "Tutti a turno", b: "2-3 autisti fissi, gli altri fanno i DJ" },
    { id: "D3", domanda: "Chi guida sulla neve?", a: "Il più prudente del gruppo", b: "Quello che «ho fatto un corso di guida sicura nel 2014»" },
    { id: "D6", domanda: "Alloggio ideale:", a: "Cottage isolato, aurora dalla porta", b: "In paese, ristoranti e supermercato vicini" },
    { id: "D12", domanda: "Davanti all'aurora:", a: "Tutti col telefono, foto perfetta", b: "Telefoni in tasca per i primi 10 minuti" },
    { id: "D15", domanda: "Lo squalo fermentato:", a: "Assaggio obbligatorio per tutti", b: "Solo per chi perde una scommessa" },
    { id: "D16", domanda: "Sempre in 7?", a: "Tutto sempre insieme", b: "Un pomeriggio liberi, divisi per interessi" },
    { id: "D17", domanda: "In furgone:", a: "Playlist democratica, una canzone a testa", b: "DJ a turno con potere assoluto" }
  ],

  categorie: [
    { id: "aurora", nome: "Aurora boreale", desc: "Caccia di notte, cielo buio, previsioni" },
    { id: "cascate", nome: "Cascate e paesaggi", desc: "Le classiche del sud, spiagge nere" },
    { id: "ghiaccio", nome: "Ghiaccio", desc: "Ghiacciai, laguna glaciale, grotte" },
    { id: "terme", nome: "Terme e acqua calda", desc: "Lagune, piscine, pozze naturali" },
    { id: "avventura", nome: "Avventura guidata", desc: "Escursioni, motoslitta, tour" },
    { id: "cibo", nome: "Cibo e locali", desc: "Ristoranti, birre, Reykjavík la sera" },
    { id: "serate", nome: "Serate tra noi", desc: "Giochi, cucina insieme, chiacchiere" },
    { id: "foto", nome: "Foto e video", desc: "Fermarsi quando la luce è giusta" }
  ],

  budget: {
    voci: ["Alloggi comodi", "Mezzo comodo", "Attività guidate", "Tour aurora", "Terme", "Cibo fuori", "Birre e serate"],
    souvenir: "L'oggetto più inutile che compreresti comunque in un negozio di souvenir"
  },

  missioni: [
    { id: "mezzo", nome: "Missione Mezzo", icona: "avventura" },
    { id: "mappa", nome: "Missione Mappa, luce e aurora", icona: "aurora" },
    { id: "alloggi", nome: "Missione Alloggi", icona: "serate" }
  ],
  scadenzaMissioni: "48 ore prima della serata 2",

  // Nomi della spedizione: vince la prima regola vera (le regole sono in game.js, funzione nomeSpedizione)
  nomi: {
    cacciatori: "Cacciatori di Aurore",
    notturni: "Esploratori Notturni",
    terme: "Troll delle Terme",
    mattinieri: "Branco Mattiniero",
    lowcost: "Saghe Low Cost",
    comodi: "Vichinghi Comodi"
  }
};
