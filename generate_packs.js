const fs = require('fs');
const path = require('path');
const { SKILLS, TALENTS, ASSIGNMENTS } = require('./content-data.js'); // We'll need to read this node-style or just embed data

// Since we are in a node environment in the agent, but the file is ES6...
// I will rewrite this script to be self-contained for the run_command tool.

/* 
 * This script generates the JSON lines (LevelDB style) for Foundry Compendiums.
 * Foundry VTT v10+ uses LevelDB, but Classic (v9) or simple implementations use `items.db` as text JSONL.
 * We will create `skills.db`, `talents.db`, `assignments.db` as pure JSONL files.
 */

// Full list of Skills from the rulebook (approximate)
const skillsData = [
    { "name": "Academics", "attribute": "mind" },
    { "name": "Arts", "attribute": "spirit" },
    { "name": "Athletics", "attribute": "body" },
    { "name": "Awareness", "attribute": "mind" },
    { "name": "Bureaucracy", "attribute": "mind" },
    { "name": "Close Combat", "attribute": "body" },
    { "name": "Computers", "attribute": "mind" },
    { "name": "Dexterity", "attribute": "body" },
    { "name": "Engineering", "attribute": "mind" },
    { "name": "Fast Talk", "attribute": "spirit" },
    { "name": "Fortitude", "attribute": "body" },
    { "name": "Intuition", "attribute": "mind" },
    { "name": "Magic", "attribute": "mind" },
    { "name": "Medicine", "attribute": "mind" },
    { "name": "Occult", "attribute": "mind" },
    { "name": "Presence", "attribute": "spirit" },
    { "name": "Ranged", "attribute": "body" },
    { "name": "Reflexes", "attribute": "body" },
    { "name": "Resolve", "attribute": "spirit" },
    { "name": "Science", "attribute": "mind" },
    { "name": "Stealth", "attribute": "body" },
    { "name": "Survival", "attribute": "mind" },
    { "name": "Technology", "attribute": "mind" },
    { "name": "Zeal", "attribute": "spirit" }
];

const talentsData = [
    { "name": "Computational Demonologist", "description": "Can cast spells using computational devices. Requires: Computers, Occult." },
    { "name": "Glancing Blow", "description": "Reduce damage from a hit by 1d6. Can use once per scene." },
    { "name": "Lucky", "description": "Reroll a failed test once per session." },
    { "name": "Strong Stomach", "description": "Resistant to nausea and disgust. +2 to Fortitude tests vs sickening effects." },
    { "name": "License to Kill", "description": "Authorized to use lethal force in the line of duty without filling out form 1099-DEAD." },
    { "name": "Occultist", "description": "Gains access to Occult skill and rituals. Can sense magic." },
    { "name": "Eidetic Memory", "description": "Perfect recall of facts and images." },
    { "name": "Brave", "description": "+2 to Resolve tests against fear." },
    { "name": "Polyglot", "description": "You know additional languages equal to your Mind score." }
];

const assignmentsData = [
    {
        "name": "Analyst",
        "system": {
            "description": "Desk jockey processing intelligence.",
            "attributes": { "body": 1, "mind": 3, "spirit": 1 },
            "coreSkills": "Academics, Bureaucracy, Computers, Science, Technology",
            "equipment": "Laptop, ID Card, Office Supplies"
        }
    },
    {
        "name": "Action Officer",
        "system": {
            "description": "Field agent dealing with threats directly.",
            "attributes": { "body": 3, "mind": 1, "spirit": 1 },
            "coreSkills": "Athletics, Close Combat, Ranged, Stealth",
            "equipment": "Handgun, Kevlar Vest, Secure Comm"
        }
    },
    {
        "name": "Computational Demonologist",
        "system": {
            "description": "Hacker wizard.",
            "attributes": { "body": 1, "mind": 2, "spirit": 2 },
            "coreSkills": "Computers, Magic, Occult, Science, Technology",
            "equipment": "Wards, Pentagram Chalk, Laptop"
        }
    },
    {
        "name": "radius",
        "system": {
            "description": "Undercover plumbing and wetwork.",
            "attributes": { "body": 2, "mind": 2, "spirit": 1 },
            "coreSkills": "Bureaucracy, Fast Talk, Stealth, Demolitions, Close Combat",
            "equipment": "Toolkit, Shotgun, Bleach"
        }
    }
];

function createId() {
    return Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 8);
}

function generateSkills() {
    let lines = [];
    skillsData.forEach(s => {
        const item = {
            "_id": createId(),
            "name": s.name,
            "type": "skill",
            "img": "icons/svg/book.svg",
            "system": {
                "attribute": s.attribute,
                "training": 0,
                "focus": 0,
                "description": `Standard ${s.name} skill.`
            },
            "effects": [],
            "flags": {}
        };
        lines.push(JSON.stringify(item));
    });
    fs.writeFileSync('/mnt/Data/laundry/laundry-rpg/packs/skills.db', lines.join('\n'));
}

function generateTalents() {
    let lines = [];
    talentsData.forEach(t => {
        const item = {
            "_id": createId(),
            "name": t.name,
            "type": "talent",
            "img": "icons/svg/aura.svg",
            "system": {
                "requirements": "",
                "description": t.description
            },
            "effects": [],
            "flags": {}
        };
        lines.push(JSON.stringify(item));
    });
    fs.writeFileSync('/mnt/Data/laundry/laundry-rpg/packs/talents.db', lines.join('\n'));
}

function generateAssignments() {
    let lines = [];
    assignmentsData.forEach(a => {
        const item = {
            "_id": createId(),
            "name": a.name,
            "type": "assignment",
            "img": "icons/svg/mystery-man.svg",
            "system": a.system,
            "effects": [],
            "flags": {}
        };
        lines.push(JSON.stringify(item));
    });
    fs.writeFileSync('/mnt/Data/laundry/laundry-rpg/packs/assignments.db', lines.join('\n'));
}

generateSkills();
generateTalents();
generateAssignments();
console.log("Compendiums created successfully.");
