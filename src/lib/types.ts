// ========================================
// Roles and Auth (shared with rt.sig)
// ========================================

// Roles del sistema (hardcoded, no editables por tenant)
export type SystemRole =
  | "superadmin"
  | "admin_empresa"
  | "admin_fabrica"
  | "director_comercial"
  | "comercial"
  | "jefe_obra"
  | "administracion"
  | "logistica"
  | "postventa"
  | "operario";

// Roles de fábrica por defecto (seeded, editables pero no borrables)
export type DefaultFactoryRole = "jefe_produccion" | "operario_planta" | "rplace";

// UserRole acepta system roles, factory defaults, y slugs custom de fábrica
export type UserRole = SystemRole | DefaultFactoryRole | (string & {});

// Configuración de un rol custom cargado de fab_custom_roles
export interface CustomRoleConfig {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  color: string;
  permissions: string[];
  sidebar_keys: string[];
  tab_keys: string[];
  is_default: boolean;
  is_active: boolean;
  position: number;
}

export type ProfileSource = "rtsig" | "factorias";

export interface Profile {
  id: string;
  tenant_id: string | null;
  role: UserRole;
  full_name: string | null;
  email: string;
  phone: string | null;
  job_title: string | null;
  source: ProfileSource;
  is_active?: boolean;
  avatar_url?: string | null;
  last_seen_at?: string | null;
  convenio?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cif: string | null;
  razon_social: string | null;
  direccion_fiscal: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  provincia: string | null;
  pais: string | null;
  phone: string | null;
  email: string | null;
  plan: string | null;
  brand_primary: string | null;
  brand_secondary: string | null;
  brand_accent: string | null;
  ss_percent: number;
  created_at: string;
}

// ========================================
// Clients (shared with rt.sig)
// ========================================

export interface Cliente {
  id: string;
  tenant_id: string;
  name: string;
  nif_cif: string | null;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  provincia: string | null;
  notes: string | null;
  source: string | null;
  respondio_contact_id: string | null;
  created_at: string;
  updated_at: string;
}

// ========================================
// Projects & Subprojects
// ========================================

export type ProjectStatus = "draft" | "active" | "completed" | "cancelled" | "delayed";
export type SubprojectStatus = "active" | "completed" | "cancelled";

export interface Project {
  id: string;
  tenant_id: string;
  client_id: string | null;
  client?: Cliente;
  project_number: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  delivery_address: string | null;
  notes: string | null;
  created_by: string | null;
  state_id: string | null;
  state?: ProjectState;
  state_changed_at: string | null;
  created_at: string;
  contract_signed?: boolean;
  contract_file_path?: string | null;
  contract_amount?: number | null;
  budget_signature_data?: string | null;
  budget_signed_at?: string | null;
  budget_signed_by?: string | null;
  refotask_proyecto_id?: string | null;
  refotask_last_synced_at?: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  updated_at: string;
  subprojects?: Subproject[];
}

export interface RefotaskProyecto {
  id: string;
  name: string;
  client_name: string | null;
  address: string | null;
  status: string;
  ciudad: string | null;
  provincia: string | null;
  cliente_id: string | null;
  floor_plan_url: string | null;
  pdf_url: string | null;
  created_at: string;
}

export interface Subproject {
  id: string;
  project_id: string;
  tenant_id: string;
  product_type_id: string | null;
  product_type?: ProductType;
  project_type_id: string | null;
  project_type?: ProjectType;
  name: string;
  description: string | null;
  sort_order: number;
  status: SubprojectStatus;
  planned_end: string | null;
  created_at: string;
  work_orders?: WorkOrder[];
}

// ========================================
// Project Drawings (Planos)
// ========================================

export interface ProjectDrawing {
  id: string;
  tenant_id: string;
  project_id: string;
  subproject_id: string | null;     // null = nivel proyecto
  subproject?: Pick<Subproject, "id" | "name">;
  filename: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  title: string | null;
  version: string | null;
  drawing_number: string | null;
  revision: string | null;
  match_score: number | null;
  match_confirmed: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  signed_url?: string;              // generado on-demand por la API
  ai_analysis_status?: 'none' | 'processing' | 'completed' | 'failed';
  ai_analysis_result?: AIDrawingAnalysis | null;
}

// ========================================
// Project Rooms (estancias) + AI Analysis
// ========================================

