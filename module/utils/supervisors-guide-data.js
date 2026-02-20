// Supervisor's Guide reference data extracted from:
// - Mission Generator, pp.46-48
// - Endeavours, pp.56-64
// - Department support entries (Department Information chapter)
export const SUPERVISOR_MISSION_TABLES = {
    locations: [
        "London, Leeds, or another UK metropolis",
        "Out into the UK countryside",
        "City in continental Europe",
        "An exotic foreign locale",
        "A Laundry facility",
        "Another dimension"
    ],
    objectives: [
        "Gather intel, report back, do not touch anything",
        "Liaise with another agency, follow their lead",
        "Get in, grab what we are looking for, get out",
        "Field test a new weapon, spell, or gadget",
        "Go undercover, await further instructions",
        "Silence all witnesses, clean up the mess"
    ],
    rumours: [
        "Alien sighting",
        "Disappearance without a trace",
        "Missing person returned but acting weirdly",
        "Ritual murder",
        "Bizarre environmental fallout",
        "Magical defences have been triggered"
    ],
    corroboration: [
        "Recurring events suggest a pattern",
        "Events were prophesied in ancient grimoires",
        "Allied security services are also worried",
        "Tip-off from inside the conspiracy",
        "Suspiciously similar to a previous mission",
        "Predictive Branch had a strange feeling"
    ],
    assets: [
        "Journalist",
        "Social worker",
        "Civil servant",
        "Police officer",
        "Allied spy",
        "Laundry operative"
    ],
    civilians: [
        "IT technician",
        "Hiker",
        "Lecturer",
        "Hacker",
        "Antiquarian",
        "Explorer"
    ],
    targets: [
        "Tech genius",
        "Billionaire",
        "Politician",
        "Criminal",
        "Enemy spy",
        "Known cult leader"
    ],
    targetStatus: [
        "Murdered",
        "Disappeared",
        "Traumatised",
        "Defected",
        "Possessed",
        "Wielding magic"
    ],
    culprits: [
        "Small cabal or lone wolf",
        "Cult",
        "Occult security agency",
        "Autonomes",
        "Exonomes, broken free",
        "Exonomes, conspiring in the outer dark"
    ],
    motives: [
        "Ignorant to the consequences",
        "A shortcut to money, power, and pleasures of the flesh",
        "Seeking something personal for sentimental reasons",
        "Acting in self-defence",
        "Hell-bent on revenge",
        "Manipulated by a greater evil"
    ],
    internalComplications: [
        "Mission running on shoestring budget",
        "Vital information outside your security clearance",
        "Second mission running in tandem",
        "Oversight will be scrutinising the whole mission",
        "Culprits have moles inside the Laundry",
        "Mission is of 'special interest' to management"
    ],
    externalComplications: [
        "Mission is on another agency's turf",
        "Culprits know you are coming",
        "Communications blackout on-site",
        "Culprits are sponsored by another agency",
        "Mission site is isolated and inaccessible",
        "It is a trap"
    ],
    groundZero: [
        "Rural place of power (forest clearing, stone circle)",
        "Villain's lair (secret dungeon, private island)",
        "Government building (town hall, prison)",
        "Corporate offices (trade floor, bank)",
        "Place of worship (church, temple)",
        "Public venue (arena, town centre)"
    ],
    crises: [
        "Murder of a VIP",
        "Instigation of war or other diplomatic disaster",
        "Ritual of mass human sacrifice",
        "Deploying a weapon of mass destruction",
        "Casting of a Level 5 spell",
        "Summoning of a Level 5 exonome"
    ],
    occultBuzzwords: {
        computationalPrefix1: ["Primary", "Encrypted", "Antiviral", "Synchronising", "Networked", "Automatic"],
        computationalPrefix2: ["Summoning", "Thaumic", "Psychometric", "Entropic", "Binding", "Exonomic"],
        computationalSubject: ["Algorithm", "Matrix", "Grid", "Drive", "Device", "Uplink"],
        ritualPrefix: ["Lost", "Fabled", "Thrice-Bound", "Enochian", "Ungodly", "Blasphemous"],
        ritualSubject: ["Rune", "Invocation", "Talisman", "Icon", "Tome", "Portent"],
        ritualSuffix: ["Of Thoth", "Of Dee", "Of Yog-Sothoth", "Of Babylon", "Of the Old Ones", "Of Souls"]
    },
    codenames: {
        colour: ["EMERALD", "CRIMSON", "COBALT", "MAGENTA", "BRONZE", "JET"],
        action: ["STRIKING", "HUNTING", "CALLING", "CROSSING", "DREAMING", "PREACHING"],
        weapon: ["JAVELIN", "BAYONET", "HARPOON", "RAPIER", "LANCE", "HAMMER"],
        mythology: ["SISYPHUS", "OGRE", "JERICHO", "DRAGON", "HERMES", "GOBLIN"],
        animal: ["WOLF", "OCTOPUS", "ADDER", "JAGUAR", "JELLYFISH", "PIGEON"],
        miscellaneous: ["BOXCAR", "THUMBSCREW", "LECTERN", "JAMJAR", "ECLIPSE", "FORTUNE"]
    }
};

