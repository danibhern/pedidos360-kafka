# Pedidos360 · Frontend

Plataforma de gestión de productos electrónicos (**DSY1107 · Desarrollo Cloud
Native I**). SPA en **React + Vite + TypeScript** que se autentica contra
**Microsoft Entra ID** con **MSAL** y consume una API protegida en
**AWS API Gateway (HTTP API) + Lambda**.

La guía práctica que acompaña al proyecto está en
[`docs/guia_entra_id_v2.html`](./docs/guia_entra_id_v2.html) (ábrela en el
navegador; [`docs/index.html`](./docs/index.html) solo redirige a ella). Este
README describe **qué hace la aplicación** y **cómo encaja cada pieza con los
conceptos de la guía** (tenant, IDaaS, JWT, OAuth2, scopes, roles, guards).

---

## 1. Qué trae la aplicación

| Pantalla           | Ruta           | Quién entra              | Qué hace                                                                                                                                  |
| ------------------ | -------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Login**          | `/`            | Público                  | Botón "Continuar con Microsoft" (`loginRedirect`). Si ya hay sesión, redirige al Dashboard.                                               |
| **Dashboard**      | `/dashboard`   | Cualquiera autenticado   | Cambia de vista según el rol: KPIs + últimos pedidos (Admin), cola de pedidos por gestionar (Operador), stepper de seguimiento (Cliente). |
| **Catálogo**       | `/catalog`     | Admin, Operador          | Grilla/lista de productos con stock. Solo Admin crea, edita y desactiva (modal de formulario).                                            |
| **Pedidos**        | `/orders`      | Admin, Operador, Cliente | Cliente: crear pedido y ver historial. Operador/Admin: cola filtrable y cambio de estado según el flujo.                                  |
| **Administración** | `/admin`       | Solo Admin               | Marcador de posición del panel de administración.                                                                                         |
| **Reportes**       | `/reports`     | Solo Admin               | Marcador de posición (ventas, lead time, productos más solicitados).                                                                      |
| **Auditoría**      | `/audit`       | Solo Admin               | Marcador de posición del registro de eventos.                                                                                             |
| **Sin permiso**    | `/sin-permiso` | Autenticado              | Mensaje de acceso denegado.                                                                                                               |

### Flujo de estados de un pedido

```
CREADO → ACEPTADO → EN_PREPARACION → DESPACHADO → ENTREGADO
   └──────────┴──────────┴──────────────→ CANCELADO
```

Los badges de estado tienen color propio y el Dashboard del Cliente muestra un
stepper de 5 pasos con los etapas completadas destacadas.

### Endpoints que consume

Definidos en `.env` (`VITE_API_BASE_URL`) y llamados en `src/api/catalogApi.ts`:

| Método   | Ruta                  | Uso                                      |
| -------- | --------------------- | ---------------------------------------- |
| `GET`    | `/catalog`            | Listar productos                         |
| `POST`   | `/catalog`            | Crear producto (Admin)                   |
| `PUT`    | `/catalog/{id}`       | Actualizar producto (Admin)              |
| `DELETE` | `/catalog/{id}`       | Desactivar producto (soft delete, Admin) |
| `GET`    | `/orders`             | Listar pedidos                           |
| `POST`   | `/orders`             | Crear pedido (Cliente)                   |
| `PUT`    | `/orders/{id}/status` | Cambiar estado (Operador/Admin)          |

Todas las peticiones van con `Authorization: Bearer <access_token>`.

---

## 2. Estructura del proyecto

```
src/
├── main.tsx                  Inicializa MSAL y monta <MsalProvider>
├── App.tsx                   BrowserRouter + Navbar + tabla de rutas con guards
├── App.css                   Tema base (tokens, navbar, .card, .btn, landing)
│
├── authConfig.ts             Config de MSAL y scopes (leído de .env)
├── useRoles.ts               Hook: lee el claim `roles` del access token
├── useApi.ts                 Interceptor fetch con token (referencia de la guía)
│
├── RequireAuth.tsx           Guard de AUTENTICACIÓN
├── RequireRole.tsx           Guard de AUTORIZACIÓN por rol
│
├── Landing.tsx               Login público          (+ CSS en App.css)
├── Dashboard.tsx             Panel por rol           (+ Dashboard.css)
├── Catalog.tsx               CRUD de productos       (+ Catalog.css)
├── Orders.tsx                Pedidos cliente/operador(+ Orders-operador-estilo.css)
├── AdminDemo.tsx             Panel admin (placeholder)
├── Reports.tsx               Reportes (placeholder)
├── Audit.tsx                 Auditoría (placeholder)
├── TokenInspector.tsx        Herramienta de aula: decodifica el token (no montada)
│
├── api/
│   ├── client.ts             acquireApiToken + cliente HTTP reutilizable
│   └── catalogApi.ts         Llamadas a catálogo y pedidos
└── lib/
    └── jwt.ts                decodeJwt(): Base64URL → claims (solo inspección)
```

