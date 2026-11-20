# Third-Party Notices

The following direct dependencies are declared by the root npm workspaces.
Version ranges are maintained in the corresponding workspace `package.json`
files; the resolved versions are pinned by `package-lock.json`.

| Package | Source | License |
|---|---|---|
| `@types/node` | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) | MIT |
| `typescript` | [Microsoft TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| `vitest` | [Vitest](https://github.com/vitest-dev/vitest) | MIT |
| `@types/react` | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react) | MIT |
| `@types/react-dom` | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom) | MIT |
| `@vitejs/plugin-react` | [Vite](https://github.com/vitejs/vite-plugin-react) | MIT |
| `vite` | [Vite](https://github.com/vitejs/vite) | MIT |
| `@tailwindcss/vite` | [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT |
| `tailwindcss` | [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT |
| `react` | [React](https://github.com/facebook/react) | MIT |
| `react-dom` | [React](https://github.com/facebook/react) | MIT |
| `@types/better-sqlite3` | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/better-sqlite3) | MIT |
| `@types/express` | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/express) | MIT |
| `@types/ws` | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ws) | MIT |
| `better-sqlite3` | [WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | MIT |
| `express` | [Express](https://github.com/expressjs/express) | MIT |
| `ws` | [ws](https://github.com/websockets/ws) | MIT |
| `tsx` | [privatenumber/tsx](https://github.com/privatenumber/tsx) | MIT |
| `googleapis` (190.0.0) | [Google APIs Node.js Client](https://github.com/googleapis/google-api-nodejs-client) | Apache-2.0 |
| `plantuml.jar` (diagram generation tool) | [PlantUML](https://github.com/plantuml/plantuml) | GPL-3.0-or-later |

`@quiz-buzzer/shared` is an internal workspace package maintained in this
repository and is not an external dependency. The `googleapis` dependency is
used by the server-side Guided Notes adapter only; credentials remain in
environment variables and are not included in this notice.

The three `.puml` source files in `diagrams/` are project-authored diagrams;
PlantUML's official FAQ states that generated images are owned by the author of
their diagram source and are not covered by the PlantUML program license.
