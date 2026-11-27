# recibirExistencias · inventario por tienda (Bajío)

Copiloto manda cada día el inventario por tienda con un POST y el header `X-Token`.
La función escribe un documento por tienda en `existencias/{org}` (reemplaza el
anterior) y `existencias/_meta`. Responde `{ok, tiendas, modelos}`.

URL (después de publicarla):
`https://us-central1-techguide-primemx.cloudfunctions.net/recibirExistencias`

## Una sola vez

1. **Herramientas.** Node 20 o más nuevo en tu computadora (`node -v`) y Firebase CLI:
   `npm install -g firebase-tools`, luego
   `firebase login` con la cuenta del proyecto **techguide-primemx**. El proyecto debe
   estar en plan **Blaze**: Cloud Functions y los secretos lo piden.
2. **Generar el token** (en tu computadora):
   `python -c "import secrets; print(secrets.token_hex(32))"`
   Copia el texto que sale (64 caracteres).
3. **Guardarlo en Functions**, desde esta carpeta (`firebase-existencias`):
   `firebase functions:secrets:set EXISTENCIAS_TOKEN`
   y pega el token cuando lo pida. Queda en Secret Manager, no en el código.
4. **Publicar la función**, desde esta misma carpeta:
   `cd functions && npm install && cd ..`
   `firebase deploy --only functions:existencias`
   Solo publica este grupo (`existencias`); no toca las otras funciones del proyecto.
   La función corre en Node 24 en Google (Node 20 ya no se puede publicar desde el 30-oct-2026).
   Al terminar, la terminal muestra una "Function URL". Puede ser la de arriba o una que
   termina en `.a.run.app`; las dos llevan a la misma función.
   Prueba rápida: abre la URL en el navegador. Si ves `{"ok":false,"error":"Usa POST"}`, ya está viva.
5. **Reglas de Firestore.** En la consola de Firebase → Firestore → Reglas, agrega este
   bloque dentro de `match /databases/{database}/documents { … }` y publica.
   No borres las reglas que ya tienes.

   ```
   match /existencias/{doc} {
     allow read: if true;
     allow write: if false;
   }
   ```

   La app solo lee. Nadie escribe desde el teléfono: la función escribe con permisos de
   servidor, que no pasan por estas reglas.
   Ojo: en Firestore basta que una regla diga que sí. Si tus reglas tienen un
   `match /{document=**}` que permite escribir, ese le gana a este bloque.
6. **Copiloto.** En su `.env`:

   ```
   EXISTENCIAS_URL=https://us-central1-techguide-primemx.cloudfunctions.net/recibirExistencias
   EXISTENCIAS_TOKEN=<el token del paso 2>
   ```

   y el envío:

   ```python
   import os, requests
   r = requests.post(os.environ["EXISTENCIAS_URL"], json=payload,
                     headers={"X-Token": os.environ["EXISTENCIAS_TOKEN"]}, timeout=30)
   r.raise_for_status()
   print(r.json())   # {'ok': True, 'tiendas': 14, 'modelos': 186}
   ```

## Lo que recibe

```json
{"region":"BAJIO","fecha":"2026-11-26","recibido":"2026-11-26T11:05:00-06:00",
 "tiendas":[{"org":"ZX1","tienda":"PRM TDA LEON ALTACIA",
   "equipos":[{"modelo":"HONOR X7B 256GB 4G","cant":3}]}]}
```

- `org`: de 1 a 40 letras, números, `-` o `_` (es el id del documento).
- `fecha`: AAAA-MM-DD. `cant`: entero de 0 en adelante.
- El mismo modelo dos veces en una tienda (por ejemplo, de otro color) se suma.
- Una tienda que no venga en el envío conserva su documento anterior, con su fecha.

Respuestas: `200 {ok:true, tiendas, modelos}` · `400` el cuerpo no cuadra (dice qué) ·
`401` token inválido · `405` no es POST.

## Cambiar el token

Repite los pasos 2 y 3, publica otra vez (`firebase deploy --only functions:existencias`)
para que tome el nuevo y actualiza el `.env` de Copiloto.

## Pruebas

`cd functions && node --test`