`TokenInspector.tsx` y `useApi.ts` están en el repo como material de estudio de
las secciones 6 y 6b de la guía; no están montados en ninguna ruta.

---

## 3. Cómo se conecta con la guía

### 3.1 Tenant de Entra ID

Un **tenant** es el directorio aislado donde viven las identidades, las apps
registradas y las políticas de seguridad. Tiene un **Tenant ID** (GUID) y un
dominio `<nombre>.onmicrosoft.com` permanente.

En este proyecto el tenant aparece en un solo lugar —
`src/authConfig.ts`:

```ts
authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`;
```

Todo lo demás (usuarios de prueba, App Roles, permisos) se administra **fuera
del código**, en el portal de Azure, sobre ese mismo tenant. Por eso el
frontend no "sabe" qué usuarios existen: solo sabe a qué tenant le pregunta.

Corolario práctico: si el login devuelve `AADSTS500113`, el problema casi nunca
es el código — es que el Tenant ID o el Client ID del `.env` apuntan a otra app.

### 3.2 IDaaS

**IDaaS** (_Identity as a Service_) es la categoría de servicios que entregamos
identidad administrada: Microsoft Entra ID es el IDaaS que usa Pedidos360. La
guía contrasta dos modalidades:

|                 | Entra ID estándar                    | External ID / CIAM                   |
| --------------- | ------------------------------------ | ------------------------------------ |
| Qué es          | Un directorio (no es un recurso ARM) | Un recurso de ARM                    |
| Usuarios        | Los crea el administrador del tenant | Se auto-registran                    |
| Suscripción     | No pide elegir suscripción           | Pide suscripción + grupo de recursos |
| Roles           | App Roles + scopes                   | Solo scopes                          |
| Uso en el curso | ✅ el que usa el proyecto            | ❌ choca con Azure for Students      |

Este proyecto usa **Entra ID estándar**. Consecuencia práctica: los usuarios
`admin@…`, `operador@…` y `cliente@…` los crea el administrador del tenant a
mano, y los permisos se asignan como **App Roles** (no como scopes).

Sobre **MFA / Conditional Access**: pedir por primera vez un token para la API
(un recurso distinto al login) puede disparar un _step-up_ de MFA. Es
esperado — se completa una vez y después la renovación silenciosa funciona.

### 3.3 Los dos App Registrations

El tenant tiene **dos** apps registradas porque representan dos roles distintos
de OAuth2:

| App                   | Rol OAuth2            | Configuración                                            | Para qué                                                                                                                                             |
| --------------------- | --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Pedidos360-Frontend` | **Cliente público**   | Plataforma **SPA**, Redirect URI `http://localhost:5173` | Corre en el navegador, pide el token en nombre del usuario. Usa Authorization Code + **PKCE** (sin client secret, porque no puede guardar secretos). |
| `Pedidos360-API`      | **Recurso protegido** | Sin plataforma cliente, _Expose an API_                  | Dueño de los datos. **No pide** tokens: los recibe y valida. Define los scopes (`orders.read`, `catalog.write`, …).                                  |

La analogía de la guía: el Frontend es quien pide la llave en la portería; la
API es la puerta con la cerradura. La llave solo sirve porque fue cortada para
esa cerradura — eso es el `aud`.

En el código, cada lado usa **su propio** Client ID:

- `VITE_AZURE_CLIENT_ID` → app Frontend (se registra en `clientId` de MSAL).
- `VITE_API_SCOPE` = `api://<client-id del Backend>/orders.read` → app Backend.

### 3.4 JWT

Un **JWT** es un token firmado con tres partes: `header.payload.signature`.
MSAL entrega dos distintos, y confundirlos es el error más común:

|               | ID token                                    | **Access token**                |
| ------------- | ------------------------------------------- | ------------------------------- |
| Para qué      | Le dice al frontend **quién es** el usuario | Autoriza a **usar la API**      |
| `aud`         | La app Frontend                             | La app Backend                  |
| Dónde se pide | `loginRequest` (`openid`, `profile`)        | `apiRequest` (`VITE_API_SCOPE`) |
| Claims de rol | ❌ no está `roles`                          | ✅ sí está `roles`              |
| Dónde acaba   | en `idTokenClaims`                          | en el header `Authorization`    |

Claims que el proyecto lee del access token:

| Claim   | Significado                             | Dónde se usa acá                                      |
| ------- | --------------------------------------- | ----------------------------------------------------- |
| `aud`   | Audiencia: para qué API fue emitido     | Debe coincidir con el _Audience_ del JWT Authorizer   |
| `iss`   | Issuer: qué tenant lo emitió            | Debe coincidir con el _Issuer URL_ del Authorizer     |
| `scp`   | Scopes delegados, separados por espacio | Permisos que el usuario tiene concedidos sobre la API |
| `roles` | App Roles asignados al usuario          | `useRoles.ts` → guards y navegación                   |
| `exp`   | Vencimiento (epoch)                     | Renovación silenciosa de MSAL                         |

**`src/lib/jwt.ts` decodifica, no valida.** Hace `atob()` del payload para
inspección; jamás verifica la firma. La validación real ocurre en el **JWT
Authorizer** de API Gateway, antes de que la petición llegue a la Lambda. Por
eso `decodeJwt()` está bien para leer roles en la UI, y sería un agujero de
seguro usarla como autorización.

#### La trampa v1 / v2 (principal causa de 401)

La versión del token depende de `requestedAccessTokenVersion` en el manifest de
la app Backend. Hay que usar un juego **coherente**:

|                       | v1 (por defecto)                    | **v2 (recomendado, lo que usa el proyecto)**      |
| --------------------- | ----------------------------------- | ------------------------------------------------- |
| `iss`                 | `https://sts.windows.net/<TENANT>/` | `https://login.microsoftonline.com/<TENANT>/v2.0` |
| `aud`                 | `api://<client-id-backend>`         | `<client-id-backend>` (GUID pelado)               |
| Authorizer → Issuer   | `…/sts.windows.net/<TENANT>/`       | `…/login.microsoftonline.com/<TENANT>/v2.0`       |
| Authorizer → Audience | `api://<client-id-backend>`         | `<client-id-backend>`                             |

Mezclar el issuer de v2 con el audience estilo v1 hace que API Gateway rechace
el token con **401** sin llegar a la Lambda.

### 3.5 Scopes vs. App Roles

Dos claims distintos, y cada uno resuelve una pregunta distinta:

- **`scp`** → _"¿qué permisos tiene concedidos sobre la API?"_
  Ej.: `"orders.read orders.write"`. Configurado en **Expose an API** de la app
  Backend, y concedido al Frontend con **Grant admin consent**.
- **`roles`** → _"¿qué rol de negocio tiene la persona?"_
  Ej.: `["Operador"]`. Configurado en **App Roles**, y asignado por usuario en
  **Enterprise applications → Pedidos360-API → Users and groups**.

Este proyecto autoriza por **`roles`**. `VITE_API_SCOPE` trae un solo scope
(`orders.read`) porque el control fino se hace por rol, no por scope.

> Ojo con la traducción: Entra guarda los roles como `Admin` / `Operador` /
> `Client`. `useRoles.ts` los normaliza a minúsculas y mapea `client` →
> `cliente` para poder usarlos directamente en los guards de React.

### 3.6 MSAL en el frontend

**MSAL** es la librería que habla el protocolo OAuth2/OIDC por ti. El flujo aquí:

1. `main.tsx` crea la `PublicClientApplication` y llama **`await
instance.initialize()`** — obligatorio en `@azure/msal-browser` v3+. Sin eso:
   `BrowserAuthError: uninitialized_public_client_application`.
2. Tras un login exitoso se fija la cuenta activa
   (`setActiveAccount`) para que el resto de la app sepa con quién opera.
3. `Landing.tsx` dispara `loginRedirect(loginRequest)` con
   `scopes: ["openid", "profile"]` → eso produce el **ID token**.
4. Para llamar la API, `acquireApiToken()` (`api/client.ts`) pide el scope de
   la API con **`acquireTokenSilent`**, que usa la caché de MSAL
   (`localStorage`) o un iframe oculto.
5. Si el silencioso falla, cae a **`acquireTokenRedirect`**. Esto no es
   opcional: `acquireTokenSilent` también falla con `timed_out` cuando Chrome
   bloquea cookies de terceros para `login.microsoftonline.com`, no solo con
   `interaction_required`.
6. El token viaja en `Authorization: Bearer …`.

### 3.7 Guards de ruta

En una SPA con varias vistas, cada ruta necesita responder _"¿puede este
usuario ver esto?"_ antes de renderizar. Eso es un **guard**. En
`react-router-dom` se implementan como _layout routes_: un componente que
envuelve un `<Outlet/>`, del que cuelgan todas las rutas protegidas.

| Guard         | Pregunta                          | Si falla                  |
| ------------- | --------------------------------- | ------------------------- |
| `RequireAuth` | ¿Hay sesión activa?               | Redirige a `/` (el login) |
| `RequireRole` | ¿Tiene alguno de estos App Roles? | Redirige a `/sin-permiso` |

