import { useEffect, useMemo, useState } from "react";

// ============================================================
// LARP CHARACTER BUILDER
// Single-page React character creation tool
// ============================================================

// ============================================================
// CONSTANTS
// ============================================================
const STARTING_SP = 25;
const MAX_SP = 269;
const MAX_HP = 30;

const WEAPON_PROFICIENCY_OPTIONS = [
"Battle Axe",
"Bow",
"Club",
"Crossbow",
"Dagger",
"Fist",
"Flail",
"Glaive",
"Great Axe",
"Great Club",
"Greatsword",
"Grenade",
"Hatchet",
"Javelin",
"Kama",
"Mace",
"Maul",
"Nunchaku",
"Pike",
"Pistol",
"Pole Axe",
"Pole Hammer",
"Rifle",
"Sai",
"Sap",
"Scythe",
"Shuriken",
"Slingshot",
"Spear",
"Staff",
"Sword",
"Throwing Axe",
"Throwing Dagger",
"Throwing Rock",
"Tonfa"
].sort((a, b) => a.localeCompare(b));

const ALIGNMENT_OPTIONS = ["Negative", "Positive"].sort((a, b) => a.localeCompare(b));

const CANTRIP_OPTIONS = [
  "Cause Minor Wounds",
  "Cure Minor Wounds",
  "Divine Armor",
  "Elemental Missile",
  "Light",
  "Shield",
  "Slow"
].sort((a, b) => a.localeCompare(b));

const CANTRIP_OPTIONS_BY_SCHOOL = {
  divine: [
    "Cause Minor Wounds",
    "Cure Minor Wounds",
    "Divine Armor",
    "Light",
    "Slow"
  ],
  arcane: [
    "Elemental Missile",
    "Light",
    "Shield",
    "Slow"
  ]
};

const BLADE_WEAPON_PROFICIENCY_IDS = [
  "Battle Axe",
  "Dagger",
  "Glaive",
  "Great Axe",
  "Greatsword",
  "Hatchet",
  "Javelin",
  "Kama",
  "Pike",
  "Pole Axe",
  "Sai",
  "Scythe",
  "Shuriken",
  "Spear",
  "Sword",
  "Throwing Axe",
  "Throwing Dagger"
].map((option) => getOptionSkillId("weapon-proficiency", option));

const BLUDGEON_WEAPON_PROFICIENCY_IDS = [
  "Club",
  "Fist",
  "Flail",
  "Great Club",
  "Mace",
  "Maul",
  "Nunchaku",
  "Pole Hammer",
  "Sap",
  "Staff",
  "Throwing Rock",
  "Tonfa"
].map((option) => getOptionSkillId("weapon-proficiency", option));

const TAGGED_PURCHASE_ID_GROUPS = {
  blade: BLADE_WEAPON_PROFICIENCY_IDS,
  bludgeon: BLUDGEON_WEAPON_PROFICIENCY_IDS
};

function slugifyOption(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getOptionSkillId(skillId, optionValue) {
  return `${skillId}:${slugifyOption(optionValue)}`;
}

function getMagicSchoolKey(skillId) {
  if (skillId === "arcane-arts") return "arcane";
  if (skillId === "divine-arts") return "divine";
  return null;
}

function buildMagicSchoolOrder(generalPurchases = {}, pathPurchases = {}) {
  const order = [];

  const addSchool = (skillId, value) => {
    const schoolKey = getMagicSchoolKey(skillId);
    if (!schoolKey) return;

    const count = Number(value) || 0;
    if (count > 0 && !order.includes(schoolKey)) {
      order.push(schoolKey);
    }
  };

  Object.entries(generalPurchases).forEach(([skillId, value]) => {
    addSchool(skillId, value);
  });

  Object.entries(pathPurchases).forEach(([skillId, value]) => {
    addSchool(skillId, value);
  });

  return order;
}

function getMagicSchoolRoleLabel(skillId, magicSchoolOrder = []) {
  const schoolKey = getMagicSchoolKey(skillId);
  if (!schoolKey) return "";
  if (magicSchoolOrder[0] === schoolKey) return "Primary";
  if (magicSchoolOrder[1] === schoolKey) return "Secondary";
  return "";
}

function getSchoolTrackKey(trackName, magicSchoolOrder = []) {
  if (trackName === "primary") return magicSchoolOrder[0] || null;
  if (trackName === "secondary") return magicSchoolOrder[1] || null;
  return null;
}

function getSchoolTrackPurchaseCount(skillId, schoolKey, purchaseMap) {
  if (!schoolKey) return 0;
  return Number((purchaseMap || {})[skillId + ":" + schoolKey]) || 0;
}

function getSchoolTrackPrerequisiteMet(skill, trackName, purchaseMap, magicSchoolOrder = []) {
  if (!skill.schoolTracks) return true;

  const schoolKey = getSchoolTrackKey(trackName, magicSchoolOrder);
  if (!schoolKey) return false;

  if (skill.id === "spell-slot-level-1") {
    return schoolKey === "arcane"
      ? ((purchaseMap || {})["arcane-arts"] || 0) > 0
      : ((purchaseMap || {})["divine-arts"] || 0) > 0;
  }

  if (skill.id === "ritual-magic") {
    return getSchoolTrackPurchaseCount("spell-slot-level-7", schoolKey, purchaseMap) >= 1;
  }

  const levelMatch = skill.id.match(/^spell-slot-level-([0-9]+)$/);
  if (!levelMatch) return true;

  const levelNumber = Number(levelMatch[1]) || 0;
  if (levelNumber <= 1) return true;

  const previousSkillId = "spell-slot-level-" + (levelNumber - 1);
  return getSchoolTrackPurchaseCount(previousSkillId, schoolKey, purchaseMap) >= 3;
}

function getSchoolTrackMaxForLane(skill, trackName, purchaseMap, magicSchoolOrder = [], baseMaxPurchases = 99) {
  if (!skill.schoolTracks) return baseMaxPurchases;

  const schoolKey = getSchoolTrackKey(trackName, magicSchoolOrder);
  if (!schoolKey) return 0;

  const levelMatch = skill.id.match(/^spell-slot-level-([0-9]+)$/);
  if (!levelMatch) return baseMaxPurchases;

  const levelNumber = Number(levelMatch[1]) || 0;
  if (levelNumber <= 1) return baseMaxPurchases;

  const previousSkillId = "spell-slot-level-" + (levelNumber - 1);
  const previousTierCount = getSchoolTrackPurchaseCount(previousSkillId, schoolKey, purchaseMap);
  return Math.min(baseMaxPurchases, previousTierCount);
}

// ============================================================
// LEVEL TABLE
// Controls level, XP cost per SP, path slots, class slots, and HP
// ============================================================
const levelTable = [
  { level: 1, xpPerSP: 10, minSP: 1, maxSP: 29, paths: 1, baseHP: 5 },
  { level: 2, xpPerSP: 20, minSP: 30, maxSP: 39, paths: 1, baseHP: 5 },
  { level: 3, xpPerSP: 30, minSP: 40, maxSP: 49, paths: 1, baseHP: 6 },
  { level: 4, xpPerSP: 40, minSP: 50, maxSP: 59, paths: 1, baseHP: 6 },
  { level: 5, xpPerSP: 50, minSP: 60, maxSP: 69, paths: 2, baseHP: 7 },
  { level: 6, xpPerSP: 60, minSP: 70, maxSP: 79, paths: 2, baseHP: 7 },
  { level: 7, xpPerSP: 70, minSP: 80, maxSP: 89, paths: 2, baseHP: 8 },
  { level: 8, xpPerSP: 80, minSP: 90, maxSP: 99, paths: 2, baseHP: 8 },
  { level: 9, xpPerSP: 90, minSP: 100, maxSP: 109, paths: 3, baseHP: 9 },
  { level: 10, xpPerSP: 100, minSP: 110, maxSP: 119, paths: 3, classes: 1, baseHP: 9 },
  { level: 11, xpPerSP: 110, minSP: 120, maxSP: 129, paths: 3, classes: 1, baseHP: 10 },
  { level: 12, xpPerSP: 120, minSP: 130, maxSP: 139, paths: 3, classes: 1, baseHP: 10 },
  { level: 13, xpPerSP: 130, minSP: 140, maxSP: 149, paths: 3, classes: 1, baseHP: 11 },
  { level: 14, xpPerSP: 140, minSP: 150, maxSP: 159, paths: 3, classes: 1, baseHP: 11 },
  { level: 15, xpPerSP: 150, minSP: 160, maxSP: 169, paths: 3, classes: 1, baseHP: 12 },
  { level: 16, xpPerSP: 160, minSP: 170, maxSP: 179, paths: 3, classes: 1, baseHP: 12 },
  { level: 17, xpPerSP: 170, minSP: 180, maxSP: 189, paths: 3, classes: 1, baseHP: 13 },
  { level: 18, xpPerSP: 180, minSP: 190, maxSP: 199, paths: 3, classes: 1, baseHP: 13 },
  { level: 19, xpPerSP: 190, minSP: 200, maxSP: 209, paths: 3, classes: 1, baseHP: 14 },
  { level: 20, xpPerSP: 200, minSP: 210, maxSP: 219, paths: 3, classes: 1, baseHP: 14 },
  { level: 21, xpPerSP: 210, minSP: 220, maxSP: 229, paths: 3, classes: 1, baseHP: 15 },
  { level: 22, xpPerSP: 220, minSP: 230, maxSP: 239, paths: 3, classes: 1, baseHP: 15 },
  { level: 23, xpPerSP: 230, minSP: 240, maxSP: 249, paths: 3, classes: 1, baseHP: 15 },
  { level: 24, xpPerSP: 240, minSP: 250, maxSP: 259, paths: 3, classes: 1, baseHP: 15 },
  { level: 25, xpPerSP: 250, minSP: 260, maxSP: 269, paths: 3, classes: 1, baseHP: 15 }
];

// ============================================================
// RACE DATA
// costModifiers use exact skill IDs.
// ============================================================
const races = [
  {
    id: "dwarf",
    name: "Dwarf",
    benefit: "+2 HP, -1 SP cost for Smithing",
    detriment: "+1 SP cost for Rogue skills.",
    hpBonus: 2,
    costModifiers: [
      {
        matchIds: ["smithy"],
        amount: -1,
        label: "Dwarf Smithing discount"
      },
      {
        matchPathId: "rogue",
        amount: 1,
        label: "Dwarf Rogue surcharge"
      }
    ]
  },
  {
    id: "eldryn",
    name: "Eldryn",
    benefit: "Innate Spell: Elemental Missile (3)",
    detriment: "May not cast Divine spells above Level 3",
    hpBonus: 0,
    costModifiers: []
  },
  {
    id: "forest",
    name: "Elf: Forest Elf",
    benefit: "1 SP Cost for Archery & Fletcher",
    detriment: "-1 HP",
    hpBonus: -1,
    costModifiers: [
      {
        matchIds: ["archery"],
        amount: -1,
        label: "Forest Elf archery discount"
      },
      {
        matchIds: ["fletcher"],
        amount: -1,
        label: "Forest Elf fletcher discount"
      }
    ]
  },
  {
    id: "sekahn",
    name: "Elf: Sekahn",
    benefit: "-2 SP Cost for One-Handed Blade, -1 SP cost for Parry",
    detriment: "-1 HP",
    hpBonus: -1,
    costModifiers: [
      {
        matchIds: ["one-handed-blade"],
        amount: -2,
        label: "Sekahn One-handed blade discount"
      },
      {
        matchIds: ["parry"],
        amount: -1,
        label: "Sekahn Parry discount"
      }
    ]
  },
  {
    id: "sobin",
    name: "Elf: Sobin",
    benefit: "-1 SP Cost for Arcane/Divine Arts & Scribe",
    detriment: "-1 HP",
    hpBonus: -1,
    costModifiers: [
      {
        matchIds: ["arcane-arts"],
        amount: -1,
        label: "Sobin Arcane arts discount"
      },
      {
        matchIds: ["divine-arts"],
        amount: -1,
        label: "Sobin Divine arts discount"
      },
      {
        matchIds: ["scribe"],
        amount: -1,
        label: "Sobin Scribe discount"
      }
    ]
  },
  {
    id: "faerie",
    name: "Faerie",
    benefit: "2x Innate Spell: Charm, -2 SP Cost for Resist Magic, Immune to Sleep",
    detriment: "Normal causes double damage",
    hpBonus: 0,
    costModifiers: [
      {
        matchIds: ["resist-magic"],
        amount: -2,
        label: "Faerie Resist Magic discount"
      }
    ]
  },
  {
    id: "halfling",
    name: "Halfling",
    benefit: "-1 SP Cost for Technician & Gunsmith",
    detriment: "+1 SP Cost for Two-Handed Blade & Two-Handed Bludgeon",
    hpBonus: 0,
    costModifiers: [
      {
        matchPathUnlockId: "technician",
        amount: -1,
        label: "Halfling Technician discount"
      },
      {
        matchIds: ["gunsmith"],
        amount: -1,
        label: "Halfling Gunsmith discount"
      },
      {
        matchIds: ["two-handed-blade"],
        amount: 1,
        label: "Halfling Two-handed Blade surcharge"
      },
      {
        matchIds: ["two-handed-bludgeon"],
        amount: 1,
        label: "Halfling Two-handed Bludgeon surcharge"
      }
    ]
  },
  {
    id: "asaltante",
    name: "Human: Asaltante",
    benefit: "-2 SP Cost for Weapon Proficiency",
    detriment: "+1 SP Cost for Resist Magic",
    hpBonus: 0,
    costModifiers: [
      {
        matchIds: ["weapon-proficiency"],
        amount: -2,
        label: "Asaltante Weapon Proficiency discount"
      },
      {
        matchIds: ["resist-magic"],
        amount: 1,
        label: "Asaltante Resist Magic surcharge"
      }
    ]
  },
  {
    id: "gaesin",
    name: "Human: Gaesin",
    benefit: "-1 SP Cost for Scholar of (X)",
    detriment: "+1 SP Cost for Resist Magic",
    hpBonus: 0,
    costModifiers: [
      {
        matchIds: ["scholar-of-x"],
        amount: -1,
        label: "Gaesin Scholar of (X) discount"
      },
      {
        matchIds: ["resist-magic"],
        amount: 1,
        label: "Gaesin Resist Magic surcharge"
      }
    ]
  },
  {
    id: "peregrin",
    name: "Human: Peregrin",
    benefit: "-1 SP Cost for Trade Skill: (X)",
    detriment: "+1 SP Cost for Resist Magic",
    hpBonus: 0,
    costModifiers: [
      {
        matchIds: ["trade-skill-x"],
        amount: -1,
        label: "Peregrin Trade Skill discount"
      },
      {
        matchIds: ["resist-magic"],
        amount: 1,
        label: "Peregrin Resist Magic surcharge"
      }
    ]
  },
  {
    id: "kaddri",
    name: "Kaddri",
    benefit: "Superior Smelling, & a Unique Skill",
    detriment: "+1 SP Cost for Extra Armor",
    hpBonus: 0,
    costModifiers: [
      {
        matchIds: ["extra-armor"],
        amount: 1,
        label: "Kaddri Extra Armor surcharge"
      }
    ]
  },
  {
    id: "kaelis",
    name: "Kaelis",
    benefit: "Photosynthesis, & a Unique Skill",
    detriment: "-2 HP",
    hpBonus: -2,
    costModifiers: []
  },
  {
    id: "obern",
    name: "Obern",
    benefit: "+3 HP, 1x Resist Magic",
    detriment: "May not cast spells over Level 3",
    hpBonus: 3,
    costModifiers: []
  },
  {
    id: "ogre",
    name: "Ogre",
    benefit: "+3 HP, -1 SP Cost for Weapon Proficiency (Two-Handed Bludgeon)",
    detriment: "+1 SP Cost for Read & Write, +1 SP Cost for Spell Slots",
    hpBonus: 3,
    costModifiers: [
      {
        matchIds: ["two-handed-bludgeon"],
        amount: -1,
        label: "Ogre Two-Handed Bludgeon proficiency discount"
      },
      {
        matchIds: ["read--write"],
        amount: -1,
        label: "Ogre Read & Write surcharge"
      },
      { matchIds: [
          "weapon-proficiency:great-club",
          "weapon-proficiency:maul",
          "weapon-proficiency:staff",
        ],
        amount: 1,
        label: "Ogre Two-Handed Bludgeon proficiency discount"
      },
      {
        matchIds: [
          "spell-slot-level-1",
          "spell-slot-level-2",
          "spell-slot-level-3",
          "spell-slot-level-4",
          "spell-slot-level-5",
          "spell-slot-level-6",
          "spell-slot-level-7"
        ],
        amount: 1,
        label: "Ogre Spell Slot surcharge"
      }
    ]
  },
  {
    id: "orc",
    name: "Orc",
    benefit: "+2 HP, -1 SP Cost for Weapon Proficiency (Two-Handed Blade)",
    detriment: "+1 SP Cost for Spell Slots",
    hpBonus: 2,
    costModifiers: [
      {
        matchIds: ["two-handed-blade"],
        amount: -1,
        label: "Orc Two-Handed Blade proficiency discount"
      },
      { matchIds: [
        "weapon-proficiency:great-axe",
        "weapon-proficiency:greatsword",
        "weapon-proficiency:scythe",
      ],
        amount: -1,
        label: "Orc Two-Handed Blade proficiency discount"
      },
      {
        matchIds: [
          "spell-slot-level-1",
          "spell-slot-level-2",
          "spell-slot-level-3",
          "spell-slot-level-4",
          "spell-slot-level-5",
          "spell-slot-level-6",
          "spell-slot-level-7"
        ],
        amount: 1,
        label: "Orc Spell Slot surcharge"
      }
    ]
  }
];

// ============================================================
// GENERAL SKILL DATA
// repeatable false = checkbox
// repeatable true = number field
// hpIncrease = permanent HP granted per purchase
// ============================================================
let generalSkills = [
  {
    id: "appraise",
    name: "Appraise",
    baseCost: 3,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
    prerequisiteText: "Read & Write",
    shortDescription: "Craft, maintain, and identify metal goods.",
    description: "A character with Appraise may discern the approximate value of an item. Players with this skill are issued a list of items and their approximate values which represents their knowledge on the subject."
  },
  {
    id: "cookery",
    name: "Cookery",
    baseCost: 6,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
    prerequisiteText: "Read & Write",
    shortDescription: "Produce enhanced food and drink.",
    description: "With this skill, the character may utilize specialized ingredients to create foodstuffs imbued with particular properties which may then be bestowed upon those who consume them. Only one ingredient of this nature may be used per dish or drink, and the resulting food or drink must contain a representation of the ingredient’s type. The effects granted by ingredients used with this ability last until the next Renewing Winds, or until they are otherwise expended. Dishes prepared without the use of specialized ingredients are instead capable of restoring two of the consumer’s Hit Points. Upon serving, the culinarian must advise those about to partake of their dish of the effects they will receive."
  },
  {
    id: "discern-condition",
    name: "Discern Condition",
    baseCost: 3,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription:
      "Determine whether the subject is asleep, Dead, Dying, Injured, or Unconscious.",
    description: "Discern Condition allows a character to accurately identify the following states: Unconscious, Injured, Dying, Dead, and Asleep. To use this ability, the player must be within arm’s reach of their target and state, “Discerning Condition,” to which their target then may reply with their appropriate state."
  },
  {
    id: "disguise-self",
    name: "Disguise Self",
    baseCost: 6,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Attempt to disguise one’s self.",
    description: "With this skill, the character is considered a master of disguise, allowing them disguise options that are unavailable to others. While any character may attempt to disguise themselves by means of clothing and/or hats (not including full-face masks), Disguise Self allows the player to alter their physical appearance by means of prosthetics, false appendages, skin makeup, and wigs. Please note that while wearing a disguise, a character’s racial traits (such as an Elf’s ears or a Kaddri’s tail) must still be worn, but may be hidden. This skill does not allow the player to alter the color of their eyes. While Disguise Self grants the player a greater selection of effective disguise options, their disguise is only as effective as they make it. Disguises are not a magical effect."
  },
  {
    id: "engineering",
    name: "Engineering",
    baseCost: 5,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: ["background", "production-skill"],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Produce and operate siege equipment.",
    description: "A character with this skill may create and operate siege equipment, and produce and install locks."
  },
  {
    id: "escape-artist",
    name: "Escape Artist",
    baseCost: 5,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription:
      "Attempt to escape from manacles and other bindings more quickly.",
    description: "With this skill, a character may attempt to break free from manacles, handcuffs, and similar devices. Doing so requires one minute of role-play. A character with this skill is also trained to break free of simpler bindings such as rope, and may do so with 30 seconds of role-play."
  },
  {
    id: "evasive-maneuver",
    name: "Evasive Maneuver",
    baseCost: 4,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: [],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Dodge an incoming Mercy Strike.",
    description: "This ability represents a character’s situational awareness and ability to avoid an incoming Mercy Strike, and may be used once per purchase. To use this skill, the character must be fully capable of movement, conscious, and able to make use of their skills."
  },
  {
    id: "extra-armor",
    name: "Extra Armor",
    baseCost: 5,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: [],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Wear an additional five Armor Points.",
    description: "With each purchase of this skill, a character may wear—and therefore benefit from—an additional five Armor Points’ worth of armor."
  },
  {
    id: "first-aid",
    name: "First Aid",
    baseCost: 3,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ skillId: "discern-condition", minPurchases: 1 }],
    prerequisiteText: "Discern Condition",
    shortDescription: "Stabilize the Dying, and tend wounds with sutures.",
    description: "This skill allows a character to bandage the wounds of a target that is in the Dying state, thus stabilizing them and raising them to the Unconscious state. In order to utilize this skill, the player must bandage their target’s arm or leg with a cloth bandage no less than two feet in length. Characters with the First Aid skill may also utilize Sutures to heal wounds at a rate of one Hit Point per 10 seconds of role-play, up to five per suture."
  },
  {
    id: "photosynthesis",
    name: "Photosynthesis",
    baseCost: 0,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ raceId: "kaelis" }],
    prerequisiteText: "Kaelis",
    shortDescription: "Regenerate lost HP in sunlight.",
    description: "For each minute a Kaelis stands still in direct sunlight, they may heal for one Hit Point. If the skies are so overcast or cloudy that the sun cannot be directly seen, this skill may not be used. A character must be conscious and capable of using their skills in order to use this ability. In addition, a Kaelis may select or design a unique skill which relates to their particular variety of plant or fungus, with the approval of the designated Rules Development Team and appropriate documentation on the player’s character sheet from a designated Logistics Officer. This benefit may only be selected during character creation."
  },
  {
    id: "read--write",
    name: "Read & Write",
    baseCost: 3,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Read and Write mundane texts.",
    description: "This skill represents a character’s literacy, and renders them capable of reading and writing non-magical texts."
  },
  {
    id: "resist-charm",
    name: "Resist Charm",
    baseCost: 4,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ skillId: "vitality", minPurchases: 1 }],
    prerequisiteText: "1x Vitality",
    shortDescription: "Resist the effects of a Charm spell or poison.",
    description: "A character with this skill may resist one magical or poison-based Charm or Vampire Charm effect per purchase, and may only do so when conscious and capable of using their skills. For each purchase of Resist Charm, the character must possess one purchase of Vitality."
  },
  {
    id: "resist-disease",
    name: "Resist Disease",
    baseCost: 4,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ skillId: "vitality", minPurchases: 1 }],
    prerequisiteText: "1x Vitality, 1x Character Level",
    shortDescription: "Resist infection by a disease.",
    description: "Once per purchase of Vitality and for each character level, Resist Disease may be purchased once. With it, the character may resist infection of a disease. To use this skill, the character must be conscious and capable of using their abilities."
  },
  {
    id: "resist-magic",
    name: "Resist Magic",
    baseCost: 4,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ skillId: "vitality", minPurchases: 2 }],
    prerequisiteText: "2x Vitality, 3x Character Levels",
    shortDescription: "Resist a spell’s effects.",
    description: "Once per purchase, the character may resist one magical effect, thanks to this ability. Note however, that Empowered spells bypass its protection. This skill may be purchased once for every three levels the character possesses (I.e. 3, 6, 9, etc.), and each purchase requires two purchases of the Vitality skill. To use this skill, the character must be conscious and capable of using their abilities."
  },
  {
    id: "resist-poison",
    name: "Resist Poison",
    baseCost: 4,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ skillId: "vitality", minPurchases: 1 }],
    prerequisiteText: "1x Vitality, 2x Character Levels",
    shortDescription: "Resist a poison’s effects.",
    description: "With this skill, a character may resist the effects of a poison once per purchase. For each purchase of Resist Poison, the character must possess one purchase of Vitality. This skill may be purchased once for every two character levels (I.e. 2, 4, 6, etc.). To make use of this ability, the character must be conscious and capable of using their skills."
  },
  {
    id: "resist-sleep",
    name: "Resist Sleep",
    baseCost: 4,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: [],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Resist the effects of a Sleep spell or poison.",
    description: "Once per purchase, this skill allows a character to resist one magical or poison-based Sleep effect. To use this skill, the character must be conscious and capable of using their abilities."
  },
  {
    id: "scholar-of-x",
    name: "Scholar of (X)",
    baseCost: 3,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: ["custom-text", "background"],
    customText: true,
    customTextLabel: "Scholar Subject",
    customTextPlaceholder: "Example: History, Demons, Nobility",
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Gain relevant information on X subject.",
    description: "This skill represents a character’s knowledge regarding the selected topic. A greater number of purchases of this skill for a given field of study indicates a greater education therein, whereas minimal investment in the skill indicates basic or misinformed knowledge on the selected subject."
  },
  {
    id: "small-weapon",
    name: "Small Weapon",
    baseCost: 2,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: ["weapon-proficiency"],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Use combat abilities with Small Weapons.",
    description: "This skill represents a character’s training in the use of small weapons, such as hatchets, saps, and daggers, enabling them to use combat-enhancing abilities while wielding them."
  },
  {
    id: "smithy",
    name: "Smithy",
    baseCost: 5,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: ["background", "production-skill"],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Craft weapons and armor.",
    description: "This skill represents a character’s ability to create various types of arms and armor."
  },
  {
    id: "spirit-augmentation",
    name: "Spirit Augmentation",
    baseCost: 8,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ skillId: "vitality", minPurchases: 1 }],
    prerequisiteText: "1x Vitality",
    shortDescription: "Endure an additional death before dying permanently.",
    description: "With each purchase of this ability, the character may suffer one additional death leading to their resurrection before permanently dying."
  },
  {
    id: "superior-smelling",
    name: "Superior Smelling",
    baseCost: 0,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ raceId: "kaddri" }],
    prerequisiteText: "Kaddri",
    shortDescription: "Track by sense of smell and detect foreign substances within foodstuffs.",
    description: "Kaddri are capable of utilizing their superior sense of smell to track, effectively granting them two levels of the Tracking ability. Additionally, they may detect poisons and similar foreign substances in food or drink with three seconds of role-play, though they may not identify what the substances are. Furthermore, Kaddri may select or design a unique skill that relates to their particular variety of animal with the approval of the designated Rules Development Team, and appropriate documentation on their character sheet from an appointed Logistics Officer. This benefit may only be selected during the character creation process."
  },
  {
    id: "teach",
    name: "Teach",
    baseCost: 6,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
    prerequisiteText: "Read & Write",
    shortDescription: "Teach a skill to another character.",
    description: "A character with this ability may teach a skill to another character through 12 hours of role-play. Upon completion of the role-play, both players must report to a designated Logistics officer so the new skill may be applied to the student’s character sheet. Learning a skill via Teach costs half of the skills SP cost rounded up to the nearest Skill Point, so long as the student has already opened the Path the skill belongs to. Skills learned from Paths the student has not opened cost their full Skill Point price. Any given skill—so long as it normally may be purchased multiple times—may only be learned via Teach up to three times, and pupils must fulfill all prerequisite requirements for the skills they wish to learn. Note: Class skills may not be taught to individuals who are not part of the associated Class. Necessary role-play is not required to be completed in one session, and may be performed in numerous sessions of the course of several events. While mentoring other players for the purposes of teaching new skills or training for a Class, the Teacher/Mentor may not train as a pupil, themselves."
  },
  {
    id: "trade-skill-x",
    name: "Trade Skill: (X)",
    baseCost: 4,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: ["custom-text", "background"],
    customText: true,
    customTextLabel: "Trade Skill",
    customTextPlaceholder: "Example: Cobbler, Smuggler, Carpenter",
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Earn a regular income.",
    description: "With each purchase of this skill, the character earns a regular income of five copper coins per day. Trade Skills consist of professions, both legal and illegal. Examples include: Cobbler, Smuggler, Carpenter, Sailor, and Blacksmith."
  },
  {
    id: "two-weapons",
    name: "Two Weapons",
    baseCost: 6,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
    prerequisiteText: "Weapon Proficiency",
    shortDescription: "Wield two weapons simultaneously.",
    description: "A character with this skill is treated as being proficient with wielding two weapons simultaneously, so long as they are proficient with the weapons wielded. Those who wield two weapons without this skill are treated as being non-proficient in their use, regardless of their skills."
  },
  {
    id: "vitality",
    name: "Vitality",
    baseCost: 2,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 1,
    tags: [],
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Gain an additional permanent Hit Point.",
    description: "Each purchase of this skill grants the character an additional permanent Hit Point, up to a maximum of 30. As the character progresses and naturally gains more Hit Points, excess purchases of Vitality are refunded to them."
  },
  {
    id: "weapon-proficiency",
    name: "Weapon Proficiency",
    baseCost: 5,
    repeatable: true,
    maxPurchases: 99,
    hpIncrease: 0,
    tags: ["weapon-proficiency"],
    customText: true,
    optionChoices: WEAPON_PROFICIENCY_OPTIONS,
    customTextLabel: "Weapon Type",
    customTextPlaceholder: "Choose a weapon type",
    prerequisites: [],
    prerequisiteText: "N/A",
    shortDescription: "Use combat abilities while wielding the chosen weapon.",
    description: "This skill may be purchased for a specific weapon (E.g. sword, bow, pike, etc.), representing a character’s training and proficiency with the specific weapon type selected. Although a character may wield any weapon to block and deal the weapon’s base damage in combat, they must be proficient with the weapon(s) they use in order to use them in conjunction with combat abilities such as Parry, Critical Hit, Crushing Blow, or Mercy Strike."
  },
  {
    id: "unique-skill",
    name: "Unique Skill",
    baseCost: 0,
    repeatable: false,
    maxPurchases: 1,
    hpIncrease: 0,
    tags: [],
    prerequisites: [
      {
        anyOf: [{ raceId: "kaddri" }, { raceId: "kaelis" }]
      }
    ],
    prerequisiteText: "Kaddri or Kaelis",
    shortDescription: "A unique racial skill.",
    description: ""
  }
];

