// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, action messages, widget
// contents, scene outputs), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted". Brand, train and station names never translate.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Feature names (frozen when the device is created, in the configured language).
export const NAMES = {
  en: {
    delay: 'Delay',
    status: 'Status',
    nextStop: 'Next stop',
    arrival: 'Arrival at my station',
    minutesToStation: 'Minutes to my station',
    nextTrainMinutes: 'Next train in',
    nextTrain: 'Next train',
    nextTrainDelay: 'Delay of the next train',
  },
  fr: {
    delay: 'Retard',
    status: 'État',
    nextStop: 'Prochain arrêt',
    arrival: 'Arrivée à ma gare',
    minutesToStation: 'Minutes avant ma gare',
    nextTrainMinutes: 'Prochain train dans',
    nextTrain: 'Prochain train',
    nextTrainDelay: 'Retard du prochain train',
  },
  de: {
    delay: 'Verspätung',
    status: 'Status',
    nextStop: 'Nächster Halt',
    arrival: 'Ankunft an meinem Bahnhof',
    minutesToStation: 'Minuten bis zu meinem Bahnhof',
    nextTrainMinutes: 'Nächster Zug in',
    nextTrain: 'Nächster Zug',
    nextTrainDelay: 'Verspätung des nächsten Zugs',
  },
  es: {
    delay: 'Retraso',
    status: 'Estado',
    nextStop: 'Próxima parada',
    arrival: 'Llegada a mi estación',
    minutesToStation: 'Minutos hasta mi estación',
    nextTrainMinutes: 'Próximo tren en',
    nextTrain: 'Próximo tren',
    nextTrainDelay: 'Retraso del próximo tren',
  },
};

// The state of a run (src/trains.js STATES), and "no run".
export const STATE_NAMES = {
  en: {
    scheduled: 'Scheduled',
    enroute: 'En route',
    station: 'At a station',
    arrived: 'Arrived',
    none: 'Not running',
  },
  fr: {
    scheduled: 'Prévu',
    enroute: 'En route',
    station: 'En gare',
    arrived: 'Arrivé',
    none: 'Pas en circulation',
  },
  de: {
    scheduled: 'Geplant',
    enroute: 'Unterwegs',
    station: 'Im Bahnhof',
    arrived: 'Angekommen',
    none: 'Nicht unterwegs',
  },
  es: {
    scheduled: 'Previsto',
    enroute: 'En ruta',
    station: 'En la estación',
    arrived: 'Llegado',
    none: 'Sin circulación',
  },
};