`App.tsx` los anida, así que cada vista nueva es **una línea** de `<Route>` y
el guard no se reescribe:

```tsx
<Route element={<RequireAuth />}>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route element={<RequireRole roles={["admin", "operador"]} />}>
    <Route path="/catalog" element={<Catalog />} />
  </Route>
  …
</Route>
```

> **Un guard de rol es UX, no seguridad.** Solo evita que el botón aparezca.
> Cualquiera puede llamar la API directamente sin pasar por React, así que la
> Lambda **tiene que volver a validar** el mismo claim `roles`. El guard nunca
> reemplaza esa validación.

### 3.8 Backend: API Gateway y Lambda

El frontend es solo la mitad. Del otro lado:

1. **API Gateway HTTP API** con rutas `GET/POST /orders`, `GET /catalog`, etc.
2. **JWT Authorizer** configurado con el issuer y el audience **v2** de la tabla
   de arriba, y con la scope requerida. API Gateway responde **401** antes de
   invocar la Lambda si el token no está, tiene firma inválida, o el `iss`/`aud`
   no coinciden.
3. **CORS** — sin esto nada funciona. Como las llamadas llevan el header
   `Authorization`, el navegador manda primero un **preflight `OPTIONS`**. Si la
   HTTP API no lo responde con `Access-Control-Allow-Origin`, la consola
   muestra el error de CORS — y es _independiente_ de la autenticación (el
   preflight ni siquiera lleva token).
4. **Lambda** — el Authorizer validó que el token es auténtico, pero no sabe
   reglas de negocio ("solo Admin edita el catálogo"). Eso se resuelve dentro de
   la Lambda leyendo el claim `roles`.

Dos detalles que confunden la primera vez al conectar:

- En HTTP API + JWT Authorizer los claims llegan en
  `event.requestContext.authorizer.jwt.claims`, **no** en `event.headers`.
- Los claims que en el JWT son **array** (`roles`) llegan **achatados a
  string**. Hay que hacer `split(/[\s,]+/)`, no asumir un array.

---

## 4. Configuración

Copia el archivo de ejemplo y completa los valores **de tu tenant**:

```bash
cp .env.example .env
```

| Variable                  | Qué es                                         | Dónde se obtiene                                      |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `VITE_AZURE_CLIENT_ID`    | Application (client) ID de la app **Frontend** | Frontend → Overview                                   |
| `VITE_AZURE_TENANT_ID`    | Directory (tenant) ID                          | Frontend → Overview                                   |
| `VITE_AZURE_REDIRECT_URI` | Redirect URI de la SPA                         | `http://localhost:5173`                               |
| `VITE_API_BASE_URL`       | URL del API Gateway                            | `https://<api-id>.execute-api.<region>.amazonaws.com` |
| `VITE_API_SCOPE`          | Scope de la app **Backend**                    | `api://<client-id-backend>/orders.read`               |

> No subas `.env` al repositorio. Ninguna variable `VITE_*` es secreta (acaban
> en el bundle del navegador); la seguridad está en que el backend valide el
> token, no en ocultar estos valores.

---

## 5. Comandos

```bash
corepack pnpm install      # el repo usa pnpm (hay pnpm-lock.yaml)
corepack pnpm dev          # http://localhost:5173
corepack pnpm build        # type-check + build de producción
corepack pnpm lint         # oxlint
```

> Usa `corepack pnpm`, no `npm install`: `npm` falla con
> `EUNSUPPORTEDPROTOCOL "workspace:"` sobre el lockfile de pnpm.

## 6. Stack

React 19 · Vite 8 · TypeScript · `@azure/msal-browser` v5 · `@azure/msal-react`
v5 · `react-router-dom` v7 · oxlint · AWS API Gateway (HTTP API) + Lambda
(backend, repo aparte).

---

## 7. Estado actual y pendientes

Funcionando contra la API:

- Login/logout, guards y navegación por rol.
- Dashboard diferenciado por rol.
- Catálogo con listado en grilla/lista y CRUD completo (solo Admin).
- Pedidos: creación (Cliente) y gestión de estados (Operador/Admin).

Placeholders (las pantallas ya existen y ya están protegidas por rol):

- `/reports` y `/audit` — falta conectar los datos.
- `/admin` — falta el panel real.

Backlog técnico:

- `/reports` y `/audit` esperan métricas que la API aún no expone.
- Bundle único de ~554 kB: conviene code-splitting por ruta.
- Los claims del token se leen con `decodeJwt()` en el cliente; si en el futuro
  se necesita la identidad del usuario fuera del frontend, conviene migrar a
  `idTokenClaims` para no depender del token de la API para leer el perfil.