// ============================================================
// PATH DATA
// ============================================================
let paths = [
  {
    id: "artisan",
    name: "Artisan",
    unlockCost: 5,
    prerequisiteText: "No prerequisite",
    prerequisites: [],
    description: "",
    skills: [
      {
        id: "conserve",
        name: "Conserve",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "production-skill", minPurchases: 1 }],
        prerequisiteText: "1x Production Skill",
        shortDescription: "Reduce materials required for crafting an item.",
        description: "With this ability, the Artisan may make their materials go further, reducing the number of material components necessary to produce an item by one, up to a minimum of one. This skill may be purchased once for each rank the character possesses in a Production Skill, and it may be used once per purchase."
      },
      {
        id: "craft-x",
        name: "Craft: (X)",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["custom-text", "production-skill"],
        customText: true,
        customTextLabel: "Craft Specialty",
        customTextPlaceholder: "Example: Jeweler, Leatherworker, Potter",
        prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
        prerequisiteText: "Read & Write",
        shortDescription: "Produce items of a given Production Skill.",
        description: "So long as the character meets the necessary requirements noted for a given Production Skill, they may elect to use this ability to take on ranks of their desired Production Skill(s) and utilize the knowledge they grant to produce items associated with those crafts as per normal. This ability may be purchased multiple times for each Production Skill. Production Skills include Alchemy, Apothecary, Druggist, Engineer, Fletcher, Gunsmith, Nota, Scribe, Smithy, and Trapper."
      },
      {
        id: "focus-crystal",
        name: "Focus Crystal",
        baseCost: 6,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "production-skill", minPurchases: 1 }],
        prerequisiteText: "1x Production Skill",
        shortDescription: "Embed a Focus Crystal into an item.",
        description: "Once per purchase of this skill, the Artisan may embed a faceted crystal into an item either bearing enchantments, or intended to bear them. With the crystal’s presence, one permanent or temporary spell charge of the user’s choice may be used without expending the original charge, once per day. Only one Focus Crystal may be embedded in a given object, though this skill may be purchased multiple times and is usable once per purchase. Example: Riku’s sword contains an embedded Focus Crystal, and he later has the sword Imbued with three charges of the Force Wave spell. Rather than consuming one of these three charges, the Focus Crystal allows him to utilize one of the charges once each day without expending the charges present."
      },
      {
        id: "hasten",
        name: "Hasten",
        baseCost: 8,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Reduce time required for crafting an item.",
        description: "This ability represents a character’s familiarity with the production process, effectively allowing them to reduce the time spent crafting individual items. For each purchase of Hasten the character possesses, the necessary time spent producing a given item is reduced by one minute per Production Level. Hasten may be purchased up to three times."
      },
      {
        id: "innovation",
        name: "Innovation",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "production-skill", minPurchases: 1 }],
        prerequisiteText: "1x Production Skill",
        shortDescription: "Produce a higher-quality consumable item.",
        description: "This skill allows the Artisan to produce a more potent variation of a consumable item than normal, effectively giving the resulting item an additional use or dose thanks to its high concentration. Innovation may be purchased multiple times, and is usable once per purpose. Item types which may be affected by Innovation include Poisons and Alchemical Substances, Salves and Salts, Scrolls, Magic Tattoos, and Potions."
      }
    ]
  },
  {
    id: "barbarian",
    name: "Barbarian",
    unlockCost: 3,
    prerequisiteText: "No prerequisite",
    prerequisites: [],
    description: "",
    skills: [
      {
        id: "adrenaline",
        name: "Adrenaline",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "1x Character Level",
        shortDescription: "Negate all but one point of physical damage.",
        description: "Once per purchase, this ability negates all but one point of damage received from a physical attack. Adrenaline may be purchased once per character level, and may only be used when the character is conscious and capable of using their abilities."
      },
      {
        id: "courage",
        name: "Courage",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Resist Fear effects.",
        description: "Using this ability, a character may resist the magical effects of Fear once per purchase. The character must be conscious and capable of utilizing their skills in order to use this ability."
      },
      {
        id: "crushing-blow",
        name: "Crushing Blow",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "bludgeon", minPurchases: 1 }],
        prerequisiteText: "Bludgeon Weapon Proficiency",
        shortDescription: "Deal Crushing damage with one melee attack.",
        description: "When used with a bludgeoning weapon such as a mace, club, or staff, this skill may be used to deal Crushing damage with the character’s next attack by adding “Crushing” to the beginning of their damage call. This ability may be used once per purchase."
      },
      {
        id: "fracture",
        name: "Fracture",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Shatter the item struck.",
        description: "With this skill, a Barbarian may call “Shatter” in place of their typical damage call; effectively shattering the object they strike, once per purchase."
      },
      {
        id: "one-with-nature",
        name: "One with Nature",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Cast protective spells on one’s self.",
        description: "Utilizing their close connection with nature, the Barbarian may call upon Gaia to grant himself protection. The use of One with Nature does not spend a Spell Slot, and may be done without having purchased Divine Arts. One with Nature does not require an incantation— Instead, the Barbarian may state the name of the effect they wish to activate, while making contact with themselves. This skill may be purchased twice, may be used once per purchase, and may impart the effects of one of the following spells: Divine Armor, Protection from Poison, Protection from Magic, Resist Element, and Reflect Magic."
      },
      {
        id: "overpower",
        name: "Overpower",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "crushing-blow", minPurchases: 1 }],
        prerequisiteText: "1x Crushing Blow",
        shortDescription: "Knock the target back five paces.",
        description: "For each purchase of Crushing Blow, Overpower may be purchased once. With it, the character may add “Knock-back” to the beginning of their damage call, knocking their target back five paces upon contact. This skill may be used once per purchase."
      },
      {
        id: "unchained-beast",
        name: "Unchained Beast",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Cause Fear in the target.",
        description: "Letting out a fierce cry before attacking, the Barbarian may add “Cause Fear” to the start of their damage call, afflicting their target with the Fear effect once per purchase."
      }
    ]
  },
  {
    id: "fighter",
    name: "Fighter",
    unlockCost: 3,
    prerequisiteText: "No prerequisite",
    prerequisites: [],
    description: "",
    skills: [
      {
        id: "cleave",
        name: "Cleave",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "critical-hit", minPurchases: 3 }],
        prerequisiteText: "3x Critical Hit",
        shortDescription: "Deal +3 damage with three melee attacks.",
        description: "While using a melee weapon they are proficient with, a character may use this skill to deal an additional three points of damage for three consecutive attacks, once per purchase. In order to purchase Cleave once, the character must first purchase Critical Hit three times."
      },
      {
        id: "critical-hit",
        name: "Critical Hit",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Deal +1 damage with three melee attacks.",
        description: "With each purchase of this skill, the character may add an additional point of damage to three consecutive attacks, once. This ability may only be used with melee weapons the character is proficient with."
      },
      {
        id: "one-handed-blade",
        name: "One-Handed Blade",
        baseCost: 3,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: ["weapon-proficiency", "blade"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use skills while wielding One-Handed Blades.",
        description: "This skill represents a character’s training and resulting proficiency with all one-handed bladed or bludgeoning weapons, respective to the selected variation."
      },
      {
        id: "one-handed-bludgeon",
        name: "One-Handed Bludgeon",
        baseCost: 3,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: ["weapon-proficiency", "bludgeon"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use skills while wielding One-Handed Bludgeons.",
        description: "This skill represents a character’s training and resulting proficiency with all one-handed bladed or bludgeoning weapons, respective to the selected variation."
      },
      {
        id: "parry",
        name: "Parry",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Negate one incoming physical attack.",
        description: "For each purchase of Parry, a character may avoid the damage of a physical attack by calling, “Parry!” Spells, Channel Strikes, and Gas Poisons cannot be parried with this skill, and it may only be used when the character is wielding a weapon they are proficient with."
      },
      {
        id: "polearm",
        name: "Polearm",
        baseCost: 6,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: ["weapon-proficiency", "blade"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use skills while wielding pole weapons.",
        description: "A character with this skill is treated as having been well-trained and thus proficient with pole weapons. While normally wielded in both hands, pole weapons may be wielded in one hand; though doing so reduces the weapon’s damage output to half its standard value, rounded down to the nearest point of damage."
      },
      {
        id: "shield",
        name: "Shield",
        baseCost: 3,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use shield-related skills while wielding a shield.",
        description: "This skill represents a character’s training and proficiency with the use of shields. Shields are used to protect the user against physical damage and are impervious to destruction by such means. Gas poisons, spells, and abilities such as Fracture however, may still affect them or the character wielding them."
      },
      {
        id: "shield-bash",
        name: "Shield Bash",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "shield", minPurchases: 1 }],
        prerequisiteText: "Shield",
        shortDescription: "Stun a foe by striking them with a shield.",
        description: "A character with this skill may strike a foe with their shield once per purchase. When struck, Shield Bash causes the target to suffer the Stun effect for five seconds. Shield Bash may only be used in conjunction with shields without protruding bolts or other potentially-hazardous features, and its activation is accompanied by the call, “Stun!”"
      },
      {
        id: "strength",
        name: "Strength",
        baseCost: 6,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "cleave", minPurchases: 3 }],
        prerequisiteText: "3x Cleave, 5x Character Levels",
        shortDescription: "Deal +1 damage with all melee weapons.",
        description: "For every five character levels (I.e. 5, 10, 15), and three purchases of Cleave, the character may purchase the Strength skill once. With it, they may deal an additional point of damage with all melee weapons they are proficient with, permanently. Strength may be purchased up to three times."
      },
      {
        id: "two-handed-blade",
        name: "Two-Handed Blade",
        baseCost: 6,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: ["weapon-proficiency", "blade"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use skills while wielding Two-Handed Blades.",
        description: "This skill represents a character’s training and proficiency with all large bladed or bludgeoning weapons that may be wielded in two hands, respective to the variation selected. However, two-handed weapons may be wielded in one hand, but doing so reduces the damage they deal to half of the standard value, rounded down to the nearest point of damage."
      },
      {
        id: "two-handed-bludgeon",
        name: "Two-Handed Bludgeon",
        baseCost: 6,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: ["weapon-proficiency", "bludgeon"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use skills while wielding Two-Handed Bludgeons.",
        description: "This skill represents a character’s training and proficiency with all large bladed or bludgeoning weapons that may be wielded in two hands, respective to the variation selected. However, two-handed weapons may be wielded in one hand, but doing so reduces the damage they deal to half of the standard value, rounded down to the nearest point of damage."
      },
      {
        id: "versatility",
        name: "Versatility",
        baseCost: 3,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Deal +1 damage when wielding a one-handed weapon in both hands.",
        description: "With this skill, a character may wield a One-Handed melee weapon they are proficient with in both hands, allowing them to impart added strength and control to their attacks, thereby dealing an additional point of damage."
      }
    ]
  },
  {
    id: "mage",
    name: "Mage",
    unlockCost: 5,
    prerequisiteText: "No prerequisite",
    prerequisites: [],
    description: "",
    skills: [
      {
        id: "apothecary",
        name: "Apothecary",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["production-skill"],
        prerequisites: [{ pathSkillId: "spell-slot-level-3:divine", minPurchases: 1 }],
        prerequisiteText: "Divine Spell Slot Level 3 x1",
        shortDescription: "Create and identify potions.",
        description: "This skill represents a character’s training in the brewing and identification of potions. A character may begin purchasing ranks in Apothecary so long as they possess at least one Third-Level Divine Spell Slot."
      },
      {
        id: "arcane-arts",
        name: "Arcane Arts",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
        prerequisiteText: "Read & Write",
        shortDescription: "Represents a character’s Arcane Magic training.",
        description: "With this ability, a character is treated as being educated in the basic use of Arcane magic. With it, they may identify and use non-Ritual Arcane scrolls."
      },
      {
        id: "cantrip",
        name: "Cantrip",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["custom-text"],
        customText: true,
        optionChoices: CANTRIP_OPTIONS,
        customTextLabel: "Cantrip Spell",
        customTextPlaceholder: "Choose a Cantrip",
        prerequisites: [
          {
            anyOf: [
              { pathSkillId: "spell-slot-level-1:arcane", minPurchases: 1 },
              { pathSkillId: "spell-slot-level-1:divine", minPurchases: 1 }
            ]
          }
        ],
        prerequisiteText: "Arcane/Divine Spell Slot Level 1 x1",
        shortDescription: "A weak spell with five uses per purchase.",
        description: "A Cantrip is a type of spell that a Mage may cast five times per purchase. Initially, a Mage may select one Cantrip after learning their first Spell Slot of the first level, and may learn new Cantrips every fifth level (1, 6, 11, etc.). Upon their character adding a Cantrip to their character sheet, the player must declare which Spell it will use, and the mage may select any First-Level Spell they may otherwise normally cast for such purposes."
      },
      {
        id: "channel-magic",
        name: "Channel Magic",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [
          {
              anyOf: [
                { tag: "weapon-proficiency", minPurchases: 1 },
                { skillId: "one-handed-blade", minPurchases: 1 },
                { skillId: "two-handed-blade", minPurchases: 1 },
                { skillId: "one-handed-bludgeon", minPurchases: 1 },
                { skillId: "two-handed-bludgeon", minPurchases: 1 },
                { skillId: "unarmed-bludgeon", minPurchases: 1 }
              ]
            },
          {
            anyOf: [
              { pathSkillId: "spell-slot-level-1:arcane", minPurchases: 1 },
              { pathSkillId: "spell-slot-level-1:divine", minPurchases: 1 }
            ]
          }
        ],
        prerequisiteText: "Weapon Proficiency, Arcane/Divine Spell Slot x1",
        shortDescription: "Deliver a spell by touch, through a weapon.",
        description: "With this ability, a character may cast a Spell through their weapon, rather than with a Spell Packet. To do so, the character uses the appropriate Spell Slot for the Spell they wish to use in conjunction with this ability, and strikes the target with their weapon calling, “Channel Strike: <Spell Name>” in place of an incantation or damage call. The use of this skill also consumes the relevant Spell Slot."
      },
      {
        id: "divine-arts",
        name: "Divine Arts",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
        prerequisiteText: "Read & Write",
        shortDescription: "Represents a character’s Divine Magic training.",
        description: "A character with this ability is considered proficient with basic Divine magic, and is capable of identifying and using non-Ritual Divine scrolls."
      },
      {
        id: "spell-slot-level-1",
        name: "Spell Slot Level 1",
        baseCost: 1,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        schoolTracks: true,
        secondaryCostMultiplier: 2,
        tags: [],
        prerequisites: [
          {
            anyOf: [
              { pathSkillId: "arcane-arts", minPurchases: 1 },
              { pathSkillId: "divine-arts", minPurchases: 1 }
            ]
          }
        ],
        prerequisiteText: "Arcane/Divine Arts",
        shortDescription: "Cast any 1st-level Spell from the chosen School.",
        description: ""
      },
      {
        id: "spell-slot-level-2",
        name: "Spell Slot Level 2",
        baseCost: 1,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        schoolTracks: true,
        secondaryCostMultiplier: 2,
        tags: [],
        prerequisites: [{ pathSkillId: "spell-slot-level-1", minPurchases: 3 }],
        prerequisiteText: "Spell Slot Level 1 x3",
        shortDescription: "Cast any 2nd-level Spell from the chosen School.",
        description: ""
      },
      {
        id: "spell-slot-level-3",
        name: "Spell Slot Level 3",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        schoolTracks: true,
        secondaryCostMultiplier: 3,
        tags: [],
        prerequisites: [{ pathSkillId: "spell-slot-level-2", minPurchases: 3 }],
        prerequisiteText: "Spell Slot Level 2 x3",
        shortDescription: "Cast any 3rd-level Spell from the chosen School.",
        description: ""
      },
      {
        id: "spell-slot-level-4",
        name: "Spell Slot Level 4",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        schoolTracks: true,
        secondaryCostMultiplier: 4,
        tags: [],
        prerequisites: [{ pathSkillId: "spell-slot-level-3", minPurchases: 3 }],
        prerequisiteText: "Spell Slot Level 3 x3",
        shortDescription: "Cast any 4th-level Spell from the chosen School.",
        description: ""
      },
      {
        id: "spell-slot-level-5",
        name: "Spell Slot Level 5",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        schoolTracks: true,
        secondaryCostMultiplier: 4,
        tags: [],
        prerequisites: [{ pathSkillId: "spell-slot-level-4", minPurchases: 3 }],
        prerequisiteText: "Spell Slot Level 4 x3",
        shortDescription: "Cast any 5th-level Spell from the chosen School.",
        description: ""
      },
      {
        id: "spell-slot-level-6",
        name: "Spell Slot Level 6",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        schoolTracks: true,
        secondaryCostMultiplier: 5,
        tags: [],
        prerequisites: [{ pathSkillId: "spell-slot-level-5", minPurchases: 3 }],
        prerequisiteText: "Spell Slot Level 5 x3",
        shortDescription: "Cast any 6th-level Spell from the chosen School.",
        description: ""
      },
      {
        id: "spell-slot-level-7",
        name: "Spell Slot Level 7",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        schoolTracks: true,
        secondaryCostMultiplier: 6,
        tags: [],
        prerequisites: [{ pathSkillId: "spell-slot-level-6", minPurchases: 3 }],
        prerequisiteText: "Spell Slot Level 6 x3",
        shortDescription: "Cast any 7th-level Spell from the chosen School.",
        description: ""
      },
      {
        id: "ritual-magic",
        name: "Ritual Magic",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        schoolTracks: true,
        secondaryCostMultiplier: 6,
        tags: [],
        prerequisites: [{ pathSkillId: "spell-slot-level-7", minPurchases: 1 }],
        prerequisiteText: "Spell Slot Level 7 x1",
        shortDescription: "Cast Ritual Spells and use Ritual scrolls.",
        description: "A character may begin purchasing ranks in Ritual Magic after they have obtained at least one Level 7 Spell Slot of either school, but may only build Ritual Magic ranks of the same school. With this skill, a character may identify and make use of Ritual scrolls, and use their Ritual Magic levels to cast Ritual spells."
      },
      {
        id: "nota",
        name: "Nota",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["production-skill", "background"],
        prerequisites: [
          {
            anyOf: [
              { pathSkillId: "spell-slot-level-3:arcane", minPurchases: 1 },
              { pathSkillId: "spell-slot-level-3:divine", minPurchases: 1 }
            ]
          }
        ],
        prerequisiteText: "Arcane/Divine Spell Slot Level 3 x1",
        shortDescription: "Create and identify magical tattoos.",
        description: "This ability allows the character to create, identify, and apply magical tattoos. A character may begin purchasing ranks of the Nota skill so long as they possess at least one Third-Level Spell Slot of either the Arcane or Divine School."
      },
      {
        id: "scribe",
        name: "Scribe",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["production-skill", "background"],
        prerequisites: [
          {
            anyOf: [
              { pathSkillId: "spell-slot-level-3:arcane", minPurchases: 1 },
              { pathSkillId: "spell-slot-level-3:divine", minPurchases: 1 }
            ]
          }
        ],
        prerequisiteText: "Arcane/Divine Spell Slot Level 3 x1",
        shortDescription: "Create magical scrolls.",
        description: "This skill represents a character’s ability to create magical scrolls, and may be purchased by a character with the ability to cast Third-Level Spells."
      },
      {
        id: "spell-barrage",
        name: "Spell Barrage",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [
          {
            anyOf: [
              { pathSkillId: "spell-slot-level-1:arcane", minPurchases: 1 },
              { pathSkillId: "spell-slot-level-1:divine", minPurchases: 1 }
            ]
          }
        ],
        prerequisiteText: "Arcane/Divine Spell Slot x1",
        shortDescription: "Cast a single spell on up to five targets at once.",
        description: "For each purchase of this ability, a character may cast a Spell and make use of five Spell Packets at once in doing so. If multiple Spell Packets strike an individual from the same Spell Barrage, they are only affected once. The use of this ability also uses a Spell Slot. When casting a Spell via Spell Barrage, the standard incantation of the Spell is replaced with “Spell Barrage: <Spell Name>.” Spell Barrage cannot be used with Touch-Cast spells or abilities such as Channel Magic. A character may purchase Spell Barrage for every other character level (I.e. 1, 3, 5, etc.)."
      },
      {
        id: "spell-empowerment",
        name: "Spell Empowerment",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [
          {
            anyOf: [
              { pathSkillId: "spell-slot-level-3:arcane", minPurchases: 1 },
              { pathSkillId: "spell-slot-level-3:divine", minPurchases: 1 }
            ]
          }
        ],
        prerequisiteText: "Arcane/Divine Spell Slot Level 3 x1",
        shortDescription: "Enable damaging spells to bypass magical resistances.",
        description: "For each purchase of this ability, a mage empowers a spell meant to cause damage, allowing it to bypass the protection granted by the likes of Resist Magic and Protection from Magic. This ability may be used once per purchase, and may be purchased so long as the character possesses at least one Level 3 Spell Slot. When casting a spell in this manner, the standard incantation is modified by adding “Empowered” prior to the spell’s name in its incantation. Ex. “With arcane power, I call forth an Empowered Fire Blast!”"
      },
      {
        id: "spell-penetration",
        name: "Spell Penetration",
        baseCost: 1,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [
          {
            anyOf: [
              { pathSkillId: "spell-slot-level-1:arcane", minPurchases: 1 },
              { pathSkillId: "spell-slot-level-1:divine", minPurchases: 1 }
            ]
          }
        ],
        prerequisiteText: "Arcane/Divine Spell Slot x1",
        shortDescription: "Apply the Piercing effect to damage-dealing spells.",
        description: "For each purchase of this ability, a mage empowers a spell meant to cause damage, allowing it to pierce the protection of mundane armor, thereby directly affecting the target’s Hit Points instead. This ability may be used once per purchase. When casting a spell empowered in this manner, the standard incantation is modified by adding “Piercing” prior to the spell’s name in its incantation. Ex. “With arcane power, I call forth a piercing Lightning Bolt!”"
      }
    ]
  },
  {
    id: "monk",
    name: "Monk",
    unlockCost: 4,
    prerequisiteText: "No prerequisite",
    prerequisites: [],
    description: "",
    skills: [
      {
        id: "dexterity",
        name: "Dexterity",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Gain +2 points of armor.",
        description: "For each purchase of Dexterity, a character gains two Armor Points, up to a maximum of 20. Armor Points granted through Dexterity do not stack with those granted by physical armor, when said armor provides more than 10 points of protection. Dexterity-based Armor Points do not require a physical representation. Depleted Armor Points granted by Dexterity may be replenished via one minute of stretching or similar role-play."
      },
      {
        id: "dodge",
        name: "Dodge",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "dexterity", minPurchases: 3 }],
        prerequisiteText: "3x Dexterity",
        shortDescription: "Negate one incoming attack, spell, or poison.",
        description: "With this ability, a character may avoid the effects of an attack by means of weapon, poison, or Spell, once per purchase. Dodge may not be used to protect the character from Area of Effect abilities such as Force Wave, poison gases emitted from traps, or voice-radius spells, and it may not be used to defend against attacks the character is unaware of, such as Mercy Strike. The character must be conscious and capable of using their skills in order to employ this ability, and Dodge may be purchased once for every three purchases of Dexterity. When activating this ability, the player may call, “Dodge” in response to being struck with an otherwise effective attack."
      },
      {
        id: "iron-fist",
        name: "Iron Fist",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "shout-of-spirit", minPurchases: 3 }],
        prerequisiteText: "3x Shout of Spirit",
        shortDescription: "Deal +3 damage with three unarmed attacks.",
        description: "A character with this skill, a character may deal an additional three points of damage with three consecutive unarmed attacks, once per purchase. Iron Fist may be purchased once for every three purchases of Shout of Spirit the character possesses."
      },
      {
        id: "shout-of-spirit",
        name: "Shout of Spirit",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "unarmed", minPurchases: 1 }],
        prerequisiteText: "Unarmed",
        shortDescription: "Deal +1 damage with three unarmed attacks.",
        description: "This skill allows a character to deal an additional point of damage with three consecutive unarmed attacks."
      },
      {
        id: "stunning-blow",
        name: "Stunning Blow",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "unarmed", minPurchases: 1 }],
        prerequisiteText: "Unarmed",
        shortDescription: "Apply the Stun effect to one unarmed strike.",
        description: "With this skill, the character may impart the Stun effect to one unarmed attack once per purchase, by adding the call, “Stunning” to the beginning of their damage call."
      },
      {
        id: "style-master",
        name: "Style Master",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "iron-fist", minPurchases: 3 }],
        prerequisiteText: "3x Iron Fist, 5x Character Levels",
        shortDescription: "Deal +2 damage with all unarmed attacks.",
        description: "With this skill, a Monk may deal two additional points of damage with their fists at all times. This skill may be purchased once for every three purchases of Iron Fist the character possesses, in addition to every five character levels (I.e.5, 10, 15, etc.). Style Master may be purchased up to three times, and its effects do not stack with other melee damage enhancement skills such as Strength."
      },
      {
        id: "unarmed",
        name: "Unarmed",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: ["weapon-proficiency", "bludgeon"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use combat abilities while unarmed.",
        description: "The Unarmed skill represents a character’s training and proficiency in fighting without a weapon. Monks may block incoming physical attacks with their forearms, if they make an obvious effort to do so. Though a player must wear padded sparring gloves which must be approved of on a case-by-case basis, the character’s hands are simply wrapped, bare, or treated as utilizing simple equipment such as small metal bands worn to reinforce and protect the fighter’s knuckles and provide a harder striking surface. Unless otherwise utilizing enchantments or special modifications for these wraps and weapons, no Item Tag is necessary for a Monk’s gloves, and should a tagged set of such gloves be destroyed, the Monk may continue to use their fists to deal Normal damage."
      }
    ]
  },
  {
    id: "paladin",
    name: "Paladin",
    unlockCost: 4,
    prerequisiteText: "No prerequisite",
    prerequisites: [],
    description: "",
    skills: [
      {
        id: "alignment",
        name: "Alignment",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        alignmentTracks: true,
        tags: [],
        prerequisites: [],
        prerequisiteText: "1x at Level 1, +1 every 5 levels",
        shortDescription: "Attune to positive or negative energies.",
        description: "Purchasing an alignment—be it positive or negative—represents the character’s moral compass and attunement to the energies often called upon by Divine spell-casters, offering the Paladin opportunities to utilize spell-like abilities to grant themselves versatility on the battlefield. Upon purchasing an Alignment, the character must declare whether it is of a positive or negative nature, and Alignments may be purchased initially at First Level, and for every five levels thereafter (I.e. 1, 6, 11, etc.)."
      },
      {
        id: "evil-eye",
        name: "Evil Eye",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "alignment:negative", minPurchases: 2 }],
        prerequisiteText: "Alignment (Negative) x2, 5x Character Levels",
        shortDescription: "Silence those within earshot.",
        description: "For each purchase of this ability, the Paladin may inflict the Silence effect upon all within earshot, calling, “Voice-radius: Silence” in a firm, speaking tone. This form of Evil Eye may be purchased so long as the character has selected two negative Alignments, and once for every five character levels. Alternatively, if the Paladin has taken a positive Alignment in the same degree, they may impart the effects of the Restore spell via touch, and simply stating the name of the effect, “Restore.”"
      },
      {
        id: "glory-kill",
        name: "Glory Kill",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "10x Character Levels",
        shortDescription: "Cause Fear following a Coup de Grace.",
        description: "This skill may be purchased once for every 10 levels the character gains. After purchasing Glory Kill, a successful Coup de Grace causes the character’s next weapon attack to carry the Fear effect, allowing them to add “Cause Fear” to the beginning of their damage call. A second purchase of this ability imparts this effect to two attacks following a Coup de Grace."
      },
      {
        id: "grand-bounty",
        name: "Grand Bounty",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "alignment:positive", minPurchases: 2 }],
        prerequisiteText: "Alignment (Positive) x2, 5x Character Levels",
        shortDescription: "Deliver a Cure Wounds spell to those within earshot.",
        description: "Purchasable by a Paladin with two positive Alignments and once for every five character levels, this skill allows the Paladin to cast a voice-radius: Cure Wounds spell by calling out, “Voice-radius: Cure Wounds.” Alternatively, a Paladin with a negative Alignment may utilize a Cause Wounds spell in the same form, and adjust the necessary call to match."
      },
      {
        id: "healing-touch",
        name: "Healing Touch",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "alignment:positive", minPurchases: 1 }],
        prerequisiteText: "Alignment (Positive) x1",
        shortDescription: "Deliver a Cure Wounds spell via touch.",
        description: "Once per purchase of this ability, a Paladin with a positive Alignment may deliver a Cure Wounds spell via touch. Doing so requires no incantation, and is cast simply by stating the name of the effect. Alternatively, a Paladin with a negative alignment may use this ability to deliver Cause Wounds spells instead."
      },
      {
        id: "miracle",
        name: "Miracle",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "alignment:positive", minPurchases: 2 }],
        prerequisiteText: "Alignment (Positive) x2",
        shortDescription: "Utilize the Revive spell.",
        description: "This ability allows the a Paladin with a positive Alignment to revive a slain creature once per purchase, without the need for Divine magic or Seventh-Level Spell Slots. Due to the intense magical energy necessary to use this ability however, Obern and Rune Knights are incapable of utilizing it. Miracle may be purchased twice. This effect is delivered via touch, and its incantation is, “By my will, I Revive you.”"
      },
      {
        id: "purge-impurity",
        name: "Purge Impurity",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Remove diseases and other negative effects.",
        description: "Once per purchase of this skill, the Paladin may remove diseases, intoxication, and mind-affecting status effects such as Charm, Idiocy, Insanity, Mindwipe, and Silence from themselves and others; though the Paladin must first tend to their own affliction should they be influenced by effects which would normally render their skills useless, themselves. Similarly, this ability may be utilized to neutralize the effects of Nerve Gas and Sleep. Like other skills, the Paladin must be conscious to make use of this ability. This spell-like effect is delivered via touch and is accompanied by the phrase, “By my will, I Purge Impurity.”"
      },
      {
        id: "rallying-cry",
        name: "Rallying Cry",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "5x Character Levels",
        shortDescription: "Remove Fear from those within earshot.",
        description: "With this skill, the character may issue a call of “Voice-radius: Remove Fear” in a firm, speaking tone, effectively removing the effects of Fear from those within earshot. This skill may be used once per purchase, and may be purchased once for every five levels the character possesses."
      },
      {
        id: "rot-armor",
        name: "Rot Armor",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "alignment:negative", minPurchases: 1 }],
        prerequisiteText: "Alignment (Negative) x1",
        shortDescription: "Deteriorate physical armor by 10 points.",
        description: "Once per purchase of this skill, a Paladin with a negative Alignment may issue a Spell Packet-based attack, effectively causing 10 points of damage to their target’s armor with the phrase, “By my will, I corrode your armor.” A Paladin with a positive Alignment however, may repair 10 points of armor using the phrase, “By my will, I mend your armor.”"
      },
      {
        id: "rot-soul",
        name: "Rot Soul",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "alignment:negative", minPurchases: 2 }],
        prerequisiteText: "Alignment (Negative) x2",
        shortDescription: "Utilize the Cause Death spell.",
        description: "With this skill, a Paladin with two negative Alignments may deliver a Spell Packet-based Cause Death spell with the incantation, “By my will, I Cause Death.”"
      },
      {
        id: "shatter-oppression",
        name: "Shatter Oppression",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "alignment:positive", minPurchases: 1 }],
        prerequisiteText: "Alignment (Positive) x1",
        shortDescription: "Remove movement-impairing effects via touch.",
        description: "A Paladin with a positive Alignment may use this skill once per purchase to free themselves or others from magical bindings and other movement-impairing effects including Entangle, Hold, and Web. To do so, they may utilize a Spell Packet and recite the incantation, “By my will, I Release you.”"
      },
      {
        id: "shield-of-contempt",
        name: "Shield of Contempt",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "alignment:negative", minPurchases: 1 }],
        prerequisiteText: "Alignment (Negative) x1",
        shortDescription: "Reflect an effect that would normally be Resisted.",
        description: "With this ability, a Paladin with one negative Alignment may call “Reflect” once per purchase, in place of otherwise using a Resist skill, including Resist Charm, Resist Magic, Resist Poison, and Resist Sleep. The use of this skill consumes both it, as well as the converted Resist ability, and it may only be utilized once for a given effect. Example: Thoril uses Shield of Contempt to convert his Resist Magic into a Reflect Magic to reflect a Cause Death spell back at the Mage who had initially cast it. The Mage then reflects the spell back to Thoril, who may not use a second Shield of Contempt to reflect it back once more, and must instead resort to expending a normal Resist Magic ability."
      },
      {
        id: "shield-of-faith",
        name: "Shield of Faith",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Utilize the spells Divine Armor or Shield.",
        description: "Once per purchase of this skill, a Paladin may grant themselves or another the effects of the Divine Armor or Shield Spells. Doing so does not require the use of Divine magic or Spell Slots, and requires only that the Paladin touch their target and recite the incantation, “By my will, I grant you <Divine Armor/a Shield.>”"
      }
    ]
  },
  {
    id: "ranger",
    name: "Ranger",
    unlockCost: 4,
    prerequisiteText: "No prerequisite",
    prerequisites: [],
    description: "",
    skills: [
      {
        id: "archery",
        name: "Archery",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: ["weapon-proficiency"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use abilities while wielding Archery weapons.",
        description: "A character with this skill is considered welltrained and proficient with all manner of archery weapons, including bows, crossbows, and slingshots."
      },
      {
        id: "crippling-shot",
        name: "Crippling Shot",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "archery", minPurchases: 1 }],
        prerequisiteText: "Archery",
        shortDescription: "Apply the Crippling effect to one shot.",
        description: "Once per purchase of this ability, the Ranger may add the “Crippling” modifier to the beginning of their damage call when attacking with a bow, crossbow, or slingshot, and inflict the Crippled effect upon their target."
      },
      {
        id: "daze",
        name: "Daze",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "archery", minPurchases: 1 }],
        prerequisiteText: "Archery",
        shortDescription: "Apply the Stun effect to one shot.",
        description: "With this ability, a character may add the Stun modifier to the beginning of their damage call when attacking with an Archery weapon, effectively allowing them to inflict the Stun effect upon their target once per purchase."
      },
      {
        id: "expand-quiver",
        name: "Expand Quiver",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "archery", minPurchases: 1 }],
        prerequisiteText: "Archery",
        shortDescription: "Improve a quiver’s ammunition capacity.",
        description: "This skill allows a character the ability to contain an additional 10 units of ammunition in any quiver they possess, up to a maximum of 30. Initially, quivers may hold up to 10 projectiles."
      },
      {
        id: "exploit-weakness",
        name: "Exploit Weakness",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "overdraw", minPurchases: 3 }],
        prerequisiteText: "3x Overdraw",
        shortDescription: "Deal +3 damage for three attacks with an Archery weapon.",
        description: "For every three purchases of Overdraw a character possesses, they may purchase Exploit Weakness once. With it, they may deal an additional three points of damage with three consecutive shots from an archery weapon, once per purchase."
      },
      {
        id: "fletcher",
        name: "Fletcher",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["production-skill"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Produce bows, crossbows, slingshots, and their ammunition.",
        description: "With this ability, a Ranger may produce bows, crossbows, slingshots, and their respective ammunitions."
      },
      {
        id: "hunter-of-x",
        name: "Hunter of (X)",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["custom-text"],
        customText: true,
        customTextLabel: "Hunted Creature Type",
        customTextPlaceholder: "Example: Undead, Beasts, Demons",
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Deal +1 damage against a specific type of creature.",
        description: "This skill represents a character’s knowledge regarding a specific creature’s weaknesses (E.g. Bears, Zombies, Humans, etc.). With it, they may dean an additional point of damage against the specified creature, per purchase. Hunter of (X) may be purchased up to three times for a given creature type, and the creature must be specified at the time of purchase."
      },
      {
        id: "overdraw",
        name: "Overdraw",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "archery", minPurchases: 1 }],
        prerequisiteText: "Archery",
        shortDescription: "Deal +1 damage for three attacks with an Archery weapon.",
        description: "For each purchase of Overdraw, a character may deal an additional point of damage with Archery weapons for three consecutive attacks, once per purchase."
      },
      {
        id: "pinning-shot",
        name: "Pinning Shot",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "crippling-shot", minPurchases: 1 }],
        prerequisiteText: "1x Crippling Shot",
        shortDescription: "Apply the Pin effect to one shot.",
        description: "For each purchase of Crippling Shot, Pinning Shot may be purchased once. With it, the character may use it to apply the “Pinning” modifier to the start of their damage call when attacking with an Archery weapon, and inflict the Pin effect upon their target once per purchase."
      },
      {
        id: "recover-arrows",
        name: "Recover Arrows",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "archery", minPurchases: 1 }],
        prerequisiteText: "Archery",
        shortDescription: "Recover & reuse half a spent quiver’s ammunition.",
        description: "A character with this ability may recover and reuse half of their spent Archery ammunition, rounded down."
      },
      {
        id: "sharp-eye",
        name: "Sharp Eye",
        baseCost: 6,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "exploit-weakness", minPurchases: 3 }],
        prerequisiteText: "3x Exploit Weakness, 5x Character Levels",
        shortDescription: "Deal +1 damage with Archery weapons.",
        description: "A character with this skill may deal an additional point of damage with the Archery weapons they are proficient with, once per purchase. Sharp Eye may be purchased once for every three purchases of Exploit Weakness, and every five character levels (I.E. 5, 10, 15, etc.) up to three times."
      },
      {
        id: "tracking",
        name: "Tracking",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Attempt to track a target.",
        description: "This ability represents a character’s ability to track another creature but does not guarantee success. More ranks indicate better skill and chances, though. 25"
      }
    ]
  },
  {
    id: "rogue",
    name: "Rogue",
    unlockCost: 3,
    prerequisiteText: "No prerequisite",
    prerequisites: [],
    description: "",
    skills: [
      {
        id: "alchemy",
        name: "Alchemy",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["production-skill"],
        prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
        prerequisiteText: "Read & Write",
        shortDescription: "Create and identify alchemical substances.",
        description: "A character with this skill may create, identify, and mix poisons and other alchemical substances into food and drink."
      },
      {
        id: "fatal-blow",
        name: "Fatal Blow",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "sneak-attack", minPurchases: 3 }],
        prerequisiteText: "3x Sneak Attack",
        shortDescription: "Deal +5 damage from behind a foe for three attacks.",
        description: "Once for each purchase of this skill, a Rogue may issue three consecutive attacks from behind their target, dealing an additional five damage while doing so. For every three purchases of Sneak Attack, the character may purchase Fatal Blow once."
      },
      {
        id: "mercy-strike",
        name: "Mercy Strike",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Render a target unconscious.",
        description: "Once per purchase, the character may strike a target from behind and render them unconscious. The call for this attack is, “Mercy Strike,” and is considered Out-of-Game. Mercy Strike may only be performed with melee and blunt thrown weapons with which the character is proficient. Note: This ability renders the target unconscious for one minute, but does not reduce their Hit Points or place the character into the Unconscious state; rather, after the duration passes, the target awakens with the same Hit Point total as they had when they were attacked, unless they otherwise receive damage within this time frame."
      },
      {
        id: "pickpocket",
        name: "Pickpocket",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Attempt to steal items off a target’s person.",
        description: "With this ability, the character may attempt to plant items or steal directly from another person’s pocket or pouch, but success is not guaranteed. To pick a pocket, the player must attach a clothespin to the desired pocket or pouch, and contact a Thief GM to recover the stolen items from their target. The thief may advise the Thief GM if they are attempting to take a specific kind of item— such as potions or coins—but the items taken are randomized at the discretion of the Thief GM."
      },
      {
        id: "pick-locks",
        name: "Pick Locks",
        baseCost: 6,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Attempt to pick locks.",
        description: "A character with this skill possesses the ability to attempt to pick a lock, but they are not guaranteed success in doing so. Players are expected to provide their own lock picks. However, in the event that such tools are restricted by law in the real world, players must possess representations of similar tools, while the Event Staff and those players who wish to utilize locks must provide an alternative method for bypassing them."
      },
      {
        id: "piercing-strike",
        name: "Piercing Strike",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ skillId: "small-weapon", minPurchases: 1 }],
        prerequisiteText: "Small Weapons, 1x Character Level",
        shortDescription: "Deal Piercing damage with a dagger.",
        description: "Once per purchase, this ability allows the character to issue a melee attack with a dagger, using the Piercing damage modifier. This skill may be purchased once per character level. When using this ability, the player may add “Piercing” to the start of their damage call."
      },
      {
        id: "sneak-attack",
        name: "Sneak Attack",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Deal +1 damage from behind a foe for three attacks.",
        description: "With this skill, a character may deal an additional point of damage while striking their target from behind with a weapon they are proficient with, for three consecutive attacks, once per purchase."
      },
      {
        id: "thrown-weapon",
        name: "Thrown Weapon",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: ["weapon-proficiency"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use combat abilities while wielding thrown weapons.",
        description: "This ability represents a character’s training and proficiency in the use of thrown weapons, such as shuriken, javelins, and throwing knives, axes, and rocks."
      },
      {
        id: "trapper",
        name: "Trapper",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["production-skill"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Create and arm traps.",
        description: "A character with this skill may produce various forms of traps. In addition, characters with this ability may set and arm--as well as rearm--traps they possess or those which they come across. All characters may attempt to disarm traps, regardless of their skills."
      }
    ]
  },
  {
    id: "technician",
    name: "Technician",
    unlockCost: 4,
    prerequisiteText: "No prerequisite",
    prerequisites: [],
    description: "",
    skills: [
      {
        id: "dismantle",
        name: "Dismantle",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Break items down for material components.",
        description: "A Technician with this ability may dismantle items with one minute of role-play, once per purchase. In doing so, the object will be destroyed, but will grant the Technician a number of supplies associated with the item’s necessary Production Skill and production level. These supplies may then be used as crafting materials to aid in the production process."
      },
      {
        id: "druggist",
        name: "Druggist",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["production-skill"],
        prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
        prerequisiteText: "Read & Write",
        shortDescription: "Produce and identify salves and salts.",
        description: "A character with this ability may create and identify salves and salts."
      },
      {
        id: "firearms",
        name: "Firearms",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: ["weapon-proficiency"],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Use combat abilities while wielding firearms.",
        description: "This ability represents a character’s training and proficiency with pistols and rifles. These weapons are represented by foam dart blasters with magazine capacities of no more than six rounds, or cylinders with capacities of no more than eight rounds.. Guns must be modified to meet the aesthetic standards of the LARP. Shotguns and similar weapons that launch multiple projectiles at once may only be loaded with six projectiles at a given time, and targets struck by multiple projectiles from the same shot receive damage as though they were only shot by one. The same standard applies to Grenades, which take the form of throwable, spring-loaded devices capable of flinging foam darts or balls."
      },
      {
        id: "gunsmith",
        name: "Gunsmith",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: ["production-skill"],
        prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
        prerequisiteText: "Read & Write",
        shortDescription: "Produce pistols, rifles, and their ammunition.",
        description: "Technicians with this ability may produce pistols, rifles, and bullets."
      },
      {
        id: "precise-shot",
        name: "Precise Shot",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "firearms", minPurchases: 1 }],
        prerequisiteText: "Firearms",
        shortDescription: "Deal an additional point of damage with three shots.",
        description: "Once per purchase of this skill, the Technician may deal an additional point of damage with three consecutive attacks with a firearm."
      },
      {
        id: "repair",
        name: "Repair",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ skillId: "read--write", minPurchases: 1 }],
        prerequisiteText: "Read & Write",
        shortDescription: "Repair a broken item.",
        description: "With one minute of role-play, the Technician may repair a broken weapon or set of armor once per purchase. Items repaired in this manner lose any previously-applied magical effects and enchantments."
      }
    ]
  }
];

