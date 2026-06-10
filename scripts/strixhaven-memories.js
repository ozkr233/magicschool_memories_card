/**
 * Strixhaven Memories - Foundry VTT Module
 * Adds a student sheet to dnd5e character actors.
 */

const MODULE_ID = "strixhaven-memories";
const FLAG_KEY = "memories";

/* -------------------------------------------- */
/*  Default data structure                      */
/* -------------------------------------------- */

function getDefaultData() {
  return {
    relationships: Array.from({ length: 5 }, () => ({
      name: "",
      points: 0,
      type: "",          // "", "friend", "rival", "beloved"
      details: "",       // free text for nuance
      inspiration: false,
      boonBane: ""
    })),
    reportCards: {
      year1: makeYearData(3),
      year2: makeYearData(3),
      year3: makeYearData(3),
      year4: makeYearData(1, true) // Year 4 includes "No Time!"
    },
    schedule: [],        // [{ year: "year1", course: "", instructor: "", day: "", time: "", location: "", notes: "" }]
    extracurriculars: Array.from({ length: 2 }, () => ({
      name: "",
      d4: true,
      skills: [],
      member: ""
    })),
    studentDice: [],     // [{ available: true, skills: ["performance"], source: "" }]
    job: {
      employer: "",
      job: "",
      coworker: ""
    },
    graduation: ""
  };
}

function makeYearData(classCount, hasNoTime = false) {
  const classes = Array.from({ length: classCount }, () => ({
    studying: "skipped",   // "skipped", "studied", "allNighter"
    studyingSuccess: false,
    test1: false,
    test2: false
  }));
  const data = { classes };
  if (hasNoTime) {
    data.noTime = { value: 0, skills: "Perception, Nature" };
  }
  return data;
}

/* -------------------------------------------- */
/*  The Student Sheet                           */
/* -------------------------------------------- */

class StrixhavenStudentSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  /** @type {Map<string, StrixhavenStudentSheet>} Open sheets keyed by actor ID */
  static _instances = new Map();

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    // Register this instance
    StrixhavenStudentSheet._instances.set(actor.id, this);
  }

  /** Remove from singleton map when the window is closed */
  async _onClose(options) {
    StrixhavenStudentSheet._instances.delete(this.actor.id);
    return super._onClose(options);
  }

  static DEFAULT_OPTIONS = {
    id: "strixhaven-student-{id}",
    classes: ["strixhaven-memories", "sheet"],
    tag: "form",
    window: {
      title: "Strixhaven Memories",
      icon: "fa-solid fa-graduation-cap",
      resizable: true
    },
    position: {
      width: 1100,
      height: 860
    },
    form: {
      handler: StrixhavenStudentSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addRelationship: StrixhavenStudentSheet.#onAddRelationship,
      removeRelationship: StrixhavenStudentSheet.#onRemoveRelationship,
      addExtracurricular: StrixhavenStudentSheet.#onAddExtracurricular,
      removeExtracurricular: StrixhavenStudentSheet.#onRemoveExtracurricular,
      addStudentDie: StrixhavenStudentSheet.#onAddStudentDie,
      removeStudentDie: StrixhavenStudentSheet.#onRemoveStudentDie,
      addScheduleEntry: StrixhavenStudentSheet.#onAddScheduleEntry,
      removeScheduleEntry: StrixhavenStudentSheet.#onRemoveScheduleEntry,
      changeSheetColor: StrixhavenStudentSheet.#onChangeSheetColor,
      reset: StrixhavenStudentSheet.#onReset
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/student-sheet.hbs`,
      scrollable: [".sm-body"]
    }
  };

  get title() {
    return `${this.actor.name} — Strixhaven Memories`;
  }

  async _prepareContext(_options) {
    const stored = this.actor.getFlag(MODULE_ID, FLAG_KEY);
    const data = foundry.utils.mergeObject(getDefaultData(), stored ?? {}, {
      inplace: false
    });

    const yearLabels = { year1: "YEAR 1", year2: "YEAR 2", year3: "YEAR 3", year4: "YEAR 4" };
    for (const [key, year] of Object.entries(data.reportCards)) {
      year.label = yearLabels[key] ?? key.toUpperCase();
      year.classes.forEach((cls, idx) => {
        cls.label = `#${idx + 1}`;
        // Rerolls earned from studying phase
        if (!cls.studyingSuccess) cls.rerollsEarned = 0;
        else if (cls.studying === "allNighter") cls.rerollsEarned = 2;
        else if (cls.studying === "studied") cls.rerollsEarned = 1;
        else cls.rerollsEarned = 0;
        // Exam result based on testing passes
        const passes = (cls.test1 ? 1 : 0) + (cls.test2 ? 1 : 0);
        cls.result = passes === 0 ? "failed" : passes === 1 ? "passed" : "aced";
        cls.resultLabel = cls.result === "failed" ? "Failed" : cls.result === "passed" ? "Passed" : "Aced";
      });
    }

    // Ensure studentDice is an array (flags storage may return an object)
    if (!Array.isArray(data.studentDice)) {
      data.studentDice = data.studentDice ? Object.values(data.studentDice) : [];
    }
    // Normalize each die's skills field: always an array of skill keys
    data.studentDice.forEach((die) => {
      if (typeof die.skills === "string") {
        die.skills = die.skills ? [die.skills] : [];
      } else if (!Array.isArray(die.skills)) {
        die.skills = die.skills ? Object.values(die.skills) : [];
      }
    });

    // Same normalization for extracurriculars (skills now supports multi-select)
    if (!Array.isArray(data.extracurriculars)) {
      data.extracurriculars = data.extracurriculars ? Object.values(data.extracurriculars) : [];
    }
    data.extracurriculars.forEach((ext) => {
      if (typeof ext.skills === "string") {
        ext.skills = ext.skills ? [ext.skills] : [];
      } else if (!Array.isArray(ext.skills)) {
        ext.skills = ext.skills ? Object.values(ext.skills) : [];
      }
    });

    // Normalize schedule data
    if (!Array.isArray(data.schedule)) {
      data.schedule = data.schedule ? Object.values(data.schedule) : [];
    }

    // Build a skill options dictionary from dnd5e CONFIG
    const skillOptions = {};
    const configSkills = CONFIG?.DND5E?.skills ?? {};
    for (const [key, entry] of Object.entries(configSkills)) {
      const label = entry?.label ?? entry?.name ?? key;
      skillOptions[key] = game.i18n.localize(label);
    }

    // Load the user's chosen background color for this module
    const bgColor = game.user.getFlag(MODULE_ID, "sheetBgColor") || "";

    return {
      actor: this.actor,
      data,
      skillOptions,
      bgColor,
      colorPresets: [
        { value: "",        label: "Default",    css: "",        group: "dark" },
        { value: "#1a1816", label: "Charcoal",   css: "#1a1816", group: "dark" },
        { value: "#1a1520", label: "Plum",       css: "#1a1520", group: "dark" },
        { value: "#131a1f", label: "Midnight",   css: "#131a1f", group: "dark" },
        { value: "#1a1d13", label: "Forest",     css: "#1a1d13", group: "dark" },
        { value: "#1f1713", label: "Espresso",   css: "#1f1713", group: "dark" },
        { value: "#181318", label: "Shadow",     css: "#181318", group: "dark" },
        { value: "#131519", label: "Slate",      css: "#131519", group: "dark" },
        { value: "#1a1310", label: "Ember",      css: "#1a1310", group: "dark" },
        { value: "sep",     label: "",           css: "",        group: "sep"  },
        { value: "#f4f1e8", label: "Parchment",  css: "#f4f1e8", group: "light" },
        { value: "#f5f3ef", label: "Ivory",      css: "#f5f3ef", group: "light" },
        { value: "#eef0f2", label: "Pearl",      css: "#eef0f2", group: "light" },
        { value: "#ece8f0", label: "Lavender",   css: "#ece8f0", group: "light" },
        { value: "#e8ede6", label: "Sage",       css: "#e8ede6", group: "light" }
      ],
      studyingOptions: {
        skipped: "Skipped",
        studied: "Studied",
        allNighter: "All-Nighter"
      },
      relationshipTypes: {
        "": "—",
        friend: "Friend",
        acquaintance: "Acquaintance",
        rival: "Rival",
        beloved: "Beloved"
      },
      yearOptions: {
        "": "—",
        year1: "Year 1",
        year2: "Year 2",
        year3: "Year 3",
        year4: "Year 4"
      },
      isEditable: this.actor.isOwner
    };
  }

  /* ---------------------------------------- */
  /*  Apply user's background color on render */
  /* ---------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    const bgColor = context.bgColor;
    const el = this.element;
    // List of all overridable CSS variables
    const vars = [
      "--sm-bg", "--sm-bg-card", "--sm-bg-raised", "--sm-bg-inset",
      "--sm-ink", "--sm-ink-bright", "--sm-ink-soft", "--sm-ink-faint",
      "--sm-border", "--sm-border-hover",
      "--sm-gold", "--sm-gold-bright", "--sm-gold-dim", "--sm-gold-border"
    ];
    if (bgColor) {
      const isLight = this.#isLightColor(bgColor);
      el.style.setProperty("--sm-bg", bgColor);
      if (isLight) {
        // Light theme overrides
        el.style.setProperty("--sm-bg-card", this.#lighten(bgColor, -8));
        el.style.setProperty("--sm-bg-raised", this.#lighten(bgColor, -14));
        el.style.setProperty("--sm-bg-inset", this.#lighten(bgColor, -4));
        el.style.setProperty("--sm-ink", "#2a2520");
        el.style.setProperty("--sm-ink-bright", "#1a1510");
        el.style.setProperty("--sm-ink-soft", "#5a5550");
        el.style.setProperty("--sm-ink-faint", "#8a857e");
        el.style.setProperty("--sm-border", "#ccc6bc");
        el.style.setProperty("--sm-border-hover", "#b0a89c");
        el.style.setProperty("--sm-gold", "#8b6914");
        el.style.setProperty("--sm-gold-bright", "#6b4f0a");
        el.style.setProperty("--sm-gold-dim", "rgba(139, 105, 20, 0.10)");
        el.style.setProperty("--sm-gold-border", "rgba(139, 105, 20, 0.30)");
      } else {
        // Dark theme — derive shades, keep default ink/accent
        el.style.setProperty("--sm-bg-card", this.#lighten(bgColor, 12));
        el.style.setProperty("--sm-bg-raised", this.#lighten(bgColor, 20));
        el.style.setProperty("--sm-bg-inset", this.#lighten(bgColor, -5));
        // Remove any light overrides that may linger
        ["--sm-ink", "--sm-ink-bright", "--sm-ink-soft", "--sm-ink-faint",
         "--sm-border", "--sm-border-hover",
         "--sm-gold", "--sm-gold-bright", "--sm-gold-dim", "--sm-gold-border"
        ].forEach(v => el.style.removeProperty(v));
      }
    } else {
      // Reset everything to CSS defaults
      vars.forEach(v => el.style.removeProperty(v));
    }
  }

  /** Lighten/darken a hex color by an amount (positive = lighter) */
  #lighten(hex, amount) {
    hex = hex.replace("#", "");
    const num = parseInt(hex, 16);
    let r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
    let g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
    let b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  /** Determine if a hex color is "light" (luminance > 0.5) */
  #isLightColor(hex) {
    hex = hex.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    // Relative luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 0.5;
  }

  /* ---------------------------------------- */
  /*  Form submission                         */
  /* ---------------------------------------- */

  static async #onSubmit(event, form, formData) {
    const expanded = foundry.utils.expandObject(formData.object);
    // Normalize arrays: expandObject turns "relationships.0.name" into {relationships:{0:{...}}}
    if (expanded.relationships) {
      expanded.relationships = Object.values(expanded.relationships);
    }
    if (expanded.extracurriculars) {
      expanded.extracurriculars = Object.values(expanded.extracurriculars);
      expanded.extracurriculars.forEach((ext) => {
        if (ext.skills == null) ext.skills = [];
        else if (typeof ext.skills === "string") ext.skills = [ext.skills];
        else if (!Array.isArray(ext.skills)) ext.skills = Object.values(ext.skills);
      });
    }
    if (expanded.studentDice) {
      expanded.studentDice = Object.values(expanded.studentDice);
      // Ensure each die's skills is an array (multi-select can return string or array)
      expanded.studentDice.forEach((die) => {
        if (die.skills == null) die.skills = [];
        else if (typeof die.skills === "string") die.skills = [die.skills];
        else if (!Array.isArray(die.skills)) die.skills = Object.values(die.skills);
      });
    }
    if (expanded.reportCards) {
      for (const year of Object.keys(expanded.reportCards)) {
        const y = expanded.reportCards[year];
        if (y.classes) y.classes = Object.values(y.classes);
      }
    }
    if (expanded.schedule) {
      expanded.schedule = Object.values(expanded.schedule);
    }
    await this.actor.setFlag(MODULE_ID, FLAG_KEY, expanded);
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  static async #onAddRelationship(_event, _target) {
    const current = this.actor.getFlag(MODULE_ID, FLAG_KEY) ?? getDefaultData();
    current.relationships = current.relationships ?? [];
    current.relationships.push({
      name: "",
      points: 0,
      type: "",
      details: "",
      inspiration: false,
      boonBane: ""
    });
    await this.actor.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render();
  }

  static async #onRemoveRelationship(_event, target) {
    const index = Number(target.dataset.index);
    const current = this.actor.getFlag(MODULE_ID, FLAG_KEY) ?? getDefaultData();
    current.relationships.splice(index, 1);
    await this.actor.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render();
  }

  static async #onAddExtracurricular(_event, _target) {
    const current = this.actor.getFlag(MODULE_ID, FLAG_KEY) ?? getDefaultData();
    current.extracurriculars = current.extracurriculars ?? [];
    current.extracurriculars.push({
      name: "",
      d4: true,
      skills: [],
      member: ""
    });
    await this.actor.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render();
  }

  static async #onRemoveExtracurricular(_event, target) {
    const index = Number(target.dataset.index);
    const current = this.actor.getFlag(MODULE_ID, FLAG_KEY) ?? getDefaultData();
    current.extracurriculars.splice(index, 1);
    await this.actor.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render();
  }

  static async #onAddStudentDie(_event, _target) {
    const current = this.actor.getFlag(MODULE_ID, FLAG_KEY) ?? getDefaultData();
    current.studentDice = Array.isArray(current.studentDice)
      ? current.studentDice
      : (current.studentDice ? Object.values(current.studentDice) : []);
    current.studentDice.push({
      available: true,
      skills: [],
      source: ""
    });
    await this.actor.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render();
  }

  static async #onRemoveStudentDie(_event, target) {
    const index = Number(target.dataset.index);
    const current = this.actor.getFlag(MODULE_ID, FLAG_KEY) ?? getDefaultData();
    current.studentDice = Array.isArray(current.studentDice)
      ? current.studentDice
      : (current.studentDice ? Object.values(current.studentDice) : []);
    current.studentDice.splice(index, 1);
    await this.actor.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render();
  }

  static async #onAddScheduleEntry(_event, _target) {
    const current = this.actor.getFlag(MODULE_ID, FLAG_KEY) ?? getDefaultData();
    current.schedule = Array.isArray(current.schedule)
      ? current.schedule
      : (current.schedule ? Object.values(current.schedule) : []);
    current.schedule.push({
      year: "",
      course: "",
      instructor: "",
      day: "",
      time: "",
      location: "",
      notes: ""
    });
    await this.actor.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render();
  }

  static async #onRemoveScheduleEntry(_event, target) {
    const index = Number(target.dataset.index);
    const current = this.actor.getFlag(MODULE_ID, FLAG_KEY) ?? getDefaultData();
    current.schedule = Array.isArray(current.schedule)
      ? current.schedule
      : (current.schedule ? Object.values(current.schedule) : []);
    current.schedule.splice(index, 1);
    await this.actor.setFlag(MODULE_ID, FLAG_KEY, current);
    this.render();
  }

  static async #onChangeSheetColor(_event, target) {
    const color = target.dataset.color ?? "";
    await game.user.setFlag(MODULE_ID, "sheetBgColor", color);
    this.render();
  }

  static async #onReset(_event, _target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Strixhaven Memories" },
      content: "<p>¿Reiniciar toda la ficha de memorias de este personaje?</p>"
    });
    if (!confirmed) return;
    await this.actor.unsetFlag(MODULE_ID, FLAG_KEY);
    this.render();
  }
}

