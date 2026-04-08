"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasPermission, isSystemRole, type Permission } from "@/lib/permissions";
import type { Profile, Tenant, CustomRoleConfig } from "@/lib/types";

export function useTenant() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [customRoleConfig, setCustomRoleConfig] = useState<CustomRoleConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData as Profile);

        if (profileData.tenant_id) {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("id, name, slug, logo_url, cif, razon_social, direccion_fiscal, codigo_postal, ciudad, provincia, pais, phone, email, plan, brand_primary, brand_secondary, brand_accent, ss_percent, created_at")
            .eq("id", profileData.tenant_id)
            .single();

          if (tenantData) {
            setTenant(tenantData as Tenant);
          }

          // Si el rol NO es de sistema, cargar config custom de fab_custom_roles
          if (!isSystemRole(profileData.role)) {
            const { data: roleData } = await supabase
              .from("fab_custom_roles")
              .select("id, slug, label, description, color, permissions, sidebar_keys, tab_keys, is_default, is_active, position")
              .eq("tenant_id", profileData.tenant_id)
              .eq("slug", profileData.role)
              .eq("is_active", true)
              .single();

            if (roleData) {
              setCustomRoleConfig(roleData as CustomRoleConfig);
            }
          }
        }
      }

      setLoading(false);
    }

    load();
  }, []);

  const can = useCallback((permission: Permission) => {
    if (!profile) return false;
    const customPerms = customRoleConfig?.permissions;
    return hasPermission(profile.role, permission, customPerms);
  }, [profile, customRoleConfig]);

  return { profile, tenant, loading, can, customRoleConfig };
}
