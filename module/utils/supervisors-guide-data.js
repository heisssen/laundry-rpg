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

// Departmental support thresholds used for requisition support tests.
// Source: Supervisor's Guide, Department Information chapter (pp. 69-89).
export const DEPARTMENT_SUPPORT_TABLE = [
    {
        id: "financial-control",
        name: "Financial Control",
        dn: 5,
        complexity: 1,
        summary: "Further requisitions for equipment are at Advantage for the current mission.",
        source: "Supervisor's Guide p.71 (Financial Control)"
    },
    {
        id: "quality-assurance",
        name: "Quality Assurance",
        dn: 4,
        complexity: 1,
        summary: "Secures procedural guidance for reports, requests, requisitions, and compliance paperwork.",
        source: "Supervisor's Guide p.72 (Quality Assurance)"
    },
    {
        id: "health-safety",
        name: "Health & Safety",
        dn: 4,
        complexity: 1,
        summary: "Can shut down hazardous activity and remove high-risk personnel from unsafe scenes.",
        source: "Supervisor's Guide p.73 (Health & Safety)"
    },
    {
        id: "housing",
        name: "Housing",
        dn: 4,
        complexity: 1,
        summary: "Secures emergency accommodation near Laundry operations.",
        source: "Supervisor's Guide p.74 (Housing)"
    },
    {
        id: "inhuman-resources",
        name: "Inhuman Resources",
        dn: 4,
        complexity: 1,
        summary: "Provides liaison support for non-human assets and sensitive species interactions.",
        source: "Supervisor's Guide p.74 (Inhuman Resources)"
    },
    {
        id: "med-psych",
        name: "Med & Psych",
        dn: 3,
        complexity: 1,
        summary: "Provides emergency medical access, diagnosis support, and geas-cleared treatment channels.",
        source: "Supervisor's Guide p.75 (Med & Psych)"
    },
    {
        id: "med-psych-field-response",
        name: "Med & Psych (Field Dispatch)",
        dn: 5,
        complexity: 1,
        summary: "Attempts immediate field deployment of cleared medical staff.",
        source: "Supervisor's Guide p.75 (Med & Psych field call)"
    },
    {
        id: "payroll",
        name: "Payroll",
        dn: 4,
        complexity: 1,
        summary: "Expedites emergency pay corrections or advance-pay requests.",
        source: "Supervisor's Guide p.75 (Payroll)"
    },
    {
        id: "personnel",
        name: "Personnel",
        dn: 4,
        complexity: 1,
        summary: "Assigns temporary NPC staffing to cover specific mission skill gaps.",
        source: "Supervisor's Guide p.76 (Personnel)"
    },
    {
        id: "residual-human-resources",
        name: "Residual Human Resources",
        dn: 3,
        complexity: 1,
        summary: "Approves wrangler-led RHR support and dispatches additional disposable manpower.",
        source: "Supervisor's Guide p.77 (Residual Human Resources)"
    },
    {
        id: "armoury",
        name: "Armoury",
        dn: 5,
        complexity: 2,
        summary: "Makes Armoury staff receptive; requisition tests for kit are at Advantage this mission.",
        source: "Supervisor's Guide p.78 (Armoury)"
    },
    {
        id: "facilities",
        name: "Facilities",
        dn: 6,
        complexity: 1,
        summary: "Can prioritize workspace allocation and building-level structural support guidance.",
        source: "Supervisor's Guide p.79 (Facilities)"
    },
    {
        id: "it-helpdesk",
        name: "IT Helpdesk",
        dn: 4,
        complexity: 1,
        summary: "Fixes OFCUT-enabled devices, compromised workstations, and mission-critical IT faults.",
        source: "Supervisor's Guide p.79 (Information Technology)"
    },
    {
        id: "maintenance-janitorial",
        name: "Maintenance & Janitorial",
        dn: 3,
        complexity: 1,
        summary: "Cleans, clears, and stabilizes contaminated or damaged operational spaces.",
        source: "Supervisor's Guide p.80 (Maintenance & Janitorial)"
    },
    {
        id: "purchasing",
        name: "Purchasing",
        dn: 6,
        complexity: 3,
        summary: "Further requisitions are at Advantage for this mission; on failure, they may be at Disadvantage.",
        source: "Supervisor's Guide p.80 (Purchasing)"
    },
    {
        id: "transport",
        name: "Transport",
        dn: 4,
        complexity: 1,
        summary: "Supports mission transport requisitions; vehicle size/speed and driver support adjust difficulty.",
        source: "Supervisor's Guide p.80 (Transport)"
    },
    {
        id: "contracts-bindings",
        name: "Contracts & Bindings",
        dn: 4,
        complexity: 1,
        summary: "Provides emergency occult-contract and geas legal support.",
        source: "Supervisor's Guide p.81 (Contracts & Bindings)"
    },
    {
        id: "black-assizes",
        name: "Black Assizes",
        dn: 5,
        complexity: 1,
        summary: "Provides Black Assizes legal representation and escalation support.",
        source: "Supervisor's Guide p.81 (Black Assizes)"
    },
    {
        id: "legal-research",
        name: "Legal Research",
        dn: 4,
        complexity: 1,
        summary: "Provides legal rescue/case strategy while prioritizing Laundry institutional protection.",
        source: "Supervisor's Guide p.81 (Legal Affairs)"
    },
    {
        id: "counter-subversion",
        name: "Counter-Subversion",
        dn: 3,
        complexity: 1,
        summary: "Launches covert internal investigation support when compromise is suspected.",
        source: "Supervisor's Guide p.82 (Counter-Subversion)"
    },
    {
        id: "media-relations",
        name: "Media Relations",
        dn: 4,
        complexity: 1,
        summary: "Suppresses or diverts press attention and can manage external narrative pressure.",
        source: "Supervisor's Guide p.82 (Media Relations)"
    },
    {
        id: "operational-oversight",
        name: "Operational Oversight",
        dn: 4,
        complexity: 1,
        summary: "Deploys heavy supervisory intervention and authority support.",
        source: "Supervisor's Guide p.83 (Operational Oversight)"
    },
    {
        id: "interdepartmental-liaison-group",
        name: "Interdepartmental Liaison Group",
        dn: 4,
        complexity: 1,
        summary: "Opens discussions with external government bodies for information/resources.",
        source: "Supervisor's Guide p.84 (Records: Interdepartmental Liaison Group)"
    },
    {
        id: "acquisitions",
        name: "Acquisitions",
        dn: 4,
        complexity: 1,
        summary: "Coordinates extraction/removal of dangerous artefacts and specialist handling advice.",
        source: "Supervisor's Guide p.85 (Records: Acquisitions)"
    },
    {
        id: "archives",
        name: "Archives",
        dn: 4,
        complexity: 1,
        summary: "Retrieves or escalates access routing for filed records and controlled documentation.",
        source: "Supervisor's Guide p.85 (Records: Archives)"
    },
    {
        id: "monitoring",
        name: "Monitoring",
        dn: 4,
        complexity: 1,
        summary: "Runs targeted anomaly surveillance and alerts the team to matching events.",
        source: "Supervisor's Guide p.85 (Records: Monitoring)"
    },
    {
        id: "translation-analysis",
        name: "Translation & Analysis",
        dn: 4,
        complexity: 1,
        summary: "Translates and interprets ancient/occult materials and related threat context.",
        source: "Supervisor's Guide p.85 (Records: Translation & Analysis)"
    },
    {
        id: "baggers",
        name: "Field Support - Baggers",
        dn: 4,
        complexity: 1,
        summary: "Deploys occult containment/extraction units for dangerous substances or creatures.",
        source: "Supervisor's Guide p.86 (Field Support: Baggers)"
    },
    {
        id: "cleaners",
        name: "Field Support - Cleaners",
        dn: 4,
        complexity: 1,
        summary: "Deploys cover-protection teams for cleanup, disappearance work, and record suppression.",
        source: "Supervisor's Guide p.86 (Field Support: Cleaners)"
    },
    {
        id: "plumbers",
        name: "Field Support - Plumbers",
        dn: 5,
        complexity: 1,
        summary: "Deploys field sorcery support for exorcism, banishment, and witness management.",
        source: "Supervisor's Guide p.86 (Field Support: Plumbers)"
    },
    {
        id: "occulus",
        name: "Field Support - OCCULUS",
        dn: 5,
        complexity: 1,
        summary: "Escalates to OCCULUS heavy intervention teams for catastrophic occult incidents.",
        source: "Supervisor's Guide p.86-87 (Field Support: OCCULUS)"
    },
    {
        id: "counterpossession",
        name: "Counterpossession",
        dn: 4,
        complexity: 1,
        summary: "Dispatches exorcist support for confirmed or suspected possession events.",
        source: "Supervisor's Guide p.88 (Arcana Analysis: Counterpossession)"
    },
    {
        id: "diplomatic-office",
        name: "Diplomatic Office",
        dn: 4,
        complexity: 1,
        summary: "Provides specialist diplomatic support and Advantage to relevant negotiation tests.",
        source: "Supervisor's Guide p.89 (Arcana Analysis: Diplomatic Office)"
    },
    {
        id: "special-projects",
        name: "Special Projects (Laundry Basket)",
        dn: 4,
        complexity: 1,
        summary: "Provides catch-all unconventional backup where no other department fits.",
        source: "Supervisor's Guide p.89 (Arcana Analysis: Special Projects)"
    },
    {
        id: "computational-demonology",
        name: "Computational Demonology",
        dn: 4,
        complexity: 1,
        summary: "Provides CompDem advisory/technical support and Advantage where that support applies.",
        source: "Supervisor's Guide p.90 (R&D: Computational Demonology)"
    },
    {
        id: "mathematical-modelling",
        name: "Mathematical Modelling",
        dn: 5,
        complexity: 1,
        summary: "Assists analysis of large, complex occult datasets and derived projections.",
        source: "Supervisor's Guide p.90 (R&D: Mathematical Modelling)"
    },
    {
        id: "occult-forensics",
        name: "Occult Forensics",
        dn: 4,
        complexity: 1,
        summary: "Analyzes paranormal evidence from scenes, residue, and magical forensic traces.",
        source: "Supervisor's Guide p.90-91 (R&D: Occult Forensics)"
    },
    {
        id: "q-division",
        name: "Q Division",
        dn: 4,
        complexity: 1,
        summary: "Provides specialist kit analysis/support and non-standard technical requisition help.",
        source: "Supervisor's Guide p.91 (R&D: Q Division)"
    }
];