/* -------------------------------------------- */
/*  Helper                                      */
/* -------------------------------------------- */

function openForActor(actor) {
  if (!actor) {
    ui.notifications?.warn("Strixhaven Memories: no actor provided.");
    return;
  }
  // Singleton: if a sheet for this actor is already open, bring it to front
  const existing = StrixhavenStudentSheet._instances.get(actor.id);
  if (existing && existing.rendered) {
    existing.bringToFront();
    return;
  }
  new StrixhavenStudentSheet(actor).render(true);
}

function isCharacterActor(actor) {
  if (!actor) return false;
  // dnd5e 5.x exposes isCharacter on the actor data model
  if (typeof actor.isCharacter === "boolean") return actor.isCharacter;
  return actor.type === "character";
}

/* -------------------------------------------- */
/*  Hook: inject a button in the character      */
/*  sheet's vertical sidebar (the black strip   */
/*  on the right with the cog, skills, etc.)    */
/* -------------------------------------------- */

Hooks.on("renderActorSheetV2", (app, html, _context, _options) => {
  const actor = app?.actor;
  if (!isCharacterActor(actor)) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  // The dnd5e v2 character sheet has a vertical tab strip on the right side.
  // It can be found by a few selectors depending on the sheet version.
  const tabStrip =
    root.querySelector("nav.tabs.tabs-right") ??
    root.querySelector("nav.tabs[data-group='primary']") ??
    root.querySelector(".tabs.right") ??
    root.querySelector(".sheet-tabs.tabs-right") ??
    root.querySelector("nav.sheet-navigation.tabs");

  // Avoid duplicating on re-render
  const existingBtn = root.querySelector(".strixhaven-memories-sidebar-btn");
  if (existingBtn) existingBtn.remove();

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "strixhaven-memories-sidebar-btn";
  btn.dataset.tooltip = "Strixhaven Memories";
  btn.setAttribute("aria-label", "Strixhaven Memories");
  btn.innerHTML = '<i class="fa-solid fa-graduation-cap"></i>';
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openForActor(actor);
  });

  if (tabStrip) {
    // Append to the end of the vertical tab strip
    tabStrip.appendChild(btn);
    return;
  }

  // Fallback: add the button to the window header as before
  const windowEl = root.closest(".application") ?? root.closest(".window-app");
  if (!windowEl) return;
  const header = windowEl.querySelector(".window-header");
  if (!header) return;
  btn.classList.add("header-control", "icon");
  const closeBtn =
    header.querySelector('[data-action="close"]') ??
    header.querySelector(".header-control.close") ??
    header.querySelector(".close");
  if (closeBtn) header.insertBefore(btn, closeBtn);
  else header.appendChild(btn);
});

