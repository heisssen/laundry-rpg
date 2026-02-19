export const SKILLS = [
    { "name": "Academics", "attribute": "mind" },
    { "name": "Athletics", "attribute": "body" },
    { "name": "Awareness", "attribute": "mind" },
    { "name": "Bureaucracy", "attribute": "mind" },
    { "name": "Close Combat", "attribute": "body" },
    { "name": "Computers", "attribute": "mind" },
    { "name": "Demolitions", "attribute": "mind" },
    { "name": "Drive", "attribute": "reflexes" }, // Wait, Reflexes is a defined attribute? No, it's Body usually, or Mind? Rules check. Ah, Reflexes is a SKILL in text? "Reflexes Skill".
    { "name": "Fast Talk", "attribute": "spirit" }, // Charisma/Presence
    { "name": "Fortitude", "attribute": "body" },
    { "name": "Heavy Weapons", "attribute": "body" },
    { "name": "Intuition", "attribute": "mind" },
    { "name": "Magic", "attribute": "mind" }, // Or Spirit?
    { "name": "Medicine", "attribute": "mind" },
    { "name": "Occult", "attribute": "mind" },
    { "name": "Pilot", "attribute": "reflexes" }, // Again, Reflexes?
    { "name": "Presence", "attribute": "spirit" },
    { "name": "Ranged Combat", "attribute": "body" }, // or Agility? Text says "Ranged Combat Skill... check level of Training... using weapon Body"
    { "name": "Reflexes", "attribute": "body" }, // It acts like Agility
    { "name": "Resolve", "attribute": "spirit" },
    { "name": "Science", "attribute": "mind" },
    { "name": "Sleight of Hand", "attribute": "body" },
    { "name": "Stealth", "attribute": "body" },
    { "name": "Survival", "attribute": "mind" },
    { "name": "Technology", "attribute": "mind" },
    { "name": "Zeal", "attribute": "spirit" }
];

export const TALENTS = [
    { "name": "Computational Demonologist", "description": "Can cast spells using computational devices." },
    { "name": "Glancing Blow", "description": "Reduce damage from a hit." },
    { "name": "Lucky", "description": "Reroll a failed test once per session." },
    { "name": "Strong Stomach", "description": "Resistant to nausea and disgust." },
    { "name": "License to Kill", "description": "Authorized to use lethal force." },
    { "name": "Occultist", "description": "Gains access to Occult skill and rituals." }
];

export const ASSIGNMENTS = [
    {
        "name": "Analyst",
        "description": "Desk jockey processing intelligence.",
        "attributes": { "body": 1, "mind": 3, "spirit": 1 },
        "coreSkills": "Academics, Bureaucracy, Computers, Science, Technology",
        "equipment": "Laptop, ID Card, Office Supplies"
    },
    {
        "name": "Action Officer",
        "description": "Field agent dealing with threats directly.",
        "attributes": { "body": 3, "mind": 1, "spirit": 1 },
        "coreSkills": "Athletics, Close Combat, Drive, Ranged Combat, Stealth",
        "equipment": "Handgun, Kevlar Vest, Secure Comm"
    },
    {
        "name": "Computational Demonologist",
        "description": "Hacker wizard.",
        "attributes": { "body": 1, "mind": 2, "spirit": 2 },
        "coreSkills": "Computers, Magic, Occult, Science, Technology",
        "equipment": "Wards, Pentagram Chalk, Laptop"
    },
    {
        "name": "Plumber",
        "description": "Fixes 'leaks' and cleans up messes.",
        "attributes": { "body": 2, "mind": 2, "spirit": 1 },
        "coreSkills": "Bureaucracy, Fast Talk, Stealth, Demolitions, Close Combat",
        "equipment": "Toolkit, Shotgun, Bleach"
    }
];