export const TEXT = {
  en: {
    serviceDown: ({ error }) => `Amtraker cannot be reached (${error}). Try again in a moment.`,
    arrivedAt: ({ stop, time }) => `Arrived at ${stop} at ${time}`,
    departedAt: ({ stop, time }) => `Left ${stop} at ${time}`,
    departedShort: ({ time }) => `Left ${time}`,
    arrivingFrom: ({ origin }) => `from ${origin}`,
    noRun: 'No run in progress',
    noTrain: 'No train announced',
    lateNote: ({ delay }) => ` (${delay} min late)`,
    minutesLate: ({ delay }) => `${delay} min late`,
    onTime: 'on time',
    sentenceNoRun: ({ train }) => `Train ${train}: no run in progress.`,
    sentenceArrived: ({ train, stop, time, late }) =>
      `Train ${train} arrived at ${stop} at ${time}${late}.`,
    sentenceScheduled: ({ train, stop, time, late }) =>
      `Train ${train} leaves ${stop} at ${time}${late}.`,
    sentenceMoving: ({ train, delay, stop, time }) =>
      `Train ${train}: ${delay}, next stop ${stop} at ${time}.`,
    sentenceMine: ({ stop, time }) => `Arrival at ${stop} at ${time}.`,
    sentenceNoTrain: ({ stop }) => `${stop}: no train announced.`,
    sentenceStation: ({ stop, entries }) => `${stop}: ${entries}.`,
    boardDeparture: ({ train, stop, time, late }) => `${train} to ${stop} at ${time}${late}`,
    boardArrival: ({ train, stop, time, late }) => `${train} from ${stop} at ${time}${late}`,
    added: ({ name }) => `Added: ${name}. Create its device in the Discover tab.`,
    notRunning:
      'It is not running right now: its data will appear on its next run (Amtraker lists a train shortly before it leaves).',
    alreadyWatched: ({ name }) => `${name} is already watched.`,
    tooMany: ({ max }) => `${max} watches at most: remove one first.`,
    badNumber: ({ query }) =>
      `"${query}" is not a train number. Type the number alone (e.g. 5), with a "v" for VIA Rail (v15) or a "b" for Brightline (b5150).`,
    badStation: ({ query }) =>
      `"${query}" is not a station code. Find it with "Find a station" (e.g. CHI for Chicago Union).`,
    unknownStation: ({ station }) =>
      `Amtraker does not know the station ${station}. Find its code with "Find a station".`,
    notCalling: ({ train, station, stops }) =>
      `Train ${train} does not call at ${station}. Its stops: ${stops}.`,
    searchNeedText: 'Type a station name, a city or a code.',
    searchNone: ({ query }) => `No station matches "${query}".`,
    searchFound: ({ count }) => `${count} station(s) found:`,
    searchHint: 'Copy the code in brackets into "Watch a train" or "Watch a station".',
    removeUnknown: ({ query }) => `Nothing watched matches "${query}". See "Show what is watched".`,
    removeAmbiguous:
      'Several watches match: type the full name, as "Show what is watched" lists it.',
    removed: ({ name }) =>
      `No longer watched: ${name}. Its device stays in Gladys until you delete it.`,
    statusNone: 'Nothing watched yet: add a train or a station with the actions above.',
    statusHeader: ({ count }) => `${count} watch(es):`,
    statusCreated: 'device created',
    statusNotCreated: 'device not created yet (Discover tab)',
    statusRefreshed: ({ age }) => `Last read from Amtraker: ${age} s ago.`,
    statusNeverRefreshed: 'Not read from Amtraker yet (no device created).',
    statusError: ({ error }) => `Last error: ${error}`,
    statusStale: 'Amtraker reports that its own data is stale right now.',
    attribution: 'Data: Amtraker (amtraker.com), unofficial, not affiliated with Amtrak.',
    caption: 'Data: Amtraker (amtraker.com) · unofficial',
    dataButton: 'Data: Amtraker',
    arrivedShort: ({ time }) => `Arrived ${time}`,
    pickTrain: 'Choose a train or a station in the widget settings.',
    gone: 'This device is no longer watched by the integration.',
    loading: 'Waiting for the first read from Amtraker…',
    unavailable: 'Amtraker cannot be reached right now.',
    rowState: 'Status',
    rowNext: 'Next stop',
    rowFinal: 'Terminus',
    here: 'At the platform',
    minutes: ({ minutes }) => `${minutes} min`,
  },
  fr: {
    serviceDown: ({ error }) => `Amtraker est injoignable (${error}). Réessayez dans un instant.`,
    arrivedAt: ({ stop, time }) => `Arrivé à ${stop} à ${time}`,
    departedAt: ({ stop, time }) => `Parti de ${stop} à ${time}`,
    departedShort: ({ time }) => `Parti à ${time}`,
    arrivingFrom: ({ origin }) => `de ${origin}`,
    noRun: 'Aucun trajet en cours',
    noTrain: 'Aucun train annoncé',
    lateNote: ({ delay }) => ` (${delay} min de retard)`,
    minutesLate: ({ delay }) => `${delay} min de retard`,
    onTime: "à l'heure",
    sentenceNoRun: ({ train }) => `Train ${train} : aucun trajet en cours.`,
    sentenceArrived: ({ train, stop, time, late }) =>
      `Le train ${train} est arrivé à ${stop} à ${time}${late}.`,
    sentenceScheduled: ({ train, stop, time, late }) =>
      `Le train ${train} part de ${stop} à ${time}${late}.`,
    sentenceMoving: ({ train, delay, stop, time }) =>
      `Train ${train} : ${delay}, prochain arrêt ${stop} à ${time}.`,
    sentenceMine: ({ stop, time }) => `Arrivée à ${stop} à ${time}.`,
    sentenceNoTrain: ({ stop }) => `${stop} : aucun train annoncé.`,
    sentenceStation: ({ stop, entries }) => `${stop} : ${entries}.`,
    boardDeparture: ({ train, stop, time, late }) => `${train} vers ${stop} à ${time}${late}`,
    boardArrival: ({ train, stop, time, late }) => `${train} de ${stop} à ${time}${late}`,
    added: ({ name }) => `Ajouté : ${name}. Créez son appareil dans l'onglet Découverte.`,
    notRunning:
      'Il ne circule pas en ce moment : ses données apparaîtront à son prochain trajet (Amtraker liste un train peu avant son départ).',
    alreadyWatched: ({ name }) => `${name} est déjà suivi.`,
    tooMany: ({ max }) => `${max} suivis au plus : retirez-en un d'abord.`,
    badNumber: ({ query }) =>
      `« ${query} » n'est pas un numéro de train. Saisissez le numéro seul (ex. 5), précédé de « v » pour VIA Rail (v15) ou de « b » pour Brightline (b5150).`,
    badStation: ({ query }) =>
      `« ${query} » n'est pas un code de gare. Trouvez-le avec « Trouver une gare » (ex. CHI pour Chicago Union).`,
    unknownStation: ({ station }) =>
      `Amtraker ne connaît pas la gare ${station}. Trouvez son code avec « Trouver une gare ».`,
    notCalling: ({ train, station, stops }) =>
      `Le train ${train} ne s'arrête pas à ${station}. Ses arrêts : ${stops}.`,
    searchNeedText: 'Saisissez un nom de gare, une ville ou un code.',
    searchNone: ({ query }) => `Aucune gare ne correspond à « ${query} ».`,
    searchFound: ({ count }) => `${count} gare(s) trouvée(s) :`,
    searchHint: 'Copiez le code entre crochets dans « Suivre un train » ou « Suivre une gare ».',
    removeUnknown: ({ query }) =>
      `Rien de suivi ne correspond à « ${query} ». Voir « Afficher les suivis ».`,
    removeAmbiguous:
      'Plusieurs suivis correspondent : saisissez le nom complet, tel que « Afficher les suivis » le donne.',
    removed: ({ name }) =>
      `${name} n'est plus suivi. Son appareil reste dans Gladys jusqu'à ce que vous le supprimiez.`,
    statusNone:
      'Rien de suivi pour le moment : ajoutez un train ou une gare avec les actions ci-dessus.',
    statusHeader: ({ count }) => `${count} suivi(s) :`,
    statusCreated: 'appareil créé',
    statusNotCreated: 'appareil pas encore créé (onglet Découverte)',
    statusRefreshed: ({ age }) => `Dernière lecture d'Amtraker : il y a ${age} s.`,
    statusNeverRefreshed: "Pas encore de lecture d'Amtraker (aucun appareil créé).",
    statusError: ({ error }) => `Dernière erreur : ${error}`,
    statusStale: 'Amtraker signale que ses propres données sont anciennes en ce moment.',
    attribution: 'Données : Amtraker (amtraker.com), non officiel, sans lien avec Amtrak.',
    caption: 'Données : Amtraker (amtraker.com) · non officiel',
    dataButton: 'Données : Amtraker',
    arrivedShort: ({ time }) => `Arrivé à ${time}`,
    pickTrain: 'Choisissez un train ou une gare dans les réglages du widget.',
    gone: "Cet appareil n'est plus suivi par l'intégration.",
    loading: "En attente de la première lecture d'Amtraker…",
    unavailable: 'Amtraker est injoignable en ce moment.',
    rowState: 'État',
    rowNext: 'Prochain arrêt',
    rowFinal: 'Terminus',
    here: 'À quai',
    minutes: ({ minutes }) => `${minutes} min`,
  },
  de: {
    serviceDown: ({ error }) =>
      `Amtraker ist nicht erreichbar (${error}). Versuch es gleich noch einmal.`,
    arrivedAt: ({ stop, time }) => `Angekommen in ${stop} um ${time}`,
    departedAt: ({ stop, time }) => `Abgefahren in ${stop} um ${time}`,
    departedShort: ({ time }) => `Abgefahren um ${time}`,
    arrivingFrom: ({ origin }) => `aus ${origin}`,
    noRun: 'Keine Fahrt unterwegs',
    noTrain: 'Kein Zug angekündigt',
    lateNote: ({ delay }) => ` (${delay} Min. Verspätung)`,
    minutesLate: ({ delay }) => `${delay} Min. Verspätung`,
    onTime: 'pünktlich',
    sentenceNoRun: ({ train }) => `Zug ${train}: keine Fahrt unterwegs.`,
    sentenceArrived: ({ train, stop, time, late }) =>
      `Zug ${train} ist um ${time} in ${stop} angekommen${late}.`,
    sentenceScheduled: ({ train, stop, time, late }) =>
      `Zug ${train} fährt um ${time} in ${stop} ab${late}.`,
    sentenceMoving: ({ train, delay, stop, time }) =>
      `Zug ${train}: ${delay}, nächster Halt ${stop} um ${time}.`,
    sentenceMine: ({ stop, time }) => `Ankunft in ${stop} um ${time}.`,
    sentenceNoTrain: ({ stop }) => `${stop}: kein Zug angekündigt.`,
    sentenceStation: ({ stop, entries }) => `${stop}: ${entries}.`,
    boardDeparture: ({ train, stop, time, late }) => `${train} nach ${stop} um ${time}${late}`,
    boardArrival: ({ train, stop, time, late }) => `${train} aus ${stop} um ${time}${late}`,
    added: ({ name }) => `Hinzugefügt: ${name}. Lege sein Gerät im Tab „Entdecken“ an.`,
    notRunning:
      'Er fährt gerade nicht: Seine Daten erscheinen bei seiner nächsten Fahrt (Amtraker listet einen Zug kurz vor der Abfahrt).',
    alreadyWatched: ({ name }) => `${name} wird schon verfolgt.`,
    tooMany: ({ max }) => `Höchstens ${max} Einträge: Entferne zuerst einen.`,
    badNumber: ({ query }) =>
      `„${query}“ ist keine Zugnummer. Gib nur die Nummer ein (z. B. 5), mit „v“ für VIA Rail (v15) oder „b“ für Brightline (b5150).`,
    badStation: ({ query }) =>
      `„${query}“ ist kein Bahnhofscode. Finde ihn mit „Bahnhof suchen“ (z. B. CHI für Chicago Union).`,
    unknownStation: ({ station }) =>
      `Amtraker kennt den Bahnhof ${station} nicht. Finde seinen Code mit „Bahnhof suchen“.`,
    notCalling: ({ train, station, stops }) =>
      `Zug ${train} hält nicht in ${station}. Seine Halte: ${stops}.`,
    searchNeedText: 'Gib einen Bahnhofsnamen, eine Stadt oder einen Code ein.',
    searchNone: ({ query }) => `Kein Bahnhof passt zu „${query}“.`,
    searchFound: ({ count }) => `${count} Bahnhof/Bahnhöfe gefunden:`,
    searchHint: 'Kopiere den Code in Klammern in „Zug verfolgen“ oder „Bahnhof verfolgen“.',
    removeUnknown: ({ query }) =>
      `Nichts Verfolgtes passt zu „${query}“. Siehe „Verfolgte Einträge anzeigen“.`,
    removeAmbiguous:
      'Mehrere Einträge passen: Gib den vollen Namen ein, wie „Verfolgte Einträge anzeigen“ ihn zeigt.',
    removed: ({ name }) =>
      `${name} wird nicht mehr verfolgt. Sein Gerät bleibt in Gladys, bis du es löschst.`,
    statusNone: 'Noch nichts verfolgt: Füge mit den Aktionen oben einen Zug oder Bahnhof hinzu.',
    statusHeader: ({ count }) => `${count} Eintrag/Einträge:`,
    statusCreated: 'Gerät angelegt',
    statusNotCreated: 'Gerät noch nicht angelegt (Tab „Entdecken“)',
    statusRefreshed: ({ age }) => `Letzte Abfrage bei Amtraker: vor ${age} s.`,
    statusNeverRefreshed: 'Noch keine Abfrage bei Amtraker (kein Gerät angelegt).',
    statusError: ({ error }) => `Letzter Fehler: ${error}`,
    statusStale: 'Amtraker meldet gerade, dass seine eigenen Daten veraltet sind.',
    attribution: 'Daten: Amtraker (amtraker.com), inoffiziell, nicht mit Amtrak verbunden.',
    caption: 'Daten: Amtraker (amtraker.com) · inoffiziell',
    dataButton: 'Daten: Amtraker',
    arrivedShort: ({ time }) => `Angekommen um ${time}`,
    pickTrain: 'Wähle in den Widget-Einstellungen einen Zug oder Bahnhof.',
    gone: 'Dieses Gerät wird von der Integration nicht mehr verfolgt.',
    loading: 'Warte auf die erste Abfrage bei Amtraker…',
    unavailable: 'Amtraker ist gerade nicht erreichbar.',
    rowState: 'Status',
    rowNext: 'Nächster Halt',
    rowFinal: 'Endbahnhof',
    here: 'Am Bahnsteig',
    minutes: ({ minutes }) => `${minutes} Min.`,
  },
  es: {
    serviceDown: ({ error }) =>
      `No se puede contactar con Amtraker (${error}). Inténtelo de nuevo en un momento.`,
    arrivedAt: ({ stop, time }) => `Llegó a ${stop} a las ${time}`,
    departedAt: ({ stop, time }) => `Salió de ${stop} a las ${time}`,
    departedShort: ({ time }) => `Salió a las ${time}`,
    arrivingFrom: ({ origin }) => `desde ${origin}`,
    noRun: 'Ningún trayecto en curso',
    noTrain: 'Ningún tren anunciado',
    lateNote: ({ delay }) => ` (${delay} min de retraso)`,
    minutesLate: ({ delay }) => `${delay} min de retraso`,
    onTime: 'puntual',
    sentenceNoRun: ({ train }) => `Tren ${train}: ningún trayecto en curso.`,
    sentenceArrived: ({ train, stop, time, late }) =>
      `El tren ${train} llegó a ${stop} a las ${time}${late}.`,
    sentenceScheduled: ({ train, stop, time, late }) =>
      `El tren ${train} sale de ${stop} a las ${time}${late}.`,
    sentenceMoving: ({ train, delay, stop, time }) =>
      `Tren ${train}: ${delay}, próxima parada ${stop} a las ${time}.`,
    sentenceMine: ({ stop, time }) => `Llegada a ${stop} a las ${time}.`,
    sentenceNoTrain: ({ stop }) => `${stop}: ningún tren anunciado.`,
    sentenceStation: ({ stop, entries }) => `${stop}: ${entries}.`,
    boardDeparture: ({ train, stop, time, late }) => `${train} hacia ${stop} a las ${time}${late}`,
    boardArrival: ({ train, stop, time, late }) => `${train} desde ${stop} a las ${time}${late}`,
    added: ({ name }) => `Añadido: ${name}. Cree su dispositivo en la pestaña Descubrir.`,
    notRunning:
      'No circula en este momento: sus datos aparecerán en su próximo trayecto (Amtraker lista un tren poco antes de su salida).',
    alreadyWatched: ({ name }) => `${name} ya está seguido.`,
    tooMany: ({ max }) => `${max} seguimientos como máximo: elimine uno primero.`,
    badNumber: ({ query }) =>
      `«${query}» no es un número de tren. Escriba solo el número (p. ej. 5), con una «v» para VIA Rail (v15) o una «b» para Brightline (b5150).`,
    badStation: ({ query }) =>
      `«${query}» no es un código de estación. Búsquelo con «Buscar una estación» (p. ej. CHI para Chicago Union).`,
    unknownStation: ({ station }) =>
      `Amtraker no conoce la estación ${station}. Busque su código con «Buscar una estación».`,
    notCalling: ({ train, station, stops }) =>
      `El tren ${train} no para en ${station}. Sus paradas: ${stops}.`,
    searchNeedText: 'Escriba un nombre de estación, una ciudad o un código.',
    searchNone: ({ query }) => `Ninguna estación coincide con «${query}».`,
    searchFound: ({ count }) => `${count} estación(es) encontrada(s):`,
    searchHint: 'Copie el código entre corchetes en «Seguir un tren» o «Seguir una estación».',
    removeUnknown: ({ query }) =>
      `Nada seguido coincide con «${query}». Vea «Mostrar los seguimientos».`,
    removeAmbiguous:
      'Varios seguimientos coinciden: escriba el nombre completo, tal como lo da «Mostrar los seguimientos».',
    removed: ({ name }) =>
      `${name} ya no está seguido. Su dispositivo permanece en Gladys hasta que usted lo elimine.`,
    statusNone: 'Nada seguido por ahora: añada un tren o una estación con las acciones de arriba.',
    statusHeader: ({ count }) => `${count} seguimiento(s):`,
    statusCreated: 'dispositivo creado',
    statusNotCreated: 'dispositivo aún no creado (pestaña Descubrir)',
    statusRefreshed: ({ age }) => `Última lectura de Amtraker: hace ${age} s.`,
    statusNeverRefreshed: 'Aún no hay lectura de Amtraker (ningún dispositivo creado).',
    statusError: ({ error }) => `Último error: ${error}`,
    statusStale: 'Amtraker indica que sus propios datos están desactualizados en este momento.',
    attribution: 'Datos: Amtraker (amtraker.com), no oficial, sin relación con Amtrak.',
    caption: 'Datos: Amtraker (amtraker.com) · no oficial',
    dataButton: 'Datos: Amtraker',
    arrivedShort: ({ time }) => `Llegó a las ${time}`,
    pickTrain: 'Elija un tren o una estación en los ajustes del widget.',
    gone: 'La integración ya no sigue este dispositivo.',
    loading: 'Esperando la primera lectura de Amtraker…',
    unavailable: 'No se puede contactar con Amtraker en este momento.',
    rowState: 'Estado',
    rowNext: 'Próxima parada',
    rowFinal: 'Destino',
    here: 'En el andén',
    minutes: ({ minutes }) => `${minutes} min`,
  },
};

/** One text in one language (English when missing). */
export function say(table, language, key, params = {}) {
  const entry = table[language]?.[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** Every language of a text: a multi-language action message. */
export function sayAll(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((lang) => [lang, say(table, lang, key, params)]),
  );
}