/* -------------------------------------------- */
/*  Fallback: context menu entry on sidebar     */
/*  (right-click on actor in the Actors tab)    */
/* -------------------------------------------- */

Hooks.on("getActorContextOptions", (_html, options) => {
  options.push({
    name: "Strixhaven Memories",
    icon: '<i class="fa-solid fa-graduation-cap"></i>',
    condition: (li) => {
      const actor = game.actors.get(li.dataset?.entryId ?? li.dataset?.documentId);
      return isCharacterActor(actor);
    },
    callback: (li) => {
      const actor = game.actors.get(li.dataset?.entryId ?? li.dataset?.documentId);
      openForActor(actor);
    }
  });
});

// Legacy hook name for older sidebars
Hooks.on("getActorDirectoryEntryContext", (_html, options) => {
  options.push({
    name: "Strixhaven Memories",
    icon: '<i class="fa-solid fa-graduation-cap"></i>',
    condition: (li) => {
      const id = li.data?.("entry-id") ?? li.data?.("document-id") ?? li[0]?.dataset?.entryId;
      const actor = game.actors.get(id);
      return isCharacterActor(actor);
    },
    callback: (li) => {
      const id = li.data?.("entry-id") ?? li.data?.("document-id") ?? li[0]?.dataset?.entryId;
      openForActor(game.actors.get(id));
    }
  });
});

