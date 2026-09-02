"use strict";
export const MAX_IRIS_DRONES=8, IRIS_BASE_PRICE=15000000, SPECIAL_DRONE_PRICE=500000000, DRONE_MAX_LEVEL=6, DRONE_XP_SHARE=.05;
export const DRONE_LEVEL_XP=Object.freeze([0,25000,100000,300000,750000,1500000]);
export const DRONE_TYPES=Object.freeze({
  iris:Object.freeze({id:"iris",name:"Iris",maxOwned:8,slots:2,path:"assets/Drones/Iris_lvl_"}),
  apis:Object.freeze({id:"apis",name:"Apis",maxOwned:1,slots:2,path:"assets/Drones/Apis_lvl_"}),
  zeus:Object.freeze({id:"zeus",name:"Zeus",maxOwned:1,slots:2,path:"assets/Drones/Zeus_lvl_"}),
});
const makeFormation=(id,name,price,effects={},description="")=>Object.freeze({id,name,price,effects:Object.freeze(effects),description,minDrones:id==="standard"?0:4,icon:`assets/Drones/Formations_drones/${id}.png`});
export const DRONE_FORMATIONS=Object.freeze([
  makeFormation("standard","Formation standard",0),
  makeFormation("turtle","Formation Tortue",1000000,{shieldPct:10,laserDamagePct:-7.5,rocketDamagePct:-7.5},"+10 % bouclier · -7,5 % dégâts laser/roquettes"),
  makeFormation("arrow","Formation Flèche",1000000,{rocketDamagePct:20,laserDamagePct:-7.5},"+20 % dégâts roquettes · -7,5 % dégâts laser"),
  makeFormation("lance","Formation Lance",45000000,{mineDamagePct:50},"+50 % dégâts des mines"),
  makeFormation("star","Formation Étoile",75000000,{rocketDamagePct:25,evasionPct:5,rocketCooldownPct:33},"+25 % roquettes · +5 % esquive · +33 % recharge"),
  makeFormation("pincer","Formation Pince",100000000,{playerLaserDamagePct:3,honorPct:5,penetrationPct:-10},"+3 % dégâts joueurs · +5 % honneur · -10 % pénétration"),
  makeFormation("double_arrow","Formation Double Flèche",75000000,{rocketDamagePct:30,penetrationPct:10,shieldPct:-20},"+30 % roquettes · +10 % pénétration · -20 % bouclier"),
  makeFormation("diamond","Formation Diamant",100000000,{shieldRegenPct:1,shieldRegenCap:5000,hpPct:-30},"+1 % bouclier/s · -30 % vie"),
  makeFormation("chevron","Formation Chevron",75000000,{rocketDamagePct:65,hpPct:-20},"+65 % roquettes · -20 % vie"),
  makeFormation("butterfly","Formation Papillon",100000000,{penetrationPct:20,hpPct:20,shieldDrainPct:5},"+20 % pénétration/vie · -5 % bouclier/s"),
  makeFormation("crab","Formation Crabe",100000000,{shieldAbsorptionPct:20,speedPct:-15},"+20 % absorption · -15 % vitesse"),
  makeFormation("heart","Formation Cœur",100000000,{shieldPct:20,hpPct:20,laserDamagePct:-5},"+20 % bouclier/vie · -5 % laser"),
  makeFormation("barrier","Formation Barrière",100000000,{npcDamagePct:5,npcXpPct:5,shieldAbsorptionPct:-15},"+5 % dégâts/XP NPC · -15 % absorption"),
  makeFormation("bat","Formation Chauve-Souris",125000000,{npcDamagePct:8,npcXpPct:8,speedPct:-15},"+8 % dégâts/XP NPC · -15 % vitesse"),
  makeFormation("ring","Formation Anneau",150000000,{shieldPct:85,speedPct:-5,laserDamagePct:-25,rocketCooldownPct:25},"+85 % bouclier · -5 % vitesse · -25 % laser"),
  makeFormation("drill","Formation Foreuse",150000000,{laserDamagePct:20,speedPct:-5,shieldPct:-25,shieldAbsorptionPct:-5},"+20 % laser · -5 % vitesse · -25 % bouclier"),
  makeFormation("veteran","Formation Vétéran",150000000,{honorPct:20,laserDamagePct:-20,shieldPct:-20,hpPct:-20},"+20 % honneur · -20 % laser/bouclier/vie"),
  makeFormation("dome","Formation Dôme",150000000,{shieldPct:30,shieldRegenPct:.5,speedPct:-50,laserDamagePct:-50,rocketCooldownPct:25},"+30 % bouclier · régénération · -50 % vitesse/laser"),
  makeFormation("wheel","Formation Roue",150000000,{speedPct:5,laserDamagePct:-20,shieldDrainPct:5},"+5 % vitesse · -20 % laser · -5 % bouclier/s"),
  makeFormation("x","Formation X",300000000,{npcDamagePct:5,npcXpPct:5,hpPct:8,playerLaserDamagePct:-100,honorPct:-100},"+5 % dégâts/XP NPC · +8 % vie · aucun dégât joueur"),
  makeFormation("wave","Formation Vague",4950000),
]);
const points=s=>Object.freeze(s.split(";").map(pair=>{const [x,y]=pair.split(",").map(Number);return Object.freeze({x,y})}));
export const DRONE_FORMATION_LAYOUTS=Object.freeze({
  standard:points("-20,-10;20,-10;-30,0;30,0;-20,10;20,10;0,20;-10,30;10,30;0,40"),
  turtle:points("-13,-25;11,-25;-23,-13;21,-13;-33,-1;31,-1;-23,11;21,11;-13,23;11,23"),
  arrow:points("-10,-25;8,-25;-17,-13;15,-13;-24,-1;23,-1;-32,11;30,11;-39,23;37,23"),
  lance:points("-24,-25;23,-25;-24,-12;23,-12;-24,0;23,0;-24,13;23,13;-24,25;23,25"),
  star:points("-28,-28;28,-28;-14,-10;14,-10;-14,10;14,10;0,22;-28,28;28,28;0,38"),
  pincer:points("-34,-25;32,-25;-34,-9;32,-9;-34,6;-21,6;19,6;32,6;-20,21;19,21"),
  double_arrow:points("-30,-12;29,-12;-37,1;36,1;-22,1;21,1;-46,14;-13,14;12,14;45,14"),
  diamond:points("-1,-27;-22,-14;21,-14;-37,0;-22,0;21,0;36,0;-22,15;21,15;0,27"),
  chevron:points("-1,-27;-13,-17;12,-17;-25,-6;24,-6;-37,4;36,4;0,18;-12,28;11,28"),
  butterfly:points("-31,-23;30,-23;-41,-10;-22,-10;21,-10;40,-10;-13,18;12,18;-24,28;23,28"),
  crab:points("-22,-25;21,-25;-30,-12;29,-12;-20,0;19,0;-30,13;29,13;-16,25;15,25"),
  heart:points("-17,-28;17,-28;-1,-23;-34,-14;33,-14;-25,0;24,0;-16,13;15,13;0,27"),
  barrier:points("-42,-18;-28,-18;-14,-18;14,-18;28,-18;42,-18;-35,0;-12,0;12,0;35,0"),
  bat:points("-28,-31;28,-31;-8,-20;7,-20;-41,-10;40,-10;-16,19;15,19;-30,28;29,28"),
  // Formations 3D : tracés propres relevés dans Control_menu.png.
  // Chaque moitié gauche est reproduite exactement à droite.
  ring:points("0,-15;-6,-13;6,-13;-12,-8;12,-8;-12,3;12,3;-6,9;6,9;0,11"),
  drill:points("0,-15;-5,-10;5,-10;-10,-5;10,-5;-8,2;8,2;-12,8;12,8;0,-10"),
  veteran:points("-36,-36;36,-36;-22,-22;22,-22;-16,16;16,16;-28,28;28,28;-40,40;40,40"),
  dome:points("-4,-15;4,-15;-8,-9;8,-9;-11,-2;11,-2;-12,7;12,7;-4,7;4,7"),
  wheel:points("-28,-24;28,-24;-42,0;42,0;-28,0;28,0;-14,0;14,0;-28,24;28,24"),
  x:points("-24,-26;-8,-31;8,-31;24,-26;-12,8;12,8;-25,24;25,24;-38,40;38,40"),
  wave:points("-31,-24;31,-24;-18,-13;18,-13;-31,-1;31,-1;-18,10;18,10;-31,22;31,22"),
});
export function getIrisPrice(n){return IRIS_BASE_PRICE*(2**Math.max(0,Math.min(7,Math.floor(Number(n)||0))));}
export function getDroneLevel(experience){const xp=Math.max(0,Number(experience)||0);let level=1;for(let i=1;i<DRONE_LEVEL_XP.length;i++)if(xp>=DRONE_LEVEL_XP[i])level=i+1;return Math.min(DRONE_MAX_LEVEL,level);}
export function getDroneSpritePath(drone,frame=1){const type=DRONE_TYPES[drone?.type]||DRONE_TYPES.iris;const state=Math.max(0,Math.min(DRONE_MAX_LEVEL-1,Number(drone?.level||1)-1));return `${type.path}${state}/${Math.max(1,Math.min(32,Math.floor(Number(frame)||1)))}.png`;}
export function getDroneShopSpritePath(type){return `assets/Drones/Shop/${DRONE_TYPES[type]?.id||"iris"}.gif`;}
export function getActiveDroneFormation(user){const selected=DRONE_FORMATIONS.find(x=>x.id===user?.drones?.activeFormation)||DRONE_FORMATIONS[0];return (user?.drones?.items?.length||0)>=selected.minDrones?selected:DRONE_FORMATIONS[0];}
export function createDrone(type,id){const d=DRONE_TYPES[type];return d?{id,type,level:1,exp:0,fit:{equipment:Array(d.slots).fill(null),ability:null}}:null;}
