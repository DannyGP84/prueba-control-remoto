# Video 3D vertical: cómo elegir Claude Opus 5.5 en la app de Claude

Animación de 20 s en 1080×1920 y 30 fps para Reels/TikTok. Está hecha con Three.js, se renderiza fotograma a fotograma con Chromium y se codifica a MP4 (H.264 + AAC) con ffmpeg. La música se sintetiza por código.

## Guion (20 s)

| Tiempo | Plano | Texto |
|---|---|---|
| 0–3 s | El teléfono sube girando entre aros de luz | «Cómo elegir *Claude Opus 5.5*» |
| 3–7 s | Acercamiento al botón del modelo, marco luminoso y toque | 01 · Toca el nombre del modelo |
| 7–11 s | Paneo al menú | 02 · Abre «More models» |
| 11–15 s | Acercamiento a la lista | 03 · Elige Claude Opus 5.5 |
| 15–18 s | Menú de esfuerzo | 04 · Ajusta «Effort» (opcional) |
| 18–20 s | Plano general y golpe final | ¡Listo! · Fuente: support.claude.com |

## Tus capturas

Guarda estas 5 capturas de tu app en `screens/`, con estos nombres exactos:

1. `01-chat.png`: un chat abierto donde se vea el nombre del modelo junto al botón de enviar.
2. `02-menu.png`: el menú que aparece al tocar el nombre del modelo.
3. `03-mas-modelos.png`: la lista de «More models» con Claude Opus 5.5 visible.
4. `04-effort.png`: el menú «Effort».
5. `05-listo.png`: el chat con Opus 5.5 ya seleccionado.

Si falta alguna, se dibuja una pantalla provisional marcada como «CAPTURA PROVISIONAL». Después ajusta en `screens/config.json` el `focus` (centro del elemento) y el `box` (tamaño del marco) de cada captura. Los textos del video también están en ese archivo.

## Comandos

```bash
npm install
npm run stills   # fotogramas de prueba en out/stills/
npm run render   # video final en out/opus-5-5-vertical.mp4
npm run preview  # vista previa en el navegador: http://127.0.0.1:5173
```

## Fuentes de los pasos

- [Change the model, effort, and thinking settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): el nombre del modelo está junto al botón de enviar, y ahí están «More models» y «Effort» (Low, Medium, High, Extra high, Max).
- [Set a default model for your organization](https://support.claude.com/en/articles/15330088-set-a-default-model-for-your-organization): el «modelo predeterminado» propiamente dicho solo lo configura un administrador en planes Enterprise. Por eso el video dice «elegir» y no «predeterminado».
