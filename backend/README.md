# Pedidos360 · Backend

API de catálogo, pedidos y arquitectura de mensajería asíncrona orientada a eventos, implementada con AWS Lambda, Amazon API Gateway, Amazon SNS y Amazon SQS, integrada y protegida mediante tokens JWT emitidos por Microsoft Entra ID.

El backend se encuentra en la carpeta `backend/` del repositorio de Pedidos360. Su configuración y sus dependencias se mantienen separadas de las del frontend.

## Arquitectura

```text
[ Frontend / Cliente ]
         │
         │ HTTPS · Access token de Microsoft Entra ID
         ▼
[ API Gateway · HTTP API ]
         │
         │ Validación JWT y ámbitos por ruta
         ▼
[ AWS Lambda (CRUD Órdenes / Catálogo) ]
         │
         ├─────────────────────────────────────────┐
         ▼                                         ▼
[ Amazon DynamoDB ]                     [ SNS Topic: pedidos360-eventos ] (Productor)
 (Persistencia)                                    │
                                                   │ Fan-out (Atributo: tipo_evento)
                                 ┌─────────────────┼─────────────────┐
                                 ▼                 ▼                 ▼
                          [ SQS: q-email ]  [ SQS: q-kitchen ] [ SQS: q-invoice / bodega ]
                                 │                 │                 │
                                 ▼                 ▼                 ▼
                          [ Lambda Email ]  [ Lambda Cocina ] [ Lambda Bodega ]
                                 │                 │                 │
                          (Tras 3 fallos)   (Tras 3 fallos)   (Errores no recuperables)
                                 ▼                 ▼                 ▼
                          [ q-email-dlq ]   [ q-kitchen-dlq ] [ q-invoice-dlq ]
```

### Componentes

| Componente | Responsabilidad |
|---|---|
| Microsoft Entra ID | Autenticación y emisión de tokens para acceder a la API[cite: 1, 4] |
| API Gateway | Exposición de rutas, validación JWT y comprobación de ámbitos[cite: 1, 4] |
| AWS Lambda | Procesamiento de solicitudes síncronas, publicación de eventos y lógica consumidora[cite: 1, 2] |
| DynamoDB | Persistencia del catálogo y los pedidos[cite: 1] |
| Amazon SNS | Topic Pub/Sub (`pedidos360-eventos`) que realiza distribución fan-out de eventos[cite: 1, 2] |
| Amazon SQS | Colas de trabajo para desacoplar consumidores y colas DLQ para aislamiento de fallos[cite: 1, 2] |
| Serverless Framework | Configuración de las funciones, triggers de SQS y extensiones de recursos[cite: 1] |

## Configuración del servicio

| Propiedad | Valor |
|---|---|
| Servicio | `pedidos360-api`[cite: 1] |
| Stage | `dev`[cite: 1] |
| Región | `us-east-1`[cite: 1] |
| Runtime de Lambda | `nodejs24.x`[cite: 1] |
| Framework | Serverless Framework 4[cite: 1] |
| Memoria predeterminada | 128 MB[cite: 1] |
| Timeout predeterminado | 3 segundos (5 a 10s en funciones de mensajería)[cite: 1] |
| Arquitectura predeterminada | `arm64`[cite: 1] |

Las funciones de actualización y eliminación de productos utilizan `x86_64`, de acuerdo con la configuración de los recursos existentes[cite: 1].

## Estructura del proyecto

```text
pedidos360-frontend/
└── backend/
    ├── config/
    │   ├── environment.dev.json
    │   └── resource-extensions.dev.json
    ├── messaging/
    │   ├── config.mjs
    │   ├── publish-event.mjs
    │   ├── notify-email.mjs
    │   └── order-bodega.mjs
    ├── src/
    │   ├── catalog-create.mjs
    │   ├── catalog-delete.mjs
    │   ├── catalog-list.mjs
    │   ├── catalog-update.mjs
    │   ├── orders-create.mjs
    │   ├── orders-list.mjs
    │   └── orders-status-update.mjs
    ├── .gitignore
    ├── package.json
    ├── package-lock.json
    ├── serverless.yml
    └── README.md
```

