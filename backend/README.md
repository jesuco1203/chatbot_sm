# 🍕 Chatbot Pizzería San Marzano (AI Powered)

Un asistente virtual inteligente para WhatsApp que gestiona pedidos de pizzería, responde consultas sobre el menú y procesa compras completas. Utiliza una arquitectura híbrida combinando reglas de negocio estrictas con la flexibilidad de un LLM (Google Gemini).

## 🚀 Características Principales

* **Inteligencia Artificial (Gemini):** Entiende lenguaje natural, sinónimos ("pesi" = "Pepsi") y contexto.
* **Búsqueda Inteligente:** Filtra productos por ingredientes o características (ej. "algo sin carne", "picante").
* **Carrito de Compras:** Gestión completa de ítems, cantidades y variantes (tamaños).
* **Persistencia de Sesión:** Recuerda al usuario y su carrito tras reinicios (PostgreSQL).
* **Ciclo de Vida:** Limpieza automática de sesión tras confirmar pedido o 6 horas de inactividad.
* **Modo Desarrollador:** Comandos de depuración en tiempo real (`!dev`).
* **Multi-Entorno:** Configuración lista para Local (Mac + Ngrok) y Producción (VPS + Docker).

## 🛠️ Stack Tecnológico

* **Runtime:** Node.js + TypeScript
* **Framework Web:** Express
* **Base de Datos:** PostgreSQL (Supabase en Dev / Docker-Local en Prod)
* **IA:** Google Gemini 2.5 Flash (SDK `@google/genai`)
* **Mensajería:** WhatsApp Cloud API
* **Infraestructura:** Docker & Docker Compose

## 📂 Estructura del Proyecto

```text
src/
├── api/            # Endpoints (Webhook WhatsApp, Orders)
├── chatbot/        # Lógica del Bot (Agent, Instructions, Tools)
├── config/         # Variables de entorno
├── data/           # Menú estático (JSON)
├── database/       # Scripts SQL y migraciones
├── services/       # Lógica de negocio (DB, WhatsApp, Orders, Session)
└── server.ts       # Punto de entrada
```

## ⚙️ Configuración de Entorno (.env)

Crear un archivo `.env` con las siguientes variables:

```
PORT=4000
# WhatsApp API
WHATSAPP_VERIFY_TOKEN=tu_token_verificacion
WHATSAPP_ACCESS_TOKEN=tu_token_acceso_permanente
WHATSAPP_PHONE_ID=id_telefono_whatsapp
# Google Gemini
DEEPSEEK_API_KEY=tu_api_key_deepseek
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
# Base de Datos
DATABASE_URL=postgresql://user:pass@host:5432/db_name?sslmode=disable
# Seguridad (Opcional)
PHONE_ENCRYPTION_KEY=clave_encriptacion
```

## 🏃‍♂️ Ejecución Local (Mac/PC)

Instalar dependencias:

```bash
npm install
```

Levantar Base de Datos (si usas Docker local):

```bash
docker-compose up -d db
```

Iniciar el servidor:

```bash
npm run dev
```

Exponer a Internet (Ngrok):

```bash
ngrok http 4000
```

(Actualizar Webhook en Meta con la URL de Ngrok)

## ☁️ Despliegue en VPS (Docker)

Este proyecto usa rsync para subir el código y docker compose para la orquestación.

1) Comando de Despliegue (Desde tu máquina local):

```bash
rsync -avz -e "ssh -i ~/.ssh/id_ed25519" --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude '.env' ./ root@TU_IP_VPS:/opt/proyectos/backend/
```

2) Reconstrucción en el Servidor:

```bash
ssh -i ~/.ssh/id_ed25519 root@TU_IP_VPS "cd /opt/proyectos && docker compose build --no-cache bot && docker compose up -d"
```

## 🕵️‍♂️ Comandos Útiles

Ver logs en tiempo real:
```bash
docker logs -f bot_pizzeria
```

Reiniciar bot:
```bash
docker restart bot_pizzeria
```

Modo Debug (En WhatsApp): Escribir `!dev admin123` para ver el razonamiento interno del bot.
