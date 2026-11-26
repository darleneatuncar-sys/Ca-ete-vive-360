# Diagrama relacional final

```mermaid
erDiagram
    DISTRITO ||--o{ ATRACTIVO : ubica
    CATEGORIA ||--o{ ATRACTIVO : clasifica
    DISTRITO ||--o{ SERVICIO : ofrece
    RUTA ||--o{ DETALLE_RUTA : contiene
    ATRACTIVO ||--o{ DETALLE_RUTA : integra
    TURISTA ||--o{ VISITA : registra
    ATRACTIVO ||--o{ VISITA : recibe

    DISTRITO {
      bigint id_distrito PK
      varchar nombre
      text descripcion
    }
    CATEGORIA {
      bigint id_categoria PK
      varchar nombre
    }
    ATRACTIVO {
      bigint id_atractivo PK
      bigint id_distrito FK
      bigint id_categoria FK
      varchar nombre
      text descripcion
      varchar direccion
      numeric latitud
      numeric longitud
    }
    SERVICIO {
      bigint id_servicio PK
      bigint id_distrito FK
      varchar nombre
      varchar tipo_servicio
      varchar telefono
      varchar direccion
    }
    RUTA {
      bigint id_ruta PK
      varchar nombre
      text descripcion
      numeric duracion_horas
    }
    DETALLE_RUTA {
      bigint id_detalle PK
      bigint id_ruta FK
      bigint id_atractivo FK
      integer orden_visita
    }
    TURISTA {
      bigint id_turista PK
      varchar nombres
      varchar apellidos
      varchar correo UK
    }
    VISITA {
      bigint id_visita PK
      bigint id_turista FK
      bigint id_atractivo FK
      date fecha_visita
      text comentario
    }
```

Restricciones importantes: `turista.correo` es único; `detalle_ruta` debe tener valores únicos para `(id_ruta, id_atractivo)` y `(id_ruta, orden_visita)`; y `orden_visita` debe ser mayor que cero.
