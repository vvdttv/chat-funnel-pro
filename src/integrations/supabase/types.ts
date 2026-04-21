export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      deal_stage_events: {
        Row: {
          deal_id: string
          entered_at: string
          from_stage_id: string | null
          funnel_id: string
          id: string
          organization_id: string
          to_stage_id: string
        }
        Insert: {
          deal_id: string
          entered_at?: string
          from_stage_id?: string | null
          funnel_id: string
          id?: string
          organization_id: string
          to_stage_id: string
        }
        Update: {
          deal_id?: string
          entered_at?: string
          from_stage_id?: string | null
          funnel_id?: string
          id?: string
          organization_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_status_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          deal_id: string
          from_status: string | null
          id: string
          lost_substage: string | null
          organization_id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          deal_id: string
          from_status?: string | null
          id?: string
          lost_substage?: string | null
          organization_id: string
          reason?: string | null
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          deal_id?: string
          from_status?: string | null
          id?: string
          lost_substage?: string | null
          organization_id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_status_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          assigned_to: string | null
          created_at: string
          funnel_id: string
          id: string
          lead_id: string
          lead_name: string
          lost_substage: string | null
          organization_id: string
          property: string
          property_code: string
          secondary_contacts: Json
          stage_id: string
          status: string
          status_changed_at: string
          status_reason: string | null
          updated_at: string
          value: number
          won_date: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          funnel_id: string
          id: string
          lead_id: string
          lead_name: string
          lost_substage?: string | null
          organization_id: string
          property?: string
          property_code?: string
          secondary_contacts?: Json
          stage_id: string
          status?: string
          status_changed_at?: string
          status_reason?: string | null
          updated_at?: string
          value?: number
          won_date?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          funnel_id?: string
          id?: string
          lead_id?: string
          lead_name?: string
          lost_substage?: string | null
          organization_id?: string
          property?: string
          property_code?: string
          secondary_contacts?: Json
          stage_id?: string
          status?: string
          status_changed_at?: string
          status_reason?: string | null
          updated_at?: string
          value?: number
          won_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_ladders: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          steps: Json
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_ladders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stages: {
        Row: {
          context_tags: Json
          created_at: string
          funnel_id: string
          id: string
          organization_id: string
          position: number
          purpose: string
          stage_archetype_id: string | null
          stage_id: string
          updated_at: string
        }
        Insert: {
          context_tags?: Json
          created_at?: string
          funnel_id: string
          id?: string
          organization_id: string
          position?: number
          purpose?: string
          stage_archetype_id?: string | null
          stage_id: string
          updated_at?: string
        }
        Update: {
          context_tags?: Json
          created_at?: string
          funnel_id?: string
          id?: string
          organization_id?: string
          position?: number
          purpose?: string
          stage_archetype_id?: string | null
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stages_stage_archetype_id_fkey"
            columns: ["stage_archetype_id"]
            isOneToOne: false
            referencedRelation: "stage_archetypes"
            referencedColumns: ["id"]
          },
        ]
      }
      funnels: {
        Row: {
          color: string
          context_tags: Json
          created_at: string
          description: string
          icon: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          position: number
          stages: Json
          updated_at: string
        }
        Insert: {
          color?: string
          context_tags?: Json
          created_at?: string
          description?: string
          icon?: string
          id: string
          is_default?: boolean
          name: string
          organization_id: string
          position?: number
          stages?: Json
          updated_at?: string
        }
        Update: {
          color?: string
          context_tags?: Json
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          position?: number
          stages?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      handoff_triggers: {
        Row: {
          action: string
          code: string
          condition: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          organization_id: string
          priority: Database["public"]["Enums"]["handoff_priority"]
          stage: string
          updated_at: string
        }
        Insert: {
          action?: string
          code: string
          condition?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          organization_id: string
          priority?: Database["public"]["Enums"]["handoff_priority"]
          stage: string
          updated_at?: string
        }
        Update: {
          action?: string
          code?: string
          condition?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["handoff_priority"]
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "handoff_triggers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_decision_logs: {
        Row: {
          action_taken: string
          applied_rule_codes: Json
          context: Json
          created_at: string
          deal_id: string | null
          detected_behavior_codes: Json
          funnel_id: string | null
          id: string
          intent: string | null
          organization_id: string
          outcome: string | null
          playbook_code: string | null
          stage_id: string | null
          tone: string | null
        }
        Insert: {
          action_taken?: string
          applied_rule_codes?: Json
          context?: Json
          created_at?: string
          deal_id?: string | null
          detected_behavior_codes?: Json
          funnel_id?: string | null
          id?: string
          intent?: string | null
          organization_id: string
          outcome?: string | null
          playbook_code?: string | null
          stage_id?: string | null
          tone?: string | null
        }
        Update: {
          action_taken?: string
          applied_rule_codes?: Json
          context?: Json
          created_at?: string
          deal_id?: string | null
          detected_behavior_codes?: Json
          funnel_id?: string | null
          id?: string
          intent?: string | null
          organization_id?: string
          outcome?: string | null
          playbook_code?: string | null
          stage_id?: string | null
          tone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_decision_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_rules: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          meta: string | null
          organization_id: string
          position: number
          scope: string
          text: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          meta?: string | null
          organization_id: string
          position?: number
          scope: string
          text: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          meta?: string | null
          organization_id?: string
          position?: number
          scope?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_behaviors: {
        Row: {
          applicable_context_tags: Json
          applicable_statuses: Json
          category: string
          code: string
          created_at: string
          default_reaction: string
          detection_hints: Json
          id: string
          is_active: boolean
          label: string
          next_step: string
          organization_id: string
          typical_stages: Json
          updated_at: string
        }
        Insert: {
          applicable_context_tags?: Json
          applicable_statuses?: Json
          category: string
          code: string
          created_at?: string
          default_reaction?: string
          detection_hints?: Json
          id?: string
          is_active?: boolean
          label: string
          next_step?: string
          organization_id: string
          typical_stages?: Json
          updated_at?: string
        }
        Update: {
          applicable_context_tags?: Json
          applicable_statuses?: Json
          category?: string
          code?: string
          created_at?: string
          default_reaction?: string
          detection_hints?: Json
          id?: string
          is_active?: boolean
          label?: string
          next_step?: string
          organization_id?: string
          typical_stages?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_behaviors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      password_reset_attempts: {
        Row: {
          attempted_at: string
          id: string
          success: boolean
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          success?: boolean
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      playbook_overrides: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          layer: string
          organization_id: string
          payload: Json
          scope_id: string
          scope_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          layer: string
          organization_id: string
          payload?: Json
          scope_id: string
          scope_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          layer?: string
          organization_id?: string
          payload?: Json
          scope_id?: string
          scope_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          organization_id: string
          security_answer_hash: string | null
          security_question: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id: string
          security_answer_hash?: string | null
          security_question?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id?: string
          security_answer_hash?: string | null
          security_question?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_archetypes: {
        Row: {
          code: string
          context_tags: Json
          created_at: string
          default_playbook_code: string | null
          id: string
          is_active: boolean
          name: string
          position: number
          purpose: string
          updated_at: string
        }
        Insert: {
          code: string
          context_tags?: Json
          created_at?: string
          default_playbook_code?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
          purpose?: string
          updated_at?: string
        }
        Update: {
          code?: string
          context_tags?: Json
          created_at?: string
          default_playbook_code?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          purpose?: string
          updated_at?: string
        }
        Relationships: []
      }
      stage_playbooks: {
        Row: {
          archetype_id: string | null
          code: string
          created_at: string
          default_ladder_code: string | null
          failure_criteria: Json
          goal: string
          id: string
          identity: Json
          is_active: boolean
          kind: string
          name: string
          organization_id: string
          status_archetype_id: string | null
          success_criteria: Json
          typical_behavior_codes: Json
          updated_at: string
        }
        Insert: {
          archetype_id?: string | null
          code: string
          created_at?: string
          default_ladder_code?: string | null
          failure_criteria?: Json
          goal?: string
          id?: string
          identity?: Json
          is_active?: boolean
          kind?: string
          name: string
          organization_id: string
          status_archetype_id?: string | null
          success_criteria?: Json
          typical_behavior_codes?: Json
          updated_at?: string
        }
        Update: {
          archetype_id?: string | null
          code?: string
          created_at?: string
          default_ladder_code?: string | null
          failure_criteria?: Json
          goal?: string
          id?: string
          identity?: Json
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string
          status_archetype_id?: string | null
          success_criteria?: Json
          typical_behavior_codes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_playbooks_archetype_id_fkey"
            columns: ["archetype_id"]
            isOneToOne: false
            referencedRelation: "stage_archetypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_playbooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_playbooks_status_archetype_id_fkey"
            columns: ["status_archetype_id"]
            isOneToOne: false
            referencedRelation: "status_archetypes"
            referencedColumns: ["id"]
          },
        ]
      }
      status_archetypes: {
        Row: {
          code: string
          created_at: string
          default_overlay_rules: Json
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_overlay_rules?: Json
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_overlay_rules?: Json
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_id: { Args: never; Returns: string }
      get_stage_metrics: {
        Args: { p_funnel_id: string; p_stage_id: string }
        Returns: {
          advance_probability: number
          avg_days_to_advance: number
          avg_days_to_close: number
          close_probability: number
          deal_count: number
          total_value: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "corretor"
      handoff_priority: "P0" | "P1" | "P2" | "P3"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "corretor"],
      handoff_priority: ["P0", "P1", "P2", "P3"],
    },
  },
} as const