export interface ProjectRoom {
  id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface AIDetectedElement {
  id: string;                              // UUID temporal para DnD
  label: string;                           // "Armario 1", "V1 - Ventana"
  element_type: string;                    // "armario", "ventana", "puerta"...
  suggested_product_type_code: string | null; // "ARM", "VEN", "COC"
  confidence: number;                      // 0-1
  source_drawing_id: string;
}

export interface AIDetectedRoom {
  id: string;
  name: string;
  elements: AIDetectedElement[];
}

export interface AIDrawingAnalysis {
  rooms: AIDetectedRoom[];
  unassigned: AIDetectedElement[];
  raw_description?: string;
  site_address?: string | null;
  model_used: string;
  analyzed_at: string;
}

export interface DrawingMatchProposal {
  filename: string;
  proposed_subproject_id: string | null;
  proposed_subproject_name: string | null;
  match_score: number;
  reasons: string[];
}

// ========================================
// Project States (configurable taskboard)
// ========================================

export interface ProjectState {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  color: string;
  sort_order: number;
  is_initial: boolean;
  is_final: boolean;
  max_days: number | null;
  created_at: string;
}

export interface PhaseStatus {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  created_at: string;
}

// ========================================
// Product Types & States (configurable)
// ========================================

export interface ProjectType {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  color: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  skill_category_id: string | null;
  created_at: string;
}

export interface ProductType {
  id: string;
  tenant_id: string;
  name: string; // "Mueble cocina", "Armario", "Ventana", "Encimera", "Mármol"
  code: string; // "COC", "ARM", "VEN", "ENC", "MAR"
  color: string; // For Kanban column headers
  icon: string | null;
  default_lead_days?: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProductionState {
  id: string;
  tenant_id: string;
  product_type_id: string;
  name: string; // "Diseño", "Corte", "Montaje", "Acabado", "Control calidad", "Listo"
  code: string;
  color: string;
  sort_order: number;
  is_initial: boolean;
  is_final: boolean;
  wip_limit: number | null; // For Kanban WIP limits
  created_at: string;
}

// ========================================
// Product Type BOM Template (Components + Pieces)
// ========================================

export interface ProductTypeComponent {
  id: string;
  tenant_id: string;
  product_type_id: string;
  name: string;
  family: string | null;
  quantity: number;
  material_cost: number;
  sort_order: number;
  created_at: string;
  pieces?: ComponentTemplatePiece[];
}

export interface ComponentTemplatePiece {
  id: string;
  tenant_id: string;
  component_id: string;
  name: string;
  quantity: number;
  unit: "M2" | "ML" | "Ud";
  width_mm: number | null;
  height_mm: number | null;
  length_mm: number | null;
  sort_order: number;
  created_at: string;
}

// ========================================
// Component Labor Costs (coste mano de obra)
// ========================================

export interface ComponentLaborCost {
  id: string;
  tenant_id: string;
  component_id: string;
  work_center_id: string;
  cost_per_unit: number;
}

// ========================================
// Project Type ↔ Product Type (junction)
// ========================================

export interface ProjectTypeProductType {
  id: string;
  tenant_id: string;
  project_type_id: string;
  product_type_id: string;
  product_type?: ProductType;
  created_at: string;
}

// ========================================
// Work Orders (Órdenes de Fabricación)
// ========================================

export interface WorkOrder {
  id: string;
  tenant_id: string;
  order_number: string; // OF-2024-0001
  project_id: string | null;
  project?: Project;
  subproject_id: string | null;
  subproject?: Subproject;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  delivery_address: string | null;
  product_type_id: string;
  product_type?: ProductType;
  current_state_id: string | null;
  current_state?: ProductionState;
  title: string;
  description: string | null;
  priority: "baja" | "media" | "alta" | "urgente";
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  assigned_to: string | null; // profile.id
  notes: string | null;
  room_id?: string | null;
  room?: ProjectRoom;
  order_type: 'fabricacion' | 'montaje';
  parent_order_id: string | null;
  is_archived: boolean;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  completion_photo_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  work_order_id: string;
  tenant_id: string;
  item_index: number; // Sequential within order
  description: string;
  quantity: number;
  unit: string;
  dimensions: string | null; // "120x60x80cm"
  material: string | null;
  color_finish: string | null;
  current_state_id: string | null;
  current_state?: ProductionState;
  qr_hash: string; // Unique hash for QR
  qr_generated: boolean;
  notes: string | null;
  // MRP Component fields
  component_code: string | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  weight_kg: number | null;
  finish: string | null;
  external_ref: string | null;
  import_source: "manual" | "teowin" | "other";
  import_batch_id: string | null;
  routing_id: string | null;
  routing?: Routing;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  completion_photo_url: string | null;
  created_at: string;
  updated_at: string;
}

// ========================================
// EDT (Estructura de Desglose de Trabajo)
// ========================================

export type DependencyType = "FS" | "FF" | "SS" | "SF";

export interface WBSPhase {
  id: string;
  work_order_id: string | null;
  subproject_id: string | null;
  field_visit_id: string | null;
  tenant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  progress_percent: number;
  assigned_to: string | null;
  depends_on_phase_id: string | null;
  dependency_type: DependencyType | null;
  dependency_lag: number;
  dependency_lag_unit: "d" | "h";
  duration_days: number | null;
  duration_hours: number | null;
  alert_days_before: number | null;
  alert_sent: boolean;
  is_milestone: boolean;
  is_anchor: boolean;
  is_system: boolean;
  phase_type?: 'firma_contrato' | 'fabricacion' | 'montaje' | 'medicion_definitiva' | 'diseno_0' | 'diseno_final' | null;
  media?: FieldTicketMedia[];
  force_completed_at: string | null;
  force_completed_by_name: string | null;
  created_at: string;
}

export interface PhaseRequiredSkill {
  id: string;
  tenant_id: string;
  phase_id: string;
  skill_id: string;
  min_level: SkillLevel;
  created_at: string;
}

export interface PhaseAssignment {
  id: string;
  phase_id: string;
  profile_id: string;
  profile_name?: string;
}

export interface WBSTemplate {
  id: string;
  tenant_id: string;
  product_type_id: string;
  project_type_id: string | null;
  project_type?: ProjectType;
  name: string;
  phases: WBSTemplatePhase[];
  created_at: string;
}

export interface WBSTemplatePhaseSkill {
  skill_id: string;
  min_level: SkillLevel;
}

export interface WBSTemplatePhase {
  name: string;
  sort_order: number;
  duration_days: number;
  duration_hours: number;
  depends_on_index: number | null;
  dependency_type: DependencyType | null;
  lag?: number;
  lag_unit?: "d" | "h";
  alert_days_before: number | null;
  is_milestone: boolean;
  is_anchor?: boolean;
  is_system?: boolean;
  phase_type?: 'firma_contrato' | 'fabricacion' | 'montaje' | 'medicion_definitiva' | 'diseno_0' | 'diseno_final' | null;
  required_skills?: WBSTemplatePhaseSkill[];
}

// ========================================
// QR Tracking
// ========================================

export type ScanLocation =
  | "produccion"
  | "almacen"
  | "carga_transporte"
  | "entrega"
  | "instalacion"
  | "devolucion"
  | "operacion";

export interface QRScan {
  id: string;
  tenant_id: string;
  order_item_id: string;
  work_order_id: string;
  scanned_by: string;
  scan_location: ScanLocation;
  new_state_id: string | null;
  transport_load_id: string | null;
  operation_id: string | null;
  bom_item_id: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  scanned_at: string;
}

// ========================================
// BOM (Lista de Materiales)
// ========================================

export type BOMItemType = "part" | "raw_material" | "hardware" | "consumable" | "material";
export type GrainDirection = "horizontal" | "vertical" | "none";

export interface BOMItem {
  id: string;
  work_order_id: string;
  tenant_id: string;
  order_item_id: string | null;
  precio_empresa_id: string | null; // FK to precios_empresa from rt.sig
  material_name: string;
  material_ref: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  is_consumed: boolean;
  consumed_at: string | null;
  notes: string | null;
  // BOM multinivel fields
  parent_bom_item_id: string | null;
  bom_level: number;
  item_type: BOMItemType;
  width_mm: number | null;
  height_mm: number | null;
  thickness_mm: number | null;
  edge_band: string | null;
  grain_direction: GrainDirection | null;
  external_ref: string | null;
  import_source: "manual" | "teowin" | "other";
  sort_order: number;
  qr_hash: string | null;
  qr_generated: boolean;
  // CNC fields
  requires_cnc: boolean;
  cnc_file_url: string | null;
  cnc_file_name: string | null;
  children?: BOMItem[];
  created_at: string;
}

// ========================================
// MRP: Work Centers, Routing, Operations
// ========================================

export interface MachineType {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description: string | null;
  color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type MfgCenterType = "machine" | "workstation" | "external";

export interface WorkCenterMfg {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  center_type: MfgCenterType;
  capacity_hours_per_day: number;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  productive_unit: string | null;
  machine_type_id: string | null;
  machine_type?: MachineType;
  created_at: string;
  updated_at: string;
}

export interface RoutingTemplateOperation {
  name: string;
  code: string;
  work_center_code: string;
  machine_type_id?: string | null;
  sort_order: number;
  standard_time_minutes: number;
  is_optional?: boolean;
}

export interface RoutingTemplate {
  id: string;
  tenant_id: string;
  product_type_id: string | null;
  product_type?: ProductType;
  name: string;
  operations: RoutingTemplateOperation[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type RoutingStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface Routing {
  id: string;
  tenant_id: string;
  work_order_id: string;
  order_item_id: string | null;
  template_id: string | null;
  name: string;
  status: RoutingStatus;
  operations?: RoutingOperation[];
  created_at: string;
  updated_at: string;
}

export type OperationStatus = "pending" | "queued" | "in_progress" | "completed" | "skipped";

export interface RoutingOperation {
  id: string;
  tenant_id: string;
  routing_id: string;
  work_center_id: string | null;
  work_center?: WorkCenterMfg;
  name: string;
  code: string;
  sort_order: number;
  status: OperationStatus;
  standard_time_minutes: number | null;
  actual_time_minutes: number | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  assigned_to: string | null;
  assigned_to_profile?: Pick<Profile, "id" | "full_name">;
  machine_type_id: string | null;
  machine_type?: MachineType;
  is_optional: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ScanType = "operation_start" | "operation_complete" | "quality_check" | "rework" | "scrap";

export interface OperationLog {
  id: string;
  tenant_id: string;
  operation_id: string | null;
  operation?: RoutingOperation;
  order_item_id: string | null;
  bom_item_id: string | null;
  performed_by: string;
  performer?: Pick<Profile, "id" | "full_name">;
  started_at: string | null;
  completed_at: string;
  quantity_ok: number;
  quantity_defect: number;
  rework_required: boolean;
  scan_type: ScanType;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  created_at: string;
}

export type ImportBatchStatus = "pending" | "processing" | "completed" | "failed";
export type ImportSource = "teowin" | "teowin_project" | "manual" | "other";

export interface ImportBatch {
  id: string;
  tenant_id: string;
  work_order_id: string | null;
  project_id: string | null;
  source: ImportSource;
  filename: string | null;
  imported_by: string;
  imported_at: string;
  component_count: number;
  part_count: number;
  raw_data: Record<string, unknown> | null;
  status: ImportBatchStatus;
  error_log: string | null;
  created_at: string;
}

// ========================================
// MRP Views (read-only)
// ========================================

export interface MaterialRequirement {
  tenant_id: string;
  work_order_id: string;
  order_number: string;
  project_id: string | null;
  order_item_id: string;
  component_description: string;
  component_code: string | null;
  material_name: string;
  material_ref: string | null;
  item_type: BOMItemType;
  unit: string;
  total_quantity_needed: number;
  total_cost: number;
  thickness_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  edge_band: string | null;
  grain_direction: GrainDirection | null;
  component_count: number;
  all_consumed: boolean;
}

export interface ComponentProgress {
  order_item_id: string;
  tenant_id: string;
  work_order_id: string;
  component_description: string;
  component_code: string | null;
  quantity: number;
  routing_id: string | null;
  routing_name: string | null;
  routing_status: RoutingStatus | null;
  total_operations: number;
  completed_operations: number;
  skipped_operations: number;
  in_progress_operations: number;
  progress_percent: number;
  first_operation_start: string | null;
  last_operation_end: string | null;
  total_standard_minutes: number | null;
  total_actual_minutes: number | null;
}

export interface WorkCenterLoad {
  work_center_id: string;
  tenant_id: string;
  work_center_name: string;
  work_center_code: string;
  center_type: MfgCenterType;
  capacity_hours_per_day: number;
  pending_operations: number;
  queued_operations: number;
  active_operations: number;
  completed_today: number;
  pending_minutes: number;
  active_minutes: number;
  load_percent: number;
}

// ========================================
// Kanban
// ========================================

export interface KanbanBoard {
  id: string;
  tenant_id: string;
  product_type_id: string;
  name: string;
  is_default: boolean;
  config: Record<string, unknown>;
  created_at: string;
}

// ========================================
// Transport
// ========================================

export interface Vehicle {
  id: string;
  tenant_id: string;
  plate: string;
  name: string; // "Furgoneta 1"
  type: "furgoneta" | "camion" | "trailer";
  max_weight_kg: number | null;
  max_volume_m3: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface TransportLoad {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  vehicle?: Vehicle;
  load_number: string;
  status: "preparando" | "cargado" | "en_ruta" | "entregado" | "incidencia";
  driver_name: string | null;
  planned_date: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  route_notes: string | null;
  total_items: number;
  loaded_items: number;
  has_missing_items: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TransportLoadItem {
  id: string;
  transport_load_id: string;
  order_item_id: string;
  work_order_id: string;
  is_loaded: boolean;
  loaded_at: string | null;
  loaded_by: string | null;
  notes: string | null;
}

// ========================================
// HR / Personnel
// ========================================

export interface EmployeeSchedule {
  id: string;
  tenant_id: string;
  profile_id: string;
  day_of_week: number; // 0=Mon, 6=Sun
  start_time: string; // "08:00"
  end_time: string; // "17:00"
  break_minutes: number;
  is_active: boolean;
}

export interface Absence {
  id: string;
  tenant_id: string;
  profile_id: string;
  type: "vacaciones" | "baja_medica" | "permiso" | "otro";
  start_date: string;
  end_date: string;
  notes: string | null;
  approved_by: string | null;
  status: "pendiente" | "aprobada" | "rechazada";
  created_at: string;
}

export interface SkillDefinition {
  id: string;
  tenant_id: string;
  name: string;
  category: string; // "Carpintería", "Montaje", "Acabado", etc.
  description: string | null;
  created_at: string;
}

export type SkillLevel = "aprendiz" | "basico" | "intermedio" | "avanzado" | "experto" | "bajo" | "medio" | "alto";

export interface EmployeeSkill {
  id: string;
  tenant_id: string;
  profile_id: string;
  skill_id: string;
  skill?: SkillDefinition;
  level: SkillLevel;
  certified: boolean;
  certification_date: string | null;
  certification_expiry: string | null;
  notes: string | null;
  updated_at: string;
}

// ========================================
// Budgets & Costs
// ========================================

export interface OrderBudget {
  id: string;
  work_order_id: string;
  tenant_id: string;
  version: number;
  material_cost: number;
  labor_cost: number;
  overhead_cost: number;
  margin_percent: number;
  total_price: number;
  status: "borrador" | "enviado" | "aceptado" | "rechazado";
  sent_at: string | null;
  accepted_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface CostEntry {
  id: string;
  work_order_id: string | null;
  tenant_id: string;
  type: "material" | "mano_obra" | "overhead" | "transporte" | "otro" | "subcontrata";
  description: string;
  amount: number;
  quantity: number | null;
  unit_cost: number | null;
  source: "manual" | "fichaje" | "bom" | "transporte" | "compra" | "subcontrata" | "factura" | "mercaderia";
  source_id: string | null;
  date: string;
  project_id: string | null;
  subproject_id: string | null;
  supplier_id: string | null;
  expense_category_id: string | null;
  purchase_order_id: string | null;
  goods_receipt_id: string | null;
  supplier_invoice_id: string | null;
  subcontract_id: string | null;
  created_by: string;
  created_at: string;
}

// ========================================
// Alerts
// ========================================

export interface AlertRule {
  id: string;
  tenant_id: string;
  name: string;
  event_type: "deadline_approaching" | "state_change" | "missing_items" | "budget_exceeded" | "custom";
  condition: Record<string, unknown>;
  notify_roles: UserRole[];
  notify_email: boolean;
  notify_dashboard: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AlertLog {
  id: string;
  tenant_id: string;
  alert_rule_id: string | null;
  work_order_id: string | null;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  is_read: boolean;
  read_by: string | null;
  read_at: string | null;
  created_at: string;
}

// ========================================
// Workforce / Operaciones
// ========================================

export type WorkCenterType = "fabrica" | "obra";

export interface WorkCenter {
  id: string;
  tenant_id: string;
  name: string;
  type: WorkCenterType;
  address: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_radius_meters: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ShiftStatus = "active" | "completed" | "adjusted" | "cancelled";

export interface Shift {
  id: string;
  tenant_id: string;
  profile_id: string;
  work_center_id: string | null;
  proyecto_id: string | null;
  clock_in: string;
  clock_out: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  break_minutes: number;
  total_minutes_worked: number | null;
  notes: string | null;
  status: ShiftStatus;
  adjusted_by: string | null;
  adjusted_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  profile?: Pick<Profile, "id" | "full_name">;
  work_center?: Pick<WorkCenter, "id" | "name" | "type">;
  proyecto?: { id: string; name: string };
}

export type TaskTimeEntryStatus = "in_progress" | "completed" | "paused" | "cancelled";

export interface TaskTimeEntry {
  id: string;
  tenant_id: string;
  shift_id: string;
  profile_id: string;
  tarea_id: string | null;
  sop_id: string | null;
  description: string | null;
  started_at: string;
  completed_at: string | null;
  duration_minutes: number | null;
  status: TaskTimeEntryStatus;
  quantity_produced: number | null;
  quantity_unit: string | null;
  defects_count: number;
  rework_required: boolean;
  photo_urls: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  tarea?: { id: string; name: string };
  sop?: Pick<SOP, "id" | "name">;
}

export type SOPDifficulty = "basico" | "medio" | "avanzado";

export interface SOPStep {
  id: string;
  title: string;
  description?: string;
  media?: FieldTicketMedia[];
}

export interface SOPChecklistItem {
  step: string;
  required: boolean;
}

export interface SOPMaterialRef {
  precio_empresa_id: string | null;
  description: string;
  unit?: string;
  capitulo?: string;
  partida?: string;
  quantity?: number;
}

export interface SOPPersonnel {
  role: string;
  quantity: number;
  skill_ids: string[];
  notes?: string;
}

export interface SOP {
  id: string;
  tenant_id: string;
  work_center_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  video_url: string | null;
  checklist: SOPChecklistItem[];
  standard_time_minutes: number | null;
  tools_required: string[];
  materials_required: string[];
  difficulty_level: SOPDifficulty;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  media: FieldTicketMedia[];
  maestro_capitulo: string | null;
  maestro_partida: string | null;
  maestro_subpartida: string | null;
  maestro_subsubpartida: string | null;
  safety_notes: string | null;
  tools_detail: SOPMaterialRef[];
  materials_detail: SOPMaterialRef[];
  required_personnel: SOPPersonnel[];
  operation_steps: SOPStep[];
  yield_quantity: number | null;
  yield_unit: string | null;
  yield_time_quantity: number | null;
  yield_time_unit: string | null;
}

export type KitStatus = "pendiente" | "preparando" | "preparado" | "enviado" | "entregado";

export interface KitItem {
  id: string;
  kit_id: string;
  tenant_id: string;
  material_id: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  is_checked: boolean;
  sort_order: number;
  created_at: string;
  material?: { id: string; description: string; unit: string; image_url?: string };
}

export interface Kit {
  id: string;
  tenant_id: string;
  proyecto_id: string | null;
  estancia_id: string | null;
  name: string;
  status: KitStatus;
  prepared_by: string | null;
  prepared_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  items?: KitItem[];
  proyecto?: { id: string; name: string };
  estancia?: { id: string; name: string };
}

export interface CareerLevel {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  sort_order: number;
  min_months: number;
  salary_increment_pct: number;
  required_certifications: string[];
  required_kpi_thresholds: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface EmployeeCareer {
  id: string;
  tenant_id: string;
  profile_id: string;
  career_level_id: string;
  promoted_at: string;
  promoted_by: string | null;
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, "id" | "full_name">;
  career_level?: CareerLevel;
}

export type BonusStatus = "pendiente" | "aprobado" | "pagado" | "rechazado";

export interface BonusCalculation {
  id: string;
  tenant_id: string;
  profile_id: string;
  period_start: string;
  period_end: string;
  base_salary_amount: number;
  productivity_score: number;
  productivity_bonus: number;
  quality_score: number;
  quality_bonus: number;
  team_score: number;
  team_bonus: number;
  total_bonus: number;
  calculation_details: Record<string, any>;
  status: BonusStatus;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, "id" | "full_name">;
}

export interface Ranking {
  id: string;
  tenant_id: string;
  work_center_id: string;
  week_start: string;
  ranking_data: { profile_id: string; rank: number; score: number; full_name: string }[];
  metric_key: string;
  created_at: string;
  updated_at: string;
  work_center?: Pick<WorkCenter, "id" | "name">;
}

export type SuggestionCategory = "seguridad" | "calidad" | "productividad" | "herramientas" | "proceso" | "general";
export type SuggestionStatus = "pendiente" | "revisando" | "aprobada" | "implementada" | "rechazada";

export interface ImprovementSuggestion {
  id: string;
  tenant_id: string;
  submitted_by: string;
  title: string;
  description: string | null;
  category: SuggestionCategory;
  status: SuggestionStatus;
  reward_amount: number | null;
  reward_paid_at: string | null;
  created_at: string;
  updated_at: string;
  submitter?: Pick<Profile, "id" | "full_name">;
}

export type WorkforceMeetingType = "daily_obra" | "weekly_fabrica" | "retro_obra" | "comite_mensual";

export interface WorkforceMeeting {
  id: string;
  tenant_id: string;
  meeting_type: WorkforceMeetingType;
  proyecto_id: string | null;
  scheduled_at: string;
  attendees: { profile_id: string; name: string; present: boolean }[];
  notes: string | null;
  action_items: { description: string; responsible_id: string; due_date: string | null; status: string }[];
  created_at: string;
  updated_at: string;
  proyecto?: { id: string; name: string };
}

// Workforce version of EmployeeSkill (simpler, name-based)
export interface WorkforceEmployeeSkill {
  id: string;
  tenant_id: string;
  profile_id: string;
  skill_name: string;
  skill_level: "basico" | "intermedio" | "avanzado";
  certified: boolean;
  certification_date: string | null;
  certification_expiry: string | null;
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, "id" | "full_name">;
}

export interface SatisfactionSurvey {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  questions: { id: string; text: string; type: "rating" | "text" | "multiple_choice"; options?: string[] }[];
  is_anonymous: boolean;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  response_count?: number;
}

export interface SurveyResponse {
  id: string;
  tenant_id: string;
  survey_id: string;
  respondent_id: string | null;
  answers: Record<string, any>;
  created_at: string;
}

export interface WorkforceKPISummary {
  total_shifts: number;
  total_hours: number;
  tasks_completed: number;
  defect_rate: number;
  rework_rate: number;
  active_workers_today: number;
  avg_minutes_per_task: number;
}

// ========================================
// Dashboard KPIs
// ========================================

export interface DashboardKPIs {
  activeOrders: number;
  ordersThisMonth: number;
  completedThisMonth: number;
  delayedOrders: number;
  onTimePercent: number;
  avgProductionDays: number;
  revenueThisMonth: number;
  marginThisMonth: number;
  ordersByState: { state: string; count: number; color: string }[];
  ordersByType: { type: string; count: number }[];
  upcomingDeadlines: { orderId: string; orderNumber: string; title: string; deadline: string; daysLeft: number }[];
  recentAlerts: AlertLog[];
}

// ========================================
// Field Visits (Partes de Trabajo)
// ========================================

export type FieldVisitStatus = "borrador" | "firmado" | "en_revision" | "procesado";
export type FieldTicketCategory = "garantia" | "postventa" | "ampliacion";
export type FieldTicketPriority = "baja" | "media" | "alta" | "urgente";
export type FieldTicketStatus = "pendiente" | "en_revision" | "aprobado" | "of_generada" | "descartada" | "resuelta";
export type TicketCommitmentMode = "fecha_concreta" | "fecha_para_dar_fechas";

export interface FieldTicketMedia {
  url: string;
  storage_path: string;
  type: "image" | "video" | "audio";
  filename: string;
}

export interface FieldVisit {
  id: string;
  tenant_id: string;
  project_id: string;
  project?: Project;
  subproject_id: string | null;
  subproject?: Subproject;
  work_order_id: string | null;
  work_order?: WorkOrder;
  visit_number: string;
  visit_date: string;
  visited_by: string;
  visited_by_profile?: Pick<Profile, "id" | "full_name">;
  location_address: string | null;
  transcript: string | null;
  summary: string | null;
  conclusions: string | null;
  interventions: Record<string, unknown>[];
  action_items: Record<string, unknown>[];
  client_signature_data: string | null;
  client_signed_at: string | null;
  client_signed_ip: string | null;
  status: FieldVisitStatus;
  duration_minutes: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  tickets?: FieldTicket[];
  phases?: WBSPhase[];
}

export interface FieldTicket {
  id: string;
  tenant_id: string;
  field_visit_id: string;
  category: FieldTicketCategory;
  title: string;
  description: string | null;
  priority: FieldTicketPriority;
  media: FieldTicketMedia[];
  generated_work_order_id: string | null;
  generated_work_order?: WorkOrder;
  status: FieldTicketStatus;
  assigned_to: string | null;
  assigned_to_profile?: Pick<Profile, "id" | "full_name">;
  notes: string | null;
  sort_order: number;
  commitment_mode: TicketCommitmentMode | null;
  commitment_date: string | null;
  final_fix_date: string | null;
  commitment_notes: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  resolution_signature_data: string | null;
  resolution_signed_at: string | null;
  resolution_signed_by: string | null;
  resolution_signed_ip: string | null;
  selected_phases: any[];
  created_at: string;
  updated_at: string;
}

export interface TicketResolutionToken {
  id: string;
  tenant_id: string;
  ticket_id: string;
  token: string;
  client_name: string;
  client_email: string | null;
  is_active: boolean;
  expires_at: string;
  created_at: string;
}

export interface EmailLog {
  id: string;
  tenant_id: string;
  email_type: "acta_visita" | "resolucion_ticket" | "recordatorio_compromiso";
  recipient_email: string;
  subject: string;
  resend_id: string | null;
  status: "sent" | "failed" | "bounced";
  related_visit_id: string | null;
  related_ticket_id: string | null;
  created_at: string;
}

// ========================================
// Financial Control - Suppliers
// ========================================

export type SupplierType = 'material' | 'subcontratista' | 'transporte' | 'servicios' | 'mixto';
export type PaymentMethod = 'transferencia' | 'confirming' | 'pagare' | 'tarjeta' | 'efectivo';

export interface Supplier {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  trade_name: string | null;
  nif_cif: string | null;
  supplier_type: SupplierType;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  provincia: string | null;
  payment_terms_days: number;
  payment_method: PaymentMethod | null;
  iban: string | null;
  currency: string;
  tax_rate: number;
  retention_rate: number;
  default_expense_category_id: string | null;
  is_active: boolean;
  rating: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  code: string;
  cost_type: 'material' | 'mano_obra' | 'subcontrata' | 'overhead' | 'transporte' | 'otro';
  is_active: boolean;
  sort_order: number;
  created_at: string;
  children?: ExpenseCategory[];
}

// ========================================
// Financial Control - Purchase Orders
// ========================================

export type POStatus = 'borrador' | 'pendiente_aprobacion' | 'aprobado' | 'enviado' | 'recibido_parcial' | 'recibido' | 'cancelado' | 'rechazado';

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  po_number: string;
  project_id: string;
  project?: Project;
  subproject_id: string | null;
  subproject?: Subproject;
  work_order_id: string | null;
  work_order?: WorkOrder;
  supplier_id: string;
  supplier?: Supplier;
  status: POStatus;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  retention_rate: number;
  retention_amount: number;
  total_amount: number;
  order_date: string;
  expected_delivery_date: string | null;
  requested_by: string;
  requested_by_profile?: Pick<Profile, 'id' | 'full_name'>;
  approved_by: string | null;
  approved_by_profile?: Pick<Profile, 'id' | 'full_name'>;
  approved_at: string | null;
  rejection_reason: string | null;
  expense_category_id: string | null;
  payment_terms_days: number | null;
  delivery_address: string | null;
  notes: string | null;
  supplier_reference: string | null;
  created_at: string;
  updated_at: string;
  lines?: PurchaseOrderLine[];
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  tenant_id: string;
  line_number: number;
  description: string;
  material_ref: string | null;
  bom_item_id: string | null;
  quantity_ordered: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
  line_total: number;
  quantity_received: number;
  expense_category_id: string | null;
  notes: string | null;
  created_at: string;
}

// ========================================
// Financial Control - Goods Receipts
// ========================================

export type GoodsReceiptStatus = 'borrador' | 'confirmado' | 'discrepancia' | 'cancelado';

export interface GoodsReceipt {
  id: string;
  tenant_id: string;
  receipt_number: string;
  purchase_order_id: string;
  purchase_order?: PurchaseOrder;
  supplier_id: string;
  supplier?: Supplier;
  receipt_date: string;
  supplier_delivery_note: string | null;
  status: GoodsReceiptStatus;
  received_by: string;
  received_by_profile?: Pick<Profile, 'id' | 'full_name'>;
  total_amount: number;
  notes: string | null;
  discrepancy_notes: string | null;
  created_at: string;
  updated_at: string;
  lines?: GoodsReceiptLine[];
}

export interface GoodsReceiptLine {
  id: string;
  goods_receipt_id: string;
  tenant_id: string;
  po_line_id: string;
  po_line?: PurchaseOrderLine;
  quantity_received: number;
  quantity_rejected: number;
  unit_price: number;
  line_total: number;
  rejection_reason: string | null;
  warehouse_location: string | null;
  created_at: string;
}

// ========================================
// Financial Control - Supplier Invoices
// ========================================

export type SupplierInvoiceStatus = 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'contabilizada' | 'pagada_parcial' | 'pagada' | 'rechazada' | 'cancelada';
export type MatchingStatus = 'sin_verificar' | 'coincide' | 'discrepancia' | 'sin_po';

export interface SupplierInvoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  supplier_invoice_number: string | null;
  supplier_id: string;
  supplier?: Supplier;
  project_id: string | null;
  project?: Project;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  retention_rate: number;
  retention_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_pending: number;
  invoice_date: string | null;
  received_date: string;
  due_date: string | null;
  payment_date: string | null;
  status: SupplierInvoiceStatus;
  matching_status: MatchingStatus;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  attachment_urls: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  lines?: SupplierInvoiceLine[];
}

export interface SupplierInvoiceLine {
  id: string;
  supplier_invoice_id: string;
  tenant_id: string;
  po_line_id: string | null;
  receipt_line_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
  line_total: number;
  price_variance: number;
  expense_category_id: string | null;
  created_at: string;
}

// ========================================
// Financial Control - Client Invoices
// ========================================

export type ClientInvoiceStatus = 'borrador' | 'enviada' | 'cobrada_parcial' | 'cobrada' | 'cancelada';

export interface ClientInvoice {
  id: string;
  tenant_id: string;
  project_id: string | null;
  client_id: string | null;
  client?: Cliente;
  project?: Project;
  invoice_number: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  retention_rate: number;
  retention_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_pending: number;
  invoice_date: string | null;
  due_date: string | null;
  payment_date: string | null;
  status: ClientInvoiceStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lines?: ClientInvoiceLine[];
}

export interface ClientInvoiceLine {
  id: string;
  client_invoice_id: string;
  tenant_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
  line_total: number;
  created_at: string;
}

// ========================================
// Financial Control - Subcontracts
// ========================================

export type SubcontractStatus = 'borrador' | 'pendiente_aprobacion' | 'aprobado' | 'en_curso' | 'completado_parcial' | 'completado' | 'cancelado' | 'rechazado';

export interface Subcontract {
  id: string;
  tenant_id: string;
  subcontract_number: string;
  project_id: string;
  project?: Project;
  subproject_id: string | null;
  work_order_id: string | null;
  supplier_id: string;
  supplier?: Supplier;
  title: string;
  scope_description: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  retention_rate: number;
  retention_amount: number;
  total_amount: number;
  amount_certified: number;
  amount_invoiced: number;
  amount_paid: number;
  status: SubcontractStatus;
  warranty_retention_percent: number;
  warranty_months: number;
  warranty_released: boolean;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  requested_by: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lines?: SubcontractLine[];
}

export interface SubcontractLine {
  id: string;
  subcontract_id: string;
  tenant_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  routing_operation_id: string | null;
  quantity_completed: number;
  quantity_certified: number;
  is_completed: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

// ========================================
// Financial Control - Project Budgets
// ========================================

export type ProjectBudgetStatus = 'borrador' | 'aprobado' | 'revision' | 'cerrado';

export interface ProjectBudget {
  id: string;
  tenant_id: string;
  project_id: string;
  project?: Project;
  subproject_id: string | null;
  version: number;
  budget_materials: number;
  budget_labor: number;
  budget_subcontracts: number;
  budget_overhead: number;
  budget_transport: number;
  budget_other: number;
  budget_total: number;
  contingency_percent: number;
  contingency_amount: number;
  revenue_amount: number;
  margin_percent: number;
  alert_threshold_percent: number;
  alert_critical_percent: number;
  status: ProjectBudgetStatus;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ========================================
// Financial Control - Payments & Audit
// ========================================

export type PaymentStatus = 'programado' | 'ejecutado' | 'devuelto' | 'cancelado';

export interface PaymentRecord {
  id: string;
  tenant_id: string;
  supplier_invoice_id: string | null;
  subcontract_id: string | null;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  bank_account: string | null;
  status: PaymentStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type AuditAction = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'status_change' | 'amount_change';

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  performed_by: string;
  performer?: Pick<Profile, 'id' | 'full_name'>;
  metadata: Record<string, any>;
  created_at: string;
}

export interface FinancialSettings {
  id: string;
  tenant_id: string;
  auto_approve_limit: number;
  mid_approve_limit: number;
  price_variance_tolerance_pct: number;
  duplicate_detection_days: number;
  round_number_alert: boolean;
  split_order_alert: boolean;
  high_frequency_alert_threshold: number;
  current_closed_period: string | null;
  created_at: string;
  updated_at: string;
}

// ========================================
// Financial Control - View Types
// ========================================

export interface ProjectCostSummary {
  project_id: string;
  tenant_id: string;
  project_name: string;
  project_number: string;
  revenue_amount: number | null;
  budget_total: number | null;
  budget_materials: number | null;
  budget_labor: number | null;
  budget_subcontracts: number | null;
  budget_overhead: number | null;
  budget_transport: number | null;
  budget_other: number | null;
  actual_materials: number;
  actual_labor: number;
  actual_subcontracts: number;
  actual_overhead: number;
  actual_transport: number;
  actual_other: number;
  actual_total: number;
  pct_consumed: number;
  actual_margin_pct: number;
  actual_margin: number;
  alert_threshold_percent: number | null;
  alert_critical_percent: number | null;
}

export interface ProjectLaborAssignment {
  id: string;
  tenant_id: string;
  project_id: string;
  profile_id: string;
  planned_hours: number;
  hourly_cost_snapshot: number;
  total_cost: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profile?: { full_name: string } | null;
}

// ========================================
// Stock Management
// ========================================

export interface StockItem {
  id: string;
  tenant_id: string;
  name: string;
  reference: string | null;
  unit: string;
  unit_cost: number;
  current_stock: number;
  min_stock: number;
  category: string | null;
  supplier_id: string | null;
  supplier?: { name: string };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockConsumption {
  id: string;
  tenant_id: string;
  stock_item_id: string;
  stock_item?: StockItem;
  project_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  date: string;
  notes: string | null;
  consumed_by: string | null;
  cost_entry_id: string | null;
  created_at: string;
}

export interface POThreeWayMatch {
  po_line_id: string;
  tenant_id: string;
  purchase_order_id: string;
  po_number: string;
  project_id: string;
  supplier_id: string;
  description: string;
  quantity_ordered: number;
  po_unit_price: number;
  po_line_total: number;
  total_received: number;
  total_rejected: number;
  total_invoiced_qty: number;
  total_invoiced_amount: number;
  match_status: 'pendiente' | 'coincide' | 'discrepancia';
}

export interface SupplierBalance {
  supplier_id: string;
  tenant_id: string;
  supplier_name: string;
  supplier_code: string;
  total_ordered: number;
  total_invoiced: number;
  total_paid: number;
  total_pending: number;
  total_overdue: number;
}

// ========================================
// Financial Control - Fixed Costs & Utilities
// ========================================

export type FixedCostCategory = 'coste_fijo' | 'utilidad';

export type FixedCostSubcategory =
  | 'alquiler' | 'mano_obra_fija' | 'seguros' | 'amortizaciones' | 'cuotas' | 'otros_fijos'
  | 'agua' | 'electricidad' | 'gas' | 'internet_telecomunicaciones' | 'limpieza' | 'otros_utilidades';

export interface FixedCostDefinition {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: FixedCostCategory;
  subcategory: FixedCostSubcategory;
  amount: number;
  is_recurring: boolean;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================================
// Gantt Colors
// ========================================

export interface GanttColors {
  id: string;
  tenant_id: string;
  color_completed: string;
  color_in_progress: string;
  color_not_started: string;
  color_delayed: string;
}

export interface FixedCostEntry {
  id: string;
  tenant_id: string;
  definition_id: string | null;
  name: string;
  category: FixedCostCategory;
  subcategory: FixedCostSubcategory;
  period_year: number;
  period_month: number;
  amount: number;
  is_paid: boolean;
  paid_date: string | null;
  source: 'auto' | 'manual';
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================================
// Measurements (Mediciones en Campo)
// ========================================

export type MeasurementStatus = "borrador" | "completado" | "en_revision" | "aprobado" | "rechazado";
export type MeasurementPointType = "linear" | "diagonal" | "depth" | "angle";
export type WallPosition = "top" | "bottom" | "left" | "right" | "diagonal_tl_br" | "diagonal_tr_bl" | "depth";
export type MeasurementValueSource = "manual" | "bluetooth" | "ai_estimated";
export type MeasurementValidationStatus = "pending" | "ok" | "warning" | "error";
export type MeasurementPointOrigin = "manual" | "ai_detected";
export type AIDetectionStatus = "none" | "processing" | "completed" | "failed";

export interface MeasurementSession {
  id: string;
  tenant_id: string;
  session_number: string;
  project_id: string;
  project?: Project;
  subproject_id: string | null;
  subproject?: Subproject;
  work_order_id: string | null;
  work_order?: WorkOrder;
  order_item_id: string | null;
  order_item?: OrderItem;
  measured_by: string;
  measured_by_profile?: Pick<Profile, "id" | "full_name">;
  measurement_date: string;
  room_name: string | null;
  location_address: string | null;
  temperature_celsius: number | null;
  humidity_percent: number | null;
  bt_device_name: string | null;
  bt_device_model: string | null;
  status: MeasurementStatus;
  total_points: number;
  warnings_count: number;
  errors_count: number;
  notes: string | null;
  started_at: string | null;
  ended_at: string | null;
  exited_with_missing_cotas: boolean;
  latitude: number | null;
  longitude: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  photos?: MeasurementPhoto[];
}

export interface MeasurementPhoto {
  id: string;
  tenant_id: string;
  session_id: string;
  url: string;
  storage_path: string;
  filename: string;
  sort_order: number;
  width_px: number | null;
  height_px: number | null;
  calibration_length_mm: number | null;
  calibration_px: number | null;
  ai_detection_status: AIDetectionStatus;
  ai_detection_result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  points?: MeasurementPoint[];
  comments?: MeasurementComment[];
}

export interface MeasurementPoint {
  id: string;
  tenant_id: string;
  photo_id: string;
  session_id: string;
  label: string;
  point_type: MeasurementPointType;
  wall_position: WallPosition | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  value_mm: number | null;
  value_source: MeasurementValueSource;
  tolerance_mm: number;
  validation_status: MeasurementValidationStatus;
  validation_message: string | null;
  origin: MeasurementPointOrigin;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MeasurementTemplatePoint {
  label: string;
  wall_position: WallPosition;
  point_type: MeasurementPointType;
  min_mm: number;
  max_mm: number;
}

export interface MeasurementValidationRule {
  type: "max_diff" | "diagonal_check" | "pythagorean_check";
  point_a_position: WallPosition;
  point_b_position: WallPosition;
  warning_threshold_mm: number;
  error_threshold_mm: number;
}

export interface MeasurementTemplate {
  id: string;
  tenant_id: string;
  product_type_id: string | null;
  name: string;
  description: string | null;
  required_points: MeasurementTemplatePoint[];
  validation_rules: MeasurementValidationRule[];
  tolerance_mm: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CommentIcon = "none" | "warning" | "danger" | "info" | "check";
export type CommentFontStyle = "normal" | "bold" | "italic";
export type CommentFontSize = "small" | "medium" | "large";

export interface MeasurementComment {
  id: string;
  tenant_id: string;
  photo_id: string;
  session_id: string;
  x: number;
  y: number;
  text: string;
  icon: CommentIcon;
  font_style: CommentFontStyle;
  font_size: CommentFontSize;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BtDeviceRegistry {
  id: string;
  tenant_id: string;
  device_name: string;
  device_model: string | null;
  manufacturer: string | null;
  service_uuid: string | null;
  last_connected_by: string | null;
  last_connected_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ========================================
// Maestro de Materiales (shared with rt.sig)
// ========================================

export type PrecioType = "labor" | "material" | "herramienta" | "componente";

export type MaterialStatus = "activo" | "descatalogado" | "agotado";

export interface PrecioEmpresa {
  id: string;
  tenant_id: string;
  type: PrecioType;
  capitulo: string;
  partida: string | null;
  subpartida: string | null;
  subsubpartida: string | null;
  capitulo_old: string | null;
  code: string | null;
  description: string;
  unit: string;
  unit_price: number;
  supplier: string | null;
  brand: string | null;
  model: string | null;
  color_hex: string | null;
  color_name: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  images: Record<string, unknown>[] | null;
  pattern: string | null;
  tier: string | null;
  units_per_box: number | null;
  reference_code: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
  sku: string | null;
  ean: string | null;
  purchase_price: number | null;
  supplier_discount: number;
  lead_time_days: number | null;
  min_order_qty: number | null;
  waste_percent: number;
  stock_current: number;
  stock_committed: number;
  stock_disponible: number;
  stock_min: number;
  dimensions: string | null;
  weight_per_unit: number | null;
  location: string | null;
  datasheet_url: string | null;
  status: MaterialStatus;
  tags: string[] | null;
  is_favorite: boolean;
  is_generic: boolean;
  price_updated_at: string | null;
  proveedor_id: string | null;
  fab_supplier_id: string | null;
  generic_supplier_ids: string[] | null;
  alternative_id: string | null;
  alcance: string | null;
  competitor_price: number | null;
  product_parts: number | null;
  supplier_description: string | null;
  supplier_reference: string | null;
  units_per_order: number | null;
  packaging_unit: string | null;
  box_width: number | null;
  box_height: number | null;
  box_length: number | null;
  packaging_barcode: string | null;
  tariff_percent: number | null;
  tariff_cost: number | null;
  transport_cost: number | null;
  total_landed_cost: number | null;
  accounting_code: string | null;
  is_invisible_pv: boolean;
  is_componente: boolean;
  materials: string | null;
  presupuestador_categories: string[];
  custom_fields: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface MaestroCategoria {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  level: number;
  name: string;
  is_active: boolean;
  sort_order: number;
  presupuestador_categories: string[];
  default_waste_percent: number | null;
  created_at: string;
  updated_at: string;
}

export interface MaestroUnit {
  id: string;
  tenant_id: string;
  code: string;
  label: string;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type MaestroCustomFieldType = 'text' | 'number' | 'boolean' | 'tags' | 'select' | 'date' | 'textarea' | 'email' | 'phone';

export interface MaestroCustomField {
  id: string;
  tenant_id: string;
  name: string;
  field_key: string;
  field_type: MaestroCustomFieldType;
  options: string[] | null;
  form_section: string;
  applicable_types: PrecioType[];
  applicable_capitulos: string[];
  applicable_partidas: string[];
  applicable_subpartidas: string[];
  applicable_subsubpartidas: string[];
  sort_order: number;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaestroFieldConfig {
  id: string;
  tenant_id: string;
  precio_type: PrecioType;
  field_key: string;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PrecioPredecesora {
  id: string;
  tenant_id: string;
  precio_empresa_id: string;
  name: string;
  lead_time_days: number;
  duration_days: number;
  sort_order: number;
  created_at: string;
}

export type StockMovementType = "entrada" | "salida" | "ajuste" | "reserva" | "cancelacion_reserva" | "consumo";

export interface StockMovement {
  id: string;
  tenant_id: string;
  material_id: string;
  proyecto_id: string | null;
  pedido_id: string | null;
  type: StockMovementType;
  quantity: number;
  unit_price: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PriceHistory {
  id: string;
  tenant_id: string;
  material_id: string;
  field: string;
  old_value: number | null;
  new_value: number | null;
  changed_by: string | null;
  created_at: string;
}

export interface Proveedor {
  id: string;
  tenant_id: string;
  nombre: string;
  razon_social: string | null;
  cif: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  codigo_postal: string | null;
  provincia: string | null;
  especialidad: string | null;
  notas: string | null;
  website: string | null;
  condiciones_pago: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  valoracion: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PresupuestadorCategoryDef {
  id: string;
  tenant_id: string;
  value: string;
  label: string;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  section_type: 'surface' | 'equipment';
  applies_to: string[];
  unit: string;
  qty_formula: string | null;
  icon_name: string | null;
  created_at: string;
  updated_at: string;
}

// ========================================
// Herramientas
// ========================================

export type HerramientaStatus =
  | "disponible"
  | "en_uso"
  | "en_reparacion"
  | "en_calibracion"
  | "dado_de_baja"
  | "perdida";

export type TraspasoEstadoEntrega = "bueno" | "aceptable" | "danado" | "reparacion_necesaria";
export type MantenimientoTipo = "preventivo" | "correctivo" | "calibracion" | "revision";

export interface Herramienta {
  id: string;
  tenant_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  serial_number: string | null;
  internal_code: string | null;
  category: string;
  subcategory: string | null;
  brand: string | null;
  model: string | null;
  purchase_price: number;
  purchase_date: string | null;
  proveedor_id: string | null;
  factura_compra_url: string | null;
  unidad_negocio_id: string | null;
  status: HerramientaStatus;
  ubicacion: string | null;
  proyecto_id: string | null;
  responsable_id: string | null;
  vida_util_meses: number;
  valor_residual: number;
  fecha_alta: string | null;
  fecha_baja: string | null;
  metodo_amortizacion: string;
  warranty_end_date: string | null;
  warranty_provider: string | null;
  warranty_notes: string | null;
  insurance_policy: string | null;
  insurance_end_date: string | null;
  requires_calibration: boolean;
  calibration_interval_days: number | null;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  calibration_certificate_url: string | null;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  maintenance_interval_days: number | null;
  image_url: string | null;
  images: string[];
  notes: string | null;
  tags: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  amortizacion_mensual?: number;
  meses_transcurridos?: number;
  amortizacion_acumulada?: number;
  valor_neto_contable?: number;
  unidad_negocio_nombre?: string;
  proveedor_nombre?: string;
  responsable_nombre?: string;
  proyecto_nombre?: string;
}

export interface HerramientaTraspaso {
  id: string;
  tenant_id: string;
  herramienta_id: string;
  entregado_por: string | null;
  recibido_por: string | null;
  proyecto_origen_id: string | null;
  proyecto_destino_id: string | null;
  ubicacion_origen: string | null;
  ubicacion_destino: string | null;
  estado_entrega: TraspasoEstadoEntrega;
  observaciones: string | null;
  fotos_entrega: string[];
  fotos_recepcion: string[];
  fecha_entrega: string;
  fecha_recepcion: string | null;
  confirmado: boolean;
  created_at: string;
  entregado_por_nombre?: string;
  recibido_por_nombre?: string;
  proyecto_origen_nombre?: string;
  proyecto_destino_nombre?: string;
  herramienta_nombre?: string;
}

export interface HerramientaMantenimiento {
  id: string;
  tenant_id: string;
  herramienta_id: string;
  tipo: MantenimientoTipo;
  descripcion: string;
  coste: number;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  resultado: string | null;
  certificado_url: string | null;
  fotos: string[];
  realizado_por: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  realizado_por_nombre?: string;
}

// ========================================
// Cutting Optimizer
// ========================================

export interface CuttingPlan {
  id: string;
  tenant_id: string;
  work_order_id: string | null;
  project_id: string | null;
  name: string;
  material_name: string;
  thickness_mm: number;
  board_width_mm: number;
  board_height_mm: number;
  kerf_mm: number;
  trim_mm: number;
  min_remnant_mm: number;
  total_boards: number;
  avg_utilization: number;
  result_json: Record<string, unknown>;
  status: "draft" | "confirmed" | "cut";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================================
// Machine Configs & CNC
// ========================================

export type CncMachineType = "beam_saw" | "cnc_router" | "edge_bander";

export interface MachineConfigRow {
  id: string;
  tenant_id: string;
  work_center_id: string | null;
  machine_type: CncMachineType;
  brand: string | null;
  model: string | null;
  output_format: string;
  config: Record<string, any>;
  is_default: boolean;
  created_at: string;
}

export type CncOperationType = "drilling" | "routing" | "grooving" | "pocketing";

export interface CncOperationRow {
  id: string;
  tenant_id: string;
  bom_item_id: string;
  operation_type: CncOperationType;
  sort_order: number;
  pos_x: number | null;
  pos_y: number | null;
  diameter: number | null;
  depth: number | null;
  tool_diameter: number | null;
  cut_depth: number | null;
  feed_rate: number | null;
  spindle_rpm: number | null;
  path_segments: Record<string, unknown>[];
  pocket_shape: string | null;
  pocket_width: number | null;
  pocket_height: number | null;
  stepover_percent: number;
  created_at: string;
}

export interface EdgeBandDetailRow {
  id: string;
  tenant_id: string;
  bom_item_id: string;
  side: "L1" | "L2" | "L3" | "L4";
  material: string;
  thickness_mm: number;
  width_mm: number | null;
}

export interface GeneratedProgramRow {
  id: string;
  tenant_id: string;
  work_order_id: string | null;
  bom_item_id: string | null;
  machine_config_id: string | null;
  program_type: "beam_saw" | "cnc" | "edge_bander";
  filename: string;
  file_content: string;
  file_url: string | null;
  generated_by: string | null;
  generated_at: string;
  metadata: Record<string, any>;
}

// ========================================
// Furniture Designer
// ========================================

export interface FurnitureDesignRow {
  id: string;
  tenant_id: string;
  work_order_id: string | null;
  project_id: string | null;
  name: string;
  status: "draft" | "approved" | "archived";
  design_data: Record<string, unknown>;
  design_schema_version: number;
  furniture_type: string | null;
  total_width_mm: number | null;
  total_height_mm: number | null;
  total_depth_mm: number | null;
  piece_count: number;
  thumbnail_url: string | null;
  is_template: boolean;
  template_category: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HardwareCatalogRow {
  id: string;
  tenant_id: string;
  name: string;
  category: string;
  reference: string | null;
  unit_cost: number;
  compatible_with: string[];
  default_quantity_formula: string | null;
  is_active: boolean;
  created_at: string;
}
