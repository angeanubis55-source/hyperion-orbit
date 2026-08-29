// src/data/shipPacks.js
export const SHIP_PACKS = [
  { id: "PhoenixBleu",   name: "Phoenix Bleu",  path: "Ship/Phoenix_bleu/",  frames: 32, firstNumber: 1, ext: ".png", w: 176, h: 157, slots: { lasers: 1, gens: 1, extras: 1,shipMods: 3 } , hp: 4000, speed: 320, angleOffset: Math.PI },
  { id: "Liberator",     name: "Liberator",     path: "Ship/Liberator/",     frames: 32, firstNumber: 1, ext: ".png", w: 169, h: 150, slots: { lasers: 4, gens: 6, extras: 2,shipMods: 3 } , hp: 16000, speed: 320, angleOffset: Math.PI },
  { id: "Yamato",        name: "Yamato",        path: "Ship/Yamato/",        frames: 32, firstNumber: 1, ext: ".png", w: 159, h: 141, slots: { lasers: 4, gens: 6, extras: 2,shipMods: 3 } , hp: 32000, speed: 340, angleOffset: Math.PI },
  { id: "Leonov",        name: "Leonov",        path: "Ship/Leonov/",        frames: 32, firstNumber: 1, ext: ".png", w: 186, h: 165, slots: { lasers: 6, gens: 6, extras: 1,shipMods: 3 } , hp: 128000, speed: 360,  angleOffset: Math.PI },
  { id: "Piranha",       name: "Piranha",       path: "Ship/Piranha/",       frames: 32, firstNumber: 1, ext: ".png", w: 155, h: 138, slots: { lasers: 6, gens: 8, extras: 2,shipMods: 3 } , hp: 64000, speed: 360, angleOffset: Math.PI },
  { id: "Nostromo",      name: "Nostromo",      path: "Ship/Nostromo/",      frames: 32, firstNumber: 1, ext: ".png", w: 143, h: 127, slots: { lasers: 7, gens: 10, extras: 3,shipMods: 3 } , hp: 120000, speed: 340, angleOffset: Math.PI },
  { id: "Defcom",        name: "Defcom",        path: "Ship/Defcom/",        frames: 32, firstNumber: 1, ext: ".png", w: 95, h: 74, slots: { lasers: 7, gens: 10, extras: 3,shipMods: 3 } , hp: 64000, speed: 300, angleOffset: Math.PI },
  { id: "BigBoy",        name: "BigBoy",        path: "Ship/BigBoy/",        frames: 32, firstNumber: 1, ext: ".png", w: 169, h: 150, slots: { lasers: 8, gens: 15, extras: 3,shipMods: 3 } , hp: 160000, speed: 260, angleOffset: Math.PI },
  { id: "BigBoy1",       name: "BigBoy1",       path: "Ship/BigBoy1/",       frames: 32, firstNumber: 1, ext: ".png", w: 189, h: 162, slots: { lasers: 8, gens: 15, extras: 3,shipMods: 3 } , hp: 160000, speed: 260, angleOffset: Math.PI },
  { id: "Vengeance",     name: "Vengeance",     path: "Ship/Vengeance/",     frames: 32, firstNumber: 1, ext: ".png", w: 169, h: 150, slots: { lasers: 10, gens: 10, extras: 2,shipMods: 3 } , hp: 180000, speed: 380, angleOffset: Math.PI },
  { id: "Goliath",       name: "Goliath",       path: "Ship/Goliath/",       frames: 32, firstNumber: 1, ext: ".png", w: 169, h: 150, slots: { lasers: 15, gens: 15, extras: 3,shipMods: 3 } , hp: 256000, speed: 300, angleOffset: Math.PI },

//  { id: "Spearhead",     name: "Spearhead",     path: "Ship/Spearhead/",     frames: 32, firstNumber: 1, ext: ".png", w: x, h: x, slots: { lasers: 5, gens: 12, extras: 2 } , hp: 100000, speed: 370, angleOffset: Math.PI },
//  { id: "Aegis",         name: "Aegis",         path: "Ship/Aegis/",         frames: 32, firstNumber: 1, ext: ".png", w: x, h: x, slots: { lasers: 10, gens: 15, extras: 3 } , hp: 275000, speed: 300, angleOffset: Math.PI },
  { id: "Citadel",       name: "Citadel",       path: "Ship/Citadel/",       frames: 32, firstNumber: 1, ext: ".png", w: 262, h: 232,  slots: { lasers: 7, gens: 20, extras: 5,shipMods: 3 } , hp: 550000, speed: 240, angleOffset: Math.PI },

  { id: "CenturionRED",  name: "CenturionRED",  path: "Ship/CenturionRED/",  frames: 32, firstNumber: 1, ext: ".png", w: 220, h: 176,  slots: { lasers: 16, gens: 16, extras: 3,shipMods: 4 } , hp: 365000, speed: 300, angleOffset: Math.PI },

  { id: "GoliathPlus",   name: "GoliathPlus",   path: "Ship/GoliathPlus/",   frames: 32, firstNumber: 1, ext: ".png", w: 169, h: 150,  slots: { lasers: 18, gens: 18, extras: 4,shipMods: 4  } , hp: 356000, speed: 330, angleOffset: Math.PI },
  { id: "GoliathPlus2",  name: "GoliathPlus2",  path: "Ship/GoliathPlus2/",  frames: 32, firstNumber: 1, ext: ".png", w: 169, h: 150,  slots: { lasers: 18, gens: 18, extras: 4,shipMods: 4  } , hp: 356000, speed: 330, angleOffset: Math.PI },
  { id: "GoliathPlus3",  name: "GoliathPlus3",  path: "Ship/GoliathPlus3/",  frames: 32, firstNumber: 1, ext: ".png", w: 169, h: 150,  slots: { lasers: 18, gens: 18, extras: 4,shipMods: 4  } , hp: 356000, speed: 330, angleOffset: Math.PI },
  { id: "GoliathPlus4",  name: "GoliathPlus4",  path: "Ship/GoliathPlus4/",  frames: 32, firstNumber: 1, ext: ".png", w: 169, h: 150,  slots: { lasers: 18, gens: 18, extras: 4,shipMods: 4  } , hp: 356000, speed: 330, angleOffset: Math.PI },
  { id: "GoliathPlus5",  name: "GoliathPlus5",  path: "Ship/GoliathPlus5/",  frames: 32, firstNumber: 1, ext: ".png", w: 350, h: 350,  slots: { lasers: 18, gens: 18, extras: 4,shipMods: 4  } , hp: 356000, speed: 330, angleOffset: Math.PI },

  { id: "PusatPlusFrost", name: "PusatPlusFrost", path: "Ship/PusatPlusFrost/", frames: 32, firstNumber: 1, ext: ".png", w: 220, h: 220, slots: { lasers: 18, gens: 16, extras: 4,shipMods: 4  } , hp: 325000, speed: 400, angleOffset: Math.PI },

  { id: "Solace",        name: "Solace",        path: "Ship/Solace/",        frames: 32, firstNumber: 1, ext: ".png", w: 250, h: 217, slots: { lasers: 15, gens: 15, extras: 3,shipMods: 3 } , hp: 356000, speed: 300, angleOffset: Math.PI },

  { id: "SolacePlus",    name: "SolacePlus",    path: "Ship/SolacePlus/",    frames: 32, firstNumber: 1, ext: ".png", w: 173, h: 154, slots: { lasers: 16, gens: 18, extras: 4,shipMods: 4  } , hp: 427500, speed: 330, angleOffset: Math.PI },
  { id: "SolacePlus1",   name: "SolacePlus1",   path: "Ship/SolacePlus1/",   frames: 32, firstNumber: 1, ext: ".png", w: 173, h: 154, slots: { lasers: 16, gens: 18, extras: 4,shipMods: 4  } , hp: 427500, speed: 330, angleOffset: Math.PI },
  { id: "SolacePlus2",   name: "SolacePlus2",   path: "Ship/SolacePlus2/",   frames: 32, firstNumber: 1, ext: ".png", w: 173, h: 154, slots: { lasers: 16, gens: 18, extras: 4,shipMods: 4  } , hp: 427500, speed: 330, angleOffset: Math.PI },

  { id: "Solaris",       name: "Solaris",       path: "Ship/Solaris/",       frames: 32, firstNumber: 1, ext: ".png", w: 350, h: 280, slots: { lasers: 15, gens: 15, extras: 3,shipMods: 4  } , hp: 377500, speed: 300, angleOffset: Math.PI },

  { id: "Orcus",         name: "Orcus",         path: "Ship/Orcus/",         frames: 32, firstNumber: 1, ext: ".png", w: 256, h: 256, slots: { lasers: 15, gens: 15, extras: 4,shipMods: 4  } , hp: 300000, speed: 280, angleOffset: Math.PI },
  { id: "Orcus2",        name: "Orcus2",        path: "Ship/Orcus2/",        frames: 32, firstNumber: 1, ext: ".png", w: 250, h: 200, slots: { lasers: 15, gens: 15, extras: 4,shipMods: 4  } , hp: 300000, speed: 280, angleOffset: Math.PI },

  { id: "Pusat",         name: "Pusat",         path: "Ship/Pusat/",         frames: 32, firstNumber: 1, ext: ".png", w: 170, h: 170, slots: { lasers: 16, gens: 12, extras: 3,shipMods: 3 } , hp: 225000, speed: 370, angleOffset: Math.PI },

  { id: "SpearheadPlus", name: "SpearheadPlus", path: "Ship/SpearheadPlus/", frames: 32, firstNumber: 1, ext: ".png", w: 205, h: 159, slots: { lasers: 14, gens: 17, extras: 4,shipMods: 4  } , hp: 350000, speed: 370, angleOffset: Math.PI },
  
  { id: "Police", name: "Police", path: "Ship/Police/", frames: 32, firstNumber: 1, ext: ".png", w: 202, h: 179, slots: { lasers: 25, gens: 25, extras: 10,shipMods: 4  } , hp: 750000, speed: 330, angleOffset: Math.PI },
  { id: "Dinde", name: "Dinde", path: "Ship/Dinde/", frames: 32, firstNumber: 1, ext: ".png", w: 190, h: 163, slots: { lasers: 5, gens: 22, extras: 3,shipMods: 4  } , hp: 25000, speed: 330, angleOffset: Math.PI },

  { id: "Retiarus Plus", name: "Retiarus Plus", path: "Ship/Retiarus_plus/", frames: 32, firstNumber: 1, ext: ".png", w: 250, h: 200, slots: { lasers: 16, gens: 18, extras: 4,shipMods: 4  } , hp: 425000, speed: 330, angleOffset: Math.PI },
  { id: "Retiarus Plus Wyvern", name: "Retiarus Plus Wyvern", path: "Ship/Retiarus_plus_wyvern/", frames: 32, firstNumber: 1, ext: ".png", w: 250, h: 200, slots: { lasers: 16, gens: 18, extras: 4,shipMods: 4  } , hp: 425000, speed: 330, angleOffset: Math.PI },
];