// ============================================================
// CLASS DATA
// ============================================================
let classes = [
  {
    id: "assassin",
    name: "Assassin",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Monk Path, Rogue Path",
    prerequisites: [
        { pathId: "monk" },
      { pathId: "rogue" }
    ],
    description: "",
    skills: [
      {
        id: "assassins-strike",
        name: "Assassin’s Strike",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "fatal-blow", minPurchases: 3 }],
        prerequisiteText: "3x Fatal Blow, 5x Character Level",
        shortDescription: "Deal +2 damage with all Small Weapons.",
        description: "Representing the character’s advanced training with Small Weapons, Assassin’s Strike grants an additional two points of damage dealt with all Small Weapons. This skill may be purchased up to three times, and may be purchased once for every three purchases of Fatal Blow and five character levels (I.E. 5, 10, 15) the character possesses. This skill may be used while unarmed, but does not stack with the effects of Style Master."
      },
      {
        id: "shadow-arts",
        name: "Shadow Arts",
        baseCost: 3,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Represents a character’s specialized training in stealth and infiltration.",
        description: "Clans of Assassins closely guard their knowledge of techniques and alchemical recipes. A character with this skill is considered to have gained access to this knowledge."
      },
      {
        id: "shadow-dance",
        name: "Shadow Dance",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "shadow-arts", minPurchases: 1 }],
        prerequisiteText: "Shadow Arts",
        shortDescription: "Teleport from shadow to shadow.",
        description: "Once per purchase, the Assassin may meld into the shadows and move about while Out-of-Game for up to 30 seconds. During this time, they may talk, interact with objects, and may be affected by Area of Effect effects, but they may not attack or be subjected to attacks, themselves. Should the max duration be met or exceeded, the Assassin suffers from Shadow Sickness until the next Renewing Winds. Note as well, that Shadow Dance may not be activated while the Assassin or any of their equipment remains under the effects of the Light spell."
      },
      {
        id: "shadow-step",
        name: "Shadow Step",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "shadow-arts", minPurchases: 1 }],
        prerequisiteText: "Shadow Arts",
        shortDescription: "Pass through magical barriers.",
        description: "With three seconds of role-play, an Assassin may pass through a magical barrier once per purchase. One use of this skill allows the character to pass one-way through a Wall of Force or similar barrier."
      },
      {
        id: "silent-knife",
        name: "Silent Knife",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [
          { classSkillId: "shadow-arts", minPurchases: 1 },
          { pathSkillId: "fatal-blow", minPurchases: 1 }
        ],
        prerequisiteText: "Shadow Arts, 1x Fatal Blow",
        shortDescription: "Instantly kills the target.",
        description: "With this skill, a character may mortally wound their target with a single blow from behind; causing their target to immediately enter the Dead state. The call to activate this skill is, “<Damage Type> Silent Knife,” and is Out-of-Game. Silent Knife may be purchased once for each purchase of Fatal Blow. This skill bypasses the protection of Divine Armor, and may only be defended against by means of Evasive Maneuver."
      },
      {
        id: "smoke-bomb",
        name: "Smoke Bomb",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [
          { classSkillId: "shadow-arts", minPurchases: 1 },
          { pathSkillId: "alchemy", minPurchases: 3 }
        ],
        prerequisiteText: "Shadow Arts, 3x Alchemy",
        shortDescription: "Produce Smoke Bombs.",
        description: "A Smoke Bomb is an alchemically-crafted item that blinds anyone nearby when it is thrown to the ground. To use a Smoke Bomb, the user throws a green Spell Packet to the ground and calls, “Smoke Bomb” in a firm speaking voice, causing anyone who hears the call to suffer the Blinded effect for five seconds."
      }
    ]
  },
  {
    id: "bard",
    name: "Bard",
    unlockCost: 5,
    requiredLevel: 10,
    prerequisiteText: "Mage Path, 5x Trade Skill: Performer",
    prerequisites: [
        { pathId: "mage"},
        { skillId: "trade-skill-x:performer", minPurchases: 5}
        ],
    description: "",
    skills: [
      {
        id: "aria-of-restoration",
        name: "Aria of Restoration",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "divine-arts", minPurchases: 1 }],
        prerequisiteText: "Divine Arts",
        shortDescription: "Acts as the spell, Restore.",
        description: "After spending at least one minute performing, the Bard’s audience is granted the effects of the Restore spell. At the beginning of the performance, the Bard must first announce the name of this ability to the audience."
      },
      {
        id: "ballad-of-the-magus",
        name: "Ballad of the Magus",
        baseCost: 6,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "arcane-arts", minPurchases: 1 }],
        prerequisiteText: "Arcane Arts",
        shortDescription: "Restores spent Spell Slots.",
        description: "After announcing the name of this ability to the audience, the Bard may perform, restoring one spent Spell Slot per minute. Spell Slots restored in this way are replenished from lowest to highest level, and only spells of levels one through four are affected. This ability does not grant additional Spell Slots. Example: Terry has spent three First-Level, and two Second-Level Spell Slots. His First-Level Spell Slots will all be replenished before his Second-Level Spell Slots will be affected."
      },
      {
        id: "battle-hymn",
        name: "Battle Hymn",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Gain proficiency with wielded weapons.",
        description: "Once per purchase, the Bard may sing or hum a tune, and grant themselves proficiency with whatever weapon or shield they wield for the duration of the song. While under the effects of Battle Hymn, the Bard may also add the Piercing or Crushing damage modifiers to their damage call for three attacks, if they are wielding a bladed or bludgeoning weapon respectively."
      },
      {
        id: "hymn-of-the-goddess",
        name: "Hymn of the Goddess",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "divine-arts", minPurchases: 1 }],
        prerequisiteText: "Divine Arts",
        shortDescription: "Heal audience members.",
        description: "To begin using this skill, the Bard must announce its name to the audience. During the performance, members of the audience are healed for one Hit Point per minute."
      },
      {
        id: "song-of-rejuvenation",
        name: "Song of Rejuvenation",
        baseCost: 8,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Restores expendable skills.",
        description: "With at least one minute of performance, the Bard’s song restores one spent skill for each member of their audience, for each minute the performance lasts. The skills refreshed in this manner are renewed in the order of the audience member’s choice, and this effect does not affect Spell Slots. To begin this performance, the Bard must first announce the name of the ability. Note however, that this ability may not be used to replenish the Bardic abilities of other Bards, nor of the Bard performing the Song of Rejuvenation."
      },
      {
        id: "song-of-valor",
        name: "Song of Valor",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Grants immunity to Fear effects.",
        description: "To begin, the Bard must announce the name of the ability before their performance. After at least one minute of performance, the audience is granted immunity to the next Fear effect they may receive."
      }
    ]
  },
  {
    id: "bone-guard",
    name: "Bone Guard",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Fighter Path, 5x Vitality",
    prerequisites: [
        { pathId: "fighter" },
      { skillId: "vitality", minPurchases: 5 }
    ],
    description: "",
    skills: [
      {
        id: "blood-strike",
        name: "Blood Strike",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "siphon-strike", minPurchases: 1 }],
        prerequisiteText: "1x Siphon Strike",
        shortDescription: "Deal +3 damage by inflicting 3 points of damage to self.",
        description: "For each purchase of Siphon Strike, the Bone Guard may purchase Blood Strike once. With this skill, they may deal an additional three points of damage with one blow. However, in order to use this ability, the Bone Guard must rake their weapon across their body, dealing three points of damage to themselves which cannot be mitigated by any means such as Adrenaline, Divine Armor, or the protection of armor. Blood Strike may be used once per purchase."
      },
      {
        id: "harvest",
        name: "Harvest",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "blood-strike", minPurchases: 1 }],
        prerequisiteText: "1x Blood Strike",
        shortDescription: "Consume a helpless target to recover from injuries.",
        description: "Once per purchase, Harvest enables the Bone Guard to consume the life force of any helpless creature within reach, fully healing any sustained injuries in the process, while serving as a Coup de Grace to the target. This skill may be used once per purchase, and requires at least three seconds of role-play to complete; along with the call, “Coup de Grace: Harvest.” Harvest may be purchased once for each purchase of Blood Strike."
      },
      {
        id: "siphon-strike",
        name: "Siphon Strike",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Recover HP equal to weapon base damage.",
        description: "With this ability, the Bone Guard may use the blood they draw from their opponents to heal their own wounds, once per purchase. However, the amount of Hit Points recovered may only equal their weapon’s base damage value."
      },
      {
        id: "sown-silence",
        name: "Sown Silence",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Inflicts Silence as a Channel Strike effect.",
        description: "With this ability, the Bone Guard may inflict the Silence effect upon their target by striking them with their weapon and calling, “Channel Strike: Silence.” Sown Silence may be used once per purchase."
      },
      {
        id: "undying",
        name: "Undying",
        baseCost: 8,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "harvest", minPurchases: 1 }],
        prerequisiteText: "1x Harvest",
        shortDescription: "Temporarily remain conscious and under the Insanity effect when normally Unconscious.",
        description: "Channeling the necromantic powers of their Master, the Bone Guard may ignore pain and their impending death with the hopes of killing those that bested them. To use this ability, one must call, “Undying” once they have been reduced to the Dying state. Once activated, the Bone Guard is affected by Insanity and will continue to fight for one minute. During this period, they may not use their skills or speak; instead only issuing bloodthirsty roars. At the end of this ability’s duration, the character immediately enters the Dead state, regardless of any healing they may be received during the use of this ability. Undying may be purchased once for each purchase of Harvest, and may be used once per purchase."
      }
    ]
  },
  {
    id: "chirurgeon",
    name: "Chirurgeon",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Artisan Path, 3x Scholar of Medicine",
    prerequisites: [
      { pathId: "artisan" },
      { skillId: "scholar-of-x:medicine", minPurchases: 3 }
    ],
    description: "",
    skills: [
      {
        id: "diagnose",
        name: "Diagnose",
        baseCost: 3,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ skillId: "first-aid", minPurchases: 1 }],
        prerequisiteText: "First Aid",
        shortDescription: "Identify the disease(s) afflicting the target.",
        description: "This skill grants the Chirurgeon the ability to effectively determine the disease(s) afflicting their patient,the disease’s temperament, and determine an appropriate means of treatment. To use this ability, the player must be within arm’s reach of their target, spend 60 seconds role-playing their examination, and state, “Diagnosing,” to which their target then may reply with the name of the disease(s) they may be suffering from."
      },
      {
        id: "pharmacology",
        name: "Pharmacology",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "druggist", minPurchases: 3 }],
        prerequisiteText: "Druggist (3)",
        shortDescription: "Produce medicines and equipment for treating various malaise.",
        description: "By purchasing this ability, the Chirurgeon may access advanced Druggist recipes, allowing them to produce surgical tools, sutures, medicines, and contaminants. Refer to Table 5-5a."
      },
      {
        id: "research",
        name: "Research",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "surgery", minPurchases: 1 }],
        prerequisiteText: "Surgery",
        shortDescription: "Enhance vaccine and contaminant production.",
        description: "Once per purchase, this skill allows the Chirurgeon to expend one infected tissue or fluid Specimen and five minutes of role-play examining and researching its properties. Once finished, they may then produce one additional dose of a Vaccine or Contaminant. This effect may be combined with the effects of Innovation."
      },
      {
        id: "surgery",
        name: "Surgery",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "diagnose", minPurchases: 1 }],
        prerequisiteText: "Diagnose",
        shortDescription: "Perform surgeries to treat ailments and diseases.",
        description: "Each purchase of this ability grants the Chirurgeon access to a new level of procedures they may perform, allowing them to offer alternative treatments that risk side effects, to treat a variety of ailments. Surgeries require five minutes of role-play per level to perform. Refer to Table 5-5b. Additionally, a character with at least one level of this ability may tend wounds with sutures at a rate of two Hit Points per five seconds spent, healing up to 10 Hit Points with one Suture."
      }
    ]
  },
  {
    id: "commander",
    name: "Commander",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Fighter Path, Teach",
    prerequisites: [
      { skillId: "teach", minPurchases: 1 },
      { pathId: "fighter" }
    ],
    description: "",
    skills: [
      {
        id: "drill-instructor",
        name: "Drill Instructor",
        baseCost: 6,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ skillId: "teach", minPurchases: 1 }],
        prerequisiteText: "Teach",
        shortDescription: "Teach skills to the Unit.",
        description: "All Unit members may be taught skills by the Commander as per the Teach skill, simultaneously. Characters must be in the Commander’s Unit during all training in a given skill to receive the benefits of being taught in this manner, and the Commander may not teach skills to characters outside of their Unit while using this skill. Similarly, the Commander may not learn skills via Teach while utilizing this skill."
      },
      {
        id: "formation-tactics",
        name: "Formation Tactics",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ skillId: "resist-magic", minPurchases: 2 }],
        prerequisiteText: "Resist Magic x2",
        shortDescription: "Unit members may resist effects for one another.",
        description: "Thanks to this ability, Unit members may use their resistance skills for others within their Unit thanks to the Commander having this skill. To do so, they must make contact with their intended target an issue the call, “Resist!” Formation Tactics may be purchased so long as the character has purchased Resist Magic Twice."
      },
      {
        id: "hardened-veteran",
        name: "Hardened Veteran",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ skillId: "vitality", minPurchases: 1 }],
        prerequisiteText: "1x Vitality",
        shortDescription: "Gain a temporary Hit Point.",
        description: "Each purchase of this skill grants all Unit members one additional Hit Point which does not count toward the character’s maximum Hit Point limit. Hardened Veteran may be purchased up to 10 times, and may be purchased once for each purchase of Vitality."
      },
      {
        id: "leadership",
        name: "Leadership",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Gain a Unit Token",
        description: "The Commander acquires a token of their choosing, such as a band, necklace, hat, surcoat, or an actual token, which may be given to another character after five minutes of role-played inspection or instruction. A player who is given a token in this manner is considered part of the Commander’s Unit, and may benefit from Unit effects and skills so long as they are within earshot or line of sight to their Commander, and the Commander is conscious and capable of using their skills. A Commander is always considered to be a member of their own unit, unless they are a member of the Unit of another Commander, in which case they and the troops in their Unit take on the superior Commander’s Unit’s benefits. A Unit may consist of a total of five members, including the Commander."
      },
      {
        id: "standard-bearer",
        name: "Standard Bearer",
        baseCost: 4,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "leadership", minPurchases: 4 }],
        prerequisiteText: "Leadership x4",
        shortDescription: "Standard becomes the new focus for the Unit.",
        description: "With this ability, the Commander no longer serves as the Unit’s source of inspiration; allowing a banner or standard atop a 7’ pole and bearing the Unit’s emblem to serve as the Unit’s focus so long as it is within line of sight and carried by a conscious member of the Unit."
      },
      {
        id: "weapon-doctrine",
        name: "Weapon Doctrine",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Gain +1 damage with the chosen weapon type.",
        description: "This ability grants the Commander to issue a series of orders, effectively granting Unit members the ability to deal an additional point of damage with the chosen weapon type so long as they are proficient with such a weapon, per purchase of this skill. Only one weapon type may be selected and active at a given time, and one minute of role-play is required to change active doctrines. The Commander must be proficient with the appropriate weapon for each type of doctrine chosen, and Weapon Doctrine may be purchased twice for each weapon type. Weapon types include Melee, Archery, or Firearms."
      }
    ]
  },
  {
    id: "conduit",
    name: "Conduit",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "1x Arcane Ritual Magic",
    prerequisites: [{ pathSkillId: "ritual-magic:arcane", minPurchases: 1 }],
    description: "",
    skills: [
      {
        id: "arcane-affinity",
        name: "Arcane Affinity",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Cast spells without reciting incantations.",
        description: "With each purchase of this ability, the Conduit becomes more familiar with Arcane spells of the level equal to the number of purchases made. In doing so, they remove the necessity to rely on spell books and incantations. To cast spells affected by Arcane Affinity, the Conduit states the spell’s name and casts a Spell Packet. This call is considered Out-of-Game, but may be accompanied by In-Game phrases, such as, “Snowball fight! Ice Missile!” Example: Mordecai purchases Arcane Affinity twice. He may cast any Arcane spell of the first or second spell level without using incantations or having his spell book on his person. He may not however, do so for spells of higher levels."
      },
      {
        id: "elemental-blade",
        name: "Elemental Blade",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Summon a temporary blade of elemental energy.",
        description: "An Elemental Blade is a weapon formed by manifesting the energies of a chosen element. Following 10 seconds of role-play, the Conduit may deal two points of damage in the form of the chosen element with a sword-sized weapon with a red striking surface. When the weapon leaves the grasp of the Conduit or they are rendered Unconscious, the Elemental Blade disperses. This skill may be used once per purchase."
      },
      {
        id: "elemental-burst",
        name: "Elemental Burst",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [
          { pathSkillId: "spell-barrage", minPurchases: 2 },
          { classSkillId: "arcane-affinity", minPurchases: 1 }
        ],
        prerequisiteText: "2x Spell Barrage, 1x Arcane Affinity",
        shortDescription: "Deal elemental damage to all within earshot.",
        description: "With this ability, the Conduit may issue a blast of elemental energy in the form of the call, “Voice-radius: <Spell Name>,” affecting all within earshot with its effects. Only element-based spells may be used with Elemental Burst, and the use of this ability also expends the respective Spell Slot of the spell used. The call for this ability is to be given in a firm speaking voice, and is considered Out-of-Game. Elemental Burst may be purchased once for every two purchases of Spell Barrage and one purchase of Arcane Affinity. Elemental Burst may be used once per purchase."
      },
      {
        id: "elemental-pool",
        name: "Elemental Pool",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "arcane-affinity", minPurchases: 1 }],
        prerequisiteText: "1x Arcane Affinity",
        shortDescription: "Create a pool of elemental energy and tap it to cast Bolts of that element.",
        description: "Once per purchase of this skill, the Conduit forms a reserve of elemental energy, and may tap into it at will to cast up to 10 individual element-based Bolt spells in succession. The incantation for this ability is, “With arcane power, I build a pool of <Element>. <Element> Bolt!”"
      }
    ]
  },
  {
    id: "dragoon",
    name: "Dragoon",
    unlockCost: 3,
    requiredLevel: 10,
    prerequisiteText: "Polearm proficiency",
    prerequisites: [{ tag: "blade", minPurchases: 1 }],
    description: "",
    skills: [
      {
        id: "dismember",
        name: "Dismember",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Remove the target’s limb.",
        description: "Once per purchase, the Dragoon may add “Enervate” to the beginning of their damage call. If the attack causes damage to the target, the limb struck with this attack is considered to have been removed or otherwise disabled."
      },
      {
        id: "leg-sweep",
        name: "Leg Sweep",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Knock the target prone.",
        description: "With this skill, a Dragoon may call, “Knock-Down!” while striking their target’s leg, causing them to fall to the ground. This skill may be used once per purchase."
      },
      {
        id: "phalanx",
        name: "Phalanx",
        baseCost: 2,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "strength", minPurchases: 1 }],
        prerequisiteText: "Strength x1",
        shortDescription: "Wield a polearm in one hand.",
        description: "So long as the Dragoon is proficient with the weapon used, Phalanx allows them to deal full damage while wielding a polearm in one hand. In order to purchase Phalanx, the Dragoon must have purchased Strength at least once."
      },
      {
        id: "piercing-spiral",
        name: "Piercing Spiral",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "strength", minPurchases: 1 }],
        prerequisiteText: "Strength x1",
        shortDescription: "Deal Piercing damage with three attacks.",
        description: "Piercing Spiral grants the Dragoon the ability to apply the “Piercing” modifier to three consecutive attacks, once per purchase. This skill may be purchased so long as the Dragoon has purchased Strength at least once."
      },
      {
        id: "pinning-thrust",
        name: "Pinning Thrust",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "critical-hit", minPurchases: 2 }],
        prerequisiteText: "2x Critical Hit",
        shortDescription: "Immobilize the target.",
        description: "With this ability, the Dragoon may add the “Pin ning” effect to the beginning of their damage call once per purchase, inflicting said effect on their target if their attack causes damage to the target’s Hit Points. Pinning Thrust may be purchased once for every two purchases of Critical Hit."
      }
    ]
  },
  {
    id: "druid",
    name: "Druid",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Barbarian Path, 1x Divine Ritual Magic",
    prerequisites: [
      { pathId: "barbarian" },
      { pathSkillId: "ritual-magic:divine", minPurchases: 1 }
    ],
    description: "",
    skills: [
      {
        id: "gaias-blessing",
        name: "Gaia’s Blessing",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "one-with-nature", minPurchases: 2 }],
        prerequisiteText: "One with Nature x2",
        shortDescription: "Quickly provide allies with protective magical effects.",
        description: "So long as the Druid has purchased One with Nature twice, they may begin to purchase Gaia’s Blessing. With it, they may imbue their target with the effects of Divine Armor, Protection from Magic, and Protection from Poison simultaneously. This skill may be used once per purchase, and requires the incantation, “By Gaia’s grace, I grant you Gaia’s Blessing.”"
      },
      {
        id: "gaias-gift",
        name: "Gaia’s Gift",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Produce berries which yield healing effects when eaten.",
        description: "For each purchase of this skill, the Druid may manifest a bunch of five plump berries, which may be eaten to restore one Hit Point per berry. These berries may be shared with others to consume. The incantation to activate this ability is, “By Gaia’s grace, I summon Gaia’s Gift.”"
      },
      {
        id: "manaberry",
        name: "Manaberry",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Produce berries which may restore Spell Slots when consumed.",
        description: "Each purchase of this ability allows the Druid to manifest a bunch of five plump berries which may be eaten to restore one Level 1 Spell Slot, or multiple berries may be consumed together to restore a Spell Slot of the level equal to the number of berries consumed. These berries may be given to others to eat, but the effects of the berries from two separate Druids cannot be combined. The incantation to activate this ability is, “By Gaia’s grace, I summon Manaberries.”"
      },
      {
        id: "nature-provides",
        name: "Nature Provides",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Craft improvised weapons from natural materials.",
        description: "Once per purchase of this ability, the Druid may reshape natural materials into usable weapons. Doing so requires one minute of role-play. Weapons crafted in this manner may only deal Normal, base damage for their type, and will resume their natural form after 24 hours."
      },
      {
        id: "thorns",
        name: "Thorns",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "crushing-blow", minPurchases: 1 }],
        prerequisiteText: "1x Crushing Blow",
        shortDescription: "Add the Piercing modifier to three attacks.",
        description: "Once per purchase of this skill, the Druid may cause their weapon to sprout thorns, allowing it to be used to deal Piercing damage for the next three attacks by adding “Piercing” to their damage call. This ability may only be used with Bludgeoning weapons, and may be purchased once for each purchase of Crushing Blow."
      }
    ]
  },
  {
    id: "duelist",
    name: "Duelist",
    unlockCost: 5,
    requiredLevel: 10,
    prerequisiteText: "Fighter Path, 1x Parry",
    prerequisites: [
        { pathId: "fighter" },
        { skillId: "parry", minPurchases: 1 }
        ],
    description: "",
    skills: [
      {
        id: "disarm",
        name: "Disarm",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "parry", minPurchases: 1 }],
        prerequisiteText: "1x Parry",
        shortDescription: "Force the target to drop their weapon.",
        description: "With this skill, the Duelist may force their opponent to drop their weapon, once per purchase. The target’s weapon must be struck and the call, “Disarm” issued in order to activate this skill. For each purchase of Parry, Disarm may be purchased once."
      },
      {
        id: "expose",
        name: "Expose",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Removes the target’s armor.",
        description: "Expose enables a Duelist to cut away the straps and ties of an enemy’s armor, effectively removing sections thereof. When “Expose <location>” is called with a blow to the location specified, the target’s armor’s protection in that location is considered to no longer be present, rendering that location vulnerable to attacks as though they dealt Piercing damage. Armor lost in this manner may be returned to normal by standard role-played methods for refitting armor. This ability may be used once per purchase. Example: Terry uses Expose to remove Jill’s cuirass. He then strikes her in the torso with a poison-coated dagger. No longer benefiting from her armor’s protection in that area, the damage dealt by the dagger directly affects Jill’s Hit Points and therefore, imparts the effects of the poison as well."
      },
      {
        id: "hamstring",
        name: "Hamstring",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Cripple the target.",
        description: "Once per purchase, this skill allows the Duelist to add “Crippling” to the beginning of their damage call before striking their target’s leg, imparting the Cripple effect and removing the target’s ability to run."
      },
      {
        id: "master-parry",
        name: "Master Parry",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "parry", minPurchases: 2 }],
        prerequisiteText: "2x Parry",
        shortDescription: "Parry weapon, spell, and gas poison attacks.",
        description: "This ability represents a Duelist’s precision with weapon maneuvers, allowing them to parry any attack, once per purchase. As with an ordinary Parry, “Parry” should be called when using this ability. Master Parry may be purchased once for every two purchases of Parry."
      },
      {
        id: "riposte",
        name: "Riposte",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "parry", minPurchases: 1 }],
        prerequisiteText: "1x Parry",
        shortDescription: "Reduce the target to -1 HP.",
        description: "Available for purchase once for every purchase of Parry, this ability represents the Duelist’s ability to deliver a lethal counter-attack, reducing their target to -1 HP. The call to use this ability is “Riposte,” and this skill may be used once per purchase. Riposte may only be used immediately following a successful physical parry of an incoming weapon-based attack, or the activation of the Parry or Master Parry skills."
      }
    ]
  },
  {
    id: "hospitalier",
    name: "Hospitalier",
    unlockCost: 3,
    requiredLevel: 10,
    prerequisiteText: "Fighter Path, Paladin Path",
    prerequisites: [
      { pathId: "fighter" },
      { pathId: "paladin" }
    ],
    description: "",
    skills: [
      {
        id: "hallowed-ground",
        name: "Hallowed Ground",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Create a magical barrier which Undead cannot pass through.",
        description: "Calling upon their deity’s power, the Hospitalier may form a wall of Divine energy, preventing any Undead from moving through it. A length of rope, ribbon, or other marking material no longer than 10 feet represents this wall. When using this skill, the Hospitalier places the representation on the ground and recites the incantation, “I call upon Prana to consecrate these grounds!” Hallowed Ground lasts for five minutes, and may be used once per purchase."
      },
      {
        id: "holy-shield",
        name: "Holy Shield",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "shield", minPurchases: 1 }],
        prerequisiteText: "Shield Proficiency",
        shortDescription: "Block spells that call upon Endo with a shield.",
        description: "Focusing Holy energy, the Hospitalier may block a harmful Divine spell with their shield once per purchase."
      },
      {
        id: "holy-weapon",
        name: "Holy Weapon",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Deal 5 points of Holy damage to an Undead creature.",
        description: "Once per purchase, this ability allows the Hospitalier to focus Holy energy into their weapon, enabling them to deal a massive blow to their target, dealing five points of Holy damage in doing so."
      },
      {
        id: "pranas-blessing",
        name: "Prana’s Blessing",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Gain three charges of the Cure Light Wounds spell.",
        description: "For each purchase of this ability, the Hospitalier is imbued with three uses of the Cure Light Wounds spell."
      },
      {
        id: "radiant-lance",
        name: "Radiant Lance",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "holy-weapon", minPurchases: 2 }],
        prerequisiteText: "2x Holy Weapon",
        shortDescription: "Deal 10 points of Holy damage to an Undead creature.",
        description: "Once per purchase, a Hospitalier may deliver a packet-based attack, dealing 10 points of Holy damage to their target. Radiant Lance may be purchased once for every two purchases of Holy Weapon."
      }
    ]
  },
  {
    id: "marksman",
    name: "Marksman",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Technician Path",
    prerequisites: [{ pathId: "technician" }],
    description: "",
    skills: [
      {
        id: "bird-shot",
        name: "Bird Shot",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "firearms", minPurchases: 1 }],
        prerequisiteText: "Firearms",
        shortDescription: "Blind the target with a blast of small shot.",
        description: "Representing the use of miniature shot often used for hunting birds, this skill may be used to inflict the Blind effect upon the Marksman’s target once per purchase. This ability may only be used with rifles and pistols."
      },
      {
        id: "chemist",
        name: "Chemist",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "gunsmith", minPurchases: 3 }],
        prerequisiteText: "Gunsmith x3",
        shortDescription: "Utilize poisoned darts to inflict various effects.",
        description: "With each purchase of Chemist, the Marksman may employ a new type of poisoned dart, which they may use to afflict their target with certain effects. Chemist may be purchased so long as the Marksman has already purchased Gunsmith at least three times. Producing one set of darts yields six units of ammunition. Refer to Table 5-12a for more details."
      },
      {
        id: "overpack",
        name: "Overpack",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "firearms", minPurchases: 1 }],
        prerequisiteText: "Firearms",
        shortDescription: "Knock the target back five paces.",
        description: "Once per purchase of this skill, the Marksman may add the Knock-Back effect to the beginning of their damage call, knocking their target back five paces with one attack with a firearm."
      },
      {
        id: "steady-aim",
        name: "Steady Aim",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "firearms", minPurchases: 1 }],
        prerequisiteText: "Firearms, 2x Character Level",
        shortDescription: "Deal double damage for one shot.",
        description: "With this ability, the Marksman may deal double damage with one shot from a pistol or rifle. Steady Aim may be purchased once for every two levels the character possess, and may be used once per purchase."
      },
      {
        id: "warning-shot",
        name: "Warning Shot",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "precise-shot", minPurchases: 1 }],
        prerequisiteText: "1x Precise Shot",
        shortDescription: "Fire dangerously close to the target, instilling them with fear.",
        description: "Once per purchase of this skill, the Marksman may fire at their target with a firearm, instilling them with the Fear effect by adding, “Cause Fear” to the beginning of their damage call. This skill may be purchased once for each purchase of Precise Shot."
      }
    ]
  },
  {
    id: "necromancer",
    name: "Necromancer",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Mage Path, 1x Divine Ritual Magic",
    prerequisites: [
      { pathId: "mage" },
      { pathSkillId: "ritual-magic:divine", minPurchases: 1 }
    ],
    description: "",
    skills: [
      {
        id: "control-undead",
        name: "Control Undead",
        baseCost: 2,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Manipulate and control Undead creatures.",
        description: "Affecting one creature per purchase of this ability and so long as the Necromancer—visibly bearing a Holy Symbol of Endo—remains within sight, they may direct the targeted mindless Undead creature through verbal commands. This ability’s effects remain until the targeted creature is dispatched, the Necromancer loses consciousness, or visual contact is broken. The incantation for this ability is, “I call upon Endo to control Undead!”"
      },
      {
        id: "hunger",
        name: "Hunger",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "thirst", minPurchases: 1 }],
        prerequisiteText: "1x Thirst",
        shortDescription: "Force the target to attempt to kill and eat the nearest creature.",
        description: "Once per purchase, Hunger inflicts the target with a ravenous hunger, compelling them to kill and feverishly devour the remains of the nearest living creature with 10 seconds of role-play. Hunger may be purchased once for every purchase of Thirst. The effects of this ability remain for five minutes, or until the target is able to kill and consume a creature. The incantation for Hunger is, “I call upon Endo to afflict you with cannibalistic hunger!”"
      },
      {
        id: "retribution",
        name: "Retribution",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Reflect incoming physical damage.",
        description: "Once per purchase, the Necromancer may grant themselves protection from the next incoming physical attack and in doing so, reflect the damage they would otherwise receive back upon their attacker. The incantation for this ability is, “I call upon Endo to grant myself retribution!”"
      },
      {
        id: "thirst",
        name: "Thirst",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Force the target to consume all available fluids.",
        description: "With this ability, the Necromancer’s target feels as though their throat is completely dry, and the only way to satisfy their overwhelming thirst is to consume any and all fluids on hand, including potions, poisons, and alchemical substances. The effects of Thirst last for five minutes. The incantation for Thirst is, “I call upon endo to afflict you with dire thirst!”"
      }
    ]
  },
  {
    id: "oracle",
    name: "Oracle",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Mage Path, 1x Divine Ritual Magic",
    prerequisites: [
      { pathId: "mage" },
      { pathSkillId: "ritual-magic:divine", minPurchases: 1 }
    ],
    description: "",
    skills: [
      {
        id: "divine-affinity",
        name: "Divine Affinity",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Cast Divine spells without incantations or need for a spell book.",
        description: "For each purchase of this ability, the Oracle becomes more familiar with spells of the level equal to the number of purchases made. In so doing, she has removed the necessity to rely on her spell book to serve as a focus, in addition to the use of incantations. To cast spells affected by this ability, the Oracle states the spell’s name and casts a Spell Packet. This call is considered Out-of-Game, but may be accompanied by In-Game phrases. Example: Ellyn, an Oracle of Prana, has purchased Divine Affinity three times. She may cast any first, second, or third tier spell that calls upon Prana without using her spell book, or reciting incantations. However, she cannot do the same for spells of higher tiers, and she may not use this ability with spells that call upon Endo or Gaia."
      },
      {
        id: "divine-blessing",
        name: "Divine Blessing",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "An Oracle with this ability is capable of making use of a Restore spell, regardless of their alignment and without using a Spell Slot. This skill is usable even when the character is normally unable to use their skills, such as when affected by Idiocy. Divine Blessing may be used once per purchase.",
        description: ""
      },
      {
        id: "divine-pool",
        name: "Divine Pool",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "divine-affinity", minPurchases: 1 }],
        prerequisiteText: "1x Divine Affinity",
        shortDescription: "Create a pool of Divine energy and tap into it to cast Light-level spells of the pool’s energy type.",
        description: "With this ability, an Oracle may form a reserve of Divine energy, which they may tap into to cast 10 individual Light-tier spells attuned to their god, in succession. Divine Pool may be used once per purchase, and it may be purchased once for each purchase of Divine Affinity. The spells associated with this ability include Cause Light Wounds (Endo), Entangle (Gaia), and Cure Light Wounds (Prana). The incantation for this ability is, “I call upon <god> to build a pool of energy. <Spell Name!>”"
      },
      {
        id: "grace-of-the-divines",
        name: "Grace of the Divines",
        baseCost: 5,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Gain three uses of a Cure or Cause spell.",
        description: "Once purchased, this ability allows an Oracle to cast three Cure or Cause spells from a single appropriate Spell Slot. These spells must be cast in succession though, as any other action or spells end the effects of the ability on the spent Spell Slot. Grace of the Divines may only be used with up to Level 4 spells."
      },
      {
        id: "mercy-healing",
        name: "Mercy Healing",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Sacrifice HP to heal others, or siphon HP from the target.",
        description: "Once for each purchase of this skill, an Oracle aligned with Prana may heal another creature with a chosen Cure Spell while sacrificing the same amount of their own Hit Points rather than consuming a Spell Slot. Oracles who align with Endo however, may choose to cast a Cause spell, while healing themselves for the same amount of damage inflicted thereby. This ability may only be used to sacrifice an amount of Hit Points the caster possesses."
      }
    ]
  },
  {
    id: "ritualist",
    name: "Ritualist",
    unlockCost: 3,
    requiredLevel: 10,
    prerequisiteText: "1x Arcane or Divine Ritual Magic",
    prerequisites: [
      {
        anyOf: [
          { pathSkillId: "ritual-magic:arcane", minPurchases: 1 },
          { pathSkillId: "ritual-magic:divine", minPurchases: 1 }
        ]
      }
    ],
    description: "",
    skills: [
      {
        id: "eschew-components",
        name: "Eschew Components",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Reduce the number of necessary components to cast a ritual.",
        description: "Once per purchase of this ability, the Ritualist may spend one less component of their choice to cast a ritual spell. This benefit may be applied multiple times to the same ritual casting, though the total number of components required to cast a ritual may not be less than one."
      },
      {
        id: "focus-elements",
        name: "Focus Elements",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "manifest-elements", minPurchases: 1 }],
        prerequisiteText: "1x Manifest Elements",
        shortDescription: "Produce enhanced components.",
        description: "Once per purchase of this skill, a Ritualist may refine a standard magical component of their choice, so that it grants an additional 10% chance for an enchantment’s effects to act as per-day effects. Doing so requires 10 minutes of role-play to complete."
      },
      {
        id: "manifest-elements",
        name: "Manifest Elements",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [
          {
            anyOf: [
              { pathSkillId: "ritual-magic:arcane", minPurchases: 1 },
              { pathSkillId: "ritual-magic:divine", minPurchases: 1 }
            ]
          }
        ],
        prerequisiteText: "1x Arcane or Divine Ritual Magic",
        shortDescription: "Produce components for ritual magic.",
        description: "For each purchase of this skill, the Ritualist may manifest elemental energy into physical form, creating a magical component of their choice, once. Doing so requires 10 minutes of role-play to complete."
      },
      {
        id: "quicken",
        name: "Quicken",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Reduce time required to cast a ritual.",
        description: "For each purchase of Quicken, the Ritualist may reduce the casting time necessary for their rituals by one minute per spell level. this ability may be purchased up to three times. No ritual above Trivial level may have its casting time reduced by more than five minutes per spell level. For example, Thomas has purchased Quicken twice and prepares to cast a second-level ritual. Rather than the ritual taking 10 minutes per spell level for a total of 20 minutes, Quicken’s effect reduces the basic time to eight minutes per level, for a total of 16 minutes spent for the ritual."
      },
      {
        id: "substitute-components",
        name: "Substitute Components",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Substitute one type of component for another.",
        description: "Once per purchase, this ability allows the Ritualist to substitute one magical component for another when casting a ritual spell."
      }
    ]
  },
  {
    id: "royal-guard",
    name: "Royal Guard",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Fighter Path, Mage Path",
    prerequisites: [
      { pathId: "fighter" },
      { pathId: "mage" }
    ],
    description: "",
    skills: [
      {
        id: "perfect-guard",
        name: "Perfect Guard",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "shield", minPurchases: 1 }],
        prerequisiteText: "Shield Proficiency",
        shortDescription: "Negate an incoming weapon-delivered attack.",
        description: "This skill enables the Royal Guard to defend themselves with a shield against any incoming weapon-based attack that would otherwise inflict harm upon them, once per purchase."
      },
      {
        id: "protectors-call",
        name: "Protector’s Call",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Take damage and effects intended for others.",
        description: "Once per purchase, Protector’s Call enables the Royal Guard to throw themselves in the way of an attack intended for another person. To do so, they must make contact with their target and call, “Protection” immediately after their target is struck or otherwise receives the effect intended to be nullified."
      },
      {
        id: "shield-slam",
        name: "Shield Slam",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "shield-bash", minPurchases: 1 }],
        prerequisiteText: "1x Shield Bash",
        shortDescription: "Knock the target back five paces and deal damage.",
        description: "With this ability, the Royal Guard may strike their target with their shield once per purchase and call, “Crushing Knock-back Strike Three” In doing so, they knock their target back five paces and inflict three points of Normal damage. Shield Slam may be purchased once for each purchase of Shield Bash."
      },
      {
        id: "spirit-strike",
        name: "Spirit Strike",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Inflict the Silence effect upon the target.",
        description: "Once per purchase of this skill, the Royal Guard may strike their target and call, “Channel Strike: Silence!” In doing so, they may inflict the Silence effect on their target without expending a Spell Slot or previously reciting the respective incantation."
      }
    ]
  },
  {
    id: "rune-knight",
    name: "Rune Knight",
    unlockCost: 4,
    requiredLevel: 10,
    prerequisiteText: "Fighter Path, 1x Arcane Ritual Magic",
    prerequisites: [
      { pathId: "fighter" },
      { pathSkillId: "ritual-magic:arcane", minPurchases: 1 }
    ],
    description: "",
    skills: [
      {
        id: "arcane-bulwark",
        name: "Arcane Bulwark",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ skillId: "extra-armor", minPurchases: 1 }],
        prerequisiteText: "1x Extra Armor",
        shortDescription: "Gain five points of magical armor.",
        description: "For each purchase of this ability, the Rune Knight gains five points of magical armor which grants protection as any standard physical armor, but does not require a physical representation to be worn by the Rune Knight. The protection Arcane Bulwark grants may be depleted by standard physical attacks, or outright eliminated by means of Dispel Magic. However, this armor may be replenished and otherwise restored by means of one minute of meditation. As this armor is metaphysical in nature, the Rune Knight may benefit from both its protection, as well as that of the standard, physical armor they may wear. Arcane Bulwark may be purchased up to six times; once for each purchase of Extra Armor."
      },
      {
        id: "baneblade",
        name: "Baneblade",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Absorb a spell and channel it into an attack.",
        description: "Once per purchase, this ability grants the Rune Knight the ability to ignore the effects of an arcane spell cast upon them; instead absorbing it and channeling it into their weapon to use as their own, as if through the Channel Magic skill."
      },
      {
        id: "elemental-barrier",
        name: "Elemental Barrier",
        baseCost: 6,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "spell-slot-level-5:arcane", minPurchases: 1 }],
        prerequisiteText: "1x Level 5 Arcane Spell Slot",
        shortDescription: "Gain four resistances to a specified element.",
        description: "Once per purchase, a Rune Knight may protect themselves from four attacks from a chosen element. Only one Elemental Barrier may be active at a given time, and must be recast to select a new element. In order to use this ability, the Rune Knight must focus with 10 seconds of role-play. Elemental Barrier may be purchased once for each Level 5 Arcane Spell Slot the character possesses."
      },
      {
        id: "greater-mystic-blade",
        name: "Greater Mystic Blade",
        baseCost: 5,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ classSkillId: "mystic-blade", minPurchases: 1 }],
        prerequisiteText: "Mystic Blade",
        shortDescription: "Shorten the focus duration of Mystic Blade.",
        description: "With this ability, the Rune Knight may change their Mystic Blade’s aura with 10 seconds of meditation, rather than spending a full minute to do so."
      },
      {
        id: "mystic-blade",
        name: "Mystic Blade",
        baseCost: 3,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ tag: "weapon-proficiency", minPurchases: 1 }],
        prerequisiteText: "Weapon Proficiency",
        shortDescription: "Modify a weapon’s damage type.",
        description: "With this skill, the Rune Knight may imbue their weapon with an elemental aura by means of one minute of role-play. This aura may be changed or dispelled by means of another minute of role-play, and is only effective when the Rune Knight wields the weapon."
      }
    ]
  },
  {
    id: "shura",
    name: "Shura",
    unlockCost: 3,
    requiredLevel: 10,
    prerequisiteText: "Barbarian Path, Monk Path",
    prerequisites: [
      { pathId: "barbarian" },
      { pathId: "monk"}
    ],
    description: "",
    skills: [
      {
        id: "furious-tiger",
        name: "Furious Tiger",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "iron-fist", minPurchases: 2 }],
        prerequisiteText: "2x Iron Fist",
        shortDescription: "Deal an additional two points of damage with five unarmed blows.",
        description: "Upon assuming this stance, the Shura may deal an additional two points of damage with their fists for the next five attacks. Furious Tiger may be purchased once for every two purchases of Iron Fist, and it may be used once per purchase."
      },
      {
        id: "graceful-crane",
        name: "Graceful Crane",
        baseCost: 6,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "dexterity", minPurchases: 2 }],
        prerequisiteText: "2x Dexterity",
        shortDescription: "Parry up to five weapon attacks.",
        description: "Once per purchase and upon assuming this stance, the Shura may parry the next five physical attacks targeting them. Graceful Crane may be used once per purchase, and may be purchased once for every two purchases of Dexterity."
      },
      {
        id: "lashing-viper",
        name: "Lashing Viper",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "shout-of-spirit", minPurchases: 2 }],
        prerequisiteText: "2x Shout of Spirit",
        shortDescription: "Add the Piercing modifier to five unarmed attacks.",
        description: "Upon assuming this stance, the Shura may add the Piercing damage modifier to their next five unarmed attacks, once per purchase. Lashing Viper may be purchased once for every two purchases of Shout of Spirit."
      },
      {
        id: "savage-ape",
        name: "Savage Ape",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "crushing-blow", minPurchases: 2 }],
        prerequisiteText: "2x Crushing Blow",
        shortDescription: "Add the Crushing modifier to five unarmed attacks.",
        description: "Once per purchase upon assuming this stance, the Shura may add the Crushing damage modifier to their next five unarmed blows. Savage Ape may be purchased once for every two purchases of Crushing Blow."
      }
    ]
  },
  {
    id: "titan",
    name: "Titan",
    unlockCost: 5,
    requiredLevel: 10,
    prerequisiteText: "Barbarian Path, Fighter Path",
    prerequisites: [
      { pathId: "barbarian" },
      { pathId: "fighter" }
    ],
    description: "",
    skills: [
      {
        id: "carbon-filter",
        name: "Carbon Filter",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Resist a Poison-based attack.",
        description: "Once per purchase, this ability enables the Titan to resist the effects of poison."
      },
      {
        id: "mountain-breaker",
        name: "Mountain Breaker",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "strength", minPurchases: 2 }],
        prerequisiteText: "Strength x2",
        shortDescription: "Knock a target prone.",
        description: "For each purchase of this skill, the Titan may add “Knock-Down” to the beginning of their damage call, thus allowing them to knock their target prone with a melee attack. Mountain Breaker may be purchased so long as the Titan has purchased Strength at least twice."
      },
      {
        id: "obsidian-prison",
        name: "Obsidian Prison",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "N/A",
        shortDescription: "Temporarily become invulnerable to attacks.",
        description: "Once per purchase, this skill allows the Titan to encase their body in volcanic glass, becoming immune to all incoming attacks, poisons, and spells, while also rendering themselves immobile and thus incapable of speaking, moving, or using other skills. Obsidian Prison lasts for five minutes and may be activated with the incantation, “By the earth, I form an Obsidian Prison!”"
      },
      {
        id: "roar-of-the-earth",
        name: "Roar of the Earth",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "strength", minPurchases: 2 }],
        prerequisiteText: "Strength x2",
        shortDescription: "Knock a target back five paces.",
        description: "For each purchase of this skill, the Titan may call out, “Voice-radius: Knock-Back,” shaking the ground around them and forcing others within earshot back by five paces. Roar of the Earth may be purchased so long as the Titan has purchased Strength at least twice."
      },
      {
        id: "stone-flesh",
        name: "Stone Flesh",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [],
        prerequisiteText: "5x Character Level",
        shortDescription: "Negate incoming physical damage.",
        description: "For every five levels the character possesses, the Titan may purchase Stone Flesh once, up to three times in total. With each purchase, their skin thickens and hardens as a response to harsh impacts, causing them to become immune to all but one point of damage by certain degrees of physical attacks. Damage that does not meet the protection that Stone Flesh grants is dealt in full, and Piercing damage ignores the benefits of this ability, affecting the Titan normally. Stone Flesh grants no protection against poisons or spells and the damage or effects dealt thereby. The effects of Stone Flesh are permanent and may be purchased once at Level 10, up to two times at Level 15, and once more at Level 20. The first purchase of this ability grants protection against blows dealing 10 points or more of damage. The second reduces the minimum threshold to seven points of damage or more, and the third lowers the threshold once more to four points of damage or more. Damage values below these thresholds are dealt in full."
      },
      {
        id: "might-of-amaran",
        name: "Might of Amaran",
        baseCost: 2,
        repeatable: false,
        maxPurchases: 1,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "strength", minPurchases: 1 }],
        prerequisiteText: "1x Strength",
        shortDescription: "Wield a Two-Handed weapon in one hand.",
        description: "With Might of Amaran, the Titan may wield a two-handed weapon in one hand proficiently, and deal full damage while doing so. This ability does not affect the use of polearms in such a manner, however."
      }
    ]
  },
  {
    id: "warden",
    name: "Warden",
    unlockCost: 3,
    requiredLevel: 10,
    prerequisiteText: "Ranger Path, Rogue Path",
    prerequisites: [
      { pathId: "ranger" },
      { pathId: "rogue" }
    ],
    description: "",
    skills: [
      {
        id: "alchemical-arrows",
        name: "Alchemical Arrows",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "fletcher", minPurchases: 4 }],
        prerequisiteText: "Fletcher x4",
        shortDescription: "Create ammunition containing alchemical substances.",
        description: "So long as the Warden possesses at least four ranks of the Fletcher skill, they may begin purchasing Alchemical Arrows. With each purchase of this skill, they unlock a new variety of alchemically-treated ammunition to produce. Items produced in this manner yield 10 units of ammunition. Refer to Table 5-19a for more information."
      },
      {
        id: "blinding-shot",
        name: "Blinding Shot",
        baseCost: 3,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "archery", minPurchases: 1 }],
        prerequisiteText: "Archery",
        shortDescription: "Add the Blinding modifier to one shot.",
        description: "Once per purchase of this ability, the Warden may add the “Blinding” modifier to the beginning of their damage call, inflicting the Blinded effect upon their target with one shot from an archery weapon."
      },
      {
        id: "silencing-shot",
        name: "Silencing Shot",
        baseCost: 4,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "archery", minPurchases: 1 }],
        prerequisiteText: "Archery",
        shortDescription: "Add the Silencing modifier to one shot.",
        description: "With this ability, the Warden may silence their target by adding the “Silencing” modifier to the beginning of their damage call, once per purchase, when attacking with an archery weapon."
      },
      {
        id: "stupefy",
        name: "Stupefy",
        baseCost: 5,
        repeatable: true,
        maxPurchases: 99,
        hpIncrease: 0,
        tags: [],
        prerequisites: [{ pathSkillId: "archery", minPurchases: 1 }],
        prerequisiteText: "Archery",
        shortDescription: "Add the Idiocy effect to one shot.",
        description: "Once per purchase, the Warden may add “Idiocy” to the beginning of their damage call, inflicting the Idiocy effect upon their target from one shot with an archery weapon."
      }
    ]
  }
];