// Departmental support thresholds used for Mind (Bureaucracy) request tests.
export const DEPARTMENT_SUPPORT_TABLE = [
    {
        id: "financial-control",
        name: "Financial Control",
        dn: 5,
        complexity: 1,
        summary: "Success greases the wheels; further requisitions for equipment are at Advantage this mission.",
        source: "Supervisor's Guide, Department Information (Financial Control)"
    },
    {
        id: "residual-human-resources",
        name: "Residual Human Resources",
        dn: 3,
        complexity: 1,
        summary: "Success approves RHR support and dispatches a wrangler with a suitable helper.",
        source: "Supervisor's Guide, Department Information (Residual Human Resources)"
    },
    {
        id: "the-armoury",
        name: "The Armoury",
        dn: 5,
        complexity: 2,
        summary: "Success makes the Armoury more receptive; requisition tests for kit are at Advantage.",
        source: "Supervisor's Guide, Department Information (Armoury)"
    },
    {
        id: "it-helpdesk",
        name: "IT Helpdesk",
        dn: 4,
        complexity: 1,
        summary: "Success secures IT support to fix OFCUT-enabled phones or compromised workstations.",
        source: "Supervisor's Guide, Department Information (Information Technology)"
    }
];

export const ENDEAVOUR_OPTIONS = [
    { id: "asset-cultivation", label: "Asset Cultivation" },
    { id: "business-as-usual", label: "Business As Usual" },
    { id: "compassionate-leave", label: "Compassionate Leave" },
    { id: "cover-up", label: "Cover Up" },
    { id: "dating-scene", label: "Dating Scene" },
    { id: "deep-research", label: "Deep Research" },
    { id: "false-identity", label: "False Identity" },
    { id: "family-vacation", label: "Family Vacation" },
    { id: "filing-paperwork-bau", label: "Filing Paperwork / Business As Usual" },
    { id: "hidden-agenda", label: "Hidden Agenda" },
    { id: "hobbies-and-interests", label: "Hobbies and Interests" },
    { id: "infirmary-shift", label: "Infirmary Shift" },
    { id: "long-term-planning", label: "Long-Term Planning" },
    { id: "moonlighting", label: "Moonlighting" },
    { id: "office-politics", label: "Office Politics" },
    { id: "overseas-conference", label: "Overseas Conference" },
    { id: "overtime", label: "Overtime" },
    { id: "performance-review", label: "Performance Review" },
    { id: "repair-equipment", label: "Repair Equipment" },
    { id: "research-and-development", label: "Research and Development" },
    { id: "role-transfer", label: "Role Transfer" },
    { id: "sick-leave", label: "Sick Leave" },
    { id: "teambuilding", label: "Teambuilding" },
    { id: "training-course", label: "Training Course" },
    { id: "writing-memoirs", label: "Writing Memoirs" }
];

export const TRAINING_COURSES = [
    { id: "tradecraft-101", name: "Tradecraft 101", skills: ["Awareness", "Intuition", "Stealth"] },
    { id: "basic-stealth-evasion", name: "Basic Stealth & Evasion (BSE)", skills: ["Athletics", "Reflexes", "Stealth"] },
    { id: "hostage-negotiation", name: "Hostage Negotiation", skills: ["Fast Talk", "Presence", "Resolve"] },
    { id: "resistance-to-interrogation", name: "Resistance to Interrogation (RTI)", skills: ["Fortitude", "Resolve", "Zeal"] },
    { id: "outdoor-survival", name: "Outdoor Survival", skills: ["Awareness", "Medicine", "Survival"] },
    { id: "practical-criminology", name: "Practical Criminology", skills: ["Computers", "Dexterity", "Stealth"] },
    { id: "basic-self-defence", name: "Basic Self-Defence", skills: ["Close Combat", "Might", "Reflexes"] },
    { id: "fitness-instruction", name: "Fitness Instruction", skills: ["Athletics", "Fortitude", "Might"] },
    { id: "cowe", name: "Certificate of Weaponry Expertise (COWE)", skills: ["Dexterity", "Ranged", "Resolve"] },
    { id: "coweu", name: "Certificate of Weaponry Expertise, Unconventional (COWEU)", skills: ["Athletics", "Close Combat", "Technology"] },
    { id: "explosive-materials", name: "Handling Explosive Materials", skills: ["Engineering", "Ranged", "Science"] },
    { id: "defensive-driving", name: "Defensive Driving", skills: ["Awareness", "Engineering", "Reflexes"] },
    { id: "emergency-field-medicine", name: "Emergency Field Medicine", skills: ["Dexterity", "Medicine", "Presence"] },
    { id: "laundry-and-you", name: "'The Laundry and You' (Employee Indoctrination)", skills: ["Bureaucracy", "Intuition", "Zeal"] },
    { id: "intro-stem", name: "Introduction to STEM", skills: ["Engineering", "Science", "Technology"] },
    { id: "media-relations", name: "Media Relations", skills: ["Academics", "Fast Talk", "Intuition"] },
    { id: "international-relations", name: "International Relations", skills: ["Academics", "Bureaucracy", "Fast Talk"] },
    { id: "process-workflow", name: "Process Workflow Management", skills: ["Bureaucracy", "Computers", "Presence"] },
    { id: "iaoc", name: "Introduction to Applied Occult Computing (IAOC)", skills: ["Computers", "Magic", "Technology"] },
    { id: "combat-epistemology", name: "Combat Epistemology", skills: ["Occult", "Ranged", "Survival"] },
    { id: "esoteric-history", name: "Esoteric History", skills: ["Academics", "Magic", "Occult"] },
    { id: "zombie-survival-guide", name: "Zombie Survival Guide", skills: ["Close Combat", "Fortitude", "Might"] },
    { id: "occult-forensics", name: "Occult Forensics", skills: ["Medicine", "Occult", "Science"] },
    { id: "extra-dimensional-orienteering", name: "Extra-Dimensional Orienteering", skills: ["Magic", "Survival", "Zeal"] }
];

