import type {
  MeasurementPoint,
  MeasurementTemplate,
  MeasurementValidationStatus,
  WallPosition,
} from "./types";

// ========================================
// Default tolerances by product type
// ========================================

export interface ProductTolerances {
  tolerance_mm: number;
  min_width_mm: number;
  max_width_mm: number;
  min_height_mm: number;
  max_height_mm: number;
  parallel_warning_mm: number;
  parallel_error_mm: number;
  diagonal_warning_mm: number;
  diagonal_error_mm: number;
}

export const DEFAULT_TOLERANCES: Record<string, ProductTolerances> = {
  armario_empotrado: {
    tolerance_mm: 3,
    min_width_mm: 300,
    max_width_mm: 5000,
    min_height_mm: 500,
    max_height_mm: 3000,
    parallel_warning_mm: 5,
    parallel_error_mm: 15,
    diagonal_warning_mm: 10,
    diagonal_error_mm: 20,
  },
  cocina: {
    tolerance_mm: 2,
    min_width_mm: 300,
    max_width_mm: 6000,
    min_height_mm: 600,
    max_height_mm: 2700,
    parallel_warning_mm: 5,
    parallel_error_mm: 15,
    diagonal_warning_mm: 10,
    diagonal_error_mm: 20,
  },
  puerta: {
    tolerance_mm: 2,
    min_width_mm: 600,
    max_width_mm: 1200,
    min_height_mm: 1800,
    max_height_mm: 2400,
    parallel_warning_mm: 5,
    parallel_error_mm: 15,
    diagonal_warning_mm: 10,
    diagonal_error_mm: 20,
  },
  mueble_bano: {
    tolerance_mm: 3,
    min_width_mm: 300,
    max_width_mm: 2000,
    min_height_mm: 400,
    max_height_mm: 1000,
    parallel_warning_mm: 5,
    parallel_error_mm: 15,
    diagonal_warning_mm: 10,
    diagonal_error_mm: 20,
  },
  default: {
    tolerance_mm: 3,
    min_width_mm: 10,
    max_width_mm: 15000,
    min_height_mm: 10,
    max_height_mm: 15000,
    parallel_warning_mm: 5,
    parallel_error_mm: 15,
    diagonal_warning_mm: 10,
    diagonal_error_mm: 20,
  },
};

// ========================================
// Validation result types
// ========================================

export interface PointValidationResult {
  point_id: string;
  status: MeasurementValidationStatus;
  message: string | null;
}

export interface CrossValidationResult {
  rule: string;
  point_a_id: string;
  point_b_id: string;
  diff_mm: number;
  status: MeasurementValidationStatus;
  message: string;
}

export interface CompletenessResult {
  is_complete: boolean;
  missing_points: string[];
  has_photos: boolean;
  has_errors: boolean;
  has_warnings: boolean;
  total_points: number;
  points_with_value: number;
}

export interface ValidationSummary {
  point_results: PointValidationResult[];
  cross_results: CrossValidationResult[];
  completeness: CompletenessResult;
  overall_status: MeasurementValidationStatus;
  warnings_count: number;
  errors_count: number;
}

// ========================================
// Level 1: Point validation (real-time)
// ========================================

export function validatePoint(
  point: MeasurementPoint,
  tolerances: ProductTolerances = DEFAULT_TOLERANCES.default
): PointValidationResult {
  if (point.value_mm === null || point.value_mm === undefined) {
    return { point_id: point.id, status: "pending", message: null };
  }

  const value = point.value_mm;

  // Sanity check: too small
  if (value < 10) {
    return {
      point_id: point.id,
      status: "warning",
      message: `Valor muy pequeño: ${value}mm. ¿Es correcto?`,
    };
  }

  // Sanity check: too large
  if (value > 15000) {
    return {
      point_id: point.id,
      status: "warning",
      message: `Valor muy grande: ${value}mm. ¿Es correcto?`,
    };
  }

  // Range check based on wall position
  const isWidth = point.wall_position === "top" || point.wall_position === "bottom";
  const isHeight = point.wall_position === "left" || point.wall_position === "right";

  if (isWidth) {
    if (value < tolerances.min_width_mm || value > tolerances.max_width_mm) {
      return {
        point_id: point.id,
        status: "warning",
        message: `Ancho ${value}mm fuera del rango esperado (${tolerances.min_width_mm}-${tolerances.max_width_mm}mm)`,
      };
    }
  }

  if (isHeight) {
    if (value < tolerances.min_height_mm || value > tolerances.max_height_mm) {
      return {
        point_id: point.id,
        status: "warning",
        message: `Alto ${value}mm fuera del rango esperado (${tolerances.min_height_mm}-${tolerances.max_height_mm}mm)`,
      };
    }
  }

  return { point_id: point.id, status: "ok", message: null };
}