## API y autorización

Todas las rutas síncronas utilizan el authorizer JWT de API Gateway[cite: 1, 4].

| Método | Endpoint | Operación | Ámbito requerido |
|---|---|---|---|
| `GET` | `/catalog` | Consultar catálogo | `catalog.read` |
| `POST` | `/catalog` | Crear producto | `catalog.write` |
| `PUT` | `/catalog/{id}` | Actualizar producto | `catalog.write` |
| `DELETE` | `/catalog/{id}` | Eliminar producto | `catalog.write` |
| `GET` | `/orders` | Consultar pedidos | `orders.read` |
| `POST` | `/orders` | Crear pedido | `orders.write` |
| `PUT` | `/orders/{id}/status` | Actualizar estado de un pedido | `orders.write` |

### Modelo de autorización

La configuración distingue dos niveles:

1. Acceso a la API: validación del JWT y del ámbito requerido por la ruta[cite: 1, 4].
2. Autorización de negocio: controles implementados en las funciones, como comprobaciones de rol o restricciones de acceso a los datos[cite: 1].

Los ámbitos no deben reemplazar los controles de negocio del backend.

El frontend solicita los permisos de la API mediante MSAL[cite: 4]. Las credenciales de AWS utilizadas para operar la infraestructura son independientes de los tokens de los usuarios[cite: 1].

## Funciones Lambda

| Identificador en Serverless | Handler | Ubicación / Trigger |
|---|---|---|
| `catalogList` | `src/catalog-list.handler` | `catalog-list` (HTTP GET `/catalog`)[cite: 1] |
| `catalogCreate` | `src/catalog-create.handler` | `catalog-create` (HTTP POST `/catalog`)[cite: 1] |
| `catalogUpdate` | `src/catalog-update.handler` | `catolog-udpate` (HTTP PUT `/catalog/{id}`)[cite: 1] |
| `catalogDelete` | `src/catalog-delete.handler` | `catalog-delete` (HTTP DELETE `/catalog/{id}`)[cite: 1] |
| `ordersList` | `src/orders-list.handler` | `orders-list` (HTTP GET `/orders`)[cite: 1] |
| `ordersCreate` | `src/orders-create.handler` | `orders-create` (HTTP POST `/orders`)[cite: 1] |
| `ordersStatusUpdate` | `src/orders-status-update.handler` | `orders-status-update` (HTTP PUT `/orders/{id}/status`)[cite: 1] |
| `publicarEvento` | `messaging/publish-event.handler` | Publicador SNS (Invocación directa / Evento)[cite: 1] |
| `notificarEmail` | `messaging/notify-email.handler` | Consumidor SQS (`q-email`)[cite: 1] |
| `ordenBodega` | `messaging/order-bodega.handler` | Consumidor SQS (`q-kitchen` / `q-invoice`)[cite: 1] |

---

## Arquitectura de Mensajería Asíncrona (SNS + SQS + DLQ)

El sistema utiliza un patrón **Pub/Sub desacoplado con Fan-out** para garantizar que las fallas en procesos secundarios (envío de correos, generación de boletas o preparación en bodega) no afecten la creación del pedido[cite: 1, 2].

### 1. Productor (`messaging/publish-event.mjs`)
- Publica un payload JSON estandarizado en el SNS Topic `pedidos360-eventos`[cite: 1].
- Adjunta `MessageAttributes` con la propiedad `tipo_evento` para habilitar el filtrado en las suscripciones[cite: 1].
- **Payload tipo:**
  ```json
  {
    "type": "PedidoCreado",
    "eventId": "uuid-v4",
    "timestamp": "2026-10-17T21:00:00.000Z",
    "pedidoId": "P-1001",
    "productos": [],
    "simularError": false
  }
  ```

### 2. Filtrado y Distribución en el Broker
- **`q-email`**: Recibe **todos** los eventos (sin filtro)[cite: 1, 2].
- **`q-kitchen`**: Filtra mediante Subscription Filter Policy `{ "tipo_evento": ["PedidoAceptado"] }`[cite: 1, 2].
- **`q-invoice`**: Filtra mediante Subscription Filter Policy `{ "tipo_evento": ["PedidoDespachado"] }`[cite: 1, 2].