// ============================================================
// STEP DATA
// ============================================================
const steps = ["Basics", "General Skills", "Paths", "Classes", "Export / Save"];

const backgroundSkills = [
  ...generalSkills,
  ...paths.flatMap((path) => path.skills)
].filter((skill, index, allSkills) => {
  const tags = skill.tags || [];
  const isBackgroundOption =
    tags.includes("background") || tags.includes("production-skill");

  return isBackgroundOption && allSkills.findIndex((item) => item.id === skill.id) === index;
});

function getSkillSectionById(skillId) {
  if (generalSkills.some((skill) => skill.id === skillId)) return "general";
  if (paths.some((path) => path.skills.some((skill) => skill.id === skillId))) return "path";
  if (classes.some((classItem) => classItem.skills.some((skill) => skill.id === skillId))) return "class";
  return null;
}

const raceAutoSkillMap = {
  kaddri: ["unique-skill", "superior-smelling"],
  kaelis: ["unique-skill", "photosynthesis"]
};

const autoRaceSkillIds = Array.from(
  new Set(Object.values(raceAutoSkillMap).flat())
);

const raceIds = races.map((race) => race.id);
const raceIdToIndex = Object.fromEntries(raceIds.map((id, index) => [id, index]));

const pathIds = paths.map((path) => path.id);
const pathIdToIndex = Object.fromEntries(pathIds.map((id, index) => [id, index]));

