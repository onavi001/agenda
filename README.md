# Agenda Lash Studio

Aplicacion fullstack para gestionar citas de un negocio de pestanas.

## Arquitectura separada

- `frontend/`: Vite + React + TypeScript (mobile first).
- `backend/`: API Express + autenticacion JWT + subida de fotos.
- `backend/data/agenda.db`: base de datos SQLite local.
- `backend/uploads/`: fotos de evidencia antes/despues.

## Scripts (raiz)

- `npm run dev`: levanta frontend y backend juntos.
- `npm run dev:frontend`: levanta solo frontend.
- `npm run dev:backend`: levanta solo backend.
- `npm run build`: build de frontend.

## Scripts por proyecto

- `frontend`: `npm run dev`, `npm run build`, `npm run preview`.
- `backend`: `npm run dev`, `npm run start`.

## API principal

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/appointments?date=YYYY-MM-DD&search=texto`
- `POST /api/appointments` (multipart/form-data con `beforePhoto` y `afterPhoto`)
- `PATCH /api/appointments/:id/status`
- `PATCH /api/appointments/:id/photos`
- `DELETE /api/appointments/:id`
- `GET /api/stats/today`

## Primer acceso

El backend crea un usuario inicial automaticamente:

- Correo: `admin@lash.local`
- Contrasena: `admin123`

## Variables de entorno backend

Revisa `backend/.env.example` y configura al menos:

- `PORT`
- `JWT_SECRET`

## Nota de produccion

Para pruebas y MVP, SQLite funciona bien. Para multiples sucursales, muchos usuarios concurrentes o crecimiento alto, migra a PostgreSQL y usa almacenamiento de fotos tipo S3/R2.