/* -------------------------------------------- */
/*  Student Dice helpers                        */
/* -------------------------------------------- */

// Returns a unified list of available dice sources:
// - Regular student dice → { type: "die", index, available, skills, source }
// - Active extracurriculars → { type: "ext", index, available, skills, source }
function getAllDiceSources(actor) {
  const data = actor.getFlag(MODULE_ID, FLAG_KEY);
  if (!data) return [];
  const sources = [];

  // Regular Student Dice
  let dice = data.studentDice;
  if (!Array.isArray(dice)) dice = dice ? Object.values(dice) : [];
  dice.forEach((die, idx) => {
    let skills = die.skills;
    if (typeof skills === "string") skills = skills ? [skills] : [];
    else if (!Array.isArray(skills)) skills = skills ? Object.values(skills) : [];
    sources.push({
      type: "die",
      index: idx,
      available: !!die.available,
      skills,
      source: die.source || ""
    });
  });

  // Extracurriculars (each one is implicitly a d4 source for its skills)
  let exts = data.extracurriculars;
  if (!Array.isArray(exts)) exts = exts ? Object.values(exts) : [];
  exts.forEach((ext, idx) => {
    if (!ext.name) return; // only count named extracurriculars
    let skills = ext.skills;
    if (typeof skills === "string") skills = skills ? [skills] : [];
    else if (!Array.isArray(skills)) skills = skills ? Object.values(skills) : [];
    if (skills.length === 0) return;
    sources.push({
      type: "ext",
      index: idx,
      available: !!ext.d4,
      skills,
      source: ext.name
    });
  });

  return sources;
}