const classIds = classes.map((classItem) => classItem.id);
const classIdToIndex = Object.fromEntries(classIds.map((id, index) => [id, index]));

const allSkillIds = Array.from(
  new Set([
    ...generalSkills.map((skill) => skill.id),
    ...paths.flatMap((path) => path.skills.map((skill) => skill.id)),
    ...classes.flatMap((classItem) => classItem.skills.map((skill) => skill.id))
  ])
);
const skillIdToIndex = Object.fromEntries(allSkillIds.map((id, index) => [id, index]));

function encodeSaveData(saveData) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(saveData))));
}

function decodeSaveData(saveCode) {
  return JSON.parse(decodeURIComponent(escape(atob(saveCode))));
}

function isMeaningfulPurchaseValue(value) {
  if (typeof value === "number") return value > 0;
  if (value && typeof value === "object") {
    return (Number(value.primary) || 0) > 0 ||
      (Number(value.secondary) || 0) > 0 ||
      (Number(value.positive) || 0) > 0 ||
      (Number(value.negative) || 0) > 0;
  }
  return false;
}

function encodePurchaseValue(value) {
  if (value && typeof value === "object") {
    if ("positive" in value || "negative" in value) {
      return { p: Number(value.positive) || 0, n: Number(value.negative) || 0 };
    }
    return [Number(value.primary) || 0, Number(value.secondary) || 0];
  }
  return Number(value) || 0;
}

function decodePurchaseValue(value) {
  if (Array.isArray(value)) {
    return {
      primary: Number(value[0]) || 0,
      secondary: Number(value[1]) || 0
    };
  }
  if (value && typeof value === "object" && ("p" in value || "n" in value)) {
    return {
      positive: Number(value.p) || 0,
      negative: Number(value.n) || 0
    };
  }
  return Number(value) || 0;
}

function compactPurchases(purchases = {}) {
  return Object.entries(purchases)
    .filter(([skillId, value]) => skillIdToIndex[skillId] !== undefined && isMeaningfulPurchaseValue(value))
    .map(([skillId, value]) => [skillIdToIndex[skillId], encodePurchaseValue(value)]);
}

function expandPurchases(compactEntries = []) {
  const expanded = {};

  compactEntries.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return;
    const skillId = allSkillIds[entry[0]];
    if (!skillId) return;
    expanded[skillId] = decodePurchaseValue(entry[1]);
  });

  return expanded;
}

function compactCustomTexts(section = {}) {
  return Object.entries(section)
    .filter(([skillId, entries]) => skillIdToIndex[skillId] !== undefined && Array.isArray(entries) && entries.length > 0)
    .map(([skillId, entries]) => [
      skillIdToIndex[skillId],
      entries
        .filter((entry) => entry && (entry.text || Number(entry.count) > 0))
        .map((entry) => [entry.text || "", Number(entry.count) || 0])
    ])
    .filter(([, entries]) => entries.length > 0);
}

function expandCustomTexts(sectionEntries = []) {
  const expanded = {};

  sectionEntries.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return;
    const skillId = allSkillIds[entry[0]];
    if (!skillId || !Array.isArray(entry[1])) return;
    expanded[skillId] = entry[1].map((item) => ({
      text: Array.isArray(item) ? item[0] || "" : "",
      count: Array.isArray(item) ? Number(item[1]) || 0 : 0
    }));
  });

  return expanded;
}

function compactUnlocked(unlockedMap = {}, indexMap = {}) {
  return Object.entries(unlockedMap)
    .filter(([id, value]) => Boolean(value) && indexMap[id] !== undefined)
    .map(([id]) => indexMap[id]);
}

function expandUnlocked(indices = [], idList = []) {
  return indices.reduce((accumulator, index) => {
    const id = idList[index];
    if (id) accumulator[id] = true;
    return accumulator;
  }, {});
}

function toCompactSaveData(fullState) {
  const compact = { v: 1 };

  if (fullState.name) compact.n = fullState.name;
  if (raceIdToIndex[fullState.raceId] !== undefined) compact.r = raceIdToIndex[fullState.raceId];
  if ((Number(fullState.totalXP) || 0) > 0) compact.x = Number(fullState.totalXP) || 0;
  if ((Number(fullState.currentSP) || STARTING_SP) !== STARTING_SP) compact.s = Number(fullState.currentSP) || STARTING_SP;
  if (skillIdToIndex[fullState.backgroundSkillId] !== undefined) compact.b = skillIdToIndex[fullState.backgroundSkillId];
  if (fullState.backgroundCustomText) compact.bt = fullState.backgroundCustomText;
  if ((Number(fullState.step) || 0) > 0) compact.t = Number(fullState.step) || 0;

  const gp = compactPurchases(fullState.generalPurchases);
  const pp = compactPurchases(fullState.pathPurchases);
  const cp = compactPurchases(fullState.classPurchases);
  if (gp.length > 0) compact.gp = gp;
  if (pp.length > 0) compact.pp = pp;
  if (cp.length > 0) compact.cp = cp;

  const generalCustom = compactCustomTexts(fullState.customTexts?.general || {});
  const pathCustom = compactCustomTexts(fullState.customTexts?.path || {});
  const classCustom = compactCustomTexts(fullState.customTexts?.class || {});
  if (generalCustom.length > 0 || pathCustom.length > 0 || classCustom.length > 0) {
    compact.ct = {};
    if (generalCustom.length > 0) compact.ct.g = generalCustom;
    if (pathCustom.length > 0) compact.ct.p = pathCustom;
    if (classCustom.length > 0) compact.ct.c = classCustom;
  }

  const up = compactUnlocked(fullState.unlockedPaths, pathIdToIndex);
  const uc = compactUnlocked(fullState.unlockedClasses, classIdToIndex);
  if (up.length > 0) compact.up = up;
  if (uc.length > 0) compact.uc = uc;

  return compact;
}

function fromCompactSaveData(compactState) {
  if (!compactState || typeof compactState !== "object") {
    return compactState;
  }

  if (!("v" in compactState)) {
    return compactState;
  }

  return {
    name: compactState.n || "",
    raceId: raceIds[compactState.r] || races[0]?.id || "",
    totalXP: Number(compactState.x) || 0,
    currentSP: Number(compactState.s) || STARTING_SP,
    backgroundSkillId: allSkillIds[compactState.b] || "",
    backgroundCustomText: compactState.bt || "",
    generalPurchases: expandPurchases(compactState.gp || []),
    pathPurchases: expandPurchases(compactState.pp || []),
    classPurchases: expandPurchases(compactState.cp || []),
    customTexts: {
      general: expandCustomTexts(compactState.ct?.g || []),
      path: expandCustomTexts(compactState.ct?.p || []),
      class: expandCustomTexts(compactState.ct?.c || [])
    },
    unlockedPaths: expandUnlocked(compactState.up || [], pathIds),
    unlockedClasses: expandUnlocked(compactState.uc || [], classIds),
    step: Number(compactState.t) || 0
  };
}

// ============================================================
// HELPER FUNCTIONS: LEVEL AND XP
// ============================================================
function getLevelData(sp) {
  let low = 0;
  let high = levelTable.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const item = levelTable[mid];

    if (sp < item.minSP) {
      high = mid - 1;
    } else if (sp > item.maxSP) {
      low = mid + 1;
    } else {
      return item;
    }
  }

  if (sp < levelTable[0].minSP) return levelTable[0];
  return levelTable[levelTable.length - 1];
}

function getSpentXPForSP(sp) {
  let spent = 0;

  for (let currentSP = STARTING_SP; currentSP < sp; currentSP += 1) {
    const costLevel = getLevelData(currentSP);
    spent += costLevel?.xpPerSP || 0;
  }

  return spent;
}

// ============================================================
// HELPER FUNCTIONS: PURCHASE MAPS, COSTS, HP
// ============================================================
function buildPurchaseMap(
  purchases,
  bonusPurchases = {},
  customTextSections = [],
  magicSchoolOrder = []
) {
  const map = {};
  const primaryMagicSchool = magicSchoolOrder[0] || null;
  const secondaryMagicSchool = magicSchoolOrder[1] || null;
    Object.entries(purchases).forEach(([id, value]) => {
    if (Array.isArray(value)) {
      map[id] = value.reduce((total, entry) => {
        if (typeof entry === "number") return total + entry;
        if (entry && typeof entry === "object") return total + (Number(entry.count) || 0);
        return total;
      }, 0);
    } else if (value && typeof value === "object") {
      if ("positive" in value || "negative" in value) {
        const positiveCount = Number(value.positive) || 0;
        const negativeCount = Number(value.negative) || 0;
        map[id] = positiveCount + negativeCount;
        map[`${id}:positive`] = (map[`${id}:positive`] || 0) + positiveCount;
        map[`${id}:negative`] = (map[`${id}:negative`] || 0) + negativeCount;
      } else {
        const primaryCount = Number(value.primary) || 0;
        const secondaryCount = Number(value.secondary) || 0;
        map[id] = primaryCount + secondaryCount;

        if (primaryMagicSchool) {
          map[`${id}:${primaryMagicSchool}`] = (map[`${id}:${primaryMagicSchool}`] || 0) + primaryCount;
        }

        if (secondaryMagicSchool) {
          map[`${id}:${secondaryMagicSchool}`] = (map[`${id}:${secondaryMagicSchool}`] || 0) + secondaryCount;
        }
      }
    } else {
      map[id] = Number(value) || 0;
    }
  });

  customTextSections.forEach((section) => {
    Object.entries(section || {}).forEach(([id, value]) => {
      if (Array.isArray(value)) {
        map[id] = value.reduce((total, entry) => {
          if (typeof entry === "number") return total + entry;
          if (!entry || typeof entry !== "object") return total;

          const count = Number(entry.count) || 0;
          const nextTotal = total + count;

          if (entry.text) {
            const optionSkillId = getOptionSkillId(id, entry.text);
            map[optionSkillId] = (map[optionSkillId] || 0) + count;
          }

          return nextTotal;
        }, 0);
      }
    });
  });

  Object.entries(bonusPurchases).forEach(([id, value]) => {
    map[id] = (map[id] || 0) + (Number(value) || 0);
  });

  return map;
}

function getRaceAdjustedCost(item, selectedRace, matchIdOverride = null) {
  let finalCost = item.baseCost;
  const modifiers = [];
  const matchIdsToCheck = [item.id, matchIdOverride].filter(Boolean);

  selectedRace.costModifiers.forEach((modifier) => {
    const resolvedMatchIds = modifier.matchPathId
      ? paths.find((path) => path.id === modifier.matchPathId)?.skills.map((skill) => skill.id) || []
      : modifier.matchIds || [];

    if (matchIdsToCheck.some((matchId) => resolvedMatchIds.includes(matchId))) {
      finalCost += modifier.amount;
      modifiers.push(modifier);
    }
  });

  return {
    cost: Math.max(0, finalCost),
    modifiers
  };
}

function getRaceAdjustedPathUnlockCost(path, selectedRace) {
  let finalCost = path.unlockCost;
  const modifiers = [];

  selectedRace.costModifiers.forEach((modifier) => {
    if (modifier.matchPathUnlockId === path.id) {
      finalCost += modifier.amount;
      modifiers.push(modifier);
    }
  });

  return {
    cost: Math.max(0, finalCost),
    modifiers
  };
}

function getCharacterLevelPurchaseLimitFromText(prerequisiteText, level) {
  if (!prerequisiteText) return null;

  const match = prerequisiteText.match(/(\d+)x Character Level(?:s)?/i);
  if (!match) return null;

  const levelsPerPurchase = Number(match[1]) || 0;
  if (levelsPerPurchase <= 0) return null;

  return Math.floor(level / levelsPerPurchase);
}

function getSkillMaxPurchases(item, level, purchaseMap) {
  if (!item.repeatable) return 1;

  if (item.id === "cantrip" || item.id === "alignment") {
    return Math.max(1, Math.floor((Math.max(level, 1) - 1) / 5) + 1);
  }

  let maxPurchases = item.maxPurchases ?? 99;

  if (item.maxPurchasesByLevel) {
    maxPurchases = Math.min(maxPurchases, level);
  }

  if (item.maxPurchasesFromSkill) {
    const sourcePurchases = purchaseMap[item.maxPurchasesFromSkill.skillId] || 0;
    const purchasesFromSkill = Math.floor(
      sourcePurchases / item.maxPurchasesFromSkill.purchasesPerAllowedPurchase
    );
    maxPurchases = Math.min(maxPurchases, purchasesFromSkill);
  }

  const purchasesFromCharacterLevel = getCharacterLevelPurchaseLimitFromText(
    item.prerequisiteText,
    level
  );

  if (purchasesFromCharacterLevel !== null) {
    maxPurchases = Math.min(maxPurchases, purchasesFromCharacterLevel);
  }

  return maxPurchases;
}

