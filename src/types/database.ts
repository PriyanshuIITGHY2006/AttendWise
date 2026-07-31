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
      attendance_records: {
        Row: {
          id: string
          marked_at: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          marked_at?: string
          session_id: string
          status: string
          user_id: string
        }
        Update: {
          id?: string
          marked_at?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_log: {
        Row: {
          kind: string
          sent_at: string
          sent_on: string
          user_id: string
        }
        Insert: {
          kind: string
          sent_at?: string
          sent_on?: string
          user_id: string
        }
        Update: {
          kind?: string
          sent_at?: string
          sent_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_events: {
        Row: {
          course_id: string
          created_at: string
          done: boolean
          event_date: string
          event_type: string
          id: string
          max_score: number | null
          notes: string | null
          score: number | null
          title: string
          user_id: string
          weightage: number | null
        }
        Insert: {
          course_id: string
          created_at?: string
          done?: boolean
          event_date: string
          event_type?: string
          id?: string
          max_score?: number | null
          notes?: string | null
          score?: number | null
          title: string
          user_id: string
          weightage?: number | null
        }
        Update: {
          course_id?: string
          created_at?: string
          done?: boolean
          event_date?: string
          event_type?: string
          id?: string
          max_score?: number | null
          notes?: string | null
          score?: number | null
          title?: string
          user_id?: string
          weightage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_schedule: {
        Row: {
          component_type: string
          course_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          room: string | null
          start_time: string
        }
        Insert: {
          component_type?: string
          course_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          room?: string | null
          start_time: string
        }
        Update: {
          component_type?: string
          course_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          room?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_schedule_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_shares: {
        Row: {
          id: string
          course_id: string
          owner_id: string
          shared_with_email: string
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          owner_id: string
          shared_with_email: string
          created_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          owner_id?: string
          shared_with_email?: string
          created_at?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          archived: boolean
          attendance_threshold: number
          code: string | null
          color: string
          course_type: string
          created_at: string
          credits: number | null
          id: string
          instructor: string | null
          name: string
          semester: string
          semester_end: string
          semester_start: string
          strict_no_skip: boolean
          term: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          attendance_threshold?: number
          code?: string | null
          color?: string
          course_type?: string
          created_at?: string
          credits?: number | null
          id?: string
          instructor?: string | null
          name: string
          semester: string
          semester_end: string
          semester_start: string
          strict_no_skip?: boolean
          term?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          attendance_threshold?: number
          code?: string | null
          color?: string
          course_type?: string
          created_at?: string
          credits?: number | null
          id?: string
          instructor?: string | null
          name?: string
          semester?: string
          semester_end?: string
          semester_start?: string
          strict_no_skip?: boolean
          term?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      institute_calendar: {
        Row: {
          audience: string
          created_at: string
          date: string
          day_type: string
          description: string | null
          follows_day_of_week: number | null
          id: string
        }
        Insert: {
          audience?: string
          created_at?: string
          date: string
          day_type?: string
          description?: string | null
          follows_day_of_week?: number | null
          id?: string
        }
        Update: {
          audience?: string
          created_at?: string
          date?: string
          day_type?: string
          description?: string | null
          follows_day_of_week?: number | null
          id?: string
        }
        Relationships: []
      }
      material_access_allowlist: {
        Row: {
          added_at: string
          email: string
        }
        Insert: {
          added_at?: string
          email: string
        }
        Update: {
          added_at?: string
          email?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          category: string
          course_id: string
          created_at: string
          external_link: string | null
          file_path: string | null
          folder_id: string | null
          id: string
          last_opened_at: string | null
          linked_session_id: string | null
          notes: string
          starred: boolean
          tags: string[]
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          course_id: string
          created_at?: string
          external_link?: string | null
          file_path?: string | null
          folder_id?: string | null
          id?: string
          last_opened_at?: string | null
          linked_session_id?: string | null
          notes?: string
          starred?: boolean
          tags?: string[]
          title: string
          user_id: string
        }
        Update: {
          category?: string
          course_id?: string
          created_at?: string
          external_link?: string | null
          file_path?: string | null
          folder_id?: string | null
          id?: string
          last_opened_at?: string | null
          linked_session_id?: string | null
          notes?: string
          starred?: boolean
          tags?: string[]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_linked_session_id_fkey"
            columns: ["linked_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_annotations: {
        Row: {
          id: string
          material_id: string
          user_id: string
          page: number
          x: number
          y: number
          content: string
          color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          material_id: string
          user_id?: string
          page: number
          x: number
          y: number
          content?: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          material_id?: string
          user_id?: string
          page?: number
          x?: number
          y?: number
          content?: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      material_folders: {
        Row: {
          id: string
          user_id: string
          course_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          course_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          course_id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      material_shares: {
        Row: {
          token: string
          material_id: string
          created_by: string
          created_at: string
        }
        Insert: {
          token?: string
          material_id: string
          created_by?: string
          created_at?: string
        }
        Update: {
          token?: string
          material_id?: string
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      pdf_ink: {
        Row: {
          id: string
          material_id: string
          user_id: string
          page: number
          color: string
          width: number
          points: number[][]
          created_at: string
        }
        Insert: {
          id?: string
          material_id: string
          user_id?: string
          page: number
          color?: string
          width?: number
          points: number[][]
          created_at?: string
        }
        Update: {
          id?: string
          material_id?: string
          user_id?: string
          page?: number
          color?: string
          width?: number
          points?: [number, number][]
          created_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          class_reminders: boolean
          course_id: string | null
          created_at: string
          daily_digest: boolean
          daily_digest_time: string
          humor_level: string
          id: string
          lead_time_minutes: number
          muted: boolean
          planned_skip_reminders: boolean
          quiet_end: string | null
          quiet_start: string | null
          quiz_reminders: boolean
          threshold_alerts: boolean
          unmarked_nudges: boolean
          user_id: string
        }
        Insert: {
          class_reminders?: boolean
          course_id?: string | null
          created_at?: string
          daily_digest?: boolean
          daily_digest_time?: string
          humor_level?: string
          id?: string
          lead_time_minutes?: number
          muted?: boolean
          planned_skip_reminders?: boolean
          quiet_end?: string | null
          quiet_start?: string | null
          quiz_reminders?: boolean
          threshold_alerts?: boolean
          unmarked_nudges?: boolean
          user_id: string
        }
        Update: {
          class_reminders?: boolean
          course_id?: string | null
          created_at?: string
          daily_digest?: boolean
          daily_digest_time?: string
          humor_level?: string
          id?: string
          lead_time_minutes?: number
          muted?: boolean
          planned_skip_reminders?: boolean
          quiet_end?: string | null
          quiet_start?: string | null
          quiz_reminders?: boolean
          threshold_alerts?: boolean
          unmarked_nudges?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch: string | null
          created_at: string
          email: string
          full_name: string | null
          has_completed_tour: boolean
          id: string
          is_first_year_ug: boolean
          role: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          has_completed_tour?: boolean
          id: string
          is_first_year_ug?: boolean
          role?: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          has_completed_tour?: boolean
          id?: string
          is_first_year_ug?: boolean
          role?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          component_type: string
          course_id: string
          created_at: string
          end_time: string
          id: string
          schedule_id: string | null
          session_date: string
          start_time: string
          status: string
        }
        Insert: {
          component_type?: string
          course_id: string
          created_at?: string
          end_time: string
          id?: string
          schedule_id?: string | null
          session_date: string
          start_time: string
          status?: string
        }
        Update: {
          component_type?: string
          course_id?: string
          created_at?: string
          end_time?: string
          id?: string
          schedule_id?: string | null
          session_date?: string
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "course_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      am_i_material_allowed: { Args: never; Returns: boolean }
      course_stats_for_user: {
        Args: never
        Returns: {
          course_id: string
          attended: number
          absent: number
          total_sessions: number
          remaining_sessions: number
          planned_future_skips: number
        }[]
      }
      generate_sessions_for_course: {
        Args: { p_course_id: string }
        Returns: undefined
      }
      list_unmarked_past_sessions: {
        Args: never
        Returns: {
          course_color: string
          course_id: string
          course_name: string
          end_time: string
          session_date: string
          session_id: string
          start_time: string
        }[]
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
    Enums: {},
  },
} as const
