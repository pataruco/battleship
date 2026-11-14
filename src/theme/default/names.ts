/** Display names for the default theme, per language. Ship order matches the fleet: 5, 4, 3, 3, 2. */
export const shipNames = {
  en: ['Flagship', 'Frigate', 'Corvette', 'Sloop', 'Dinghy'],
  es: ['Buque insignia', 'Fragata', 'Corbeta', 'Balandra', 'Bote'],
} as const;

export const avatarNames = {
  en: {
    octopus: 'Octopus',
    crab: 'Crab',
    whale: 'Whale',
    turtle: 'Turtle',
    seal: 'Seal',
    puffin: 'Puffin',
    jellyfish: 'Jellyfish',
    starfish: 'Starfish',
    seahorse: 'Seahorse',
    otter: 'Otter',
    narwhal: 'Narwhal',
    pufferfish: 'Pufferfish',
  },
  es: {
    octopus: 'Pulpo',
    crab: 'Cangrejo',
    whale: 'Ballena',
    turtle: 'Tortuga',
    seal: 'Foca',
    puffin: 'Frailecillo',
    jellyfish: 'Medusa',
    starfish: 'Estrella de mar',
    seahorse: 'Caballito de mar',
    otter: 'Nutria',
    narwhal: 'Narval',
    pufferfish: 'Pez globo',
  },
} as const;