async function markDiceSourceSpent(actor, source) {
  const data = actor.getFlag(MODULE_ID, FLAG_KEY) ?? getDefaultData();

  if (source.type === "die") {
    if (!Array.isArray(data.studentDice)) {
      data.studentDice = data.studentDice ? Object.values(data.studentDice) : [];
    }
    if (data.studentDice[source.index]) {
      data.studentDice[source.index].available = false;
    }
  } else if (source.type === "ext") {
    if (!Array.isArray(data.extracurriculars)) {
      data.extracurriculars = data.extracurriculars ? Object.values(data.extracurriculars) : [];
    }
    if (data.extracurriculars[source.index]) {
      data.extracurriculars[source.index].d4 = false;
    }
  }
  await actor.setFlag(MODULE_ID, FLAG_KEY, data);
}

async function restoreAllStudentDice(actor) {
  const data = actor.getFlag(MODULE_ID, FLAG_KEY);
  if (!data) return 0;
  let restored = 0;

  // Regular student dice
  let dice = data.studentDice;
  if (!Array.isArray(dice)) dice = dice ? Object.values(dice) : [];
  dice.forEach((die) => {
    if (!die.available) {
      die.available = true;
      restored++;
    }
  });
  data.studentDice = dice;

  // Extracurriculars
  let exts = data.extracurriculars;
  if (!Array.isArray(exts)) exts = exts ? Object.values(exts) : [];
  exts.forEach((ext) => {
    if (ext.name && !ext.d4) {
      ext.d4 = true;
      restored++;
    }
  });
  data.extracurriculars = exts;

  if (restored > 0) {
    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
  }
  return restored;
}

/* -------------------------------------------- */
/*  Hook: intercept skill rolls to offer        */
/*  Student Dice                                */
/* -------------------------------------------- */

Hooks.on("dnd5e.preRollSkillV2", (config, dialog, message) => {
  return handleStudentDicePreRoll(config, dialog, message);
});

// Fallback for older/alternate hook name
Hooks.on("dnd5e.preRollSkill", (config, dialog, message) => {
  return handleStudentDicePreRoll(config, dialog, message);
});

function handleStudentDicePreRoll(config, _dialog, _message) {
  // Skip if we already processed this roll (re-invocation after dialog)
  if (config?.strixhavenMemoriesProcessed) return true;

  const actor = config?.subject;
  if (!actor || !isCharacterActor(actor)) return true;

  const skillId = config?.skill;
  if (!skillId) return true;

  const sources = getAllDiceSources(actor);
  const applicable = sources.filter(
    (s) => s.available && Array.isArray(s.skills) && s.skills.includes(skillId)
  );
  if (applicable.length === 0) return true;

  // Cancel the current roll and open a dialog to choose whether to apply a die
  promptStudentDie(actor, skillId, applicable);
  return false;
}