// Equipment requisition thresholds used by gear requisition workflows.
// Source: Operative's Handbook, Requisitioning Gear chapter (pp. 122-132).
export const GEAR_REQUISITION_TABLE = [
    { id: "concealed-ballistic-vest", name: "Concealed Ballistic Vest", category: "Armour", dn: 3, complexity: 1, requirements: "Body (2)", summary: "Concealable ballistic protection.", source: "Operative's Handbook p.125-126" },
    { id: "bomb-suit", name: "Bomb Suit", category: "Armour", dn: 5, complexity: 1, requirements: "Body (4)", summary: "Heavy blast-protection suit.", source: "Operative's Handbook p.126" },

    { id: "disguised-pistol", name: "Disguised Pistol", category: "Weapons", dn: 4, complexity: 1, requirements: "Certification (COWE level 1+)", summary: "Concealed single-shot firearm option.", source: "Operative's Handbook p.124-126" },
    { id: "revolver", name: "Revolver", category: "Weapons", dn: 4, complexity: 1, requirements: "", summary: "Conventional sidearm (reload trait).", source: "Operative's Handbook p.124 weapon table" },
    { id: "automatic-pistol", name: "Automatic Pistol", category: "Weapons", dn: 4, complexity: 1, requirements: "", summary: "Conventional automatic sidearm.", source: "Operative's Handbook p.124 weapon table" },
    { id: "shotgun", name: "Shotgun", category: "Weapons", dn: 4, complexity: 1, requirements: "", summary: "Brutal spread weapon for short range.", source: "Operative's Handbook p.124 weapon table" },
    { id: "submachine-gun", name: "Submachine Gun", category: "Weapons", dn: 5, complexity: 1, requirements: "", summary: "Medium-range automatic weapon.", source: "Operative's Handbook p.124 weapon table" },
    { id: "assault-rifle", name: "Assault Rifle", category: "Weapons", dn: 5, complexity: 1, requirements: "", summary: "Long-range rifle option.", source: "Operative's Handbook p.124 weapon table" },
    { id: "sniper-rifle", name: "Sniper Rifle", category: "Weapons", dn: 5, complexity: 1, requirements: "", summary: "Long-range precision option.", source: "Operative's Handbook p.124 weapon table" },
    { id: "taser", name: "Taser", category: "Weapons", dn: 3, complexity: 1, requirements: "", summary: "Stunning, close-range compliance weapon.", source: "Operative's Handbook p.124 weapon table" },
    { id: "concussion-grenade", name: "Grenade (Concussion)", category: "Weapons", dn: 4, complexity: 1, requirements: "", summary: "Blast/stunning grenade option.", source: "Operative's Handbook p.124 weapon table" },
    { id: "explosive-grenade", name: "Grenade (Explosive)", category: "Weapons", dn: 5, complexity: 1, requirements: "", summary: "High-damage explosive grenade.", source: "Operative's Handbook p.124 weapon table" },
    { id: "smoke-grenade", name: "Grenade (Smoke)", category: "Weapons", dn: 4, complexity: 1, requirements: "", summary: "Smoke obscuration grenade.", source: "Operative's Handbook p.124 weapon table" },
    { id: "grenade-launcher", name: "Grenade Launcher", category: "Weapons", dn: 5, complexity: 1, requirements: "", summary: "Medium-range blast platform.", source: "Operative's Handbook p.124 weapon table" },
    { id: "plastic-explosive", name: "Plastic Explosive", category: "Weapons", dn: 5, complexity: 1, requirements: "", summary: "High-yield demolition charge.", source: "Operative's Handbook p.124 weapon table" },

    { id: "fibre-optic-probe", name: "Fibre Optic Probe", category: "Spy Gear", dn: 4, complexity: 1, requirements: "", summary: "Door/vent visual probe for covert recon.", source: "Operative's Handbook p.126" },
    { id: "keystroke-logger", name: "Keystroke Logger", category: "Spy Gear", dn: 3, complexity: 1, requirements: "", summary: "Hardware keystroke capture device.", source: "Operative's Handbook p.126" },
    { id: "laser-microphone", name: "Laser Microphone", category: "Spy Gear", dn: 4, complexity: 1, requirements: "", summary: "Remote audio capture via reflective surfaces.", source: "Operative's Handbook p.126-127" },
    { id: "locator-bugs", name: "Locator Bugs", category: "Spy Gear", dn: 4, complexity: 1, requirements: "", summary: "Track-and-listen covert marker bugs.", source: "Operative's Handbook p.127" },
    { id: "microdrone", name: "Microdrone", category: "Spy Gear", dn: 5, complexity: 1, requirements: "Certification (Advanced Surveillance)", summary: "Miniature recon drone with AV and link relay.", source: "Operative's Handbook p.127" },
    { id: "nausea-flash", name: "Nausea Flash", category: "Spy Gear", dn: 4, complexity: 1, requirements: "Certification (COWE or COWEU level 1+)", summary: "Disorientation/poison-style strobe device.", source: "Operative's Handbook p.128" },
    { id: "three-w-laser", name: "3-W Laser", category: "Spy Gear", dn: 5, complexity: 1, requirements: "Certification (COWE level 1+)", summary: "Utility laser for sabotage and precision damage.", source: "Operative's Handbook p.128" },
    { id: "smart-card", name: "Smart Card", category: "Spy Gear", dn: 3, complexity: 1, requirements: "", summary: "Hotel lock override card for covert entry.", source: "Operative's Handbook p.128" },
    { id: "t-ray-scanner", name: "T-Ray Scanner", category: "Spy Gear", dn: 5, complexity: 1, requirements: "", summary: "Through-wall/hidden-object scanner.", source: "Operative's Handbook p.128" },

    { id: "banishment-round", name: "Banishment Round", category: "Occult Gear", dn: 3, complexity: 2, requirements: "Certification (COWEU level 1+)", summary: "Silvered anti-entity round with banishment effect.", source: "Operative's Handbook p.128" },
    { id: "basilisk-gun", name: "Basilisk Gun", category: "Occult Gear", dn: 5, complexity: 2, requirements: "Certification (COWEU level 2+)", summary: "Extremely lethal gorgonism-effect weapon.", source: "Operative's Handbook p.129" },
    { id: "concealed-weapon-enchantment", name: "Concealed Weapon", category: "Occult Gear", dn: 5, complexity: 2, requirements: "Certification (COWEU level 1+)", summary: "Makes warrant-unseen weapon carriage possible.", source: "Operative's Handbook p.129" },
    { id: "enhanced-smart-car", name: "Enhanced Smart Car", category: "Occult Gear", dn: 5, complexity: 2, requirements: "Driving licence", summary: "Warded smart vehicle with occult countermeasures.", source: "Operative's Handbook p.129" },
    { id: "erich-zann-violin", name: "Erich Zann Violin", category: "Occult Gear", dn: 6, complexity: 3, requirements: "Certification (COWEU level 3+), Presence Training (2), Virtuoso", summary: "Highly restricted catastrophic magical instrument.", source: "Operative's Handbook p.130" },
    { id: "gravedust-rig", name: "Gravedust Rig", category: "Occult Gear", dn: 5, complexity: 2, requirements: "Certification (Introduction to Applied Occult Computing+)", summary: "Communications platform for dead-entity contact.", source: "Operative's Handbook p.130" },
    { id: "hand-of-glory-class-2-3", name: "Hand of Glory (Class 2-3)", category: "Occult Gear", dn: 4, complexity: 2, requirements: "Certification (IAOC or Basic Stealth & Evasion)", summary: "Unnoticeability relic for standard operational use.", source: "Operative's Handbook p.130-131" },
    { id: "hand-of-glory-class-1-4", name: "Hand of Glory (Class 1/4)", category: "Occult Gear", dn: 5, complexity: 2, requirements: "Certification (IAOC or Basic Stealth & Evasion)", summary: "Special-request Hand of Glory variants.", source: "Operative's Handbook p.130-131" },
    { id: "necronomiphone", name: "Necronomiphone", category: "Occult Gear", dn: 4, complexity: 2, requirements: "Certification (Introduction to Applied Occult Computing)", summary: "Occult app-enabled computational casting platform.", source: "Operative's Handbook p.131" },
    { id: "thaumometer", name: "Thaumometer", category: "Occult Gear", dn: 3, complexity: 2, requirements: "Certification (Introduction to Applied Occult Computing)", summary: "Portable thaumic energy detection instrument.", source: "Operative's Handbook p.132" },
    { id: "personal-wards-class-1-2", name: "Personal Wards (Class 1-2)", category: "Occult Gear", dn: 3, complexity: 2, requirements: "", summary: "Wearable defensive wards (lower classes).", source: "Operative's Handbook p.132" },
    { id: "personal-wards-class-3", name: "Personal Wards (Class 3)", category: "Occult Gear", dn: 4, complexity: 2, requirements: "", summary: "Field-grade wearable defensive ward.", source: "Operative's Handbook p.132" },
    { id: "personal-wards-class-4", name: "Personal Wards (Class 4)", category: "Occult Gear", dn: 5, complexity: 2, requirements: "", summary: "High-risk mission ward package.", source: "Operative's Handbook p.132" },
    { id: "tillinghast-resonator", name: "Tillinghast Resonator", category: "Occult Gear", dn: 5, complexity: 2, requirements: "Certification (Practical Occultism)", summary: "Perception-shift device for invisible occult phenomena.", source: "Operative's Handbook p.132" },
    { id: "warding-tape-class-3", name: "Warding Tape (Class 3)", category: "Occult Gear", dn: 4, complexity: 2, requirements: "", summary: "Field ward-seal tape (class 3).", source: "Operative's Handbook p.132" },
    { id: "warding-tape-class-4", name: "Warding Tape (Class 4)", category: "Occult Gear", dn: 5, complexity: 2, requirements: "", summary: "Field ward-seal tape (class 4).", source: "Operative's Handbook p.132" }
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
