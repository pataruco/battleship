import { avatarNames, shipNames } from '../theme/default/names';
import { relativeTime } from './ago';
import type { Messages } from './en';

export const es: Messages = {
  // App shell
  appName: 'Batalla naval',
  tapToStart: 'Toca para empezar',
  loading: 'Cargando…',
  startFailed: 'No se pudo iniciar el juego',
  notFound: 'Página no encontrada',
  comingSoon: 'Muy pronto',
  back: 'Atrás',
  ok: 'OK',
  cancel: 'Cancelar',
  yes: 'Sí',
  no: 'No',

  // Home
  newGame: 'Juego nuevo',
  myGames: 'Mis juegos',
  noGames: 'Aún no hay juegos. ¡Toca Juego nuevo!',
  yourTurn: '¡Te toca!',
  turnOf: (name) => `Turno de ${name}`,
  badgeSetup: 'Preparando',
  badgeOver: 'Juego terminado',
  badgeUpdateNeeded: 'Falta actualizar',
  badgeUnavailable: 'No se puede abrir',
  waitingForFriend: 'Esperando a un amigo…',
  lastMove: (ago) => `Última jugada ${ago}`,
  ago: (ms) => relativeTime('es-419', ms),
  pasteLink: 'Pegar enlace',
  pastePrompt: 'Pega aquí el enlace del juego',
  pasteBad: 'Eso no parece un enlace de juego',
  language: 'Idioma',
  sound: 'Sonido',
  voice: 'Voz',
  on: 'Sí',
  off: 'No',
  myProfile: 'Mi perfil',
  removeGame: 'Quitar',
  removeGameAsk: '¿Quitar este juego de tu lista?',
  shareAgain: 'Compartir el enlace otra vez',
  openGame: (name) => `Abrir juego con ${name}`,

  // Profile
  profileTitle: '¿Quién eres?',
  pickAvatar: 'Elige a tu amigo',
  yourName: 'Tu nombre',
  namePlaceholder: 'Sam',
  nameRequired: 'Escribe tu nombre primero',
  save: 'Guardar',
  saveFailed: 'No se pudo guardar. Inténtalo otra vez',
  avatarName: (id) => (avatarNames.es as Record<string, string>)[id] ?? id,

  // Invite
  inviteTitle: 'Invita a un amigo',
  inviteBody: 'Muestra este código o manda el enlace.',
  share: 'Compartir',
  copyLink: 'Copiar enlace',
  copied: '¡Copiado!',
  shareText: (name) => `¡${name} quiere jugar Batalla naval contigo!`,
  placeMyShips: 'Poner mis barcos',
  copyFailed: 'Copia este enlace:',
  qrAlt: 'Código para unirse al juego',

  // Join and who are you
  joinTitle: (name) => `¡Únete al juego de ${name}!`,
  joinButton: '¡Unirme!',
  imHost: (name) => `Soy ${name}, en otro aparato`,
  whoAreYou: '¿Quién eres?',
  whoTap: 'Toca tu imagen',
  areYouSure: (name) => `${name} está jugando ahora en otro aparato. ¿Eres tú?`,
  thatsMe: 'Soy yo',

  // Unavailable
  unavailableTitle: 'Este juego no se puede abrir ahora',
  unavailableBody: 'Pídele al otro jugador que lo abra.',
  startNewGame: 'Empezar un juego nuevo',
  updateNeededTitle: 'Falta actualizar',
  updateNeededBody: 'Este juego necesita una versión más nueva de la app. Recarga la página.',
  reload: 'Recargar',

  // Placement
  placeTitle: 'Pon tus barcos',
  placeHint: 'Arrastra un barco. Tócalo para girarlo.',
  shuffle: 'Mezclar',
  ready: '¡Listo!',
  sameShips: '¿Los mismos barcos de la vez pasada?',
  newShips: 'Barcos nuevos',
  invalidSpot: 'Los barcos no caben ahí',
  opponentReady: (name) => `${name} está listo`,
  waitingFor: (name) => `Esperando a ${name}…`,
  shipName: (i) => shipNames.es[i] ?? '',
  shipDock: 'Tus barcos',
  placeKeysHint: 'Teclado: Enter levanta un barco, las flechas lo mueven, Enter lo deja y R lo gira.',
  shipPicked: (ship) => `Levantaste el barco ${ship}. Muévelo con las flechas y presiona Enter`,
  shipAt: (ship, label) => `${ship}, ${label}`,
  shipPutBack: (ship) => `${ship} volvió a su lugar`,
  shipTurned: (ship) => `${ship} girado`,

  // Battle
  theirSea: 'Su mar',
  mySea: 'Mi mar',
  aimHint: 'Toca un cuadro para apuntar',
  fire: '¡FUEGO!',
  firing: 'Disparando…',
  cellSpoken: (label) => label.replace(/(\D)(\d+)/, '$1 $2'),
  missSpoken: '¡Agua!',
  hitSpoken: '¡Le diste!',
  sunkSpoken: (ship) => `¡Hundiste el barco ${ship}!`,
  theyHit: (label) => `Te dieron en ${label}`,
  theyMissed: (label) => `Fallaron en ${label}`,
  theySank: (ship) => `Hundieron tu barco ${ship}`,
  notYourTurn: 'Espera, todavía no te toca',
  alreadyFired: 'Ya disparaste ahí',
  away: (name) => `${name} no está. Tu jugada lo estará esperando`,
  here: (name) => `${name} está aquí`,
  react: 'Mandar una reacción',
  reacted: (name, emoji) => `${name}: ${emoji}`,
  emojiName: (emoji) =>
    ({ '🎉': 'Fiesta', '😱': 'Susto', '😂': 'Risa', '👏': 'Aplausos', '😭': 'Llanto', '🔥': 'Fuego' } as Record<string, string>)[emoji] ??
    emoji,
  fizzle: '¡Pfff! El disparo se perdió. Inténtalo de nuevo',
  menu: 'Menú',

  // Round over
  youWon: '¡Ganaste!',
  goodGame: '¡Buen juego!',
  score: (a, an, b, bn) => `${a} ${an} – ${b} ${bn}`,
  playAgain: 'Jugar otra vez',
  rematchWaiting: (name) => `Esperando a que ${name} quiera jugar otra vez…`,
  rematchAsked: (name) => `¡${name} quiere jugar otra vez!`,
  revealHint: 'Dónde estaban sus barcos',
  home: 'Inicio',

  // Banners
  offline: 'Sin conexión. Tu juego está guardado',
  reconnecting: 'Reconectando…',
  busy: 'El mar está lleno. Probamos de nuevo pronto',
  authFailed: 'Falta actualizar. Recarga la página',
  backOnline: 'De nuevo en línea',
  retryBanner: 'No se pudo enviar. Inténtalo de nuevo',
  rejectedBanner: 'El juego siguió. Vuelve a mirar',
  closeBanner: 'Cerrar',

  // Nudges and install hints
  installHint: 'Agrégala a tu pantalla de inicio: toca Compartir y luego Agregar a pantalla de inicio',
  installButton: 'Instalar',
  gotIt: 'Entendido',
  copyForApp: 'Copiar para la app',
  playingInApp: '¿Juegas en la app de la pantalla de inicio? Copia este enlace y usa Pegar enlace allá',
  grownUpSetup: 'Tarea para adultos: pon el enlace del juego en la app de cada niño',
  keepSafe: 'Cuida este juego: mándaselo a un adulto',
  storageNudge: 'Abre la app de vez en cuando para no perder tus juegos',

  // Debug
  debugTitle: 'Depuración',
  debugConnection: 'Conexión',
  debugServer: 'Servidor',
  debugBucket: 'Depósito',
  debugGame: 'Juego',
  debugRevision: 'Revisión',
  debugSeq: 'Número de jugada',
  debugVersions: 'Versiones',
  debugErrors: 'Últimos errores',
  debugNone: 'Ninguno',
  status: (s) =>
    (
      {
        connecting: 'Conectando',
        online: 'En línea',
        offline: 'Sin conexión',
        busy: 'Ocupado',
        'auth-failed': 'Sin permiso',
      } as Record<string, string>
    )[s] ?? s,
};