function getSkillSPTotal(
  skillList,
  selectedRace,
  purchases,
  customTextSection = {},
  magicSchoolOrder = []
) {
  const purchaseMap = buildPurchaseMap(purchases, {}, [customTextSection], magicSchoolOrder);

  return skillList.reduce((total, skill) => {
    const purchaseValue = purchases?.[skill.id];

    if (skill.schoolTracks && purchaseValue && typeof purchaseValue === "object") {
      const cost = getRaceAdjustedCost(skill, selectedRace).cost;
      const primaryCount = Number(purchaseValue.primary) || 0;
      const secondaryCount = Number(purchaseValue.secondary) || 0;
      const secondaryMultiplier = skill.secondaryCostMultiplier || 2;
      return total + primaryCount * cost + secondaryCount * cost * secondaryMultiplier;
    }

    if (skill.alignmentTracks && purchaseValue && typeof purchaseValue === "object") {
      const cost = getRaceAdjustedCost(skill, selectedRace).cost;
      const positiveCount = Number(purchaseValue.positive) || 0;
      const negativeCount = Number(purchaseValue.negative) || 0;
      return total + (positiveCount + negativeCount) * cost;
    }

    if (skill.customText && Array.isArray(customTextSection?.[skill.id])) {
      return (
        total +
        customTextSection[skill.id].reduce((customTotal, entry) => {
          const count = Number(entry?.count) || 0;
          const optionId = entry?.text ? getOptionSkillId(skill.id, entry.text) : null;
          const cost = getRaceAdjustedCost(skill, selectedRace, optionId).cost;
          return customTotal + count * cost;
        }, 0)
      );
    }

    const cost = getRaceAdjustedCost(skill, selectedRace).cost;
    const count = purchaseMap[skill.id] || 0;
    return total + count * cost;
  }, 0);
}

function getSkillHPTotal(skillList, purchases, bonusPurchases = {}, customTextSection = {}) {
  const purchaseMap = buildPurchaseMap(purchases, bonusPurchases, [customTextSection]);

  return skillList.reduce((total, skill) => {
    const count = purchaseMap[skill.id] || 0;
    const hpIncrease = skill.hpIncrease || 0;
    return total + count * hpIncrease;
  }, 0);
}

function getHPLimitedMaxPurchases(
  skill,
  currentValue,
  baseMaxPurchases,
  rawBaseHP,
  raceHP,
  rawSkillHP
) {
  const hpIncrease = skill.hpIncrease || 0;

  if (hpIncrease <= 0) return baseMaxPurchases;

  const currentContribution = currentValue * hpIncrease;
  const otherSkillHP = rawSkillHP - currentContribution;
  const remainingHPRoom = Math.max(
    MAX_HP - rawBaseHP - raceHP - otherSkillHP,
    0
  );
  const hpLimitedMax = Math.floor(remainingHPRoom / hpIncrease);

  return Math.min(baseMaxPurchases, hpLimitedMax);
}

// ============================================================
// HELPER FUNCTIONS: PREREQUISITES
// ============================================================
function checkPrerequisite(prerequisite, purchaseMap, unlockedPaths, selectedRace) {
  if (prerequisite.skillId) {
    return (purchaseMap[prerequisite.skillId] || 0) >= prerequisite.minPurchases;
  }

  if (prerequisite.pathSkillId) {
    return (purchaseMap[prerequisite.pathSkillId] || 0) >= prerequisite.minPurchases;
  }

  if (prerequisite.classSkillId) {
    return (purchaseMap[prerequisite.classSkillId] || 0) >= prerequisite.minPurchases;
  }

  if (prerequisite.pathId) {
    return Boolean(unlockedPaths[prerequisite.pathId]);
  }

  if (prerequisite.raceId) {
    return selectedRace?.id === prerequisite.raceId;
  }

  if (prerequisite.tag) {
    const groupedPurchaseIds = TAGGED_PURCHASE_ID_GROUPS[prerequisite.tag];
    if (groupedPurchaseIds) {
      const totalGroupedPurchases = groupedPurchaseIds.reduce(
        (total, skillId) => total + (purchaseMap[skillId] || 0),
        0
      );
      return totalGroupedPurchases >= (prerequisite.minPurchases || 1);
    }

    return Object.entries(purchaseMap).some(([skillId, count]) => {
      if ((count || 0) < (prerequisite.minPurchases || 1)) return false;

      const skill = [
        ...generalSkills,
        ...paths.flatMap((path) => path.skills),
        ...classes.flatMap((classItem) => classItem.skills)
      ].find((item) => item.id === skillId);

      return Boolean(skill?.tags?.includes(prerequisite.tag));
    });
  }

  if (prerequisite.anyOf) {
    return prerequisite.anyOf.some((option) =>
      checkPrerequisite(option, purchaseMap, unlockedPaths, selectedRace)
    );
  }

  return true;
}

function arePrerequisitesMet(item, purchaseMap, unlockedPaths, selectedRace) {
  return (item.prerequisites || []).every((prerequisite) =>
    checkPrerequisite(prerequisite, purchaseMap, unlockedPaths, selectedRace)
  );
}

function getAutoSelectedSkillIdsForRace(raceId) {
  return raceAutoSkillMap[raceId] || [];
}

function formatPurchaseDisplay(skill, purchaseValue, customTextEntries = [], magicSchoolOrder = []) {
  if (skill.schoolTracks) {
    const primary = Number(purchaseValue?.primary) || 0;
    const secondary = Number(purchaseValue?.secondary) || 0;
    const total = primary + secondary;
    if (total <= 0) return "";
    return `Primary ${primary}, Secondary ${secondary}`;
  }

  if (skill.alignmentTracks) {
    const positive = Number(purchaseValue?.positive) || 0;
    const negative = Number(purchaseValue?.negative) || 0;
    const total = positive + negative;
    if (total <= 0) return "";
    return `Positive ${positive}, Negative ${negative}`;
  }

  if (skill.id === "arcane-arts" || skill.id === "divine-arts") {
    const count = Number(purchaseValue) || 0;
    if (count <= 0) return "";
    return getMagicSchoolRoleLabel(skill.id, magicSchoolOrder) || String(count);
  }

  if (skill.customText) {
    const entries = Array.isArray(customTextEntries) ? customTextEntries : [];
    const filtered = entries.filter((entry) => (Number(entry?.count) || 0) > 0 && entry?.text);
    if (filtered.length <= 0) return "";
    return filtered.map((entry) => `${entry.text} ${entry.count}`).join(", ");
  }

  const count = Number(purchaseValue) || 0;
  return count > 0 ? String(count) : "";
}