async function promptStudentDie(actor, skillId, applicable) {
  const skillLabel =
    game.i18n.localize(CONFIG?.DND5E?.skills?.[skillId]?.label ?? skillId) ?? skillId;

  // Build dialog content. Each option's value encodes type:index so we can look it up back.
  const options = applicable
    .map((src) => {
      const typeLabel =
        src.type === "ext"
          ? game.i18n.localize("SM.Extracurriculars")
          : game.i18n.localize("SM.StudentDice");
      const label = src.source
        ? `${src.source} (${typeLabel})`
        : typeLabel;
      const value = `${src.type}:${src.index}`;
      return `<option value="${value}">${foundry.utils.escapeHTML(label)}</option>`;
    })
    .join("");

  const content = `
    <p>${game.i18n.format("SM.StudentDiceAvailable", { skill: skillLabel })}</p>
    <div class="form-group">
      <label>${game.i18n.localize("SM.ChooseStudentDie")}</label>
      <select name="chosenDie" style="width:100%;">
        <option value="">${game.i18n.localize("SM.NoStudentDie")}</option>
        ${options}
      </select>
    </div>
  `;

  const chosen = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SM.StudentDice") },
    content,
    buttons: [
      {
        action: "roll",
        label: game.i18n.localize("SM.Roll") || "Roll",
        default: true,
        callback: (_ev, button) => {
          const sel = button.form?.elements?.chosenDie;
          return sel?.value ?? "";
        }
      },
      {
        action: "cancel",
        label: game.i18n.localize("Cancel") || "Cancel",
        callback: () => null
      }
    ],
    rejectClose: false
  }).catch(() => null);

  if (chosen === null || chosen === undefined) return;

  // Re-invoke the skill roll
  const rollConfig = {
    skill: skillId,
    strixhavenMemoriesProcessed: true
  };

  if (chosen !== "") {
    const [type, idxStr] = chosen.split(":");
    const chosenSource = applicable.find(
      (s) => s.type === type && s.index === Number(idxStr)
    );
    if (chosenSource) {
      rollConfig.rolls = [{ parts: ["1d4"], data: {} }];
      await markDiceSourceSpent(actor, chosenSource);
      ui.notifications?.info(
        game.i18n.format("SM.StudentDieSpent", { skill: skillLabel })
      );
    }
  }

  if (typeof actor.rollSkillV2 === "function") {
    await actor.rollSkillV2(rollConfig);
  } else if (typeof actor.rollSkill === "function") {
    await actor.rollSkill(rollConfig);
  }
}

/* -------------------------------------------- */
/*  Hook: restore Student Dice on long rest     */
/* -------------------------------------------- */

Hooks.on("dnd5e.restCompleted", async (actor, result, _config) => {
  if (!isCharacterActor(actor)) return;
  // dnd5e passes a result object with `longRest: true` for long rests
  const isLong = result?.longRest === true || _config?.type === "long";
  if (!isLong) return;

  const restored = await restoreAllStudentDice(actor);
  if (restored > 0) {
    ui.notifications?.info(
      game.i18n.format("SM.StudentDiceRestored", { count: restored })
    );
  }
});

/* -------------------------------------------- */
/*  Init: expose API + global helper            */
/* -------------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Strixhaven Memories`);

  // Register Handlebars "eq" helper for template comparisons
  if (!Handlebars.helpers.eq) {
    Handlebars.registerHelper("eq", (a, b) => a === b);
  }

  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      StrixhavenStudentSheet,
      open: openForActor
    };
  }
});

Hooks.once("ready", () => {
  // Global helper so you can always open the sheet from a macro or console:
  //   StrixhavenMemories.open(actor)            // specific actor
  //   StrixhavenMemories.open()                  // selected token's actor
  globalThis.StrixhavenMemories = {
    open: (actor) => {
      actor ??= canvas.tokens?.controlled?.[0]?.actor ?? game.user?.character;
      openForActor(actor);
    }
  };
  console.log(`${MODULE_ID} | Ready. Use StrixhavenMemories.open(actor) from a macro.`);
});
