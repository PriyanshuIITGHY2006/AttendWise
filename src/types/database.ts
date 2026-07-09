export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      courses: {
        Row: {
          archived: boolean
          attendance_threshold: number
          code: string | null
          color: string
          created_at: string
          id: string
          instructor: string | null
          name: string
          semester: string
          semester_end: string
          semester_start: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          attendance_threshold?: number
          code?: string | null
          color?: string
          created_at?: string
          id?: string
          instructor?: string | null
          name: string
          semester: string
          semester_end: string
          semester_start: string
          user_id: string
        }
        Update: {
          archived?: boolean
          attendance_threshold?: number
          code?: string | null
          color?: string
          created_at?: string
          id?: string
          instructor?: string | null
          name?: string
          semester?: string
          semester_end?: string
          semester_start?: string
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
          created_at: string
          date: string
          day_type: string
          description: string | null
          id: string
        }
        Insert: {
          created_at?: string
          date: string
          day_type?: string
          description?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          date?: string
          day_type?: string
          description?: string | null
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
          course_id: string
          created_at: string
          external_link: string | null
          file_path: string | null
          id: string
          linked_session_id: string | null
          tags: string[]
          title: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          external_link?: string | null
          file_path?: string | null
          id?: string
          linked_session_id?: string | null
          tags?: string[]
          title: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          external_link?: string | null
          file_path?: string | null
          id?: string
          linked_session_id?: string | null
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
      notification_settings: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          lead_time_minutes: number
          muted: boolean
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          lead_time_minutes?: number
          muted?: boolean
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          lead_time_minutes?: number
          muted?: boolean
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
          id: string
          role: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
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
      generate_sessions_for_course: {
        Args: { p_course_id: string }
        Returns: undefined
      }
      am_i_material_allowed: {
        Args: Record<string, never>
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

type DefaultSchema = Database["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]
