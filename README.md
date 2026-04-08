# @velzia/shared

Componentes, tipos y utilidades compartidos entre las apps de Velzia:
- **Factorías** — App de producción/fábrica
- **OnSite** — App móvil para PMJs en obra
- **rt.sig** — CRM y gestión de proyectos
- **Logística** — Gestión logística

## Instalación

```bash
npm install github:ChanyChap/velzia-shared
```

## Uso

```typescript
// Componentes UI
import { Button } from "@velzia/shared/components/ui/button";
import { Card } from "@velzia/shared/components/ui/card";

// Mediciones
import { MeasurementWorkspace } from "@velzia/shared/components/measurements/measurement-workspace";

// Partes de trabajo
import { SignatureCanvas } from "@velzia/shared/components/field-visits/signature-canvas";

// Utilidades
import { cn, formatCurrency } from "@velzia/shared/lib/utils";
import { haversineDistance } from "@velzia/shared/lib/geo-utils";

// Types
import type { Profile, Tenant, Proyecto } from "@velzia/shared/lib/types";
```

## Estructura

```
src/
├── components/
│   ├── ui/              13 componentes shadcn/ui
│   ├── measurements/    15 componentes de mediciones
│   ├── field-visits/     7 componentes de partes de trabajo
│   └── workforce/        2 componentes (fichaje)
├── lib/
│   ├── types.ts          Tipos TypeScript compartidos
│   ├── utils.ts          Utilidades (cn, formatCurrency, etc.)
│   ├── geo-utils.ts      Geolocalización
│   ├── supabase/         Clientes Supabase
│   └── bluetooth/        Bluetooth laser
└── hooks/                4 hooks React
```
