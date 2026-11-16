// v17.0.58 — runtime dos modos oficiais 2.0 portados seletivamente.
export const OFFICIAL_MODE_RUNTIME = [
{
  id: "nz:kaguya_shikotsumyaku", slot: "head", nome: "Shikotsumyaku — Despertar",
  efeitos: { strength: 2, speed: 1, jump_boost: 1, resistance: 2, regeneration: 2, night_vision: 1, saturation: 0 },
  healthBoost: 22, forcaExtra: 2, defesaExtra: 3, vidaExtra: 880, chakraExtra: 80, staminaExtra: 130, negativos: null
},
{
  id: "nz:kaguya_hone_armor", slot: "head", nome: "Shikotsumyaku — Armadura Óssea",
  efeitos: { strength: 3, speed: 1, jump_boost: 1, resistance: 4, regeneration: 3, night_vision: 1, saturation: 0 },
  healthBoost: 34, forcaExtra: 3, defesaExtra: 5, vidaExtra: 1360, chakraExtra: 120, staminaExtra: 190, negativos: null
},
{
  id: "nz:kaguya_bracken_dance", slot: "head", nome: "Sawarabi no Mai",
  efeitos: { strength: 4, speed: 3, jump_boost: 2, resistance: 4, regeneration: 4, night_vision: 1, saturation: 0 },
  healthBoost: 44, forcaExtra: 5, defesaExtra: 5, vidaExtra: 1760, chakraExtra: 220, staminaExtra: 280, negativos: null
},
{
  id: "nz:expansao_lvl4", slot: "head", nome: "Modo Akimichi Lvl-4",
  efeitos: { strength: 4, speed: 2, jump_boost: 1, resistance: 3, regeneration: 5, night_vision: 1, saturation: 1 },
  healthBoost: 42, forcaExtra: 4, defesaExtra: 3, vidaExtra: 1680, chakraExtra: 80, staminaExtra: 240, negativos: null
},
{
  id: "nz:sombras_v1",
  slot: "head",
  nome: "Modo Sombra - Hand",
  efeitos: { strength: 2, speed: 2, jump_boost: 1, resistance: 1, regeneration: 3, night_vision: 1, saturation: 0 },
  healthBoost: 20,
  forcaExtra: 2,
  defesaExtra: 1,
  vidaExtra: 800,
  negativos: null
},
{
  id: "nz:sombras_v2",
  slot: "head",
  nome: "Modo Sombra - Half",
  efeitos: { strength: 3, speed: 3, jump_boost: 1, resistance: 2, regeneration: 4, night_vision: 1, saturation: 0 },
  healthBoost: 30,
  forcaExtra: 3,
  defesaExtra: 2,
  vidaExtra: 1200,
  negativos: null
},
{
  id: "nz:sombras_v3",
  slot: "head",
  nome: "Modo Sombra - Fullpower",
  efeitos: { strength: 5, speed: 4, jump_boost: 2, resistance: 3, regeneration: 6, night_vision: 1, saturation: 0 },
  healthBoost: 44,
  forcaExtra: 5,
  defesaExtra: 3,
  vidaExtra: 1760,
  negativos: null
},
{
  id: "nz:rinnegan_momoshiki",
  slot: "head",
  nome: "Rinnegan Vermelho",
  efeitos: { strength: 6, speed: 3, jump_boost: 2, resistance: 3, regeneration: 8, night_vision: 1, saturation: 0 },
  healthBoost: 60,
  forcaExtra: 6,
  defesaExtra: 3,
  vidaExtra: 2400,
  negativos: null
},
{
  id: "nz:rinnegan_urashiki",
  slot: "head",
  nome: "Rinnegan Azul",
  efeitos: { strength: 6, speed: 4, jump_boost: 2, resistance: 3, regeneration: 9, night_vision: 1, saturation: 0 },
  healthBoost: 64,
  forcaExtra: 6,
  defesaExtra: 3,
  vidaExtra: 2560,
  negativos: null
},
{
  id: "nz:rinnegan_kaguya",
  slot: "head",
  nome: "ByakuRinne - Kaguya",
  efeitos: { strength: 6, speed: 6, jump_boost: 3, resistance: 3, regeneration: 8, night_vision: 1 },
  healthBoost: 60,
  forcaExtra: 6,
  defesaExtra: 3,
  vidaExtra: 2400,
  // v18.1.0: removido Wither/Fome que fazia a própria Kaguya perder vida.
  negativos: null
},
{
  id: "nz:modo_iburi1",
  slot: "head",
  nome: "Iburi — Fumaça I",
  efeitos: { strength: 2, speed: 2, jump_boost: 1, resistance: 2, regeneration: 3, night_vision: 1, saturation: 0 },
  healthBoost: 22,
  forcaExtra: 2,
  defesaExtra: 2,
  vidaExtra: 880,
  negativos: null
},
{
  id: "nz:modo_iburi2",
  slot: "head",
  nome: "Iburi — Fumaça II",
  efeitos: { strength: 3, speed: 3, jump_boost: 1, resistance: 3, regeneration: 4, night_vision: 1, saturation: 0 },
  healthBoost: 32,
  forcaExtra: 3,
  defesaExtra: 3,
  vidaExtra: 1280,
  negativos: null
},
{
  id: "nz:modo_iburi3",
  slot: "head",
  nome: "Iburi — Fumaça Total",
  efeitos: { strength: 5, speed: 4, jump_boost: 2, resistance: 2, regeneration: 6, night_vision: 1, saturation: 0 },
  healthBoost: 46,
  forcaExtra: 5,
  defesaExtra: 2,
  vidaExtra: 1840,
  negativos: null
},
{
  id: "nz:lee1",
  slot: "head",
  nome: "Lee Gear - 1°",
  efeitos: { strength: 2, speed: 2, jump_boost: 1, resistance: 1, regeneration: 3, night_vision: 1, saturation: 0 },
  healthBoost: 20,
  forcaExtra: 4,
  defesaExtra: 1,
  vidaExtra: 800,
  negativos: null
},
{
  id: "nz:lee2",
  slot: "head",
  nome: "Lee Gear - 2°",
  efeitos: { strength: 3, speed: 3, jump_boost: 1, resistance: 2, regeneration: 4, night_vision: 1, saturation: 0 },
  healthBoost: 30,
  forcaExtra: 7,
  defesaExtra: 2,
  vidaExtra: 1200,
  negativos: null
},
{
  id: "nz:lee3",
  slot: "head",
  nome: "Lee Gear - 3°",
  efeitos: { strength: 5, speed: 4, jump_boost: 2, resistance: 3, regeneration: 6, night_vision: 1, saturation: 0 },
  healthBoost: 44,
  forcaExtra: 10,
  defesaExtra: 3,
  vidaExtra: 1760,
  negativos: null
},
{
  id: "nz:lee_danca_vermelha",
  slot: "head",
  nome: "Lee — Dança Vermelha",
  efeitos: { strength: 6, speed: 5, jump_boost: 2, resistance: 3, regeneration: 6, night_vision: 1, saturation: 0 },
  healthBoost: 48,
  forcaExtra: 12,
  defesaExtra: 3,
  vidaExtra: 1920,
  staminaExtra: 320,
  negativos: null
},
{
  id: "nz:hozuki1",
  slot: "head",
  nome: "Hozuki Water Form",
  efeitos: { strength: 4, speed: 3, jump_boost: 2, resistance: 2, regeneration: 5, night_vision: 1, saturation: 0 },
  healthBoost: 40,
  forcaExtra: 4,
  defesaExtra: 2,
  vidaExtra: 1600,
  negativos: null
},
{
  id: "nz:hozuki2",
  slot: "head",
  nome: "Giant Hozuki Form",
  efeitos: { strength: 5, speed: 4, jump_boost: 2, resistance: 2, regeneration: 6, night_vision: 1, saturation: 0 },
  healthBoost: 48,
  forcaExtra: 5,
  defesaExtra: 2,
  vidaExtra: 1920,
  negativos: null
},
{
  id: "nz:modo_sarutobi_v1",
  slot: "head",
  nome: "Sarutobi - Earth Monkey",
  efeitos: { strength: 3, speed: 2, jump_boost: 2, resistance: 1, regeneration: 4, night_vision: 1, saturation: 0 },
  healthBoost: 30,
  forcaExtra: 3,
  defesaExtra: 1,
  vidaExtra: 1200,
  negativos: null
},
{
  id: "nz:modo_sarutobi_v2",
  slot: "head",
  nome: "Sarutobi - Earth Monkey V2",
  efeitos: { strength: 4, speed: 3, jump_boost: 2, resistance: 2, regeneration: 5, night_vision: 1, saturation: 0 },
  healthBoost: 40,
  forcaExtra: 4,
  defesaExtra: 2,
  vidaExtra: 1600,
  negativos: null
},
{
  id: "nz:modo_sarutobi_v3",
  slot: "head",
  nome: "Sarutobi - 5 Elementos",
  efeitos: { strength: 5, speed: 4, jump_boost: 2, resistance: 2, regeneration: 1, night_vision: 1, saturation: 0 },
  healthBoost: 48,
  forcaExtra: 5,
  defesaExtra: 2,
  vidaExtra: 1920,
  negativos: null
},
{
  id: "nz:ice_form1",
  slot: "head",
  nome: "Modo Gelo",
  efeitos: { strength: 2, speed: 2, jump_boost: 1, resistance: 2, regeneration: 3, night_vision: 1, saturation: 0 },
  healthBoost: 22,
  forcaExtra: 2,
  defesaExtra: 2,
  vidaExtra: 880,
  negativos: null
},
{
  id: "nz:ice_form2",
  slot: "head",
  nome: "Modo Gelo - Half",
  efeitos: { strength: 3, speed: 3, jump_boost: 1, resistance: 3, regeneration: 4, night_vision: 1, saturation: 0 },
  healthBoost: 32,
  forcaExtra: 3,
  defesaExtra: 3,
  vidaExtra: 1280,
  negativos: null
},
{
  id: "nz:ice_form3",
  slot: "head",
  nome: "Modo Gelo Full",
  efeitos: { strength: 5, speed: 4, jump_boost: 2, resistance: 2, regeneration: 6, night_vision: 1, saturation: 0 },
  healthBoost: 46,
  forcaExtra: 5,
  defesaExtra: 2,
  vidaExtra: 1840,
  negativos: null
},
{
  id: "nz:modo_lobo_branco",
  slot: "head",
  nome: "Lobo Branco Hataque",
  efeitos: { strength: 2, speed: 2, jump_boost: 1, resistance: 1, regeneration: 3, night_vision: 1, saturation: 0 },
  healthBoost: 20,
  forcaExtra: 2,
  defesaExtra: 1,
  vidaExtra: 800,
  negativos: null
},
{
  id: "nz:modo_presa_relampago",
  slot: "head",
  nome: "Presa Relampago Hataque",
  efeitos: { strength: 3, speed: 3, jump_boost: 1, resistance: 1, regeneration: 4, night_vision: 1, saturation: 0 },
  healthBoost: 30,
  forcaExtra: 3,
  defesaExtra: 1,
  vidaExtra: 1200,
  negativos: null
},
{
  id: "nz:modo_lobo_amaldicoado",
  slot: "head",
  nome: "Lobo Amaldiçoado Hataque",
  efeitos: { strength: 5, speed: 4, jump_boost: 2, resistance: 2, regeneration: 6, night_vision: 1, saturation: 0 },
  healthBoost: 44,
  forcaExtra: 5,
  defesaExtra: 2,
  vidaExtra: 1760,
  negativos: null
},
{
  id: "nz:olho_inozuka",
  slot: "head",
  nome: "Olho Inozuka",
  efeitos: { strength: 1, speed: 1, jump_boost: 1, resistance: 0, regeneration: 2, night_vision: 1, saturation: 0 },
  healthBoost: 12,
  forcaExtra: 1,
  defesaExtra: 0,
  vidaExtra: 480,
  negativos: null
},
{
  id: "nz:modo_fera_inozuka",
  slot: "head",
  nome: "Inozuka - Modo Fera",
  efeitos: { strength: 2, speed: 2, jump_boost: 1, resistance: 0, regeneration: 2, night_vision: 1, saturation: 0 },
  healthBoost: 22,
  forcaExtra: 2,
  defesaExtra: 0,
  vidaExtra: 880,
  negativos: null
},
{
  id: "nz:modo_full_fera",
  slot: "head",
  nome: "Inozuka - Modo Fera V2",
  efeitos: { strength: 3, speed: 2, jump_boost: 2, resistance: 1, regeneration: 2, night_vision: 1, saturation: 0 },
  healthBoost: 28,
  forcaExtra: 3,
  defesaExtra: 1,
  vidaExtra: 1120,
  negativos: null
},
{
  id: "nz:yamanaka_foco",
  slot: "head",
  nome: "Foco Mental - Yamanaka",
  efeitos: { strength: 1, speed: 1, jump_boost: 0, resistance: 1, regeneration: 2, night_vision: 1, saturation: 0 },
  healthBoost: 12,
  forcaExtra: 1,
  defesaExtra: 1,
  vidaExtra: 480,
  negativos: null
},
{
  id: "nz:yamanaka_sensorial",
  slot: "head",
  nome: "Sensor Mental - Yamanaka",
  efeitos: { strength: 2, speed: 1, jump_boost: 1, resistance: 1, regeneration: 3, night_vision: 1, saturation: 0 },
  healthBoost: 16,
  forcaExtra: 2,
  defesaExtra: 1,
  vidaExtra: 640,
  negativos: null
},
{
  id: "nz:yamanaka_mestre",
  slot: "head",
  nome: "Mestre Mental Yamanaka",
  efeitos: { strength: 2, speed: 2, jump_boost: 1, resistance: 2, regeneration: 4, night_vision: 1, saturation: 0 },
  healthBoost: 20,
  forcaExtra: 2,
  defesaExtra: 2,
  vidaExtra: 800,
  negativos: null
},
{
  id: "nz:gaara_sand_shield", slot: "head", nome: "Defesa Absoluta de Areia",
  efeitos: { strength: 1, speed: 1, jump_boost: 1, resistance: 3, regeneration: 3, night_vision: 1, saturation: 0 },
  healthBoost: 28, forcaExtra: 1, defesaExtra: 4, vidaExtra: 1120, chakraExtra: 180, staminaExtra: 50, negativos: null
},
{
  id: "nz:gaara_kazekage", slot: "head", nome: "Kazekage da Areia",
  efeitos: { strength: 3, speed: 2, jump_boost: 2, resistance: 4, regeneration: 5, night_vision: 1, saturation: 0 },
  healthBoost: 42, forcaExtra: 3, defesaExtra: 5, vidaExtra: 1680, chakraExtra: 340, staminaExtra: 100, negativos: null
},
{
  id: "nz:zabuza_kirigakure", slot: "head", nome: "Momochi: Demônio da Névoa",
  efeitos: { strength: 3, speed: 3, jump_boost: 1, resistance: 2, regeneration: 3, night_vision: 2, saturation: 0 },
  healthBoost: 26, forcaExtra: 4, defesaExtra: 2, vidaExtra: 1040, chakraExtra: 100, staminaExtra: 180, negativos: null
},
{
  id: "nz:zabuza_demon", slot: "head", nome: "Momochi: Instinto Assassino",
  efeitos: { strength: 5, speed: 4, jump_boost: 2, resistance: 3, regeneration: 4, night_vision: 2, saturation: 0 },
  healthBoost: 38, forcaExtra: 6, defesaExtra: 3, vidaExtra: 1520, chakraExtra: 160, staminaExtra: 300, negativos: null
},
{
  id: "nz:kisame_hoshigaki", slot: "head", nome: "Hoshigaki: Chakra Monstruoso",
  efeitos: { strength: 4, speed: 3, jump_boost: 2, resistance: 3, regeneration: 6, night_vision: 2, saturation: 1 },
  healthBoost: 44, forcaExtra: 5, defesaExtra: 3, vidaExtra: 1760, chakraExtra: 700, staminaExtra: 240, negativos: null
},
{
  id: "nz:kisame_samehada_fusion", slot: "head", nome: "Fusão Kisame + Samehada",
  efeitos: { strength: 6, speed: 5, jump_boost: 3, resistance: 4, regeneration: 8, night_vision: 2, saturation: 1 },
  healthBoost: 60, forcaExtra: 7, defesaExtra: 5, vidaExtra: 2400, chakraExtra: 1200, staminaExtra: 420, negativos: null
},
{
  id: "nz:konan_shikigami", slot: "head", nome: "Papel: Shikigami no Mai",
  efeitos: { strength: 2, speed: 3, jump_boost: 2, resistance: 2, regeneration: 4, night_vision: 1, saturation: 0 },
  healthBoost: 26, forcaExtra: 2, defesaExtra: 2, vidaExtra: 1040, chakraExtra: 300, staminaExtra: 100, negativos: null
},
{
  id: "nz:konan_angel", slot: "head", nome: "Papel: Anjo de Papel",
  efeitos: { strength: 3, speed: 5, jump_boost: 4, resistance: 3, regeneration: 5, night_vision: 2, saturation: 0 },
  healthBoost: 40, forcaExtra: 3, defesaExtra: 3, vidaExtra: 1600, chakraExtra: 520, staminaExtra: 180, negativos: null
}
];
