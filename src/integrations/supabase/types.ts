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
      activity_types: {
        Row: {
          code: string
          color: string
          created_at: string
          default_duration_min: number
          icon: string
          id: string
          is_active: boolean
          is_system: boolean
          label: string
          organization_id: string
          position: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string
          created_at?: string
          default_duration_min?: number
          icon?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          label: string
          organization_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string
          default_duration_min?: number
          icon?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          label?: string
          organization_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_response_queue: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attempts: number
          autonomy_mode: string
          context: Json
          created_at: string
          deal_id: string
          failure_reason: string | null
          final_response: string | null
          funnel_id: string
          ia_decision_log_id: string | null
          id: string
          lead_channel_id: string | null
          lead_message: string
          organization_id: string
          rejected_reason: string | null
          scheduled_send_at: string | null
          sent_at: string | null
          stage_id: string
          status: string
          suggested_response: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          autonomy_mode: string
          context?: Json
          created_at?: string
          deal_id: string
          failure_reason?: string | null
          final_response?: string | null
          funnel_id: string
          ia_decision_log_id?: string | null
          id?: string
          lead_channel_id?: string | null
          lead_message: string
          organization_id: string
          rejected_reason?: string | null
          scheduled_send_at?: string | null
          sent_at?: string | null
          stage_id: string
          status?: string
          suggested_response?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          autonomy_mode?: string
          context?: Json
          created_at?: string
          deal_id?: string
          failure_reason?: string | null
          final_response?: string | null
          funnel_id?: string
          ia_decision_log_id?: string | null
          id?: string
          lead_channel_id?: string | null
          lead_message?: string
          organization_id?: string
          rejected_reason?: string | null
          scheduled_send_at?: string | null
          sent_at?: string | null
          stage_id?: string
          status?: string
          suggested_response?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_response_queue_lead_channel_id_fkey"
            columns: ["lead_channel_id"]
            isOneToOne: false
            referencedRelation: "lead_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_activities: {
        Row: {
          created_at: string
          created_by: string | null
          deal_id: string
          description: string
          done_at: string | null
          id: string
          next_action_required: boolean
          organization_id: string
          outcome_summary: string
          scheduled_at: string | null
          title: string
          type_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string
          done_at?: string | null
          id?: string
          next_action_required?: boolean
          organization_id: string
          outcome_summary?: string
          scheduled_at?: string | null
          title?: string
          type_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string
          done_at?: string | null
          id?: string
          next_action_required?: boolean
          organization_id?: string
          outcome_summary?: string
          scheduled_at?: string | null
          title?: string
          type_code?: string
          updated_at?: string
        }
        Relationships: []
      }
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
          last_activity_at: string | null
          last_activity_summary: string
          lead_id: string
          lead_name: string
          lost_substage: string | null
          next_action_at: string | null
          next_action_description: string
          next_action_type: string | null
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
          last_activity_at?: string | null
          last_activity_summary?: string
          lead_id: string
          lead_name: string
          lost_substage?: string | null
          next_action_at?: string | null
          next_action_description?: string
          next_action_type?: string | null
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
          last_activity_at?: string | null
          last_activity_summary?: string
          lead_id?: string
          lead_name?: string
          lost_substage?: string | null
          next_action_at?: string | null
          next_action_description?: string
          next_action_type?: string | null
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
          ai_approval_threshold: number
          ai_autonomy_mode: string
          ai_response_delay_seconds: number
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
          ai_approval_threshold?: number
          ai_autonomy_mode?: string
          ai_response_delay_seconds?: number
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
          ai_approval_threshold?: number
          ai_autonomy_mode?: string
          ai_response_delay_seconds?: number
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
      ia_config_prefs: {
        Row: {
          last_format: string | null
          last_polarity: string | null
          last_scope: string | null
          last_scope_ids: Json
          last_tone: string | null
          last_trigger: string | null
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_format?: string | null
          last_polarity?: string | null
          last_scope?: string | null
          last_scope_ids?: Json
          last_tone?: string | null
          last_trigger?: string | null
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_format?: string | null
          last_polarity?: string | null
          last_scope?: string | null
          last_scope_ids?: Json
          last_tone?: string | null
          last_trigger?: string | null
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_config_prefs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_config_sessions: {
        Row: {
          approved_at: string | null
          created_artifacts: Json
          created_at: string
          custom_answers: Json
          custom_questions: Json
          fixed_answers: Json
          generated_plan: Json
          human_summary: string
          id: string
          organization_id: string
          original_message: string
          reverted_at: string | null
          reverted_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          created_artifacts?: Json
          created_at?: string
          custom_answers?: Json
          custom_questions?: Json
          fixed_answers?: Json
          generated_plan?: Json
          human_summary?: string
          id?: string
          organization_id: string
          original_message: string
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          created_artifacts?: Json
          created_at?: string
          custom_answers?: Json
          custom_questions?: Json
          fixed_answers?: Json
          generated_plan?: Json
          human_summary?: string
          id?: string
          organization_id?: string
          original_message?: string
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_config_sessions_organization_id_fkey"
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
          activated_skill_code: string | null
          applied_override_ids: Json
          applied_rule_codes: Json
          archetype_code: string | null
          context: Json
          context_tags: Json
          created_at: string
          deal_id: string | null
          deal_status: string | null
          detected_behavior_codes: Json
          funnel_id: string | null
          id: string
          intent: string | null
          organization_id: string
          outcome: string | null
          playbook_code: string | null
          stage_id: string | null
          status_overlay_code: string | null
          tone: string | null
        }
        Insert: {
          action_taken?: string
          activated_skill_code?: string | null
          applied_override_ids?: Json
          applied_rule_codes?: Json
          archetype_code?: string | null
          context?: Json
          context_tags?: Json
          created_at?: string
          deal_id?: string | null
          deal_status?: string | null
          detected_behavior_codes?: Json
          funnel_id?: string | null
          id?: string
          intent?: string | null
          organization_id: string
          outcome?: string | null
          playbook_code?: string | null
          stage_id?: string | null
          status_overlay_code?: string | null
          tone?: string | null
        }
        Update: {
          action_taken?: string
          activated_skill_code?: string | null
          applied_override_ids?: Json
          applied_rule_codes?: Json
          archetype_code?: string | null
          context?: Json
          context_tags?: Json
          created_at?: string
          deal_id?: string | null
          deal_status?: string | null
          detected_behavior_codes?: Json
          funnel_id?: string | null
          id?: string
          intent?: string | null
          organization_id?: string
          outcome?: string | null
          playbook_code?: string | null
          stage_id?: string | null
          status_overlay_code?: string | null
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
      ia_skill_guardrails: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          rule_code: string
          skill_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          rule_code: string
          skill_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          rule_code?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_skill_guardrails_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "ia_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_skill_nodes: {
        Row: {
          branch_label: string | null
          config: Json
          created_at: string
          id: string
          kind: string
          organization_id: string
          parent_node_id: string | null
          position: number
          position_x: number
          position_y: number
          skill_id: string
          updated_at: string
        }
        Insert: {
          branch_label?: string | null
          config?: Json
          created_at?: string
          id?: string
          kind: string
          organization_id: string
          parent_node_id?: string | null
          position?: number
          position_x?: number
          position_y?: number
          skill_id: string
          updated_at?: string
        }
        Update: {
          branch_label?: string | null
          config?: Json
          created_at?: string
          id?: string
          kind?: string
          organization_id?: string
          parent_node_id?: string | null
          position?: number
          position_x?: number
          position_y?: number
          skill_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_skill_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "ia_skill_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_skill_nodes_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "ia_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_skills: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_auto_suggested: boolean
          name: string
          organization_id: string
          position: number
          scope_id: string | null
          scope_type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_auto_suggested?: boolean
          name: string
          organization_id: string
          position?: number
          scope_id?: string | null
          scope_type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_auto_suggested?: boolean
          name?: string
          organization_id?: string
          position?: number
          scope_id?: string | null
          scope_type?: string
          updated_at?: string
        }
        Relationships: []
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
      lead_channels: {
        Row: {
          channel: string
          created_at: string
          deal_id: string
          display_name: string | null
          external_contact_id: string
          id: string
          is_active: boolean
          metadata: Json
          organization_id: string
          phone_e164: string | null
          provider: string | null
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          deal_id: string
          display_name?: string | null
          external_contact_id: string
          id?: string
          is_active?: boolean
          metadata?: Json
          organization_id: string
          phone_e164?: string | null
          provider?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          deal_id?: string
          display_name?: string | null
          external_contact_id?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          organization_id?: string
          phone_e164?: string | null
          provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_channels_organization_id_fkey"
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
      playbook_override_snapshots: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          layer: string
          note: string | null
          organization_id: string
          override_id: string | null
          payload: Json
          scope_id: string
          scope_type: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          layer: string
          note?: string | null
          organization_id: string
          override_id?: string | null
          payload?: Json
          scope_id: string
          scope_type: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          layer?: string
          note?: string | null
          organization_id?: string
          override_id?: string | null
          payload?: Json
          scope_id?: string
          scope_type?: string
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
      get_pending_tag_suggestions: {
        Args: never
        Returns: {
          assignment_id: number
          deal_id: string
          lead_name: string
          tag_id: number
          tag_name: string
          group_name: string
          confidence: number
          rationale: string
          created_at: string
        }[]
      }
      review_tag_suggestion: {
        Args: { p_assignment_id: number; p_approve: boolean }
        Returns: { assignment_id: number; status: string }[]
      }
      get_pending_ai_responses: {
        Args: never
        Returns: {
          queue_id: string
          deal_id: string
          lead_name: string
          stage_id: string
          lead_message: string
          suggested_response: string
          autonomy_mode: string
          created_at: string
        }[]
      }
      approve_ai_response: {
        Args: { p_queue_id: string; p_edited_text?: string }
        Returns: { queue_id: string; status: string }[]
      }
      reject_ai_response: {
        Args: { p_queue_id: string; p_reason?: string }
        Returns: { queue_id: string; status: string }[]
      }
      change_deal_status: {
        Args: {
          p_deal_id: string
          p_lost_substage?: string
          p_new_status: string
          p_reason?: string
        }
        Returns: {
          changed_at: string
          deal_id: string
          from_status: string
          to_status: string
        }[]
      }
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
      move_deal_stage: {
        Args: { p_deal_id: string; p_new_stage_id: string; p_reason?: string }
        Returns: {
          deal_id: string
          from_stage_id: string
          moved_at: string
          to_stage_id: string
        }[]
      }
      resolve_deal_activity: {
        Args: {
          p_archive?: boolean
          p_deal_id: string
          p_done_activity_id: string
          p_loss_reason?: string
          p_new_stage_id?: string
          p_new_status?: string
          p_next_description: string
          p_next_scheduled_at: string
          p_next_type_code: string
          p_outcome_summary: string
        }
        Returns: string
      }
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