function App() {
  const AUTOSAVE_KEY = "gisido-character-builder-autosave";
  const STEP_SESSION_KEY = "gisido-character-builder-current-step";

  const getInitialAutosave = () => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return null;
      return fromCompactSaveData(JSON.parse(raw));
    } catch (error) {
      console.error("Failed to read autosave:", error);
      return null;
    }
  };

  const initialAutosave = getInitialAutosave();

  const getInitialStep = () => {
    try {
      const raw = sessionStorage.getItem(STEP_SESSION_KEY);
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 && parsed < steps.length ? parsed : 0;
    } catch (error) {
      return 0;
    }
  };

  const [step, setStep] = useState(getInitialStep());
  const [name, setName] = useState(initialAutosave?.name ?? "");
  const [raceId, setRaceId] = useState(initialAutosave?.raceId ?? (races[0]?.id || ""));
  const [totalXP, setTotalXP] = useState(String(initialAutosave?.totalXP ?? 0));
  const [spEntryMode, setSpEntryMode] = useState(false);
  const [totalSPInput, setTotalSPInput] = useState(String(initialAutosave?.currentSP ?? STARTING_SP));
  const [currentSP, setCurrentSP] = useState(initialAutosave?.currentSP ?? STARTING_SP);
  const [backgroundSkillId, setBackgroundSkillId] = useState(initialAutosave?.backgroundSkillId ?? "");
  const [backgroundCustomText, setBackgroundCustomText] = useState(initialAutosave?.backgroundCustomText ?? "");
  const [generalPurchases, setGeneralPurchases] = useState(initialAutosave?.generalPurchases ?? {});
  const [pathPurchases, setPathPurchases] = useState(initialAutosave?.pathPurchases ?? {});
  const [classPurchases, setClassPurchases] = useState(initialAutosave?.classPurchases ?? {});
  const [customTexts, setCustomTexts] = useState(initialAutosave?.customTexts ?? { general: {}, path: {}, class: {} });
  const [unlockedPaths, setUnlockedPaths] = useState(initialAutosave?.unlockedPaths ?? {});
  const [unlockedClasses, setUnlockedClasses] = useState(initialAutosave?.unlockedClasses ?? {});
  const [generatedSaveCode, setGeneratedSaveCode] = useState("");
  const [loadSaveCode, setLoadSaveCode] = useState("");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [refundMessage, setRefundMessage] = useState("");
  const [prerequisiteRefundMessage, setPrerequisiteRefundMessage] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const selectedRace = useMemo(
    () => races.find((race) => race.id === raceId) || races[0],
    [raceId]
  );

  const numericTotalXP = Math.max(0, parseInt(totalXP, 10) || 0);
  const numericTotalSPInput = Math.max(STARTING_SP, Math.min(MAX_SP, parseInt(totalSPInput, 10) || STARTING_SP));

  const magicSchoolOrder = useMemo(
    () => buildMagicSchoolOrder(generalPurchases, pathPurchases),
    [generalPurchases, pathPurchases]
  );
  const primaryMagicSchool = magicSchoolOrder[0] || null;
  const secondaryMagicSchool = magicSchoolOrder[1] || null;

  const backgroundSkillSection = useMemo(
    () => getSkillSectionById(backgroundSkillId),
    [backgroundSkillId]
  );

  const selectedBackgroundSkill = useMemo(
    () => backgroundSkills.find((skill) => skill.id === backgroundSkillId) || null,
    [backgroundSkillId]
  );

  const backgroundGeneralBonusPurchases = useMemo(
    () => (backgroundSkillSection === "general" && backgroundSkillId ? { [backgroundSkillId]: 1 } : {}),
    [backgroundSkillId, backgroundSkillSection]
  );
  const backgroundPathBonusPurchases = useMemo(
    () => (backgroundSkillSection === "path" && backgroundSkillId ? { [backgroundSkillId]: 1 } : {}),
    [backgroundSkillId, backgroundSkillSection]
  );
  const backgroundClassBonusPurchases = useMemo(
    () => (backgroundSkillSection === "class" && backgroundSkillId ? { [backgroundSkillId]: 1 } : {}),
    [backgroundSkillId, backgroundSkillSection]
  );

  const generalPurchaseMap = useMemo(
    () => buildPurchaseMap(generalPurchases, backgroundGeneralBonusPurchases, [customTexts.general], magicSchoolOrder),
    [generalPurchases, backgroundGeneralBonusPurchases, customTexts.general, magicSchoolOrder]
  );
  const pathPurchaseMap = useMemo(
    () => buildPurchaseMap(pathPurchases, backgroundPathBonusPurchases, [customTexts.path], magicSchoolOrder),
    [pathPurchases, backgroundPathBonusPurchases, customTexts.path, magicSchoolOrder]
  );
  const classPurchaseMap = useMemo(
    () => buildPurchaseMap(classPurchases, backgroundClassBonusPurchases, [customTexts.class], magicSchoolOrder),
    [classPurchases, backgroundClassBonusPurchases, customTexts.class, magicSchoolOrder]
  );

  const allPurchaseMap = useMemo(
    () => ({ ...generalPurchaseMap, ...pathPurchaseMap, ...classPurchaseMap }),
    [generalPurchaseMap, pathPurchaseMap, classPurchaseMap]
  );

  const flattenedPathSkills = useMemo(() => paths.flatMap((path) => path.skills), []);
  const flattenedClassSkills = useMemo(() => classes.flatMap((classItem) => classItem.skills), []);

  const generalSP = getSkillSPTotal(generalSkills, selectedRace, generalPurchases, customTexts.general, magicSchoolOrder);
  const pathSP = getSkillSPTotal(flattenedPathSkills, selectedRace, pathPurchases, customTexts.path, magicSchoolOrder);
  const classSP = getSkillSPTotal(flattenedClassSkills, selectedRace, classPurchases, customTexts.class, magicSchoolOrder);

  const pathUnlockSP = paths.reduce(
    (total, path) => total + (unlockedPaths[path.id] ? getRaceAdjustedPathUnlockCost(path, selectedRace).cost : 0),
    0
  );
  const classUnlockSP = classes.reduce(
    (total, classItem) => total + (unlockedClasses[classItem.id] ? classItem.unlockCost : 0),
    0
  );

  const sp = currentSP;

  const spentSP = generalSP + pathSP + classSP + pathUnlockSP + classUnlockSP;
  const remainingSP = sp - spentSP;
  const spentXP = getSpentXPForSP(sp);
  const availableXP = spEntryMode ? spentXP : numericTotalXP - spentXP;

  const levelData = getLevelData(sp);
  const level = levelData.level;
  const pathsAvailable = levelData.paths || 0;
  const classesAvailable = levelData.classes || 0;
  const rawBaseHP = levelData.baseHP || 0;

  const rawSkillHP =
    getSkillHPTotal(generalSkills, generalPurchases, backgroundGeneralBonusPurchases, customTexts.general) +
    getSkillHPTotal(flattenedPathSkills, pathPurchases, backgroundPathBonusPurchases, customTexts.path) +
    getSkillHPTotal(flattenedClassSkills, classPurchases, backgroundClassBonusPurchases, customTexts.class);

  const totalHP = Math.min(MAX_HP, rawBaseHP + (selectedRace?.hpBonus || 0) + rawSkillHP);
  const skillHP = Math.max(0, totalHP - rawBaseHP - (selectedRace?.hpBonus || 0));
  const baseHP = rawBaseHP;

  useEffect(() => {
    const vitalityPurchases = Number(generalPurchases.vitality) || 0;
    if (vitalityPurchases <= 0) return;

    const uncappedHP = rawBaseHP + (selectedRace?.hpBonus || 0) + rawSkillHP;
    const excessHP = uncappedHP - MAX_HP;
    if (excessHP <= 0) return;

    const refundCount = Math.min(vitalityPurchases, excessHP);
    if (refundCount <= 0) return;

    setGeneralPurchases((previous) => {
      const currentVitality = Number(previous.vitality) || 0;
      const nextVitality = Math.max(0, currentVitality - refundCount);
      const next = { ...previous };

      if (nextVitality > 0) {
        next.vitality = nextVitality;
      } else {
        delete next.vitality;
      }

      return next;
    });

    setRefundMessage(
      `${refundCount} Vitality purchase${refundCount === 1 ? " was" : "s were"} refunded because your character's HP would exceed the ${MAX_HP} HP cap after gaining base HP. The associated SP has been returned.`
    );
  }, [rawBaseHP, selectedRace?.hpBonus, rawSkillHP, generalPurchases.vitality]);

  const availableBackgroundSkills = useMemo(
    () => backgroundSkills.filter((skill) => arePrerequisitesMet(skill, allPurchaseMap, unlockedPaths, selectedRace)),
    [allPurchaseMap, unlockedPaths, selectedRace]
  );

  useEffect(() => {
    if (backgroundSkillId && !availableBackgroundSkills.some((skill) => skill.id === backgroundSkillId)) {
      setBackgroundSkillId("");
      setBackgroundCustomText("");
    }
  }, [availableBackgroundSkills, backgroundSkillId]);

  useEffect(() => {
    const hasPurchaseValue = (value) => {
      if (typeof value === "number") return value > 0;
      if (value && typeof value === "object") {
        return (Number(value.primary) || 0) > 0 || (Number(value.secondary) || 0) > 0;
      }
      return false;
    };

    const removeSkillPurchase = (section, skillId, workingPurchases, workingCustomTexts) => {
      let removed = false;

      if (workingPurchases[skillId] !== undefined) {
        delete workingPurchases[skillId];
        removed = true;
      }

      if (workingCustomTexts[section]?.[skillId] !== undefined) {
        delete workingCustomTexts[section][skillId];
        removed = true;
      }

      return removed;
    };

    const getWorkingPurchaseMap = (workingGeneral, workingPath, workingClass, workingCustomTexts, workingUnlockedPaths) => {
      const workingMagicSchoolOrder = buildMagicSchoolOrder(workingGeneral, workingPath);
      const workingBackgroundSection = getSkillSectionById(backgroundSkillId);
      const workingBackgroundGeneralBonus = workingBackgroundSection === "general" && backgroundSkillId ? { [backgroundSkillId]: 1 } : {};
      const workingBackgroundPathBonus = workingBackgroundSection === "path" && backgroundSkillId ? { [backgroundSkillId]: 1 } : {};
      const workingBackgroundClassBonus = workingBackgroundSection === "class" && backgroundSkillId ? { [backgroundSkillId]: 1 } : {};

      const workingGeneralMap = buildPurchaseMap(workingGeneral, workingBackgroundGeneralBonus, [workingCustomTexts.general], workingMagicSchoolOrder);
      const workingPathMap = buildPurchaseMap(workingPath, workingBackgroundPathBonus, [workingCustomTexts.path], workingMagicSchoolOrder);
      const workingClassMap = buildPurchaseMap(workingClass, workingBackgroundClassBonus, [workingCustomTexts.class], workingMagicSchoolOrder);

      return {
        workingMagicSchoolOrder,
        workingMap: { ...workingGeneralMap, ...workingPathMap, ...workingClassMap },
        workingUnlockedPaths
      };
    };

    let workingGeneral = { ...generalPurchases };
    let workingPath = { ...pathPurchases };
    let workingClass = { ...classPurchases };
    let workingUnlockedPaths = { ...unlockedPaths };
    let workingUnlockedClasses = { ...unlockedClasses };
    let workingCustomTexts = {
      general: { ...(customTexts.general || {}) },
      path: { ...(customTexts.path || {}) },
      class: { ...(customTexts.class || {}) }
    };

    let changed = false;
    let removedNames = [];
    let safetyCounter = 0;

    while (safetyCounter < 25) {
      safetyCounter += 1;
      let passChanged = false;
      const { workingMagicSchoolOrder, workingMap } = getWorkingPurchaseMap(
        workingGeneral,
        workingPath,
        workingClass,
        workingCustomTexts,
        workingUnlockedPaths
      );

      generalSkills.forEach((skill) => {
        const hasPurchase = hasPurchaseValue(workingGeneral[skill.id]) || Boolean(workingCustomTexts.general?.[skill.id]);
        if (!hasPurchase) return;
        if (arePrerequisitesMet(skill, workingMap, workingUnlockedPaths, selectedRace)) return;

        if (removeSkillPurchase("general", skill.id, workingGeneral, workingCustomTexts)) {
          passChanged = true;
          removedNames.push(skill.name);
        }
      });

      paths.forEach((path) => {
        if (workingUnlockedPaths[path.id] && !arePrerequisitesMet(path, workingMap, workingUnlockedPaths, selectedRace)) {
          workingUnlockedPaths[path.id] = false;
          path.skills.forEach((skill) => removeSkillPurchase("path", skill.id, workingPath, workingCustomTexts));
          passChanged = true;
          removedNames.push(`${path.name} Path`);
          return;
        }

        if (!workingUnlockedPaths[path.id]) return;

        path.skills.forEach((skill) => {
          if (skill.schoolTracks && workingPath[skill.id] && typeof workingPath[skill.id] === "object") {
            const nextTrackValue = { ...workingPath[skill.id] };
            let trackChanged = false;

            if ((Number(nextTrackValue.primary) || 0) > 0 && !getSchoolTrackPrerequisiteMet(skill, "primary", workingMap, workingMagicSchoolOrder)) {
              nextTrackValue.primary = 0;
              trackChanged = true;
            }

            if ((Number(nextTrackValue.secondary) || 0) > 0 && !getSchoolTrackPrerequisiteMet(skill, "secondary", workingMap, workingMagicSchoolOrder)) {
              nextTrackValue.secondary = 0;
              trackChanged = true;
            }

            const primaryLaneMax = getSchoolTrackMaxForLane(
              skill,
              "primary",
              workingMap,
              workingMagicSchoolOrder,
              Number.MAX_SAFE_INTEGER
            );
            const secondaryLaneMax = getSchoolTrackMaxForLane(
              skill,
              "secondary",
              workingMap,
              workingMagicSchoolOrder,
              Number.MAX_SAFE_INTEGER
            );

            if ((Number(nextTrackValue.primary) || 0) > primaryLaneMax) {
              nextTrackValue.primary = primaryLaneMax;
              trackChanged = true;
            }

            if ((Number(nextTrackValue.secondary) || 0) > secondaryLaneMax) {
              nextTrackValue.secondary = secondaryLaneMax;
              trackChanged = true;
            }

            if (trackChanged) {
              if ((Number(nextTrackValue.primary) || 0) > 0 || (Number(nextTrackValue.secondary) || 0) > 0) {
                workingPath[skill.id] = nextTrackValue;
              } else {
                delete workingPath[skill.id];
              }
              passChanged = true;
              removedNames.push(skill.name);
            }
          }

          const hasPurchase = hasPurchaseValue(workingPath[skill.id]) || Boolean(workingCustomTexts.path?.[skill.id]);
          if (!hasPurchase) return;
          if (arePrerequisitesMet(skill, workingMap, workingUnlockedPaths, selectedRace)) return;

          if (removeSkillPurchase("path", skill.id, workingPath, workingCustomTexts)) {
            passChanged = true;
            removedNames.push(skill.name);
          }
        });
      });

      classes.forEach((classItem) => {
        const classStillAvailable =
          level >= classItem.requiredLevel &&
          arePrerequisitesMet(classItem, workingMap, workingUnlockedPaths, selectedRace);

        if (workingUnlockedClasses[classItem.id] && !classStillAvailable) {
          workingUnlockedClasses[classItem.id] = false;
          classItem.skills.forEach((skill) => removeSkillPurchase("class", skill.id, workingClass, workingCustomTexts));
          passChanged = true;
          removedNames.push(`${classItem.name} Class`);
          return;
        }

        if (!workingUnlockedClasses[classItem.id]) return;

        classItem.skills.forEach((skill) => {
          const hasPurchase = hasPurchaseValue(workingClass[skill.id]) || Boolean(workingCustomTexts.class?.[skill.id]);
          if (!hasPurchase) return;
          if (arePrerequisitesMet(skill, workingMap, workingUnlockedPaths, selectedRace)) return;

          if (removeSkillPurchase("class", skill.id, workingClass, workingCustomTexts)) {
            passChanged = true;
            removedNames.push(skill.name);
          }
        });
      });

      if (!passChanged) break;
      changed = true;
    }

    if (!changed) return;

    setGeneralPurchases(workingGeneral);
    setPathPurchases(workingPath);
    setClassPurchases(workingClass);
    setUnlockedPaths(workingUnlockedPaths);
    setUnlockedClasses(workingUnlockedClasses);
    setCustomTexts(workingCustomTexts);

    const uniqueRemovedNames = Array.from(new Set(removedNames));
    setPrerequisiteRefundMessage(
      `${uniqueRemovedNames.length === 1 ? uniqueRemovedNames[0] + " was" : uniqueRemovedNames.join(", ") + " were"} removed because prerequisite requirements are no longer met. The associated SP has been refunded.`
    );
  }, [
    generalPurchases,
    pathPurchases,
    classPurchases,
    customTexts,
    unlockedPaths,
    unlockedClasses,
    selectedRace,
    level,
    backgroundSkillId
  ]);

  useEffect(() => {
    const autoSkillIds = getAutoSelectedSkillIdsForRace(raceId);
    setGeneralPurchases((previous) => {
      const next = { ...previous };
      autoRaceSkillIds.forEach((skillId) => {
        if (autoSkillIds.includes(skillId)) {
          next[skillId] = 1;
        } else {
          delete next[skillId];
        }
      });
      return next;
    });
  }, [raceId]);

  const getCustomTextEntries = (section, skillId) => customTexts[section]?.[skillId] || [];

  const setSectionPurchases = (section, updater) => {
    const setter = section === "general" ? setGeneralPurchases : section === "path" ? setPathPurchases : setClassPurchases;
    setter(updater);
  };

  const updatePurchase = (section, skill, value) => {
    const normalized = Math.max(0, Number(value) || 0);
    setSectionPurchases(section, (previous) => {
      const next = { ...previous };
      if (normalized <= 0) delete next[skill.id];
      else next[skill.id] = normalized;
      return next;
    });
  };

  const updateSchoolTrackPurchase = (section, skill, primary, secondary) => {
    const nextPrimary = Math.max(0, Number(primary) || 0);
    const nextSecondary = Math.max(0, Number(secondary) || 0);
    setSectionPurchases(section, (previous) => ({
      ...previous,
      [skill.id]: { primary: nextPrimary, secondary: nextSecondary }
    }));
  };

  const updateAlignmentTrackPurchase = (section, skill, positive, negative) => {
    const nextPositive = Math.max(0, Number(positive) || 0);
    const nextNegative = Math.max(0, Number(negative) || 0);
    setSectionPurchases(section, (previous) => ({
      ...previous,
      [skill.id]: { positive: nextPositive, negative: nextNegative }
    }));
  };

  const getAvailableCantripOptions = () => {
    const availableSchools = [];

    if ((allPurchaseMap["arcane-arts"] || 0) > 0 && (allPurchaseMap["spell-slot-level-1:arcane"] || 0) > 0) {
      availableSchools.push("arcane");
    }

    if ((allPurchaseMap["divine-arts"] || 0) > 0 && (allPurchaseMap["spell-slot-level-1:divine"] || 0) > 0) {
      availableSchools.push("divine");
    }

    return Array.from(
      new Set(availableSchools.flatMap((school) => CANTRIP_OPTIONS_BY_SCHOOL[school] || []))
    ).sort((a, b) => a.localeCompare(b));
  };

  const getOptionChoicesForSkill = (skill) => {
    if (skill.id === "cantrip") return getAvailableCantripOptions();
    return skill.optionChoices || [];
  };

  const addCustomTextEntry = (section, skill) => {
    const optionChoices = getOptionChoicesForSkill(skill);

    setCustomTexts((previous) => {
      const previousEntries = previous[section]?.[skill.id] || [];
      return {
        ...previous,
        [section]: {
          ...previous[section],
          [skill.id]: [...previousEntries, { text: optionChoices[0] || "", count: 1 }]
        }
      };
    });
  };

  const updateCustomText = (section, skillId, index, text) => {
    setCustomTexts((previous) => {
      const entries = [...(previous[section]?.[skillId] || [])];
      if (!entries[index]) return previous;
      entries[index] = { ...entries[index], text };
      return { ...previous, [section]: { ...previous[section], [skillId]: entries } };
    });
  };

  const updateCustomTextCount = (section, skill, index, value) => {
    setCustomTexts((previous) => {
      const entries = [...(previous[section]?.[skill.id] || [])];
      if (!entries[index]) return previous;
      entries[index] = { ...entries[index], count: Math.max(1, Number(value) || 1) };
      return { ...previous, [section]: { ...previous[section], [skill.id]: entries } };
    });
  };

  const removeCustomTextEntry = (section, skillId, index) => {
    setCustomTexts((previous) => {
      const entries = [...(previous[section]?.[skillId] || [])];
      entries.splice(index, 1);
      return { ...previous, [section]: { ...previous[section], [skillId]: entries } };
    });
  };

  const updateBackgroundCustomTextCount = (skill, value) => {
    if (!skill?.customText) return;
    const count = Math.max(1, Number(value) || 1);
    setCustomTexts((previous) => {
      const section = backgroundSkillSection;
      if (!section) return previous;
      const entries = [...(previous[section]?.[skill.id] || [])];
      if (entries.length <= 0) entries.push({ text: backgroundCustomText, count });
      else entries[0] = { ...entries[0], text: entries[0].text || backgroundCustomText, count };
      return { ...previous, [section]: { ...previous[section], [skill.id]: entries } };
    });
  };

  const getBackgroundCustomTextPaidCount = (skillId) => {
    const section = backgroundSkillSection;
    if (!section) return 0;
    const entry = customTexts[section]?.[skillId]?.[0];
    return Math.max((Number(entry?.count) || 0) - 1, 0);
  };

  const renderCost = (skill, matchIdOverride = null) => {
    const adjusted = getRaceAdjustedCost(skill, selectedRace, matchIdOverride);
    return `${adjusted.cost} SP`;
  };

  const buySP = () => {
    const nextSP = sp + 1;
    if (nextSP > MAX_SP || getSpentXPForSP(nextSP) > numericTotalXP) return;
    setCurrentSP(nextSP);
  };

  const buyAllAvailableSP = () => {
    let nextSP = sp;
    while (nextSP < MAX_SP && getSpentXPForSP(nextSP + 1) <= numericTotalXP) {
      nextSP += 1;
    }
    setCurrentSP(nextSP);
    setTotalSPInput(String(nextSP));
  };

  const applyDirectSP = () => {
    const nextSP = Math.max(STARTING_SP, Math.min(MAX_SP, parseInt(totalSPInput, 10) || STARTING_SP));
    setCurrentSP(nextSP);
    setTotalSPInput(String(nextSP));
  };

  const toggleSPEntryMode = () => {
    setSpEntryMode((previous) => {
      const nextMode = !previous;
      if (!previous) setTotalSPInput(String(sp));
      return nextMode;
    });
  };

  const resetCharacter = () => {
    localStorage.removeItem(AUTOSAVE_KEY);
    sessionStorage.removeItem(STEP_SESSION_KEY);
    setStep(0);
    setName("");
    setRaceId(races[0]?.id || "");
    setTotalXP("0");
    setSpEntryMode(false);
    setTotalSPInput(String(STARTING_SP));
    setCurrentSP(STARTING_SP);
    setBackgroundSkillId("");
    setBackgroundCustomText("");
    setGeneralPurchases({});
    setPathPurchases({});
    setClassPurchases({});
    setCustomTexts({ general: {}, path: {}, class: {} });
    setUnlockedPaths({});
    setUnlockedClasses({});
    setGeneratedSaveCode("");
    setLoadSaveCode("");
  };

  const unlockPath = (path) => {
    const adjustedUnlockCost = getRaceAdjustedPathUnlockCost(path, selectedRace).cost;
    if (remainingSP < adjustedUnlockCost) {
      alert("Not enough remaining SP to unlock this path.");
      return;
    }
    if (Object.values(unlockedPaths).filter(Boolean).length >= pathsAvailable) {
      alert("You do not have another path slot available.");
      return;
    }
    setUnlockedPaths((previous) => ({ ...previous, [path.id]: true }));
  };

  const unpurchasePath = (path) => {
    setUnlockedPaths((previous) => ({ ...previous, [path.id]: false }));
    setPathPurchases((previous) => {
      const next = { ...previous };
      path.skills.forEach((skill) => delete next[skill.id]);
      return next;
    });
    setCustomTexts((previous) => {
      const nextPath = { ...previous.path };
      path.skills.forEach((skill) => delete nextPath[skill.id]);
      return { ...previous, path: nextPath };
    });
  };

  const unlockClass = (classItem) => {
    if (remainingSP < classItem.unlockCost) {
      alert("Not enough remaining SP to unlock this class.");
      return;
    }
    if (Object.values(unlockedClasses).filter(Boolean).length >= classesAvailable) {
      alert("You do not have another class slot available.");
      return;
    }
    setUnlockedClasses((previous) => ({ ...previous, [classItem.id]: true }));
  };

  const unpurchaseClass = (classItem) => {
    setUnlockedClasses((previous) => ({ ...previous, [classItem.id]: false }));
    setClassPurchases((previous) => {
      const next = { ...previous };
      classItem.skills.forEach((skill) => delete next[skill.id]);
      return next;
    });
    setCustomTexts((previous) => {
      const nextClass = { ...previous.class };
      classItem.skills.forEach((skill) => delete nextClass[skill.id]);
      return { ...previous, class: nextClass };
    });
  };


  useEffect(() => {
    try {
      sessionStorage.setItem(STEP_SESSION_KEY, String(step));
    } catch (error) {
      console.error("Failed to save current step:", error);
    }
  }, [step]);

  useEffect(() => {
    try {
      const data = {
        name,
        raceId,
        totalXP: numericTotalXP,
        currentSP,
        backgroundSkillId,
        backgroundCustomText,
        generalPurchases,
        pathPurchases,
        classPurchases,
        customTexts,
        unlockedPaths,
        unlockedClasses
      };

      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toCompactSaveData(data)));
    } catch (error) {
      console.error("Failed to autosave character:", error);
    }
  }, [
    name,
    raceId,
    numericTotalXP,
    currentSP,
    backgroundSkillId,
    backgroundCustomText,
    generalPurchases,
    pathPurchases,
    classPurchases,
    customTexts,
    unlockedPaths,
    unlockedClasses,
    step
  ]);

  const generateSaveCode = () => {
    const data = {
      name,
      raceId,
      totalXP: numericTotalXP,
      currentSP: sp,
      backgroundSkillId,
      backgroundCustomText,
      generalPurchases,
      pathPurchases,
      classPurchases,
      customTexts,
      unlockedPaths,
      unlockedClasses,
      step
    };
    setGeneratedSaveCode(encodeSaveData(toCompactSaveData(data)));
  };

  const loadCharacterFromCode = () => {
    try {
      const decoded = decodeSaveData(loadSaveCode.trim());
      const data = fromCompactSaveData(decoded);
      setName(data.name || "");
      setRaceId(data.raceId || races[0]?.id || "");
      setTotalXP(String(data.totalXP || 0));
      setSpEntryMode(false);
      const loadedSP = Math.max(STARTING_SP, Math.min(MAX_SP, Number(data.currentSP) || STARTING_SP));
      setCurrentSP(loadedSP);
      setTotalSPInput(String(loadedSP));
      setBackgroundSkillId(data.backgroundSkillId || "");
      setBackgroundCustomText(data.backgroundCustomText || "");
      setGeneralPurchases(data.generalPurchases || {});
      setPathPurchases(data.pathPurchases || {});
      setClassPurchases(data.classPurchases || {});
      setCustomTexts(data.customTexts || { general: {}, path: {}, class: {} });
      setUnlockedPaths(data.unlockedPaths || {});
      setUnlockedClasses(data.unlockedClasses || {});
      setStep(Number(data.step) || 0);
    } catch (error) {
      alert("That save code could not be loaded.");
    }
  };

  const renderSkillInput = (section, skill, sectionPurchases, locked = false) => {
    const backgroundBonus = backgroundSkillId === skill.id && backgroundSkillSection === section ? 1 : 0;
    const customTextCount = skill.customText && skill.repeatable
      ? getCustomTextEntries(section, skill.id).reduce((total, entry) => total + (Number(entry?.count) || 0), 0)
      : 0;

    const schoolTrackValue = skill.schoolTracks && sectionPurchases[skill.id] && typeof sectionPurchases[skill.id] === "object"
      ? sectionPurchases[skill.id]
      : { primary: 0, secondary: 0 };
    const schoolTrackCount = (Number(schoolTrackValue.primary) || 0) + (Number(schoolTrackValue.secondary) || 0);

    const alignmentTrackValue = skill.alignmentTracks && sectionPurchases[skill.id] && typeof sectionPurchases[skill.id] === "object"
      ? sectionPurchases[skill.id]
      : { positive: 0, negative: 0 };
    const alignmentTrackCount = (Number(alignmentTrackValue.positive) || 0) + (Number(alignmentTrackValue.negative) || 0);

    let currentValue = (Number(sectionPurchases[skill.id]) || 0) + backgroundBonus;
    if (skill.schoolTracks) currentValue = schoolTrackCount;
    if (skill.alignmentTracks) currentValue = alignmentTrackCount;
    if (skill.customText && skill.repeatable) currentValue = customTextCount + backgroundBonus;

    const baseMaxPurchases = getSkillMaxPurchases(skill, level, allPurchaseMap);
    const maxPurchases = getHPLimitedMaxPurchases(
      skill,
      currentValue,
      baseMaxPurchases,
      rawBaseHP,
      selectedRace.hpBonus,
      rawSkillHP
    );
    const prerequisitesMet = arePrerequisitesMet(skill, allPurchaseMap, unlockedPaths, selectedRace);
    const isLocked = locked || !prerequisitesMet || maxPurchases <= 0;

    if (skill.schoolTracks) {
      const remainingRoom = Math.max(maxPurchases - currentValue, 0);
      const currentPrimaryCount = Number(schoolTrackValue.primary) || 0;
      const currentSecondaryCount = Number(schoolTrackValue.secondary) || 0;
      const primaryTrackUnlocked = getSchoolTrackPrerequisiteMet(skill, "primary", allPurchaseMap, magicSchoolOrder);
      const secondaryTrackUnlocked = Boolean(secondaryMagicSchool) && getSchoolTrackPrerequisiteMet(skill, "secondary", allPurchaseMap, magicSchoolOrder);
      const primaryLaneMax = getSchoolTrackMaxForLane(skill, "primary", allPurchaseMap, magicSchoolOrder, maxPurchases);
      const secondaryLaneMax = getSchoolTrackMaxForLane(skill, "secondary", allPurchaseMap, magicSchoolOrder, maxPurchases);
      const maxPrimary = primaryTrackUnlocked ? Math.min(currentPrimaryCount + remainingRoom, primaryLaneMax) : currentPrimaryCount;
      const maxSecondary = secondaryTrackUnlocked ? Math.min(currentSecondaryCount + remainingRoom, secondaryLaneMax) : currentSecondaryCount;

      return (
        <div style={styles.dualTrackBox}>
          <label style={styles.dualTrackLabel}>
            Primary{primaryMagicSchool ? ` (${primaryMagicSchool})` : ""}
            <input
              type="number"
              min="0"
              max={maxPrimary}
              value={schoolTrackValue.primary || 0}
              disabled={isLocked || !primaryMagicSchool || !primaryTrackUnlocked}
              onChange={(event) => {
                const nextPrimary = Math.max(0, Number(event.target.value) || 0);
                const nextSecondary = Number(schoolTrackValue.secondary) || 0;
                if (nextPrimary > maxPrimary) return;
                if (nextPrimary + nextSecondary > maxPurchases) return;
                updateSchoolTrackPurchase(section, skill, nextPrimary, nextSecondary);
              }}
              style={styles.countInput}
            />
          </label>
          <label style={styles.dualTrackLabel}>
            Secondary{secondaryMagicSchool ? ` (${secondaryMagicSchool})` : ""}
            <input
              type="number"
              min="0"
              max={maxSecondary}
              value={schoolTrackValue.secondary || 0}
              disabled={isLocked || !secondaryTrackUnlocked}
              onChange={(event) => {
                if (!secondaryTrackUnlocked) return;
                const nextSecondary = Math.max(0, Number(event.target.value) || 0);
                const nextPrimary = Number(schoolTrackValue.primary) || 0;
                if (nextSecondary > maxSecondary) return;
                if (nextPrimary + nextSecondary > maxPurchases) return;
                updateSchoolTrackPurchase(section, skill, nextPrimary, nextSecondary);
              }}
              style={styles.countInput}
            />
          </label>
        </div>
      );
    }

    if (skill.alignmentTracks) {
      const remainingRoom = Math.max(maxPurchases - currentValue, 0);
      const currentPositiveCount = Number(alignmentTrackValue.positive) || 0;
      const currentNegativeCount = Number(alignmentTrackValue.negative) || 0;
      const maxPositive = currentPositiveCount + remainingRoom;
      const maxNegative = currentNegativeCount + remainingRoom;

      return (
        <div style={styles.dualTrackBox}>
          <label style={styles.dualTrackLabel}>
            Positive
            <input
              type="number"
              min="0"
              max={maxPositive}
              value={alignmentTrackValue.positive || 0}
              disabled={isLocked}
              onChange={(event) => {
                const nextPositive = Math.max(0, Number(event.target.value) || 0);
                const nextNegative = Number(alignmentTrackValue.negative) || 0;
                if (nextPositive > maxPositive) return;
                if (nextPositive + nextNegative > maxPurchases) return;
                updateAlignmentTrackPurchase(section, skill, nextPositive, nextNegative);
              }}
              style={styles.countInput}
            />
          </label>
          <label style={styles.dualTrackLabel}>
            Negative
            <input
              type="number"
              min="0"
              max={maxNegative}
              value={alignmentTrackValue.negative || 0}
              disabled={isLocked}
              onChange={(event) => {
                const nextNegative = Math.max(0, Number(event.target.value) || 0);
                const nextPositive = Number(alignmentTrackValue.positive) || 0;
                if (nextNegative > maxNegative) return;
                if (nextPositive + nextNegative > maxPurchases) return;
                updateAlignmentTrackPurchase(section, skill, nextPositive, nextNegative);
              }}
              style={styles.countInput}
            />
          </label>
        </div>
      );
    }

    if (skill.customText && skill.repeatable) {
      const optionChoices = getOptionChoicesForSkill(skill);
      const hasRequiredOptionChoice = !skill.optionChoices || optionChoices.length > 0;

      return (
        <button
          type="button"
          style={styles.smallButton}
          disabled={isLocked || currentValue >= maxPurchases || !hasRequiredOptionChoice}
          onClick={() => addCustomTextEntry(section, skill)}
        >
          Add Entry
        </button>
      );
    }

    if (!skill.repeatable) {
      return (
        <input
          type="checkbox"
          checked={currentValue > 0}
          disabled={isLocked || backgroundBonus > 0}
          onChange={(event) => updatePurchase(section, skill, event.target.checked ? 1 : 0)}
        />
      );
    }

    return (
      <input
        type="number"
        min={backgroundBonus}
        max={maxPurchases}
        value={currentValue}
        disabled={isLocked}
        onChange={(event) => updatePurchase(section, skill, Math.max((Number(event.target.value) || 0) - backgroundBonus, 0))}
        style={styles.numberInput}
      />
    );
  };

  const renderCustomTextInput = (section, skill, locked) => {
    if (!skill.customText) return null;

    const prerequisitesMet = arePrerequisitesMet(skill, allPurchaseMap, unlockedPaths, selectedRace);
    const isLocked = locked || !prerequisitesMet;
    const hasBackgroundFreeEntry = section === backgroundSkillSection && backgroundSkillId === skill.id && Boolean(backgroundCustomText);
    const entries = getCustomTextEntries(section, skill.id);
    const displayEntries = hasBackgroundFreeEntry
      ? [{ text: backgroundCustomText, count: 1, isBackgroundEntry: true }, ...entries]
      : entries;

    if (displayEntries.length <= 0) return null;

    return (
      <div style={styles.customTextList}>
        {displayEntries.map((entry, index) => {
          const isBackgroundEntry = Boolean(entry.isBackgroundEntry);
          const actualIndex = hasBackgroundFreeEntry ? index - 1 : index;

          return (
            <div key={`${skill.id}-${index}`} style={styles.customTextRow}>
              <label style={{ ...styles.customFieldLabel, flex: 1, marginTop: 0 }}>
                {skill.customTextLabel || "Custom Value"}
                {skill.optionChoices ? (
                  <select
                    value={entry.text}
                    disabled={isLocked || isBackgroundEntry}
                    onChange={(event) => {
                      if (isBackgroundEntry) return;
                      updateCustomText(section, skill.id, actualIndex, event.target.value);
                    }}
                    style={styles.input}
                  >
                    {getOptionChoicesForSkill(skill).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={entry.text}
                    disabled={isLocked || isBackgroundEntry}
                    placeholder={skill.customTextPlaceholder || "Type here"}
                    onChange={(event) => {
                      if (isBackgroundEntry) return;
                      updateCustomText(section, skill.id, actualIndex, event.target.value);
                    }}
                    style={styles.input}
                  />
                )}
              </label>
              {skill.id !== "cantrip" && skill.id !== "alignment" && (
                <input
                  type="number"
                  min="1"
                  value={entry.count}
                  onChange={(event) => {
                    if (isBackgroundEntry) updateBackgroundCustomTextCount(skill, event.target.value);
                    else updateCustomTextCount(section, skill, actualIndex, event.target.value);
                  }}
                  disabled={isLocked}
                  style={styles.countInput}
                />
              )}
              <button
                type="button"
                style={styles.dangerButton}
                disabled={isLocked || isBackgroundEntry}
                onClick={() => removeCustomTextEntry(section, skill.id, actualIndex)}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSkillCard = (section, skill, sectionPurchases, locked = false) => {
    const backgroundBonus = backgroundSkillId === skill.id && backgroundSkillSection === section ? 1 : 0;
    const customTextCount = skill.customText && skill.repeatable
      ? getCustomTextEntries(section, skill.id).reduce((total, entry) => total + (Number(entry?.count) || 0), 0)
      : 0;
    const schoolTrackValue = skill.schoolTracks && sectionPurchases[skill.id] && typeof sectionPurchases[skill.id] === "object"
      ? sectionPurchases[skill.id]
      : { primary: 0, secondary: 0 };
    const schoolTrackCount = (Number(schoolTrackValue.primary) || 0) + (Number(schoolTrackValue.secondary) || 0);
    const alignmentTrackValue = skill.alignmentTracks && sectionPurchases[skill.id] && typeof sectionPurchases[skill.id] === "object"
      ? sectionPurchases[skill.id]
      : { positive: 0, negative: 0 };
    const alignmentTrackCount = (Number(alignmentTrackValue.positive) || 0) + (Number(alignmentTrackValue.negative) || 0);
    const currentValue = skill.schoolTracks
      ? schoolTrackCount
      : skill.alignmentTracks
        ? alignmentTrackCount
        : skill.customText && skill.repeatable
        ? customTextCount + backgroundBonus
        : (Number(sectionPurchases[skill.id]) || 0) + backgroundBonus;
    const baseMaxPurchases = getSkillMaxPurchases(skill, level, allPurchaseMap);
    const maxPurchases = getHPLimitedMaxPurchases(skill, currentValue, baseMaxPurchases, rawBaseHP, selectedRace.hpBonus, rawSkillHP);
    const prerequisitesMet = arePrerequisitesMet(skill, allPurchaseMap, unlockedPaths, selectedRace);
    const isLocked = locked || !prerequisitesMet || maxPurchases <= 0;

    return (
      <div key={skill.id} style={{ ...styles.card, ...(isLocked ? styles.lockedCard : {}) }} title={`${skill.description}

Prerequisite: ${skill.prerequisiteText}`}>
        <div style={styles.cardHeader}>
          <div>
            <h3 style={styles.cardTitle}>
              {skill.name}
              {getMagicSchoolRoleLabel(skill.id, magicSchoolOrder) ? ` (${getMagicSchoolRoleLabel(skill.id, magicSchoolOrder)})` : ""}
            </h3>
            <p style={styles.muted}>{skill.shortDescription}</p>
          </div>
          <div style={styles.purchaseBox}>{renderSkillInput(section, skill, sectionPurchases, locked)}</div>
        </div>

        <div style={styles.metaGrid}>
          <span><strong>Cost:</strong> {renderCost(skill)}</span>
          <span><strong>Prerequisite:</strong> {skill.prerequisiteText}</span>
          <span><strong>Purchased:</strong> {currentValue} / {maxPurchases}{skill.schoolTracks ? ` (Primary ${schoolTrackValue.primary || 0}, Secondary ${schoolTrackValue.secondary || 0})` : ""}{skill.alignmentTracks ? ` (Positive ${alignmentTrackValue.positive || 0}, Negative ${alignmentTrackValue.negative || 0})` : ""}{backgroundBonus > 0 ? " (includes 1 free background purchase)" : ""}</span>
          {(skill.hpIncrease || 0) > 0 && skill.id !== "vitality" && <span><strong>HP Increase:</strong> +{skill.hpIncrease} per purchase</span>}
        </div>

        {renderCustomTextInput(section, skill, locked)}
        {isLocked && <p style={styles.warning}>Locked until prerequisite is met.</p>}
      </div>
    );
  };

  const purchasedGeneralSkillSummaries = useMemo(() => {
    return generalSkills
      .map((skill) => {
        const customEntries = getCustomTextEntries("general", skill.id);
        const purchaseValue = generalPurchases[skill.id];
        const backgroundBonus = backgroundSkillId === skill.id && backgroundSkillSection === "general" ? 1 : 0;

        if (skill.customText) {
          const entries = [...customEntries];
          if (backgroundBonus > 0 && backgroundCustomText) {
            if (entries.length > 0) {
              entries[0] = { ...entries[0], text: entries[0].text || backgroundCustomText, count: (Number(entries[0].count) || 0) + 1 };
            } else {
              entries.push({ text: backgroundCustomText, count: 1 });
            }
          }
          const display = formatPurchaseDisplay(skill, purchaseValue, entries, magicSchoolOrder);
          return display ? { name: skill.name, value: display } : null;
        }

        if (skill.schoolTracks) {
          const display = formatPurchaseDisplay(skill, purchaseValue, [], magicSchoolOrder);
          return display ? { name: skill.name, value: display } : null;
        }

        const totalCount = (Number(purchaseValue) || 0) + backgroundBonus;
        const display = formatPurchaseDisplay(skill, totalCount, [], magicSchoolOrder);
        return display ? { name: skill.name, value: display } : null;
      })
      .filter(Boolean);
  }, [generalPurchases, backgroundSkillId, backgroundSkillSection, backgroundCustomText, customTexts.general]);

  const purchasedPathSummaries = useMemo(() => {
    return paths
      .filter((path) => unlockedPaths[path.id])
      .map((path) => ({
        id: path.id,
        name: path.name,
        skills: path.skills
          .map((skill) => {
            const customEntries = getCustomTextEntries("path", skill.id);
            const purchaseValue = pathPurchases[skill.id];
            const backgroundBonus = backgroundSkillId === skill.id && backgroundSkillSection === "path" ? 1 : 0;

            if (skill.customText) {
              const entries = [...customEntries];
              if (backgroundBonus > 0 && backgroundCustomText) {
                if (entries.length > 0) {
                  entries[0] = { ...entries[0], text: entries[0].text || backgroundCustomText, count: (Number(entries[0].count) || 0) + 1 };
                } else {
                  entries.push({ text: backgroundCustomText, count: 1 });
                }
              }
              const display = formatPurchaseDisplay(skill, purchaseValue, entries, magicSchoolOrder);
              return display ? { name: skill.name, value: display } : null;
            }

            if (skill.schoolTracks) {
              const display = formatPurchaseDisplay(skill, purchaseValue, [], magicSchoolOrder);
              return display ? { name: skill.name, value: display } : null;
            }

            if (skill.id === "arcane-arts" || skill.id === "divine-arts") {
              const totalCount = (Number(purchaseValue) || 0) + backgroundBonus;
              const display = formatPurchaseDisplay(skill, totalCount, customEntries, magicSchoolOrder);
              return display ? { name: skill.name, value: display } : null;
            }

            const totalCount = (Number(purchaseValue) || 0) + backgroundBonus;
            const display = formatPurchaseDisplay(skill, totalCount, customEntries, magicSchoolOrder);
            return display ? { name: skill.name, value: display } : null;
          })
          .filter(Boolean)
      }));
  }, [unlockedPaths, pathPurchases, backgroundSkillId, backgroundSkillSection, backgroundCustomText, customTexts.path]);

  const purchasedClassSummaries = useMemo(() => {
    return classes
      .filter((classItem) => unlockedClasses[classItem.id])
      .map((classItem) => ({
        id: classItem.id,
        name: classItem.name,
        skills: classItem.skills
          .map((skill) => {
            const customEntries = getCustomTextEntries("class", skill.id);
            const purchaseValue = classPurchases[skill.id];
            if (skill.customText) {
              const display = formatPurchaseDisplay(skill, purchaseValue, customEntries, magicSchoolOrder);
              return display ? { name: skill.name, value: display } : null;
            }
            if (skill.schoolTracks) {
              const display = formatPurchaseDisplay(skill, purchaseValue, [], magicSchoolOrder);
              return display ? { name: skill.name, value: display } : null;
            }
            const display = formatPurchaseDisplay(skill, purchaseValue, customEntries, magicSchoolOrder);
            return display ? { name: skill.name, value: display } : null;
          })
          .filter(Boolean)
      }));
  }, [unlockedClasses, classPurchases, customTexts.class]);

  const renderBasics = () => (
    <section style={styles.section}>
      <div style={styles.formGrid}>
        <label style={styles.label}>
          Character Name
          <input style={styles.input} placeholder="Character Name" value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label style={styles.label}>
          Race
          <select style={styles.input} value={raceId} onChange={(event) => setRaceId(event.target.value)}>
            {races.map((race) => <option key={race.id} value={race.id}>{race.name}</option>)}
          </select>
        </label>

        <label style={styles.label}>
          Background Skill
          <select
            style={styles.input}
            value={backgroundSkillId}
            onChange={(event) => {
              const nextSkillId = event.target.value;
              const nextSkill = backgroundSkills.find((skill) => skill.id === nextSkillId);
              setBackgroundSkillId(nextSkillId);
              if (nextSkill?.optionChoices?.length) setBackgroundCustomText(nextSkill.optionChoices[0]);
              else if (!nextSkill?.customText) setBackgroundCustomText("");
            }}
          >
            <option value="">None</option>
            {availableBackgroundSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
          </select>
        </label>

        <label style={styles.label}>
          {spEntryMode ? "Total SP" : "Total XP"}
          <input
            style={styles.input}
            type="number"
            min={spEntryMode ? STARTING_SP : 0}
            max={spEntryMode ? MAX_SP : undefined}
            value={spEntryMode ? totalSPInput : totalXP}
            onFocus={(event) => event.target.select()}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (spEntryMode) {
                if (nextValue === "") {
                  setTotalSPInput("");
                  return;
                }
                setTotalSPInput(nextValue.replace(/[^0-9]/g, ""));
                return;
              }

              if (nextValue === "") {
                setTotalXP("");
                return;
              }
              setTotalXP(String(Math.max(0, parseInt(nextValue, 10) || 0)));
            }}
          />
        </label>
      </div>

      <div style={styles.summaryGrid}>
        <SummaryCard label="Level" value={level} />
        <SummaryCard label="Total SP" value={sp} />
        <SummaryCard label="Remaining SP" value={remainingSP} danger={remainingSP < 0} />
        <SummaryCard label={spEntryMode ? "Required XP" : "Available XP"} value={spEntryMode ? availableXP : `${availableXP} / ${numericTotalXP}`} />
        <SummaryCard label="Paths Available" value={pathsAvailable} />
        <SummaryCard label="Classes Available" value={classesAvailable} />
        <SummaryCard label="Base HP" value={baseHP} />
        <SummaryCard label="Skill HP" value={skillHP} />
        <SummaryCard label="Total HP" value={`${totalHP} / ${MAX_HP}`} />
      </div>

      <div style={styles.buttonRow}>
        <button type="button" style={styles.secondaryButton} onClick={toggleSPEntryMode}>
          {spEntryMode ? "Toggle XP" : "Toggle SP"}
        </button>
        {!spEntryMode && <button style={styles.button} onClick={buySP}>Purchase 1 SP</button>}
        <button style={styles.button} onClick={spEntryMode ? applyDirectSP : buyAllAvailableSP}>
          {spEntryMode ? "Apply SP" : "Purchase All Available SP"}
        </button>
        <button style={styles.secondaryButton} onClick={resetCharacter}>Clear Character</button>
      </div>

      {backgroundSkillId && (
        <div style={styles.card}>
          <h3>Background Skill</h3>
          <p><strong>Section:</strong> {backgroundSkillSection === "path" ? "Path Skill" : backgroundSkillSection === "class" ? "Class Skill" : "General Skill"}</p>
          <p><strong>Selected:</strong> {selectedBackgroundSkill?.name}</p>
          {selectedBackgroundSkill?.customText && (
            <label style={styles.customFieldLabel}>
              {selectedBackgroundSkill.customTextLabel || "Custom Value"}
              {selectedBackgroundSkill.optionChoices ? (
                <select value={backgroundCustomText} onChange={(event) => setBackgroundCustomText(event.target.value)} style={styles.input}>
                  {selectedBackgroundSkill.optionChoices.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input type="text" value={backgroundCustomText} placeholder={selectedBackgroundSkill.customTextPlaceholder || "Type here"} onChange={(event) => setBackgroundCustomText(event.target.value)} style={styles.input} />
              )}
            </label>
          )}
          <p style={styles.muted}>This grants 1 free purchase of the selected background skill and counts toward prerequisites and purchase totals, but does not cost SP. Background skills must still qualify for the base skill’s prerequisites.</p>
        </div>
      )}

      <div style={styles.card}>
        <h3>{selectedRace.name}</h3>
        <p><strong>Benefit:</strong> {selectedRace.benefit}</p>
        <p><strong>Detriment:</strong> {selectedRace.detriment}</p>
      </div>
    </section>
  );

  const renderGeneralSkills = () => (
    <section style={styles.section}>
      <p style={styles.muted}>Hover over a skill card to see its full description and prerequisite text.</p>
      {generalSkills.map((skill) => renderSkillCard("general", skill, generalPurchases))}
    </section>
  );

  const renderPaths = () => (
    <section style={styles.section}>
      <p style={styles.muted}>Unpurchased paths are collapsed.</p>
      {paths.map((path) => {
        const unlocked = Boolean(unlockedPaths[path.id]);
        const prerequisitesMet = arePrerequisitesMet(path, allPurchaseMap, unlockedPaths, selectedRace);

        return (
          <div key={path.id} style={styles.groupBox}>
            <div style={styles.groupHeader}>
              <div>
                <h3>{path.name} Path</h3>
                <p><strong>Unlock Cost:</strong> {getRaceAdjustedPathUnlockCost(path, selectedRace).cost} SP</p>
                {unlocked && <p style={styles.muted}>{path.description}</p>}
              </div>

              {unlocked ? (
                <button style={styles.dangerButton} onClick={() => unpurchasePath(path)}>Un-purchase Path</button>
              ) : (
                <button style={styles.button} disabled={!prerequisitesMet} onClick={() => unlockPath(path)}>Unlock Path</button>
              )}
            </div>

            {!unlocked && !prerequisitesMet && <p style={styles.warning}>Locked until prerequisite is met.</p>}
            {unlocked && path.skills.map((skill) => renderSkillCard("path", skill, pathPurchases, false))}
          </div>
        );
      })}
    </section>
  );

  const renderClasses = () => (
    <section style={styles.section}>
      <p style={styles.muted}>Unpurchased classes are collapsed. Classes require level 10 and their listed prerequisites.</p>
      {classes.map((classItem) => {
        const unlocked = Boolean(unlockedClasses[classItem.id]);
        const levelMet = level >= classItem.requiredLevel;
        const prerequisitesMet = arePrerequisitesMet(classItem, allPurchaseMap, unlockedPaths, selectedRace);

        return (
          <div key={classItem.id} style={styles.groupBox} title={`${classItem.description}

Prerequisite: ${classItem.prerequisiteText}`}>
            <div style={styles.groupHeader}>
              <div>
                <h3>{classItem.name} Class</h3>
                <p><strong>Unlock Cost:</strong> {classItem.unlockCost} SP</p>
                <p><strong>Prerequisite:</strong> {classItem.prerequisiteText}</p>
              </div>

              {unlocked ? (
                <button style={styles.dangerButton} onClick={() => unpurchaseClass(classItem)}>Un-purchase Class</button>
              ) : (
                <button style={styles.button} disabled={!levelMet || !prerequisitesMet} onClick={() => unlockClass(classItem)}>Unlock Class</button>
              )}
            </div>

            {!unlocked && !levelMet && <p style={styles.warning}>Class selection unlocks at level {classItem.requiredLevel}.</p>}
            {!unlocked && levelMet && !prerequisitesMet && <p style={styles.warning}>Locked until prerequisite is met.</p>}
            {unlocked && classItem.skills.map((skill) => renderSkillCard("class", skill, classPurchases, false))}
          </div>
        );
      })}
    </section>
  );

  const getCharacterSummaryText = () => {
    const lines = [];

    lines.push("Character Summary");
    lines.push(`Name: ${name || "Unnamed Character"}`);
    lines.push(`Race: ${selectedRace.name}`);
    lines.push(`Background Skill: ${selectedBackgroundSkill?.name || "None"}`);
    if (selectedBackgroundSkill?.customText && backgroundCustomText) {
      lines.push(`Background Detail: ${backgroundCustomText}`);
    }
    lines.push(`Level: ${level}`);
    lines.push(`Total SP: ${sp}`);
    lines.push(`Remaining SP: ${remainingSP}`);
    if (spEntryMode) {
      lines.push(`Required XP: ${availableXP}`);
    } else {
      lines.push(`Total XP: ${numericTotalXP}`);
      lines.push(`Remaining XP: ${availableXP}`);
    }
    lines.push(`Total HP: ${totalHP}`);
    lines.push("");

    lines.push("Purchased General Skills");
    if (purchasedGeneralSkillSummaries.length > 0) {
      purchasedGeneralSkillSummaries.forEach((item) => {
        lines.push(`  ${item.name}: ${item.value}`);
      });
    } else {
      lines.push("  No general skills purchased.");
    }
    lines.push("");

    lines.push("Purchased Paths");
    if (purchasedPathSummaries.length > 0) {
      purchasedPathSummaries.forEach((path) => {
        lines.push(path.name);
        if (path.skills.length > 0) {
          path.skills.forEach((skill) => {
            lines.push(`  ${skill.name}: ${skill.value}`);
          });
        } else {
          lines.push("  No skills purchased in this path.");
        }
        lines.push("");
      });
    } else {
      lines.push("  No paths purchased.");
      lines.push("");
    }

    lines.push("Purchased Classes");
    if (purchasedClassSummaries.length > 0) {
      purchasedClassSummaries.forEach((classItem) => {
        lines.push(classItem.name);
        if (classItem.skills.length > 0) {
          classItem.skills.forEach((skill) => {
            lines.push(`  ${skill.name}: ${skill.value}`);
          });
        } else {
          lines.push("  No skills purchased in this class.");
        }
        lines.push("");
      });
    } else {
      lines.push("  No classes purchased.");
    }

    return lines.join("\n");
  };

  const copyCharacterSummary = async () => {
    const summaryText = getCharacterSummaryText();

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(summaryText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = summaryText;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyStatus("Copied!");
    } catch (error) {
      setCopyStatus("Copy failed. Please select and copy the summary manually.");
    }

    window.setTimeout(() => setCopyStatus(""), 2500);
  };

  const renderExportPage = () => (
    <section style={styles.section}>
      <p style={styles.muted}></p>
      <div style={styles.exportActions}>
        <button type="button" style={styles.button} onClick={copyCharacterSummary}>Copy Summary</button>
        {copyStatus && <span style={styles.copyStatus}>{copyStatus}</span>}
      </div>
      <div style={styles.exportSheet}>
        <div style={styles.exportSection}>
          <h3 style={styles.exportTitle}>Character Summary</h3>
          <div style={styles.exportGrid}>
            <div><strong>Name:</strong> {name || "Unnamed Character"}</div>
            <div><strong>Race:</strong> {selectedRace.name}</div>
            <div><strong>Background Skill:</strong> {selectedBackgroundSkill?.name || "None"}</div>
            {selectedBackgroundSkill?.customText && backgroundCustomText && <div><strong>Background Detail:</strong> {backgroundCustomText}</div>}
            <div><strong>Level:</strong> {level}</div>
            <div><strong>Total SP:</strong> {sp}</div>
            <div><strong>Remaining SP:</strong> {remainingSP}</div>
            {spEntryMode ? (
              <div><strong>Required XP:</strong> {availableXP}</div>
            ) : (
              <>
                <div><strong>Total XP:</strong> {numericTotalXP}</div>
                <div><strong>Remaining XP:</strong> {availableXP}</div>
              </>
            )}
            <div><strong>Total HP:</strong> {totalHP}</div>
          </div>
        </div>

        <div style={styles.exportSection}>
          <h3 style={styles.exportTitle}>Purchased General Skills</h3>
          {purchasedGeneralSkillSummaries.length > 0 ? (
            <ul style={styles.exportList}>
              {purchasedGeneralSkillSummaries.map((item) => <li key={item.name}><strong>{item.name}:</strong> {item.value}</li>)}
            </ul>
          ) : (
            <p style={styles.muted}>No general skills purchased.</p>
          )}
        </div>

        <div style={styles.exportSection}>
          <h3 style={styles.exportTitle}>Purchased Paths</h3>
          {purchasedPathSummaries.length > 0 ? (
            purchasedPathSummaries.map((path) => (
              <div key={path.id} style={styles.exportSubsection}>
                <h4 style={styles.exportSubtitle}>{path.name}</h4>
                {path.skills.length > 0 ? (
                  <ul style={styles.exportList}>
                    {path.skills.map((skill) => <li key={`${path.id}-${skill.name}`}><strong>{skill.name}:</strong> {skill.value}</li>)}
                  </ul>
                ) : (
                  <p style={styles.muted}>No skills purchased in this path.</p>
                )}
              </div>
            ))
          ) : (
            <p style={styles.muted}>No paths purchased.</p>
          )}
        </div>

        <div style={styles.exportSection}>
          <h3 style={styles.exportTitle}>Purchased Classes</h3>
          {purchasedClassSummaries.length > 0 ? (
            purchasedClassSummaries.map((classItem) => (
              <div key={classItem.id} style={styles.exportSubsection}>
                <h4 style={styles.exportSubtitle}>{classItem.name}</h4>
                {classItem.skills.length > 0 ? (
                  <ul style={styles.exportList}>
                    {classItem.skills.map((skill) => <li key={`${classItem.id}-${skill.name}`}><strong>{skill.name}:</strong> {skill.value}</li>)}
                  </ul>
                ) : (
                  <p style={styles.muted}>No skills purchased in this class.</p>
                )}
              </div>
            ))
          ) : (
            <p style={styles.muted}>No classes purchased.</p>
          )}
        </div>
      </div>
    </section>
  );

  const renderCurrentStep = () => {
    if (step === 0) return renderBasics();
    if (step === 1) return renderGeneralSkills();
    if (step === 2) return renderPaths();
    if (step === 3) return renderClasses();
    return renderExportPage();
  };

  return (
    <main style={styles.app}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.headerTopRow}>
            <div>
              <h1 style={styles.title}>GISIDO Character Builder</h1>
              <p style={styles.muted}>Character builder</p>
            </div>

            <div style={styles.characterMiniCard}>
              <strong>{name || "Unnamed Character"}</strong>
              <span>{selectedRace.name} · Level {level}</span>
              <span>{remainingSP} SP remaining</span>
              <button
                type="button"
                aria-label="Open help"
                style={styles.helpButton}
                onClick={() => setIsHelpOpen(true)}
              >
                ?
              </button>
            </div>
          </div>

          <nav style={styles.stepNav}>
            {steps.map((stepName, index) => (
              <button key={stepName} style={index === step ? styles.activeStepButton : styles.stepButton} onClick={() => setStep(index)}>
                {index + 1}. {stepName}
              </button>
            ))}
          </nav>
        </header>

        {remainingSP < 0 && <div style={styles.errorBox}>You have spent more SP than your character currently has. Reduce purchases or buy more SP.</div>}

        {isHelpOpen && (
          <div style={styles.modalOverlay} onClick={() => setIsHelpOpen(false)}>
            <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>Help / FAQ</h2>
                <button
                  type="button"
                  style={styles.modalCloseButton}
                  onClick={() => setIsHelpOpen(false)}
                >
                  Close
                </button>
              </div>

              <div style={styles.faqList}>
                <div style={styles.faqItem}>
                  <p style={styles.faqQuestion}>How to start my character?</p>
                  <p style={styles.faqAnswer}>On the Basics tab, enter the amount of XP your character has and click either Purchase 1 SP or Purchase All Available. This will auto-level your character. Select Race and being building on the other tabs.</p>
                </div>
                
                <div style={styles.faqItem}>
                  <p style={styles.faqQuestion}>SP/XP entry toggle.</p>
                  <p style={styles.faqAnswer}>When entering your total SP while using the SP toggle, any banked XP will not be displayed. Only the amount to purchase that SP value. To know your current banked XP, reference your character sheet or contact Logistics.</p>
                </div>
                                
                <div style={styles.faqItem}>
                  <p style={styles.faqQuestion}>Why is the background list so short?</p>
                  <p style={styles.faqAnswer}>In order to select a background, you must meet all prerequisites of that skill.</p>
                </div>

                <div style={styles.faqItem}>
                  <p style={styles.faqQuestion}>How do I get my character sheet?</p>
                  <p style={styles.faqAnswer}>On the "Export/Save" page, you can copy and paste the whole of the Character Summary into a text document and save the character sheet, or simply click the "Copy Summary" button.</p>
                </div>

                <div style={styles.faqItem}>
                  <p style={styles.faqQuestion}>How can I save my character?</p>
                  <p style={styles.faqAnswer}>On the "Export/Save" page, at the bottom, there are two boxes and buttons. Clicking "Generate code" will give a long code in the box above. Copy and save that somewhere.</p>
                </div>

                <div style={styles.faqItem}>
                  <p style={styles.faqQuestion}>How can I load my character?</p>
                  <p style={styles.faqAnswer}>On the "Export/Save" page, at the bottom, there are two boxes and buttons. Paste your previously saved code into the "Load this code" box and click the "Load" button.</p>
                </div>

                <div style={styles.faqItem}>
                  <p style={styles.faqQuestion}>Are characters made here official?</p>
                  <p style={styles.faqAnswer}>Characters made here are not official until approved by the logistics team. Send the Character Summary and code to logistics at gisidolarp.logistics@gmail.com. This app is to help quickly build out a character according to the rule book and is a tool for visualizing SP costs.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {refundMessage && (
          <div style={styles.modalOverlay} onClick={() => setRefundMessage("")}>
            <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>Vitality Refunded</h2>
                <button
                  type="button"
                  style={styles.modalCloseButton}
                  onClick={() => setRefundMessage("")}
                >
                  OK
                </button>
              </div>
              <p style={styles.faqAnswer}>{refundMessage}</p>
            </div>
          </div>
        )}

        {prerequisiteRefundMessage && (
          <div style={styles.modalOverlay} onClick={() => setPrerequisiteRefundMessage("")}>
            <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>Purchases Refunded</h2>
                <button
                  type="button"
                  style={styles.modalCloseButton}
                  onClick={() => setPrerequisiteRefundMessage("")}
                >
                  OK
                </button>
              </div>
              <p style={styles.faqAnswer}>{prerequisiteRefundMessage}</p>
            </div>
          </div>
        )}

        <div style={styles.mainLayout}>
          <div style={styles.mainContent}>
            {renderCurrentStep()}

            {step === 4 && (
              <section style={styles.saveCodeSection}>
                <div style={styles.saveCodeBlock}>
                  <label style={styles.label}>
                    Save this code
                    <textarea style={styles.textarea} value={generatedSaveCode} readOnly placeholder="Press Generate code to create a save code" />
                  </label>
                  <button style={styles.button} onClick={generateSaveCode}>Generate code</button>
                </div>

                <div style={styles.saveCodeBlock}>
                  <label style={styles.label}>
                    Load this code
                    <textarea style={styles.textarea} value={loadSaveCode} onChange={(event) => setLoadSaveCode(event.target.value)} placeholder="Paste a save code here" />
                  </label>
                  <button style={styles.button} onClick={loadCharacterFromCode}>Load</button>
                </div>
              </section>
            )}
          </div>
        </div>

        <footer style={styles.footerNav}>
          <button style={styles.secondaryButton} disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Previous</button>
          <span>{steps[step]}</span>
          <button style={styles.button} disabled={step === steps.length - 1} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>Next</button>
        </footer>

        <section style={styles.legend}><strong></strong></section>
      </div>
    </main>
  );
}

// ============================================================
// SMALL DISPLAY COMPONENTS
// ============================================================
function SummaryCard({ label, value, danger = false }) {
  return (
    <div style={{ ...styles.summaryCard, ...(danger ? styles.dangerCard : {}) }}>
      <span style={styles.summaryLabel}>{label}</span>
      <strong style={styles.summaryValue}>{value}</strong>
    </div>
  );
}

// ============================================================
// INLINE STYLES
// Input/select styles explicitly use black text on white fields.
// ============================================================
const styles = {
  // Main full-page wrapper
  app: {
    minHeight: "100vh",
    width: "100%",
    background: "#f4f1ea",
    color: "#201c18",
    padding: "clamp(12px, 3vw, 24px)",
    fontFamily: "Arial, sans-serif",
    boxSizing: "border-box"
  },

  // Centered page container/card that holds the whole builder
  container: {
    width: "100%",
    maxWidth: 1100,
    margin: "0 auto",
    background: "#fffaf0",
    border: "1px solid #d8ccb8",
    borderRadius: 16,
    padding: "clamp(14px, 3vw, 24px)",
    boxSizing: "border-box",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)"
  },

  // Top header row containing title text and mini character summary
  header: {
    position: "sticky",
    top: 0,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginBottom: 20,
    paddingBottom: 16,
    background: "#fffaf0",
    borderBottom: "1px solid #d8ccb8"
  },

  headerTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
    width: "100%",
    minWidth: 0
  },

  mainLayout: {
    display: "block"
  },

  mainContent: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column"
  },

  // Main page title
  title: {
    margin: "0 0 8px",
    fontSize: "clamp(28px, 7vw, 34px)",
    lineHeight: 1.12
  },

  // Small summary card in the header showing character name, race, level, and SP
  characterMiniCard: {
    width: "min(320px, 100%)",
    minWidth: 0,
    flex: "1 1 220px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: "#efe5d0",
    border: "1px solid #d8ccb8",
    borderRadius: 12,
    padding: 14,
    paddingRight: 54,
    position: "relative",
    zIndex: 20,
    boxSizing: "border-box"
  },

  helpButton: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "1px solid #5f4428",
    background: "#5f4428",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 18,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },

  // Navigation row for the 4 creation step buttons
  stepNav: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 8,
    marginBottom: 0,
    width: "100%",
    minWidth: 0
  },

  // Inactive step button style
  stepButton: {
    padding: "clamp(8px, 2vw, 12px) clamp(4px, 1.8vw, 10px)",
    borderRadius: 10,
    border: "1px solid #bcae96",
    background: "#fffdf8",
    color: "#201c18",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "clamp(12px, 2.6vw, 16px)",
    lineHeight: 1.2,
    minWidth: 0,
    whiteSpace: "normal",
    overflowWrap: "break-word"
  },

  // Active/current step button style
  activeStepButton: {
    padding: "clamp(8px, 2vw, 12px) clamp(4px, 1.8vw, 10px)",
    borderRadius: 10,
    border: "1px solid #5f4428",
    background: "#5f4428",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "clamp(12px, 2.6vw, 16px)",
    lineHeight: 1.2,
    minWidth: 0,
    whiteSpace: "normal",
    overflowWrap: "break-word"
  },

  // Generic section wrapper used by each page/view
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 16
  },

  // Grid layout for form controls on the basics page
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16
  },

  // Label wrapper for inputs/selects
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontWeight: 700
  },

  inlineLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },

  toggleButton: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #bcae96",
    background: "#fffdf8",
    color: "#201c18",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
    whiteSpace: "nowrap"
  },

  // Standard text/select/number input style on the app
  input: {
    padding: 12,
    borderRadius: 10,
    border: "1px solid #bcae96",
    fontSize: 16,
    background: "white",
    color: "black",
    WebkitTextFillColor: "black",
    caretColor: "black"
  },

  // Number input used for repeatable skill purchase counts
  numberInput: {
    width: 72,
    padding: 8,
    borderRadius: 8,
    border: "1px solid #bcae96",
    fontSize: 16,
    background: "white",
    color: "black",
    WebkitTextFillColor: "black",
    caretColor: "black"
  },

  // Number input used for custom-text entry purchase counts
  countInput: {
    width: 72,
    padding: 8,
    borderRadius: 8,
    border: "1px solid #bcae96",
    fontSize: 16,
    background: "white",
    color: "black",
    WebkitTextFillColor: "black",
    caretColor: "black"
  },

  // Inline container for primary/secondary spell school purchase controls
  dualTrackBox: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end"
  },

  // Label wrapper for primary/secondary spell school counters
  dualTrackLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    fontWeight: 700,
    color: "#6f6252"
  },

  // Grid of summary stat cards on page 1
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12
  },

  // Individual summary stat card
  summaryCard: {
    background: "#fffdf8",
    border: "1px solid #d8ccb8",
    borderRadius: 12,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 6
  },

  // Alternate summary card style when value is in a warning/error state
  dangerCard: {
    border: "1px solid #a33",
    background: "#fff0f0"
  },

  // Small uppercase label inside summary cards
  summaryLabel: {
    color: "#6f6252",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },

  // Main numeric/value text inside summary cards
  summaryValue: {
    fontSize: 22
  },

  // Standard card for skills, race info, and other boxed content
  card: {
    background: "#fffdf8",
    border: "1px solid #d8ccb8",
    borderRadius: 14,
    padding: 16
  },

  // Greyed-out version of a card when a skill/path/class is locked
  lockedCard: {
    opacity: 0.48,
    filter: "grayscale(0.6)",
    background: "#eee9df"
  },

  // Top row inside skill cards with text on left and purchase control on right
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center"
  },

  // Skill/path/class card title text
  cardTitle: {
    margin: "0 0 6px"
  },

  // Right-side purchase input container in skill cards
  purchaseBox: {
    minWidth: 86,
    display: "flex",
    justifyContent: "flex-end"
  },

  // Grid for cost, prerequisite, purchase count, and HP bonus metadata on cards
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 8,
    marginTop: 12,
    fontSize: 14
  },

  // Label wrapper for custom text fields like Scholar of (X)
  customTextList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 12
  },

  customTextRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-end"
  },

  customFieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontWeight: 700,
    marginTop: 12
  },

  // Muted/helper text used for descriptions and guidance text
  muted: {
    color: "#6f6252",
    margin: 0,
    lineHeight: 1.45
  },

  // Warning text for locked or unavailable items
  warning: {
    color: "#8a4a00",
    fontWeight: 700,
    marginBottom: 0
  },

  // Red error banner shown when SP spending exceeds available SP
  errorBox: {
    background: "#fff0f0",
    color: "#8a1f1f",
    border: "1px solid #d6a0a0",
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    fontWeight: 700
  },

  // Horizontal group for action buttons
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10
  },

  // Primary action button style
  button: {
    padding: "11px 16px",
    borderRadius: 10,
    border: "1px solid #5f4428",
    background: "#5f4428",
    color: "white",
    cursor: "pointer",
    fontWeight: 700
  },

  // Small button style used for compact add-entry controls
  smallButton: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #5f4428",
    background: "#5f4428",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14
  },

  // Secondary action button style
  secondaryButton: {
    padding: "11px 16px",
    borderRadius: 10,
    border: "1px solid #bcae96",
    background: "#fffdf8",
    color: "#201c18",
    cursor: "pointer",
    fontWeight: 700
  },

  // Danger/destructive action button style for un-purchasing
  dangerButton: {
    padding: "11px 16px",
    borderRadius: 10,
    border: "1px solid #8a1f1f",
    background: "#8a1f1f",
    color: "white",
    cursor: "pointer",
    fontWeight: 700
  },

  // Export page wrapper for the character sheet view
  exportActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12
  },

  copyStatus: {
    color: "#5f4428",
    fontWeight: 700
  },

  exportSheet: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: 20,
    background: "#fffdf8",
    border: "1px solid #d8ccb8",
    borderRadius: 16
  },

  // Export section block for each major character sheet area
  exportSection: {
    border: "1px solid #d8ccb8",
    borderRadius: 12,
    padding: 16,
    background: "#fbf3e4"
  },

  // Grid layout for the top export summary section
  exportGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    lineHeight: 1.5
  },

  // Export section heading style
  exportTitle: {
    margin: "0 0 12px"
  },

  // Export subsection wrapper for individual path/class groups
  exportSubsection: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #d8ccb8"
  },

  // Export subsection heading style
  exportSubtitle: {
    margin: "0 0 8px"
  },

  // Export list styling for purchased skills
  exportList: {
    margin: 0,
    paddingLeft: 20,
    display: "flex",
    flexDirection: "column",
    gap: 6
  },

  // Outer grouped container for each path/class block
  groupBox: {
    border: "2px solid #d8ccb8",
    borderRadius: 16,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    background: "#fbf3e4"
  },

  // Header row inside each path/class group
  groupHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "flex-start"
  },

  // Bottom previous/next navigation bar
  footerNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    borderTop: "1px solid #d8ccb8",
    paddingTop: 18,
    fontWeight: 700
  },

  // Key/legend box at the bottom of the page
  legend: {
    marginTop: 18,
    padding: 14,
    background: "#efe5d0",
    borderRadius: 12,
    border: "1px solid #d8ccb8"
  },

  // Save/load code section shown on the export page above footer navigation
  saveCodeSection: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
    marginTop: 20
  },

  // Individual block for generate/load code controls
  saveCodeBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    border: "1px solid #d8ccb8",
    background: "#fbf3e4"
  },

  // Multiline field used for save and load codes
  textarea: {
    minHeight: 110,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #bcae96",
    fontSize: 14,
    background: "white",
    color: "black",
    WebkitTextFillColor: "black",
    caretColor: "black",
    resize: "vertical"
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 200
  },

  modalCard: {
    width: "min(720px, 100%)",
    maxHeight: "80vh",
    overflowY: "auto",
    background: "#fffaf0",
    border: "1px solid #d8ccb8",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.18)"
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16
  },

  modalTitle: {
    margin: 0,
    fontSize: 24
  },

  modalCloseButton: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #bcae96",
    background: "#fffdf8",
    color: "#201c18",
    cursor: "pointer",
    fontWeight: 700
  },

  faqList: {
    display: "flex",
    flexDirection: "column",
    gap: 14
  },

  faqItem: {
    padding: 14,
    borderRadius: 12,
    border: "1px solid #d8ccb8",
    background: "#fbf3e4"
  },

  faqQuestion: {
    margin: "0 0 8px",
    fontWeight: 700
  },

  faqAnswer: {
    margin: 0,
    color: "#3d342c",
    lineHeight: 1.5
  }
};

export default App;
