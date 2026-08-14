# Dubbing Rápido Pro — diseño de Dubbing Workbench personal

Fecha: 2026-08-14
Estado: aprobado por el usuario para implementación incremental

## Objetivo

Convertir la aplicación actual en una herramienta personal de doblaje con una experiencia cercana al flujo de ElevenLabs: crear un doblaje, configurar opciones avanzadas, seguir trabajos, recuperar el estado, explorar la biblioteca y exportar los resultados.

No se construirá un producto multiusuario. No habrá roles, onboarding ni permisos de equipo. Se mantendrá una protección mínima del gateway remoto para contener abuso accidental, consumo inesperado y URLs de origen inseguras.

## Alcance por fases

### Fase 1 — Automatic Dubbing

- Separar el frontend en módulos de estado, gateway, cola y renderizado.
- Ampliar idiomas y permitir varios destinos mediante trabajos coordinados.
- Añadir nombre de proyecto, validación de archivo/URL, duración, tamaño y formatos.
- Añadir opciones avanzadas compatibles con el contrato real del gateway.
- Congelar la configuración en cada item de cola.
- Persistir trabajos en IndexedDB y recuperarlos al recargar.
- Añadir reintento, cancelación local, backoff y concurrencia configurable sin superar el límite del proveedor.
- Mostrar confirmación antes de crear un trabajo.

### Fase 2 — Biblioteca y exportaciones

- Reemplazar la lista simple por una biblioteca con búsqueda, filtros, estados, fechas, duración y paginación.
- Mostrar errores reales devueltos por el proveedor.
- Añadir descargas por formato y transcriptos SRT, WebVTT y JSON cuando estén disponibles.
- Añadir selección múltiple, descarga por lote, renombrado y duplicación de configuración.

### Fase 3 — Dubbing Studio

- Mantener Studio como ruta/módulo separado del flujo automático.
- Añadir vista de timeline, waveform, hablantes, transcript original/traducción y edición por clip.
- Preparar regeneración de segmentos y exportaciones propias de Studio.
- Activar las capacidades sólo cuando el gateway confirme que el recurso es editable.

## Arquitectura

La interfaz no llamará a `fetch` directamente. El gateway será la única seam de transporte y expondrá operaciones de dominio: crear, consultar, listar, descargar, obtener transcriptos y borrar. El gateway mapeará los nombres del proxy propio a los nombres aceptados por ElevenLabs y normalizará errores.

La cola será una máquina de estados independiente del DOM. Cada trabajo conservará un snapshot de su configuración, el ID remoto y su estado local. IndexedDB será la persistencia de recuperación; no se persistirán archivos binarios completos, sólo metadatos y referencias necesarias para continuar o informar.

El renderizado usará construcción DOM segura o `textContent` para nombres, errores y datos remotos. La UI se organizará como un workbench oscuro: navegación lateral compacta, área principal de creación/biblioteca, panel de configuración avanzada y estados de procesamiento visibles.

## Contrato de verificación

Cada fase debe verificarse con:

1. Checks de sintaxis y tests automatizados de las funciones nuevas.
2. Smoke test del servidor local y del contrato del gateway sin crear trabajos reales.
3. Flujo end-to-end en navegador con un transporte falso/local para crear, consultar, completar, fallar, reintentar y descargar.
4. Verificación visual responsive de escritorio y móvil.
5. Revisión final de `git diff`, rutas, errores de consola y estado limpio de la aplicación.

Las llamadas que creen dubs reales no se ejecutarán durante las pruebas automáticas; se usarán fixtures y un gateway fake. La integración real quedará comprobada sólo hasta el límite seguro del endpoint, sin consumir créditos.

## Decisiones explícitas

- No se implementará autenticación multiusuario.
- No se expondrá una API key de ElevenLabs en el navegador.
- No se intentará clonar toda la aplicación de ElevenLabs fuera del flujo de doblaje.
- Studio se implementará después de que Automatic Dubbing, biblioteca y exportaciones sean estables.
