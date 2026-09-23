"use strict";
export const MAX_IRIS_DRONES=8, IRIS_BASE_PRICE=15000000, SPECIAL_DRONE_PRICE=500000000, DRONE_MAX_LEVEL=6, DRONE_XP_SHARE=.05;
export const DRONE_LEVEL_XP=Object.freeze([0,25000,100000,300000,750000,1500000]);
export const DRONE_TYPES=Object.freeze({
  iris:Object.freeze({id:"iris",name:"Iris",maxOwned:8,slots:2,path:"DRONE/DRONE_SPRITES/IRIS_LVL_"}),
  apis:Object.freeze({id:"apis",name:"Apis",maxOwned:1,slots:2,path:"DRONE/DRONE_SPRITES/APIS_LVL_"}),
  zeus:Object.freeze({id:"zeus",name:"Zeus",maxOwned:1,slots:2,path:"DRONE/DRONE_SPRITES/ZEUS_LVL_"}),
});
const makeFormation=(id,name,price,effects={},description="")=>Object.freeze({id,name,price,effects:Object.freeze(effects),description,minDrones:id==="standard"?0:4,icon:`DRONE/DRONE_SPRITES/FORMATIONS_DRONES/${id.toUpperCase()}.png`});
export const DRONE_FORMATIONS=Object.freeze([
  makeFormation("standard","Formation standard",0),
  makeFormation("turtle","Formation Tortue",1000000,{shieldPct:10,laserDamagePct:-7.5,rocketDamagePct:-7.5},"+10 % bouclier · -7,5 % dégâts laser/roquettes"),
  makeFormation("arrow","Formation Flèche",1000000,{rocketDamagePct:20,laserDamagePct:-7.5},"+20 % dégâts roquettes · -7,5 % dégâts laser"),
  makeFormation("lance","Formation Lance",20000000,{mineDamagePct:50},"+50 % dégâts des mines"),
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
  makeFormation("x","Formation X",200000000,{npcDamagePct:5,npcXpPct:5,hpPct:8,honorPct:-100},"+5 % dégâts/XP NPC · +8 % vie · 0 honneur"),
  makeFormation("wave","Formation Vague",500000),
]);
export function getIrisPrice(n){return IRIS_BASE_PRICE*(2**Math.max(0,Math.min(7,Math.floor(Number(n)||0))));}
// Icones CONTROL_MENU (officielles) pour le dock rapide / HUD : la boutique
// garde formation.icon (FORMATIONS_DRONES). standard -> DEFAULT.
const FORMATION_DOCK_ICONS=Object.freeze({standard:"ASSETS/CONTROL_MENU/drone_formation_default.png",turtle:"ASSETS/CONTROL_MENU/drone_formation_f-01-tu.png",arrow:"ASSETS/CONTROL_MENU/drone_formation_f-02-ar.png",lance:"ASSETS/CONTROL_MENU/drone_formation_f-03-la.png",star:"ASSETS/CONTROL_MENU/drone_formation_f-04-st.png",pincer:"ASSETS/CONTROL_MENU/drone_formation_f-05-pi.png",double_arrow:"ASSETS/CONTROL_MENU/drone_formation_f-06-da.png",diamond:"ASSETS/CONTROL_MENU/drone_formation_f-07-di.png",chevron:"ASSETS/CONTROL_MENU/drone_formation_f-08-ch.png",butterfly:"ASSETS/CONTROL_MENU/drone_formation_f-09-mo.png",crab:"ASSETS/CONTROL_MENU/drone_formation_f-10-cr.png",heart:"ASSETS/CONTROL_MENU/drone_formation_f-11-he.png",barrier:"ASSETS/CONTROL_MENU/drone_formation_f-12-ba.png",bat:"ASSETS/CONTROL_MENU/drone_formation_f-13-bt.png",ring:"ASSETS/CONTROL_MENU/drone_formation_f-3d-rg.png",drill:"ASSETS/CONTROL_MENU/drone_formation_f-3d-dr.png",veteran:"ASSETS/CONTROL_MENU/drone_formation_f-3d-vt.png",dome:"ASSETS/CONTROL_MENU/drone_formation_f-3d-dm.png",wheel:"ASSETS/CONTROL_MENU/drone_formation_f-3d-wl.png",x:"ASSETS/CONTROL_MENU/drone_formation_f-3d-x.png",wave:"ASSETS/CONTROL_MENU/drone_formation_f-3d-wv.png"});
export function formationDockIcon(formationOrId){const id=typeof formationOrId==="string"?formationOrId:formationOrId?.id;const f=DRONE_FORMATIONS.find(x=>x.id===id);return FORMATION_DOCK_ICONS[id]||f?.icon||null;}
// Formations 3D (grandes icones) vs classiques (F-01..F-13 + standard : +2px au dock/HUD).
const FORMATION_3D_IDS=Object.freeze(new Set(["ring","drill","veteran","dome","wheel","x","wave"]));
export function isClassicFormation(formationOrId){const id=typeof formationOrId==="string"?formationOrId:formationOrId?.id;return !FORMATION_3D_IDS.has(id);}
export function getDroneLevel(experience){const xp=Math.max(0,Number(experience)||0);let level=1;for(let i=1;i<DRONE_LEVEL_XP.length;i++)if(xp>=DRONE_LEVEL_XP[i])level=i+1;return Math.min(DRONE_MAX_LEVEL,level);}
export function getDroneSpritePath(drone,frame=1){const type=DRONE_TYPES[drone?.type]||DRONE_TYPES.iris;const state=Math.max(0,Math.min(DRONE_MAX_LEVEL-1,Number(drone?.level||1)-1));return `${type.path}${state}/${Math.max(1,Math.min(32,Math.floor(Number(frame)||1)))}.png`;}
export function getDroneShopSpritePath(type){return `DRONE/DRONE_SPRITES/SHOP/${(DRONE_TYPES[type]?.id||"iris").toUpperCase()}.gif`;}
export function getActiveDroneFormation(user){const selected=DRONE_FORMATIONS.find(x=>x.id===user?.drones?.activeFormation)||DRONE_FORMATIONS[0];return (user?.drones?.items?.length||0)>=selected.minDrones?selected:DRONE_FORMATIONS[0];}
export function createDrone(type,id){const d=DRONE_TYPES[type];return d?{id,type,level:1,exp:0,fit:{equipment:Array(d.slots).fill(null),ability:null}}:null;}
