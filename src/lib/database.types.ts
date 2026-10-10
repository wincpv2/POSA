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
      audit_log: {
        Row: {
          action: string
          clinician_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string | null
          id: number
          metadata: Json | null
          patient_id: string | null
        }
        Insert: {
          action: string
          clinician_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: never
          metadata?: Json | null
          patient_id?: string | null
        }
        Update: {
          action?: string
          clinician_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: never
          metadata?: Json | null
          patient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinician_patients: {
        Row: {
          added_at: string
          clinician_id: string
          deleted_at: string | null
          id: string
          notes: string | null
          patient_id: string
          subject_code: string
        }
        Insert: {
          added_at?: string
          clinician_id: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          subject_code: string
        }
        Update: {
          added_at?: string
          clinician_id?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          subject_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinician_patients_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinician_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      ecg_symptom_events: {
        Row: {
          created_at: string
          created_by: string
          ecg_upload_id: string
          id: string
          occurred_at_seconds: number
          symptoms: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string
          ecg_upload_id: string
          id?: string
          occurred_at_seconds: number
          symptoms: string[]
        }
        Update: {
          created_at?: string
          created_by?: string
          ecg_upload_id?: string
          id?: string
          occurred_at_seconds?: number
          symptoms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ecg_symptom_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecg_symptom_events_ecg_upload_id_fkey"
            columns: ["ecg_upload_id"]
            isOneToOne: false
            referencedRelation: "ecg_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      ecg_uploads: {
        Row: {
          age_years: number | null
          clinician_id: string
          created_at: string
          deleted_at: string | null
          device_brand: string | null
          duration_seconds: number | null
          id: string
          lead_configuration: string | null
          original_filename: string | null
          patient_id: string
          record_code: string | null
          recorded_at: string | null
          sampling_rate_hz: number | null
          status: string
          storage_path: string
        }
        Insert: {
          age_years?: number | null
          clinician_id: string
          created_at?: string
          deleted_at?: string | null
          device_brand?: string | null
          duration_seconds?: number | null
          id?: string
          lead_configuration?: string | null
          original_filename?: string | null
          patient_id: string
          record_code?: string | null
          recorded_at?: string | null
          sampling_rate_hz?: number | null
          status?: string
          storage_path: string
        }
        Update: {
          age_years?: number | null
          clinician_id?: string
          created_at?: string
          deleted_at?: string | null
          device_brand?: string | null
          duration_seconds?: number | null
          id?: string
          lead_configuration?: string | null
          original_filename?: string | null
          patient_id?: string
          record_code?: string | null
          recorded_at?: string | null
          sampling_rate_hz?: number | null
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecg_uploads_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecg_uploads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          artifact_path: string | null
          created_at: string
          id: string
          is_active: boolean
          metrics: Json | null
          model_type: string
          name: string
          version: string
        }
        Insert: {
          artifact_path?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metrics?: Json | null
          model_type: string
          name: string
          version: string
        }
        Update: {
          artifact_path?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metrics?: Json | null
          model_type?: string
          name?: string
          version?: string
        }
        Relationships: []
      }
      patient_share_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          patient_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          patient_id: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          patient_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_share_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          bmi: number | null
          created_at: string
          date_of_birth: string | null
          id: string
          owner_clinician_id: string | null
          sex: string | null
        }
        Insert: {
          bmi?: number | null
          created_at?: string
          date_of_birth?: string | null
          id?: string
          owner_clinician_id?: string | null
          sex?: string | null
        }
        Update: {
          bmi?: number | null
          created_at?: string
          date_of_birth?: string | null
          id?: string
          owner_clinician_id?: string | null
          sex?: string | null
        }
        Relationships: []
      }
      prediction_minutes: {
        Row: {
          apnea_probability: number
          is_apnea: boolean
          minute_index: number
          run_id: string
        }
        Insert: {
          apnea_probability: number
          is_apnea: boolean
          minute_index: number
          run_id: string
        }
        Update: {
          apnea_probability?: number
          is_apnea?: boolean
          minute_index?: number
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_minutes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "prediction_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_runs: {
        Row: {
          apnea_minutes: number | null
          apnea_percent: number | null
          completed_at: string | null
          created_at: string
          ecg_upload_id: string
          error_message: string | null
          id: string
          model_id: string
          progress_percent: number
          started_at: string | null
          status: string
          total_minutes: number | null
          summary_status: string
          summary_progress_percent: number
          summary_stage: string | null
          summary_error_message: string | null
          summary_updated_at: string | null
          summary_result: Json | null
        }
        Insert: {
          apnea_minutes?: number | null
          apnea_percent?: number | null
          completed_at?: string | null
          created_at?: string
          ecg_upload_id: string
          error_message?: string | null
          id?: string
          model_id: string
          progress_percent?: number
          started_at?: string | null
          status?: string
          total_minutes?: number | null
          summary_status?: string
          summary_progress_percent?: number
          summary_stage?: string | null
          summary_error_message?: string | null
          summary_updated_at?: string | null
          summary_result?: Json | null
        }
        Update: {
          apnea_minutes?: number | null
          apnea_percent?: number | null
          completed_at?: string | null
          created_at?: string
          ecg_upload_id?: string
          error_message?: string | null
          id?: string
          model_id?: string
          progress_percent?: number
          started_at?: string | null
          status?: string
          total_minutes?: number | null
          summary_status?: string
          summary_progress_percent?: number
          summary_stage?: string | null
          summary_error_message?: string | null
          summary_updated_at?: string | null
          summary_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_runs_ecg_upload_id_fkey"
            columns: ["ecg_upload_id"]
            isOneToOne: false
            referencedRelation: "ecg_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_runs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          consent_accepted: boolean
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          consent_accepted?: boolean
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          consent_accepted?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      report_pdfs: {
        Row: {
          approved_at: string
          approved_by_name: string | null
          created_at: string
          created_by: string
          ecg_upload_id: string
          id: string
          storage_path: string
        }
        Insert: {
          approved_at: string
          approved_by_name?: string | null
          created_at?: string
          created_by: string
          ecg_upload_id: string
          id?: string
          storage_path: string
        }
        Update: {
          approved_at?: string
          approved_by_name?: string | null
          created_at?: string
          created_by?: string
          ecg_upload_id?: string
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_pdfs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_pdfs_ecg_upload_id_fkey"
            columns: ["ecg_upload_id"]
            isOneToOne: false
            referencedRelation: "ecg_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      study_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          clinician_opinion: string
          ecg_upload_id: string
          patient_explanation: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          clinician_opinion?: string
          ecg_upload_id: string
          patient_explanation?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          clinician_opinion?: string
          ecg_upload_id?: string
          patient_explanation?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_reports_ecg_upload_id_fkey"
            columns: ["ecg_upload_id"]
            isOneToOne: true
            referencedRelation: "ecg_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_reports_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_share_links: {
        Row: {
          created_at: string
          created_by: string
          ecg_upload_id: string
          expires_at: string
          id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ecg_upload_id: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ecg_upload_id?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_share_links_ecg_upload_id_fkey"
            columns: ["ecg_upload_id"]
            isOneToOne: false
            referencedRelation: "ecg_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_display_name: { Args: { p_user: string }; Returns: string }
      get_visible_study_owner_names: {
        Args: { p_upload_ids: string[] }
        Returns: { clinician_id: string; display_name: string }[]
      }
      get_deletion_log: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          actor_is_me: boolean
          actor_name: string
          created_at: string
          currently_deleted: boolean
          ecg_upload_id: string
          id: number
          record_code: string
          subject_code: string
        }[]
      }
      get_patient_dashboard: { Args: { p_token: string }; Returns: Json }
      get_shared_study: {
        Args: { p_token: string }
        Returns: {
          apnea_minutes: number
          apnea_percent: number
          approved_at: string
          created_at: string
          expires_at: string
          lead_configuration: string
          patient_explanation: string
          record_code: string
          sampling_rate_hz: number
          subject_code: string | null
          status: string
          total_minutes: number
        }[]
      }
      get_patient_report_pdf: {
        Args: { p_kind: string; p_token: string }
        Returns: { record_code: string | null; storage_path: string }[]
      }
      hook_restrict_signup_domain: { Args: { event: Json }; Returns: Json }
      restore_ecg_upload: { Args: { p_upload_id: string }; Returns: boolean }
      soft_delete_ecg_upload: {
        Args: { p_upload_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
