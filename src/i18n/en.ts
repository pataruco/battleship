import { avatarNames, shipNames } from '../theme/default/names';
import { relativeTime } from './ago';

const messages = {
  // App shell
  appName: 'Sea Battle',
  tapToStart: 'Tap to start',
  loading: 'Loading…',
  startFailed: 'Could not start the game',
  notFound: 'Page not found',
  comingSoon: 'Coming soon',
  back: 'Back',
  ok: 'OK',
  cancel: 'Cancel',
  yes: 'Yes',
  no: 'No',

  // Home
  newGame: 'New game',
  myGames: 'My games',
  noGames: 'No games yet. Tap New game!',
  yourTurn: 'Your turn!',
  turnOf: (name: string) => `${name}'s turn`,
  badgeSetup: 'Getting ready',
  badgeOver: 'Game over',
  badgeUpdateNeeded: 'Update needed',
  badgeUnavailable: "Can't open",
  waitingForFriend: 'Waiting for a friend…',
  lastMove: (ago: string) => `Last move ${ago}`,
  ago: (ms: number) => relativeTime('en', ms),
  pasteLink: 'Paste link',
  pastePrompt: 'Paste the game link here',
  pasteBad: "That doesn't look like a game link",
  language: 'Language',
  sound: 'Sound',
  voice: 'Voice',
  on: 'On',
  off: 'Off',
  myProfile: 'My profile',
  removeGame: 'Remove',
  removeGameAsk: 'Remove this game from your list?',
  shareAgain: 'Share link again',
  openGame: (name: string) => `Open game with ${name}`,

  // Profile
  profileTitle: 'Who are you?',
  pickAvatar: 'Pick your friend',
  yourName: 'Your name',
  namePlaceholder: 'Sam',
  nameRequired: 'Type your name first',
  save: 'Save',
  saveFailed: "Couldn't save. Try again",
  avatarName: (id: string) => (avatarNames.en as Record<string, string>)[id] ?? id,

  // Invite
  inviteTitle: 'Invite a friend',
  inviteBody: 'Show this code or send the link.',
  share: 'Share',
  copyLink: 'Copy link',
  copied: 'Copied!',
  shareText: (name: string) => `${name} wants to play Sea Battle with you!`,
  placeMyShips: 'Place my ships',
  copyFailed: 'Copy this link:',
  qrAlt: 'Code to join the game',

  // Join and who are you
  joinTitle: (name: string) => `Join ${name}'s game!`,
  joinButton: 'Join!',
  imHost: (name: string) => `I'm ${name}, on another device`,
  whoAreYou: 'Who are you?',
  whoTap: 'Tap your picture',
  areYouSure: (name: string) => `${name} is playing right now on another device. Is that you?`,
  thatsMe: "That's me",

  // Unavailable
  unavailableTitle: "This game can't be opened right now",
  unavailableBody: 'Ask the other player to open it.',
  startNewGame: 'Start a new game',
  updateNeededTitle: 'Update needed',
  updateNeededBody: 'This game needs a newer version of the app. Reload the page.',
  reload: 'Reload',

  // Placement
  placeTitle: 'Place your ships',
  placeHint: 'Drag a ship. Tap it to turn it.',
  shuffle: 'Shuffle',
  ready: 'Ready!',
  sameShips: 'Same ships as last time?',
  newShips: 'New ships',
  invalidSpot: "Ships can't go there",
  opponentReady: (name: string) => `${name} is ready`,
  waitingFor: (name: string) => `Waiting for ${name}…`,
  shipName: (i: number) => shipNames.en[i] ?? '',
  shipDock: 'Your ships',
  placeKeysHint: 'Keyboard: Enter picks up a ship, arrows move it, Enter puts it down, R turns it.',
  shipPicked: (ship: string) => `Picked up the ${ship}. Move it with the arrows, then press Enter`,
  shipAt: (ship: string, label: string) => `${ship}, ${label}`,
  shipPutBack: (ship: string) => `${ship} put back`,
  shipTurned: (ship: string) => `${ship} turned`,

  // Battle
  theirSea: 'Their sea',
  mySea: 'My sea',
  aimHint: 'Tap a square to aim',
  fire: 'FIRE!',
  firing: 'Firing…',
  cellSpoken: (label: string) => label.replace(/(\D)(\d+)/, '$1 $2'),
  missSpoken: 'Miss!',
  hitSpoken: 'Hit!',
  sunkSpoken: (ship: string) => `You sank the ${ship}!`,
  theyHit: (label: string) => `They hit ${label}`,
  theyMissed: (label: string) => `They missed ${label}`,
  theySank: (ship: string) => `They sank your ${ship}`,
  notYourTurn: "Wait, it's not your turn yet",
  alreadyFired: 'You already fired there',
  away: (name: string) => `${name} is away. Your move will be waiting`,
  here: (name: string) => `${name} is here`,
  react: 'Send a reaction',
  reacted: (name: string, emoji: string) => `${name}: ${emoji}`,
  fizzle: 'Fizzle! The shot got lost. Try again',
  menu: 'Menu',

  // Round over
  youWon: 'You won!',
  goodGame: 'Good game!',
  score: (a: string, an: number, b: string, bn: number) => `${a} ${an} – ${b} ${bn}`,
  playAgain: 'Play again',
  rematchWaiting: (name: string) => `Waiting for ${name} to play again…`,
  rematchAsked: (name: string) => `${name} wants to play again!`,
  revealHint: 'Where their ships were hiding',
  home: 'Home',

  // Banners
  offline: "You're offline. Your game is saved",
  reconnecting: 'Reconnecting…',
  busy: 'The sea is busy. Trying again soon',
  authFailed: 'Update needed. Reload the page',
  backOnline: 'Back online',
  retryBanner: "That didn't go through. Try again",
  rejectedBanner: 'The game moved on. Take another look',
  closeBanner: 'Close',

  // Nudges and install hints
  installHint: 'Add to your Home Screen: tap Share, then Add to Home Screen',
  installButton: 'Install',
  gotIt: 'Got it',
  copyForApp: 'Copy for the app',
  playingInApp: 'Playing in the Home Screen app? Copy this link, then use Paste link there',
  grownUpSetup: 'Grown-up job: put the game link in each kid’s Home Screen app',
  keepSafe: 'Keep this game safe: send it to a grown-up',
  storageNudge: 'Open the app now and then to keep your games',

  // Debug
  debugTitle: 'Debug',
  debugConnection: 'Connection',
  debugServer: 'Server',
  debugBucket: 'Bucket',
  debugGame: 'Game',
  debugRevision: 'Revision',
  debugSeq: 'Move number',
  debugVersions: 'Versions',
  debugErrors: 'Last errors',
  debugNone: 'None',
  status: (s: string) =>
    (
      {
        connecting: 'Connecting',
        online: 'Online',
        offline: 'Offline',
        busy: 'Busy',
        'auth-failed': 'Not allowed',
      } as Record<string, string>
    )[s] ?? s,
};

type Widen<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => string ? (...a: A) => string : string;
};
export type Messages = Widen<typeof messages>;
export const en: Messages = messages;
