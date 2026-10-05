# Thread

## Thread controls

Dropdowns, checkboxes, and color pickers use the reusable components in `src/app/shared/controls/thread-controls.ts`. Dropdown options are `thread-option` elements with a value and label; long menus include search. The controls support keyboard navigation, disabled states, accessible labels, and Thread theme tokens. Floating panels attach to the document body so canvas transforms and scrolling containers do not clip them. The color picker supports preset colors, hue/saturation/brightness, and validated hex values, committing a drag once on release. Existing change handlers continue to receive `event.target.value` or `event.target.checked`.

## Sticker assets

The canvas sticker picker uses the original SVG stickers in `public/stickers/` and the Wevi PNG collection in `public/stickers/wevi/`. Wevi sticker names, categories, dimensions, and search terms are registered in `src/app/features/canvas/wevi-stickers.ts`. The clean separated pack replaces the original generated images while preserving saved board URLs. Keep each PNG's category folder and filename aligned with its registry ID (`category.name`).

## ER diagrams

Open **Add → ER diagram starter** for a Customer/Order example, or choose **ER entity** to start from scratch. Edit field names, types, and PK/FK roles directly on any entity card while using Select. Press Enter to add the next field. The type dropdown supports standard types, enums, foreign-key references, and custom types. Open the field?s ? menu for enum values, reference targets, required/unique constraints, defaults, notes, reordering, and removal. Choosing a reference creates a field-level relationship and synchronizes the foreign key?s type. Export DBML downloads the schema, enums, constraints, and references. Use **Connect entity** to link two existing entities, or **+ Related entity** to create a new entity with a foreign key. Choose a target from the connection menu or tap an entity. Select a relationship to change its label and cardinality. Automatic routes use separate ports and avoid cards; Arrange diagram spaces all ER entities into columns and resets routing. Select (V) edits and moves objects; Pan (H), Space, or two-finger gestures move the board.

## Shapes

The Shapes tool provides labeled previews for processes, decisions, start/end nodes, ellipses, databases, documents, input/output, and other common shapes. Choose a color theme before drawing, or change an existing shape?s type, theme, fill, border, and label in Details. Connector attachment uses the same geometry as the rendered outline.

Design references: [DBML schema conventions](https://dbml.dbdiagram.io/docs/) and [draw.io flowchart shapes](https://www.drawio.com/docs/getting-started/basic-flowchart/).

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.0.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