### 3. Estrategia de Manejo de Errores en Consumidores
El consumidor avanzado (`messaging/order-bodega.mjs`) gestiona la resiliencia mediante clasificación explícita de errores[cite: 1, 2]:

- **Confirmación parcial (ACK)**: Utiliza `batchItemFailures` habilitado en el Event Source Mapping de SQS[cite: 1, 2].
- **Errores No Recuperables** (`ErrorNoRecuperable` o `SyntaxError`):
  - *Causa:* Falta de datos obligatorios (ej. falta `pedidoId`) o JSON malformado[cite: 1].
  - *Acción:* La Lambda copia el mensaje directamente a la DLQ correspondiente mediante `SQSClient` y confirma el mensaje a la cola principal para **evitar reintentos innecesarios**[cite: 1, 2].
- **Errores Recuperables**:
  - *Causa:* Caída temporal de servicios externos o bodega no disponible[cite: 1].
  - *Acción:* La función registra el `messageId` en `batchItemFailures`. SQS retiene el mensaje, el cual reaparece al vencer el *Visibility Timeout* (30s) y se reintenta hasta alcanzar `maxReceiveCount = 3` antes de ir a la DLQ[cite: 1, 2].

---

## Alcance de infraestructura como código

La configuración actual de Serverless declara las funciones Lambda y las extensiones de sus recursos y grupos de logs[cite: 1].

| Recurso o configuración | Gestión actual |
|---|---|
| Funciones Lambda y Triggers SQS | Declarados en `serverless.yml`[cite: 1] |
| Extensiones de funciones y grupos de logs | Definidas en `config/resource-extensions.dev.json`[cite: 1] |
| Variable `ORDERS_TABLE` de `ordersCreate` | Definida en `config/environment.dev.json`[cite: 1] |
| API Gateway, rutas y authorizer | Recursos existentes; no declarados como eventos HTTP[cite: 1, 4] |
| Ámbitos por ruta | Configurados directamente en AWS mediante AWS CLI |
| Tablas DynamoDB, Topic SNS y Colas SQS / DLQ | Recursos existentes referenciados[cite: 1] |
| Rol `LabRole` | Rol existente referenciado[cite: 1] |

### Recursos del entorno actual

| Recurso | Valor |
|---|---|
| Stack | `pedidos360-api-dev`[cite: 1] |
| HTTP API | `y92zjw9o80`[cite: 1] |
| Authorizer JWT | `xz8xx0`[cite: 1] |
| Stage de API Gateway | `$default` |
| Tabla de catálogo | `Pedidos360Catalog`[cite: 1] |
| Tabla de pedidos | `Pedidos360Orders`[cite: 1] |
| SNS Topic | `pedidos360-eventos`[cite: 1] |
| Colas SQS | `q-email`, `q-kitchen`, `q-invoice`[cite: 1] |
| Colas DLQ | `q-email-dlq`, `q-kitchen-dlq`, `q-invoice-dlq`[cite: 1] |
| Rol de ejecución | `LabRole`[cite: 1] |

El stage `$default` tiene despliegue automático habilitado. Esta propiedad de API Gateway es independiente del despliegue de las funciones mediante Serverless.

## Configuración

### Variables del entorno

`config/environment.dev.json` contiene la configuración utilizada por las Lambdas[cite: 1]:

```json
{
  "ordersCreate": {
    "ORDERS_TABLE": "Pedidos360Orders"
  },
  "ordersStatusUpdate": {
    "ORDERS_TABLE": "Pedidos360Orders"
  },
  "publicarEvento": {
    "TOPIC_ARN": "arn:aws:sns:us-east-1:834313555487:pedidos360-eventos"
  },
  "ordenBodega": {
    "DLQ_URL": "[https://sqs.us-east-1.amazonaws.com/834313555487/q-kitchen-dlq](https://sqs.us-east-1.amazonaws.com/834313555487/q-kitchen-dlq)"
  }
}
```

### Extensiones de recursos

`config/resource-extensions.dev.json` conserva propiedades de los recursos existentes, entre ellas[cite: 1]:

- Nombres de funciones y grupos de logs[cite: 1].
- Arquitecturas de ejecución[cite: 1].
- Configuración de logging[cite: 1].
- Políticas `DeletionPolicy: Retain` y `UpdateReplacePolicy: Retain`[cite: 1].

Ambos archivos son necesarios para resolver las referencias `${file(...)}` de la configuración actual[cite: 1].

## Instalación y validación

Los comandos del backend deben ejecutarse desde su carpeta, no desde la raíz del frontend[cite: 13, 14].

### Instalar dependencias

```bash
cd backend
npm ci
```

### Comprobar sintaxis

```bash
(
  set -e

  for file in src/*.mjs messaging/*.mjs; do
    [ -f "$file" ] && node --check "$file" && printf 'OK: %s\n' "$file"
  done
)
```

Esta comprobación no ejecuta las funciones ni sustituye las pruebas funcionales.

### Resolver la configuración de Serverless

```bash
npx serverless print
```

La salida debe incluir:

- Servicio `pedidos360-api`[cite: 1].
- Stage `dev`[cite: 1].
- Región `us-east-1`[cite: 1].
- Las diez funciones (síncronas y asíncronas)[cite: 1].
- `ORDERS_TABLE: Pedidos360Orders`[cite: 1].
- Las extensiones de recursos[cite: 1].

Este comando permite inspeccionar la configuración resuelta; no realiza un despliegue.

## Credenciales y seguridad

Las credenciales temporales del laboratorio se mantienen fuera del repositorio, mediante la configuración local de AWS.

Antes de operar la infraestructura, comprobar la identidad utilizada:

```bash
aws sts get-caller-identity \
  --profile default \
  --region us-east-1 \
  --no-cli-pager
```

No incorporar al repositorio:

- Claves de acceso de AWS.
- Secret access keys.
- Session tokens.
- Access tokens de usuarios.
- Contraseñas o cadenas de conexión con secretos.

## Despliegue

Antes de desplegar:

1. Confirmar que las credenciales del laboratorio están vigentes.
2. Verificar la cuenta de AWS de destino.
3. Revisar servicio, stage y región.
4. Resolver la configuración con `serverless print`.
5. Revisar los cambios y las referencias a recursos existentes.

Desde `backend/`:

```bash
npx serverless deploy \
  --stage dev \
  --region us-east-1 \
  --aws-profile default
```

> El despliegue modifica infraestructura en AWS. No debe ejecutarse como una prueba de sintaxis ni es necesario por el solo hecho de reorganizar las carpetas del repositorio.

### Consultar el estado del stack

```bash
aws cloudformation describe-stacks \
  --stack-name pedidos360-api-dev \
  --profile default \
  --region us-east-1 \
  --query 'Stacks[].{StackName:StackName,Status:StackStatus}' \
  --output json \
  --no-cli-pager
```

## Estado de verificación

| Comprobación | Estado |
|---|---|
| Instalación de dependencias | Completada |
| Sintaxis de las funciones de API y Mensajería | Verificada |
| Resolución de configuración desde `backend/` | Verificada |
| Ámbitos configurados en las rutas HTTP | Verificados |
| Lectura de pedidos con los ámbitos activos | Verificada |
| Lectura de catálogo con los ámbitos activos | Verificada |
| Publicación de eventos en SNS Topic | Verificada |
| Filtrado por `tipo_evento` hacia colas SQS | Verificado |
| Procesamiento de mensajes en consumidor de correo | Verificado |
| Redirección a DLQ por error no recuperable (ACK explícito) | Verificado |
| Reintentos SQS por error recuperable y fallback a DLQ | Verificado |
| Operaciones de escritura síncronas | Pendientes de verificación |
| Controles de autorización con distintos usuarios y roles | Pendientes de verificación |
| Pruebas automatizadas | No implementadas |

El script `npm test` actual es un marcador de posición y no ejecuta una suite de pruebas.

## Control de versiones

Se excluyen del repositorio las dependencias instaladas, los artefactos de Serverless, los respaldos y los archivos de entorno locales:

```text
node_modules/
.serverless/
backups/
.env
.env.*
```