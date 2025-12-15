<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# San Marzano – Bot de WhatsApp (Backend)

Este repo ahora contiene únicamente el backend del bot de WhatsApp (Node/Express + Gemini + WhatsApp Cloud API). El frontend web fue retirado.

---

## Objetivo del bot

1. Permitir que clientes completen el pedido dentro de WhatsApp (botones/listas + texto).
2. Persistir pedidos en Postgres/Supabase y notificar estados vía WhatsApp.
3. Mantener la misma lógica de menú y carrito que el canal web (si se vuelve a agregar).

---

## Stack (backend)

- Node.js + Express
- WhatsApp Cloud API (mensajes interactivos)
- Gemini (funcall) para NLU y orquestación de tools
- Postgres/Supabase para persistencia de pedidos/usuarios

---

## Flujo Conversacional en WhatsApp

- **Entrada**: Cliente escribe al número de WhatsApp Business.
- **Opciones iniciales**: Ver Menú (lista de categorías) o seguir el chat libre.
- **Flujo en chat**:
  1. Escoger categoría (Pizzas, Lasagnas, Bebidas, Extras).
  2. Escoger producto y tamaño/cantidad.
  3. Revisar carrito y confirmar.
  4. Guardar pedido en la misma BD y notificar al usuario.
- **Notificaciones**: Confirmación, preparación, listo, ruta y entregado, todas por WhatsApp.

---

## Integración WhatsApp Cloud API

- **Requisitos técnicos**:
  - Meta WhatsApp Cloud API (sin intermediarios).
  - Webhook para recibir mensajes.
  - Mensajes interactivos (botones, listas) y templates para notificaciones.
  - Número de WhatsApp Business verificado y acceso a Meta Business Manager.
- **Costos**:
  - Mensajes entrantes: gratis.
  - Mensajes salientes dentro de la ventana de 24h: gratis.
  - Mensajes salientes fuera de la ventana: ~S/.0.10–0.20.

---

## Sincronización de Base de Datos (Supabase / Postgres sugerido)

| Tabla           | Campos clave                                                                                              |
|-----------------|------------------------------------------------------------------------------------------------------------|
| `orders`        | `id`, `phone_number`, `source`, `items` (JSON), `total`, `status`, timestamps, `notes`.                    |
| `order_items`   | `id`, `order_id`, `product_id`, `product_name`, `size`, `quantity`, `unit_price`, `subtotal`.              |
| `whatsapp_users`| `phone_number`, `first_name`, `last_name`, `created_at`, `last_interaction`, `orders_count`, `total_spent`.|
| `products`      | `id`, `category`, `name`, `description`, `image_url`, precios por tamaño, `is_active`.                     |

---

## Backend (estructura)

```
/backend
├── /api
│   ├── /whatsapp
│   │   ├── webhook.ts       # Recibir mensajes
│   │   ├── messages.ts      # Enviar mensajes/plantillas
│   │   └── handler.ts       # Lógica conversacional
│   ├── /orders
│   │   ├── create.ts
│   │   ├── update.ts
│   │   └── status.ts
│   └── /products
│       └── index.ts
├── /services
│   ├── whatsappService.ts
│   ├── conversationService.ts  # Estado por usuario
│   ├── orderService.ts
│   └── notificationService.ts
├── /database
│   ├── migrations/
│   └── schemas.sql
├── /middleware
│   ├── whatsappAuth.ts
│   └── rateLimiter.ts
└── /config
    └── environment.ts
```

---

## Seguridad y Validaciones

- Validar formato del teléfono (Perú: `+51 9XXXXXXXX`).
- Asociar pedidos al número verificado para evitar consultas ajenas.
- Rate limiting por usuario.

---

## Setup rápido

```bash
cd backend
npm install
# Configura .env con WHATSAPP_* , GEMINI_API_KEY, DATABASE_URL
npm run dev
```
- Cifrar números de teléfono en la BD.
- Validar firma de webhook de Meta en cada petición.
- Tokens/secrets solo por variables de entorno.

---

## Ejecución Local (Web)

```bash
npm install
echo "GEMINI_API_KEY=tu_api_key" > .env.local
echo "VITE_API_BASE_URL=http://localhost:4000/api" >> .env.local
npm run dev
```

La app web se abre en `http://localhost:5173` y se conecta al modelo `gemini-2.0-flash`. El servicio `services/orderService.ts` ahora intenta crear pedidos en `VITE_API_BASE_URL` y cae a un mock interno solo si el backend está caído, por lo que ya puedes probar la sincronización real.

### Backend

```bash
cd backend
npm install
cp .env.example .env # crea este archivo con las variables requeridas
npm run dev
```

Variables mínimas (ver `backend/src/config/environment.ts`):

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_ID`
- `META_APP_ID`
- `META_APP_SECRET`
- `DATABASE_URL`
- `PHONE_ENCRYPTION_KEY`

El servidor corre en `http://localhost:4000`, expone `/api/...` y requiere Postgres accesible. Usa `npm run build && npm start` para despliegues productivos.

---

## Pasos Siguientes

1. **Documentación**: Revisar `/docs/WHATSAPP_SETUP.md`, `/docs/API_ENDPOINTS.md`, `/docs/DEPLOYMENT.md` y `/docs/SUPABASE.md` para configurar Cloud API, endpoints, despliegue y BD.
2. **Backend**:
   - Implementar los endpoints de pedidos y productos apuntando a la BD propuesta.
   - Implementar el webhook de WhatsApp con manejo de estado conversacional.
   - Crear el servicio de notificaciones para enviar plantillas cuando cambie `orders.status`.
3. **Webhooks & Notificaciones**:
   - Consumir el webhook desde Meta y validar firmas.
   - Implementar el scheduler (o worker) que dispare las notificaciones “preparando”, “listo”, “en ruta”, “entregado”.
4. **Sincronización Web ↔ WhatsApp**:
   - Al confirmar un pedido web, invocar el endpoint de notificaciones para avisar por WhatsApp.
   - Cuando el pedido cambia de estado en el dashboard, disparar la plantilla correspondiente.
5. **Seguridad/Compliance**:
   - Completar verificación de Meta Business.
   - Registrar y aprobar las plantillas de mensajes transaccionales.
   - Añadir rate limiting y cifrado de campos sensibles en el backend.

Con estos pasos la arquitectura híbrida quedará lista para operar en ambos canales sincronizados.