// ========================================
// Level 2: Cross-validation (between points)
// ========================================

function findPointByPosition(
  points: MeasurementPoint[],
  position: WallPosition
): MeasurementPoint | undefined {
  return points.find((p) => p.wall_position === position && p.value_mm !== null);
}

export function validateCrossPoints(
  points: MeasurementPoint[],
  tolerances: ProductTolerances = DEFAULT_TOLERANCES.default
): CrossValidationResult[] {
  const results: CrossValidationResult[] = [];

  // Rule 1: Wall parallelism (top vs bottom width)
  const topWidth = findPointByPosition(points, "top");
  const bottomWidth = findPointByPosition(points, "bottom");
  if (topWidth?.value_mm != null && bottomWidth?.value_mm != null) {
    const diff = Math.abs(topWidth.value_mm - bottomWidth.value_mm);
    let status: MeasurementValidationStatus = "ok";
    if (diff > tolerances.parallel_error_mm) status = "error";
    else if (diff > tolerances.parallel_warning_mm) status = "warning";

    results.push({
      rule: "Paralelismo paredes (ancho superior vs inferior)",
      point_a_id: topWidth.id,
      point_b_id: bottomWidth.id,
      diff_mm: diff,
      status,
      message:
        status === "ok"
          ? `Diferencia de ${diff}mm: dentro de tolerancia`
          : `Diferencia de ${diff}mm entre ancho superior (${topWidth.value_mm}mm) e inferior (${bottomWidth.value_mm}mm)`,
    });
  }

  // Rule 2: Wall plumb (left vs right height)
  const leftHeight = findPointByPosition(points, "left");
  const rightHeight = findPointByPosition(points, "right");
  if (leftHeight?.value_mm != null && rightHeight?.value_mm != null) {
    const diff = Math.abs(leftHeight.value_mm - rightHeight.value_mm);
    let status: MeasurementValidationStatus = "ok";
    if (diff > tolerances.parallel_error_mm) status = "error";
    else if (diff > tolerances.parallel_warning_mm) status = "warning";

    results.push({
      rule: "Aplomo paredes (alto izquierdo vs derecho)",
      point_a_id: leftHeight.id,
      point_b_id: rightHeight.id,
      diff_mm: diff,
      status,
      message:
        status === "ok"
          ? `Diferencia de ${diff}mm: dentro de tolerancia`
          : `Diferencia de ${diff}mm entre alto izquierdo (${leftHeight.value_mm}mm) y derecho (${rightHeight.value_mm}mm)`,
    });
  }

  // Rule 3: Square check (diagonals)
  const diagTLBR = findPointByPosition(points, "diagonal_tl_br");
  const diagTRBL = findPointByPosition(points, "diagonal_tr_bl");
  if (diagTLBR?.value_mm != null && diagTRBL?.value_mm != null) {
    const diff = Math.abs(diagTLBR.value_mm - diagTRBL.value_mm);
    let status: MeasurementValidationStatus = "ok";
    if (diff > tolerances.diagonal_error_mm) status = "error";
    else if (diff > tolerances.diagonal_warning_mm) status = "warning";

    results.push({
      rule: "Escuadra (diagonales)",
      point_a_id: diagTLBR.id,
      point_b_id: diagTRBL.id,
      diff_mm: diff,
      status,
      message:
        status === "ok"
          ? `Diferencia de ${diff}mm entre diagonales: dentro de tolerancia`
          : `Diferencia de ${diff}mm entre diagonales (${diagTLBR.value_mm}mm vs ${diagTRBL.value_mm}mm)`,
    });
  }

  // Rule 4: Pythagorean consistency (diagonal² ≈ width² + height²)
  const avgWidth =
    topWidth?.value_mm != null && bottomWidth?.value_mm != null
      ? (topWidth.value_mm + bottomWidth.value_mm) / 2
      : topWidth?.value_mm ?? bottomWidth?.value_mm ?? null;
  const avgHeight =
    leftHeight?.value_mm != null && rightHeight?.value_mm != null
      ? (leftHeight.value_mm + rightHeight.value_mm) / 2
      : leftHeight?.value_mm ?? rightHeight?.value_mm ?? null;
  const diagonal = diagTLBR?.value_mm ?? diagTRBL?.value_mm ?? null;

  if (avgWidth !== null && avgHeight !== null && diagonal !== null) {
    const expectedDiag = Math.sqrt(avgWidth * avgWidth + avgHeight * avgHeight);
    const deviationPct = Math.abs(diagonal - expectedDiag) / expectedDiag * 100;
    let status: MeasurementValidationStatus = "ok";
    if (deviationPct > 5) status = "error";
    else if (deviationPct > 2) status = "warning";

    const diagPoint = diagTLBR ?? diagTRBL;
    const widthPoint = topWidth ?? bottomWidth;
    if (diagPoint && widthPoint) {
      results.push({
        rule: "Consistencia pitagórica",
        point_a_id: diagPoint.id,
        point_b_id: widthPoint.id,
        diff_mm: Math.round(Math.abs(diagonal - expectedDiag)),
        status,
        message:
          status === "ok"
            ? `Desviación pitagórica del ${deviationPct.toFixed(1)}%: dentro de tolerancia`
            : `Desviación pitagórica del ${deviationPct.toFixed(1)}% (diagonal medida: ${diagonal}mm, esperada: ${Math.round(expectedDiag)}mm)`,
      });
    }
  }

  return results;
}

