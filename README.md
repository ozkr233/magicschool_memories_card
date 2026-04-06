# Strixhaven Memories — Foundry VTT Module

Módulo para Foundry VTT v13 (sistema **dnd5e**) que añade una ficha de estudiante de Strixhaven a los personajes (`character`), replicando el layout de la hoja "Strixhaven Memories" oficial.

## Secciones incluidas

- **Relationships** — 5 filas iniciales (añadibles), con Name, Points, Relationship, Inspiration (checkbox) y Boon/Bane.
- **Report Cards** — 4 años con clases numeradas y contadores de Rerolls / d4s / Skills. Year 4 incluye la casilla especial **No Time!** (Perception, Nature).
- **Extracurriculars** — con Name, d4, Skills y Member.
- **Job** — Employer, Job y Coworker.
- **Graduation** — área de texto libre.

Los datos se guardan en `actor.flags.strixhaven-memories.memories` — no tocan ningún dato nativo de dnd5e, así que es seguro desinstalar.

## Instalación (desarrollo)

1. Copia la carpeta `strixhaven-memories/` dentro de `Data/modules/` de Foundry.
2. Reinicia Foundry y activa el módulo en tu mundo desde **Manage Modules**.
3. Abre la ficha de memorias de cualquiera de estas 3 formas:
   - **Botón en la cabecera** de la hoja de personaje (icono 🎓 "Strixhaven").
   - **Click derecho** sobre el personaje en el panel de Actores → *Strixhaven Memories*.
   - **Desde una macro o la consola**: `StrixhavenMemories.open()` (usa el token seleccionado o tu personaje asignado), o `StrixhavenMemories.open(actor)`.

## Compatibilidad

- Foundry VTT **v13** y **v14**
- dnd5e system **5.0.0 – 5.3.0** (testado en 5.3.0)

## Instalación como ZIP

Comprime la carpeta `strixhaven-memories` en un `.zip` y úsala con Foundry usando "Install Module → Manifest URL" apuntando a tu `module.json` si la publicas en GitHub.

## Estructura

```
strixhaven-memories/
├── module.json
├── scripts/
│   └── strixhaven-memories.js
├── templates/
│   └── student-sheet.hbs
├── styles/
│   └── strixhaven-memories.css
└── lang/
    ├── en.json
    └── es.json
```

## API

El módulo expone una pequeña API:

```js
game.modules.get("strixhaven-memories").api.open(actor);
```

## Notas técnicas

- Usa **ApplicationV2 + HandlebarsApplicationMixin** (la nueva API de Foundry v13).
- El hook `getHeaderControlsActorSheet` añade el botón; incluye fallback a `getActorSheetHeaderButtons` por compatibilidad con hojas dnd5e antiguas.
- `submitOnChange: true` guarda automáticamente cada cambio en los flags del actor.
