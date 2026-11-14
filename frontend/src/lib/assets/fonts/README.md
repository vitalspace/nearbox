# Fuentes del loader

Ambas tipografías se descargan del catálogo de Google Fonts y se empaquetan en
el build (no se piden a un CDN en tiempo de ejecución).

- **Creepster** — © Sideshow, licencia SIL Open Font License 1.1.
  <https://fonts.google.com/specimen/Creepster>
- **IM Fell English** — © Igino Marini, licencia SIL Open Font License 1.1.
  <https://fonts.google.com/specimen/IM+Fell+English>

Los archivos `.woff2` son los subsets `latin` que sirve Google Fonts. Se usan en
`src/routes/layout.css` mediante `@font-face`.