// ========================================
// Level 3: Completeness check
// ========================================

export function validateCompleteness(
  points: MeasurementPoint[],
  photoCount: number,
  template?: MeasurementTemplate | null
): CompletenessResult {
  const pointsWithValue = points.filter((p) => p.value_mm !== null);
  const pointResults = points.map((p) => validatePoint(p));
  const hasErrors = pointResults.some((r) => r.status === "error");
  const hasWarnings = pointResults.some((r) => r.status === "warning");

  const missingPoints: string[] = [];
  if (template) {
    for (const req of template.required_points) {
      const found = points.find(
        (p) => p.wall_position === req.wall_position && p.value_mm !== null
      );
      if (!found) {
        missingPoints.push(req.label);
      }
    }
  }

  return {
    is_complete: photoCount > 0 && !hasErrors && missingPoints.length === 0 && pointsWithValue.length > 0,
    missing_points: missingPoints,
    has_photos: photoCount > 0,
    has_errors: hasErrors,
    has_warnings: hasWarnings,
    total_points: points.length,
    points_with_value: pointsWithValue.length,
  };
}

// ========================================
// Full validation (all 3 levels)
// ========================================

export function validateSession(
  points: MeasurementPoint[],
  photoCount: number,
  template?: MeasurementTemplate | null,
  productType?: string
): ValidationSummary {
  const tolerances = productType
    ? DEFAULT_TOLERANCES[productType] ?? DEFAULT_TOLERANCES.default
    : DEFAULT_TOLERANCES.default;

  // Level 1: Point validation
  const pointResults = points.map((p) => validatePoint(p, tolerances));

  // Level 2: Cross-validation
  const crossResults = validateCrossPoints(points, tolerances);

  // Level 3: Completeness
  const completeness = validateCompleteness(points, photoCount, template);

  // Count
  const warnings =
    pointResults.filter((r) => r.status === "warning").length +
    crossResults.filter((r) => r.status === "warning").length;
  const errors =
    pointResults.filter((r) => r.status === "error").length +
    crossResults.filter((r) => r.status === "error").length;

  let overall: MeasurementValidationStatus = "ok";
  if (errors > 0 || completeness.has_errors) overall = "error";
  else if (warnings > 0 || completeness.has_warnings) overall = "warning";
  else if (points.some((p) => p.value_mm === null)) overall = "pending";

  return {
    point_results: pointResults,
    cross_results: crossResults,
    completeness,
    overall_status: overall,
    warnings_count: warnings,
    errors_count: errors,
  };
}
